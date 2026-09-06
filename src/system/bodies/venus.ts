/**
 * Venus: the same size as Earth and nothing else the same.
 *
 * Ninety-two atmospheres at the surface, 464 C everywhere and at every hour,
 * and a day longer than its year — 243 Earth days of rotation, **backwards**,
 * against 225 of orbit. The tilt is 177 degrees, which is the same statement:
 * the planet is upside down.
 *
 * The second axis here is **sulphur**, and the reason it is not "moisture" or
 * "dust" is the thing this directory keeps finding: *a world with no water
 * cycle has no moisture axis*, and a world with no wind worth the name has no
 * dust one either. What varies on Venus is what the rock has been doing —
 * fresh basalt, weathered crust, sulphurous flows off the volcanic rises — and
 * one thing more that no other planet in this system has, which gets its own
 * biome below.
 */

import { PALETTE } from '../../theme.ts';
import type { Body, Nation, Settlement, Species } from '../contract.ts';
import { surfaceRadiusOf } from '../contract.ts';
import { makeGround, reliefBudget } from '../ground.ts';

const RADIUS_KM = 6051.8;
const MAX_RELIEF = reliefBudget(13.9, surfaceRadiusOf(RADIUS_KM));

const GROUND = makeGround({
  secondAxis: 'sulphur',
  maxRelief: MAX_RELIEF,
  datum: MAX_RELIEF * 0.3,
  landforms: [
    // Ishtar Terra, an Australia-sized highland, and Maxwell Montes on it —
    // eleven kilometres, the highest ground on the planet and the only feature
    // on Venus named after a man.
    { name: 'Maxwell Montes', lat: 65.2, lon: 3.3, height: MAX_RELIEF * 0.68, extent: 6, shape: 1.5 },
    { name: 'Lakshmi Planum', lat: 68.6, lon: -20.7, height: MAX_RELIEF * 0.3, extent: 12, shape: 0.5 },
    { name: 'Aphrodite Terra', lat: -10, lon: 105, height: MAX_RELIEF * 0.28, extent: 30, shape: 0.7 },
    { name: 'Beta Regio', lat: 25.3, lon: -77.2, height: MAX_RELIEF * 0.34, extent: 11, shape: 1 },
    { name: 'Atla Regio', lat: 9.2, lon: -159.9, height: MAX_RELIEF * 0.32, extent: 10, shape: 1 },
    { name: 'Alpha Regio', lat: -25.5, lon: 4.5, height: MAX_RELIEF * 0.2, extent: 9, shape: 0.9 },
    { name: 'Lada Terra', lat: -60, lon: 20, height: MAX_RELIEF * 0.16, extent: 18, shape: 0.7 },
    { name: 'Diana Chasma', lat: -14.7, lon: 156, height: -MAX_RELIEF * 0.22, extent: 6, shape: 1.2 },
    { name: 'Atalanta Planitia', lat: 45.6, lon: -194.1 + 360, height: -MAX_RELIEF * 0.16, extent: 16, shape: 0.8 },
    { name: 'Guinevere Planitia', lat: 22, lon: -35, height: -MAX_RELIEF * 0.12, extent: 20, shape: 0.8 },
  ],
  roughness: MAX_RELIEF * 0.2,
  swell: MAX_RELIEF * 0.1,
  secondBase: 0.4,
  provinces: [
    { name: 'Beta Regio', lat: 25.3, lon: -77.2, weight: 0.5, extent: 16 },
    { name: 'Atla Regio', lat: 9.2, lon: -159.9, weight: 0.5, extent: 15 },
    { name: 'Themis Regio', lat: -37.4, lon: -75.6, weight: 0.4, extent: 12 },
    { name: 'Imdr Regio', lat: -43, lon: 145, weight: 0.35, extent: 10 },
    { name: 'Atalanta Planitia', lat: 45.6, lon: 165.9, weight: -0.35, extent: 20 },
    { name: 'Lavinia Planitia', lat: -47, lon: -15, weight: -0.3, extent: 18 },
  ],
  secondNoise: 0.14,
  // Venus has essentially no latitude gradient: the atmosphere is so thick it
  // moves heat round the planet faster than the ground can lose it, and the
  // poles are within a few degrees of the equator. What it does have is a
  // *lapse rate*, and it is the steepest in the solar system — which is why
  // `warmthPerDegree` is nearly nothing and `lapse` is nearly everything.
  warmthPerDegree: 1 / 900,
  lapse: 0.62,
  biomes: {
    // **Metal frost.** Above about 4.5 km the ground goes radar-bright, and the
    // best explanation is that lead and bismuth sulphides evaporate off the hot
    // lowlands and condense on the highlands. Venus has snow on its mountains
    // and it is made of metal. Nothing else here needed a biome of its own more.
    frost: { id: 'frost', color: PALETTE.bone, cover: 0.04, parts: ['iron-spire', 'wind-stone'] },
    tessera: { id: 'tessera', color: PALETTE.slate, cover: 0.07, parts: ['iron-spire', 'wind-stone'] },
    sulphur: { id: 'sulphur', color: PALETTE.gold, cover: 0.1, parts: ['sulphur-vent', 'wind-stone'] },
    lava: { id: 'lava', color: PALETTE.steel, cover: 0.06, parts: ['sulphur-vent', 'iron-spire'] },
    crust: { id: 'crust', color: PALETTE.brown, cover: 0.08, parts: ['wind-stone', 'dust-drift'] },
    plain: { id: 'plain', color: PALETTE.bark, cover: 0.05, parts: ['wind-stone', 'dust-drift'] },
  },
  classify(warmth, sulphur, elevation, maxRelief) {
    // Height beats everything, because on this planet height *is* temperature
    // and the frost line is the one sharp boundary the surface has.
    if (elevation > maxRelief * 0.6) return 'frost';
    if (elevation > maxRelief * 0.44) return 'tessera';
    if (sulphur > 0.66) return 'sulphur';
    if (sulphur > 0.5) return 'lava';
    if (warmth > 0.86) return 'plain';
    return 'crust';
  },
});

const NATIONS: readonly Nation[] = [
  { id: 'ishtar', name: 'Ishtar Terra', lat: 68, lon: -5, radius: 24, color: PALETTE.bone,
    note: 'A highland the size of Australia with the only mountain on Venus named after a man on it.' },
  { id: 'aphrodite', name: 'Aphrodite Terra', lat: -10, lon: 120, radius: 46, color: PALETTE.slate,
    note: 'Ten thousand kilometres of broken highland along the equator. Nobody agrees what made it.' },
  { id: 'beta', name: 'Beta Regio', lat: 25.3, lon: -77.2, radius: 20, color: PALETTE.gold,
    note: 'A volcanic rise with a rift down it, and probably still erupting.' },
  { id: 'lada', name: 'Lada Terra', lat: -60, lon: 20, radius: 26, color: PALETTE.clay,
    note: 'The southern highland, ringed by rifts, and the last place Venera landed.' },
  { id: 'guinevere', name: 'Guinevere Planitia', lat: 22, lon: -35, radius: 26, color: PALETTE.bark,
    note: 'Lowland basalt, flat for two thousand kilometres, resurfaced whole about half a billion years ago.' },
  { id: 'atalanta', name: 'Atalanta Planitia', lat: 46, lon: 166, radius: 24, color: PALETTE.darkOlive,
    note: 'The deepest plain on the planet, and as low and as smooth as Venus gets.' },
  { id: 'atla', name: 'Atla Regio', lat: 9.2, lon: -159.9, radius: 17, color: PALETTE.orange,
    note: 'Two shield volcanoes and the lightning to go with them. The most likely active place here.' },
];

const SETTLEMENTS: readonly Settlement[] = [
  { id: 'maxwell', name: 'Maxwell', lat: 65.2, lon: 3.3, population: 140000, nation: 'ishtar' },
  { id: 'lakshmi', name: 'Lakshmi', lat: 68.6, lon: -20.7, population: 310000, nation: 'ishtar' },
  { id: 'ovda', name: 'Ovda', lat: -3, lon: 85.6, population: 260000, nation: 'aphrodite' },
  { id: 'diana', name: 'Diana', lat: -14.7, lon: 156, population: 92000, nation: 'aphrodite' },
  { id: 'theia', name: 'Theia', lat: 22.6, lon: -78.0, population: 175000, nation: 'beta' },
  { id: 'lada-station', name: 'Lada Station', lat: -60, lon: 20, population: 48000, nation: 'lada' },
  { id: 'guinevere-flats', name: 'Guinevere Flats', lat: 22, lon: -35, population: 205000, nation: 'guinevere' },
  { id: 'atalanta-deep', name: 'Atalanta Deep', lat: 46, lon: 166, population: 66000, nation: 'atalanta' },
  { id: 'maat', name: 'Maat', lat: 0.9, lon: -165.5, population: 121000, nation: 'atla' },
];

/**
 * The Bathyd: built for ninety-two atmospheres and 8.87 m/s².
 *
 * The exact opposite reading of the Martian, off the same lever. Where 0.38 g
 * licenses tall and spindly, this is **three heads tall, a third of its height
 * in leg, and a barrel** — `depth` 1.35 against the Martian's 0.68, which is
 * the widest and the narrowest trunk in the kit and is most of what tells the
 * two apart at 300 units, where a figure is a 30-pixel dash.
 *
 * Two leg pairs and one arm pair, because at that pressure standing on four is
 * cheaper than balancing on two; a frill rather than a crest, because a frill
 * is a *horizontal* addition and the whole body is horizontal; and two eyes,
 * low and wide, because a sky that is permanently one overcast has nothing in
 * it worth looking up at.
 */
const BATHYD: Species = {
  id: 'bathyd',
  name: 'Bathyd',
  morph: {
    id: 'bathyd', name: 'Bathyd', height: 4.9, heads: 3, legShare: 0.33,
    legPairs: 2, armPairs: 1, segments: 1, shoulderShare: 0.19, hipShare: 0.185,
    depth: 1.35, neck: 'none', headSides: 8, eyes: 2, crown: 'frill', tail: 0, limbR: 0.042,
  },
  hides: [PALETTE.clay, PALETTE.brown, PALETTE.gold, PALETTE.tan, PALETTE.apricot, PALETTE.salmon],
  wears: [
    { item: 'harness', weight: 5 },
    { item: 'none', weight: 4 },
    { item: 'wrap', weight: 2 },
    { item: 'suit', weight: 1 },
  ],
  carries: [
    { item: 'none', weight: 5 },
    { item: 'vessel', weight: 3 },
    { item: 'pack', weight: 2 },
    { item: 'staff', weight: 1 },
  ],
  trims: [PALETTE.ink, PALETTE.darkOlive, PALETTE.bark],
  accents: [PALETTE.skyBlue, PALETTE.violet, PALETTE.green, PALETTE.crimson, PALETTE.white],
};

export const SPECIES: readonly Species[] = [BATHYD];

export const VENUS: Body = {
  id: 'venus',
  name: 'Venus',
  kind: 'rocky',
  orbit: 'venus',
  radiusKm: RADIUS_KM,
  // Retrograde, and the sign is the fact: the sun rises in the west here.
  rotationHours: -5832.5,
  tiltDeg: 177.36,
  gravity: 8.87,
  blurb:
    'Earth-sized, 464 degrees at every hour of a day that lasts longer than its year, ' +
    'and it turns backwards. There is metal frost on the mountains.',
  look: {
    surface: PALETTE.clay,
    highland: PALETTE.bone,
    lowland: PALETTE.bark,
    cap: PALETTE.gold,
    // The cloud deck is sulphuric acid and it never breaks, so the sky from the
    // ground is a dim orange overcast — no sun, no stars, no horizon to speak
    // of, because the air bends light far enough to lift it into a bowl.
    sky: PALETTE.orange,
  },
  ground: GROUND,
  nations: NATIONS,
  settlements: SETTLEMENTS,
  species: 'bathyd',
};
