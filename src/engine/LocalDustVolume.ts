import * as THREE from 'three';
import {
  DUST_CLOUDS, DUST_GRID, DUST_HEIGHT, DUST_INNER_END, DUST_LOG_RANGE, DUST_OUTER_START, DUST_WIDTH
} from './LocalDustGrid';

export function localDustUniforms() {
  return {
    uLocalDust: { value: null as THREE.DataArrayTexture | null }, uSurveyReady: { value: false },
    uLocalDustClouds: { value: null as THREE.DataArrayTexture | null }, uCloudsReady: { value: false }
  };
}

/** The diffuse sky and finite-distance stars share both resolved extinction volumes. */
export class LocalDustVolume {
  public readonly uniforms = localDustUniforms();
  private pending?: Promise<boolean>;
  private abort = new AbortController();

  public load(): Promise<boolean> {
    if (this.abort.signal.aborted) return Promise.resolve(false);
    if (this.uniforms.uCloudsReady.value) return Promise.resolve(true);
    return this.pending ??= this.loadSurveys().finally(() => { this.pending = undefined; });
  }

  private async loadSurveys() {
    try {
      if (!this.uniforms.uSurveyReady.value) {
        await this.loadTexture(false);
      }
      await this.loadTexture(true);
    } catch (error) {
      if (!this.abort.signal.aborted) console.warn('Could not load a Galactic dust survey.', error);
    }
    return this.uniforms.uSurveyReady.value;
  }

  private async loadTexture(clouds: boolean) {
    const file = clouds ? 'local-dust-clouds.bin' : 'local-dust-edenhofer.bin';
    const url = import.meta.env.BASE_URL + 'data/' + file;
    const signal = this.abort.signal;
    signal.throwIfAborted();
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`Dust data request failed (${response.status})`);
    const packed = await response.arrayBuffer();
    signal.throwIfAborted();
    const worker = new Worker(new URL('./localDust.worker.ts', import.meta.url), { type: 'module' });
    let rejectAborted: () => void = () => {};
    try {
      const grid = await new Promise<Uint16Array>((resolve, reject) => {
        rejectAborted = () => reject(new Error('Dust map load cancelled'));
        signal.addEventListener('abort', rejectAborted, { once: true });
        worker.onmessage = (event: MessageEvent<ArrayBuffer>) => resolve(new Uint16Array(event.data));
        worker.onerror = event => reject(new Error(event.message));
        worker.postMessage({ packed, clouds }, [packed]);
      });
      signal.throwIfAborted();
      // Array layers support the refined 512-wide footprint on WebGL 2 devices
      // with a 256-texel limit for 3D textures. Each layer is one radial bin.
      const texture = new THREE.DataArrayTexture(grid, clouds ? DUST_CLOUDS.width : DUST_WIDTH,
        clouds ? DUST_CLOUDS.height : DUST_HEIGHT, DUST_GRID.radius * (clouds ? DUST_CLOUDS.regions.length : 1));
      texture.format = THREE.RGFormat;
      texture.type = THREE.HalfFloatType;
      texture.wrapS = clouds ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
      texture.minFilter = texture.magFilter = THREE.LinearFilter;
      texture.needsUpdate = true;
      const { uLocalDustClouds, uCloudsReady, uLocalDust, uSurveyReady } = this.uniforms;
      if (clouds) {
        uLocalDustClouds.value = texture;
        uCloudsReady.value = true;
      } else {
        uLocalDust.value = texture;
        uSurveyReady.value = true;
      }
    } finally {
      signal.removeEventListener('abort', rejectAborted);
      worker.terminate();
    }
  }

  public dispose() {
    this.abort.abort();
    this.uniforms.uLocalDust.value?.dispose();
    this.uniforms.uLocalDust.value = null;
    this.uniforms.uSurveyReady.value = false;
    this.uniforms.uLocalDustClouds.value?.dispose();
    this.uniforms.uLocalDustClouds.value = null;
    this.uniforms.uCloudsReady.value = false;
  }
}

// Unit vectors of cones enclosing each survey footprint, for march sampling.
function cloudDirection(region: typeof DUST_CLOUDS.regions[number]) {
  const lon = THREE.MathUtils.degToRad(region.lon + DUST_CLOUDS.longitudeSpan / 2);
  const lat = THREE.MathUtils.degToRad(region.lat + DUST_CLOUDS.latitudeSpan / 2);
  return `vec3(${Math.cos(lon)*Math.cos(lat)}, ${Math.sin(lat)}, ${-Math.sin(lon)*Math.cos(lat)})`;
}

/** Physical origin and all integration distances are heliocentric Galactic kpc. */
export const LOCAL_DUST_GLSL = /* glsl */ `
  uniform highp sampler2DArray uLocalDust;
  uniform bool uSurveyReady;
  uniform highp sampler2DArray uLocalDustClouds;
  uniform bool uCloudsReady;
  const float dustNear = ${DUST_GRID.nearKpc};
  const float dustFar = ${DUST_GRID.farKpc};
  const float dustInnerEnd = ${DUST_INNER_END};
  const float dustOuterStart = ${DUST_OUTER_START};
  const float dustLogRange = ${DUST_LOG_RANGE};
  const float dustBins = ${DUST_GRID.radius.toFixed(1)};

  vec2 dustUV(vec3 p) {
    float latitude = asin(clamp(p.y / max(length(p), 1e-12), -1.0, 1.0));
    float longitude = dot(p.xz,p.xz) > 0.0 ? atan(-p.z,p.x) : 0.0;
    return vec2(longitude / 6.28318530718, latitude / 3.14159265359 + 0.5);
  }
  // Interpolate both differential density and the cumulative column with the
  // same angular weight, so finite source distances stay continuous at seams.
  vec2 surveySamples(vec2 uv, float bin) {
    if (uCloudsReady) {
      vec2 lb = vec2(fract(uv.x)*360.0, (uv.y - 0.5)*180.0);
      bool coalsack = lb.x > 180.0;
      vec2 origin = coalsack ? vec2(${DUST_CLOUDS.regions[0].lon}.0,${DUST_CLOUDS.regions[0].lat}.0)
                             : vec2(${DUST_CLOUDS.regions[1].lon}.0,${DUST_CLOUDS.regions[1].lat}.0);
      vec2 span = vec2(${DUST_CLOUDS.longitudeSpan}.0, ${DUST_CLOUDS.latitudeSpan}.0);
      vec2 offset = lb - origin;
      vec2 edges = min(offset, span - offset);
      float weight = smoothstep(0.0, 1.4, min(edges.x, edges.y));
      if (weight > 0.0) {
        vec2 cloud = textureLod(uLocalDustClouds,vec3(offset/span,bin + (coalsack ? 0.0 : dustBins)),0.0).rg;
        if (weight >= 1.0) return cloud;
        return mix(textureLod(uLocalDust,vec3(uv,bin),0.0).rg, cloud, weight);
      }
    }
    return textureLod(uLocalDust,vec3(uv,bin),0.0).rg;
  }
  float dustRampIntegral(float r, float lo, float hi) {
    float t = clamp((r-lo)/(hi-lo), 0.0, 1.0);
    return (hi-lo)*t*t*t*(1.0-0.5*t) + max(0.0,r-hi);
  }
  float coveredDistance(float r) {
    r = clamp(r,dustNear,dustFar);
    return dustRampIntegral(r,dustNear,dustInnerEnd)-dustRampIntegral(r,dustOuterStart,dustFar);
  }
  // Finite extinction to a star or a diffuse segment end as seen from Sol.
  float solarDustColumn(vec2 uv, float r) {
    if (r <= dustNear) return 0.0;
    r = min(r,dustFar);
    float bin = min(floor(log(r/dustNear)/dustLogRange*dustBins),dustBins-1.0);
    float farEdge = dustNear*exp((bin+1.0)/dustBins*dustLogRange);
    vec2 densities = surveySamples(uv,bin);
    return max(0.0,densities.g - densities.r*(coveredDistance(farEdge)-coveredDistance(r)));
  }

  // A ray can enter and leave the survey even when the observer is outside it.
  // Closest approach and impact parameter are reused by each diffuse segment.
  vec4 surveyChord(vec3 origin, vec3 ray, float end) {
    float mid = -dot(origin,ray);
    float impact = length(cross(origin,ray));
    float halfChord = sqrt(max(0.0,dustFar*dustFar-impact*impact));
    return vec4(max(0.0,mid-halfChord),min(end,mid+halfChord),mid,impact);
  }

  vec2 dustShellSegment(vec3 closest, vec3 ray, float impact, float lo, float hi, float layer) {
    if (hi <= lo) return vec2(0.0);
    // A nearly tangential ray can sweep many angular texels inside one radial layer.
    float angle = impact > 0.000001 ? atan((hi-lo)*impact,impact*impact+lo*hi) : 0.0;
    float samplesPerRadian = 40.0;
    if (uCloudsReady && angle > 0.004) {
      vec3 midDir = normalize(closest + ray * (0.5*(lo+hi)));
      float cone = cos(min(3.14159, radians(18.0) + angle));
      if (max(dot(midDir,${cloudDirection(DUST_CLOUDS.regions[0])}),
              dot(midDir,${cloudDirection(DUST_CLOUDS.regions[1])})) >= cone) samplesPerRadian = 250.0;
    }
    int count = int(clamp(ceil(angle*samplesPerRadian),1.0,80.0));
    float ds = (hi-lo)/float(count);
    vec2 measured = vec2(0.0);
    for (int j=0; j<80; j++) {
      if (j>=count) break;
      vec3 p = closest + ray*(lo+(float(j)+0.5)*ds);
      float r = length(p);
      float weight = smoothstep(dustNear,dustInnerEnd,r)*(1.0-smoothstep(dustOuterStart,dustFar,r));
      float density = surveySamples(dustUV(p),layer).r;
      measured += weight*ds*vec2(density,1.0);
    }
    return measured;
  }

  // Result is (measured optical depth, length covered by measurements).
  // Intersect the actual radial bin boundaries, so narrow, dense clouds retain
  // their measured column as the observer moves sideways or passes through.
  vec2 offSunDust(vec3 origin, vec3 ray, vec4 chord, float lo, float hi) {
    lo = max(lo,chord.x) - chord.z;
    hi = min(hi,chord.y) - chord.z;
    if (hi <= lo) return vec2(0.0);
    float impact = chord.w;
    float nearest = length(vec2(impact,clamp(0.0,lo,hi)));
    float farthest = length(vec2(impact,max(abs(lo),abs(hi))));
    if (farthest <= dustNear || nearest >= dustFar) return vec2(0.0);
    int lower = int(clamp(floor(log(max(nearest,dustNear)/dustNear)*dustBins/dustLogRange),0.0,dustBins-1.0));
    int upper = int(clamp(floor(log(farthest/dustNear)*dustBins/dustLogRange),0.0,dustBins-1.0));
    float edge = dustNear*exp(float(lower)*dustLogRange/dustBins);
    float inner = sqrt(max(0.0,edge*edge-impact*impact));
    vec3 closest = origin + ray*chord.z;
    vec2 measured = vec2(0.0);
    for (int i=0; i<${DUST_GRID.radius}; i++) {
      int layer = lower+i;
      if (layer>upper) break;
      edge *= ${Math.exp(DUST_LOG_RANGE / DUST_GRID.radius)};
      float outer = sqrt(max(0.0,edge*edge-impact*impact));
      if (lo < -inner) measured += dustShellSegment(closest,ray,impact,max(lo,-outer),min(hi,-inner),float(layer));
      if (hi > inner) measured += dustShellSegment(closest,ray,impact,max(lo,inner),min(hi,outer),float(layer));
      inner = outer;
    }
    return measured;
  }
`;
