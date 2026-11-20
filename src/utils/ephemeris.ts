import * as THREE from 'three';

/**
 * Astronomical constants and Keplerian Orbital Mechanics
 * Calculates real-time heliocentric 3D positions for planets in AU
 * relative to the Ecliptic Plane J2000 epoch.
 */

// 1 Light Year in Astronomical Units (AU)
export const AU_PER_LIGHT_YEAR = 63241.077;
export const LY_PER_AU = 1.0 / AU_PER_LIGHT_YEAR; // ~0.0000158125

export interface KeplerianElements {
  id: string;
  name: string;
  a: number;      // Semi-major axis in AU
  e: number;      // Eccentricity
  i: number;      // Inclination in degrees
  L0: number;     // Mean longitude at J2000 in degrees
  varpi: number;  // Longitude of perihelion in degrees
  node: number;   // Longitude of ascending node in degrees
  periodYears: number;
  color: string;
  radiusKm: number;
}

// J2000 Keplerian elements for Sol System planets (source: NASA JPL / Astronomical Almanac)
export const PLANET_EPHEMERIS: KeplerianElements[] = [
  {
    id: 'mercury',
    name: 'Mercury',
    a: 0.387098,
    e: 0.205630,
    i: 7.00487,
    L0: 252.25084,
    varpi: 77.45645,
    node: 48.33167,
    periodYears: 0.240846,
    color: '#b5a795',
    radiusKm: 2439.7
  },
  {
    id: 'venus',
    name: 'Venus',
    a: 0.723332,
    e: 0.006773,
    i: 3.39471,
    L0: 181.97973,
    varpi: 131.53298,
    node: 76.68069,
    periodYears: 0.615197,
    color: '#e3bb76',
    radiusKm: 6051.8
  },
  {
    id: 'earth',
    name: 'Earth',
    a: 1.000000,
    e: 0.0167086,
    i: 0.00005,
    L0: 100.46435,
    varpi: 102.94719,
    node: 0.0,
    periodYears: 1.000017,
    color: '#2b82c9',
    radiusKm: 6371.0
  },
  {
    id: 'mars',
    name: 'Mars',
    a: 1.523679,
    e: 0.093405,
    i: 1.84970,
    L0: 355.45332,
    varpi: 336.04084,
    node: 49.57854,
    periodYears: 1.8808476,
    color: '#c1440e',
    radiusKm: 3389.5
  },
  {
    id: 'jupiter',
    name: 'Jupiter',
    a: 5.202603,
    e: 0.048498,
    i: 1.30307,
    L0: 34.40438,
    varpi: 14.75385,
    node: 100.55615,
    periodYears: 11.862615,
    color: '#d8ca9d',
    radiusKm: 69911.0
  },
  {
    id: 'saturn',
    name: 'Saturn',
    a: 9.554909,
    e: 0.055546,
    i: 2.48867,
    L0: 49.94432,
    varpi: 92.43194,
    node: 113.66550,
    periodYears: 29.4571,
    color: '#e4d191',
    radiusKm: 58232.0
  },
  {
    id: 'uranus',
    name: 'Uranus',
    a: 19.218446,
    e: 0.046296,
    i: 0.77319,
    L0: 313.23218,
    varpi: 170.96424,
    node: 74.005957,
    periodYears: 84.0205,
    color: '#7bc8d4',
    radiusKm: 25362.0
  },
  {
    id: 'neptune',
    name: 'Neptune',
    a: 30.110387,
    e: 0.009456,
    i: 1.76995,
    L0: 304.88003,
    varpi: 44.97135,
    node: 131.7806,
    periodYears: 164.79,
    color: '#3b5ca8',
    radiusKm: 24622.0
  },
  {
    id: 'pluto',
    name: 'Pluto',
    a: 39.481686,
    e: 0.248807,
    i: 17.1600,
    L0: 238.92881,
    varpi: 224.06676,
    node: 110.30347,
    periodYears: 247.94,
    color: '#c6ad94',
    radiusKm: 1188.3
  }
];

const DEG2RAD = Math.PI / 180;

/**
 * Calculates Julian Date (JD) from a JavaScript Date object
 */
export function getJulianDate(date: Date = new Date()): number {
  return date.getTime() / 86400000.0 + 2440587.5;
}

/**
 * Computes exact 3D Cartesian position (x, y, z) in AU for a planet
 * given its Keplerian orbital elements at a specified date.
 * +Y is ecliptic north and increasing ecliptic longitude runs from +X toward -Z.
 */
export function calculatePlanetPositionAU(p: KeplerianElements, date: Date = new Date()): THREE.Vector3 {
  const jd = getJulianDate(date);
  const d = jd - 2451545.0; // Days elapsed since J2000.0 epoch

  // 1. Mean anomaly M (degrees)
  const n = (360.0 / (p.periodYears * 365.256363));
  let M = (p.L0 - p.varpi + n * d) % 360.0;
  if (M < 0) M += 360.0;
  const mRad = M * DEG2RAD;

  // 2. Solve Kepler's equation for Eccentric Anomaly E: E - e*sin(E) = M
  let E = mRad;
  for (let iter = 0; iter < 10; iter++) {
    const deltaE = (E - p.e * Math.sin(E) - mRad) / (1.0 - p.e * Math.cos(E));
    E -= deltaE;
    if (Math.abs(deltaE) < 1e-6) break;
  }

  // 3. True anomaly v and heliocentric distance r (AU)
  const xv = p.a * (Math.cos(E) - p.e);
  const yv = p.a * Math.sqrt(1.0 - p.e * p.e) * Math.sin(E);
  const vRad = Math.atan2(yv, xv);
  const r = Math.sqrt(xv * xv + yv * yv);

  // 4. Heliocentric coordinates in orbital plane
  const nodeRad = p.node * DEG2RAD;
  const incRad = p.i * DEG2RAD;
  const wRad = (p.varpi - p.node) * DEG2RAD; // Argument of perihelion

  const u = vRad + wRad; // Argument of latitude

  // 5. Transform to 3D Ecliptic Cartesian coordinates (AU)
  const x = r * (Math.cos(nodeRad) * Math.cos(u) - Math.sin(nodeRad) * Math.sin(u) * Math.cos(incRad));
  const z = r * (Math.sin(nodeRad) * Math.cos(u) + Math.cos(nodeRad) * Math.sin(u) * Math.cos(incRad));
  const y = r * (Math.sin(u) * Math.sin(incRad)); // Ecliptic inclination tilt

  return new THREE.Vector3(x, y, -z);
}

/**
 * Calculates 3D points defining the true tilted elliptical orbit path in AU
 */
export function calculatePlanetOrbitPathAU(p: KeplerianElements, segments: number = 128): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  const nodeRad = p.node * DEG2RAD;
  const incRad = p.i * DEG2RAD;
  const wRad = (p.varpi - p.node) * DEG2RAD;

  for (let i = 0; i <= segments; i++) {
    const E = (i / segments) * Math.PI * 2;
    const xv = p.a * (Math.cos(E) - p.e);
    const yv = p.a * Math.sqrt(1.0 - p.e * p.e) * Math.sin(E);
    const vRad = Math.atan2(yv, xv);
    const r = Math.sqrt(xv * xv + yv * yv);

    const u = vRad + wRad;
    const x = r * (Math.cos(nodeRad) * Math.cos(u) - Math.sin(nodeRad) * Math.sin(u) * Math.cos(incRad));
    const z = r * (Math.sin(nodeRad) * Math.cos(u) + Math.cos(nodeRad) * Math.sin(u) * Math.cos(incRad));
    const y = r * (Math.sin(u) * Math.sin(incRad));

    points.push(new THREE.Vector3(x, y, -z));
  }
  return points;
}
