import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { StarFieldBackground } from './StarFieldBackground';

describe('synthetic stellar populations', () => {
  it('is deterministic and concentrates stars toward the bulge rather than a uniform band', () => {
    const a = new StarFieldBackground(5000), b = new StarFieldBackground(5000);
    const positions = a.points.geometry.getAttribute('position');
    expect(positions.array).toEqual(b.points.geometry.getAttribute('position').array);
    let centre = 0, anticentre = 0;
    for (let i = 0; i < positions.count; i++) {
      const longitude = Math.atan2(positions.getZ(i), positions.getX(i));
      if (Math.abs(longitude) < Math.PI / 9) centre++;
      if (Math.abs(longitude) > Math.PI * 8 / 9) anticentre++;
      expect(Number.isFinite(positions.getY(i))).toBe(true);
    }
    expect(centre).toBeGreaterThan(anticentre * 5);
    a.dispose(); b.dispose();
  });

  it('switches the stellar eye response without rebuilding or leaking geometry', () => {
    const field = new StarFieldBackground(10);
    const geometry = field.points.geometry;
    const material = field.points.material as THREE.ShaderMaterial;
    field.setObservationMode('enhancedOptical');
    expect(material.uniforms.uEyeAdapted.value).toBe(0);
    field.setObservationMode('darkAdaptedEye');
    expect(material.uniforms.uEyeAdapted.value).toBe(1);
    expect(field.points.geometry).toBe(geometry);
    const disposed = vi.fn();
    geometry.addEventListener('dispose', disposed);
    field.dispose();
    expect(disposed).toHaveBeenCalledOnce();
  });
});
