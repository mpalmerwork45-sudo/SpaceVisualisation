import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { DEEP_SPACE_OBJECTS } from '../data/deepSpace';
import { createGalaxyDisc } from './GalaxyDisc';
import { GalaxyRenderer } from './GalaxyRenderer';
import { equatorialToCartesian } from '../utils/coordinates';

describe('galaxy disc populations', () => {
  it.each(['andromeda_m31', 'm104_sombrero'])('puts a dust lane around the nucleus of %s', id => {
    const galaxy = DEEP_SPACE_OBJECTS.find(object => object.id === id)!;
    const disc = createGalaxyDisc(id, galaxy.galaxy!);
    const { width, data } = disc.image;
    const radius = id === 'andromeda_m31' ? 0.46 : 0.61;
    const dust = (x: number, y: number) => {
      const ix = Math.floor((x + 1) * 0.5 * width), iy = Math.floor((y + 1) * 0.5 * width);
      return (data as Uint8Array)[4 * (iy * width + ix) + 2];
    };
    let ringSum = 0;
    for (let i = 0; i < 32; i++) {
      const angle = 2 * Math.PI * i / 32;
      ringSum += dust(radius * Math.cos(angle), radius * Math.sin(angle));
    }
    expect(ringSum / 32).toBeGreaterThan(2 * dust(0, 0));
    disc.dispose();
  });

  it('keeps filtered density maps across view changes and releases them on disposal', () => {
    const renderer = new GalaxyRenderer();
    const galaxy = DEEP_SPACE_OBJECTS.find(object => object.id === 'lmc')!;
    const position = equatorialToCartesian(galaxy.ra, galaxy.dec, galaxy.dist);
    const getDisc = (mesh: THREE.Mesh) => (mesh.material as THREE.ShaderMaterial).uniforms.uDisc.value as THREE.DataTexture;
    const first = getDisc(renderer.createGalaxy(galaxy, 'linear', 'equatorial', position).mesh);
    const disposed = vi.fn();
    first.addEventListener('dispose', disposed);
    renderer.clear();
    const second = getDisc(renderer.createGalaxy(galaxy, 'realistic', 'equatorial', position.clone().setLength(1200)).mesh);
    expect(second).toBe(first);
    expect(second.generateMipmaps).toBe(true);
    expect(disposed).not.toHaveBeenCalled();
    renderer.dispose();
    expect(disposed).toHaveBeenCalledOnce();
  });
});
