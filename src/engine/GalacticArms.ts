import * as THREE from 'three';

// Reid et al. (2019), Table 2 and equation 1, doi:10.3847/1538-4357/ab4a11.
// Observed Galactocentric azimuth limits, kink azimuth, kink radius in kpc,
// pitches on either side in degrees, and Gaussian 1-sigma width in kpc.
const segments = [
  [15, 18, 15, 3.52, -4.2, -4.2, 0.18],  // Near 3-kpc arm
  [5, 54, 18, 4.46, -1.0, 19.5, 0.14],   // Norma
  [0, 104, 23, 4.91, 14.1, 12.1, 0.23],  // Scutum-Centaurus
  [2, 97, 24, 6.04, 17.1, 1.0, 0.27],    // Sagittarius-Carina
  [-8, 34, 9, 8.26, 11.4, 11.4, 0.31],   // Local
  [-23, 115, 40, 8.87, 10.3, 8.7, 0.35], // Perseus
  [-16, 71, 18, 12.24, 3.0, 9.4, 0.65]   // Outer
].map(([start, end, kink, radius, pitchBefore, pitchAfter, width]) => ({
  start, end, kink, radius, width,
  slopeBefore: Math.tan(THREE.MathUtils.degToRad(pitchBefore)),
  slopeAfter: Math.tan(THREE.MathUtils.degToRad(pitchAfter))
}));

/** In the published 8.15 kpc frame, +x points to Sol and +y to l=90°. */
export function armDensity(x: number, y: number) {
  const radius = Math.hypot(x, y);
  if (radius < 1.5 || radius > 19) return 0;
  const angle = Math.atan2(y, x);
  const beta = THREE.MathUtils.radToDeg(angle);
  let ridge = 0, covered = 0;
  for (const arm of segments) {
    const outside = Math.max(arm.start - beta, 0, beta - arm.end);
    // Continue the fit for at most a few tens of degrees beyond its tracers.
    const weight = 1 - THREE.MathUtils.smoothstep(outside, 0, 28);
    if (!weight) continue;
    const slope = beta < arm.kink ? arm.slopeBefore : arm.slopeAfter;
    const axis = arm.radius * Math.exp(-THREE.MathUtils.degToRad(beta - arm.kink) * slope);
    const sigma = Math.max(0.10, arm.width + 0.042 * (axis - arm.radius));
    const perpendicular = (radius - axis) / Math.sqrt(1 + slope * slope);
    ridge = Math.max(ridge, weight * Math.exp(-0.5 * (perpendicular / sigma) ** 2));
    covered = Math.max(covered, weight * (1 - THREE.MathUtils.smoothstep(Math.abs(radius - axis), 0.7, 1.7)));
  }

  // Low-contrast continuation for areas without maser distances, principally
  // on the far side. It winds in the same sense as the fitted segments.
  const phase = angle + Math.log(radius / 9.8) / Math.tan(12 * Math.PI / 180);
  const prior = 0.45 * (0.5 + 0.5 * Math.cos(4 * phase)) ** 4;
  return Math.max(ridge, (1 - covered) * prior)
    * THREE.MathUtils.smoothstep(radius, 1.5, 3) * (1 - THREE.MathUtils.smoothstep(radius, 16, 19));
}

const size = 512;
let cached: { solarRadius: number; pixels: Uint8Array<ArrayBuffer> } | undefined;

function lattice(x: number, y: number) {
  let bits = Math.imul(x, 1597334677) ^ Math.imul(y, 3812015801);
  bits = Math.imul(bits ^ bits >>> 16, 2246822507);
  return ((bits ^ bits >>> 13) >>> 0) / 4294967296;
}

function field(x: number, y: number) {
  const i = Math.floor(x), j = Math.floor(y);
  const u = THREE.MathUtils.smoothstep(x - i, 0, 1), v = THREE.MathUtils.smoothstep(y - j, 0, 1);
  return THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(lattice(i, j), lattice(i + 1, j), u),
    THREE.MathUtils.lerp(lattice(i, j + 1), lattice(i + 1, j + 1), u), v);
}

// Fit membership occupies red. Sample its continuous profile a little to
// either side to place the modelled dust ridges and spurs beside each arm.
function sampleRidge(pixels: Uint8Array, x: number, y: number) {
  x = THREE.MathUtils.clamp(x, 0, size - 1.001);
  y = THREE.MathUtils.clamp(y, 0, size - 1.001);
  const i = Math.floor(x), j = Math.floor(y), start = 4 * (j * size + i);
  return THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(pixels[start], pixels[start + 4], x - i),
    THREE.MathUtils.lerp(pixels[start + 4 * size], pixels[start + 4 * size + 4], x - i), y - j) / 255;
}

function bakeDiscStructure(pixels: Uint8Array, pixelKpc: number) {
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = (i + 0.5 - size / 2) * pixelKpc, y = (j + 0.5 - size / 2) * pixelKpc;
      const r = Math.hypot(x, y);
      if (r < 1.5 || r > 19) continue;
      const index = 4 * (j * size + i);
      const broad = field(x * 0.39 + 12, y * 0.39 - 3);
      // Unwind a trailing spiral before sampling noise. Cloud filaments are
      // stretched along the local shear, including across the azimuth seam.
      const shear = 3.9 * Math.log(r / 8.15), c = Math.cos(shear), s = Math.sin(shear);
      const u = c * x - s * y, v = s * x + c * y;
      const waviness = field(u * 0.57 - 14, v * 0.57 + 6);
      const nx = x / (r * pixelKpc), ny = y / (r * pixelKpc);
      const offsetRidge = (offset: number) => sampleRidge(pixels, i + nx * offset, j + ny * offset);
      const ridge = offsetRidge(0.22 * (waviness - 0.5));
      const spur = offsetRidge(1.55 * (broad - 0.32)) * THREE.MathUtils.smoothstep(waviness, 0.33, 0.81);
      const associations = field(x * 1.34 + waviness, y * 1.34 - 19);
      const clusters = field(x * 3.72 + 91, y * 3.72 + 11);
      const complexes = THREE.MathUtils.smoothstep(0.65 * associations + 0.35 * clusters, 0.31, 0.77);
      const young = Math.min(1, Math.max(ridge, 0.65 * spur) ** 0.72 * (0.20 + 0.9 * complexes));
      // Dust tends to the inner arm edge; its secondary lane intermittently
      // peels off into the inter-arm region instead of outlining every arm.
      const lane = offsetRidge(0.31 + 0.29 * (waviness - 0.5));
      const fork = offsetRidge(0.26 + 1.4 * (broad - 0.28)) * (0.25 + 0.65 * waviness);
      const fibre = field(u * 1.62 + 3 * broad, v * 1.62 + 17);
      const dust = Math.min(1, Math.max(lane, fork) * (0.25 + 0.85 * fibre));
      const hii = young * THREE.MathUtils.smoothstep(0.45 * associations + 0.55 * clusters, 0.63, 0.84);
      pixels[index + 1] = Math.round(255 * young);
      pixels[index + 2] = Math.round(255 * dust);
      pixels[index + 3] = Math.round(255 * hii);
    }
  }
}

/** Bake once on the CPU. Each ray step then needs just one filtered texture read. */
export function createGalacticArmTexture(solarRadius: number) {
  if (cached?.solarRadius !== solarRadius) {
    const pixels = new Uint8Array(4 * size * size);
    const pixelKpc = (40 / size) * (8.15 / solarRadius);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        pixels[4 * (y * size + x)] = Math.round(255 * armDensity(
          (x + 0.5 - size / 2) * pixelKpc, (y + 0.5 - size / 2) * pixelKpc));
      }
    }
    bakeDiscStructure(pixels, pixelKpc);
    cached = { solarRadius, pixels };
  }
  const texture = new THREE.DataTexture(cached.pixels, size, size, THREE.RGBAFormat);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
