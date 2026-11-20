import * as THREE from 'three';
import {
  angularDiameterToWorldSize, equatorialToEcliptic, equatorialToGalactic,
  positionAngleBasis, ViewMode
} from '../utils/coordinates';
import { DeepSpaceObjectData, GalaxyAppearance } from '../data/deepSpace';
import { meanSurfaceBrightnessMagArcsec2, surfaceBrightnessFlux } from '../utils/photometry';
import type { PlaneAlignment } from './StarRenderer';
import { RADIATIVE_TRANSFER_GLSL } from './RadiativeTransfer';
import { createGalaxyDisc } from './GalaxyDisc';
import { createAndromedaDust } from './AndromedaDust';

export interface RenderedGalaxyNode {
  data: DeepSpaceObjectData;
  position: THREE.Vector3;
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial | THREE.MeshBasicMaterial>;
}

const GALAXY_VERTEX_SHADER = /* glsl */ `
  varying vec3 vLocal;
  #include <common>
  #include <logdepthbuf_pars_vertex>

  void main() {
    vLocal = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
  }
`;

const GALAXY_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uCamera;
  uniform vec3 uPrimary;
  uniform vec3 uSecondary;
  uniform float uDepthRatio;
  uniform float uBulgeFraction;
  uniform float uSersicIndex;
  uniform sampler2D uDisc;
  uniform sampler2D uDustAtlas;
  uniform bool uUseDustAtlas;
  uniform float uDiscHeight;
  uniform float uDustOpacity;
  uniform float uPhotometricFlux;
  uniform float uExposure;

  varying vec3 vLocal;
  #include <common>
  #include <logdepthbuf_pars_fragment>
  ${RADIATIVE_TRANSFER_GLSL}

  // Mean density of an exponential sheet over a ray segment. Integrating
  // over its vertical extent keeps thin dust lanes visible at grazing angles.
  float layerDensity(float z, float dz, float height) {
    if (dz < 0.08 * height) return 0.5 / height * exp(-abs(z) / height);
    vec2 ends = vec2(z - 0.5 * dz, z + 0.5 * dz);
    vec2 cumulative = sign(ends) * (1.0 - exp(-abs(ends) / height));
    return 0.5 * (cumulative.y - cumulative.x) / dz;
  }

  void main() {
    // Find the sightline's chord through the unit sphere, including observers
    // inside the galaxy. Closest-approach coordinates retain precision afar.
    vec3 ray = normalize(vLocal - uCamera);
    float midpoint = -dot(uCamera, ray);
    vec3 closest = uCamera + midpoint * ray;
    float discriminant = 1.0 - dot(closest, closest);
    if (discriminant <= 0.0) discard;
    float halfChord = sqrt(discriminant);
    float entry = max(0.0, midpoint - halfChord);
    float exitDistance = midpoint + halfChord;
    if (exitDistance <= entry) discard;

    const int steps = 36;
    float stepSize = (exitDistance - entry) / float(steps);
    vec3 start = closest + (entry - midpoint) * ray;
    vec3 scale = vec3(1.0, 1.0, uDepthRatio);
    float path = length(ray * scale) * stepSize;
    float n = max(uSersicIndex, 0.60);
    float bn = 2.0*n - 1.0/3.0 + 4.0/(405.0*n) + 46.0/(25515.0*n*n);
    float bulgeScale = mix(0.10, 0.26, uBulgeFraction);
    vec3 stepVector = stepSize * ray;
    vec2 firstUV = start.xy * 0.5 + 0.5;
    vec2 stepUV = stepVector.xy * 0.5;
    vec2 uvDx = dFdx(firstUV), uvDy = dFdy(firstUV);
    vec2 stepDx = dFdx(stepUV), stepDy = dFdy(stepUV);
    float dz = abs(stepVector.z) * uDepthRatio;
    vec3 oldColour = mix(vec3(1.0, 0.76, 0.52), uPrimary, 0.28);
    vec3 youngColour = mix(vec3(0.36, 0.61, 1.0), uSecondary, 0.20);

    vec3 transmission = vec3(1.0);
    vec3 light = vec3(0.0);
    for (int i = 0; i < steps; i++) {
      float sampleIndex = float(i) + 0.5;
      vec3 samplePosition = start + sampleIndex * stepVector;
      vec3 p = samplePosition * scale;
      vec2 pixelDx = uvDx + sampleIndex * stepDx, dy = uvDy + sampleIndex * stepDy;
      vec2 dx = pixelDx;
      // Filter both the projected pixel and the length of disc crossed by
      // this step, so compact associations blend smoothly at a distance.
      if (dot(stepUV, stepUV) > max(dot(dx, dx), dot(dy, dy))) dx = stepUV;
      vec4 columns = textureGrad(uDisc, firstUV + sampleIndex * stepUV, dx, dy);

      float taper = 1.0 - smoothstep(0.52, 1.0, length(samplePosition));
      float envelope = taper * taper;
      float z = p.z - 0.016 * p.x * dot(p.xy, p.xy);
      float bulgeRadius = length(p * vec3(1.0, 1.0, 1.12));
      float bulge = 1.60 * exp(-bn * (pow(max(bulgeRadius / bulgeScale, 0.002), 1.0 / n) - 1.0));
      float old = columns.r * layerDensity(z, dz, uDiscHeight) * 1.35;
      float youngLayer = layerDensity(z, dz, uDiscHeight * 0.13);
      float youngColumn = columns.g, ionizedColumn = columns.a;
      float dust = uDustOpacity * columns.b * layerDensity(z, dz, uDiscHeight * 0.20) * 2.1 * envelope;
      if (uUseDustAtlas) {
        const float height = 0.006;
        // A segment can traverse many texels yet cross the thin layer in
        // only part of the segment. Sample the patch closest to the plane.
        float crossing = dz > height ? clamp(-p.z / (stepVector.z * uDepthRatio), -0.5, 0.5) : 0.0;
        vec2 uv = firstUV + (sampleIndex + crossing) * stepUV;
        vec2 footprint = stepUV * min(1.0, 3.0 * height / max(dz, height));
        vec2 surveyDx = dot(footprint, footprint) > max(dot(pixelDx, pixelDx), dot(dy, dy)) ? footprint : pixelDx;
        vec2 survey = textureGrad(uDustAtlas, uv, surveyDx, dy).rg;
        // A face-on optical depth is the integral of density normal to the
        // disc. Normalize the inferred vertical profile inside the finite mesh.
        float halfDepth = uDepthRatio * sqrt(max(0.0, 1.0 - dot(p.xy, p.xy)));
        float massInMesh = max(0.0001, 1.0 - exp(-halfDepth / height));
        dust = (1.0 - survey.g) * dust + survey.r * layerDensity(p.z, dz, height) / massInMesh;
        // Give illustrative young associations a measured large-scale anchor.
        // Place them by nearby dusty gas with a small outward displacement;
        // their individual stars and colours are not survey measurements.
        vec2 innerUV = uv - 0.008 * p.xy / max(length(p.xy), 0.1);
        vec2 cloud = textureGrad(uDustAtlas, innerUV, surveyDx, dy).rg;
        float gas = cloud.r / max(cloud.g, 0.001);
        float association = (1.0 - exp(-4.0 * max(0.0, gas - 0.036))) * (0.30 + 0.20 * columns.g);
        youngColumn = mix(youngColumn, association, cloud.g);
        ionizedColumn = mix(ionizedColumn, association * (0.03 + 0.31 * columns.a), cloud.g);
      }
      float young = youngColumn * youngLayer * 1.65;
      float ionized = ionizedColumn * youngLayer * 1.2;
      float stars = (1.0 - uBulgeFraction) * (old + young) + uBulgeFraction * bulge;
      vec3 emissivity = (1.0 - uBulgeFraction) * (oldColour * old + youngColour * young
        + vec3(1.0, 0.20, 0.28) * ionized) + oldColour * uBulgeFraction * bulge;
      vec3 tau = (vec3(0.72, 1.0, 1.32) * dust + 0.17 * stars * envelope) * path;
      light += transmission * emissivity * envelope * path * emissionIntegral(tau);
      transmission *= exp(-tau);
      if (max(transmission.r, max(transmission.g, transmission.b)) < 0.004) break;
    }

    float alpha = 1.0 - dot(transmission, vec3(0.2126, 0.7152, 0.0722));
    if (alpha < 0.00002) discard;
    #include <logdepthbuf_fragment>
    float luminance = dot(light, vec3(0.2126, 0.7152, 0.0722));
    light = mix(vec3(luminance), light, mix(0.06, 1.0, smoothstep(0.72, 1.45, uExposure)));
    // Radiance is already integrated along the chord. Blend it additively over
    // the transmitted sky without letting a dense, dark lane brighten the source.
    gl_FragColor = vec4(light * uPhotometricFlux * uExposure, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function transformEquatorialVector(vector: THREE.Vector3, alignment: PlaneAlignment): THREE.Vector3 {
  if (alignment === 'galactic') return equatorialToGalactic(vector);
  if (alignment === 'ecliptic') return equatorialToEcliptic(vector);
  return vector;
}

export class GalaxyRenderer {
  public readonly group = new THREE.Group();
  public readonly nodes = new Map<string, RenderedGalaxyNode>();
  private readonly volumeGeometry = new THREE.SphereGeometry(1, 40, 28);
  private readonly discs = new Map<DeepSpaceObjectData, THREE.DataTexture>();
  private readonly dustAtlas = { value: null as THREE.DataTexture | null };
  private readonly useDustAtlas = { value: false };
  private dustRequest: AbortController | null = null;
  private retryDustAfter = 0;
  private exposure = 0.72;

  public setExposure(exposure: number) {
    this.exposure = Math.max(0.1, exposure);
    for (const { mesh } of this.nodes.values()) {
      if (mesh.material instanceof THREE.ShaderMaterial) mesh.material.uniforms.uExposure.value = this.exposure;
    }
  }

  public clear() {
    for (const { mesh } of this.nodes.values()) {
      if (mesh.geometry !== this.volumeGeometry) mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.nodes.clear();
    this.group.clear();
  }

  public dispose() {
    this.clear();
    this.dustRequest?.abort();
    this.dustAtlas.value?.dispose();
    this.dustAtlas.value = null;
    this.useDustAtlas.value = false;
    this.volumeGeometry.dispose();
    for (const disc of this.discs.values()) disc.dispose();
    this.discs.clear();
  }

  public createGalaxy(dso: DeepSpaceObjectData, viewMode: ViewMode, alignment: PlaneAlignment, position: THREE.Vector3): RenderedGalaxyNode {
    const appearance = dso.galaxy;
    const distance = Math.max(position.length(), 0.001);
    let mesh: RenderedGalaxyNode['mesh'];
    if (appearance) {
      const angularMajor = angularDiameterToWorldSize(appearance.majorArcmin, distance);
      const angularMinor = angularDiameterToWorldSize(appearance.minorArcmin, distance);
      const radius = (viewMode === 'linear' ? appearance.physicalDiameterLy : angularMajor) * 0.5;
      const projectedRatio = angularMinor / angularMajor;
      const inclination = THREE.MathUtils.degToRad(appearance.inclinationDeg);
      // An oblate spheroid's projected minor axis mixes its face-on radius
      // and polar depth at the measured inclination.
      const sinSquared = Math.sin(inclination) ** 2;
      const depthSquared = sinSquared > 0.0001 ? (projectedRatio ** 2 - Math.cos(inclination) ** 2) / sinSquared : 0.04;
      const depthRatio = THREE.MathUtils.clamp(Math.sqrt(Math.max(0, depthSquared)), 0.06, 1);

      const axes = positionAngleBasis(dso.ra, dso.dec, appearance.positionAngleDeg);
      const major = transformEquatorialVector(axes.major, alignment).normalize();
      const minor = transformEquatorialVector(axes.minor, alignment).normalize();
      const normal = position.clone().normalize().negate();
      mesh = new THREE.Mesh(this.volumeGeometry, this.createMaterial(dso, appearance, depthRatio));
      mesh.scale.set(radius, radius, radius * depthRatio);
      mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(major, minor, normal));
      // The catalogue minor axis points southeast. For M31 the northwest
      // side is nearer Sol, so the positive minor axis tips away from us.
      mesh.rotateX(dso.id === 'andromeda_m31' ? -inclination : inclination);
      if (dso.id === 'andromeda_m31' && typeof window !== 'undefined') {
        this.loadAndromedaDust();
        mesh.onBeforeRender = () => this.loadAndromedaDust();
      }
    } else {
      const radius = Math.max(0.05, angularDiameterToWorldSize(dso.angularSizeArcmin, distance) * 0.5);
      mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 8), new THREE.MeshBasicMaterial({
        color: dso.colorHex, transparent: true, opacity: 0.28, depthWrite: false
      }));
    }
    mesh.position.copy(position);
    mesh.userData = { deepObjectData: dso, type: 'deepSpace' };
    this.group.add(mesh);
    const node = { data: dso, position: position.clone(), mesh };
    this.nodes.set(dso.id, node);
    return node;
  }

  private loadAndromedaDust() {
    if (this.dustAtlas.value || this.dustRequest || performance.now() < this.retryDustAfter) return;
    const request = new AbortController();
    this.dustRequest = request;
    fetch(import.meta.env.BASE_URL + 'data/andromeda-dust.bin', { signal: request.signal })
      .then(response => {
        if (!response.ok) throw new Error('M31 dust atlas HTTP ' + response.status);
        return response.arrayBuffer();
      })
      .then(buffer => {
        if (request.signal.aborted) return;
        this.dustAtlas.value = createAndromedaDust(buffer);
        this.useDustAtlas.value = true;
      })
      .catch(() => { if (!request.signal.aborted) this.retryDustAfter = performance.now() + 15000; })
      .finally(() => { if (this.dustRequest === request) this.dustRequest = null; });
  }

  private createMaterial(dso: DeepSpaceObjectData, appearance: GalaxyAppearance, depthRatio: number) {
    let disc = this.discs.get(dso);
    if (!disc) {
      disc = createGalaxyDisc(dso.id, appearance);
      this.discs.set(dso, disc);
    }
    const discHeight = appearance.morphology === 'irregular' ? 0.115 : appearance.morphology === 'edgeOn' ? 0.050 : 0.075;
    const surfaceBrightness = meanSurfaceBrightnessMagArcsec2(
      appearance.apparentMagnitudeV, appearance.majorArcmin, appearance.minorArcmin
    );
    const flux = THREE.MathUtils.clamp(0.44 * surfaceBrightnessFlux(surfaceBrightness), 0.04, 2.4);
    return new THREE.ShaderMaterial({
      vertexShader: GALAXY_VERTEX_SHADER,
      fragmentShader: GALAXY_FRAGMENT_SHADER,
      uniforms: {
        uCamera: { value: new THREE.Vector3(0, 0, 3) },
        uPrimary: { value: new THREE.Color(dso.colorHex) },
        uSecondary: { value: new THREE.Color(dso.secondaryColorHex) },
        uDepthRatio: { value: depthRatio },
        uBulgeFraction: { value: appearance.bulgeFraction },
        uSersicIndex: { value: appearance.sersicIndex },
        uDisc: { value: disc },
        uDustAtlas: dso.id === 'andromeda_m31' ? this.dustAtlas : { value: null },
        uUseDustAtlas: dso.id === 'andromeda_m31' ? this.useDustAtlas : { value: false },
        uDiscHeight: { value: discHeight },
        uDustOpacity: { value: appearance.dustOpacity },
        uPhotometricFlux: { value: flux },
        uExposure: { value: this.exposure }
      },
      side: THREE.BackSide, transparent: true, depthWrite: false,
      premultipliedAlpha: true, blending: THREE.NormalBlending
    });
  }
}
