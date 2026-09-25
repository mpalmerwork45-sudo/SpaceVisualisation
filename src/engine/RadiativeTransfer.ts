/** Integral of a constant source through a homogeneous segment, divided by
 * segment length. The small-tau branch avoids cancellation and 0/0 in GLSL. */
export function emissionIntegral(tau: number): number {
  if (tau < 0) throw new RangeError('Optical depth must be non-negative');
  return tau < 0.001 ? 1 - tau / 2 + tau * tau / 6 : -Math.expm1(-tau) / tau;
}

export const RADIATIVE_TRANSFER_GLSL = /* glsl */ `
  float emissionIntegral(float tau) {
    return tau < 0.001 ? 1.0 - tau * 0.5 + tau * tau / 6.0
                       : (1.0 - exp(-tau)) / tau;
  }
  vec3 emissionIntegral(vec3 tau) {
    return vec3(emissionIntegral(tau.r), emissionIntegral(tau.g), emissionIntegral(tau.b));
  }
`;
