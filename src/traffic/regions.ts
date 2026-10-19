import { PALETTE } from '../theme.ts';
import { REGION_IDS, regionFor as sceneryRegionFor, DEFAULT_REGION } from '../scenery/regions.ts';
import type { RegionId } from '../scenery/regions.ts';
import type { TrafficStyle } from './contract.ts';

/**
 * What is on the road, region by region.
 *
 * The parts are shared across regions; a place is told by its mix and weights.
 * Keyed on `RegionId` and resolved through the scenery kit's `regionFor`, so
 * there is one answer to whose ground a point is. Two-wheelers dominate many
 * regions, and paint varies by saturation more than hue.
 */

const P = PALETTE;

/** Tyres, sills, bumpers, shared by every region. */
const RUBBER = [P.bark, P.steel, P.darkOlive] as const;
/** Glass, warm darks. */
const GLAZING = [P.bark, P.darkOlive, P.slate] as const;

export const TRAFFIC_STYLES: Record<RegionId, TrafficStyle> = {
  nordic: {
    id: 'nordic',
    name: 'Nordic',
    note: 'Silver estates, a bus, and more boats than cars once you reach the water.',
    paint: [P.white, P.cream, P.bone, P.slate, P.crimson, P.steel],
    trim: [...RUBBER],
    glass: [...GLAZING],
    metal: [P.bone, P.slate, P.white],
    cargo: [P.tan, P.brown, P.olive],
    road: [
      { item: 'saloon-car', weight: 6 },
      { item: 'boxy-suv', weight: 4 },
      { item: 'hatchback', weight: 3 },
      { item: 'panel-van', weight: 2 },
      { item: 'city-bus', weight: 1 },
      { item: 'farm-tractor', weight: 1 },
      { item: 'bicycle', weight: 2 },
    ],
    water: [
      { item: 'fishing-boat', weight: 5 },
      { item: 'rowing-boat', weight: 4 },
      { item: 'sailing-dinghy', weight: 2 },
    ],
    air: [{ item: 'hot-air-balloon', weight: 1 }],
    density: 0.32,
  },

  'atlantic-europe': {
    id: 'atlantic-europe',
    name: 'Atlantic Europe',
    note: 'Small hatchbacks nose to tail, a bicycle against every wall, a city bus.',
    paint: [P.white, P.bone, P.slate, P.crimson, P.steel, P.skyBlue, P.cream],
    trim: [...RUBBER],
    glass: [...GLAZING],
    metal: [P.bone, P.slate, P.steel],
    cargo: [P.tan, P.brown, P.olive, P.clay],
    road: [
      { item: 'hatchback', weight: 8 },
      { item: 'saloon-car', weight: 4 },
      { item: 'panel-van', weight: 3 },
      { item: 'bicycle', weight: 4 },
      { item: 'scooter', weight: 2 },
      { item: 'city-bus', weight: 2 },
    ],
    water: [
      { item: 'sailing-dinghy', weight: 3 },
      { item: 'rowing-boat', weight: 3 },
      { item: 'fishing-boat', weight: 3 },
    ],
    air: [{ item: 'hot-air-balloon', weight: 1 }],
    density: 0.5,
  },

  'east-europe': {
    id: 'east-europe',
    name: 'Eastern Europe',
    note: 'A boxy saloon that has been there a while, a marshrutka, a tractor on the verge.',
    paint: [P.bone, P.cream, P.slate, P.crimson, P.green, P.white, P.steel],
    trim: [...RUBBER],
    glass: [...GLAZING],
    metal: [P.bone, P.steel, P.slate],
    cargo: [P.tan, P.brown, P.gold, P.olive],
    road: [
      { item: 'saloon-car', weight: 6 },
      { item: 'hatchback', weight: 4 },
      { item: 'minibus', weight: 3 },
      { item: 'panel-van', weight: 2 },
      { item: 'farm-tractor', weight: 2 },
    ],
    water: [
      { item: 'rowing-boat', weight: 5 },
      { item: 'fishing-boat', weight: 2 },
    ],
    air: [],
    density: 0.38,
  },

  mediterranean: {
    id: 'mediterranean',
    name: 'Mediterranean',
    note: 'Scooters. Then a small hatchback, a three-wheeler, and a boat pulled up the beach.',
    paint: [P.white, P.cream, P.bone, P.crimson, P.red, P.skyBlue, P.slate],
    trim: [...RUBBER],
    glass: [...GLAZING],
    metal: [P.bone, P.slate, P.white],
    cargo: [P.tan, P.clay, P.olive, P.gold],
    road: [
      { item: 'scooter', weight: 9 },
      { item: 'hatchback', weight: 6 },
      { item: 'saloon-car', weight: 2 },
      { item: 'auto-rickshaw', weight: 2 },
      { item: 'panel-van', weight: 2 },
      { item: 'city-bus', weight: 1 },
      { item: 'bicycle', weight: 2 },
    ],
    water: [
      { item: 'rowing-boat', weight: 5 },
      { item: 'fishing-boat', weight: 4 },
      { item: 'sailing-dinghy', weight: 3 },
    ],
    air: [{ item: 'hot-air-balloon', weight: 1 }],
    density: 0.55,
  },

  maghreb: {
    id: 'maghreb',
    name: 'Maghreb',
    note: 'A white pickup, a shared minibus, and a scooter in the alley the pickup cannot enter.',
    paint: [P.white, P.cream, P.bone, P.sand, P.skyBlue, P.slate],
    trim: [...RUBBER],
    glass: [...GLAZING],
    metal: [P.bone, P.steel, P.sand],
    cargo: [P.tan, P.sand, P.clay, P.brown],
    road: [
      { item: 'pickup-truck', weight: 6 },
      { item: 'minibus', weight: 5 },
      { item: 'saloon-car', weight: 3 },
      { item: 'scooter', weight: 3 },
      { item: 'farm-tractor', weight: 1 },
    ],
    water: [
      { item: 'rowing-boat', weight: 4 },
      { item: 'fishing-boat', weight: 4 },
    ],
    air: [],
    density: 0.4,
  },

  'sub-saharan': {
    id: 'sub-saharan',
    name: 'Sub-Saharan Africa',
    note: 'The minibus is the bus service and the motorbike is the taxi. Everything else carries something.',
    paint: [P.white, P.cream, P.bone, P.skyBlue, P.gold, P.green],
    trim: [...RUBBER],
    glass: [...GLAZING],
    metal: [P.bone, P.steel, P.sand],
    cargo: [P.tan, P.sand, P.gold, P.clay, P.olive],
    road: [
      { item: 'minibus', weight: 8 },
      { item: 'scooter', weight: 7 },
      { item: 'pickup-truck', weight: 6 },
      { item: 'bicycle', weight: 3 },
      { item: 'saloon-car', weight: 2 },
    ],
    water: [
      { item: 'rowing-boat', weight: 6 },
      { item: 'fishing-boat', weight: 3 },
    ],
    air: [],
    density: 0.45,
  },

  'middle-east': {
    id: 'middle-east',
    name: 'Middle East',
    note: 'White pickups and white saloons, a big boxy four-wheel-drive, a dhow at the quay.',
    paint: [P.white, P.cream, P.bone, P.sand, P.steel, P.slate],
    trim: [...RUBBER],
    glass: [...GLAZING],
    metal: [P.bone, P.steel, P.white],
    cargo: [P.tan, P.sand, P.brown],
    road: [
      { item: 'pickup-truck', weight: 6 },
      { item: 'saloon-car', weight: 5 },
      { item: 'boxy-suv', weight: 5 },
      { item: 'minibus', weight: 3 },
    ],
    water: [
      { item: 'fishing-boat', weight: 5 },
      { item: 'rowing-boat', weight: 3 },
    ],
    air: [],
    density: 0.42,
  },

  'south-asia': {
    id: 'south-asia',
    name: 'South Asia',
    note: 'Auto-rickshaws three abreast, a painted lorry, and a scooter holding the whole street up.',
    paint: [P.gold, P.white, P.skyBlue, P.crimson, P.cream, P.green, P.orange],
    trim: [...RUBBER],
    glass: [...GLAZING],
    metal: [P.bone, P.steel, P.gold],
    cargo: [P.tan, P.gold, P.clay, P.olive, P.sand],
    road: [
      { item: 'auto-rickshaw', weight: 9 },
      { item: 'scooter', weight: 7 },
      { item: 'bicycle', weight: 5 },
      { item: 'minibus', weight: 3 },
      { item: 'hatchback', weight: 3 },
    ],
    water: [
      { item: 'rowing-boat', weight: 6 },
      { item: 'fishing-boat', weight: 3 },
    ],
    air: [],
    density: 0.75,
  },

  'east-asia': {
    id: 'east-asia',
    name: 'East Asia',
    note: 'A white pickup backed into a gap, bicycles, a white hatchback.',
    paint: [P.white, P.bone, P.steel, P.slate, P.crimson, P.cream],
    trim: [...RUBBER],
    glass: [...GLAZING],
    metal: [P.bone, P.steel, P.slate],
    cargo: [P.tan, P.brown, P.green, P.olive],
    road: [
      { item: 'pickup-truck', weight: 5 },
      { item: 'hatchback', weight: 6 },
      { item: 'bicycle', weight: 6 },
      { item: 'scooter', weight: 4 },
      { item: 'panel-van', weight: 3 },
      { item: 'city-bus', weight: 2 },
      { item: 'saloon-car', weight: 2 },
    ],
    water: [
      { item: 'fishing-boat', weight: 5 },
      { item: 'rowing-boat', weight: 3 },
    ],
    air: [],
    density: 0.62,
  },

  'southeast-asia': {
    id: 'southeast-asia',
    name: 'Southeast Asia',
    note: 'A river of scooters, a tuk-tuk in it, and a long boat wherever there is water.',
    paint: [P.white, P.cream, P.skyBlue, P.red, P.gold, P.green, P.bone],
    trim: [...RUBBER],
    glass: [...GLAZING],
    metal: [P.bone, P.steel, P.gold],
    cargo: [P.tan, P.gold, P.olive, P.clay],
    road: [
      { item: 'scooter', weight: 12 },
      { item: 'auto-rickshaw', weight: 5 },
      { item: 'pickup-truck', weight: 3 },
      { item: 'minibus', weight: 3 },
      { item: 'hatchback', weight: 3 },
      { item: 'bicycle', weight: 3 },
    ],
    water: [
      { item: 'rowing-boat', weight: 7 },
      { item: 'fishing-boat', weight: 4 },
    ],
    air: [],
    density: 0.7,
  },

  'north-america': {
    id: 'north-america',
    name: 'North America',
    note: 'A pickup in every drive and a second one beside it. Wide streets, and it shows.',
    paint: [P.white, P.bone, P.steel, P.slate, P.crimson, P.skyBlue, P.cream],
    trim: [...RUBBER],
    glass: [...GLAZING],
    metal: [P.bone, P.steel, P.slate],
    cargo: [P.tan, P.brown, P.olive],
    road: [
      { item: 'pickup-truck', weight: 8 },
      { item: 'boxy-suv', weight: 6 },
      { item: 'saloon-car', weight: 4 },
      { item: 'city-bus', weight: 2 },
      { item: 'panel-van', weight: 2 },
      { item: 'farm-tractor', weight: 1 },
    ],
    water: [
      { item: 'fishing-boat', weight: 4 },
      { item: 'rowing-boat', weight: 4 },
      { item: 'sailing-dinghy', weight: 2 },
    ],
    air: [{ item: 'hot-air-balloon', weight: 2 }],
    density: 0.48,
  },

  'latin-america': {
    id: 'latin-america',
    name: 'Latin America',
    note: 'A colectivo with the door open, a pickup with people in the back, a bicycle on the shoulder.',
    paint: [P.white, P.cream, P.skyBlue, P.red, P.gold, P.bone, P.green],
    trim: [...RUBBER],
    glass: [...GLAZING],
    metal: [P.bone, P.steel, P.sand],
    cargo: [P.tan, P.clay, P.gold, P.olive],
    road: [
      { item: 'minibus', weight: 7 },
      { item: 'pickup-truck', weight: 6 },
      { item: 'hatchback', weight: 4 },
      { item: 'auto-rickshaw', weight: 3 },
      { item: 'city-bus', weight: 2 },
    ],
    water: [
      { item: 'rowing-boat', weight: 6 },
      { item: 'fishing-boat', weight: 3 },
    ],
    air: [{ item: 'hot-air-balloon', weight: 1 }],
    density: 0.5,
  },

  oceania: {
    id: 'oceania',
    name: 'Oceania',
    note: 'A ute, a boat on a trailer that is not modelled, and a lot of empty road.',
    paint: [P.white, P.bone, P.cream, P.crimson, P.skyBlue, P.steel],
    trim: [...RUBBER],
    glass: [...GLAZING],
    metal: [P.bone, P.steel, P.slate],
    cargo: [P.tan, P.brown, P.clay, P.olive],
    road: [
      { item: 'pickup-truck', weight: 7 },
      { item: 'boxy-suv', weight: 5 },
      { item: 'saloon-car', weight: 3 },
      { item: 'hatchback', weight: 2 },
      { item: 'farm-tractor', weight: 2 },
      { item: 'city-bus', weight: 1 },
    ],
    water: [
      { item: 'sailing-dinghy', weight: 4 },
      { item: 'fishing-boat', weight: 4 },
      { item: 'rowing-boat', weight: 3 },
    ],
    air: [{ item: 'hot-air-balloon', weight: 1 }],
    density: 0.35,
  },

  polar: {
    id: 'polar',
    name: 'Polar',
    note: 'One four-wheel-drive for the settlement and a boat for everything else.',
    paint: [P.red, P.crimson, P.white, P.gold, P.skyBlue, P.bone],
    trim: [...RUBBER],
    glass: [...GLAZING],
    metal: [P.bone, P.steel, P.white],
    cargo: [P.tan, P.brown, P.olive],
    road: [
      { item: 'boxy-suv', weight: 5 },
      { item: 'pickup-truck', weight: 4 },
    ],
    water: [
      { item: 'fishing-boat', weight: 6 },
      { item: 'rowing-boat', weight: 4 },
    ],
    air: [],
    density: 0.12,
  },
};

/** Regions the scenery kit has and this table lacks; expected to be empty. */
export const MISSING_REGIONS: RegionId[] = REGION_IDS.filter((id) => TRAFFIC_STYLES[id] === undefined);

/** The style for a place, through the scenery kit's own region resolver. */
export function trafficFor(iso: string, continent: string, lat: number): TrafficStyle {
  const region = sceneryRegionFor(iso, continent, lat);
  return TRAFFIC_STYLES[region.id as RegionId] ?? TRAFFIC_STYLES[DEFAULT_REGION];
}

/**
 * Countries that drive on the left, by the `iso` the country bake writes
 * (`ISO_A3`, or `ADM0_A3` where there is none). A per-country set rather than
 * a region field, because regions cut across the law. Everything absent keeps
 * right. Countries too small to draw are listed anyway.
 */
export const LEFT_HAND_TRAFFIC: ReadonlySet<string> = new Set([
  // Europe: Britain and Ireland, the Crown dependencies, the two sovereign
  // base areas, Cyprus north and south, Malta.
  'GBR', 'IRL', 'IMN', 'JEY', 'GGY', 'WSB', 'ESB', 'CYP', 'CYN', 'MLT',
  // Asia. Myanmar keeps right.
  'JPN', 'IND', 'PAK', 'BGD', 'LKA', 'NPL', 'BTN', 'MDV', 'THA', 'MYS', 'SGP', 'IDN', 'BRN', 'TLS', 'HKG', 'MAC',
  // Africa: the south and the east. Rwanda, Burundi, Somalia and Somaliland keep right.
  'ZAF', 'LSO', 'SWZ', 'BWA', 'NAM', 'ZWE', 'ZMB', 'MWI', 'MOZ', 'TZA', 'KEN', 'UGA', 'MUS', 'SYC', 'SHN',
  // The Americas: the Caribbean's British and US islands, Guyana, Suriname, the Falklands.
  'AIA', 'ATG', 'BHS', 'BRB', 'BMU', 'CYM', 'DMA', 'GRD', 'JAM', 'MSR', 'KNA', 'LCA', 'VCT', 'TTO', 'TCA', 'VGB', 'VIR',
  'GUY', 'SUR', 'FLK',
  // Oceania. Vanuatu, New Caledonia and the US and French islands keep right.
  'AUS', 'NZL', 'PNG', 'FJI', 'SLB', 'TON', 'WSM', 'KIR', 'TUV', 'NRU', 'NIU', 'COK', 'NFK', 'PCN',
  'IOA', 'CSI', 'ATC', 'HMD',
  // The British and Australian territories in the southern oceans.
  'IOT', 'SGS',
]);

/** Whether traffic keeps to the left in the country with this `iso`. */
export const keepsLeft = (iso: string): boolean => LEFT_HAND_TRAFFIC.has(iso);

export type { RegionId };
