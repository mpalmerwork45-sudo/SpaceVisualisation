import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { SolSystemRenderer } from './SolSystemRenderer';
import { frameRotation } from '../utils/coordinates';
import { LY_PER_AU } from '../utils/ephemeris';
import { EARTH_CLOUD_RADIUS } from './PlanetMaterials';

describe('Solar System frame and GPU ownership', () => {
  it('defers maps until resolved, backs off failed loads, and reuses a successful load across rebuilds', () => {
    const requests: Array<{ texture: THREE.Texture; resolve: () => void; reject: () => void }> = [];
    const loader = vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation((_url, loaded, _progress, failed) => {
      const texture = new THREE.Texture<HTMLImageElement>();
      requests.push({
        texture,
        resolve: () => { texture.image = { width: 10, height: 10 } as HTMLImageElement; loaded?.(texture); },
        reject: () => failed?.(new Error('unavailable'))
      });
      return texture;
    });
    const now = vi.spyOn(performance, 'now').mockReturnValue(100);
    const system = new SolSystemRenderer();
    const camera = new THREE.PerspectiveCamera(60, 1, 1e-9, 1);
    const renderer = { getDrawingBufferSize: (size: THREE.Vector2) => size.set(600, 600) } as THREE.WebGLRenderer;
    const scene = new THREE.Scene();
    const draw = (distanceInRadii: number) => {
      const mesh = system.planetsMap.get('earth')!.mesh;
      camera.position.copy(mesh.position);
      camera.position.z += distanceInRadii * mesh.userData.displayRadius;
      camera.updateMatrixWorld();
      mesh.updateMatrixWorld();
      mesh.onBeforeRender(renderer, scene, camera, mesh.geometry, mesh.material, system.group);
    };
    try {
      draw(1000);
      expect(loader).not.toHaveBeenCalled();
      draw(7); draw(7);
      expect(loader).toHaveBeenCalledTimes(1);
      const failedDispose = vi.spyOn(requests[0].texture, 'dispose');
      requests[0].reject();
      draw(7);
      expect(loader).toHaveBeenCalledTimes(1);
      expect(failedDispose).toHaveBeenCalledOnce();
      now.mockReturnValue(16_000);
      draw(7);
      expect(loader).toHaveBeenCalledTimes(2);
      system.createSolSystem();
      requests[1].resolve();
      expect(system.planetsMap.get('earth')!.mesh.material.uniforms.uMapReady.value).toBe(true);
      system.createSolSystem();
      draw(7);
      expect(system.planetsMap.get('earth')!.mesh.material.uniforms.uSurfaceMap.value).toBe(requests[1].texture);
      expect(loader).toHaveBeenCalledTimes(2);
      const dispose = vi.spyOn(requests[1].texture, 'dispose');
      system.dispose();
      expect(dispose).toHaveBeenCalledOnce();
    } finally {
      system.dispose();
      now.mockRestore();
      loader.mockRestore();
    }
  });

  it('uses oblate figure geometry and keeps the Earth cloud deck above the surface', () => {
    const renderer = new SolSystemRenderer();
    const saturn = renderer.planetsMap.get('saturn')!;
    saturn.mesh.geometry.computeBoundingBox();
    const size = saturn.mesh.geometry.boundingBox!.getSize(new THREE.Vector3());
    expect(size.y / size.x).toBeCloseTo(54364 / 60268, 6);
    expect(size.z).toBeCloseTo(size.x, 12);
    const earth = renderer.planetsMap.get('earth')!;
    earth.mesh.geometry.computeBoundingBox();
    earth.clouds!.geometry.computeBoundingBox();
    const polarExtent = earth.mesh.geometry.boundingBox!.max.y;
    expect(earth.clouds!.geometry.boundingBox!.max.y / polarExtent).toBeCloseTo(EARTH_CLOUD_RADIUS, 6);
    expect(earth.clouds!.material.uniforms.uSun).toBe(earth.mesh.material.uniforms.uSun);
    expect(earth.clouds!.material.uniforms.uTime).toBe(earth.mesh.material.uniforms.uTime);
    renderer.dispose();
  });

  it('holds the pole fixed and rotates the prime meridian with the simulation date', () => {
    const noon = new Date('2000-01-01T12:00:00Z');
    const renderer = new SolSystemRenderer(noon);
    renderer.setPlaneAlignment('equatorial');
    const earth = renderer.planetsMap.get('earth')!.mesh;
    const up = new THREE.Vector3(0, 1, 0);
    const prime = new THREE.Vector3(1, 0, 0);
    const q = earth.getWorldQuaternion(new THREE.Quaternion());
    const meridian = prime.clone().applyQuaternion(q);
    expect(up.clone().applyQuaternion(q).distanceTo(up)).toBeLessThan(1e-10);
    expect(THREE.MathUtils.euclideanModulo(THREE.MathUtils.radToDeg(Math.atan2(-meridian.z, meridian.x)), 360)).toBeCloseTo(280.147, 6);
    renderer.updateDate(new Date('2000-01-01T18:00:00Z'));
    const later = earth.getWorldQuaternion(new THREE.Quaternion());
    expect(up.clone().applyQuaternion(later).distanceTo(up)).toBeLessThan(1e-10);
    expect(THREE.MathUtils.radToDeg(meridian.angleTo(prime.applyQuaternion(later)))).toBeCloseTo(360.9856235 / 4, 6);
    renderer.updateDate(noon);
    expect(earth.getWorldQuaternion(later).angleTo(q)).toBeLessThan(1e-7);
    renderer.dispose();
  });

  it('moves planets and updates Saturn’s ring shadow in place at a new date', () => {
    const renderer = new SolSystemRenderer(new Date('2024-01-04T00:00:00Z'));
    renderer.setPlaneAlignment('galactic');
    const earth = renderer.planetsMap.get('earth')!;
    const saturn = renderer.planetsMap.get('saturn')!;
    const original = earth.mesh.position.clone();
    const orbit = earth.orbitLine.geometry;
    const ringGeometry = saturn.rings!.geometry;
    renderer.updateDate(new Date('2024-07-04T00:00:00Z'));
    expect(earth.mesh.position.distanceTo(original) / LY_PER_AU).toBeGreaterThan(1.9);
    expect(renderer.planetsMap.get('earth')).toBe(earth);
    expect(earth.orbitLine.geometry).toBe(orbit);
    expect(saturn.rings!.geometry).toBe(ringGeometry);

    const worldSun = saturn.mesh.getWorldPosition(new THREE.Vector3()).normalize().negate();
    expect(saturn.mesh.material.uniforms.uSun.value.distanceTo(worldSun)).toBeLessThan(1e-12);
    const ringSun = (saturn.rings!.material.uniforms.uSun.value as THREE.Vector3).clone()
      .applyQuaternion(saturn.rings!.getWorldQuaternion(new THREE.Quaternion()));
    expect(ringSun.distanceTo(worldSun)).toBeLessThan(1e-12);
    renderer.dispose();
  });

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
    expect(resources).toHaveLength(40); // 9 bodies, 9 orbits, Earth's clouds and Saturn's rings.
    disposed.forEach(callback => expect(callback).toHaveBeenCalledOnce());
    expect(renderer.orbitsVisible).toBe(true);
    expect(renderer.group.quaternion.angleTo(frameRotation('ecliptic','galactic'))).toBeLessThan(1e-7);
    renderer.dispose(); renderer.dispose();
    disposed.forEach(callback => expect(callback).toHaveBeenCalledOnce());
  });
});
