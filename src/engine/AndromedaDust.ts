import * as THREE from 'three';

/** Decode face-on V optical depth and support, then subdivide each measured cell. */
export function createAndromedaDust(buffer: ArrayBuffer): THREE.DataTexture {
  const header = new DataView(buffer);
  if (buffer.byteLength < 8 || header.getUint32(0) !== 0x4d333144 || header.getUint16(4, true) !== 1) {
    throw new Error('Invalid Andromeda dust atlas');
  }
  const size = header.getUint16(6, true);
  const count = size * size;
  if (size < 2 || buffer.byteLength !== 8 + count * 3) throw new Error('Invalid Andromeda dust dimensions');
  const tau = new Float32Array(count);
  const support = new Uint8Array(buffer, 8 + count * 2);
  for (let i = 0; i < count; i++) tau[i] = THREE.DataUtils.fromHalfFloat(header.getUint16(8 + 2 * i, true));

  const width = size * 2;
  const texels = new Uint16Array(width * width * 2);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if (!support[i]) continue;
      const weight = support[i] / 255;
      const centre = tau[i];
      // Missing neighbours provide no evidence of a sharp cloud boundary.
      const left = x > 0 && support[i-1] ? tau[i-1] : centre;
      const right = x+1 < size && support[i+1] ? tau[i+1] : centre;
      const lower = y > 0 && support[i-size] ? tau[i-size] : centre;
      const upper = y+1 < size && support[i+size] ? tau[i+size] : centre;
      const gx = (right - left) * 0.5, gy = (upper - lower) * 0.5;
      const gradient = Math.hypot(gx, gy);
      const denominator = Math.max(gradient, 1e-6);
      const fx = 1.15 * gx / denominator, fy = 1.15 * gy / denominator;
      const phase = 12 * Math.log1p(8 * centre) + 0.7 * Math.sin(x * 0.13 + Math.sin(y * 0.17));
      // The phase follows the surveyed column contours. Subtract the exact
      // four-child mean, preserving each parent column to half-float precision.
      const mean = Math.cos(phase) * Math.cos(fx) * Math.cos(fy);
      const amplitude = 0.15 * Math.min(1, gradient / Math.max(0.005, centre * 0.25));
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const ridge = Math.cos(phase + (2 * dx - 1) * fx + (2 * dy - 1) * fy) - mean;
          const index = 2 * ((2 * y + dy) * width + 2 * x + dx);
          // Weight the column before filtering, to avoid bleeding through masked cells.
          texels[index] = THREE.DataUtils.toHalfFloat(weight * centre * (1 + amplitude * ridge));
          texels[index + 1] = THREE.DataUtils.toHalfFloat(weight);
        }
      }
    }
  }
  const texture = new THREE.DataTexture(texels, width, width, THREE.RGFormat, THREE.HalfFloatType);
  texture.name = 'M31 SPIRE 350 face-on V optical depth and survey weight';
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}
