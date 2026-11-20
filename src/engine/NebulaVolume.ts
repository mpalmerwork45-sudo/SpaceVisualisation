import * as THREE from 'three';
import { DeepSpaceObjectData } from '../data/deepSpace';
import { GALACTIC_DUST_GLSL } from './GalacticSkyModel';
import { NEBULA_MODELS, NEBULA_MORPHOLOGY_GLSL, nebulaKind } from './NebulaMorphology';
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

// Optically thin stellar light above the diffuse model's kiloparsec-scale
// bulge. Integrate a Plummer emissivity along the chord of the oblate cluster.
const clusterFragmentShader = /* glsl */ `
  uniform vec3 uCamera;
  uniform float uExposure;
  uniform float uAxisRatio;
  varying vec3 vLocal;
  #include <common>
  #include <logdepthbuf_pars_fragment>

  float plummerPrimitive(float z, float widthSq) {
    float t = z * inversesqrt(z*z + widthSq);
    return t * (1.0 - t*t/3.0);
  }

  void main() {
    vec3 ray = normalize(vLocal-uCamera);
    vec3 closest = vLocal - ray*dot(vLocal,ray);
    float impactSq = dot(closest,closest);
    if (impactSq >= 1.0) discard;
    float exitPoint = sqrt(1.0-impactSq);
    float entry = max(-exitPoint, dot(uCamera-closest,ray));
    // The scale of a projected Plummer profile equals its half-light radius.
    const float scaleSq = (4.2 / 20.0) * (4.2 / 20.0);
    float widthSq = scaleSq + impactSq;
    float column = plummerPrimitive(exitPoint,widthSq) - plummerPrimitive(entry,widthSq);
    column *= 0.75 * pow(scaleSq / widthSq,2.0);
    column *= length(ray * vec3(1.0,uAxisRatio,1.0));
    #include <logdepthbuf_fragment>
    gl_FragColor = vec4(vec3(1.0,0.85,0.72)*uExposure, column);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <premultiplied_alpha_fragment>
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
  ${NEBULA_MORPHOLOGY_GLSL}

  float compactSource(vec3 centre, vec3 closest, vec3 ray, float entry, float exitPoint, float width) {
    vec3 offset = centre-closest;
    float depth = dot(offset,ray);
    if (depth < entry || depth > exitPoint) return 0.0;
    vec3 miss = offset-depth*ray;
    return exp(-dot(miss,miss)/(width*width));
  }

  void main() {
    vec3 ray = normalize(vLocal-uCamera);
    // Anchor the chord on the nearby unit sphere. A shader working in camera
    // coordinates loses the shape of a small nebula at catalogue distances.
    vec3 closest = vLocal - ray*dot(vLocal,ray);
    float discriminant = 1.0-dot(closest,closest);
    if (discriminant <= 0.0) discard;
    float exitPoint = sqrt(discriminant);
    float entry = max(-exitPoint,dot(uCamera-closest,ray));
    float stepSize = (exitPoint-entry)/36.0;
    vec3 light = vec3(0.0);
    float transmission = 1.0;
    for (int i=0; i<36; i++) {
      vec3 p = closest + ray*(entry+(float(i)+0.5)*stepSize);
      float boundary = 1.0-smoothstep(0.78,1.0,length(p));
      vec4 gas = nebulaSample(p)*boundary;
      float tau = gas.a*stepSize*2.0;
      light += transmission*gas.rgb*stepSize*2.0*emissionIntegral(tau);
      transmission *= exp(-tau);
    }

    // These unresolved lights would flicker if assigned to individual march
    // samples. Bound the sightline to the segment visible from the observer.
    float stars = 0.0;
    if (uKind == ${NEBULA_MODELS.ring} || uKind == ${NEBULA_MODELS.helix}) {
      stars = compactSource(vec3(0.0),closest,ray,entry,exitPoint,0.009);
    } else if (uKind == ${NEBULA_MODELS.pleiades}) {
      // Approximate north/east offsets of the bright Pleiades members in the
      // nebula's 110-arcminute field. Alcyone is drawn by the star catalogue.
      stars += 1.00*compactSource(vec3(-0.06, 0.44, 0.05),closest,ray,entry,exitPoint,0.011); // Atlas
      stars += 0.94*compactSource(vec3( 0.00,-0.63,-0.07),closest,ray,entry,exitPoint,0.011); // Electra
      stars += 0.82*compactSource(vec3( 0.28,-0.39, 0.04),closest,ray,entry,exitPoint,0.011); // Maia
      stars += 0.60*compactSource(vec3(-0.18,-0.27, 0.08),closest,ray,entry,exitPoint,0.011); // Merope
      stars += 0.54*compactSource(vec3( 0.39,-0.55,-0.12),closest,ray,entry,exitPoint,0.011); // Taygeta
      stars += 0.28*compactSource(vec3( 0.03, 0.45,-0.03),closest,ray,entry,exitPoint,0.011); // Pleione
    }
    stars *= sqrt(transmission);
    light += vec3(0.75,0.85,1.0)*stars;
    float alpha = clamp(1.0-transmission+stars,0.0,1.0);
    if (alpha < 0.002) discard;
    #include <logdepthbuf_fragment>
    float luminance = dot(light,vec3(0.2126,0.7152,0.0722));
    float colourResponse = mix(0.06,1.0,smoothstep(0.72,1.45,uExposure));
    light = mix(vec3(luminance),light,colourResponse);
    gl_FragColor = vec4(light/max(alpha,0.002)*uExposure,alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <premultiplied_alpha_fragment>
  }
`;

export function createNebulaVolume(dso: DeepSpaceObjectData, exposure: number): THREE.Mesh {
  if (dso.type === 'galacticFeature') {
    const material = new THREE.ShaderMaterial({
      vertexShader, fragmentShader: clusterFragmentShader,
      uniforms: {
        uCamera: { value: new THREE.Vector3(0,0,3) },
        uExposure: { value: exposure },
        uAxisRatio: { value: (dso.angularSizeMinorArcmin ?? dso.angularSizeArcmin) / dso.angularSizeArcmin }
      },
      side: THREE.BackSide, transparent: true, depthWrite: false, premultipliedAlpha: true,
      // The diffuse sky is already tone-mapped. Add this compact component
      // into the remaining display headroom to retain the cluster's bright cusp.
      blending: THREE.CustomBlending, blendSrc: THREE.OneMinusDstColorFactor, blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor
    });
    return new THREE.Mesh(new THREE.SphereGeometry(1,32,24),material);
  }
  let seed = 0;
  for (const c of dso.id) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
  const material = new THREE.ShaderMaterial({
    vertexShader, fragmentShader,
    uniforms: {
      uCamera: { value: new THREE.Vector3(0,0,3) },
      uExposure: { value: exposure },
      uKind: { value: nebulaKind(dso.id) },
      uSeed: { value: seed % 97 }
    },
    side: THREE.BackSide, transparent: true, depthWrite: false,
    premultipliedAlpha: true, blending: THREE.NormalBlending
  });
  return new THREE.Mesh(new THREE.SphereGeometry(1,32,24),material);
}
