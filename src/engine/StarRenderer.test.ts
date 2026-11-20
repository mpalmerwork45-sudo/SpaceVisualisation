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
    const dim = renderer.starsMap.get('wise_0855')!;
    const proxima = renderer.starsMap.get('proxima_centauri')!;
    expect(dim.pointIndex).toBeUndefined();
    expect(proxima.visible).toBe(false);
    expect(renderer.starsMap.get('sirius_a')!.visible).toBe(true);
    const camera = new THREE.PerspectiveCamera(1);
    camera.lookAt(proxima.position);
    camera.updateMatrixWorld();
    const pointer = new THREE.Vector2();
    expect(renderer.pickStar(camera, pointer, 800, 800)).toBeNull();
    renderer.setObservationMode('enhancedOptical');
    expect(proxima.visible).toBe(true);
    expect(dim.pointIndex).toBeUndefined();
    expect(renderer.pickStar(camera, pointer, 800, 800)?.id).toBe('proxima_centauri');
    renderer.updateStars('linear','galactic');
    expect(renderer.starsMap.get('wise_0855')!.visible).toBe(true);
    renderer.updateStars('linear','ecliptic','NONE');
  });

  it('scales visible flux monotonically with magnitude and mutes eye colour', () => {
    const renderer = new StarRenderer();
    renderer.updateStars('realistic','ecliptic');
    const geometry = renderer.points.geometry;
    const colours = geometry.getAttribute('color');
    const bright = renderer.starsMap.get('sirius_a')!.pointIndex!;
    const faint = renderer.starsMap.get('pi1_orionis')!.pointIndex!;
    expect(colours.getX(bright)).toBeGreaterThan(colours.getX(faint));
    const antaresRatio = () => {
      const index = renderer.starsMap.get('antares')!.pointIndex!;
      return colours.getX(index) / colours.getZ(index);
    };
    const ratio = antaresRatio();
    renderer.setObservationMode('enhancedOptical');
    expect(antaresRatio()).toBeGreaterThan(ratio);
    renderer.updateStars('linear','ecliptic','NONE');
    expect(renderer.points.geometry).toBe(geometry);
    expect(geometry.drawRange.count).toBe(0);
  });
});
