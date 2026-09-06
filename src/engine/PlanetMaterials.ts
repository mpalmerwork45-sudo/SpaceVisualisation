import * as THREE from 'three';
import { GALACTIC_DUST_GLSL } from './GalacticSkyModel';

const vertexShader = /* glsl */ `
  varying vec3 vSurface;
  varying vec3 vNormal;
  varying vec3 vWorld;
  #include <common>
  #include <logdepthbuf_pars_vertex>
  void main() {
    vSurface = normalize(position);
    vNormal = normalize(mat3(modelMatrix) * normal);
    vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uSun;
  uniform int uKind;
  uniform float uTime;
  varying vec3 vSurface;
  varying vec3 vNormal;
  varying vec3 vWorld;
  #include <common>
  #include <logdepthbuf_pars_fragment>
  ${GALACTIC_DUST_GLSL}
  void main() {
    #include <logdepthbuf_fragment>
    vec3 p = normalize(vSurface);
    float a = uTime * 0.018;
    p.xz = mat2(cos(a), -sin(a), sin(a), cos(a)) * p.xz;
    float terrain = fbm(p * (uKind == 2 ? 2.8 : 6.0));
    float detail = fbm(p * 65.0);
    vec3 albedo = uBase;
    float ocean = 0.0;
    float atmosphere = 0.0;
    vec3 air = vec3(0.17, 0.46, 1.0);
    if (uKind == 2) {
      // Stylised continental terrain, with ocean, ice and a separate cloud field.
      float land = smoothstep(0.48, 0.53, terrain + 0.09 * sin(p.z * 7.0));
      ocean = 1.0 - land;
      vec3 ground = mix(vec3(0.025,0.12,0.055), vec3(0.43,0.29,0.11), smoothstep(0.38,0.65,detail));
      albedo = mix(vec3(0.009,0.065,0.20), ground, land);
      float ice = smoothstep(0.83,0.96,abs(p.y) + (terrain-0.5)*0.16);
      albedo = mix(albedo, vec3(0.8,0.89,0.92), ice);
      vec3 cloudPos = p;
      cloudPos.xz += vec2(uTime*0.0009,0.0);
      float vapour = smoothstep(0.53,0.72,fbm(cloudPos*17.0 + terrain*3.0));
      albedo = mix(albedo, vec3(0.9,0.94,1.0), vapour*0.9);
      atmosphere = 0.7;
    } else if (uKind >= 4 && uKind <= 7) {
      float turbulence = fbm(p * vec3(12.0, 3.0, 12.0));
      float bands = sin(p.y * (uKind == 4 ? 32.0 : 54.0) + turbulence * 2.5);
      bands = bands * 0.7 + sin(p.y * 13.0 + turbulence) * 0.3;
      float fineBands = sin(p.y*170.0 + turbulence*10.0)*0.035;
      vec3 lightTone = uKind == 4 ? vec3(0.85,0.73,0.56) : uBase * 1.2;
      vec3 darkTone = uKind == 4 ? vec3(0.34,0.16,0.08) : uBase * 0.62;
      albedo = mix(darkTone, lightTone, 0.5 + bands * (uKind >= 6 ? 0.12 : 0.32) + fineBands);
      if (uKind == 4) {
        float storm = exp(-pow((p.y+0.25)/0.09,2.0)-pow((atan(p.z,p.x)-0.8)/0.22,2.0));
        albedo = mix(albedo, vec3(0.57,0.20,0.09)*(0.8+detail*0.4), storm*0.9);
      }
      atmosphere = 0.22;
      air = lightTone;
    } else if (uKind == 1) {
      float swirl = fbm(p * vec3(12.0, 28.0, 12.0) + terrain*4.0);
      albedo = mix(vec3(0.49,0.32,0.13),vec3(0.95,0.84,0.57),swirl);
      atmosphere = 0.35;
      air = vec3(0.95,0.69,0.32);
    } else {
      albedo *= 0.45 + terrain * 0.8 + detail * 0.45;
      // Multiscale crater-like depressions and bright rims in rocky terrain.
      float crater = noise3(p*38.0);
      albedo *= 1.0 - smoothstep(0.64,0.79,crater)*0.45;
      albedo += vec3(0.1)*exp(-pow((crater-0.64)/0.028,2.0));
      if (uKind == 3) {
        albedo *= 0.6 + smoothstep(0.30,0.62,terrain)*0.65;
        albedo = mix(albedo, vec3(0.88,0.85,0.78),smoothstep(0.93,0.99,abs(p.y)));
        atmosphere = 0.14;
        air = vec3(0.8,0.34,0.16);
      }
    }
    vec3 normal = normalize(vNormal);
    vec3 view = normalize(cameraPosition - vWorld);
    float sunlight = dot(normal, normalize(uSun));
    float day = max(sunlight, 0.0);
    float rim = pow(1.0-max(dot(normal,view),0.0),3.5);
    vec3 colour = albedo * (0.045 + day * 1.7);
    vec3 halfVector = normalize(normalize(uSun) + view);
    colour += vec3(0.9,0.93,1.0) * pow(max(dot(normal, halfVector),0.0),90.0) * ocean * day * 0.6;
    colour += air * rim * atmosphere * smoothstep(-0.3,0.4,sunlight);
    gl_FragColor = vec4(colour,1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const planetIds = ['mercury','venus','earth','mars','jupiter','saturn','uranus','neptune','pluto'];

export function createPlanetMaterial(id: string, colour: string, position: THREE.Vector3) {
  return new THREE.ShaderMaterial({
    vertexShader, fragmentShader,
    uniforms: {
      uBase: { value: new THREE.Color(colour) },
      uSun: { value: position.clone().negate().normalize() },
      uKind: { value: planetIds.indexOf(id) },
      uTime: { value: 0 }
    }
  });
}

export function createSaturnRings(radius: number, sunDirection: THREE.Vector3): THREE.Mesh {
  const geometry = new THREE.RingGeometry(1.24, 2.32, 192);
  const material = new THREE.ShaderMaterial({
    vertexShader: `
      varying vec3 vRing;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() {
        vRing = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: `
      varying vec3 vRing;
      uniform vec3 uSun;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      void main() {
        #include <logdepthbuf_fragment>
        float r = length(vRing.xy);
        float bands = 0.65+0.08*sin(r*170.0+sin(r*29.0)*2.0)+0.04*sin(r*310.0);
        float gap = smoothstep(1.91,1.94,r)*(1.0-smoothstep(2.00,2.02,r));
        float alpha = bands*(1.0-gap*0.96)*smoothstep(1.24,1.35,r)*(1.0-smoothstep(2.25,2.32,r));
        float along = dot(-vRing,uSun);
        float closest = length(vRing+uSun*max(along,0.0));
        float shadow = along > 0.0 ? smoothstep(0.92,1.08,closest) : 1.0;
        vec3 colour = mix(vec3(0.29,0.24,0.18),vec3(0.82,0.74,0.58),bands) * (0.15+shadow*0.85);
        gl_FragColor=vec4(colour,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    uniforms: { uSun: { value: sunDirection } },
    transparent: true, side: THREE.DoubleSide, depthWrite: false
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.scale.setScalar(radius);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}
