import { PALETTE } from '../theme.ts';
import type { RegionStyle } from './contract.ts';

/**
 * Region to style: the table that stops Japan looking like Morocco.
 *
 * `countryAt` is exact and every ring already carries `iso` and `continent`, so
 * this needs no lookup, no raster and no new data — only a decision about the
 * *shape* of the table. It is three levels, and the third is the point:
 *
 * 1. **`ISO_REGIONS`** — a country to a style. Sparse on purpose. About a
 *    hundred entries carry nearly all the world's population and nearly all of
 *    its recognisable building.
 * 2. **`CONTINENT_REGIONS`** — the fallback, and the reason this is a table
 *    rather than a lookup. There are 242 features in the baked data and there
 *    will never be 242 authored styles, so the interesting question is not
 *    "which countries are covered" but "what does an uncovered one get". Every
 *    continent has an answer, so every country on the planet resolves to a
 *    style and none of them resolves to nothing.
 * 3. **`POLAR_LATITUDE`** — one rule, applied everywhere, that beats fifteen
 *    per-country splits. Northern Canada, northern Russia, Greenland, Svalbard,
 *    Alaska and Tromso are all treeless and all get the same answer from one
 *    line, without `CAN` having to be two entries.
 *
 * A style is data, not code: colours, a roof pitch, a storey range and weighted
 * lists of part ids. That is enough to make thirteen visibly different places
 * out of sixteen parts, and it means adding a fourteenth is an entry here rather
 * than a file anywhere.
 *
 * **What is deliberately missing.** Africa gets two styles where it should have
 * four or five, and every large country is one style from end to end — Chile is
 * the Atacama and Patagonia under one entry. Both are the same kind of gap and
 * both are fixed the same way, by adding rows. Neither is fixed by making the
 * mechanism cleverer.
 */
export type RegionId =
  | 'nordic'
  | 'atlantic-europe'
  | 'east-europe'
  | 'mediterranean'
  | 'maghreb'
  | 'sub-saharan'
  | 'middle-east'
  | 'south-asia'
  | 'east-asia'
  | 'southeast-asia'
  | 'north-america'
  | 'latin-america'
  | 'oceania'
  | 'polar';

const P = PALETTE;

export const REGIONS: Record<RegionId, RegionStyle> = {
  nordic: {
    id: 'nordic',
    name: 'Nordic',
    note: 'Falu red and white timber, steep roofs, spruce to the water.',
    walls: [P.red, P.crimson, P.cream, P.white, P.gold],
    roofs: [P.steel, P.slate, P.bark, P.darkOlive],
    trim: [P.white, P.cream, P.bark],
    glass: [P.bark, P.darkOlive],
    ground: P.green,
    foliage: [P.green, P.darkOlive, P.olive],
    stone: [P.bone, P.slate, P.steel],
    pitch: 0.95,
    hipped: 0.08,
    storeys: [1, 2],
    buildings: [
      { item: 'gabled-house', weight: 9 },
      { item: 'terrace-block', weight: 1 },
    ],
    civic: [{ item: 'steeple-church', weight: 1 }],
    trees: [
      { item: 'conifer-tree', weight: 9 },
      { item: 'broadleaf-tree', weight: 2 },
    ],
    scatter: [
      { item: 'boulder', weight: 5 },
      { item: 'shrub', weight: 3 },
    ],
    spacing: 1.5,
    greenery: 0.75,
    assets: { 'gabled-house': 'suburban-house', 'terrace-block': 'city-block' },
  },

  'atlantic-europe': {
    id: 'atlantic-europe',
    name: 'Atlantic Europe',
    note: 'Stone and render, slate roofs, a terrace street and a spire over it.',
    walls: [P.cream, P.tan, P.blush, P.white, P.sand],
    roofs: [P.slate, P.steel, P.clay, P.bark],
    trim: [P.bark, P.darkOlive, P.crimson],
    glass: [P.bark, P.darkOlive],
    ground: P.green,
    foliage: [P.green, P.olive, P.darkOlive],
    stone: [P.bone, P.slate, P.tan],
    pitch: 0.8,
    hipped: 0.35,
    storeys: [2, 4],
    buildings: [
      { item: 'gabled-house', weight: 5 },
      { item: 'terrace-block', weight: 5 },
      { item: 'tower-block', weight: 1 },
    ],
    civic: [{ item: 'steeple-church', weight: 1 }],
    trees: [
      { item: 'broadleaf-tree', weight: 8 },
      { item: 'conifer-tree', weight: 3 },
    ],
    scatter: [
      { item: 'shrub', weight: 6 },
      { item: 'boulder', weight: 2 },
    ],
    spacing: 1.15,
    greenery: 0.6,
    assets: { 'gabled-house': 'suburban-house', 'terrace-block': 'city-block', 'tower-block': 'skyscraper' },
  },

  'east-europe': {
    id: 'east-europe',
    name: 'Eastern Europe',
    note: 'Timber and stucco under dark steep roofs, birch and spruce behind.',
    walls: [P.tan, P.sand, P.cream, P.blush, P.gold],
    roofs: [P.darkOlive, P.steel, P.clay, P.bark],
    trim: [P.bark, P.brown, P.crimson],
    glass: [P.bark, P.darkOlive],
    ground: P.green,
    foliage: [P.green, P.darkOlive, P.olive],
    stone: [P.bone, P.tan, P.slate],
    pitch: 0.9,
    hipped: 0.2,
    storeys: [1, 3],
    buildings: [
      { item: 'gabled-house', weight: 6 },
      { item: 'terrace-block', weight: 3 },
      { item: 'tower-block', weight: 1 },
    ],
    civic: [{ item: 'steeple-church', weight: 1 }],
    trees: [
      { item: 'conifer-tree', weight: 6 },
      { item: 'broadleaf-tree', weight: 5 },
    ],
    scatter: [
      { item: 'shrub', weight: 5 },
      { item: 'boulder', weight: 3 },
    ],
    spacing: 1.35,
    greenery: 0.6,
    assets: { 'gabled-house': 'suburban-house', 'terrace-block': 'city-block', 'tower-block': 'skyscraper' },
  },

  mediterranean: {
    id: 'mediterranean',
    name: 'Mediterranean',
    note: 'Terracotta on shallow pitches, lime-washed walls, cypress on the ridge.',
    walls: [P.white, P.cream, P.sand, P.blush, P.apricot],
    roofs: [P.clay, P.orange, P.salmon, P.brown],
    trim: [P.skyBlue, P.darkOlive, P.brown],
    glass: [P.bark, P.brown],
    ground: P.olive,
    foliage: [P.darkOlive, P.olive, P.green],
    stone: [P.bone, P.tan, P.sand],
    pitch: 0.35,
    hipped: 0.5,
    storeys: [2, 3],
    buildings: [
      { item: 'gabled-house', weight: 3 },
      { item: 'flat-roof-house', weight: 4 },
      { item: 'terrace-block', weight: 3 },
    ],
    civic: [{ item: 'steeple-church', weight: 1 }],
    trees: [
      { item: 'cypress-tree', weight: 5 },
      { item: 'broadleaf-tree', weight: 3 },
      { item: 'palm-tree', weight: 2 },
    ],
    scatter: [
      { item: 'boulder', weight: 4 },
      { item: 'shrub', weight: 4 },
    ],
    spacing: 1.1,
    greenery: 0.4,
    assets: { 'gabled-house': 'suburban-house', 'terrace-block': 'city-block' },
  },

  maghreb: {
    id: 'maghreb',
    name: 'Maghreb',
    note: 'Flat mud-brick terraces stepped up a slope, a blue door, one minaret.',
    walls: [P.sand, P.cream, P.blush, P.tan, P.apricot],
    roofs: [P.tan, P.sand, P.brown],
    trim: [P.skyBlue, P.clay, P.bark],
    glass: [P.bark, P.brown],
    ground: P.sand,
    foliage: [P.olive, P.darkOlive, P.green],
    stone: [P.tan, P.sand, P.clay],
    pitch: 0.15,
    hipped: 0.9,
    storeys: [1, 3],
    buildings: [
      { item: 'flat-roof-house', weight: 9 },
      { item: 'terrace-block', weight: 1 },
    ],
    civic: [{ item: 'minaret-mosque', weight: 1 }],
    trees: [
      { item: 'palm-tree', weight: 8 },
      { item: 'cypress-tree', weight: 2 },
    ],
    scatter: [
      { item: 'boulder', weight: 7 },
      { item: 'shrub', weight: 2 },
    ],
    spacing: 1.0,
    greenery: 0.25,
  },

  'sub-saharan': {
    id: 'sub-saharan',
    name: 'Sub-Saharan Africa',
    note: 'Thatched round houses in a compound, mud brick, an acacia over it.',
    walls: [P.clay, P.tan, P.brown, P.sand],
    roofs: [P.darkOlive, P.sand, P.brown, P.steel],
    trim: [P.bark, P.brown, P.orange],
    glass: [P.bark, P.darkOlive],
    ground: P.olive,
    foliage: [P.olive, P.darkOlive, P.green],
    stone: [P.clay, P.tan, P.brown],
    pitch: 0.85,
    hipped: 0.1,
    storeys: [1, 2],
    buildings: [
      { item: 'round-hut', weight: 7 },
      { item: 'flat-roof-house', weight: 3 },
    ],
    civic: [{ item: 'minaret-mosque', weight: 1 }],
    trees: [
      { item: 'broadleaf-tree', weight: 6 },
      { item: 'palm-tree', weight: 3 },
    ],
    scatter: [
      { item: 'shrub', weight: 6 },
      { item: 'boulder', weight: 4 },
    ],
    spacing: 1.45,
    greenery: 0.35,
  },

  'middle-east': {
    id: 'middle-east',
    name: 'Middle East',
    note: 'Sand-coloured cubes and parapets, date palms, a dome and a minaret.',
    walls: [P.sand, P.tan, P.cream, P.white, P.blush],
    roofs: [P.tan, P.sand, P.brown],
    trim: [P.brown, P.clay, P.bark],
    glass: [P.bark, P.brown],
    ground: P.sand,
    foliage: [P.olive, P.darkOlive, P.green],
    stone: [P.tan, P.sand, P.bone],
    pitch: 0.15,
    hipped: 0.9,
    storeys: [1, 3],
    buildings: [
      { item: 'flat-roof-house', weight: 8 },
      { item: 'terrace-block', weight: 2 },
      { item: 'tower-block', weight: 1 },
    ],
    civic: [{ item: 'minaret-mosque', weight: 1 }],
    trees: [
      { item: 'palm-tree', weight: 7 },
      { item: 'cypress-tree', weight: 3 },
    ],
    scatter: [
      { item: 'boulder', weight: 6 },
      { item: 'shrub', weight: 2 },
    ],
    spacing: 1.05,
    greenery: 0.2,
  },

  'south-asia': {
    id: 'south-asia',
    name: 'South Asia',
    note: 'Painted concrete in every colour, flat roofs stacked, banyan and palm.',
    walls: [P.cream, P.blush, P.apricot, P.salmon, P.white],
    roofs: [P.clay, P.orange, P.steel, P.brown],
    trim: [P.crimson, P.olive, P.bark],
    glass: [P.bark, P.brown],
    ground: P.green,
    foliage: [P.green, P.olive, P.darkOlive],
    stone: [P.tan, P.brown, P.bone],
    pitch: 0.25,
    hipped: 0.7,
    storeys: [1, 3],
    buildings: [
      { item: 'flat-roof-house', weight: 6 },
      { item: 'terrace-block', weight: 3 },
      { item: 'round-hut', weight: 2 },
    ],
    civic: [{ item: 'minaret-mosque', weight: 1 }],
    trees: [
      { item: 'broadleaf-tree', weight: 6 },
      { item: 'palm-tree', weight: 5 },
    ],
    scatter: [
      { item: 'shrub', weight: 6 },
      { item: 'boulder', weight: 2 },
    ],
    spacing: 1.0,
    greenery: 0.45,
  },

  'east-asia': {
    id: 'east-asia',
    name: 'East Asia',
    note: 'Deep dark eaves over pale plaster, timber posts, a pagoda above the roofs.',
    walls: [P.white, P.cream, P.tan, P.bone],
    roofs: [P.slate, P.steel, P.bark, P.darkOlive],
    trim: [P.bark, P.crimson, P.brown],
    glass: [P.darkOlive, P.bark],
    ground: P.green,
    foliage: [P.green, P.darkOlive, P.olive],
    stone: [P.slate, P.bone, P.steel],
    pitch: 0.45,
    hipped: 0.85,
    storeys: [1, 3],
    buildings: [
      { item: 'machiya', weight: 7 },
      { item: 'terrace-block', weight: 2 },
      { item: 'tower-block', weight: 3 },
    ],
    civic: [{ item: 'pagoda', weight: 1 }],
    trees: [
      { item: 'broadleaf-tree', weight: 6 },
      { item: 'conifer-tree', weight: 4 },
    ],
    scatter: [
      { item: 'shrub', weight: 6 },
      { item: 'boulder', weight: 4 },
    ],
    spacing: 1.0,
    greenery: 0.5,
  },

  'southeast-asia': {
    id: 'southeast-asia',
    name: 'Southeast Asia',
    note: 'Houses on posts over wet ground, steep thatch, palms above everything.',
    walls: [P.tan, P.cream, P.apricot, P.blush, P.brown],
    roofs: [P.darkOlive, P.sand, P.clay, P.steel],
    trim: [P.bark, P.brown, P.crimson],
    glass: [P.bark, P.darkOlive],
    ground: P.green,
    foliage: [P.green, P.olive, P.darkOlive],
    stone: [P.tan, P.brown, P.slate],
    pitch: 1.0,
    hipped: 0.25,
    storeys: [1, 2],
    buildings: [
      { item: 'stilt-house', weight: 7 },
      { item: 'flat-roof-house', weight: 2 },
      { item: 'terrace-block', weight: 1 },
    ],
    civic: [{ item: 'pagoda', weight: 1 }],
    trees: [
      { item: 'palm-tree', weight: 8 },
      { item: 'broadleaf-tree', weight: 4 },
    ],
    scatter: [
      { item: 'shrub', weight: 8 },
      { item: 'boulder', weight: 1 },
    ],
    spacing: 1.3,
    greenery: 0.7,
  },

  'north-america': {
    id: 'north-america',
    name: 'North America',
    note: 'Painted clapboard on wide plots, a white spire, a block downtown.',
    walls: [P.white, P.cream, P.blush, P.skyBlue, P.gold],
    roofs: [P.steel, P.slate, P.bark, P.darkOlive],
    trim: [P.white, P.bark, P.crimson],
    glass: [P.bark, P.darkOlive],
    ground: P.green,
    foliage: [P.green, P.darkOlive, P.olive],
    stone: [P.slate, P.bone, P.tan],
    pitch: 0.7,
    hipped: 0.3,
    storeys: [1, 2],
    buildings: [
      { item: 'gabled-house', weight: 7 },
      { item: 'terrace-block', weight: 2 },
      { item: 'tower-block', weight: 2 },
    ],
    civic: [{ item: 'steeple-church', weight: 1 }],
    trees: [
      { item: 'broadleaf-tree', weight: 6 },
      { item: 'conifer-tree', weight: 5 },
    ],
    scatter: [
      { item: 'shrub', weight: 5 },
      { item: 'boulder', weight: 3 },
    ],
    spacing: 1.6,
    greenery: 0.65,
    assets: { 'gabled-house': 'suburban-house', 'terrace-block': 'city-block', 'tower-block': 'skyscraper' },
  },

  'latin-america': {
    id: 'latin-america',
    name: 'Latin America',
    note: 'Bright render and terracotta on a grid, palms in the square, one bell tower.',
    walls: [P.cream, P.blush, P.apricot, P.salmon, P.skyBlue, P.white],
    roofs: [P.clay, P.orange, P.steel, P.brown],
    trim: [P.crimson, P.bark, P.olive],
    glass: [P.bark, P.brown],
    ground: P.green,
    foliage: [P.green, P.olive, P.darkOlive],
    stone: [P.tan, P.clay, P.bone],
    pitch: 0.3,
    hipped: 0.65,
    storeys: [1, 3],
    buildings: [
      { item: 'flat-roof-house', weight: 6 },
      { item: 'gabled-house', weight: 2 },
      { item: 'terrace-block', weight: 3 },
    ],
    civic: [{ item: 'steeple-church', weight: 1 }],
    trees: [
      { item: 'palm-tree', weight: 6 },
      { item: 'broadleaf-tree', weight: 5 },
    ],
    scatter: [
      { item: 'shrub', weight: 5 },
      { item: 'boulder', weight: 3 },
    ],
    spacing: 1.15,
    greenery: 0.45,
    assets: { 'gabled-house': 'suburban-house', 'terrace-block': 'city-block' },
  },

  oceania: {
    id: 'oceania',
    name: 'Oceania',
    note: 'Low hipped bungalows under corrugated iron, gum trees, a lot of air.',
    walls: [P.cream, P.white, P.blush, P.sand, P.green],
    roofs: [P.steel, P.crimson, P.darkOlive, P.slate],
    trim: [P.white, P.bark, P.brown],
    glass: [P.bark, P.darkOlive],
    ground: P.olive,
    foliage: [P.olive, P.green, P.darkOlive],
    stone: [P.clay, P.orange, P.tan],
    pitch: 0.45,
    hipped: 0.7,
    storeys: [1, 2],
    buildings: [
      { item: 'gabled-house', weight: 8 },
      { item: 'terrace-block', weight: 1 },
      { item: 'tower-block', weight: 1 },
    ],
    civic: [{ item: 'steeple-church', weight: 1 }],
    trees: [
      { item: 'broadleaf-tree', weight: 7 },
      { item: 'palm-tree', weight: 3 },
    ],
    scatter: [
      { item: 'shrub', weight: 5 },
      { item: 'boulder', weight: 4 },
    ],
    spacing: 1.7,
    greenery: 0.5,
    assets: { 'gabled-house': 'suburban-house', 'terrace-block': 'city-block', 'tower-block': 'skyscraper' },
  },

  polar: {
    id: 'polar',
    name: 'Polar',
    note: 'A dozen painted huts on bare rock, no trees, the boulders win.',
    walls: [P.red, P.crimson, P.gold, P.cream, P.skyBlue],
    roofs: [P.white, P.cream, P.bone, P.steel],
    trim: [P.white, P.bark],
    glass: [P.bark, P.darkOlive],
    ground: P.cream,
    foliage: [P.darkOlive, P.green],
    stone: [P.bone, P.slate, P.white],
    pitch: 1.0,
    hipped: 0.05,
    storeys: [1, 1],
    buildings: [
      { item: 'gabled-house', weight: 9 },
      { item: 'round-hut', weight: 1 },
    ],
    civic: [{ item: 'steeple-church', weight: 1 }],
    trees: [{ item: 'conifer-tree', weight: 1 }],
    scatter: [
      { item: 'boulder', weight: 9 },
      { item: 'shrub', weight: 1 },
    ],
    spacing: 1.9,
    greenery: 0.06,
  },
};

/**
 * Country to style. Codes are `iso` as the bake writes it: real ISO A3 where
 * Natural Earth has one, `ADM0_A3` where it left `-99`. Both are unique and
 * `pnpm check` asserts it, which is why a table can be keyed on them at all —
 * an earlier fallback collided and put the Norwegian flag over Nicosia.
 *
 * **Only codes that exist in the current bake are listed.** Monaco, the Vatican,
 * Gibraltar, Macao and the Maldives are all real countries with real ISO codes
 * and none of them is a feature at any scale this project has read, so an entry
 * for them would be a line that can never fire — and the review sheet's "unknown
 * code" warning would then be permanently red, which is the same as not having
 * it.
 */
export const ISO_REGIONS: Record<string, RegionId> = {
  // Nordic
  NOR: 'nordic', SWE: 'nordic', FIN: 'nordic', DNK: 'nordic', ISL: 'nordic',
  EST: 'nordic', LVA: 'nordic', LTU: 'nordic', FRO: 'nordic', ALA: 'nordic',

  // Atlantic Europe
  GBR: 'atlantic-europe', IRL: 'atlantic-europe', FRA: 'atlantic-europe',
  BEL: 'atlantic-europe', NLD: 'atlantic-europe', LUX: 'atlantic-europe',
  DEU: 'atlantic-europe', CHE: 'atlantic-europe', AUT: 'atlantic-europe',
  LIE: 'atlantic-europe', IMN: 'atlantic-europe', JEY: 'atlantic-europe',
  GGY: 'atlantic-europe',

  // Eastern Europe
  POL: 'east-europe', CZE: 'east-europe', SVK: 'east-europe', HUN: 'east-europe',
  ROU: 'east-europe', BGR: 'east-europe', UKR: 'east-europe', BLR: 'east-europe',
  RUS: 'east-europe', MDA: 'east-europe', SRB: 'east-europe', BIH: 'east-europe',
  MKD: 'east-europe', KOS: 'east-europe', GEO: 'east-europe', ARM: 'east-europe',
  AZE: 'east-europe', MNG: 'east-europe', KAZ: 'east-europe',

  // Mediterranean
  ESP: 'mediterranean', PRT: 'mediterranean', ITA: 'mediterranean',
  GRC: 'mediterranean', HRV: 'mediterranean', SVN: 'mediterranean',
  ALB: 'mediterranean', MNE: 'mediterranean', MLT: 'mediterranean',
  CYP: 'mediterranean', CYN: 'mediterranean', TUR: 'mediterranean',
  AND: 'mediterranean', SMR: 'mediterranean',

  // Maghreb
  MAR: 'maghreb', DZA: 'maghreb', TUN: 'maghreb', LBY: 'maghreb',
  EGY: 'maghreb', MRT: 'maghreb', ESH: 'maghreb',

  // Sub-Saharan Africa
  MLI: 'sub-saharan', NER: 'sub-saharan', TCD: 'sub-saharan', SDN: 'sub-saharan',
  SSD: 'sub-saharan', BFA: 'sub-saharan', SEN: 'sub-saharan',
  GMB: 'sub-saharan', GNB: 'sub-saharan', GIN: 'sub-saharan', SLE: 'sub-saharan',
  LBR: 'sub-saharan', CIV: 'sub-saharan', GHA: 'sub-saharan', TGO: 'sub-saharan',
  BEN: 'sub-saharan', NGA: 'sub-saharan', CMR: 'sub-saharan', CAF: 'sub-saharan',
  ETH: 'sub-saharan', ERI: 'sub-saharan', DJI: 'sub-saharan', SOM: 'sub-saharan',
  SOL: 'sub-saharan', KEN: 'sub-saharan', UGA: 'sub-saharan', TZA: 'sub-saharan',
  RWA: 'sub-saharan', BDI: 'sub-saharan', COD: 'sub-saharan', COG: 'sub-saharan',
  GAB: 'sub-saharan', GNQ: 'sub-saharan', AGO: 'sub-saharan', ZMB: 'sub-saharan',
  MWI: 'sub-saharan', MOZ: 'sub-saharan', ZWE: 'sub-saharan', BWA: 'sub-saharan',
  NAM: 'sub-saharan', ZAF: 'sub-saharan', LSO: 'sub-saharan', SWZ: 'sub-saharan',
  MDG: 'sub-saharan',

  // Middle East
  SAU: 'middle-east', IRN: 'middle-east', IRQ: 'middle-east', ARE: 'middle-east',
  JOR: 'middle-east', ISR: 'middle-east', PSE: 'middle-east', SYR: 'middle-east',
  LBN: 'middle-east', OMN: 'middle-east', QAT: 'middle-east', KWT: 'middle-east',
  BHR: 'middle-east', YEM: 'middle-east', AFG: 'middle-east', TKM: 'middle-east',
  UZB: 'middle-east', TJK: 'middle-east', KGZ: 'middle-east',

  // South Asia
  IND: 'south-asia', PAK: 'south-asia', BGD: 'south-asia', NPL: 'south-asia',
  LKA: 'south-asia', BTN: 'south-asia',

  // East Asia
  JPN: 'east-asia', KOR: 'east-asia', PRK: 'east-asia', CHN: 'east-asia',
  TWN: 'east-asia', HKG: 'east-asia',

  // Southeast Asia
  THA: 'southeast-asia', VNM: 'southeast-asia', LAO: 'southeast-asia',
  KHM: 'southeast-asia', MMR: 'southeast-asia', MYS: 'southeast-asia',
  IDN: 'southeast-asia', PHL: 'southeast-asia', SGP: 'southeast-asia',
  BRN: 'southeast-asia', TLS: 'southeast-asia', PNG: 'southeast-asia',

  // The Americas
  USA: 'north-america', CAN: 'north-america',
  MEX: 'latin-america', BRA: 'latin-america', ARG: 'latin-america',
  CHL: 'latin-america', COL: 'latin-america', PER: 'latin-america',
  VEN: 'latin-america', ECU: 'latin-america', BOL: 'latin-america',
  PRY: 'latin-america', URY: 'latin-america', GUY: 'latin-america',
  SUR: 'latin-america', CUB: 'latin-america', DOM: 'latin-america',
  HTI: 'latin-america', JAM: 'latin-america', GTM: 'latin-america',
  HND: 'latin-america', SLV: 'latin-america', NIC: 'latin-america',
  CRI: 'latin-america', PAN: 'latin-america', BLZ: 'latin-america',

  // Oceania
  AUS: 'oceania', NZL: 'oceania', FJI: 'oceania', SLB: 'oceania',
  VUT: 'oceania', NCL: 'oceania', PYF: 'oceania', WSM: 'oceania',
  TON: 'oceania', KIR: 'oceania', FSM: 'oceania', PLW: 'oceania',

  // Polar
  ATA: 'polar', GRL: 'polar', ATF: 'polar', SGS: 'polar', HMD: 'polar',
  FLK: 'polar',
};

/** The safety net. Every continent in the baked data has an entry; see the note above. */
export const CONTINENT_REGIONS: Record<string, RegionId> = {
  Europe: 'atlantic-europe',
  Asia: 'middle-east',
  Africa: 'sub-saharan',
  // The named entries take the USA and Canada, so this catches Central America
  // and the Caribbean — which is why it is not 'north-america'.
  'North America': 'latin-america',
  'South America': 'latin-america',
  Oceania: 'oceania',
  Antarctica: 'polar',
  'Seven seas (open ocean)': 'oceania',
};

export const DEFAULT_REGION: RegionId = 'atlantic-europe';

/**
 * Above the Arctic Circle and below the Antarctic convergence, nothing grows and
 * everything is painted so it can be found in the snow.
 */
export const POLAR_LATITUDE = 66.5;
const ANTARCTIC_LATITUDE = -58;

/**
 * The style at a place.
 *
 * Latitude last and latitude first: it is the last argument and the first test,
 * because a rule about the whole planet should not have to be repeated in every
 * row of a table about countries.
 */
export function regionFor(iso: string, continent: string, lat: number): RegionStyle {
  if (lat >= POLAR_LATITUDE || lat <= ANTARCTIC_LATITUDE) return REGIONS.polar;
  const id = ISO_REGIONS[iso] ?? CONTINENT_REGIONS[continent] ?? DEFAULT_REGION;
  return REGIONS[id];
}

export const REGION_IDS = Object.keys(REGIONS) as RegionId[];

/**
 * Species that only grow where they are from.
 *
 * **`BIOMES[id].plants` in `biome.ts` is per biome and a biome has no
 * continent.** That is the right split — climate decides what *kind* of thing
 * grows and this table has no business restating it — but it means the desert
 * list is one list for the Sonoran and the Sahara both, and a saguaro is
 * American. Left alone, `vegetation.ts` stands one outside Timbuktu.
 *
 * So the join happens here, in the layer that already knows whose ground it is,
 * and it is a gate rather than a second table of what grows: an id that is not
 * named below grows wherever its biome puts it, and an id that is named grows in
 * the listed regions and nowhere else. Two definitions of *what grows where*
 * would be a pine forest on a sand dune; one definition plus a range map is what
 * a flora actually is.
 *
 * Only the cases where the mistake is recognisable are worth an entry. An
 * umbrella acacia deliberately has none: the same shape stands in the cerrado
 * and the Australian interior, and gating it to Africa would empty two savannas
 * to fix a nuance nobody can see.
 */
export const NATIVE_TO: Record<string, readonly RegionId[]> = {
  cactus: ['north-america', 'latin-america'],
};

/** Whether a plant may grow in this region. Anything unlisted may grow anywhere. */
export function nativeHere(plantId: string, region: RegionId): boolean {
  const range = NATIVE_TO[plantId];
  return range === undefined || range.includes(region);
}

/** Countries the table names for one region, for the review sheet. */
export function isoCodesFor(id: RegionId): string[] {
  return Object.entries(ISO_REGIONS)
    .filter(([, region]) => region === id)
    .map(([iso]) => iso)
    .sort();
}
