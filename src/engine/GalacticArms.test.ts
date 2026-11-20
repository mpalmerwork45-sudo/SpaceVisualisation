import { describe, expect, it } from 'vitest';
import { armDensity, createGalacticArmTexture } from './GalacticArms';

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

  it('keeps the measured ridge channel and places distinct clouds and young stars along it', () => {
    const texture = createGalacticArmTexture(8.15);
    const { data, width } = texture.image;
    if (!data) throw new Error('Missing arm texture pixels');
    let onArmCount = 0, onArmYoung = 0, interarmCount = 0, interarmYoung = 0;
    let dustOnly = 0, youngOnly = 0, ionized = 0, maxHiiExcess = 0;
    for (let y = 0; y < width; y += 2) {
      for (let x = 0; x < width; x += 2) {
        const px = (x + 0.5 - width / 2) * 40 / width, py = (y + 0.5 - width / 2) * 40 / width;
        const radius = Math.hypot(px, py);
        if (radius < 4 || radius > 13) continue;
        const index = 4 * (y * width + x);
        const [ridge, young, dust, hii] = data.subarray(index, index + 4);
        if (x % 16 === 0 && y % 16 === 0) expect(ridge).toBe(Math.round(255 * armDensity(px, py)));
        if (ridge > 100) { onArmCount++; onArmYoung += young; }
        if (ridge < 10) { interarmCount++; interarmYoung += young; }
        if (dust > young + 50) dustOnly++;
        if (young > dust + 50) youngOnly++;
        if (hii > 60) ionized++;
        maxHiiExcess = Math.max(maxHiiExcess, hii - young);
      }
    }
    expect(onArmYoung / onArmCount).toBeGreaterThan(4 * interarmYoung / interarmCount);
    expect(Math.min(dustOnly, youngOnly, ionized)).toBeGreaterThan(50);
    expect(maxHiiExcess).toBe(0);
    texture.dispose();
  });
});
