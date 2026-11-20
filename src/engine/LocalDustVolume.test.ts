import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { DUST_GRID, DUST_HEIGHT, DUST_WIDTH, coveredRadialDistance, prepareLocalDust } from './LocalDustGrid';
import { LocalDustVolume } from './LocalDustVolume';

describe('measured Galactic extinction', () => {
  it('conserves the measured voxel mean while subdividing a cloud, and integrates only to the source distance', () => {
    const { longitude: nx, latitude: ny, radius: nz, nearKpc, farKpc } = DUST_GRID;
    const source = new Uint8Array(nx*ny*nz);
    const x = 215, y = 63, k = 23;
    source[(k*ny+y)*nx+x] = 135;
    const grid = prepareLocalDust(source);
    const at = (dx: number, dy: number, z: number, channel: number) => {
      const index = ((z*DUST_HEIGHT + y*2+dy)*DUST_WIDTH + x*2+dx)*2 + channel;
      return THREE.DataUtils.fromHalfFloat(grid[index]);
    };
    const density = 0.125*(2**(12*135/255)-1);
    let weighted = 0, sum = 0;
    const children = [];
    const lo = nearKpc*(farKpc/nearKpc)**(k/nz);
    const hi = nearKpc*(farKpc/nearKpc)**((k+1)/nz);
    for (let dy=0; dy<2; dy++) for (let dx=0; dx<2; dx++) {
      const area = Math.cos(Math.PI*((y*2+dy+0.5)/DUST_HEIGHT-0.5));
      const d = at(dx,dy,k,0);
      weighted += area*d;
      sum += area;
      children.push(d);
      expect(at(dx,dy,k-1,1)).toBe(0);
      expect(at(dx,dy,k,1)).toBeCloseTo(d*(hi-lo),3);
      expect(at(dx,dy,k+1,1)).toBe(at(dx,dy,k,1));
    }
    expect(new Set(children).size).toBeGreaterThan(1);
    expect(weighted/sum).toBeCloseTo(density,2);
    expect(coveredRadialDistance(0.04)).toBe(0);
    expect(coveredRadialDistance(3)).toBeCloseTo(coveredRadialDistance(farKpc),10);
    expect(coveredRadialDistance(0.3)-coveredRadialDistance(0.2)).toBeCloseTo(0.1,10);
  });

  it('retains analytic rendering after a failed request and allows a later load', async () => {
    const dust = new LocalDustVolume();
    const request = vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(null,{status:503}));
    const warn = vi.spyOn(console,'warn').mockImplementation(() => {});
    try {
      const a = dust.load(), b = dust.load();
      expect(a).toBe(b);
      expect(await a).toBe(false);
      expect(dust.uniforms.uSurveyReady.value).toBe(false);
      expect(await dust.load()).toBe(false);
      expect(request).toHaveBeenCalledTimes(2);
      dust.dispose();
      expect(await dust.load()).toBe(false);
      expect(request).toHaveBeenCalledTimes(2);
    } finally { request.mockRestore(); warn.mockRestore(); dust.dispose(); }
  });
});
