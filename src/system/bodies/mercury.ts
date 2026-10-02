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
 *
 * And it is why the people live where they live. The terminator — the line
 * between that day and that night — crosses the equator at about 3.6 km an
 * hour (15,329 km of circumference over 4,224 hours of solar day), which is a
 * walking pace. Everything about the Cinder below, from their mirrored roofs to
 * their radiator frills to the two biggest towns standing on the warm poles,
 * is an answer to that one number. **The species, the nations' notes, the
 * towns' names and their populations are invented**; every coordinate is a
 * real feature's, east-positive, from the MESSENGER-era tables.
 */

import { PALETTE } from '../../theme.ts';
import type { Body, BodyBiome, GroundModel, GroundSample, Nation, Settlement, Species } from '../contract.ts';
import { surfaceRadiusOf } from '../contract.ts';
import { makeGround, reliefBudget } from '../ground.ts';
import { clamp, fbm, onSphere, smoothstep } from '../noise.ts';
import { toUnit } from '../../sphere.ts';
import { grownTowns } from '../towns.ts';

const RADIUS_KM = 2439.7;
const MAX_RELIEF = reliefBudget(9.8, surfaceRadiusOf(RADIUS_KM));

/**
 * What the ground is made of, and the colours are the planet's own.
 *
 * Mercury is grey with a brown cast — darker than the Moon, and the darkest
 * thing on it is the *low-reflectance material* dug up by the big impacts —
 * while its smooth volcanic plains are a shade lighter and warmer. Against that
 * two things are bright, and they are the two the world adds over the table
 * `makeGround` classifies:
 *
 * - **rays**, the fresh ejecta of young craters, laid out in streaks hundreds
 *   of kilometres long. Hokusai's run over a third of the northern hemisphere;
 * - **hollows**, the one landform found nowhere else in the solar system:
 *   shallow, flat-floored, rimless pits a few hundred metres across, bright and
 *   faintly blue, eaten into crater floors by something in the rock that boils
 *   off in the sun. They are young enough to be forming now.
 */
const BIOMES: Record<string, BodyBiome> = {
  ice: { id: 'ice', color: PALETTE.white, cover: 0.05, parts: ['mercury-ice-shard'] },
  shadow: { id: 'shadow', color: PALETTE.steel, cover: 0.05, parts: ['mercury-ice-shard', 'mercury-ejecta-block'] },
  ash: { id: 'ash', color: PALETTE.bone, cover: 0.03, parts: ['mercury-ejecta-block'] },
  regolith: { id: 'regolith', color: PALETTE.tan, cover: 0.04, parts: ['mercury-ejecta-block', 'mercury-melt-glass'] },
  scarp: { id: 'scarp', color: PALETTE.slate, cover: 0.07, parts: ['mercury-thrust-slab', 'mercury-ejecta-block'] },
  slag: { id: 'slag', color: PALETTE.brown, cover: 0.05, parts: ['mercury-melt-glass'] },
  rays: { id: 'rays', color: PALETTE.white, cover: 0.08, parts: ['mercury-ejecta-block'] },
  hollows: { id: 'hollows', color: PALETTE.skyBlue, cover: 0.14, parts: ['mercury-hollow-glint'] },
};

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
const BASE = makeGround({
  secondAxis: 'sun',
  maxRelief: MAX_RELIEF,
  datum: MAX_RELIEF * 0.45,
  landforms: [
    // Caloris Planitia: 1,550 km across, one of the largest impact basins in
    // the solar system, and the antipode of it is the "weird terrain" the shock
    // waves broke when they met on the far side. Both are real and both are
    // here, because a basin with nothing opposite it is half the story.
    //
    // **Longitudes are east-positive, as on every body in `src/system/`**,
    // and Mercury's are the ones a source is most likely to hand over the other
    // way: Mariner 10's maps counted west, so Caloris is "189.8 W" there, which
    // is 170.2 E. It was written -170.2, which mirrored the basin, its antipode,
    // its mountains and Beagle Rupes across the prime meridian while Rembrandt,
    // taken from MESSENGER's east-positive table, stayed where it is.
    { name: 'Caloris Planitia', lat: 30.5, lon: 170.2, height: -MAX_RELIEF * 0.4, extent: 14, shape: 0.9 },
    { name: 'Chaotic Terrain', lat: -30.5, lon: -9.8, height: MAX_RELIEF * 0.22, extent: 12, shape: 0.8 },
    { name: 'Rembrandt', lat: -32.9, lon: 87.9, height: -MAX_RELIEF * 0.3, extent: 8, shape: 0.9 },
    // 0.4 and not the 0.34 it was on the mirrored side, where the noise under
    // it happened to add sixty units: at its real longitude the scarp came out
    // 508 against the 515 `classify` calls high ground, and `pnpm system`
    // holds it to being a scarp.
    { name: 'Beagle Rupes', lat: -2.1, lon: 101.2, height: MAX_RELIEF * 0.4, extent: 7, shape: 1.4 },
    { name: 'Caloris Montes', lat: 30.5, lon: 155, height: MAX_RELIEF * 0.3, extent: 5, shape: 1.2 },
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
  biomes: BIOMES,
  // Order: the dark beats the light, then the deep, then the high, then how
  // much sun what is left has had. Rays and hollows are laid over this below.
  classify(_warmth, sun, elevation, maxRelief) {
    if (sun < 0.18) return 'ice';
    if (sun < 0.34) return 'shadow';
    if (elevation < maxRelief * 0.26) return 'ash';
    if (elevation > maxRelief * 0.7) return 'scarp';
    if (sun > 0.8) return 'slag';
    return 'regolith';
  },
});

/**
 * A point of the sphere with its own tangent frame, so a pattern can be laid
 * out *round* it: an angle about the centre as well as a distance from it.
 */
interface Centre {
  name: string;
  x: number;
  y: number;
  z: number;
  /** Tangent unit vectors at the centre: toward the north pole, and across it. */
  north: [number, number, number];
  across: [number, number, number];
}

function centreAt(name: string, lat: number, lon: number): Centre {
  const [x, y, z] = onSphere(lat, lon);
  // North is the pole's direction with the radial part taken out; `across` is
  // the third axis of the frame. Neither is ever near zero here: no centre in
  // this file is within two degrees of a pole.
  let nx = -x * y;
  let ny = 1 - y * y;
  let nz = -z * y;
  const n = Math.hypot(nx, ny, nz);
  nx /= n;
  ny /= n;
  nz /= n;
  return { name, x, y, z, north: [nx, ny, nz], across: [y * nz - z * ny, z * nx - x * nz, x * ny - y * nx] };
}

/**
 * The ray systems: the three youngest big craters, and the brightest things
 * on the planet after the poles' ice.
 *
 * Hokusai (57.8 N, 16.8 E, 114 km) has rays MESSENGER traced for more than a
 * thousand kilometres; Kuiper (11.3 S, 31.4 W, 62 km) was the brightest spot
 * Mariner 10 saw; Debussy (33.9 S, 12.5 W, 80 km) throws its rays across the
 * Chaotic Terrain. `crater` is the rim's angular radius and `reach` how far the
 * longest streak runs, both in degrees. The streaks are noise round the circle
 * — a ray system is not a regular star and a regular one reads as a logo.
 */
const RAYS = [
  { centre: centreAt('Hokusai', 57.8, 16.8), crater: 1.34, reach: 24, seed: 1.7 },
  { centre: centreAt('Kuiper', -11.3, -31.4), crater: 0.73, reach: 9, seed: 6.1 },
  { centre: centreAt('Debussy', -33.9, -12.5), crater: 0.94, reach: 11, seed: 9.4 },
] as const;

/**
 * Where hollows have been mapped, and only inside the crater that holds them:
 * Tyagaraja's floor (3.7 N, 148.9 W) is the type locality, Raditladi's peak
 * ring (27.3 N, 119.1 E) and Eminescu's (10.6 N, 114.1 E) are two of the
 * brightest. `radius` is the crater's own, degrees; the pits are noise inside
 * it, because hollows come in clusters with plain floor between.
 */
const HOLLOWS = [
  { centre: centreAt('Tyagaraja', 3.7, -148.9), radius: 1.0 },
  { centre: centreAt('Raditladi', 27.3, 119.1), radius: 2.6 },
  { centre: centreAt('Eminescu', 10.6, 114.1), radius: 1.3 },
] as const;

const DEG = Math.PI / 180;
const RAY_COS = RAYS.map((r) => Math.cos(r.reach * DEG));
const HOLLOW_COS = HOLLOWS.map((h) => Math.cos(h.radius * DEG));
const point: [number, number, number] = [0, 0, 0];

/** 0 to 1: how bright with fresh ejecta a point is. `point` holds its unit vector. */
function raysAt(): number {
  const [x, y, z] = point;
  let best = 0;
  for (let k = 0; k < RAYS.length; k++) {
    const ray = RAYS[k]!;
    const c = ray.centre;
    const dot = x * c.x + y * c.y + z * c.z;
    if (dot <= RAY_COS[k]!) continue;
    const away = Math.acos(clamp(dot, -1, 1)) / DEG;
    const theta = Math.atan2(x * c.across[0] + y * c.across[1] + z * c.across[2], x * c.north[0] + y * c.north[1] + z * c.north[2]);
    const ca = Math.cos(theta);
    const sa = Math.sin(theta);
    // The continuous blanket out to about two crater radii, its edge ragged.
    const blanket = 1 - smoothstep(1.6, 2.6, away / ray.crater + fbm(ca * 2, sa * 2, ray.seed, 2) * 1.5);
    // The streaks: which bearings carry one, and how far each runs.
    const streak = smoothstep(0.04, 0.14, fbm(ca * 4.2, sa * 4.2, ray.seed * 3.1, 3));
    const length = ray.reach * (0.35 + 0.65 * clamp(0.5 + fbm(ca * 1.2, sa * 1.2, ray.seed + 11, 2) * 1.6, 0, 1));
    const run = streak * (1 - smoothstep(length * 0.55, length, away));
    best = Math.max(best, blanket, run);
  }
  return best;
}

/** 0 to 1: how much of a point is hollows. `point` holds its unit vector. */
function hollowsAt(): number {
  const [x, y, z] = point;
  for (let k = 0; k < HOLLOWS.length; k++) {
    const c = HOLLOWS[k]!.centre;
    if (x * c.x + y * c.y + z * c.z <= HOLLOW_COS[k]!) continue;
    // Pits about a dozen units across, clustered.
    return smoothstep(0.02, 0.1, fbm(x * 420, y * 420, z * 420, 2) + fbm(x * 60, y * 60, z * 60, 2) * 0.6);
  }
  return 0;
}

/**
 * The table's ground with the bright ground laid over it. The shade wins over
 * both: ice in a cold trap stays ice whatever crater threw rock across it.
 */
const GROUND: GroundModel = {
  secondAxis: BASE.secondAxis,
  biomes: BASE.biomes,
  relief: BASE.relief,
  at(lat: number, lon: number, elevation: number, target: GroundSample): GroundSample {
    BASE.at(lat, lon, elevation, target);
    if (target.id === 'ice' || target.id === 'shadow') return target;
    toUnit(lat, lon, point);
    if (hollowsAt() > 0.5) target.id = 'hollows';
    else if (raysAt() > 0.5) target.id = 'rays';
    return target;
  },
};

/**
 * The countries: twelve, each a real province of the MESSENGER map — a basin,
 * a scarp, a crater with rays or hollows — and two that are not features but
 * the planet's own geometry, the warm poles, named for what is seen there.
 * The notes are true of the place; who lives there is invented.
 */
const NATIONS: readonly Nation[] = [
  { id: 'caloris', name: 'Caloris', lat: 30.5, lon: 170.2, radius: 18, color: PALETTE.clay,
    note: 'A basin 1,550 km across, filled with smooth lava and ringed by mountains the impact threw up. The richest country on the hot pole, and it never lets you forget it.' },
  { id: 'chaos', name: 'The Chaotic Terrain', lat: -30.5, lon: -9.8, radius: 16, color: PALETTE.slate,
    note: 'Directly opposite Caloris. The shock went round the planet both ways and met here, and broke the ground into hills nobody has counted.' },
  { id: 'kuiper', name: 'Kuiper', lat: -11.3, lon: -31.4, radius: 9, color: PALETTE.cream,
    note: 'The brightest crater Mariner 10 saw in 1974, its rays still white. A small country that is very easy to find.' },
  { id: 'borealis', name: 'Borealis', lat: 82, lon: 0, radius: 14, color: PALETTE.skyBlue,
    note: 'Crater floors the sun has never reached, holding water ice on the hottest surface in the system. The ice is the economy.' },
  { id: 'austral-shade', name: 'Austral Shade', lat: -82, lon: 0, radius: 14, color: PALETTE.violet,
    note: 'The southern half of the same accident of obliquity: a tilt of two hundredths of a degree, and Chao Meng-Fu full of ice.' },
  { id: 'rupes', name: 'The Rupes', lat: -2, lon: 98, radius: 16, color: PALETTE.brown,
    note: 'Cliffs a kilometre high running for six hundred, where the whole planet shrank as its core froze. Beagle Rupes is the one shaped like a hook.' },
  { id: 'rembrandt', name: 'Rembrandt', lat: -34, lon: 84, radius: 11, color: PALETTE.gold,
    note: 'A basin 715 km across, cut clean through by Enterprise Rupes, the longest cliff on Mercury.' },
  { id: 'rachmaninoff', name: 'Rachmaninoff', lat: 27.6, lon: 57.6, radius: 8, color: PALETTE.pink,
    note: 'A basin with a ring of peaks inside its rim and the youngest lava on the planet on its floor. The prettiest skyline on Mercury, say its people.' },
  { id: 'hokusai', name: 'Hokusai', lat: 57.8, lon: 16.8, radius: 14, color: PALETTE.white,
    note: 'A young crater whose rays run a thousand kilometres across the north. Everything here is white with thrown rock.' },
  { id: 'hollows', name: 'Tyagaraja', lat: 3.7, lon: -148.9, radius: 12, color: PALETTE.orange,
    note: 'A crater floor eaten into hollows: bright, blue and still forming. The ground here is evaporating, very slowly.' },
  { id: 'raditladi', name: 'Raditladi', lat: 27.3, lon: 119.1, radius: 8, color: PALETTE.olive,
    note: 'A peak-ring basin with hollows on its ring. Young, as these things go: a billion years.' },
  { id: 'westwarm', name: 'Westwarm', lat: 0, lon: -90, radius: 14, color: PALETTE.apricot,
    note: 'A warm pole: perihelion always finds the sun on its horizon, so its noons are the gentlest on the equator. Once a solar day the sun rises here, sets, and rises again; once it sets twice.' },
];

/**
 * The towns, **invented**, at real features: in a crater's shade, on a scarp's
 * foot, inside a peak ring — the places a people who live by the shade would
 * choose. The two warm poles hold the biggest, for the reason their nation's
 * note gives.
 *
 * A town stands on a levelled pad, and a pad laid across a crease of the
 * relief is a pit with a cliff round it; so each was searched for within a
 * few tenths of a degree of its feature for the flattest ground its pad
 * would take, and moved there. That is why Caloris Floor is not at the
 * basin's centre to the hundredth.
 */
const SETTLEMENTS: readonly Settlement[] = [
  { id: 'caloris-floor', name: 'Caloris Floor', lat: 30.77, lon: 169.74, population: 900000, nation: 'caloris' },
  { id: 'pantheon', name: 'Pantheon', lat: 24.0, lon: 163.0, population: 34000, nation: 'caloris' },
  { id: 'montes-rim', name: 'Montes Rim', lat: 33.9, lon: 153.52, population: 22000, nation: 'caloris' },
  { id: 'antipode', name: 'Antipode', lat: -30.5, lon: -9.8, population: 21000, nation: 'chaos' },
  { id: 'debussy', name: 'Debussy', lat: -32.6, lon: -14.6, population: 12000, nation: 'chaos' },
  { id: 'kuiper', name: 'Kuiper', lat: -10.0, lon: -31.4, population: 26000, nation: 'kuiper' },
  { id: 'coldtrap', name: 'Coldtrap', lat: 84.33, lon: 28.72, population: 15000, nation: 'borealis' },
  { id: 'southwatch', name: 'Southwatch', lat: -84.4, lon: -36.17, population: 7000, nation: 'austral-shade' },
  { id: 'beagle', name: 'Beagle', lat: -1.7, lon: 101.27, population: 500000, nation: 'rupes' },
  { id: 'twice-dusk', name: 'Twice-Dusk', lat: 0.12, lon: 90.45, population: 800000, nation: 'rupes' },
  { id: 'rembrandt-floor', name: 'Rembrandt Floor', lat: -33.17, lon: 88.14, population: 450000, nation: 'rembrandt' },
  { id: 'enterprise', name: 'Enterprise', lat: -37.73, lon: 77.95, population: 18000, nation: 'rembrandt' },
  { id: 'ringhold', name: 'Ringhold', lat: 27.6, lon: 57.6, population: 1000000, nation: 'rachmaninoff' },
  { id: 'raywatch', name: 'Raywatch', lat: 54.2, lon: 17.26, population: 30000, nation: 'hokusai' },
  { id: 'tyagaraja', name: 'Tyagaraja', lat: 5.53, lon: -148.63, population: 24000, nation: 'hollows' },
  { id: 'bluefloor', name: 'Bluefloor', lat: 27.37, lon: 119.4, population: 400000, nation: 'raditladi' },
  { id: 'twice-dawn', name: 'Twice-Dawn', lat: 0.4, lon: -90.37, population: 2400000, nation: 'westwarm' },
];

/**
 * The Cinder: built for a planet that cooks for three months and freezes for
 * three, and **invented** against the one rule an airless world sets.
 *
 * With no air there is no wind to cool a body and no breeze in the shade: the
 * only way heat leaves anything on Mercury is to radiate into the black sky.
 * So the Cinder are dark (a good radiator is a dark one), low and wide — two
 * leg pairs, three trunk segments, no neck — because every one of those is a
 * way of *not standing up into the sun*, and they wear a **frill** round the
 * head that is a radiator, held in the shade and pointed at the sky. Mercury's
 * 3.7 m/s2 is the same 0.38 g as Mars, and the two species read it opposite
 * ways: the Martian grows tall and spindly because it can, the Cinder long and
 * flat because the sun says it must. A little shorter than a person; four eyes
 * in one row, for watching a horizon that a sunrise creeps along at walking
 * pace.
 */
const CINDER: Species = {
  id: 'cinder',
  name: 'Cinder',
  morph: {
    id: 'cinder', name: 'Cinder', height: 3.4, heads: 3.2, legShare: 0.34,
    legPairs: 2, armPairs: 1, segments: 3, shoulderShare: 0.15, hipShare: 0.145,
    depth: 1.25, neck: 'none', headSides: 4, eyes: 4, crown: 'frill', tail: 0.22, limbR: 0.036,
  },
  hides: [PALETTE.bark, PALETTE.steel, PALETTE.slate, PALETTE.darkOlive, PALETTE.brown],
  // A cloak is a sunshade you carry: the commonest thing a Cinder owns.
  wears: [
    { item: 'cloak', weight: 5 },
    { item: 'suit', weight: 3 },
    { item: 'harness', weight: 3 },
    { item: 'wrap', weight: 2 },
    { item: 'none', weight: 1 },
  ],
  carries: [
    { item: 'none', weight: 4 },
    { item: 'pack', weight: 3 },
    { item: 'vessel', weight: 3 },
    { item: 'staff', weight: 2 },
  ],
  trims: [PALETTE.ink, PALETTE.bark, PALETTE.steel],
  // Bright accents are the mirror-foil and whitewash every made thing here wears.
  accents: [PALETTE.gold, PALETTE.white, PALETTE.cream, PALETTE.skyBlue, PALETTE.orange],
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
  // The IAU's north pole of rotation, J2000 right ascension and declination.
  pole: { ra: 281.01, dec: 61.41 },
  gravity: 3.7,
  blurb:
    'A day here lasts two of its years. Four hundred and thirty degrees in the sun, ' +
    'a hundred and eighty below in the dark, and water ice in the craters at the poles.',
  look: {
    surface: PALETTE.tan,
    highland: PALETTE.slate,
    lowland: PALETTE.bark,
    cap: PALETTE.white,
    // No atmosphere means no scattering, so the sky is black at noon and the
    // stars are out. `ink` and not a blue.
    sky: PALETTE.ink,
  },
  ground: GROUND,
  nations: NATIONS,
  // The file's own towns, and the nations filled out round them (`towns.ts`).
  settlements: grownTowns({ id: 'mercury', radiusKm: RADIUS_KM, nations: NATIONS, settlements: SETTLEMENTS }),
  species: 'cinder',
};
