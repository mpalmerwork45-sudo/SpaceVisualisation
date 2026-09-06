export interface PlanetData {
  id: string;
  name: string;
  semiMajorAxisAU: number; // Orbit radius in AU
  periodYears: number;     // Orbital period in Earth years
  radiusKm: number;        // Radius in kilometers
  color: string;           // Base hex color string
  emissive?: string;
  hasRings?: boolean;
  ringInnerRadiusAU?: number;
  ringOuterRadiusAU?: number;
  ringColor?: string;
  description: string;
  moons?: number;
}

export const SOL_PLANETS: PlanetData[] = [
  {
    id: 'mercury',
    name: 'Mercury',
    semiMajorAxisAU: 0.387,
    periodYears: 0.241,
    radiusKm: 2439.7,
    color: '#a9a9a9',
    description: 'Smallest planet in the Sol system, cratered and extreme temperatures.'
  },
  {
    id: 'venus',
    name: 'Venus',
    semiMajorAxisAU: 0.723,
    periodYears: 0.615,
    radiusKm: 6051.8,
    color: '#e3bb76',
    description: 'Second planet from Sun with dense toxic carbon dioxide atmosphere and greenhouse heating.'
  },
  {
    id: 'earth',
    name: 'Earth',
    semiMajorAxisAU: 1.0,
    periodYears: 1.0,
    radiusKm: 6371.0,
    color: '#2b82c9',
    description: 'Third planet from Sun, blue water planet and sole known cradle of life.',
    moons: 1
  },
  {
    id: 'mars',
    name: 'Mars',
    semiMajorAxisAU: 1.524,
    periodYears: 1.881,
    radiusKm: 3389.5,
    color: '#c1440e',
    description: 'The Red Planet, home to Olympus Mons and Valles Marineris canyon network.',
    moons: 2
  },
  {
    id: 'jupiter',
    name: 'Jupiter',
    semiMajorAxisAU: 5.204,
    periodYears: 11.86,
    radiusKm: 69911.0,
    color: '#d8ca9d',
    hasRings: true,
    ringColor: '#bfae8f',
    description: 'Largest planet in Sol system, gas giant with Great Red Spot storm.',
    moons: 95
  },
  {
    id: 'saturn',
    name: 'Saturn',
    semiMajorAxisAU: 9.582,
    periodYears: 29.46,
    radiusKm: 58232.0,
    color: '#e4d191',
    hasRings: true,
    ringInnerRadiusAU: 0.05,
    ringOuterRadiusAU: 0.12,
    ringColor: '#c8b577',
    description: 'Gas giant famous for its expansive, brilliant icy ring system.',
    moons: 146
  },
  {
    id: 'uranus',
    name: 'Uranus',
    semiMajorAxisAU: 19.20,
    periodYears: 84.01,
    radiusKm: 25362.0,
    color: '#7bc8d4',
    hasRings: true,
    ringColor: '#a1e4ed',
    description: 'Ice giant tilted dramatically on its side by 98 degrees.',
    moons: 28
  },
  {
    id: 'neptune',
    name: 'Neptune',
    semiMajorAxisAU: 30.05,
    periodYears: 164.8,
    radiusKm: 24622.0,
    color: '#3b5ca8',
    hasRings: true,
    ringColor: '#5c7ecf',
    description: 'Outermost major planet, deep blue ice giant with supersonic winds.',
    moons: 16
  },
  {
    id: 'pluto',
    name: 'Pluto',
    semiMajorAxisAU: 39.48,
    periodYears: 248.0,
    radiusKm: 1188.3,
    color: '#c6ad94',
    description: 'Dwarf planet in Kuiper Belt with heart-shaped nitrogen ice plain Tombaugh Regio.',
    moons: 5
  }
];
