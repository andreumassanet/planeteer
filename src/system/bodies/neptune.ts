/**
 * Neptune, and the first body here with no ground under it at all.
 *
 * **What `radiusKm` means changes on a gas giant, and it is worth saying once
 * rather than eight times.** 24,622 km is the **1-bar level** — the depth at
 * which the pressure equals Earth's at sea level — because that is what a
 * planet with no surface is measured to. So "standing on Neptune" is standing
 * on the cloud deck, which is exactly as real as the deck `src/clouds.ts`
 * already builds over Earth and is the only honest way to make this walkable.
 * The alternative was to leave the four giants as pins nobody can land on, and
 * that is a worse answer to "the whole solar system" than a stated fiction is.
 *
 * The second axis is **methane**: how much of the deck is the bright methane-ice
 * cirrus that sits fifty kilometres above the blue. That is a real number —
 * Voyager measured the shadows those clouds cast on the deck below them, which
 * is the only place in the solar system anyone has ever seen a cloud's shadow on
 * another cloud.
 *
 * Neptune has the fastest winds measured anywhere: 2,100 km/h at the equator,
 * running **backwards** against the planet's own rotation. Everything about the
 * species below is that fact.
 */

import { PALETTE } from '../../theme.ts';
import type { Body, Nation, Settlement, Species } from '../contract.ts';
import { surfaceRadiusOf } from '../contract.ts';
import { makeGround, reliefBudget } from '../ground.ts';

const RADIUS_KM = 24622;
/** Cloud-top relief: the bright companions stand about 50 km over the deck. */
const MAX_RELIEF = reliefBudget(50, surfaceRadiusOf(RADIUS_KM));

const GROUND = makeGround({
  secondAxis: 'methane',
  maxRelief: MAX_RELIEF,
  datum: MAX_RELIEF * 0.42,
  landforms: [
    // The 1989 features, at the latitudes Voyager 2 found them. The Great Dark
    // Spot was gone by 1994 and a new one appeared in the north, which is the
    // other fact about this planet: nothing on it lasts.
    { name: 'Great Dark Spot', lat: -22, lon: 15, height: -MAX_RELIEF * 0.34, extent: 14, shape: 0.8 },
    { name: 'Scooter', lat: -42, lon: -60, height: MAX_RELIEF * 0.42, extent: 9, shape: 0.9 },
    { name: "Wizard's Eye", lat: -55, lon: 120, height: -MAX_RELIEF * 0.24, extent: 8, shape: 0.8 },
    { name: 'Northern Dark Spot', lat: 32, lon: -150, height: -MAX_RELIEF * 0.2, extent: 10, shape: 0.8 },
    { name: 'South Polar Feature', lat: -78, lon: 0, height: MAX_RELIEF * 0.28, extent: 12, shape: 0.6 },
  ],
  roughness: MAX_RELIEF * 0.22,
  swell: MAX_RELIEF * 0.16,
  secondBase: 0.45,
  provinces: [
    { name: 'south companions', lat: -42, lon: -60, weight: 0.5, extent: 20 },
    { name: 'north band', lat: 40, lon: -140, weight: 0.34, extent: 34 },
    { name: 'equatorial jet', lat: 0, lon: 150, weight: -0.4, extent: 46 },
    { name: 'Great Dark Spot', lat: -22, lon: 15, weight: -0.42, extent: 18 },
    { name: 'south collar', lat: -80, lon: 0, weight: 0.38, extent: 18 },
    { name: 'north collar', lat: 80, lon: 180, weight: 0.36, extent: 18 },
  ],
  secondNoise: 0.16,
  warmthPerDegree: 1 / 160,
  lapse: 0.5,
  biomes: {
    cirrus: { id: 'cirrus', color: PALETTE.white, cover: 0.05, parts: ['ice-plume'] },
    collar: { id: 'collar', color: PALETTE.cream, cover: 0.06, parts: ['ice-plume', 'dust-drift'] },
    deck: { id: 'deck', color: PALETTE.skyBlue, cover: 0.04, parts: ['ice-plume', 'dust-drift'] },
    band: { id: 'band', color: PALETTE.slate, cover: 0.03, parts: ['dust-drift'] },
    storm: { id: 'storm', color: PALETTE.steel, cover: 0.08, parts: ['ice-plume', 'iron-spire'] },
  },
  classify(warmth, methane, elevation, maxRelief) {
    if (elevation > maxRelief * 0.72) return 'cirrus';
    if (methane < 0.24) return 'storm';
    if (warmth < 0.42) return 'collar';
    if (methane > 0.62) return 'deck';
    return 'band';
  },
});

const NATIONS: readonly Nation[] = [
  { id: 'great-dark', name: 'The Great Dark Spot', lat: -22, lon: 15, radius: 22, color: PALETTE.steel,
    note: 'A hole in the deck the size of Earth, seen once in 1989 and gone by 1994.' },
  { id: 'scooter', name: 'Scooter', lat: -42, lon: -60, radius: 18, color: PALETTE.white,
    note: 'A bright cloud that laps the planet faster than anything around it. Nobody named it anything better.' },
  { id: 'wizard', name: "The Wizard's Eye", lat: -55, lon: 120, radius: 16, color: PALETTE.slate,
    note: 'The second dark spot, with a bright core, which is the only one of these that had one.' },
  { id: 'equator', name: 'The Equatorial Jet', lat: 0, lon: 150, radius: 30, color: PALETTE.skyBlue,
    note: 'Two thousand kilometres an hour, running backwards against the planet under it.' },
  { id: 'north-band', name: 'The Northern Band', lat: 40, lon: -140, radius: 32, color: PALETTE.bone,
    note: 'Where the wind turns round and runs with the rotation instead of against it.' },
  { id: 'south-collar', name: 'The South Polar Collar', lat: -80, lon: 0, radius: 15, color: PALETTE.cream,
    note: 'Ten degrees warmer than anywhere else on the planet, and letting methane out to space.' },
  { id: 'north-collar', name: 'The North Polar Collar', lat: 80, lon: 180, radius: 15, color: PALETTE.cream,
    note: 'The far end of the same circulation, and nobody has ever had a good look at it.' },
];

const SETTLEMENTS: readonly Settlement[] = [
  { id: 'darkspot', name: 'Darkspot', lat: -22, lon: 15, population: 84000, nation: 'great-dark' },
  { id: 'scooter-rise', name: 'Scooter Rise', lat: -42, lon: -60, population: 132000, nation: 'scooter' },
  { id: 'wizards-eye', name: "Wizard's Eye", lat: -55, lon: 120, population: 47000, nation: 'wizard' },
  { id: 'jetway', name: 'Jetway', lat: 0, lon: 150, population: 410000, nation: 'equator' },
  { id: 'counterturn', name: 'Counterturn', lat: 40, lon: -140, population: 260000, nation: 'north-band' },
  { id: 'southgate', name: 'Southgate', lat: -80, lon: 0, population: 31000, nation: 'south-collar' },
  { id: 'northgate', name: 'Northgate', lat: 80, lon: 180, population: 22000, nation: 'north-collar' },
];

/**
 * The Gale, and every number in it is the wind.
 *
 * Long, thin and light — 12.4 units to the Bathyd's 4.9, the tallest thing in
 * the kit — with a **stalk** neck and a tail more than half its own height,
 * which are the two additions that turn a body into something that streams.
 * Four eyes and no crown: a crest on a body that lives in a 2,100 km/h jet is a
 * sail, and the one part of this design that is an argument rather than a
 * decoration is that it does not have one.
 *
 * Three trunk segments, which is the other end of the range the `Morph` covers:
 * the Bathyd is one segment and a barrel, the Martian two, and this is three
 * and a ribbon. `segments` was put in the record for exactly this — the
 * segments taper *outward* on a three-segment body rather than upward, so what
 * it reads as is jointed rather than tall.
 */
const GALE: Species = {
  id: 'gale',
  name: 'Gale',
  morph: {
    id: 'gale', name: 'Gale', height: 12.4, heads: 5.6, legShare: 0.42,
    legPairs: 1, armPairs: 2, segments: 3, shoulderShare: 0.085, hipShare: 0.07,
    depth: 0.55, neck: 'stalk', headSides: 5, eyes: 4, crown: 'none', tail: 0.55, limbR: 0.016,
  },
  hides: [PALETTE.skyBlue, PALETTE.bone, PALETTE.slate, PALETTE.white, PALETTE.violet, PALETTE.cream],
  wears: [
    { item: 'cloak', weight: 4 },
    { item: 'wrap', weight: 3 },
    { item: 'none', weight: 3 },
    { item: 'harness', weight: 2 },
  ],
  carries: [
    { item: 'none', weight: 6 },
    { item: 'staff', weight: 3 },
    { item: 'pack', weight: 1 },
    { item: 'vessel', weight: 1 },
  ],
  trims: [PALETTE.steel, PALETTE.ink, PALETTE.darkOlive],
  accents: [PALETTE.pink, PALETTE.gold, PALETTE.crimson, PALETTE.orange, PALETTE.green],
};

export const SPECIES: readonly Species[] = [GALE];

export const NEPTUNE: Body = {
  id: 'neptune',
  name: 'Neptune',
  kind: 'giant',
  orbit: 'neptune',
  radiusKm: RADIUS_KM,
  rotationHours: 16.11,
  tiltDeg: 28.32,
  gravity: 11.15,
  blurb:
    'Four times Earth across and made of nothing you could stand on, so what you stand on is the cloud. ' +
    'The fastest winds anywhere, and it takes 165 years to go round once.',
  look: {
    surface: PALETTE.skyBlue,
    highland: PALETTE.white,
    lowland: PALETTE.slate,
    cap: PALETTE.cream,
    // The sun is a thirtieth as wide from here and a nine-hundredth as bright.
    // The sky over the deck is not black and it is not blue: it is the deep the
    // methane leaves after it has taken the red out.
    sky: PALETTE.violet,
  },
  ground: GROUND,
  nations: NATIONS,
  settlements: SETTLEMENTS,
  species: 'gale',
};
