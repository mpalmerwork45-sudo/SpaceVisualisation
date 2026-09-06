export interface ConstellationData {
  id: string;
  name: string;
  lines: [string, string][]; // Pairs of star IDs
}

export const CONSTELLATIONS: ConstellationData[] = [
  {
    id: 'orion',
    name: 'Orion (The Hunter)',
    lines: [
      // Main Hourglass Torso & Legs
      ['betelgeuse', 'bellatrix'],
      ['bellatrix', 'mintaka'],
      ['mintaka', 'alnilam'],
      ['alnilam', 'alnitak'],
      ['alnitak', 'saiph'],
      ['saiph', 'rigel'],
      ['rigel', 'mintaka'],
      ['betelgeuse', 'alnitak'],

      // Head (Meissa)
      ['betelgeuse', 'meissa'],
      ['bellatrix', 'meissa'],

      // Raised Arm & Club (above Betelgeuse)
      ['betelgeuse', 'mu_orionis'],
      ['mu_orionis', 'nu_orionis'],
      ['nu_orionis', 'xi_orionis'],
      ['xi_orionis', 'chi2_orionis'],
      ['chi2_orionis', 'chi1_orionis'],

      // Bow / Shield (west of Bellatrix)
      ['bellatrix', 'pi3_orionis'],
      ['pi1_orionis', 'pi2_orionis'],
      ['pi2_orionis', 'pi3_orionis'],
      ['pi3_orionis', 'pi4_orionis'],
      ['pi4_orionis', 'pi5_orionis'],
      ['pi5_orionis', 'pi6_orionis'],

      // Sword / Hanging Orion Nebula M42
      ['alnilam', 'theta1_orionis'],
      ['theta1_orionis', 'iota_orionis']
    ]
  },
  {
    id: 'ursa_major',
    name: 'Ursa Major (Great Bear)',
    lines: [
      // Big Dipper Bowl & Handle
      ['dubhe', 'merak'],
      ['merak', 'phecda'],
      ['phecda', 'megrez'],
      ['megrez', 'dubhe'],
      ['megrez', 'alioth'],
      ['alioth', 'mizar'],
      ['mizar', 'alkaid'],

      // Bear Snout
      ['dubhe', 'muscida'],

      // Bear Front Legs & Paws
      ['merak', 'talitha'],
      ['talitha', 'elkoprah'],

      // Bear Rear Legs & Paws
      ['phecda', 'tania_australis'],
      ['tania_australis', 'tania_borealis'],
      ['phecda', 'alula_australis'],
      ['alula_australis', 'alula_borealis']
    ]
  },
  {
    id: 'ursa_minor',
    name: 'Ursa Minor (Little Dipper)',
    lines: [
      ['polaris', 'kochab'],
      ['kochab', 'pherkad'],
      ['pherkad', 'polaris']
    ]
  },
  {
    id: 'cassiopeia',
    name: 'Cassiopeia (The Queen)',
    lines: [
      ['caph', 'schedar'],
      ['schedar', 'gamma_cas'],
      ['gamma_cas', 'ruchbah'],
      ['ruchbah', 'segin']
    ]
  },
  {
    id: 'cygnus',
    name: 'Cygnus (The Northern Cross)',
    lines: [
      ['deneb', 'sadr'],
      ['sadr', 'albireo'],
      ['gienah_cyg', 'sadr'],
      ['sadr', 'delta_cyg']
    ]
  },
  {
    id: 'crux',
    name: 'Crux (Southern Cross)',
    lines: [
      ['acrux', 'gacrux'],
      ['mimosa', 'imai']
    ]
  },
  {
    id: 'scorpius',
    name: 'Scorpius (The Scorpion)',
    lines: [
      ['graffias', 'dschubba'],
      ['dschubba', 'antares'],
      ['antares', 'sargas'],
      ['sargas', 'lesath'],
      ['lesath', 'shaula']
    ]
  },
  {
    id: 'taurus',
    name: 'Taurus (The Bull)',
    lines: [
      ['aldebaran', 'elnath'],
      ['aldebaran', 'tianguan'],
      ['aldebaran', 'alcyone']
    ]
  },
  {
    id: 'leo',
    name: 'Leo (The Lion)',
    lines: [
      ['regulus', 'algieba'],
      ['algieba', 'zosma'],
      ['zosma', 'denebola'],
      ['denebola', 'regulus']
    ]
  },
  {
    id: 'pegasus',
    name: 'Pegasus (Great Square)',
    lines: [
      ['markab', 'scheat'],
      ['scheat', 'alpheratz'],
      ['alpheratz', 'algenib'],
      ['algenib', 'markab'],
      ['markab', 'enif']
    ]
  },
  {
    id: 'canis_major',
    name: 'Canis Major (Greater Dog)',
    lines: [
      ['sirius_a', 'mirzam'],
      ['sirius_a', 'wezen'],
      ['wezen', 'adhara'],
      ['wezen', 'aludra']
    ]
  },
  {
    id: 'lyra',
    name: 'Lyra (The Harp)',
    lines: [
      ['vega', 'sheliak'],
      ['sheliak', 'sulafat'],
      ['sulafat', 'vega']
    ]
  },
  {
    id: 'aquila',
    name: 'Aquila (The Eagle)',
    lines: [
      ['tarazed', 'altair'],
      ['altair', 'alshain']
    ]
  },
  {
    id: 'centaurus',
    name: 'Centaurus (The Centaur)',
    lines: [
      ['alpha_centauri_a', 'hadar'],
      ['hadar', 'menkent']
    ]
  },
  {
    id: 'sagittarius',
    name: 'Sagittarius (The Teapot)',
    lines: [
      ['kaus_australis', 'kaus_media'],
      ['kaus_media', 'kaus_borealis'],
      ['kaus_borealis', 'nunki'],
      ['nunki', 'ascella'],
      ['ascella', 'kaus_australis']
    ]
  },
  {
    id: 'gemini',
    name: 'Gemini (The Twins)',
    lines: [
      ['castor_a', 'pollux']
    ]
  },
  {
    id: 'bootes',
    name: 'Boötes (The Herdsman)',
    lines: [
      ['arcturus', 'denebola']
    ]
  },
  {
    id: 'andromeda',
    name: 'Andromeda',
    lines: [
      ['alpheratz', 'mirach'],
      ['mirach', 'almach']
    ]
  },
  {
    id: 'perseus',
    name: 'Perseus (The Hero)',
    lines: [
      ['mirfak', 'algol']
    ]
  }
];
