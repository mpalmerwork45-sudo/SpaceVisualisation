import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { DUST_CLOUDS, DUST_GRID, DUST_HEIGHT, DUST_WIDTH, coveredRadialDistance, prepareLocalClouds, prepareLocalDust } from './LocalDustGrid';
import { LocalDustVolume } from './LocalDustVolume';

describe('measured Galactic extinction', () => {
  it('keeps independent cloud columns at different distances in their own texture layers', () => {
    const { width, height, regions } = DUST_CLOUDS;
    const { radius, nearKpc, farKpc } = DUST_GRID;
    const size = width*height*radius;
    const source = new Uint8Array(size*regions.length);
    const cell = 38 * width + 53;
    const shells = [8, 34];
    shells.forEach((shell, region) => { source[region*size + shell*width*height + cell] = 153; });
    const atlas = prepareLocalClouds(source);
    const sample = (region: number, shell: number, channel: number) =>
      THREE.DataUtils.fromHalfFloat(atlas[2*(region*size + shell*width*height + cell) + channel]);
    const edge = (i: number) => nearKpc*(farKpc/nearKpc)**(i/radius);
    for (const [region,shell] of shells.entries()) {
      const delta = coveredRadialDistance(edge(shell+1)) - coveredRadialDistance(edge(shell));
      expect(sample(region,shell-1,1)).toBe(0);
      expect(sample(region,shell,1)).toBeCloseTo(sample(region,shell,0)*delta,3);
      expect(sample(region,radius-1,1)).toBe(sample(region,shell,1));
      expect(sample(region,shell+1,0)).toBe(0);
    }
  });

  it('retains the all-sky data when a cloud request fails and retries only the missing texture', async () => {
    class MockWorker {
      onmessage?: (event: { data: ArrayBuffer }) => void;
      postMessage() { this.onmessage?.({ data: new ArrayBuffer(4) }); }
      terminate() {}
    }
    vi.stubGlobal('Worker', MockWorker);
    const dust = new LocalDustVolume();
    const fetch = vi.spyOn(globalThis,'fetch')
      .mockResolvedValueOnce(new Response(new ArrayBuffer(4)))
      .mockResolvedValueOnce(new Response(null,{status:503}))
      .mockResolvedValueOnce(new Response(new ArrayBuffer(4)));
    const warn = vi.spyOn(console,'warn').mockImplementation(() => {});
    try {
      expect(await dust.load()).toBe(true);
      const map = dust.uniforms.uLocalDust.value!;
      expect(dust.uniforms.uCloudsReady.value).toBe(false);
      expect(await dust.load()).toBe(true);
      expect(fetch).toHaveBeenCalledTimes(3);
      expect(dust.uniforms.uLocalDust.value).toBe(map);
      expect(dust.uniforms.uCloudsReady.value).toBe(true);
      const patch = dust.uniforms.uLocalDustClouds.value!;
      expect(patch.wrapS).toBe(THREE.ClampToEdgeWrapping);
      const disposed = vi.fn();
      patch.addEventListener('dispose', disposed);
      dust.dispose();
      expect(disposed).toHaveBeenCalledOnce();
      expect(dust.uniforms.uCloudsReady.value).toBe(false);
    } finally { fetch.mockRestore(); warn.mockRestore(); vi.unstubAllGlobals(); dust.dispose(); }
  });
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
