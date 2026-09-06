import { describe, expect, it } from 'vitest';
import {
  ellipticalAreaArcsec2,
  meanSurfaceBrightnessMagArcsec2,
  surfaceBrightnessFlux
} from './photometry';

describe('extended-source photometry', () => {
  it('uses the area of an ellipse defined by full angular axes', () => {
    expect(ellipticalAreaArcsec2(2, 1)).toBeCloseTo(Math.PI * 60 * 30, 10);
  });

  it('converts integrated magnitude into mean surface brightness', () => {
    const area = Math.PI * 60 * 30;
    expect(meanSurfaceBrightnessMagArcsec2(8, 2, 1)).toBeCloseTo(8 + 2.5 * Math.log10(area), 10);
  });

  it('maps a five-magnitude surface-brightness change to a factor of one hundred', () => {
    expect(surfaceBrightnessFlux(27, 22)).toBeCloseTo(0.01, 10);
  });
});
