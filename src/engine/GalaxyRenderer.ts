import * as THREE from 'three';
import {
  angularDiameterToWorldSize,
  celestialTangentBasis,
  equatorialToEcliptic,
  equatorialToGalactic,
  positionAngleBasis,
  ViewMode
} from '../utils/coordinates';
import { DeepSpaceObjectData, GalaxyAppearance } from '../data/deepSpace';
import { meanSurfaceBrightnessMagArcsec2, surfaceBrightnessFlux } from '../utils/photometry';
import type { PlaneAlignment } from './StarRenderer';

export interface RenderedGalaxyNode {
  data: DeepSpaceObjectData;
  position: THREE.Vector3;
  mesh: THREE.Object3D;
}

const GALAXY_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  #include <common>
  #include <logdepthbuf_pars_vertex>
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
  }
`;

const GALAXY_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uPrimary;
  uniform vec3 uSecondary;
  uniform float uBulgeFraction;
  uniform float uSersicIndex;
  uniform float uDiskScale;
  uniform float uArmCount;
  uniform float uPitch0;
  uniform float uPitch1;
  uniform float uArmContrast;
  uniform float uDustOpacity;
  uniform float uInclination;
  uniform float uAxisRatio;
  uniform float uPhotometricFlux;
  uniform float uExposure;
  uniform float uSeed;
  uniform int uMorphology;

  varying vec2 vUv;
  #include <common>
  #include <logdepthbuf_pars_fragment>

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345 + uSeed);
    return fract(p.x * p.y);
  }

  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float armPattern(vec2 p, float pitch) {
    float radius = max(length(p), 0.025);
    float angle = atan(p.y, p.x);
    float phase = angle - log(radius) / max(tan(pitch), 0.05);
    float wave = 0.5 + 0.5 * cos(phase * max(uArmCount, 1.0));
    return smoothstep(0.48, 0.92, wave);
  }

  float fractal(vec2 p) {
    float sum = 0.0, amplitude = 0.5;
    for (int i=0; i<5; i++) {
      sum += valueNoise(p)*amplitude;
      p = mat2(1.62,1.17,-1.17,1.62)*p+13.0;
      amplitude *= 0.5;
    }
    return sum;
  }

  void main() {
    vec2 sky = vUv * 2.0 - 1.0;
    // Deproject only the disc. A spheroidal bulge must not be flattened to
    // the same thin ellipse as an inclined stellar disc.
    vec2 p = vec2(sky.x, sky.y / uAxisRatio);
    float radius = length(p);
    if (length(sky) > 1.0) discard;
    #include <logdepthbuf_fragment>
    float cloud = fractal(p*19.0+uSeed);
    float fine = valueNoise(p*240.0+uSeed);

    float n = max(uSersicIndex, 0.6);
    // Ciotti-Bertin approximation to the Sersic b_n coefficient.
    float bn = 2.0 * n - 1.0 / 3.0 + 4.0 / (405.0 * n) + 46.0 / (25515.0 * n * n);
    float bulgeRe = mix(0.10, 0.30, clamp(uBulgeFraction, 0.0, 1.0));
    float bulgeRadius = max(length(sky * vec2(1.0,1.2)) / bulgeRe, 0.002);
    float bulge = exp(-bn * (pow(bulgeRadius, 1.0 / n) - 1.0));
    bulge *= 1.0 - smoothstep(0.72,1.0,length(sky));
    float disk = exp(-radius / max(uDiskScale, 0.08));
    disk *= 1.0 - smoothstep(0.84,1.0,radius);

    float arms = 0.0;
    if (uMorphology == 0 || uMorphology == 1) {
      arms = mix(
        armPattern(p + (cloud-0.5)*0.012, radians(uPitch0)),
        armPattern(p + (cloud-0.5)*0.012, radians(uPitch1)),
        0.5 + 0.5 * sin(uSeed)
      );
    }

    float structure = 1.0;
    if (uMorphology == 3) {
      structure = 0.35 + 1.6 * cloud;
      structure *= 0.7 + fine*0.6;
    } else {
      structure += uArmContrast * arms * (0.35 + 1.5 * cloud);
      structure *= 0.86 + fine*0.28;
    }

    if (uMorphology == 1) {
      float bar = exp(-pow(p.y * 5.0, 2.0)) * exp(-pow(p.x * 1.6, 4.0));
      structure += bar * 0.24;
    }

    if (uMorphology == 2) {
      disk *= exp(-abs(p.y) * 3.4);
    }

    // Dust is an optical-depth attenuation, not a black polygon layered on top.
    float inclination = clamp(uInclination / 90.0, 0.0, 1.0);
    float dustHalfWidth = mix(0.20, 0.085, smoothstep(0.45, 0.95, inclination));
    float projectedLane = exp(-pow(abs(p.y+(cloud-0.5)*0.035) / dustHalfWidth, 2.0));
    projectedLane *= exp(-pow(p.x / 0.92, 2.0));
    projectedLane *= smoothstep(0.52, 0.92, inclination);
    float innerArms = armPattern(p * 1.07, radians(uPitch0));
    float faceOnDust = innerArms * disk * (1.0 - smoothstep(0.55, 0.90, inclination));
    float opticalDepth = uDustOpacity * (projectedLane * (0.65 + 0.35 * disk) + faceOnDust) * (0.7+cloud*1.8);
    float dust = exp(-opticalDepth);

    float bulgeLight = bulge * uBulgeFraction;
    float diskLight = disk * (1.0-uBulgeFraction) * structure;
    float intensity = max(0.0, (bulgeLight + diskLight) * dust);
    if (intensity < 0.001) discard;

    float young = clamp(arms * 0.72 + (1.0 - uBulgeFraction) * 0.12, 0.0, 1.0);
    young *= diskLight / max(bulgeLight + diskLight,0.0001);
    vec3 color = mix(uPrimary, uSecondary, young);
    color *= exp(-vec3(0.10,0.20,0.36)*opticalDepth);
    float clusters = smoothstep(0.72,0.90,fine)*arms*disk;
    color += vec3(0.18,0.035,0.065)*clusters;
    float luminance = dot(color, vec3(0.2126,0.7152,0.0722));
    color = mix(vec3(luminance), color, mix(0.06,1.0,smoothstep(0.72,1.45,uExposure)));
    float radiance = intensity * uPhotometricFlux * uExposure;
    float alpha = 1.0 - exp(-intensity);

    // radiance is already integrated surface light. Divide out coverage before
    // the standard premultiply, otherwise faint outskirts are dimmed twice.
    gl_FragColor = vec4(color * radiance / max(alpha,0.00001), alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    // Premultiply after tone mapping/output conversion, matching Three's
    // standard material pipeline and NormalBlending factors.
    #include <premultiplied_alpha_fragment>
  }
`;

function morphologyId(morphology: GalaxyAppearance['morphology']): number {
  if (morphology === 'barredSpiral') return 1;
  if (morphology === 'edgeOn') return 2;
  if (morphology === 'irregular') return 3;
  if (morphology === 'lenticular') return 4;
  return 0;
}

function stableSeed(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function transformEquatorialVector(vector: THREE.Vector3, alignment: PlaneAlignment): THREE.Vector3 {
  if (alignment === 'galactic') return equatorialToGalactic(vector);
  if (alignment === 'ecliptic') return equatorialToEcliptic(vector);
  return vector.clone();
}

export class GalaxyRenderer {
  public group: THREE.Group;
  public nodes: Map<string, RenderedGalaxyNode> = new Map();
  private exposure = 1;

  constructor() {
    this.group = new THREE.Group();
  }

  public setExposure(exposure: number) {
    this.exposure = Math.max(0.1, exposure);
    this.nodes.forEach(node => {
      node.mesh.traverse(child => {
        const material = child instanceof THREE.Mesh ? child.material : null;
        if (material instanceof THREE.ShaderMaterial && material.uniforms.uExposure) {
          material.uniforms.uExposure.value = this.exposure;
        }
      });
    });
  }

  public clear() {
    this.nodes.forEach(node => this.disposeObject(node.mesh));
    this.nodes.clear();
    while (this.group.children.length) {
      this.group.remove(this.group.children[0]);
    }
  }

  public dispose() {
    this.clear();
  }

  public createGalaxy(
    dso: DeepSpaceObjectData,
    viewMode: ViewMode,
    alignment: PlaneAlignment,
    position: THREE.Vector3
  ): RenderedGalaxyNode {
    if (!dso.galaxy) {
      const marker = this.createFeatureMarker(dso, position);
      this.group.add(marker);
      const featureNode = { data: dso, position: position.clone(), mesh: marker };
      this.nodes.set(dso.id, featureNode);
      return featureNode;
    }

    const appearance = dso.galaxy;
    const renderedDistance = Math.max(position.length(), 0.001);
    const majorSize = viewMode === 'linear'
      ? appearance.physicalDiameterLy
      : angularDiameterToWorldSize(appearance.majorArcmin, renderedDistance);
    const minorSize = viewMode === 'linear'
      ? appearance.physicalDiameterLy * appearance.minorArcmin / appearance.majorArcmin
      : angularDiameterToWorldSize(appearance.minorArcmin, renderedDistance);

    const equatorial = celestialTangentBasis(dso.ra, dso.dec);
    const pa = positionAngleBasis(dso.ra, dso.dec, appearance.positionAngleDeg);
    const direction = transformEquatorialVector(equatorial.direction, alignment).normalize();
    const major = transformEquatorialVector(pa.major, alignment).normalize();
    const minor = transformEquatorialVector(pa.minor, alignment).normalize();

    const geometry = new THREE.PlaneGeometry(1, 1, 1, 1);
    const material = this.createMaterial(dso, appearance);
    material.uniforms.uAxisRatio.value = minorSize / majorSize;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.scale.set(majorSize, majorSize, 1);
    mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(major, minor, direction.negate()));
    mesh.userData = { deepObjectData: dso, type: 'deepSpace' };

    const group = new THREE.Group();
    group.position.set(0, 0, 0);
    group.add(mesh);
    group.userData = { deepObjectData: dso, type: 'deepSpace' };
    this.group.add(group);

    const node: RenderedGalaxyNode = { data: dso, position: position.clone(), mesh: group };
    this.nodes.set(dso.id, node);
    return node;
  }

  private createMaterial(dso: DeepSpaceObjectData, appearance: GalaxyAppearance): THREE.ShaderMaterial {
    const primary = new THREE.Color(dso.colorHex);
    const secondary = new THREE.Color(dso.secondaryColorHex);
    const pitch = appearance.armPitchAnglesDeg || [18, 22];
    const meanSurfaceBrightness = meanSurfaceBrightnessMagArcsec2(
      appearance.apparentMagnitudeV,
      appearance.majorArcmin,
      appearance.minorArcmin
    );
    // Integrated magnitude alone over-brightens large galaxies. Scale the
    // analytic surface by mean V-band surface brightness instead.
    const photometricFlux = THREE.MathUtils.clamp(
      0.78 * surfaceBrightnessFlux(meanSurfaceBrightness),
      0.04,
      2.4
    );

    return new THREE.ShaderMaterial({
      vertexShader: GALAXY_VERTEX_SHADER,
      fragmentShader: GALAXY_FRAGMENT_SHADER,
      uniforms: {
        uPrimary: { value: primary },
        uSecondary: { value: secondary },
        uBulgeFraction: { value: appearance.bulgeFraction },
        uSersicIndex: { value: appearance.sersicIndex },
        uDiskScale: { value: appearance.diskScale },
        uArmCount: { value: appearance.armCount || 1 },
        uPitch0: { value: pitch[0] },
        uPitch1: { value: pitch[1] ?? pitch[0] },
        uArmContrast: { value: appearance.armContrast || 0 },
        uDustOpacity: { value: appearance.dustOpacity },
        uInclination: { value: appearance.inclinationDeg },
        uAxisRatio: { value: appearance.minorArcmin / appearance.majorArcmin },
        uPhotometricFlux: { value: photometricFlux },
        uExposure: { value: this.exposure },
        uSeed: { value: stableSeed(dso.id) * 31.0 },
        uMorphology: { value: morphologyId(appearance.morphology) }
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      premultipliedAlpha: true,
      blending: THREE.NormalBlending,
      toneMapped: true
    });
  }

  private createFeatureMarker(dso: DeepSpaceObjectData, position: THREE.Vector3): THREE.Mesh {
    const diameter = angularDiameterToWorldSize(dso.angularSizeArcmin, Math.max(position.length(), 0.001));
    const radius = Math.max(0.05, diameter * 0.5);
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 16, 8),
      new THREE.MeshBasicMaterial({
        color: dso.colorHex,
        transparent: true,
        opacity: 0.28,
        depthWrite: false
      })
    );
    marker.position.copy(position);
    marker.userData = { deepObjectData: dso, type: 'deepSpace' };
    return marker;
  }

  private disposeObject(object: THREE.Object3D) {
    object.traverse(child => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach(material => material.dispose());
      }
    });
  }
}
