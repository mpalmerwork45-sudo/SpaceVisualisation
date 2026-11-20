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

/** Bake once on the CPU. Each ray step then needs just one filtered texture read. */
export function createGalacticArmTexture(solarRadius: number) {
  if (cached?.solarRadius !== solarRadius) {
    const pixels = new Uint8Array(size * size);
    const pixelKpc = (40 / size) * (8.15 / solarRadius);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        pixels[y * size + x] = Math.round(255 * armDensity(
          (x + 0.5 - size / 2) * pixelKpc, (y + 0.5 - size / 2) * pixelKpc));
      }
    }
    cached = { solarRadius, pixels };
  }
  const texture = new THREE.DataTexture(cached.pixels, size, size, THREE.RedFormat);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
