import { describe, expect, it } from 'vitest';
import { emissionIntegral } from './RadiativeTransfer';

describe('homogeneous emission / absorption', () => {
  it('has the transparent limit without NaNs or lost light', () => {
    expect(emissionIntegral(0)).toBe(1);
    expect(emissionIntegral(1e-12)).toBeCloseTo(1, 10);
    expect(() => emissionIntegral(-1)).toThrow(RangeError);
  });

  it.each([1e-7, 0.001, 0.1, 1, 10, 100])('is invariant to subdivision at optical depth %s', tau => {
    const expected = -Math.expm1(-tau) / tau;
    for (const steps of [1, 8, 36, 96, 192]) {
      let light = 0, transmission = 1;
      for (let i = 0; i < steps; i++) {
        light += transmission * emissionIntegral(tau / steps) / steps;
        transmission *= Math.exp(-tau / steps);
      }
      expect(light).toBeCloseTo(expected, 9);
      expect(transmission).toBeCloseTo(Math.exp(-tau), 10);
    }
  });
});
