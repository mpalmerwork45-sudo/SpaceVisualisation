import * as THREE from 'three';
import type { GalaxyAppearance } from '../data/deepSpace';

const SIZE = 256;

function noiseField(id: string) {
  let state = 2166136261;
  for (let i = 0; i < id.length; i++) state = Math.imul(state ^ id.charCodeAt(i), 16777619);
  const table = new Float32Array(64 * 64);
  for (let i = 0; i < table.length; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    table[i] = state / 4294967296;
  }
  return (x: number, y: number) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    let fx = x - ix, fy = y - iy;
    fx *= fx * (3 - 2 * fx);
    fy *= fy * (3 - 2 * fy);
    const row = (iy & 63) * 64, next = ((iy + 1) & 63) * 64;
    const left = ix & 63, right = (ix + 1) & 63;
    return (table[row + left] * (1 - fx) + table[row + right] * fx) * (1 - fy)
      + (table[next + left] * (1 - fx) + table[next + right] * fx) * fy;
  };
}

function gaussian(offset: number, width: number) {
  const d = offset / width;
  return Math.exp(-d * d);
}

function oval(x: number, y: number, width: number, height: number) {
  return Math.exp(-((x / width) ** 2 + (y / height) ** 2));
}

// Each texel is a face-on column. The ray marcher gives its old stars, young
// associations, absorbing dust and ionized gas (RGBA) separate vertical profiles.
export function createGalaxyDisc(id: string, appearance: GalaxyAppearance): THREE.DataTexture {
  const data = new Uint8Array(SIZE * SIZE * 4);
  const noise = noiseField(id);
  const pitches = appearance.armPitchAnglesDeg?.length ? appearance.armPitchAnglesDeg : [18];
  const winding = pitches.map(degrees => 1 / Math.max(0.05, Math.tan(THREE.MathUtils.degToRad(degrees))));
  const arms = appearance.armCount ?? 2;
  const contrast = appearance.armContrast ?? 0.4;
  const spiral = appearance.morphology === 'spiral' || appearance.morphology === 'barredSpiral';
  const irregular = appearance.morphology === 'irregular';
  const andromeda = id === 'andromeda_m31';
  const sombrero = id === 'm104_sombrero';
  const smallCloud = id === 'smc';

  for (let iy = 0; iy < SIZE; iy++) {
    const y = (iy + 0.5) * 2 / SIZE - 1;
    for (let ix = 0; ix < SIZE; ix++) {
      const x = (ix + 0.5) * 2 / SIZE - 1;
      const radius = Math.hypot(x, y);
      if (radius >= 1) continue;

      const broad = noise(x * 5.3, y * 5.3);
      const cloud = noise(x * 18 + broad * 1.6, y * 18 - broad);
      const grain = noise(x * 65, y * 65);
      const radial = Math.exp(-radius / Math.max(appearance.diskScale, 0.08));
      const patch = 0.15 + 0.85 * cloud;
      let old = radial * (0.47 + 0.1 * broad);
      let young = 0.05 * radial;
      let dust = radial * (0.07 + 0.13 * cloud);

      if (spiral) {
        const angle = Math.atan2(y, x);
        const logRadius = Math.log(Math.max(0.10, radius) / 0.55);
        const wobble = (broad - 0.5) * 0.58 + (cloud - 0.5) * 0.15;
        let ridge = 0, lane = 0, branches = 0;
        for (let arm = 0; arm < arms; arm++) {
          const phase = angle - winding[arm % winding.length] * logRadius - arm * 2 * Math.PI / arms + wobble;
          // One peak per arm. A displaced, narrower ridge puts dust along its inner edge.
          ridge = Math.max(ridge, Math.exp(11 * (Math.cos(phase) - 1)));
          lane = Math.max(lane, Math.exp(26 * (Math.cos(phase - 0.28) - 1)));
          const spur = phase + 1.1 * Math.sin(radius * 5 + arm) - 0.35 + 0.9 * (broad - 0.5);
          branches = Math.max(branches, Math.exp(14 * (Math.cos(spur) - 1)));
        }
        const armEnvelope = THREE.MathUtils.smoothstep(radius, andromeda ? 0.14 : 0.08, andromeda ? 0.35 : 0.22);
        ridge = ridge * (0.50 + 0.70 * broad) + 0.46 * branches * cloud;
        young += (1.05 + contrast) * ridge * armEnvelope * (0.30 + 0.70 * radial) * patch;
        dust += lane * armEnvelope * (0.50 + 0.44 * cloud);
        old += ridge * radial * contrast * 0.3;
        if (andromeda) {
          // The main dust ring is displaced slightly from the stellar nucleus.
          const ringRadius = Math.hypot(x + 0.045, y - 0.018) + 0.022 * (broad - 0.5);
          const innerLane = gaussian(ringRadius - 0.46, 0.042);
          const outerLane = gaussian(ringRadius - 0.70, 0.047);
          dust += (0.94 * innerLane + 0.70 * outerLane) * (0.68 + 0.32 * cloud);
          young = 0.36 * young + 0.37 * gaussian(ringRadius - 0.53, 0.07) * patch;
          old *= 0.74;
        }
        if (appearance.morphology === 'barredSpiral') old += 0.50 * oval(x, y, 0.46, 0.10);
      } else if (sombrero) {
        const ring = gaussian(radius - 0.61 - 0.012 * (broad - 0.5), 0.14);
        dust = (0.10 * radial + 0.95 * ring) * (0.72 + 0.28 * cloud);
        young += 0.20 * ring * patch;
      } else if (irregular) {
        // A displaced bar and one-sided stellar associations distinguish the
        // Magellanic Clouds. The smaller Cloud has a particularly extended wing.
        const bar = smallCloud
          ? oval(x + 0.20, y + 0.08 - 0.42 * x, 0.45, 0.19)
          : oval(x + 0.06, y - 0.15 + 0.24 * x, 0.57, 0.12);
        const wing = smallCloud
          ? oval(x - 0.42, y - 0.12 + 0.20 * x, 0.42, 0.18)
          : oval(x - 0.39, y + 0.02, 0.27, 0.26);
        const body = oval(x + 0.06, y + 0.05, 0.74, smallCloud ? 0.42 : 0.67);
        old = 0.84 * bar + 0.24 * body * (0.55 + broad);
        young = (0.27 * body + 0.79 * wing + 0.22 * bar) * (0.20 + 1.4 * broad) * patch;
        dust = (0.19 * body + 0.43 * wing) * patch;
      }

      const knots = THREE.MathUtils.smoothstep(0.64 * cloud + 0.36 * grain, 0.57, 0.88);
      const ionized = young * knots * (andromeda || sombrero ? 0.40 : 1.35);
      young *= 0.70 + 0.55 * grain;
      const index = 4 * (iy * SIZE + ix);
      data[index] = Math.round(255 * Math.min(1, old));
      data[index + 1] = Math.round(255 * Math.min(1, young));
      data[index + 2] = Math.round(255 * Math.min(1, dust));
      data[index + 3] = Math.round(255 * Math.min(1, ionized));
    }
  }

  const disc = new THREE.DataTexture(data, SIZE, SIZE);
  disc.name = id + ' disc densities';
  disc.magFilter = THREE.LinearFilter;
  disc.minFilter = THREE.LinearMipmapLinearFilter;
  disc.generateMipmaps = true;
  disc.needsUpdate = true;
  return disc;
}
