import * as THREE from 'three';
import { DeepSpaceObjectData } from '../data/deepSpace';
import { GALACTIC_DUST_GLSL } from './GalacticSkyModel';
import { RADIATIVE_TRANSFER_GLSL } from './RadiativeTransfer';

const vertexShader = /* glsl */ `
  varying vec3 vLocal;
  #include <common>
  #include <logdepthbuf_pars_vertex>
  void main() {
    vLocal = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uCamera;
  uniform float uExposure;
  uniform float uSeed;
  uniform int uKind;
  varying vec3 vLocal;
  #include <common>
  #include <logdepthbuf_pars_fragment>
  ${GALACTIC_DUST_GLSL}
  ${RADIATIVE_TRANSFER_GLSL}

  void main() {
    vec3 ray = normalize(vLocal - uCamera);
    float b = dot(uCamera, ray);
    // Avoid subtracting two huge squared distances for arcminute-sized objects.
    vec3 closest = uCamera - ray*b;
    float discriminant = 1.0 - dot(closest,closest);
    if (discriminant < 0.0) discard;
    float entry = max(0.0, -b - sqrt(discriminant));
    float end = -b + sqrt(discriminant);
    float stepSize = (end-entry)/36.0;
    vec3 light = vec3(0.0);
    float transmission = 1.0;
    for (int i=0; i<36; i++) {
      vec3 p = uCamera + ray*(entry+(float(i)+0.5)*stepSize);
      float r = length(p);
      float turbulence = fbm(p*6.0 + uSeed);
      float fine = noise3(p*42.0+uSeed);
      float density = 0.0;
      float dust = 0.0;
      vec3 colour = vec3(0.55,0.12,0.19);
      if (uKind == 1 || uKind == 2) {
        // Planetary nebula: an ionised, hollow shell with an equatorial torus.
        float ringRadius = length(p.xy);
        float shell = exp(-pow((length(p*vec3(1,1,1.7))-0.58)/0.11,2.0));
        float torus = exp(-pow((ringRadius-0.57)/0.09,2.0)-pow(p.z/0.20,2.0));
        density = (shell*0.5+torus*1.5)*(0.65+turbulence*0.6+fine*0.2);
        colour = mix(vec3(0.14,0.47,0.51),vec3(0.65,0.16,0.13),smoothstep(0.48,0.64,ringRadius));
        density += exp(-r*r*3800.0)*2.0;
        if (uKind == 2) density += exp(-pow((r-0.80)/0.045,2.0))*0.09;
      } else if (uKind == 3) {
        // Supernova remnant: tangled shell filaments surrounding a soft interior.
        float shell = exp(-pow((r-0.58)/0.22,2.0));
        float filament = exp(-pow((turbulence-0.48)/0.045,2.0));
        density = shell*(0.12+filament*1.2)*(0.55+fine*0.6);
        colour = mix(vec3(0.13,0.36,0.40),vec3(0.72,0.29,0.18),filament);
      } else if (uKind == 4) {
        // Reflection cloud. A handful of compact illuminators replace point cubes.
        density = exp(-r*r*4.0)*smoothstep(0.35,0.63,turbulence)*0.45;
        colour = vec3(0.21,0.39,0.69);
        for (int star=0; star<7; star++) {
          float s = float(star);
          vec3 centre = vec3(sin(s*2.4)*0.48,cos(s*3.7)*0.42,sin(s*1.3)*0.12);
          density += exp(-dot(p-centre,p-centre)*2800.0)*4.0;
        }
      } else if (uKind == 5) {
        // Dust-obscured nuclear region, not an optically visible black-hole icon.
        density = exp(-r*r*8.0)*0.25;
        dust = exp(-pow((p.y+0.07)/0.25,2.0))*(0.8+turbulence)*3.0;
        colour = vec3(0.57,0.41,0.25);
      } else {
        float cavity = exp(-dot(p-vec3(0.08,-0.12,0.0),p-vec3(0.08,-0.12,0.0))*15.0);
        float lobes = exp(-dot(p*vec3(1,1.4,1),p*vec3(1,1.4,1))*3.0);
        density = lobes*(0.2+turbulence*1.8)*(0.5+fine*0.7);
        density *= 1.0-cavity*0.55;
        dust = smoothstep(0.52,0.72,turbulence)*lobes*2.5;
        // Dense foreground ridges break up the glowing gas into lobes and pillars.
        float ridge = exp(-pow((p.x+0.15+sin(p.y*7.0)*0.07)/0.1,2.0));
        dust += ridge*(1.0-smoothstep(-0.5,0.2,p.y))*1.5;
        colour = mix(vec3(0.60,0.14,0.20),vec3(0.19,0.43,0.48),cavity);
      }
      float boundary = 1.0-smoothstep(0.75,1.0,r);
      density *= boundary;
      dust *= boundary;
      float extinction = density*0.6+dust;
      float tau = extinction*stepSize*2.0;
      float attenuation = exp(-tau);
      light += transmission*colour*density*stepSize*2.0*emissionIntegral(tau);
      transmission *= attenuation;
    }
    float alpha = clamp(1.0-transmission,0.0,1.0);
    if (alpha < 0.002) discard;
    #include <logdepthbuf_fragment>
    float luminance = dot(light,vec3(0.2126,0.7152,0.0722));
    float colourResponse = mix(0.06,1.0,smoothstep(0.72,1.45,uExposure));
    light = mix(vec3(luminance),light,colourResponse);
    gl_FragColor = vec4(light/max(alpha,0.01)*uExposure,alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <premultiplied_alpha_fragment>
  }
`;

export function createNebulaVolume(dso: DeepSpaceObjectData, exposure: number): THREE.Mesh {
  const kind = dso.id === 'm57_ring_nebula' ? 1 : dso.id === 'helix_nebula' ? 2
    : dso.id === 'm1_crab_nebula' ? 3 : dso.id === 'pleiades' ? 4
      : dso.type === 'galacticFeature' ? 5 : 0;
  let seed = 0;
  for (const c of dso.id) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
  const material = new THREE.ShaderMaterial({
    vertexShader, fragmentShader,
    uniforms: {
      uCamera: { value: new THREE.Vector3(0,0,3) },
      uExposure: { value: exposure }, uKind: { value: kind }, uSeed: { value: seed % 97 }
    },
    side: THREE.BackSide, transparent: true, depthWrite: false,
    premultipliedAlpha: true, blending: THREE.NormalBlending
  });
  return new THREE.Mesh(new THREE.SphereGeometry(1,32,24),material);
}
