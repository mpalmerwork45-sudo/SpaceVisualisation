import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { SpaceEngine } from './SpaceEngine';
import { equatorialToCartesian, equatorialToEcliptic, inwardViewDirection } from '../utils/coordinates';
import { LY_PER_AU } from '../utils/ephemeris';

// Exercise the real preset logic without requiring a WebGL context.
function cameraHarness(): SpaceEngine {
  return Object.assign(Object.create(SpaceEngine.prototype), {
    targetCameraTarget: new THREE.Vector3(20, 30, 40),
    targetCameraRadius: 85,
    targetCameraRoll: 1,
    cameraTarget: new THREE.Vector3(20,30,40),
    cameraRadius: 0.0003,
    cameraTheta: 1,
    cameraPhi: 1.2,
    cameraRoll: 0,
    cameraFov: 55,
    camera: new THREE.PerspectiveCamera(55,1,1e-11,1e8),
    viewMode: 'linear',
    planeAlignment: 'ecliptic',
    solSystemRenderer: { group: { visible: true } },
    milkyWay: { setPlaneAlignment: vi.fn() },
    starField: { setPlaneAlignment: vi.fn() },
    gridRenderer: { setRingsVisible: vi.fn(), setGridVisible: vi.fn() },
    rebuildAllData: vi.fn()
  });
}

describe('Solar System opening/reset preset', () => {
  it('faces the Galactic centre in the planetary coordinate frame', () => {
    const engine = cameraHarness();
    engine.setPresetViewpoint('sol_center');
    const sightline = inwardViewDirection(engine.targetCameraTheta, engine.targetCameraPhi);
    // Independent ICRS anchor for l=0, b=0, rather than the preset transform.
    const centre = equatorialToEcliptic(equatorialToCartesian(17.7607, -28.9362, 1));
    expect(sightline.distanceTo(centre)).toBeLessThan(1e-4);
    expect(engine.planeAlignment).toBe('ecliptic');
  });

  it('returns to a close, centred planetary view after a distant preset', () => {
    const engine = cameraHarness();
    engine.setPresetViewpoint('galactic_center');
    engine.setPresetViewpoint('sol_center');
    expect(engine.targetCameraTarget.length()).toBe(0);
    expect(engine.targetCameraRadius / LY_PER_AU).toBeGreaterThan(10);
    expect(engine.targetCameraRadius / LY_PER_AU).toBeLessThan(25);
    expect(engine.targetCameraRoll).toBe(0);
    expect(engine.targetCameraFov).toBe(55);
    expect(engine.viewMode).toBe('linear');
    expect(engine.gridRenderer.setRingsVisible).toHaveBeenLastCalledWith(false);
  });

  it('turns toward the bulge without moving the observer or changing focus and zoom', () => {
    const engine = cameraHarness();
    engine.updateCameraPosition();
    const before = engine.camera.position.clone();
    const focus = engine.cameraTarget.clone();
    engine.setPresetViewpoint('galactic_center');
    engine.updateCameraPosition();
    expect(engine.camera.position.distanceTo(before)).toBeLessThan(1e-12);
    expect(engine.targetCameraTarget.distanceTo(focus)).toBe(0);
    expect(engine.targetCameraRadius).toBe(engine.cameraRadius);
    expect(engine.targetCameraFov).toBe(engine.cameraFov);
    expect(engine.planeAlignment).toBe('ecliptic');
    expect(engine.rebuildAllData).not.toHaveBeenCalled();
    const centre = equatorialToEcliptic(equatorialToCartesian(17.7607,-28.9362,26700));
    const expected = centre.sub(before).normalize();
    expect(engine.camera.getWorldDirection(new THREE.Vector3()).distanceTo(expected)).toBeLessThan(1e-4);
  });
});
