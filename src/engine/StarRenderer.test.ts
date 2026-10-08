import { describe, expect, it } from 'vitest';
import { StarRenderer, matchesSpectralFilter } from './StarRenderer';
import { STARS_CATALOG } from '../data/stars';
import * as THREE from 'three';

describe('catalogue sky photometry and filtering', () => {
  it('groups all L/T/Y brown dwarfs, without treating white dwarfs as A stars', () => {
    const renderer = new StarRenderer();
    renderer.updateStars('linear','ecliptic','BD');
    expect([...renderer.starsMap.keys()].sort()).toEqual(STARS_CATALOG.filter(star => /^[LTY]/.test(star.spectral)).map(star => star.id).sort());
    expect(matchesSpectralFilter({ spectral: 'WD' } as any, 'W')).toBe(true);
    renderer.updateStars('linear','ecliptic','NONE');
  });

  it('omits the observer Sun and hides faint objects and their pick geometry in eye sky mode', () => {
    const renderer = new StarRenderer();
    renderer.updateStars('realistic','galactic');
    expect(renderer.starsMap.has('sol')).toBe(false);
    expect(renderer.calculateStarPosition(STARS_CATALOG.find(star => star.id === 'sol')!,'realistic','galactic').length()).toBe(0);
    expect(renderer.starsMap.get('wise_0855')!.mesh.visible).toBe(false);
    expect(renderer.starsMap.get('proxima_centauri')!.mesh.visible).toBe(false);
    expect(renderer.starsMap.get('sirius_a')!.mesh.visible).toBe(true);
    renderer.setObservationMode('enhancedOptical');
    expect(renderer.starsMap.get('proxima_centauri')!.mesh.visible).toBe(true);
    expect(renderer.starsMap.get('wise_0855')!.mesh.visible).toBe(false);
    renderer.updateStars('linear','galactic');
    expect(renderer.starsMap.get('wise_0855')!.mesh.visible).toBe(true);
    renderer.updateStars('linear','ecliptic','NONE');
  });

  it('scales visible flux monotonically with magnitude and mutes eye colour', () => {
    const renderer = new StarRenderer();
    renderer.updateStars('realistic','ecliptic');
    const bright = renderer.starsMap.get('sirius_a')!.mesh.material as THREE.MeshBasicMaterial;
    const faint = renderer.starsMap.get('pi1_orionis')!.mesh.material as THREE.MeshBasicMaterial;
    expect(bright.color.r).toBeGreaterThan(faint.color.r);
    const colour = renderer.starsMap.get('antares')!.mesh.material as THREE.MeshBasicMaterial;
    const ratio = colour.color.r/colour.color.b;
    renderer.setObservationMode('enhancedOptical');
    expect(colour.color.r/colour.color.b).toBeGreaterThan(ratio);
    renderer.updateStars('linear','ecliptic','NONE');
  });
});
