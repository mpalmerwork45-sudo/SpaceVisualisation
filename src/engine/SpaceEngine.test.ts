import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { SpaceEngine } from './SpaceEngine';
import { equatorialToCartesian, equatorialToEcliptic, frameRotation, inwardViewDirection, orbitOffset } from '../utils/coordinates';
import { LY_PER_AU } from '../utils/ephemeris';
import { StarRenderer } from './StarRenderer';
import { SolSystemRenderer } from './SolSystemRenderer';
import { ConstellationRenderer } from './ConstellationRenderer';
import { STARS_CATALOG } from '../data/stars';

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
    targetCameraTheta: 1,
    targetCameraPhi: 1.2,
    skyLookDirection: null,
    spectralFilter: 'ALL',
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

  it('reverses a polar sightline in place and restores it on a second turn', () => {
    const engine = cameraHarness();
    engine.cameraPhi = 0.0001;
    engine.cameraRoll = 0.3;
    engine.updateCameraPosition();
    const origin = engine.camera.position.clone();
    const heading = engine.camera.getWorldDirection(new THREE.Vector3());
    const expected = heading.clone().negate();
    engine.turnAround180();
    engine.updateCameraPosition();
    expect(engine.camera.position.distanceTo(origin)).toBeLessThan(1e-12);
    expect(engine.camera.getWorldDirection(new THREE.Vector3()).distanceTo(expected)).toBeLessThan(1e-10);
    expect(engine.targetCameraRoll).toBe(0.3);
    engine.turnAround180();
    engine.updateCameraPosition();
    expect(engine.camera.getWorldDirection(new THREE.Vector3()).distanceTo(heading)).toBeLessThan(1e-10);
  });

  it('changes orbit elevation and optical framing independently of focus distance', () => {
    const engine = cameraHarness();
    const target = engine.targetCameraTarget.clone();
    const distance = engine.targetCameraRadius;
    const heading = engine.targetCameraTheta;
    engine.setOrbitElevation(75);
    engine.setFieldOfView(0.1);
    expect(engine.targetCameraPhi).toBeCloseTo(Math.PI/12,8);
    expect(engine.targetCameraRadius).toBe(distance);
    expect(engine.targetCameraTarget.distanceTo(target)).toBe(0);
    expect(engine.targetCameraTheta).toBe(heading);
    expect(engine.targetCameraFov).toBe(0.1);
    engine.setFieldOfView(NaN);
    expect(engine.targetCameraFov).toBe(0.1);
    engine.setFieldOfView(200);
    expect(engine.targetCameraFov).toBe(90);
  });
});

describe('frame and catalogue state regressions', () => {
  it('transforms current and gliding camera anchors, orbit offsets, heading and roll together', () => {
    const engine = cameraHarness();
    engine.cameraRoll = 0.35;
    engine.targetCameraRadius = 12;
    engine.targetCameraTheta = 2.4;
    engine.targetCameraPhi = 0.6;
    engine.targetCameraTarget.set(13, 2, 5);
    engine.updateCameraPosition();
    const position = engine.camera.position.clone();
    const direction = engine.camera.getWorldDirection(new THREE.Vector3());
    const up = new THREE.Vector3(0,1,0).applyQuaternion(engine.camera.quaternion);
    const target = engine.targetCameraTarget.clone();
    const futureOffset = orbitOffset(12,2.4,0.6);
    const rotation = frameRotation('ecliptic', 'galactic');
    engine.setPlaneAlignment('galactic');
    expect(engine.camera.position.distanceTo(position.applyQuaternion(rotation))).toBeLessThan(1e-12);
    expect(engine.camera.getWorldDirection(new THREE.Vector3()).distanceTo(direction.applyQuaternion(rotation))).toBeLessThan(1e-10);
    expect(new THREE.Vector3(0,1,0).applyQuaternion(engine.camera.quaternion).distanceTo(up.applyQuaternion(rotation))).toBeLessThan(1e-10);
    expect(engine.targetCameraTarget.distanceTo(target.applyQuaternion(rotation))).toBeLessThan(1e-12);
    expect(orbitOffset(12,engine.targetCameraTheta,engine.targetCameraPhi).distanceTo(futureOffset.applyQuaternion(rotation))).toBeLessThan(1e-12);
    expect(engine.cameraRadius).toBe(0.0003);
    expect(engine.targetCameraRadius).toBe(12);
    engine.setPlaneAlignment('ecliptic');
    expect(engine.targetCameraTarget.distanceTo(new THREE.Vector3(13,2,5))).toBeLessThan(1e-12);
  });

  it('preserves turn-in-place sky direction through frame changes', () => {
    const engine = cameraHarness();
    engine.updateCameraPosition();
    engine.setPresetViewpoint('galactic_center');
    engine.updateCameraPosition();
    const direction = engine.camera.getWorldDirection(new THREE.Vector3());
    engine.setPlaneAlignment('galactic');
    expect(engine.camera.getWorldDirection(new THREE.Vector3()).distanceTo(direction.applyQuaternion(frameRotation('ecliptic','galactic')))).toBeLessThan(1e-10);
  });

  it('resolves filtered-out stars by catalogue ID in the current mode and frame', () => {
    const engine = cameraHarness();
    engine.starRenderer = new StarRenderer();
    engine.starRenderer.updateStars('realistic','ecliptic','G');
    engine.viewMode = 'realistic';
    const old = engine.resolveSelection('star','sirius_a')!;
    expect(old.position.length()).toBeCloseTo(1200);
    engine.viewMode = 'logarithmic';
    engine.planeAlignment = 'galactic';
    const current = engine.resolveSelection('star','sirius_a')!;
    expect(current.position.length()).toBeCloseTo(40*Math.log(1+8.6/10));
    expect(engine.starRenderer.starsMap.has('sirius_a')).toBe(false);
    expect(engine.resolveSelection('star','missing')).toBeNull();
    engine.starRenderer.updateStars('linear','ecliptic','NONE');
  });

  it('retains the active spectral filter on mode, alignment and preset rebuilds', () => {
    const engine = cameraHarness();
    engine.starRenderer = new StarRenderer();
    engine.constellationRenderer = new ConstellationRenderer();
    engine.solSystemRenderer = new SolSystemRenderer();
    engine.deepSpaceRenderer = { updateDeepSpace: vi.fn() } as any;
    engine.gridRenderer.updateGrid = vi.fn();
    engine.rebuildAllData = SpaceEngine.prototype.rebuildAllData;
    engine.setSpectralFilter('G');
    engine.setViewMode('logarithmic');
    engine.setPlaneAlignment('galactic');
    engine.setPresetViewpoint('sol_center');
    expect([...engine.starRenderer.starsMap.values()].every(node => node.data.spectral.startsWith('G'))).toBe(true);
    expect(engine.starRenderer.starsMap.size).toBe(STARS_CATALOG.filter(star => star.spectral.startsWith('G')).length);
    engine.solSystemRenderer.dispose();
    engine.starRenderer.updateStars('linear','ecliptic','NONE');
  });
});
