import { PALETTE } from '../theme.ts';
import { REGIONS, REGION_IDS, regionFor as sceneryRegionFor, DEFAULT_REGION } from '../scenery/regions.ts';
import type { RegionId } from '../scenery/regions.ts';
import type { TrafficStyle } from './contract.ts';

/**
 * What is on the road, region by region.
 *
 * **This table is the point of the whole directory.** Eighteen vehicles is a
 * kit; a *mix* is a place. The parts are shared — a minibus is a minibus on
 * three continents — and what makes a Malian road not a Norwegian one is which
 * of them is on it and how often, which costs nothing but weights. The scenery
 * kit learned the same thing the other way round: eight of its fourteen regions
 * build most of their fabric out of one `gabled-house` and do not look alike.
 *
 * Keyed on `RegionId` from `scenery/regions.ts` and resolved through the same
 * `regionFor(iso, continent, lat)`, so the whole project has exactly one answer
 * to "whose ground is this". Adding a region there and forgetting it here is
 * caught by `MISSING_REGIONS` below rather than by a village of no traffic.
 *
 * Two things the weights are actually saying, both of which are worth more than
 * the geometry that carries them:
 *
 * - **The two-wheeler is the world's vehicle and the car is not.** A scooter
 *   outweighs every car put together in the Mediterranean, Southeast Asia and
 *   sub-Saharan Africa, and that one weight does more for those roads than any
 *   model would.
 * - **A used white pickup is the same object on four continents.** So the
 *   regional signal in `paint` is *saturation* rather than hue: an Alpine street
 *   is silver, white and dark red; a Sahelian one is white, white and white.
 */

const P = PALETTE;

/** Tyres, sills, bumpers. Every region's, because a tyre is a tyre. */
const RUBBER = [P.bark, P.steel, P.darkOlive] as const;
/** Glass, warm darks. A windscreen catching the sky is `skyBlue`, used sparingly. */
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
      { item: 'box-truck', weight: 1 },
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
      { item: 'hand-cart', weight: 1 },
      { item: 'box-truck', weight: 2 },
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
    note: 'A white pickup, a shared minibus, and a hand-cart in the alley the pickup cannot enter.',
    paint: [P.white, P.cream, P.bone, P.sand, P.skyBlue, P.slate],
    trim: [...RUBBER],
    glass: [...GLAZING],
    metal: [P.bone, P.steel, P.sand],
    cargo: [P.tan, P.sand, P.clay, P.brown],
    road: [
      { item: 'pickup-truck', weight: 6 },
      { item: 'minibus', weight: 5 },
      { item: 'hand-cart', weight: 4 },
      { item: 'saloon-car', weight: 3 },
      { item: 'scooter', weight: 3 },
      { item: 'box-truck', weight: 2 },
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
      { item: 'hand-cart', weight: 4 },
      { item: 'bicycle', weight: 3 },
      { item: 'box-truck', weight: 3 },
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
      { item: 'box-truck', weight: 2 },
      { item: 'hand-cart', weight: 2 },
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
    note: 'Auto-rickshaws three abreast, a painted lorry, and a hand-cart holding the whole street up.',
    paint: [P.gold, P.white, P.skyBlue, P.crimson, P.cream, P.green, P.orange],
    trim: [...RUBBER],
    glass: [...GLAZING],
    metal: [P.bone, P.steel, P.gold],
    cargo: [P.tan, P.gold, P.clay, P.olive, P.sand],
    road: [
      { item: 'auto-rickshaw', weight: 9 },
      { item: 'scooter', weight: 7 },
      { item: 'bicycle', weight: 5 },
      { item: 'box-truck', weight: 4 },
      { item: 'hand-cart', weight: 4 },
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
    note: 'A kei truck backed into a gap no other vehicle would fit, bicycles, a white hatchback.',
    paint: [P.white, P.bone, P.steel, P.slate, P.crimson, P.cream],
    trim: [...RUBBER],
    glass: [...GLAZING],
    metal: [P.bone, P.steel, P.slate],
    cargo: [P.tan, P.brown, P.green, P.olive],
    road: [
      { item: 'kei-truck', weight: 7 },
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
      { item: 'kei-truck', weight: 3 },
      { item: 'minibus', weight: 3 },
      { item: 'hatchback', weight: 3 },
      { item: 'bicycle', weight: 3 },
      { item: 'box-truck', weight: 2 },
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
      { item: 'box-truck', weight: 2 },
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
    note: 'A colectivo with the door open, a pickup with people in the back, a cart on the shoulder.',
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
      { item: 'hand-cart', weight: 3 },
      { item: 'box-truck', weight: 3 },
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
      { item: 'box-truck', weight: 2 },
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
      { item: 'hand-cart', weight: 1 },
    ],
    water: [
      { item: 'fishing-boat', weight: 6 },
      { item: 'rowing-boat', weight: 4 },
    ],
    air: [],
    density: 0.12,
  },
};

/**
 * Regions the scenery kit has and this table does not.
 *
 * Empty, and the review sheet says so out loud rather than checking. A region
 * added next door and forgotten here would otherwise ship as a town with no
 * traffic in it, which looks like a placement bug for as long as it takes
 * somebody to grep.
 */
export const MISSING_REGIONS: RegionId[] = REGION_IDS.filter((id) => TRAFFIC_STYLES[id] === undefined);

export const TRAFFIC_REGION_IDS = REGION_IDS;

/**
 * The style for a place, through the scenery kit's own resolver.
 *
 * There is deliberately no second `ISO_REGIONS` in this directory. A country
 * whose houses are Maghrebi and whose traffic is Mediterranean would be a
 * second opinion about where a border is, and the project has one.
 */
export function trafficFor(iso: string, continent: string, lat: number): TrafficStyle {
  const region = sceneryRegionFor(iso, continent, lat);
  return TRAFFIC_STYLES[region.id as RegionId] ?? TRAFFIC_STYLES[DEFAULT_REGION];
}

/**
 * The countries that drive on the left, by the `iso` the country bake writes
 * (`ISO_A3`, or Natural Earth's `ADM0_A3` where there is none).
 *
 * **A country and not a region**, which is why it is a set here and not a
 * field on `TrafficStyle`: the side of the road is a law, and the regions cut
 * across it — southern Africa keeps left and the rest of `sub-saharan` keeps
 * right, Suriname and Guyana keep left beside Brazil. Everything absent keeps
 * right, which is two thirds of the world's countries and most of its roads.
 *
 * Checked against the list of left- and right-hand traffic jurisdictions,
 * 2026-09-21. Kept even where the bake draws nothing, so the list reads as
 * the law and not as an inventory: Macao and the Maldives are too small for
 * the outlines today.
 */
export const LEFT_HAND_TRAFFIC: ReadonlySet<string> = new Set([
  // Europe: Britain and Ireland, the Crown dependencies, the two sovereign
  // base areas, Cyprus north and south, Malta.
  'GBR', 'IRL', 'IMN', 'JEY', 'GGY', 'WSB', 'ESB', 'CYP', 'CYN', 'MLT',
  // Asia. Myanmar changed to the right in 1970 and is not here.
  'JPN', 'IND', 'PAK', 'BGD', 'LKA', 'NPL', 'BTN', 'MDV', 'THA', 'MYS', 'SGP', 'IDN', 'BRN', 'TLS', 'HKG', 'MAC',
  // Africa: the south and the east. Rwanda, Burundi, Somalia and Somaliland keep right.
  'ZAF', 'LSO', 'SWZ', 'BWA', 'NAM', 'ZWE', 'ZMB', 'MWI', 'MOZ', 'TZA', 'KEN', 'UGA', 'MUS', 'SYC', 'SHN',
  // The Americas: the Caribbean's British and US islands, Guyana, Suriname, the Falklands.
  'AIA', 'ATG', 'BHS', 'BRB', 'BMU', 'CYM', 'DMA', 'GRD', 'JAM', 'MSR', 'KNA', 'LCA', 'VCT', 'TTO', 'TCA', 'VGB', 'VIR',
  'GUY', 'SUR', 'FLK',
  // Oceania. Samoa changed to the left in 2009; Vanuatu, New Caledonia and
  // the US and French islands keep right.
  'AUS', 'NZL', 'PNG', 'FJI', 'SLB', 'TON', 'WSM', 'KIR', 'TUV', 'NRU', 'NIU', 'COK', 'NFK', 'PCN',
  'IOA', 'CSI', 'ATC', 'HMD',
  // The British and Australian territories in the southern oceans.
  'IOT', 'SGS',
]);

/** Whether traffic keeps to the left in the country with this `iso`. */
export const keepsLeft = (iso: string): boolean => LEFT_HAND_TRAFFIC.has(iso);

/** The scenery style beside it, for the review sheet: a car parked at a house. */
export function sceneryFor(id: RegionId) {
  return REGIONS[id];
}

export type { RegionId };
