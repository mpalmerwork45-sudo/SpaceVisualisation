// Unit-sphere density fields. RGB is emitted/scattered light per unit path and
// the fourth channel is extinction, including absorption by foreground dust.
export const NEBULA_MODELS = {
  orion: 0, ring: 1, helix: 2, crab: 3, pleiades: 4, nucleus: 5, eagle: 6, carina: 7
} as const;

const modelById: Record<string, number> = {
  m42_orion_nebula: NEBULA_MODELS.orion,
  m57_ring_nebula: NEBULA_MODELS.ring,
  helix_nebula: NEBULA_MODELS.helix,
  m1_crab_nebula: NEBULA_MODELS.crab,
  pleiades: NEBULA_MODELS.pleiades,
  m16_eagle_nebula: NEBULA_MODELS.eagle,
  carina_nebula: NEBULA_MODELS.carina
};

export function nebulaKind(id: string, isNuclearRegion: boolean): number {
  return isNuclearRegion ? NEBULA_MODELS.nucleus : modelById[id] ?? NEBULA_MODELS.orion;
}

export const NEBULA_MORPHOLOGY_GLSL = /* glsl */ `
  float profile(float offset, float width) {
    float x = offset / width;
    return exp(-x*x);
  }
  float cloudlet(vec3 p) { return exp(-dot(p,p)); }

  // A blister opens towards Sol. A folded ionisation front and a dark bay
  // cross the bright wall, with cooler gas toward the Trapezium.
  vec4 orionGas(vec3 p, float ripple, float clumps) {
    vec2 sky = p.xy + vec2(0.10, -0.08);
    float wallZ = -0.40 + dot(sky,sky*vec2(1.6,1.1)) + ripple*0.13;
    float wall = profile(p.z-wallZ,0.13) * cloudlet(vec3(sky*1.2,0.0)) * clumps;
    float cavity = cloudlet((p-vec3(-0.10,0.08,-0.03))*vec3(3.4,2.8,3.3));
    float bar = profile(p.y+0.38*p.x+0.18+p.z*0.25+ripple*0.055,0.066)
              * cloudlet(p*vec3(1.8,0.5,3.8));
    vec3 bayPos = p-vec3(0.28,0.12,0.21);
    float bay = profile(bayPos.y-0.25*bayPos.x-ripple*0.045,0.10)
              * cloudlet(bayPos*vec3(1.8,0.0,4.2)) * smoothstep(-0.20,0.10,bayPos.x);
    vec3 light = vec3(0.74,0.065,0.13)*wall + vec3(0.12,0.48,0.64)*cavity
               + vec3(0.86,0.28,0.09)*bar;
    return vec4(light, 0.65*wall+0.48*cavity+0.6*bar+5.0*bay);
  }

  // Distance to the surface of a rounded, tapered column in 3D.
  float pillar(vec3 p, vec3 base, vec3 tip, float radius) {
    vec3 axis = tip-base;
    float t = clamp(dot(p-base,axis)/dot(axis,axis),0.0,1.0);
    return length(p-mix(base,tip,t)) - radius*mix(1.0,0.43,t);
  }
  vec4 eagleGas(vec3 p, float ripple, float clumps) {
    // The columns grow out of a common front on the near side of the cloud.
    // Local X is celestial north. Use it as the height of the pillars.
    vec3 q = (p.yxz-vec3(0.01,0.01,0.13))*1.65;
    q.x += 0.07*sin(4.7*q.y+2.4*q.z) + ripple*0.085;
    q.z += 0.06*sin(5.0*q.x-3.2*q.y);
    float columns = min(
      pillar(q,vec3(-0.53,-0.69,0.01),vec3(-0.18,0.52,0.11),0.18),
      pillar(q,vec3(-0.11,-0.76,0.15),vec3(0.08,0.16,0.04),0.14));
    columns = min(columns,pillar(q,vec3(0.26,-0.72,-0.12),vec3(0.42,-0.02,-0.10),0.15));
    // A crooked cap and side branch break up the long pillar's silhouette.
    columns = min(columns,pillar(q,vec3(-0.23,0.37,0.11),vec3(-0.10,0.47,0.06),0.085));
    columns = min(columns,pillar(q,vec3(-0.41,-0.30,0.02),vec3(-0.49,-0.09,0.06),0.086));
    float bankEdge = -0.64+0.14*sin(4.4*q.x)-0.15*q.x;
    float bank = max(q.y-bankEdge, length(vec2(q.z*1.65,q.x*0.30))-0.33);
    float surface = min(columns,bank) + ripple*0.046;
    float dust = 1.0-smoothstep(-0.04,0.018,surface);
    // Ionised gas traces the eroding side facing the cluster. The thick
    // interiors stay dark so they silhouette against the gas behind them.
    float grazing = smoothstep(-0.08,0.12,-q.z+0.10+0.075*sin(q.y*7.0));
    float skin = profile(surface-0.038,0.040)*(0.20+0.80*grazing)*clumps;
    float cloud = cloudlet((p-vec3(0.01,0.04,-0.27))*vec3(1.65,1.35,3.4))*clumps;
    float glow = cloudlet((p-vec3(0.42,-0.12,-0.13))*vec3(2.7,1.9,3.0))*clumps;
    vec3 light = vec3(0.04,0.46,0.53)*cloud + vec3(0.62,0.19,0.11)*glow
               + vec3(0.83,0.32,0.09)*skin + vec3(0.17,0.064,0.021)*dust*clumps;
    return vec4(light, 0.88*cloud+0.64*glow+17.0*dust+0.50*skin);
  }

  vec4 carinaGas(vec3 p, float ripple, float clumps) {
    // Overlapping bubbles hollow the complex on opposite sides of a dusty rift.
    float left = length((p-vec3(-0.27,0.18,-0.09))*vec3(1.08,1.45,1.3));
    float right = length((p-vec3(0.31,-0.18,0.11))*vec3(1.24,1.03,1.38));
    float walls = profile(left-0.46-ripple*0.075,0.11) + profile(right-0.50+ripple*0.09,0.12);
    walls *= clumps;
    float gas = (profile(left,0.42)+profile(right,0.40))*0.44;
    float fissure = p.y-0.57*p.x-0.045+0.07*sin(6.0*p.x)+ripple*0.09;
    float rift = profile(fissure,0.115) * profile(p.z-0.22,0.23);
    vec3 light = vec3(0.78,0.08,0.14)*walls + vec3(0.09,0.40,0.62)*gas;
    return vec4(light, 0.67*walls+0.45*gas+8.0*rift);
  }

  vec4 ringGas(vec3 p, float ripple, float clumps) {
    // An elliptical barrel of glowing gas surrounds a fainter polar bubble.
    vec3 q = vec3(p.x, 1.33*p.y, p.z+0.19*p.x);
    float radius = length(q.xy);
    float wallRadius = 0.67 - 0.27*q.z*q.z + ripple*0.070;
    float wall = profile(radius-wallRadius,0.098)*profile(q.z,0.34)*clumps;
    float innerWall = profile(radius-wallRadius+0.12,0.082)*profile(q.z,0.36);
    float pole = length(q*vec3(2.05,2.05,1.27));
    float shell = profile(pole-0.91,0.16)*0.55;
    vec3 light = vec3(0.88,0.12,0.035)*wall + vec3(0.045,0.66,0.38)*innerWall
               + vec3(0.048,0.22,0.62)*shell;
    return vec4(light, 0.70*(wall+innerWall+shell));
  }

  vec4 helixGas(vec3 p, float ripple, float clumps) {
    // Inner disc and outer torus lie in different planes. Knots along the
    // inner edge trail radially outward through the warmer molecular layer.
    vec3 q = vec3(p.x, 0.92*p.y+0.39*p.z, -0.39*p.y+0.92*p.z);
    float radius = length(q.xy);
    float ring = profile(radius-0.53-ripple*0.026,0.11)*profile(q.z,0.19);
    float angle = atan(q.y,q.x+0.00001);
    float sectors = (angle+3.141593)*(43.0/6.283186);
    float sectorId = mod(floor(sectors),43.0);
    float offset = hash3(vec3(sectorId,8.0,5.0));
    float other = hash3(vec3(sectorId,6.0,9.0));
    float radial = radius-(0.46+0.10*other);
    float arc = (fract(sectors)-mix(0.27,0.73,offset))*0.1461*radius;
    float layer = profile(q.z-(other-0.5)*0.18,0.10);
    float heads = profile(arc,0.014)*profile(radial,0.023)*layer;
    float tails = profile(arc-radial*(other-0.5)*0.20,0.012)*profile(radial-0.05,0.06)*layer;
    vec3 outer = vec3(p.x,0.79*p.y-0.61*p.z,0.61*p.y+0.79*p.z);
    float torus = profile(length(outer.xy)-0.76-ripple*0.068,0.088)*profile(outer.z,0.18);
    float inner = profile(radius-0.41-ripple*0.034,0.098)*profile(q.z,0.19);
    float diffuse = profile(radius,0.43)*profile(q.z,0.35);
    vec3 light = vec3(0.85,0.11,0.073)*ring*clumps + vec3(0.61,0.063,0.085)*torus*clumps
               + vec3(0.035,0.44,0.43)*inner + vec3(0.045,0.29,0.66)*diffuse
               + vec3(0.87,0.27,0.08)*heads;
    return vec4(light, 0.80*(ring+torus+inner+diffuse)+2.5*tails);
  }

  vec4 crabGas(vec3 p, float ripple, float clumps) {
    vec3 q = p*vec3(1.0,1.36,1.22);
    float r = length(q);
    // Corrugated ribbons embedded in the ejecta cross at different depths.
    // Cartesian sampling avoids artificial radial streaks at the nebula centre.
    vec3 foldPos = vec3(q.xy+vec2(0.23*q.z,-0.30*q.z),q.z*0.42);
    float folds = noise3(foldPos*6.2+uSeed)+0.17*noise3(q*16.5+17.0);
    float shell = profile(r-0.65-ripple*0.14,0.20);
    float web = shell*profile(folds-0.56,0.052)*clumps;
    float wind = cloudlet(q*vec3(2.50,2.85,2.15));
    vec3 light = vec3(0.07,0.36,0.66)*wind + vec3(0.96,0.19,0.046)*web*1.35
               + vec3(0.43,0.12,0.11)*shell*0.16;
    return vec4(light, 0.76*wind+1.15*web+0.15*shell);
  }

  vec4 pleiadesDust(vec3 p, float ripple, float clumps) {
    // Wisps live in curved, overlapping dust sheets around the cluster.
    float warp = p.z+0.23*p.x-0.25*p.y*p.y+ripple*0.07;
    float sheets = profile(warp+0.15,0.12) + 0.52*profile(warp-0.23+0.48*p.y,0.085);
    float stream = noise3(vec3(p.x*4.6, (p.y+0.58*p.x+ripple*0.10)*29.0, p.z*7.5)+uSeed);
    float illumination = cloudlet((p-vec3(-0.31,-0.28,0.0))*vec3(3.1,3.4,1.0))
                       + 0.72*cloudlet((p-vec3(0.29,-0.04,-0.06))*vec3(3.4,2.9,1.0));
    float dust = sheets*(0.05+illumination)*(0.18+1.4*stream*stream)*clumps;
    return vec4(vec3(0.064,0.30,0.84)*dust, 1.00*dust);
  }

  vec4 nebulaSample(vec3 p) {
    float coarse = noise3(p*3.5+uSeed);
    float detail = noise3(p*12.0+uSeed+9.7);
    float fine = noise3(p*35.0+uSeed);
    float ripple = 1.45*(coarse-0.5)+0.64*(detail-0.5)+0.21*(fine-0.5);
    float clumps = 0.36 + 1.20*smoothstep(-0.38,0.40,ripple);
    if (uKind == ${NEBULA_MODELS.orion}) return orionGas(p,ripple,clumps);
    if (uKind == ${NEBULA_MODELS.eagle}) return eagleGas(p,ripple,clumps);
    if (uKind == ${NEBULA_MODELS.carina}) return carinaGas(p,ripple,clumps);
    if (uKind == ${NEBULA_MODELS.ring}) return ringGas(p,ripple,clumps);
    if (uKind == ${NEBULA_MODELS.helix}) return helixGas(p,ripple,clumps);
    if (uKind == ${NEBULA_MODELS.crab}) return crabGas(p,ripple,clumps);
    if (uKind == ${NEBULA_MODELS.pleiades}) return pleiadesDust(p,ripple,clumps);
    float core = cloudlet(p*2.83)*0.25;
    float dust = profile(p.y+0.07,0.25)*(1.25+ripple)*3.0;
    return vec4(vec3(0.57,0.41,0.25)*core, 0.60*core+dust);
  }
`;
