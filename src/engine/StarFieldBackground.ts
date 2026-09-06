import * as THREE from 'three';
import { galacticFrameQuaternion } from '../utils/coordinates';
import { PlaneAlignment } from './StarRenderer';
import { GALACTIC_DUST_GLSL } from './GalacticSkyModel';

const STAR_VERTEX_SHADER = /* glsl */ `
  attribute float size;
  varying vec3 vColor;
  #include <common>
  #include <logdepthbuf_pars_vertex>
  ${GALACTIC_DUST_GLSL}

  void main() {
    vColor = color * exp(-vec3(0.72, 1.0, 1.42) * foregroundDust(normalize(position)));
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <logdepthbuf_vertex>
    // The shell is an angular background, so apparent point size is driven by
    // the sampled catalogue-like brightness rather than the artificial shell
    // radius.
    gl_PointSize = clamp(size, 0.35, 3.0);
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
 * Deterministic unresolved-star shell in a Galactic coordinate frame.
 *
 * This is a visual completion layer for catalogue stars, not a scientific
 * star catalogue. Its latitude distribution follows the observed thin-disk
 * concentration and its seed keeps the sky stable across rebuilds.
 */
export class StarFieldBackground {
  public points: THREE.Points;

  constructor(count: number = 65000) {
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

    const radius = 9500;
    const thinDiskSigma = 7.5 * Math.PI / 180;

    for (let i = 0; i < count; i++) {
      const longitude = random() * Math.PI * 2;
      // Most unresolved stars are concentrated around the Galactic plane;
      // the isotropic component represents the thick disk/halo population.
      const latitude = random() < 0.78
        ? THREE.MathUtils.clamp(gaussian() * thinDiskSigma, -Math.PI / 2, Math.PI / 2)
        : Math.asin(2 * random() - 1);
      const cosLatitude = Math.cos(latitude);
      const shellRadius = radius + (random() - 0.5) * 100;

      // Local axes are +X=l=0, +Y=b=+90, +Z=l=90.
      positions[i * 3] = shellRadius * cosLatitude * Math.cos(longitude);
      positions[i * 3 + 1] = shellRadius * Math.sin(latitude);
      positions[i * 3 + 2] = shellRadius * cosLatitude * Math.sin(longitude);

      // Flux-limited naked-eye-like mix. Cool dwarfs dominate the Galaxy by
      // number, but most are too faint to dominate an apparent star field.
      const colourSample = random();
      const colourIndex = colourSample < 0.16 ? 0
        : colourSample < 0.38 ? 1
          : colourSample < 0.68 ? 2
            : colourSample < 0.86 ? 3
              : colourSample < 0.97 ? 4 : 5;
      const colour = palette[colourIndex].clone();
      const brightness = 0.12 + Math.pow(random(), 3.6) * 0.88;
      colour.multiplyScalar(brightness);
      colors[i * 3] = colour.r;
      colors[i * 3 + 1] = colour.g;
      colors[i * 3 + 2] = colour.b;

      sizes[i] = 0.42 + Math.pow(random(), 4.2) * 2.2;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.ShaderMaterial({
      vertexShader: STAR_VERTEX_SHADER,
      fragmentShader: STAR_FRAGMENT_SHADER,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      toneMapped: true
    });

    this.points = new THREE.Points(geometry, material);
    this.setPlaneAlignment('ecliptic');
  }

  public setPlaneAlignment(alignment: PlaneAlignment) {
    this.points.quaternion.copy(galacticFrameQuaternion(alignment));
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
