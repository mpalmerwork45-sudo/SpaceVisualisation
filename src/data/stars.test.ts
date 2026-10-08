import { describe, expect, it } from 'vitest';
import { STARS_CATALOG } from './stars';
import { CONSTELLATIONS } from './constellations';
import { StarRenderer } from '../engine/StarRenderer';
import { ConstellationRenderer } from '../engine/ConstellationRenderer';

describe('stellar catalogue integrity', () => {
  it('has unique IDs and valid finite coordinates and photometry', () => {
    expect(new Set(STARS_CATALOG.map(star => star.id)).size).toBe(STARS_CATALOG.length);
    STARS_CATALOG.forEach(star => {
      [star.ra,star.dec,star.dist,star.mag,star.absMag].forEach(value => expect(Number.isFinite(value)).toBe(true));
      expect(star.ra).toBeGreaterThanOrEqual(0); expect(star.ra).toBeLessThan(24);
      expect(Math.abs(star.dec)).toBeLessThanOrEqual(90); expect(star.dist).toBeGreaterThanOrEqual(0);
    });
  });
  it('resolves every declared constellation endpoint inside its own constellation', () => {
    const catalogue = new Map(STARS_CATALOG.map(star => [star.id,star]));
    CONSTELLATIONS.forEach(constellation => {
      constellation.lines.flat().forEach(id => expect(catalogue.has(id), `${constellation.id}: missing ${id}`).toBe(true));
    });
    expect(catalogue.get('arcturus')!.constellation).toBe(catalogue.get('izar')!.constellation);
  });
  it('renders every declared constellation network, including Gemini and Boötes', () => {
    const stars = new StarRenderer(); stars.updateStars('realistic','ecliptic');
    const lines = new ConstellationRenderer(); lines.updateConstellations(stars,'realistic','ecliptic');
    expect(lines.group.children.map(object => object.userData.constellationData.id).sort()).toEqual(CONSTELLATIONS.map(data => data.id).sort());
    lines.updateConstellations(new StarRenderer(),'linear','ecliptic');
    stars.updateStars('linear','ecliptic','NONE');
  });
});
