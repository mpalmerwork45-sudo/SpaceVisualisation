interface PlanetAppearance {
  kind: string;
  summary: string;
  surfaceMap?: string;
  surfaceCredit?: string;
}

export const PLANET_APPEARANCE: Record<string, PlanetAppearance> = {
  mercury: { kind: 'Rocky planet', summary: 'A cratered, airless world. Low sunlight brings its ancient impact basins and battered surface into relief.' },
  venus: { kind: 'Cloud-covered rocky planet', summary: 'A continuous veil of pale sulphuric-acid clouds conceals the rocky surface below.' },
  earth: {
    kind: 'Ocean world',
    summary: 'Deep blue oceans, continental terrain, polar ice and bright clouds beneath a delicate blue atmospheric rim.',
    surfaceMap: 'earth-blue-marble-july.jpg',
    surfaceCredit: 'Reto Stöckli, NASA Earth Observatory'
  },
  mars: {
    kind: 'Rocky planet',
    summary: 'Rust-coloured terrain, darker volcanic regions and bright polar caps beneath a thin atmosphere.',
    surfaceMap: 'mars-viking.jpg',
    surfaceCredit: 'Viking imagery, USGS / NASA / JPL-Caltech'
  },
  jupiter: {
    kind: 'Gas giant',
    summary: 'Alternating cloud belts and zones wrap around the largest planet, with a broad red storm in the southern hemisphere.',
    surfaceMap: 'jupiter-voyager.jpg',
    surfaceCredit: 'Voyager imagery, NASA / JPL-Caltech'
  },
  saturn: { kind: 'Ringed gas giant', summary: 'Pale cloud bands framed by an intricate disc of rings. Look for the dark Cassini Division and the planet’s shadow across the rings.' },
  uranus: { kind: 'Ice giant', summary: 'A quiet blue-green atmosphere and a strongly tilted axis distinguish this distant ice giant.' },
  neptune: { kind: 'Ice giant', summary: 'A blue atmosphere crossed by subtle cloud bands. The outermost of the eight planets.' },
  pluto: {
    kind: 'Dwarf planet',
    summary: 'Bright ice plains meet dark equatorial terrain on this dwarf planet beyond Neptune.',
    surfaceMap: 'pluto-vtad.jpg',
    surfaceCredit: 'NASA Visualization Technology Applications and Development'
  }
};
