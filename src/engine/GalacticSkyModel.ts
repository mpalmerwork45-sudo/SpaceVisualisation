/** Galactic directions: +X centre, +Y north, +Z l=90. Angular cloud extents
 * are approximate landmark envelopes, not surveyed dust measurements. */
export const GALACTIC_DUST_GLSL = /* glsl */ `
  float hash3(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }
  float noise3(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f*f*(3.0-2.0*f);
    return mix(mix(mix(hash3(i), hash3(i+vec3(1,0,0)), f.x),
                   mix(hash3(i+vec3(0,1,0)), hash3(i+vec3(1,1,0)), f.x), f.y),
               mix(mix(hash3(i+vec3(0,0,1)), hash3(i+vec3(1,0,1)), f.x),
                   mix(hash3(i+vec3(0,1,1)), hash3(i+vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) {
    float sum = 0.0, amplitude = 0.5;
    for (int i = 0; i < 5; i++) {
      sum += amplitude * noise3(p);
      p = p * 2.07 + vec3(13.1, 7.7, 19.3);
      amplitude *= 0.5;
    }
    return sum;
  }
  float cloud(vec2 lb, vec2 centre, vec2 extent) {
    float dl = mod(lb.x - centre.x + 180.0, 360.0) - 180.0;
    vec2 delta = vec2(dl, lb.y - centre.y) / extent;
    return exp(-0.5 * dot(delta, delta));
  }
  float foregroundDust(vec3 direction) {
    vec2 lb = degrees(vec2(atan(direction.z, direction.x), asin(clamp(direction.y,-1.0,1.0))));
    // Great Rift chain, Ophiuchus and the southern Coalsack.
    float envelope = 1.3 * cloud(lb, vec2(75, 2), vec2(18, 4))
                   + 1.2 * cloud(lb, vec2(35, 3), vec2(18, 5))
                   + 1.8 * cloud(lb, vec2(5, 1), vec2(16, 3))
                   + 0.8 * cloud(lb, vec2(-7, 13), vec2(9, 6))
                   + 2.6 * cloud(lb, vec2(-57, -1), vec2(4, 3));
    vec3 warp = vec3(fbm(direction*9.0), fbm(direction*9.0+23.0), fbm(direction*9.0-17.0));
    float structure = fbm(direction * 28.0 + warp * 2.0)
                    + fbm(direction * 180.0) * 0.18;
    return envelope * (0.55 + smoothstep(0.30, 0.75, structure) * 0.9);
  }
`;

export const GALACTIC_SKY_FRAGMENT_SHADER = /* glsl */ `
  varying vec3 vDirection;
  uniform float uEyeAdapted;
  ${GALACTIC_DUST_GLSL}
  void main() {
    vec3 ray = normalize(vDirection);
    vec3 colour = vec3(0.0), transmission = vec3(1.0);
    float foreground = foregroundDust(ray);
    float clouds = fbm(ray * 90.0 + fbm(ray * 12.0) * 8.0);
    // Front-to-back integration of stellar light and wavelength-dependent
    // extinction. Units: kpc, with Sol 8.2 kpc from the Galactic centre.
    float previous = 0.0;
    for (int i = 0; i < 40; i++) {
      float t = (float(i) + 1.0) / 40.0;
      float farDistance = 24.0 * t * t;
      float stepSize = farDistance - previous;
      float distance = previous + stepSize * 0.5;
      previous = farDistance;
      vec3 p = ray * distance;
      vec2 disc = vec2(8.2 - p.x, p.z);
      float radius = length(disc), height = p.y + 0.02;
      float angle = atan(disc.y, disc.x);
      float spiral = 0.5 + 0.5 * cos(4.0 * (angle - log(max(radius, 0.3) / 8.2) / tan(radians(12.0))));
      float arms = pow(spiral, 3.0);
      float radial = exp(-radius / 3.0);
      float thinDisc = radial * exp(-abs(height) / 0.16);
      float thickDisc = radial * exp(-abs(height) / 0.65);
      vec2 bar = mat2(0.891, -0.454, 0.454, 0.891) * disc;
      float bulge = exp(-length(vec3(bar.x / 1.6, height / 0.55, bar.y / 0.65)));
      float knots = noise3(p * 2.0 + 31.0);
      vec3 emissivity = vec3(1.0, 0.82, 0.64) * (bulge * 1.5 + thickDisc * 0.17)
                      + mix(vec3(0.75, 0.78, 0.88), vec3(0.48, 0.65, 1.0), arms)
                        * thinDisc * (0.5 + arms * 1.5) * (0.5 + clouds + knots * 0.6);
      float dust = exp(-radius / 4.5) * exp(-abs(height) / 0.085)
                 * (0.6 + arms * 0.4) * (0.7 + knots * 0.6);
      dust += foreground * exp(-pow((distance - 0.65) / 0.30, 2.0)) * 2.0;
      vec3 tau = vec3(0.85, 1.0, 1.22) * dust * stepSize * 1.5;
      vec3 attenuation = exp(-tau);
      colour += transmission * emissivity * stepSize * (1.0 - attenuation) / max(tau, vec3(0.00001));
      transmission *= attenuation;
    }
    vec2 lb = degrees(vec2(atan(ray.z, ray.x), asin(clamp(ray.y,-1.0,1.0))));
    float emission = cloud(lb, vec2(6,-1), vec2(2,1))
                   + cloud(lb, vec2(80,1), vec2(3,2))
                   + cloud(lb, vec2(-73,-1), vec2(3,2));
    colour += vec3(0.10,0.008,0.025) * emission * pow(clouds, 2.0) * exp(-foreground);
    colour *= 0.7 + noise3(ray * 1600.0) * 0.6;
    float luminance = dot(colour, vec3(0.2126, 0.7152, 0.0722));
    colour = mix(colour, vec3(luminance), uEyeAdapted * 0.86);
    gl_FragColor = vec4(colour * mix(0.28, 0.085, uEyeAdapted), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
