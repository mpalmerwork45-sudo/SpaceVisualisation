import * as THREE from 'three';
import { galacticFrameQuaternion, ViewMode } from '../utils/coordinates';
import { PlaneAlignment } from './StarRenderer';
import { LOCAL_DUST_GLSL, LocalDustVolume, localDustUniforms } from './LocalDustVolume';
import { GALACTIC_CENTRE_KPC, GALACTIC_DUST_GLSL, LY_PER_KPC } from './GalacticSkyModel';

const STAR_VERTEX_SHADER = /* glsl */ `
  attribute float size;
  uniform float uEyeAdapted;
  uniform vec3 uObserver;
  uniform float uRenderDistance;
  varying vec3 vColor;
  #include <common>
  #include <logdepthbuf_pars_vertex>
  ${GALACTIC_DUST_GLSL}
  ${LOCAL_DUST_GLSL}

  float dustAtCrossing(vec3 ray, float crossing, float distanceToStar) {
    float weight = smoothstep(-120.0, 120.0, crossing)
      * smoothstep(-120.0, 120.0, distanceToStar - crossing);
    if (weight <= 0.0) return 0.0;
    return weight * foregroundDust(normalize(uObserver + ray * crossing));
  }

  float foregroundExtinction(vec3 ray, float distanceToStar) {
    const float shell = ${0.55 * LY_PER_KPC};
    float midpoint = -dot(uObserver, ray);
    vec3 closest = uObserver + ray * midpoint;
    float discriminant = shell * shell - dot(closest, closest);
    if (discriminant <= 0.0) return 0.0;
    float chord = sqrt(discriminant);
    return smoothstep(0.0, 150.0, chord) * (
      dustAtCrossing(ray, midpoint - chord, distanceToStar)
      + dustAtCrossing(ray, midpoint + chord, distanceToStar)
    );
  }

  void main() {
    vec3 sightline = position - uObserver;
    float distanceToStar = max(length(sightline), 0.01);
    vec3 ray = sightline / distanceToStar;
    // Render behind the catalogue and distant objects while keeping the
    // angular displacement computed from the physical stellar position.
    vec4 mvPosition = modelViewMatrix * vec4(ray * uRenderDistance, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <logdepthbuf_vertex>
    gl_PointSize = clamp(size, 0.35, 3.0);
    // Frustum rejection avoids tracing the dust for off-screen point stars.
    if (gl_Position.w <= 0.0 || any(greaterThan(abs(gl_Position.xy), 1.02*gl_Position.ww))) {
      vColor = vec3(0.0);
      return;
    }
    float tau;
    if (uSurveyReady) {
      vec3 origin = uObserver / ${LY_PER_KPC};
      float end = distanceToStar / ${LY_PER_KPC};
      float offSunWeight = smoothstep(0.0001,0.001,length(origin));
      tau = offSunWeight < 1.0 ? solarDustColumn(dustUV(ray),end) : 0.0;
      if (offSunWeight > 0.0) {
        vec4 chord = surveyChord(origin,ray,end);
        tau = mix(tau, offSunDust(origin,ray,chord,0.0,end).x, offSunWeight);
      }
    } else {
      tau = foregroundExtinction(ray,distanceToStar);
    }
    float relativeFlux = min(3.0, dot(position, position) / (distanceToStar * distanceToStar));
    vColor = color * relativeFlux * exp(-vec3(0.76, 1.0, 1.38) * tau);
    float luminance = dot(vColor,vec3(0.2126,0.7152,0.0722));
    vColor = mix(vColor,vec3(luminance),uEyeAdapted*0.8) * mix(1.0,0.32,uEyeAdapted);
  }
`;

const STAR_FRAGMENT_SHADER = /* glsl */ `
  varying vec3 vColor;
  #include <common>
  #include <logdepthbuf_pars_fragment>

  void main() {
    float radius = length(gl_PointCoord - vec2(0.5));
    float alpha = 1.0 - smoothstep(0.18, 0.5, radius);
    if (alpha < 0.01) discard;
    #include <logdepthbuf_fragment>
    gl_FragColor = vec4(vColor, alpha * 0.86);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/**
 * Deterministic unresolved stars at finite positions in the Galactic frame.
 *
 * This is a visual completion layer for catalogue stars, not a scientific
 * star catalogue. Its latitude distribution follows the observed thin-disk
 * concentration and its seed keeps the sky stable across rebuilds.
 */
export class StarFieldBackground {
  public points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private inverseFrame = new THREE.Quaternion();

  constructor(count: number = 100000, localDust?: LocalDustVolume) {
    console.log(`🌌 [StarFieldBackground] Generating ${count.toLocaleString()} deterministic unresolved stars...`);

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const random = this.seededRandom(0x51a7f13d);
    const palette = [
      new THREE.Color('#ffa06d'), // M
      new THREE.Color('#ffd2a1'), // K
      new THREE.Color('#fff4ea'), // G
      new THREE.Color('#f8f7ff'), // F
      new THREE.Color('#cad7ff'), // A
      new THREE.Color('#9bb0ff')  // B/O
    ];

    const gaussian = () => {
      const u = Math.max(random(), 1e-7);
      const v = random();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };

    const bulgeDistance = GALACTIC_CENTRE_KPC * LY_PER_KPC;
    const thinDiskSigma = 7.5 * Math.PI / 180;

    for (let i = 0; i < count; i++) {
      // A separate old-star bulge is essential: a longitude-uniform band reads
      // as mist even when the diffuse density model has a central bulge.
      const population = random();
      const longitude = population < 0.4 ? gaussian() * THREE.MathUtils.degToRad(15)
        : random() * Math.PI * 2;
      const latitude = population < 0.8
        ? THREE.MathUtils.clamp(gaussian() * thinDiskSigma, -Math.PI / 2, Math.PI / 2)
        : Math.asin(2 * random() - 1);
      const cosLatitude = Math.cos(latitude);
      const depth = random();
      const distance = population < 0.4 ? bulgeDistance + (depth - 0.5) * 12000
        : population < 0.8 ? Math.min(38000, 400 - 11000 * Math.log(1 - depth))
        : 700 + depth * 7500;

      // Local axes are +X=l=0, +Y=b=+90, -Z=l=90.
      positions[i * 3] = distance * cosLatitude * Math.cos(longitude);
      positions[i * 3 + 1] = distance * Math.sin(latitude);
      positions[i * 3 + 2] = -distance * cosLatitude * Math.sin(longitude);

      // Flux-limited naked-eye-like mix. Cool dwarfs dominate the Galaxy by
      // number, but most are too faint to dominate an apparent star field.
      const colourSample = random();
      const colourIndex = colourSample < 0.16 ? 0
        : colourSample < 0.38 ? 1
          : colourSample < 0.68 ? 2
            : colourSample < 0.86 ? 3
              : colourSample < 0.97 ? 4 : 5;
      const colour = palette[colourIndex].clone();
      const brightness = 0.025 + Math.pow(random(), 4.5) * 0.75;
      colour.multiplyScalar(brightness);
      colors[i * 3] = colour.r;
      colors[i * 3 + 1] = colour.g;
      colors[i * 3 + 2] = colour.b;

      sizes[i] = 0.35 + Math.pow(random(), 4.2) * 1.7;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.ShaderMaterial({
      vertexShader: STAR_VERTEX_SHADER,
      fragmentShader: STAR_FRAGMENT_SHADER,
      uniforms: {
        ...(localDust?.uniforms ?? localDustUniforms()),
        uEyeAdapted: { value: 1 },
        uObserver: { value: new THREE.Vector3() },
        uRenderDistance: { value: 90_000_000 }
      },
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      toneMapped: true
    });

    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    this.points.renderOrder = -2;
    this.setPlaneAlignment('ecliptic');
  }

  public setPlaneAlignment(alignment: PlaneAlignment) {
    this.points.quaternion.copy(galacticFrameQuaternion(alignment));
    this.inverseFrame.copy(this.points.quaternion).invert();
  }

  public update(camera: THREE.PerspectiveCamera, mode: ViewMode) {
    this.points.position.copy(camera.position);
    const { uObserver, uRenderDistance } = this.points.material.uniforms;
    const observer = uObserver.value as THREE.Vector3;
    if (mode === 'linear') observer.copy(camera.position).applyQuaternion(this.inverseFrame);
    else observer.set(0, 0, 0);
    uRenderDistance.value = camera.far * 0.9;
  }

  public setObservationMode(mode: 'darkAdaptedEye' | 'enhancedOptical') {
    this.points.material.uniforms.uEyeAdapted.value = mode === 'darkAdaptedEye' ? 1 : 0;
  }

  public dispose() {
    this.points.geometry.dispose();
    const material = this.points.material;
    if (Array.isArray(material)) material.forEach(item => item.dispose());
    else material.dispose();
  }

  private seededRandom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
      state += 0x6d2b79f5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }
}
