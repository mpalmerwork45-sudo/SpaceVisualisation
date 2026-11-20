import { DataUtils } from 'three';

// Heliocentric Galactic longitude, latitude and logarithmic radius.
export const DUST_GRID = {
  longitude: 256, latitude: 128, radius: 64,
  nearKpc: 0.069, farKpc: 1.25
} as const;
export const DUST_WIDTH = 2 * DUST_GRID.longitude;
export const DUST_HEIGHT = 2 * DUST_GRID.latitude;
export const DUST_LOG_RANGE = Math.log(DUST_GRID.farKpc / DUST_GRID.nearKpc);
const taperWidthBins = 2;
export const DUST_INNER_END = DUST_GRID.nearKpc * Math.exp(taperWidthBins * DUST_LOG_RANGE / DUST_GRID.radius);
export const DUST_OUTER_START = DUST_GRID.farKpc * Math.exp(-taperWidthBins * DUST_LOG_RANGE / DUST_GRID.radius);

function rampIntegral(radius: number, lo: number, hi: number) {
  const t = Math.max(0, Math.min(1, (radius - lo) / (hi - lo)));
  return (hi - lo) * t ** 3 * (1 - 0.5 * t) + Math.max(0, radius - hi);
}

export function coveredRadialDistance(r: number) {
  return rampIntegral(r, DUST_GRID.nearKpc, DUST_INNER_END) - rampIntegral(r, DUST_OUTER_START, DUST_GRID.farKpc);
}

// A monotonically limited slope reconstructs gradients without overshoot into empty cells.
function slope(left: number, centre: number, right: number) {
  const a = centre - left, b = right - centre;
  return a * b <= 0 ? 0 : Math.sign(a) * Math.min(Math.abs(a), Math.abs(b));
}

function filament(x: number, y: number, z: number) {
  // Two folded sheets with different orientations and lengths in physical kpc.
  const bend = 1.7 * Math.sin(17*x + 9*z) + 0.9 * Math.sin(21*z - 14*y);
  const ridge = 1 - Math.abs(Math.sin(42*x + 79*y + 15*z + bend));
  const spur = 1 - Math.abs(Math.sin(17*x - 33*y + 58*z + Math.sin(18*x - 23*y)));
  return 0.9 * ridge * ridge + 0.4 * spur * spur;
}

/** RG16F stores differential visual optical depth per kpc and cumulative optical depth
 * at each radial bin's far edge. The latter integrates exactly from Sol in one lookup. */
export function prepareLocalDust(source: Uint8Array) {
  const { longitude: nx, latitude: ny, radius: nz } = DUST_GRID;
  if (source.length !== nx * ny * nz) throw new Error('Unexpected local dust data length');
  const area = DUST_WIDTH * DUST_HEIGHT;
  const output = new Uint16Array(area * nz * 2);
  const column = new Float32Array(area);
  const decoded = Float64Array.from({ length: 256 }, (_, i) => 0.125 * (2 ** (12 * i / 255) - 1));
  const directions = new Float32Array(3 * area);
  const angles = new Float64Array(DUST_HEIGHT);
  const fine = new Float64Array(4);
  for (let iy = 0; iy < DUST_HEIGHT; iy++) {
    const lat = Math.PI * ((iy + 0.5) / DUST_HEIGHT - 0.5);
    const cosLat = Math.cos(lat);
    angles[iy] = cosLat; // proportional to exact solid angle in an equal-latitude grid
    for (let ix = 0; ix < DUST_WIDTH; ix++) {
      const lon = 2 * Math.PI * (ix + 0.5) / DUST_WIDTH;
      const j = 3 * (iy * DUST_WIDTH + ix);
      directions[j] = Math.cos(lon) * cosLat;
      directions[j + 1] = Math.sin(lat);
      directions[j + 2] = -Math.sin(lon) * cosLat;
    }
  }

  for (let iz = 0; iz < nz; iz++) {
    const lo = DUST_GRID.nearKpc * Math.exp(iz * DUST_LOG_RANGE / nz);
    const hi = DUST_GRID.nearKpc * Math.exp((iz + 1) * DUST_LOG_RANGE / nz);
    const r = (hi + lo) / 2;
    const length = coveredRadialDistance(hi) - coveredRadialDistance(lo);
    const plane = iz * nx * ny;
    for (let y = 0; y < ny; y++) {
      const a = angles[2*y], b = angles[2*y+1];
      for (let x = 0; x < nx; x++) {
        const coarse = plane + y*nx + x;
        const mean = decoded[source[coarse]];
        const gx = slope(decoded[source[plane + y*nx + (x+nx-1)%nx]], mean, decoded[source[plane + y*nx + (x+1)%nx]]);
        const gy = slope(decoded[source[plane + Math.max(0,y-1)*nx + x]], mean, decoded[source[plane + Math.min(ny-1,y+1)*nx + x]]);
        let weightedMean = 0;
        for (let child = 0; child < 4; child++) {
          const dx = child % 2, dy = child >> 1;
          const j = 3 * ((2*y + dy)*DUST_WIDTH + 2*x + dx);
          const structure = filament(directions[j]*r, directions[j+1]*r, directions[j+2]*r);
          fine[child] = (mean + (dx-0.5)*0.5*gx + (dy-0.5)*0.5*gy) * (0.72 + structure);
          weightedMean += fine[child] * (dy ? b : a);
        }
        // Only redistribute the dust the survey actually assigned to this cell.
        const normalization = weightedMean > 0 ? mean * (2*(a+b) / weightedMean) : 0;
        for (let child = 0; child < 4; child++) {
          const index = (2*y + (child >> 1))*DUST_WIDTH + 2*x + child%2;
          const density = fine[child] * normalization;
          column[index] += density * length;
          const dest = 2 * (iz*area + index);
          output[dest] = DataUtils.toHalfFloat(density);
          output[dest+1] = DataUtils.toHalfFloat(column[index]);
        }
      }
    }
  }
  return output;
}
