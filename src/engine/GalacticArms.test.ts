import { describe, expect, it } from 'vitest';
import { armDensity } from './GalacticArms';

describe('maser-traced Milky Way arms', () => {
  const at = (beta: number, radius: number) =>
    armDensity(radius * Math.cos(beta * Math.PI / 180), radius * Math.sin(beta * Math.PI / 180));

  it('places observed arm ridges on the correct side of the Sun–centre line', () => {
    expect(at(24, 6.04)).toBeCloseTo(1);  // Sagittarius kink
    expect(at(40, 8.87)).toBeCloseTo(1);  // Perseus kink
    expect(at(9, 8.26)).toBeCloseTo(1);   // Local arm
    expect(at(-40, 8.87)).toBeLessThan(0.5);
  });

  it('changes pitch across the Sagittarius kink, with a continuous far-side prior', () => {
    expect(at(94, 6.04 * Math.exp(-70 * Math.PI / 180 * Math.tan(Math.PI / 180)))).toBeCloseTo(1);
    expect(at(180 - 0.001, 9)).toBeCloseTo(at(-180 + 0.001, 9), 3);
    expect(at(45, 20)).toBe(0);
  });
});
