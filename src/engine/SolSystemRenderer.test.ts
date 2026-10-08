import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { SolSystemRenderer } from './SolSystemRenderer';
import { frameRotation } from '../utils/coordinates';

describe('Solar System frame and GPU ownership', () => {
  it('rotates planets, orbit paths and world-space sunlight by the same basis change', () => {
    const renderer = new SolSystemRenderer();
    const earth = renderer.planetsMap.get('earth')!;
    const original = earth.mesh.getWorldPosition(new THREE.Vector3());
    const orbitPoint = new THREE.Vector3().fromBufferAttribute(earth.orbitLine.geometry.getAttribute('position'),0);
    const rotation = frameRotation('ecliptic','galactic');
    renderer.setPlaneAlignment('galactic');
    expect(earth.mesh.getWorldPosition(new THREE.Vector3()).distanceTo(original.clone().applyQuaternion(rotation))).toBeLessThan(1e-16);
    expect(earth.orbitLine.localToWorld(orbitPoint.clone()).distanceTo(orbitPoint.applyQuaternion(rotation))).toBeLessThan(1e-16);
    expect((earth.mesh.material as THREE.ShaderMaterial).uniforms.uSun.value.distanceTo(original.negate().normalize().applyQuaternion(rotation))).toBeLessThan(1e-12);
    renderer.dispose();
  });

  it('disposes every old geometry and material including rings, retaining alignment and orbit visibility', () => {
    const renderer = new SolSystemRenderer();
    renderer.setOrbitsVisible(true);
    renderer.setPlaneAlignment('galactic');
    const resources: Array<THREE.BufferGeometry | THREE.Material> = [];
    renderer.group.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
        resources.push(object.geometry, ...[object.material].flat());
      }
    });
    const disposed = resources.map(resource => {
      const callback = vi.fn(); resource.addEventListener('dispose',callback); return callback;
    });
    renderer.createSolSystem(new Date('2026-10-08T00:00:00Z'));
    expect(resources).toHaveLength(38); // 9 bodies (including Pluto), 9 orbits and Saturn's rings.
    disposed.forEach(callback => expect(callback).toHaveBeenCalledOnce());
    expect(renderer.orbitsVisible).toBe(true);
    expect(renderer.group.quaternion.angleTo(frameRotation('ecliptic','galactic'))).toBeLessThan(1e-7);
    renderer.dispose(); renderer.dispose();
    disposed.forEach(callback => expect(callback).toHaveBeenCalledOnce());
  });
});
