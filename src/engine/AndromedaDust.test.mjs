import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { DEEP_SPACE_OBJECTS } from '../data/deepSpace';
import { equatorialToCartesian } from '../utils/coordinates';
import { createAndromedaDust } from './AndromedaDust';
import { GalaxyRenderer } from './GalaxyRenderer';

function andromedaSurvey() {
  const bytes = readFileSync(new URL('../../public/data/andromeda-dust.bin', import.meta.url));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

describe('Andromeda dust survey', () => {
  it('shares one in-flight atlas across a scene rebuild and frees it at disposal', async () => {
    vi.stubGlobal('window', {});
    const fetchAtlas = vi.fn(async () => new Response(andromedaSurvey()));
    vi.stubGlobal('fetch', fetchAtlas);
    const renderer = new GalaxyRenderer();
    try {
      const obj = DEEP_SPACE_OBJECTS.find(dso => dso.id === 'andromeda_m31');
      const centre = equatorialToCartesian(obj.ra, obj.dec, 1200);
      const create = () => renderer.createGalaxy(obj, 'realistic', 'equatorial', centre).mesh.material.uniforms;
      const first = create();
      renderer.clear();
      const second = create();
      await vi.waitFor(() => expect(second.uUseDustAtlas.value).toBe(true));
      expect(fetchAtlas).toHaveBeenCalledOnce();
      expect(first.uDustAtlas.value).toBe(second.uDustAtlas.value);
      const disposed = vi.fn();
      second.uDustAtlas.value.addEventListener('dispose', disposed);
      renderer.dispose();
      expect(disposed).toHaveBeenCalledOnce();
    } finally {
      renderer.dispose();
      vi.unstubAllGlobals();
    }
  });

  it('preserves every measured optical depth under procedural subdivision and mip filtering', () => {
    const raw = andromedaSurvey();
    const atlas = createAndromedaDust(raw);
    const header = new DataView(raw);
    const size = header.getUint16(6, true);
    const weight = new Uint8Array(raw, 8 + size * size * 2);
    const { width, data } = atlas.image;
    let largestError = 0;
    for (let i = 0; i < weight.length; i++) {
      const column = THREE.DataUtils.fromHalfFloat(header.getUint16(8 + i * 2, true)) * weight[i] / 255;
      const origin = 2 * (2 * Math.floor(i / size) * width + 2 * (i % size));
      let mean = 0;
      for (const offset of [0, 2, 2 * width, 2 * width + 2]) {
        mean += THREE.DataUtils.fromHalfFloat(data[origin + offset]) / 4;
      }
      largestError = Math.max(largestError, Math.abs(mean - column) / Math.max(0.001, column));
    }
    expect(largestError).toBeLessThan(0.001);
    expect(atlas.generateMipmaps).toBe(true);
    atlas.dispose();
  });

  it('places two contrasting SPIRE fields at their observed ICRS positions with the northwest side nearer Sol', () => {
    const obj = DEEP_SPACE_OBJECTS.find(dso => dso.id === 'andromeda_m31');
    const renderer = new GalaxyRenderer();
    const centre = equatorialToCartesian(obj.ra, obj.dec, 1200);
    const { mesh } = renderer.createGalaxy(obj, 'realistic', 'equatorial', centre);
    const n = new THREE.Vector3(0,0,1).applyQuaternion(mesh.quaternion);
    const northWest = mesh.localToWorld(new THREE.Vector3(0,-0.5,0));
    const southEast = mesh.localToWorld(new THREE.Vector3(0,0.5,0));
    expect(northWest.length()).toBeLessThan(southEast.length());
    const raw = andromedaSurvey();
    const map = new DataView(raw);
    const size = map.getUint16(6, true);
    function projectedColumn(ra, dec) {
      const dir = equatorialToCartesian(ra / 15, dec, 1);
      const hit = mesh.worldToLocal(dir.clone().multiplyScalar(n.dot(centre) / dir.dot(n)));
      const x = Math.floor((hit.x + 1) * size / 2);
      const y = Math.floor((hit.y + 1) * size / 2);
      return THREE.DataUtils.fromHalfFloat(map.getUint16(8 + 2 * (y * size + x), true));
    }
    // Original WCS pixels (483,834) and (825,377) have projected dust mass
    // 719700 and 125000 Msol/kpc². Allow for area averaging into disc cells.
    expect(projectedColumn(11.32062, 41.90715)).toBeCloseTo(0.42, 1);
    expect(projectedColumn(10.06007, 40.63761)).toBeCloseTo(0.08, 1);
    renderer.dispose();
  });
});
