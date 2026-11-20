import { CONSTELLATIONS } from '../data/constellations';
import { DEEP_SPACE_OBJECTS } from '../data/deepSpace';
import { STARS_CATALOG } from '../data/stars';
import type { SelectedObjectType } from '../engine/SpaceEngine';
import { PLANET_EPHEMERIS } from '../utils/ephemeris';

export const DEEP_SPACE_LABELS = {
  nebula: 'Nebula',
  galaxy: 'Galaxy',
  galacticFeature: 'Galactic feature'
};

export function planetKind(id: string) {
  return id === 'pluto' ? 'Dwarf planet' : 'Planet';
}

interface SearchResult {
  type: SelectedObjectType;
  id: string;
  name: string;
  label: string;
}

function normalize(text: string) {
  return text.normalize('NFKD').toLowerCase()
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\b(m|ngc|ic)\s+(\d+)\b/g, '$1$2')
    .trim();
}

function indexEntry(type: SelectedObjectType, item: { id: string; name: string }, label: string, terms: string[] = []) {
  const { id, name } = item;
  const aliases = [...name.matchAll(/\(([^)]+)\)/g)].flatMap(match => match[1].split('/'));
  return {
    result: { type, id, name, label },
    primary: normalize(name.split(' (', 1)[0]),
    name: normalize(name),
    aliases: [id, ...aliases].map(normalize),
    terms: [label, ...terms].map(normalize)
  };
}

const catalogue = [
  ...STARS_CATALOG.map(star => indexEntry('star', star,
    star.isBrownDwarf ? 'Brown dwarf' : `Star (${star.spectral})`,
    [star.constellation, star.stellarType ?? ''])),
  ...PLANET_EPHEMERIS.map(planet => indexEntry('planet', planet, planetKind(planet.id))),
  ...DEEP_SPACE_OBJECTS.map(object => indexEntry('deepSpace', object, DEEP_SPACE_LABELS[object.type], [object.constellation])),
  ...CONSTELLATIONS.map(constellation => indexEntry('constellation', constellation, 'Constellation'))
];

export function searchCatalogue(query: string): SearchResult[] {
  const text = normalize(query);
  if (!text) return [];

  const matches: { score: number; result: SearchResult }[] = [];
  for (const entry of catalogue) {
    let score: number;
    if (entry.primary === text || entry.name === text) score = 0;
    else if (entry.aliases.includes(text)) score = 1;
    else if (entry.primary.startsWith(text)) score = 2;
    else if (entry.name.includes(text) || entry.aliases.some(alias => alias.includes(text))) score = 3;
    else if (entry.terms.some(term => term.includes(text))) score = 4;
    else continue;
    matches.push({ score, result: entry.result });
  }
  return matches.sort((a, b) => a.score - b.score).map(match => match.result);
}
