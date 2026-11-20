import * as THREE from 'three';
import { GALACTIC_DUST_GLSL } from './GalacticSkyModel';

const vertexShader = /* glsl */ `
  uniform float uPolarRatio;
  varying vec3 vSurface;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying vec2 vMapUV;
  #include <common>
  #include <logdepthbuf_pars_vertex>
  void main() {
    vSurface = normalize(vec3(position.x, position.y / uPolarRatio, position.z));
    vNormal = normalize(mat3(modelMatrix) * normal);
    vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    vMapUV = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
  }
`;

// Shared by the cloud deck and its shadow on the ground. A slight radial
// exaggeration keeps the separation visible at interactive display scales.
export const EARTH_CLOUD_RADIUS = 1.012;
const earthClouds = /* glsl */ `
  float cloudCover(vec3 p, float time) {
    float wind = p.y * p.y * 1.4 + 0.24 * sin(7.0 * p.y) + time * 0.0015;
    p.xz = mat2(cos(wind), -sin(wind), sin(wind), cos(wind)) * p.xz;
    float eddy = noise3(p * 4.3 + 15.0);
    float fronts = fbm(p * vec3(7.0, 13.0, 7.0) + 2.1 * eddy);
    float wisps = noise3(p * 46.0 + fronts * 7.0);
    return smoothstep(0.43, 0.65, fronts + 0.10 * (wisps - 0.5));
  }
`;

// The visible rings and the shadow they cast use the same radial profile.
const saturnRingOpacity = /* glsl */ `
  float ringOpacity(float r) {
    float cRing = 0.19 * smoothstep(1.24, 1.38, r);
    float bRing = smoothstep(1.49, 1.55, r) * (0.41 + 0.22 * smoothstep(1.62, 1.84, r));
    float aRing = 0.55 * smoothstep(2.01, 2.04, r) * (1.0 - 0.23 * smoothstep(2.08, 2.24, r));
    float cassiniStart = 1.0 - smoothstep(1.93, 1.96, r);
    float opacity = ((cRing + bRing) * cassiniStart + aRing) * (1.0 - smoothstep(2.24, 2.27, r));
    // Filter progressively finer ringlets as their projected width shrinks.
    float footprint = fwidth(r);
    float broad = sin(r * 68.0 + sin(19.0 * r)) * (1.0 - smoothstep(0.025, 0.07, footprint));
    float narrow = sin(r * 202.0 + 1.7 * sin(31.0 * r)) * (1.0 - smoothstep(0.008, 0.028, footprint));
    return opacity * (1.0 + 0.105 * broad + 0.075 * narrow);
  }
`;

const fragmentShader = /* glsl */ `
  uniform mat4 modelMatrix;
  uniform vec3 uBase;
  uniform vec3 uSun;
  uniform vec3 uLocalSun;
  uniform int uKind;
  uniform float uPolarRatio;
  uniform float uTime;
  uniform sampler2D uSurfaceMap;
  uniform bool uMapReady;
  varying vec3 vSurface;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying vec2 vMapUV;
  #include <common>
  #include <logdepthbuf_pars_fragment>
  ${GALACTIC_DUST_GLSL}
  ${earthClouds}
  ${saturnRingOpacity}

  // Rounded impact bowls and raised rims. Each 3D cell has room for a
  // complete impact, so adjacent cells meet without clipping a crater rim.
  vec4 impactProfile(vec3 p) {
    vec3 cell = floor(p);
    vec3 centre = 0.5 + 0.15 * (vec3(hash3(cell), hash3(cell + 17.0), hash3(cell + 29.0)) - 0.5);
    vec3 offset = fract(p) - centre;
    float radius = mix(0.24, 0.39, hash3(cell + 41.0));
    float r = length(offset) / radius;
    float bowl = clamp((r - 0.22) / 0.72, 0.0, 1.0);
    float rim = clamp(abs(r - 0.89) / 0.20, 0.0, 1.0);
    float h = -0.78 * (1.0 - smoothstep(0.0, 1.0, bowl)) + 0.38 * (1.0 - smoothstep(0.0, 1.0, rim));
    // Analytic slope keeps small crater rims smooth under grazing light.
    float slope = 0.78 * 6.0 * bowl * (1.0-bowl) / 0.72 - 0.38 * 6.0 * rim * (1.0-rim) * sign(r-0.89) / 0.20;
    return vec4(offset * slope / max(length(offset) * radius, 0.0001), h);
  }

  void main() {
    #include <logdepthbuf_fragment>
    vec3 p = normalize(vSurface);
    vec3 normal = normalize(vNormal);
    vec3 view = normalize(cameraPosition - vWorld);
    vec3 albedo = uBase;
    float ocean = 0.0;
    float atmosphere = 0.0;
    float transmission = 1.0;
    vec3 air = vec3(0.17, 0.46, 1.0);
    if (uKind == 2) {
      if (uMapReady) {
        // The cloud-free Blue Marble composite is uploaded as sRGB, so the
        // material receives linear reflectance. Keep open oceans legible.
        albedo = texture2D(uSurfaceMap, vMapUV).rgb;
        ocean = smoothstep(0.18, 0.63, (albedo.b - max(albedo.r, albedo.g)) / max(0.001, albedo.b));
        albedo += vec3(0.003, 0.026, 0.073) * ocean;
      } else {
        float land = smoothstep(0.47, 0.53, fbm(2.8 * p));
        albedo = mix(vec3(0.008, 0.044, 0.12), vec3(0.12, 0.21, 0.075), land);
        ocean = 1.0 - land;
      }
      // Intersect the ray to Sol with the cloud layer so shadows shift
      // towards the terminator and remain registered with the moving deck.
      vec3 ray = normalize(vec3(uLocalSun.x, uLocalSun.y / uPolarRatio, uLocalSun.z));
      float b = dot(p, ray);
      float travel = -b + sqrt(b*b + ${EARTH_CLOUD_RADIUS ** 2 - 1});
      transmission -= 0.44 * cloudCover(normalize(p + ray * travel), uTime);
      atmosphere = 0.57;
    } else if (uKind == 4 && uMapReady) {
      // Muted broadband colours bring out the structure of the Voyager belts.
      vec3 map = texture2D(uSurfaceMap, vMapUV).rgb;
      float intensity = dot(map, vec3(0.24, 0.65, 0.11));
      albedo = mix(vec3(1.0, 0.91, 0.82) * intensity, map, 0.35) + vec3(0.065, 0.050, 0.040);
      atmosphere = 0.19;
      air = vec3(0.80, 0.72, 0.60);
    } else if (uKind >= 4 && uKind <= 7) {
      float turbulence = fbm(p * vec3(10.0, 4.0, 10.0));
      float shear = p.y + (turbulence - 0.5) * 0.047;
      float belts = 0.64 * sin(shear * 29.0) + 0.36 * sin(shear * 55.0 + 0.9);
      float filaments = sin(shear * 152.0 + turbulence * 10.0) * (1.0 - smoothstep(0.008, 0.035, fwidth(shear)));
      vec3 cream = uKind == 4 ? vec3(0.84,0.72,0.53) : uBase * 1.17;
      vec3 umber = uKind == 4 ? vec3(0.35,0.16,0.085) : uBase * 0.61;
      albedo = mix(umber, cream, 0.54 + belts * (uKind >= 6 ? 0.14 : 0.42) + filaments * 0.055);
      if (uKind == 4) {
        // Southern oval with an eyewall and curved streamlines, continuous
        // across the longitude seam of the globe.
        float longitude = atan(p.z, p.x) - 0.8;
        vec2 oval = vec2(atan(sin(longitude), cos(longitude)) / 0.22, (p.y + 0.36) / 0.095);
        float r = length(oval);
        float flow = 0.5 + 0.5 * sin(17.0 * r - 2.0 * atan(oval.y, oval.x) + 4.0 * turbulence);
        albedo = mix(albedo, mix(vec3(0.43,0.13,0.055), vec3(0.77,0.35,0.16), flow), 1.0 - smoothstep(0.77,1.22,r));
      }
      atmosphere = 0.21;
      air = cream;
      if (uKind == 5) {
        vec3 point = p * vec3(1.0, uPolarRatio, 1.0);
        // Intersection with the equatorial ring plane, in equatorial radii.
        float t = -point.y / (abs(uLocalSun.y) > 0.0001 ? uLocalSun.y : 0.0001);
        float crossing = length(point.xz + t * uLocalSun.xz);
        float opacity = ringOpacity(clamp(crossing, 0.0, 2.4));
        if (t > 0.0 && abs(uLocalSun.y) > 0.0001) transmission -= 0.88 * opacity;
      }
    } else if (uKind == 1) {
      float terrain = fbm(p * 5.0);
      float swirl = fbm(p * vec3(12.0, 28.0, 12.0) + terrain * 4.0);
      albedo = mix(vec3(0.49,0.32,0.13),vec3(0.95,0.84,0.57),swirl);
      atmosphere = 0.35;
      air = vec3(0.95,0.69,0.32);
    } else if ((uKind == 3 || uKind == 8) && uMapReady) {
      albedo = texture2D(uSurfaceMap, vMapUV).rgb;
      if (uKind == 3) {
        albedo *= vec3(1.10, 0.89, 0.82);
        atmosphere = 0.11;
        air = vec3(0.72, 0.40, 0.25);
      }
    } else {
      float terrain = fbm(p * 6.0);
      float grain = noise3(p * 72.0);
      vec4 largeImpacts = impactProfile(p * 5.0 + 4.3);
      vec4 smallImpacts = impactProfile(p * 17.0 + 0.8);
      float resolved = 1.0 - smoothstep(0.016, 0.06, length(fwidth(p)));
      vec3 slope = 0.042 * largeImpacts.xyz + 0.025 * smallImpacts.xyz * resolved;
      vec3 localNormal = normalize(vec3(p.x, p.y / uPolarRatio, p.z));
      slope -= localNormal * dot(slope, localNormal);
      normal = normalize(mat3(modelMatrix) * (localNormal - slope));
      albedo *= 0.45 + terrain * 0.89 + grain * 0.20 + 0.29 * largeImpacts.w + 0.17 * smallImpacts.w;
      if (uKind == 0) albedo *= vec3(0.56, 0.59, 0.64);
      if (uKind == 3) {
        albedo *= 0.59 + smoothstep(0.30,0.62,terrain)*0.70;
        albedo = mix(albedo, vec3(0.69,0.64,0.57),smoothstep(0.965,0.995,abs(p.y) + 0.035*(terrain-0.5)));
        atmosphere = 0.14;
        air = vec3(0.8,0.34,0.16);
      }
    }
    float sunlight = dot(normal, uSun);
    float day = max(sunlight, 0.0) * transmission;
    float rim = pow(1.0 - clamp(dot(normalize(vNormal),view),0.0,1.0),3.5);
    vec3 colour = albedo * (0.035 + day * 1.7);
    vec3 halfVector = normalize(uSun + view);
    colour += vec3(0.9,0.93,1.0) * pow(max(dot(normal, halfVector),0.0),90.0) * ocean * day * 0.6;
    colour += air * rim * atmosphere * smoothstep(-0.3,0.4,sunlight);
    gl_FragColor = vec4(colour,1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const planetIds = ['mercury','venus','earth','mars','jupiter','saturn','uranus','neptune','pluto'];

export function createPlanetMaterial(id: string, colour: string, polarRatio: number) {
  return new THREE.ShaderMaterial({
    vertexShader, fragmentShader,
    uniforms: {
      uBase: { value: new THREE.Color(colour) },
      uSun: { value: new THREE.Vector3() },
      uLocalSun: { value: new THREE.Vector3() },
      uKind: { value: planetIds.indexOf(id) },
      uPolarRatio: { value: polarRatio },
      uSurfaceMap: { value: null },
      uMapReady: { value: false },
      uTime: { value: 0 }
    }
  });
}

export function createEarthClouds(radius: number, surface: THREE.ShaderMaterial) {
  const polarRatio = surface.uniforms.uPolarRatio.value as number;
  const geometry = new THREE.SphereGeometry(radius * EARTH_CLOUD_RADIUS, 64, 48).scale(1, polarRatio, 1);
  const material = new THREE.ShaderMaterial({
    vertexShader,
    uniforms: { uSun: surface.uniforms.uSun, uTime: surface.uniforms.uTime, uPolarRatio: surface.uniforms.uPolarRatio },
    fragmentShader: /* glsl */ `
      varying vec3 vSurface;
      varying vec3 vNormal;
      varying vec3 vWorld;
      uniform vec3 uSun;
      uniform float uTime;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      ${GALACTIC_DUST_GLSL}
      ${earthClouds}
      void main() {
        #include <logdepthbuf_fragment>
        vec3 n = normalize(vNormal);
        float light = smoothstep(-0.10, 0.88, dot(n, uSun));
        float limb = 1.0 - max(0.0, dot(n, normalize(cameraPosition - vWorld)));
        float haze = pow(limb, 3.0) * light;
        float clouds = cloudCover(normalize(vSurface), uTime);
        vec3 colour = mix(vec3(0.88, 0.94, 1.0), vec3(0.19, 0.44, 0.84), haze) * (0.018 + 1.5 * light);
        gl_FragColor = vec4(colour, max(clouds * 0.93, haze * 0.55));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true, depthWrite: false
  });
  return new THREE.Mesh(geometry, material);
}

export function createSaturnRings(radius: number, polarRatio: number) {
  const geometry = new THREE.RingGeometry(1.24, 2.27, 192);
  const material = new THREE.ShaderMaterial({
    vertexShader: `
      varying vec3 vRing;
      varying vec3 vObserver;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() {
        vRing = position;
        vObserver = (inverse(modelViewMatrix) * vec4(0,0,0,1)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: `
      varying vec3 vRing;
      varying vec3 vObserver;
      uniform vec3 uSun;
      uniform float uPolarRatio;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      ${saturnRingOpacity}
      void main() {
        #include <logdepthbuf_fragment>
        float alpha = ringOpacity(length(vRing.xy));
        vec3 viewRay = vObserver - vRing;
        vec3 eye = vec3(viewRay.xy, viewRay.z / uPolarRatio);
        float eyeDistance = length(eye);
        eye /= eyeDistance;
        // At light-year scene units the depth buffer has little precision
        // across nearby planets. Test the full segment back to the observer.
        float eyeClosest = clamp(dot(-vRing, eye), 0.0, eyeDistance);
        if (length(vRing + eye * eyeClosest) < 1.0) discard;
        // In the ring's local frame the pole is Z. Transform the ray so the
        // oblate planet becomes a unit sphere for an analytic shadow test.
        vec3 sun = normalize(vec3(uSun.xy, uSun.z / uPolarRatio));
        float along = dot(-vRing, sun);
        float closest = length(vRing + sun * max(along, 0.0));
        float shadow = along > 0.0 ? smoothstep(0.985, 1.015, closest) : 1.0;
        float iceLight = 0.36 + 0.64 * sqrt(abs(uSun.z));
        float backlit = uSun.z * viewRay.z < 0.0 ? 1.0 - 0.45 * alpha : 1.0;
        vec3 colour = mix(vec3(0.36,0.27,0.19), vec3(0.84,0.75,0.61), alpha) * (0.09 + shadow * iceLight * backlit);
        float opening = max(0.30, abs(normalize(viewRay).z));
        gl_FragColor = vec4(colour, 1.0 - pow(1.0 - alpha, 1.0 / opening));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    uniforms: { uSun: { value: new THREE.Vector3() }, uPolarRatio: { value: polarRatio } },
    transparent: true, side: THREE.DoubleSide, depthWrite: false, forceSinglePass: true
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.scale.setScalar(radius);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}
