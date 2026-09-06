import { describe, expect, it } from 'vitest';
import { DEEP_SPACE_OBJECTS } from './deepSpace';
import { equatorialToCartesian, equatorialToGalactic } from '../utils/coordinates';
import { meanSurfaceBrightnessMagArcsec2 } from '../utils/photometry';

describe('deep-space catalogue contracts', () => {
  it('has unique, bounded celestial coordinates and positive distances', () => {
    const ids = DEEP_SPACE_OBJECTS.map(object => object.id);
    expect(new Set(ids).size).toBe(ids.length);

    DEEP_SPACE_OBJECTS.forEach(object => {
      expect(object.ra).toBeGreaterThanOrEqual(0);
      expect(object.ra).toBeLessThan(24);
      expect(object.dec).toBeGreaterThanOrEqual(-90);
      expect(object.dec).toBeLessThanOrEqual(90);
      expect(object.dist).toBeGreaterThan(0);
      expect(object.angularSizeArcmin).toBeGreaterThan(0);
    });
  });

  it('keeps galaxy appearance records complete and physically scaled', () => {
    const galaxies = DEEP_SPACE_OBJECTS.filter(object => object.type === 'galaxy');
    expect(galaxies.length).toBeGreaterThan(0);

    galaxies.forEach(object => {
      const appearance = object.galaxy;
      expect(appearance).toBeDefined();
      if (!appearance) return;

      expect(appearance.majorArcmin).toBeGreaterThan(appearance.minorArcmin);
      expect(appearance.physicalDiameterLy).toBeGreaterThan(0);
      expect(appearance.apparentMagnitudeV).toBeLessThan(15);
      expect(appearance.source.length).toBeGreaterThan(0);

      const meanSurfaceBrightness = meanSurfaceBrightnessMagArcsec2(
        appearance.apparentMagnitudeV,
        appearance.majorArcmin,
        appearance.minorArcmin
      );
      expect(meanSurfaceBrightness).toBeGreaterThan(19);
      expect(meanSurfaceBrightness).toBeLessThan(26);

      // Small-angle projection: the catalogue extent should agree with the
      // physical diameter and distance to within normal survey-definition
      // differences (isophotal radius, bandpass and rounding).
      const impliedArcmin = appearance.physicalDiameterLy / object.dist * 180 / Math.PI * 60;
      expect(impliedArcmin / appearance.majorArcmin).toBeGreaterThan(0.85);
      expect(impliedArcmin / appearance.majorArcmin).toBeLessThan(1.15);
    });
  });

  it('does not treat the Milky Way feature marker as an external galaxy', () => {
    const feature = DEEP_SPACE_OBJECTS.find(object => object.type === 'galacticFeature');
    expect(feature).toBeDefined();
    expect(feature?.galaxy).toBeUndefined();
    if (!feature) return;

    const direction = equatorialToGalactic(
      equatorialToCartesian(feature.ra, feature.dec, 1)
    ).normalize();
    expect(direction.x).toBeGreaterThan(0.9999);
    expect(Math.abs(direction.y)).toBeLessThan(0.01);
    expect(Math.abs(direction.z)).toBeLessThan(0.01);
  });
});
