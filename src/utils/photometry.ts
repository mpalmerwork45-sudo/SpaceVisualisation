/** Elliptical angular area in square arcseconds from full-axis extents. */
export function ellipticalAreaArcsec2(majorArcmin: number, minorArcmin: number): number {
  const semiMajorArcsec = Math.max(majorArcmin, 0) * 30;
  const semiMinorArcsec = Math.max(minorArcmin, 0) * 30;
  return Math.PI * semiMajorArcsec * semiMinorArcsec;
}

/** Mean surface brightness corresponding to an integrated apparent magnitude. */
export function meanSurfaceBrightnessMagArcsec2(
  apparentMagnitude: number,
  majorArcmin: number,
  minorArcmin: number
): number {
  const area = Math.max(ellipticalAreaArcsec2(majorArcmin, minorArcmin), 1e-12);
  return apparentMagnitude + 2.5 * Math.log10(area);
}

/** Linear relative radiance for a logarithmic surface-brightness difference. */
export function surfaceBrightnessFlux(surfaceBrightness: number, reference = 22): number {
  return Math.pow(10, -0.4 * (surfaceBrightness - reference));
}
