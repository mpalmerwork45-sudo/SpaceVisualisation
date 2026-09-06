import * as THREE from 'three';

export interface SpectralColorInfo {
  hex: number;
  css: string;
  name: string;
}

// Constants
export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;
export const HOURS2RAD = (15 * Math.PI) / 180;
export type CelestialAlignment = 'ecliptic' | 'galactic' | 'equatorial';

// ICRS/J2000 Galactic pole definition used by Hipparcos/Gaia.
// The matrix is expressed in the conventional ICRS order [X, Y, Z] where
// X points to RA=0, Y to RA=6h and Z to Dec=+90 degrees.
const ICRS_TO_GALACTIC = [
  -0.0548755604162154, -0.8734370902348850, -0.4838350155487132,
   0.4941094278755837, -0.4448296299600112,  0.7469822444972189,
  -0.8676661490190047, -0.1980763734312015,  0.4559837761750669
] as const;

// Ecliptic Obliquity
const ECLIPTIC_OBLIQUITY = 23.439281 * DEG2RAD;

/**
 * Converts Right Ascension (hours), Declination (degrees), and Distance (ly)
 * to 3D Equatorial Cartesian Coordinates (Sol at origin [0,0,0]).
 */
export function equatorialToCartesian(raHours: number, decDeg: number, distanceLy: number): THREE.Vector3 {
  const raRad = raHours * HOURS2RAD;
  const decRad = decDeg * DEG2RAD;

  const cosDec = Math.cos(decRad);
  const x = distanceLy * cosDec * Math.cos(raRad);
  const z = distanceLy * cosDec * Math.sin(raRad);
  const y = distanceLy * Math.sin(decRad); // Equatorial North

  return new THREE.Vector3(x, y, z);
}

/**
 * Returns a unit direction in the renderer's equatorial convention:
 * +X = RA 0h, +Z = RA 6h, +Y = equatorial north.
 */
export function radecToDirection(raHours: number, decDeg: number): THREE.Vector3 {
  return equatorialToCartesian(raHours, decDeg, 1).normalize();
}

/**
 * Converts Equatorial Vector3 to Galactic Coordinates Vector3
 * where Galactic Plane is horizontal (XZ plane) and Galactic North is +Y.
 */
export function equatorialToGalactic(eqPos: THREE.Vector3): THREE.Vector3 {
  const distance = eqPos.length();
  if (distance === 0) return new THREE.Vector3();

  // Reorder the renderer vector into conventional ICRS [X, Y, Z].
  const ix = eqPos.x;
  const iy = eqPos.z;
  const iz = eqPos.y;
  const m = ICRS_TO_GALACTIC;

  const galX = m[0] * ix + m[1] * iy + m[2] * iz;
  const galY = m[3] * ix + m[4] * iy + m[5] * iz;
  const galZ = m[6] * ix + m[7] * iy + m[8] * iz;

  // Return to the renderer convention: +X = l=0, +Z = l=90, +Y = b=90.
  return new THREE.Vector3(galX, galZ, galY);
}

/** Inverse of equatorialToGalactic, using the orthogonal transpose matrix. */
export function galacticToEquatorial(galPos: THREE.Vector3): THREE.Vector3 {
  const distance = galPos.length();
  if (distance === 0) return new THREE.Vector3();

  const gx = galPos.x;
  const gy = galPos.z;
  const gz = galPos.y;
  const m = ICRS_TO_GALACTIC;

  const ix = m[0] * gx + m[3] * gy + m[6] * gz;
  const iy = m[1] * gx + m[4] * gy + m[7] * gz;
  const iz = m[2] * gx + m[5] * gy + m[8] * gz;
  return new THREE.Vector3(ix, iz, iy);
}

/**
 * Transforms position vector between Equatorial and Ecliptic aligned coordinates
 * where Planetary / Ecliptic Plane is horizontal (XZ) and Ecliptic North is +Y.
 */
export function equatorialToEcliptic(eqPos: THREE.Vector3): THREE.Vector3 {
  const v = eqPos.clone();
  // In this axis convention a positive X rotation maps the June-solstice
  // direction (RA=6h, Dec=+epsilon) onto ecliptic latitude zero.
  v.applyAxisAngle(new THREE.Vector3(1, 0, 0), ECLIPTIC_OBLIQUITY);
  return v;
}

/**
 * Rotates vectors authored in the local Galactic frame into the selected
 * renderer frame. Galactic alignment is intentionally the identity: local
 * +X is l=0 (the Galactic centre), +Y is b=+90, and +Z is l=90.
 */
export function galacticFrameQuaternion(alignment: CelestialAlignment): THREE.Quaternion {
  if (alignment === 'galactic') return new THREE.Quaternion();

  let x = galacticToEquatorial(new THREE.Vector3(1, 0, 0));
  let y = galacticToEquatorial(new THREE.Vector3(0, 1, 0));
  let z = galacticToEquatorial(new THREE.Vector3(0, 0, 1));

  if (alignment === 'ecliptic') {
    x = equatorialToEcliptic(x);
    y = equatorialToEcliptic(y);
    z = equatorialToEcliptic(z);
  }

  return new THREE.Quaternion()
    .setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z))
    .normalize();
}

/** Spherical orbit offset from a target in the renderer's +Y-up frame. */
export function orbitOffset(radius: number, theta: number, phi: number): THREE.Vector3 {
  return new THREE.Vector3(
    radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

/** Unit direction seen by an inward-looking orbit camera. */
export function inwardViewDirection(theta: number, phi: number): THREE.Vector3 {
  return orbitOffset(1, theta, phi).negate().normalize();
}

/** Orbit angles that make an inward-looking camera face a world direction. */
export function viewDirectionToOrbitAngles(direction: THREE.Vector3): { theta: number; phi: number } {
  const view = direction.clone().normalize();
  if (view.lengthSq() === 0) return { theta: 0, phi: Math.PI / 2 };

  const radial = view.negate();
  const theta = (Math.atan2(radial.z, radial.x) + Math.PI * 2) % (Math.PI * 2);
  const phi = Math.acos(THREE.MathUtils.clamp(radial.y, -1, 1));
  return { theta, phi };
}

export interface CelestialTangentBasis {
  direction: THREE.Vector3;
  east: THREE.Vector3;
  north: THREE.Vector3;
}

/**
 * Builds an orthonormal tangent frame at an ICRS RA/Dec position.
 * Position angles are measured east from celestial north.
 */
export function celestialTangentBasis(raHours: number, decDeg: number): CelestialTangentBasis {
  const ra = raHours * HOURS2RAD;
  const dec = decDeg * DEG2RAD;
  const sinRa = Math.sin(ra);
  const cosRa = Math.cos(ra);
  const sinDec = Math.sin(dec);
  const cosDec = Math.cos(dec);

  const direction = new THREE.Vector3(cosDec * cosRa, sinDec, cosDec * sinRa);
  const east = new THREE.Vector3(-sinRa, 0, cosRa);
  const north = new THREE.Vector3(-sinDec * cosRa, cosDec, -sinDec * sinRa);
  return { direction, east, north };
}

/** Major/minor tangent directions for a position angle east of north. */
export function positionAngleBasis(
  raHours: number,
  decDeg: number,
  positionAngleDeg: number
): { major: THREE.Vector3; minor: THREE.Vector3 } {
  const { east, north } = celestialTangentBasis(raHours, decDeg);
  const pa = positionAngleDeg * DEG2RAD;
  return {
    major: north.clone().multiplyScalar(Math.cos(pa)).add(east.clone().multiplyScalar(Math.sin(pa))),
    minor: north.clone().multiplyScalar(-Math.sin(pa)).add(east.clone().multiplyScalar(Math.cos(pa)))
  };
}

/** Converts an angular diameter to a world-space diameter at a shell radius. */
export function angularDiameterToWorldSize(angularArcmin: number, shellDistance: number): number {
  const angleRad = (angularArcmin / 60) * DEG2RAD;
  return 2 * shellDistance * Math.tan(angleRad / 2);
}

export type ViewMode = 'linear' | 'logarithmic' | 'realistic';

/**
 * Logarithmic Distance Scaling Formula
 */
export function scaleDistance(distanceLy: number, mode: ViewMode = 'linear', logK = 10, logScale = 40): number {
  if (distanceLy <= 0) return 0;
  if (mode === 'logarithmic') {
    return logScale * Math.log(1 + distanceLy / logK);
  }
  return distanceLy;
}

/**
 * Spectral class color mapping for stars (RGB Hex)
 */
export const SPECTRAL_COLORS: Record<string, SpectralColorInfo> = {
  O: { hex: 0x9bb0ff, css: '#9bb0ff', name: 'Blue Supergiant (O)' },
  B: { hex: 0xaabfff, css: '#aabfff', name: 'Blue-White Star (B)' },
  A: { hex: 0xcad7ff, css: '#cad7ff', name: 'White Star (A)' },
  F: { hex: 0xf8f7ff, css: '#f8f7ff', name: 'Yellow-White Star (F)' },
  G: { hex: 0xfff4ea, css: '#fff4ea', name: 'Yellow Dwarf / Sol (G)' },
  K: { hex: 0xffd2a1, css: '#ffd2a1', name: 'Orange Dwarf / Giant (K)' },
  M: { hex: 0xffa06d, css: '#ffa06d', name: 'Red Dwarf / Supergiant (M)' },
  L: { hex: 0xd24836, css: '#d24836', name: 'Brown Dwarf (L)' },
  T: { hex: 0x93305a, css: '#93305a', name: 'Cool Brown Dwarf (T)' },
  Y: { hex: 0x5a2340, css: '#5a2340', name: 'Sub-Brown Dwarf (Y)' },
  WD: { hex: 0xb9d5ff, css: '#b9d5ff', name: 'White Dwarf (WD)' },
  NS: { hex: 0x70efff, css: '#70efff', name: 'Neutron Star' },
  BH: { hex: 0x8a2be2, css: '#8a2be2', name: 'Stellar Black Hole' }
};

export function getSpectralColor(spectralType: string = 'G'): number {
  const s = String(spectralType).trim().toUpperCase();
  if (s.startsWith('WD')) return SPECTRAL_COLORS.WD.hex;
  const char = s.charAt(0);
  return SPECTRAL_COLORS[char] ? SPECTRAL_COLORS[char].hex : SPECTRAL_COLORS.G.hex;
}

export function getSpectralCssColor(spectralType: string = 'G'): string {
  const s = String(spectralType).trim().toUpperCase();
  if (s.startsWith('WD')) return SPECTRAL_COLORS.WD.css;
  const char = s.charAt(0);
  return SPECTRAL_COLORS[char] ? SPECTRAL_COLORS[char].css : SPECTRAL_COLORS.G.css;
}
