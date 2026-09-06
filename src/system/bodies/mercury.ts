/**
 * Mercury: the fast one, the hot one, and the one whose day is longer than its
 * year twice over.
 *
 * Its 3:2 spin-orbit resonance is the fact worth carrying into the world rather
 * than into a comment — 58.6 days of rotation against 88 of orbit, so a solar
 * day is **176 Earth days** and the ground under your feet spends three months
 * in daylight at 430 C and three in dark at −180. There is no atmosphere to
 * move heat between them. That is why the second axis here is **shade**: on
 * every other body the ground varies by climate, and on Mercury it varies by
 * how long the sun has ever reached it.
 */

import { PALETTE } from '../../theme.ts';
import type { Body, Nation, Settlement, Species } from '../contract.ts';
import { surfaceRadiusOf } from '../contract.ts';
import { makeGround, reliefBudget } from '../ground.ts';

const RADIUS_KM = 2439.7;
const MAX_RELIEF = reliefBudget(9.8, surfaceRadiusOf(RADIUS_KM));

/**
 * The second axis is **sun**: how much light this ground has ever had.
 *
 * On every other body the ground varies by climate. Mercury has no atmosphere
 * to carry heat, a rotation locked 3:2 to its orbit and an obliquity of two
 * hundredths of a degree, so what varies is *insolation over the whole history
 * of the planet* — and that has a shape nothing else in the solar system has.
 *
 * **The hot poles are at longitudes 0 and 180.** The resonance means the sun is
 * overhead at one of those two meridians at every perihelion, and perihelion is
 * where a 0.206-eccentricity orbit spends its energy, so those two strips get
 * two and a half times the noon flux of the meridians at 90. They are a real,
 * named, checkable feature of the real planet and they are the reason this axis
 * is longitude-driven where Mars's is latitude-driven.
 *
 * **And the cold traps are at the poles.** With no tilt, the floors of the polar
 * craters have never seen the sun, and the radar returns from them are almost
 * certainly water ice — on the hottest surface in the solar system. That is the
 * best fact about Mercury and it is two rows of a table.
 */
const GROUND = makeGround({
  secondAxis: 'sun',
  maxRelief: MAX_RELIEF,
  datum: MAX_RELIEF * 0.45,
  landforms: [
    // Caloris Planitia: 1,550 km across, one of the largest impact basins in
    // the solar system, and the antipode of it is the "weird terrain" the shock
    // waves broke when they met on the far side. Both are real and both are
    // here, because a basin with nothing opposite it is half the story.
    { name: 'Caloris Planitia', lat: 30.5, lon: -170.2, height: -MAX_RELIEF * 0.4, extent: 14, shape: 0.9 },
    { name: 'Chaotic Terrain', lat: -30.5, lon: 9.8, height: MAX_RELIEF * 0.22, extent: 12, shape: 0.8 },
    { name: 'Rembrandt', lat: -32.9, lon: 87.9, height: -MAX_RELIEF * 0.3, extent: 8, shape: 0.9 },
    { name: 'Beagle Rupes', lat: -2.1, lon: -101.2, height: MAX_RELIEF * 0.34, extent: 7, shape: 1.4 },
    { name: 'Caloris Montes', lat: 30.5, lon: -155, height: MAX_RELIEF * 0.3, extent: 5, shape: 1.2 },
  ],
  roughness: MAX_RELIEF * 0.26,
  swell: MAX_RELIEF * 0.1,
  secondBase: 0.55,
  provinces: [
    { name: 'hot pole, 0', lat: 0, lon: 0, weight: 0.34, extent: 55 },
    { name: 'hot pole, 180', lat: 0, lon: 180, weight: 0.34, extent: 55 },
    { name: 'warm pole, 90E', lat: 0, lon: 90, weight: -0.1, extent: 40 },
    { name: 'warm pole, 90W', lat: 0, lon: -90, weight: -0.1, extent: 40 },
    { name: 'north cold traps', lat: 90, lon: 0, weight: -0.72, extent: 22 },
    { name: 'south cold traps', lat: -90, lon: 0, weight: -0.72, extent: 22 },
  ],
  secondNoise: 0.1,
  warmthPerDegree: 1 / 120,
  lapse: 0.3,
  biomes: {
    ice: { id: 'ice', color: PALETTE.white, cover: 0, parts: [] },
    shadow: { id: 'shadow', color: PALETTE.steel, cover: 0.06, parts: ['wind-stone', 'iron-spire'] },
    ash: { id: 'ash', color: PALETTE.bark, cover: 0.05, parts: ['wind-stone', 'dust-drift'] },
    regolith: { id: 'regolith', color: PALETTE.bone, cover: 0.04, parts: ['wind-stone', 'dust-drift'] },
    scarp: { id: 'scarp', color: PALETTE.slate, cover: 0.03, parts: ['iron-spire', 'wind-stone'] },
    slag: { id: 'slag', color: PALETTE.brown, cover: 0.02, parts: ['wind-stone', 'iron-spire'] },
  },
  // Order: the dark beats the light, then the deep, then the high, then how
  // much sun what is left has had.
  classify(_warmth, sun, elevation, maxRelief) {
    if (sun < 0.18) return 'ice';
    if (sun < 0.34) return 'shadow';
    if (elevation < maxRelief * 0.26) return 'ash';
    if (elevation > maxRelief * 0.7) return 'scarp';
    if (sun > 0.8) return 'slag';
    return 'regolith';
  },
});

const NATIONS: readonly Nation[] = [
  { id: 'caloris', name: 'Caloris', lat: 30.5, lon: -170.2, radius: 26, color: PALETTE.bark,
    note: 'A basin 1,550 km across, filled with smooth lava and ringed by mountains the impact threw up.' },
  { id: 'chaos', name: 'The Chaotic Terrain', lat: -30.5, lon: 9.8, radius: 22, color: PALETTE.slate,
    note: 'Directly opposite Caloris. The shock went round the planet both ways and met here.' },
  { id: 'borealis', name: 'Borealis', lat: 82, lon: 0, radius: 18, color: PALETTE.white,
    note: 'Crater floors the sun has never reached, holding water ice on the hottest surface in the system.' },
  { id: 'austral-shade', name: 'Austral Shade', lat: -82, lon: 0, radius: 18, color: PALETTE.white,
    note: 'The southern half of the same accident of obliquity: a tilt of two hundredths of a degree.' },
  { id: 'rupes', name: 'The Rupes', lat: -5, lon: -95, radius: 34, color: PALETTE.brown,
    note: 'Cliffs a kilometre high running for six hundred, where the whole planet shrank as its core froze.' },
];

const SETTLEMENTS: readonly Settlement[] = [
  { id: 'caloris-floor', name: 'Caloris Floor', lat: 30.5, lon: -170.2, population: 88000, nation: 'caloris' },
  { id: 'pantheon', name: 'Pantheon', lat: 22.0, lon: -163.0, population: 34000, nation: 'caloris' },
  { id: 'antipode', name: 'Antipode', lat: -30.5, lon: 9.8, population: 21000, nation: 'chaos' },
  { id: 'coldtrap', name: 'Coldtrap', lat: 84.0, lon: 30.0, population: 15000, nation: 'borealis' },
  { id: 'southwatch', name: 'Southwatch', lat: -84.0, lon: -40.0, population: 7000, nation: 'austral-shade' },
  { id: 'beagle', name: 'Beagle', lat: -2.1, lon: -101.2, population: 46000, nation: 'rupes' },
];

/**
 * The Cinder: built for a planet that cooks for three months and freezes for
 * three.
 *
 * Low and wide — two leg pairs, three trunk segments, no neck at all — because
 * every one of those is a way of *not standing up*, and standing up on Mercury
 * is standing in the sun. It is the opposite reading of the same lever the
 * Martian uses: 0.38 g licenses tall and spindly, and here 3.7 g on a body with
 * nowhere to hide licenses long and flat. Four eyes in one row, and the crown is
 * bare because a crest is a radiator pointed at a 430 C sky.
 */
const CINDER: Species = {
  id: 'cinder',
  name: 'Cinder',
  morph: {
    id: 'cinder', name: 'Cinder', height: 4.4, heads: 3.2, legShare: 0.34,
    legPairs: 2, armPairs: 1, segments: 3, shoulderShare: 0.15, hipShare: 0.145,
    depth: 1.25, neck: 'none', headSides: 4, eyes: 4, crown: 'none', tail: 0.22, limbR: 0.036,
  },
  hides: [PALETTE.bark, PALETTE.steel, PALETTE.slate, PALETTE.darkOlive, PALETTE.brown],
  wears: [
    { item: 'suit', weight: 5 },
    { item: 'harness', weight: 3 },
    { item: 'wrap', weight: 2 },
    { item: 'none', weight: 1 },
  ],
  carries: [
    { item: 'none', weight: 4 },
    { item: 'pack', weight: 4 },
    { item: 'vessel', weight: 2 },
    { item: 'staff', weight: 1 },
  ],
  trims: [PALETTE.ink, PALETTE.bark, PALETTE.steel],
  accents: [PALETTE.orange, PALETTE.gold, PALETTE.cream, PALETTE.red],
};

export const SPECIES: readonly Species[] = [CINDER];

export const MERCURY: Body = {
  id: 'mercury',
  name: 'Mercury',
  kind: 'rocky',
  orbit: 'mercury',
  radiusKm: RADIUS_KM,
  rotationHours: 1407.6,
  tiltDeg: 0.034,
  gravity: 3.7,
  blurb:
    'A day here lasts two of its years. Four hundred and thirty degrees in the sun, ' +
    'a hundred and eighty below in the dark, and water ice in the craters at the poles.',
  look: {
    surface: PALETTE.bone,
    highland: PALETTE.slate,
    lowland: PALETTE.bark,
    cap: PALETTE.white,
    // No atmosphere means no scattering, so the sky is black at noon and the
    // stars are out. `ink` and not a blue.
    sky: PALETTE.ink,
  },
  ground: GROUND,
  nations: NATIONS,
  settlements: SETTLEMENTS,
  species: 'cinder',
};
