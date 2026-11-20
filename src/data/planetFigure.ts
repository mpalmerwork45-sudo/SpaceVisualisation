import * as THREE from 'three';
import { equatorialToEcliptic, radecToDirection } from '../utils/coordinates';

// Constant terms of JPL's pck00011.tpc. The model holds the pole fixed and
// omits periodic terms, precession, and the UTC to ephemeris-time correction.
// https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00011.tpc
interface PlanetFigure {
  polarRatio: number;
  poleRA: number;
  poleDec: number;
  primeMeridian: number;
  degreesPerDay: number;
}

export const PLANET_FIGURES: Record<string, PlanetFigure> = {
  mercury: { polarRatio: 2438.26 / 2440.53, poleRA: 281.0103, poleDec: 61.4155, primeMeridian: 329.5988, degreesPerDay: 6.1385108 },
  venus:   { polarRatio: 1, poleRA: 272.76, poleDec: 67.16, primeMeridian: 160.20, degreesPerDay: -1.4813688 },
  earth:   { polarRatio: 6356.7519 / 6378.1366, poleRA: 0, poleDec: 90, primeMeridian: 190.147, degreesPerDay: 360.9856235 },
  mars:    { polarRatio: 3376.20 / 3396.19, poleRA: 317.269202, poleDec: 54.432516, primeMeridian: 176.049863, degreesPerDay: 350.891982443297 },
  jupiter: { polarRatio: 66854 / 71492, poleRA: 268.056595, poleDec: 64.495303, primeMeridian: 284.95, degreesPerDay: 870.536 },
  saturn:  { polarRatio: 54364 / 60268, poleRA: 40.589, poleDec: 83.537, primeMeridian: 38.90, degreesPerDay: 810.7939024 },
  uranus:  { polarRatio: 24973 / 25559, poleRA: 257.311, poleDec: -15.175, primeMeridian: 203.81, degreesPerDay: -501.1600928 },
  neptune: { polarRatio: 24341 / 24764, poleRA: 299.36, poleDec: 43.46, primeMeridian: 249.978, degreesPerDay: 541.1397757 },
  pluto:   { polarRatio: 1, poleRA: 132.993, poleDec: -6.163, primeMeridian: 302.695, degreesPerDay: 56.3625225 }
};

export function planetPoleFrame(figure: PlanetFigure) {
  const pole = equatorialToEcliptic(radecToDirection(figure.poleRA / 15, figure.poleDec));
  // W is measured eastwards from the ascending node on the ICRF equator.
  const node = equatorialToEcliptic(radecToDirection((figure.poleRA + 90) / 15, 0));
  return new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(node, pole, node.clone().cross(pole))
  );
}

export function planetSpinAngle(figure: PlanetFigure, date: Date) {
  const j2000Days = (date.getTime() - Date.UTC(2000, 0, 1, 12)) / 86400000;
  return THREE.MathUtils.degToRad((figure.primeMeridian + j2000Days * figure.degreesPerDay) % 360);
}
