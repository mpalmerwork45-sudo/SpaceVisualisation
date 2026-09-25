import { RADIATIVE_TRANSFER_GLSL } from './RadiativeTransfer';

export const LY_PER_KPC = 3261.563777;
export const GALACTIC_CENTRE_KPC = 26700 / LY_PER_KPC;

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
    // Structure belongs to absorbing dust, never to the smooth stellar light.
    float structure = fbm(direction * vec3(38.0, 70.0, 38.0) + 17.0);
    return envelope * (0.20 + 1.8 * smoothstep(0.32, 0.70, structure));
  }
`;

export const GALACTIC_SKY_FRAGMENT_SHADER = /* glsl */ `
  varying vec3 vDirection;
  uniform vec3 uObserver;
  ${GALACTIC_DUST_GLSL}
  ${RADIATIVE_TRANSFER_GLSL}
  void main() {
    vec3 ray = normalize(vDirection);
    vec3 colour = vec3(0.0), transmission = vec3(1.0);
    vec3 centre = vec3(${GALACTIC_CENTRE_KPC}, 0.0, 0.0);
    vec3 offset = uObserver - centre;
    float b = dot(offset, ray);
    vec3 closest = offset - b * ray;
    float discriminant = 400.0 - dot(closest, closest);
    if (discriminant <= 0.0) { gl_FragColor = vec4(0,0,0,1); return; }
    float entry = max(0.0, -b - sqrt(discriminant));
    float exitDistance = -b + sqrt(discriminant);
    if (exitDistance <= entry) { gl_FragColor = vec4(0,0,0,1); return; }
    // Local extinction is a finite cloud complex around Sol, not a mask
    // attached to the camera. Its internal shapes/distances are illustrative.
    // Sample its angular structure once at each shell crossing, not at every
    // integration step. The near and far faces can obscure different regions.
    float solarMid = -dot(uObserver, ray);
    vec3 solarClosest = uObserver + ray * solarMid;
    float halfChord = sqrt(max(0.55*0.55-dot(solarClosest,solarClosest), 0.0));
    vec3 nearPoint = uObserver + ray * (solarMid-halfChord);
    vec3 farPoint = uObserver + ray * (solarMid+halfChord);
    float nearDust = foregroundDust(length(nearPoint) > 0.001 ? normalize(nearPoint) : ray);
    float farDust = foregroundDust(length(farPoint) > 0.001 ? normalize(farPoint) : ray);
    // From above/below the disc, uniform long-path steps can jump over its
    // thin dust layer, drawing false concentric rings. Spend 64 of 96 samples
    // within +/-1.5 kpc of the midplane and 16 on each outer segment.
    bool samplePlane = abs(offset.y) > 1.5 && abs(ray.y) > 0.12;
    float planeA = (-1.5-offset.y) / (abs(ray.y) > 0.0001 ? ray.y : 0.0001);
    float planeB = ( 1.5-offset.y) / (abs(ray.y) > 0.0001 ? ray.y : 0.0001);
    float planeEntry = clamp(min(planeA,planeB),entry,exitDistance);
    float planeExit = clamp(max(planeA,planeB),entry,exitDistance);
    float previous = entry;
    for (int i = 0; i < 96; i++) {
      float t = (float(i) + 1.0) / 96.0;
      float farDistance = mix(entry, exitDistance, t*t);
      if (samplePlane) {
        float index = float(i)+1.0;
        farDistance = index <= 16.0 ? mix(entry,planeEntry,index/16.0)
          : index <= 80.0 ? mix(planeEntry,planeExit,(index-16.0)/64.0)
          : mix(planeExit,exitDistance,(index-80.0)/16.0);
      }
      float stepSize = farDistance - previous;
      float distance = previous + stepSize * 0.5;
      previous = farDistance;
      vec3 p = uObserver + ray * distance;
      vec2 disc = vec2(centre.x - p.x, p.z);
      float radius = length(disc), height = p.y;
      float angle = atan(disc.y, disc.x);
      float spiral = 0.5 + 0.5 * cos(4.0 * (angle - log(max(radius, 0.3) / 8.2) / tan(radians(12.0))));
      float arms = pow(spiral, 4.0) * smoothstep(1.5, 3.5, radius);
      float radial = exp(-radius / 2.6) * (1.0-smoothstep(14.0,19.0,radius));
      float thinDisc = radial * exp(-abs(height) / 0.28);
      float thickDisc = radial * exp(-abs(height) / 0.85);
      vec2 bar = mat2(0.891, -0.454, 0.454, 0.891) * disc;
      float bulgeRadius = length(vec3(bar.x / 1.75, height / 0.62, bar.y / 0.75));
      // Taper the outer bar: a long exponential tail washes the whole sky in
      // warm light and overwhelms the stellar disc in an external view.
      float bulge = exp(-pow(bulgeRadius,1.5));
      // Old stars form a smooth, broad bulge; young arms make a modest excess.
      vec3 emissivity = vec3(1.0, 0.85, 0.68) * (bulge * 2.4 + thickDisc * 0.13)
                      + vec3(0.83, 0.87, 1.0) * thinDisc * (0.75 + arms * 0.65);
      float knots = noise3(p * vec3(2.3,11.0,2.3) + 31.0);
      float dust = exp(-radius / 4.5) * exp(-abs(height) / 0.065)
                 * (0.55 + arms * 0.65) * (0.35 + knots * 1.5);
      float solarDistance = length(p);
      if (solarDistance > 0.1 && solarDistance < 1.4) {
        dust += mix(nearDust, farDust, smoothstep(solarMid-0.05,solarMid+0.05,distance))
              * exp(-pow((solarDistance-0.55)/0.22,2.0)) * 1.8;
      }
      vec3 tau = vec3(0.76, 1.0, 1.38) * dust * stepSize * 1.8;
      vec3 attenuation = exp(-tau);
      colour += transmission * emissivity * stepSize * emissionIntegral(tau);
      transmission *= attenuation;
    }
    // Linear HDR radiance: observation response and tone mapping happen once,
    // at presentation, rather than baking exposure into the integration.
    gl_FragColor = vec4(colour, 1.0);
  }
`;
