import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  angularDiameterToWorldSize,
  celestialTangentBasis,
  equatorialToCartesian,
  equatorialToEcliptic,
  equatorialToGalactic,
  galacticFrameQuaternion,
  galacticToEquatorial,
  inwardViewDirection,
  orbitOffset,
  positionAngleBasis,
  radecToDirection,
  viewDirectionToOrbitAngles
} from './coordinates';

const deg = Math.PI / 180;

function expectVectorClose(actual: THREE.Vector3, expected: THREE.Vector3, tolerance = 1e-6) {
  expect(actual.distanceTo(expected)).toBeLessThan(tolerance);
}

describe('astronomical coordinate transforms', () => {
  it('maps the Galactic Centre to l=0, b=0', () => {
    const galacticCentre = equatorialToGalactic(
      equatorialToCartesian(17.7607, -28.9362, 1)
    ).normalize();
    expectVectorClose(galacticCentre, new THREE.Vector3(1, 0, 0), 1e-4);
  });

  it('maps the north Galactic pole to +Y', () => {
    const pole = equatorialToGalactic(
      equatorialToCartesian(192.85948 / 15, 27.12825, 1)
    ).normalize();
    expectVectorClose(pole, new THREE.Vector3(0, 1, 0), 2e-6);
  });

  it('maps the June-solstice direction to ecliptic latitude zero', () => {
    const epsilon = 23.439281;
    const ecliptic = equatorialToEcliptic(
      equatorialToCartesian(6, epsilon, 1)
    ).normalize();
    expect(Math.asin(ecliptic.y) / deg).toBeCloseTo(0, 5);
  });

  it('preserves distance through frame transforms', () => {
    const source = equatorialToCartesian(4.2, -18, 123.4);
    expect(equatorialToGalactic(source).length()).toBeCloseTo(source.length(), 8);
    expect(equatorialToEcliptic(source).length()).toBeCloseTo(source.length(), 8);
  });

  it('round-trips between equatorial and Galactic frames', () => {
    const source = equatorialToCartesian(11.2, 22, 70);
    expectVectorClose(galacticToEquatorial(equatorialToGalactic(source)), source, 1e-5);
  });

  it('uses identity orientation when the world frame is already Galactic', () => {
    const quaternion = galacticFrameQuaternion('galactic');
    expect(quaternion.angleTo(new THREE.Quaternion())).toBeLessThan(1e-10);
  });

  it('rotates a local Galactic-centre vector into each selected frame', () => {
    const localCentre = new THREE.Vector3(1, 0, 0);
    const equatorialCentre = localCentre.clone().applyQuaternion(galacticFrameQuaternion('equatorial'));
    const eclipticCentre = localCentre.clone().applyQuaternion(galacticFrameQuaternion('ecliptic'));

    expectVectorClose(equatorialToGalactic(equatorialCentre), localCentre, 1e-8);
    expectVectorClose(eclipticCentre, equatorialToEcliptic(equatorialCentre), 1e-8);
  });
});

describe('orbit camera geometry', () => {
  it('faces Galactic +X when the camera is placed on -X', () => {
    expectVectorClose(inwardViewDirection(Math.PI, Math.PI / 2), new THREE.Vector3(1, 0, 0), 1e-8);
  });

  it('round-trips arbitrary inward view directions', () => {
    const expected = new THREE.Vector3(0.3, -0.5, 0.8).normalize();
    const angles = viewDirectionToOrbitAngles(expected);
    expectVectorClose(inwardViewDirection(angles.theta, angles.phi), expected, 1e-8);
  });

  it('builds the same radial position used by the orbit camera', () => {
    expectVectorClose(orbitOffset(10, 0, Math.PI / 2), new THREE.Vector3(10, 0, 0), 1e-8);
  });
});

describe('celestial tangent geometry', () => {
  it('produces an orthonormal east/north frame', () => {
    const basis = celestialTangentBasis(5.5, -22);
    expect(basis.direction.length()).toBeCloseTo(1, 8);
    expect(basis.east.length()).toBeCloseTo(1, 8);
    expect(basis.north.length()).toBeCloseTo(1, 8);
    expect(Math.abs(basis.direction.dot(basis.east))).toBeLessThan(1e-8);
    expect(Math.abs(basis.direction.dot(basis.north))).toBeLessThan(1e-8);
    expect(Math.abs(basis.east.dot(basis.north))).toBeLessThan(1e-8);
  });

  it('uses east of north position-angle convention', () => {
    const basis = celestialTangentBasis(3, 12);
    const pa90 = positionAngleBasis(3, 12, 90);
    expectVectorClose(pa90.major, basis.east, 1e-8);
    expectVectorClose(pa90.minor, basis.north.clone().negate(), 1e-8);
  });

  it('converts angular diameter to shell size', () => {
    const expected = 2 * 1200 * Math.tan((2 * deg) / 2);
    expect(angularDiameterToWorldSize(120, 1200)).toBeCloseTo(expected, 10);
  });

  it('returns the same direction as the unit-distance Cartesian helper', () => {
    expectVectorClose(radecToDirection(7.2, -33), equatorialToCartesian(7.2, -33, 1), 1e-8);
  });
});
