export type DeepObjectType = 'nebula' | 'galaxy' | 'galacticFeature';

export type GalaxyMorphology =
  | 'spiral'
  | 'barredSpiral'
  | 'lenticular'
  | 'edgeOn'
  | 'irregular';

export interface GalaxyAppearance {
  morphology: GalaxyMorphology;
  majorArcmin: number;
  minorArcmin: number;
  positionAngleDeg: number;
  inclinationDeg: number;
  physicalDiameterLy: number;
  apparentMagnitudeV: number;
  bulgeFraction: number;
  sersicIndex: number;
  diskScale: number;
  armCount?: number;
  armPitchAnglesDeg?: number[];
  armContrast?: number;
  dustOpacity: number;
  source: string;
}

export interface DeepSpaceObjectData {
  id: string;
  name: string;
  type: DeepObjectType;
  ra: number;        // Right Ascension in decimal hours (0..24)
  dec: number;       // Declination in degrees (-90..+90)
  dist: number;      // Distance in Light Years
  angularSizeArcmin: number;
  angularSizeMinorArcmin?: number;
  positionAngleDeg?: number;
  galaxy?: GalaxyAppearance;
  colorHex: number;  // Primary emissive color
  secondaryColorHex: number;
  constellation: string;
  description: string;
}

export const DEEP_SPACE_OBJECTS: DeepSpaceObjectData[] = [
  // --- NEBULAE ---
  {
    id: 'm42_orion_nebula',
    name: 'Orion Nebula (M42)',
    type: 'nebula',
    ra: 5.588,
    dec: -5.39,
    dist: 1344.0,
    angularSizeArcmin: 65,
    colorHex: 0xff4081,
    secondaryColorHex: 0x00e5ff,
    constellation: 'Orion',
    description: 'Vibrant stellar nursery stellar birthplace illuminated by the Trapezium Cluster stars.'
  },
  {
    id: 'm1_crab_nebula',
    name: 'Crab Nebula (M1)',
    type: 'nebula',
    ra: 5.575,
    dec: 22.01,
    dist: 6500.0,
    angularSizeArcmin: 6,
    colorHex: 0x00bcd4,
    secondaryColorHex: 0xff5722,
    constellation: 'Taurus',
    description: 'Supernova remnant from the historical star explosion recorded by Chinese astronomers in 1054 AD.'
  },
  {
    id: 'm16_eagle_nebula',
    name: 'Eagle Nebula (M16 / Pillars of Creation)',
    type: 'nebula',
    ra: 18.314,
    dec: -13.8,
    dist: 5700.0,
    angularSizeArcmin: 35,
    colorHex: 0x00e676,
    secondaryColorHex: 0xffab00,
    constellation: 'Serpens',
    description: 'Iconic star-forming cloud famous for the majestic dust towers known as Pillars of Creation.'
  },
  {
    id: 'carina_nebula',
    name: 'Carina Nebula (NGC 3372)',
    type: 'nebula',
    ra: 10.75,
    dec: -59.87,
    dist: 8500.0,
    angularSizeArcmin: 120,
    colorHex: 0xe91e63,
    secondaryColorHex: 0x9c27b0,
    constellation: 'Carina',
    description: 'Colossal diffuse emission nebula surrounding Eta Carinae, four times larger than Orion Nebula.'
  },
  {
    id: 'm57_ring_nebula',
    name: 'Ring Nebula (M57)',
    type: 'nebula',
    ra: 18.893,
    dec: 33.03,
    dist: 2570.0,
    angularSizeArcmin: 3,
    positionAngleDeg: 60, // Optical main ring, O'Dell et al. 2013, Fig. 11.
    colorHex: 0x1de9b6,
    secondaryColorHex: 0xff3d00,
    constellation: 'Lyra',
    description: 'Classic glowing ring-shaped planetary nebula expelled by a dying white dwarf star.'
  },
  {
    id: 'helix_nebula',
    name: 'Helix Nebula (NGC 7293)',
    type: 'nebula',
    ra: 22.493,
    dec: -20.83,
    dist: 655.0,
    angularSizeArcmin: 25,
    colorHex: 0x00b0ff,
    secondaryColorHex: 0xff1744,
    constellation: 'Aquarius',
    description: 'One of the closest bright planetary nebulae to Earth, often nicknamed the "Eye of God".'
  },
  {
    id: 'pleiades',
    name: 'Pleiades (M45 / Seven Sisters)',
    type: 'nebula',
    ra: 3.79,
    dec: 24.11,
    dist: 444.0,
    angularSizeArcmin: 110,
    colorHex: 0x40c4ff,
    secondaryColorHex: 0x80d8ff,
    constellation: 'Taurus',
    description: 'Open star cluster enveloped in striking blue reflection nebulae clouds.'
  },

  // --- GALAXIES ---
  {
    id: 'andromeda_m31',
    name: 'Andromeda Galaxy (M31)',
    type: 'galaxy',
    ra: 0.712,
    dec: 41.27,
    dist: 2500000.0,
    angularSizeArcmin: 190,
    angularSizeMinorArcmin: 60,
    positionAngleDeg: 38,
    galaxy: {
      morphology: 'spiral',
      majorArcmin: 190,
      minorArcmin: 60,
      positionAngleDeg: 38,
      inclinationDeg: 77,
      physicalDiameterLy: 138000,
      apparentMagnitudeV: 3.44,
      bulgeFraction: 0.30,
      sersicIndex: 2.2,
      diskScale: 0.52,
      armCount: 2,
      armPitchAnglesDeg: [8, 11],
      armContrast: 0.34,
      dustOpacity: 0.48,
      source: 'NASA/IPAC M31 atlas; optical major/minor extent and position angle'
    },
    colorHex: 0xffecb3,
    secondaryColorHex: 0x90caf9,
    constellation: 'Andromeda',
    description: 'Nearest major spiral galaxy to Milky Way, harboring over 1 trillion stars on collision course with us in 4B years.'
  },
  {
    id: 'triangulum_m33',
    name: 'Triangulum Galaxy (M33)',
    type: 'galaxy',
    ra: 1.564,
    dec: 30.66,
    dist: 2730000.0,
    angularSizeArcmin: 70,
    angularSizeMinorArcmin: 40,
    positionAngleDeg: 23,
    galaxy: {
      morphology: 'spiral',
      majorArcmin: 70,
      minorArcmin: 40,
      positionAngleDeg: 23,
      inclinationDeg: 56,
      physicalDiameterLy: 56000,
      apparentMagnitudeV: 5.72,
      bulgeFraction: 0.10,
      sersicIndex: 1.3,
      diskScale: 0.62,
      armCount: 2,
      armPitchAnglesDeg: [22, 27],
      armContrast: 0.45,
      dustOpacity: 0.22,
      source: 'Optical catalogue dimensions and major-axis position angle'
    },
    colorHex: 0xb3e5fc,
    secondaryColorHex: 0xffcc80,
    constellation: 'Triangulum',
    description: 'Third-largest member of Local Group of galaxies after Andromeda and Milky Way.'
  },
  {
    id: 'lmc',
    name: 'Large Magellanic Cloud (LMC)',
    type: 'galaxy',
    ra: 5.393,
    dec: -69.75,
    dist: 163000.0,
    angularSizeArcmin: 600,
    angularSizeMinorArcmin: 500,
    positionAngleDeg: 170,
    galaxy: {
      morphology: 'irregular',
      majorArcmin: 600,
      minorArcmin: 500,
      positionAngleDeg: 170,
      inclinationDeg: 35,
      physicalDiameterLy: 28500,
      apparentMagnitudeV: 0.9,
      bulgeFraction: 0.05,
      sersicIndex: 1,
      diskScale: 0.8,
      armContrast: 0.12,
      dustOpacity: 0.12,
      source: 'Large Magellanic Cloud optical extent and irregular morphology'
    },
    colorHex: 0xfff59d,
    secondaryColorHex: 0x80deea,
    constellation: 'Dorado',
    description: 'Prominent satellite galaxy of the Milky Way visible to southern hemisphere observers.'
  },
  {
    id: 'smc',
    name: 'Small Magellanic Cloud (SMC)',
    type: 'galaxy',
    ra: 0.877,
    dec: -72.8,
    dist: 204000.0,
    angularSizeArcmin: 300,
    angularSizeMinorArcmin: 180,
    positionAngleDeg: 45,
    galaxy: {
      morphology: 'irregular',
      majorArcmin: 300,
      minorArcmin: 180,
      positionAngleDeg: 45,
      inclinationDeg: 60,
      physicalDiameterLy: 17800,
      apparentMagnitudeV: 2.7,
      bulgeFraction: 0.02,
      sersicIndex: 1,
      diskScale: 0.9,
      armContrast: 0.08,
      dustOpacity: 0.08,
      source: 'Small Magellanic Cloud optical extent and irregular morphology'
    },
    colorHex: 0xe1bee7,
    secondaryColorHex: 0xb2dfdb,
    constellation: 'Tucana',
    description: 'Dwarf satellite galaxy of the Milky Way containing several hundred million stars.'
  },
  {
    id: 'm104_sombrero',
    name: 'Sombrero Galaxy (M104)',
    type: 'galaxy',
    ra: 12.666,
    dec: -11.62,
    dist: 31100000.0,
    angularSizeArcmin: 9,
    angularSizeMinorArcmin: 3.5,
    positionAngleDeg: 90,
    galaxy: {
      morphology: 'edgeOn',
      majorArcmin: 9,
      minorArcmin: 3.5,
      positionAngleDeg: 90,
      inclinationDeg: 84,
      physicalDiameterLy: 81400,
      apparentMagnitudeV: 8.0,
      bulgeFraction: 0.65,
      sersicIndex: 3.5,
      diskScale: 0.34,
      armCount: 0,
      armContrast: 0.08,
      dustOpacity: 0.90,
      source: 'Sombrero Galaxy optical dimensions and edge-on dust-lane morphology'
    },
    colorHex: 0xffe0b2,
    secondaryColorHex: 0xb0bec5,
    constellation: 'Virgo',
    description: 'Unusual unbarred spiral galaxy featuring a brilliant white nucleus and thick dark dust lane.'
  },
  {
    id: 'milky_way_core',
    name: 'Galactic Center (Sagittarius A*)',
    type: 'galacticFeature',
    ra: 17.761,
    dec: -29.008,
    dist: 26600.0,
    angularSizeArcmin: 180,
    colorHex: 0xffb74d,
    secondaryColorHex: 0x7e57c2,
    constellation: 'Sagittarius',
    description: 'Supermassive black hole and dense nuclear star cluster core at the heart of our Milky Way Galaxy.'
  }
];
