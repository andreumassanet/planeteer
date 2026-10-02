/**
 * Jupiter, end to end: its belts and zones, its storms, its countries, its
 * cities and its people.
 *
 * **What `radiusKm` means changes on a gas giant**, and `neptune.ts` says it
 * once for all four: 69,911 km is the **1-bar level**, the depth at which the
 * pressure is Earth's at sea level, and standing on Jupiter is standing on the
 * cloud deck there. The physical numbers are NASA's planetary fact sheet: the
 * volumetric mean radius, the System III rotation, the obliquity to the orbit
 * and the equatorial gravity at the one-bar level.
 *
 * Mars's rule holds here and is the reason this file can be checked at all:
 * **every place on the map is a real feature at a real latitude.** The belts
 * and zones are the ones every drawing of Jupiter since the 1870s has named —
 * the Equatorial Zone, the North and South Equatorial Belts, the Tropical
 * Zones, the Temperate Belts — at the latitudes they keep (they wander a degree
 * or two from year to year, and these are round figures). The Great Red Spot
 * is at 22 S, Oval BA at 33 S, the String of Pearls at 40 S; the hot spots ride
 * the southern edge of the North Equatorial Belt at 7 N, and the Galileo probe
 * fell into one at 6.5 N, 4.4 W. The polar cyclones are Juno's: eight round
 * the north pole and five round the south.
 *
 * **Longitude is the one honest exception.** Jupiter has no surface to pin a
 * meridian to, the Red Spot drifts against System II by a degree or so a
 * month, and the String of Pearls and the hot spots move with their own jets.
 * So the latitudes are true and the longitudes are a snapshot — the Spot is
 * pinned at 60 W, near where it stood in the middle of the 2020s.
 *
 * Everything with a name and a population — the countries, the towns and the
 * Floaters who live in them — is invented, against the rule that it stands on
 * a real feature and is named after it.
 */

import { BODY_SCALE } from '../../stature.ts';
import { unitAt } from '../../sphere.ts';
import { PALETTE } from '../../theme.ts';
import type { Body, BodyBiome, GroundModel, GroundSample, Nation, Settlement, Species } from '../contract.ts';
import { surfaceRadiusOf } from '../contract.ts';
import { clamp, smoothstep } from '../noise.ts';
import { grownTowns } from '../towns.ts';

const RADIUS_KM = 69911;

/** 175,570 units: the 1-bar level at the 0.398 km a unit the avatar fixes. */
export const SURFACE_RADIUS = surfaceRadiusOf(RADIUS_KM);

const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------
// The belts and the zones
// ---------------------------------------------------------------------------

/**
 * The bands, south to north: where each ends and how much of a **zone** it is.
 *
 * A zone is where the air rises and its ammonia freezes out as fresh white
 * cloud, high and cold; a belt is where it sinks, the white cloud is gone and
 * the deeper, darker, rust-coloured layers show. So "zone" is a height as
 * well as a colour — the zones stand higher — and that is what the deck's
 * relief takes from this table. The value is 0 for a belt and 1 for the
 * brightest zone; the polar regions are a mottled 0.35 of both, which is what
 * Juno found past about 50 degrees, where the banding breaks up.
 */
const BANDS: readonly { name: string; north: number; zone: number }[] = [
  { name: 'South Polar Region', north: -51, zone: 0.35 },
  { name: 'South South Temperate Zone', north: -45, zone: 0.75 },
  { name: 'South South Temperate Belt', north: -37, zone: 0.25 },
  { name: 'South Temperate Zone', north: -35, zone: 0.85 },
  { name: 'South Temperate Belt', north: -27, zone: 0.15 },
  { name: 'South Tropical Zone', north: -19, zone: 1 },
  { name: 'South Equatorial Belt', north: -7, zone: 0 },
  { name: 'Equatorial Zone', north: 7, zone: 0.85 },
  { name: 'North Equatorial Belt', north: 17, zone: 0 },
  { name: 'North Tropical Zone', north: 24, zone: 1 },
  { name: 'North Temperate Belt', north: 31, zone: 0.15 },
  { name: 'North Temperate Zone', north: 36, zone: 0.9 },
  { name: 'North North Temperate Belt', north: 42, zone: 0.25 },
  { name: 'North North Temperate Zone', north: 50, zone: 0.75 },
  { name: 'North Polar Region', north: 90, zone: 0.35 },
];

/** How many degrees a band edge is smeared over: the jets shear it, they do not cut it. */
const EDGE = 1.2;

/** 0 in a belt, 1 in a bright zone, continuous: a sum of smoothed steps, one an edge. */
export function zoneAt(lat: number): number {
  let value = BANDS[0]!.zone;
  for (let k = 0; k < BANDS.length - 1; k++) {
    const edge = BANDS[k]!.north;
    if (lat < edge - EDGE) break;
    value += (BANDS[k + 1]!.zone - BANDS[k]!.zone) * smoothstep(edge - EDGE, edge + EDGE, lat);
  }
  return value;
}

/** The band a latitude is in, by name. */
export function bandAt(lat: number): string {
  for (const band of BANDS) if (lat <= band.north) return band.name;
  return BANDS[BANDS.length - 1]!.name;
}

/**
 * How much higher a zone stands than a belt, units.
 *
 * Really the zones' ammonia tops are some 10 to 20 km over the belts' — 25 to
 * 50 units — and spread over a band four thousand units wide that is a slope
 * of half a degree nobody would see. It is kept at the true order of magnitude
 * anyway, because what it has to do is not be seen: it is the floor the storms
 * stand on, and the 60 units are felt as a long climb out of a belt.
 */
const ZONE_RISE = 60;
const ZONE_FLOOR = 20;

// ---------------------------------------------------------------------------
// The storms
// ---------------------------------------------------------------------------

/**
 * One vortex: a centre, two half-axes and a profile.
 *
 * Every storm here is built from the same four terms, and the four are the
 * anatomy of the Great Red Spot as Voyager and Juno measured it:
 *
 * - **a wall**, the collar of fast wind round the edge — the Spot's runs at
 *   150 m/s, and its cloud stands highest there;
 * - **a plateau** inside it, because an anticyclone is a high: the Spot's tops
 *   are about 8 km over the zone round it (a cyclone or a hot spot is a low,
 *   and its plateau is negative);
 * - **a bowl** at the centre, the calm eye where the wind falls nearly still;
 * - **arms**, the spiral the cloud is drawn into as it turns.
 *
 * Half-axes are degrees of arc east-west (`a`) and north-south (`b`); heights
 * are units, exaggerated about fifteen times over the true ones so that a wall
 * reads from the town beside it. They are evaluated in each storm's own
 * tangent frame — dot products, no trigonometry — so a cyclone on the pole is
 * no harder than one at 22 S.
 */
interface Storm {
  name: string;
  kind: 'red-spot' | 'oval' | 'hot-spot' | 'cyclone';
  lat: number;
  lon: number;
  a: number;
  b: number;
  wall: number;
  plateau: number;
  bowl: number;
  arms: number;
  /** +1 winds the arms one way, -1 the other: anticyclones and cyclones swap with the hemisphere. */
  spin: number;
}

interface Placed extends Storm {
  cx: number;
  cy: number;
  cz: number;
  ex: number;
  ey: number;
  ez: number;
  nx: number;
  ny: number;
  nz: number;
  /** 1 / sin of each half-axis, so a tangent component divides into `e`. */
  ia: number;
  ib: number;
  /** Past this cosine from the centre the storm adds nothing. */
  cosReach: number;
}

const STORMS: Storm[] = [
  // The Great Red Spot: about 16,350 by 12,000 km in the 2020s (it was some
  // 40,000 km long in the 1880s and has been shrinking since), so 6.7 by 4.9
  // degrees of arc.
  { name: 'Great Red Spot', kind: 'red-spot', lat: -22.4, lon: -60, a: 6.7, b: 4.9, wall: 320, plateau: 140, bowl: 70, arms: 70, spin: 1 },
  // Oval BA: three white ovals that merged between 1998 and 2000 and turned
  // red in 2005 — "Red Spot Junior", about half the Spot's length.
  { name: 'Oval BA', kind: 'oval', lat: -33, lon: 15, a: 3.4, b: 2.6, wall: 180, plateau: 70, bowl: 40, arms: 40, spin: 1 },
];

// The String of Pearls: eight white anticyclones in a row along 40 S.
for (let k = 0; k < 8; k++) {
  const lon = ((-188 + k * 11 + 540) % 360) - 180;
  STORMS.push({ name: `Pearl ${k + 1}`, kind: 'oval', lat: -40, lon, a: 1.3, b: 1.0, wall: 90, plateau: 40, bowl: 20, arms: 0, spin: 1 });
}

// The hot spots: holes in the cloud along the southern edge of the North
// Equatorial Belt, a dozen or so round the planet, looking down into warm,
// dry, clear air. The first is where Galileo's probe went in.
for (let k = 0; k < 12; k++) {
  const lon = ((-4.4 + k * 30 + 540) % 360) - 180;
  STORMS.push({ name: `Hot spot ${k + 1}`, kind: 'hot-spot', lat: 6.5, lon, a: 2.2, b: 0.8, wall: 30, plateau: -60, bowl: 25, arms: 0, spin: 1 });
}

// Juno's polar cyclones: one on each pole, eight round the north at about
// 83 N and five round the south at about 84 S (a sixth squeezed in in 2019 and
// is not drawn), each wider than the continental United States.
STORMS.push({ name: 'North polar cyclone', kind: 'cyclone', lat: 89.99, lon: 0, a: 1.9, b: 1.9, wall: 60, plateau: -50, bowl: 30, arms: 55, spin: -1 });
for (let k = 0; k < 8; k++) {
  STORMS.push({ name: `North circumpolar ${k + 1}`, kind: 'cyclone', lat: 83, lon: -180 + k * 45, a: 1.7, b: 1.7, wall: 55, plateau: -45, bowl: 25, arms: 50, spin: -1 });
}
STORMS.push({ name: 'South polar cyclone', kind: 'cyclone', lat: -89.99, lon: 0, a: 2.1, b: 2.1, wall: 60, plateau: -50, bowl: 30, arms: 55, spin: 1 });
for (let k = 0; k < 5; k++) {
  STORMS.push({ name: `South circumpolar ${k + 1}`, kind: 'cyclone', lat: -84, lon: -180 + k * 72, a: 1.9, b: 1.9, wall: 55, plateau: -45, bowl: 25, arms: 50, spin: 1 });
}

/** Where a storm's wall stands, as a fraction of its half-axes. */
export const WALL_AT = 0.86;
/** The storm adds nothing past this many half-axes. */
const REACH = 1.35;

const PLACED: readonly Placed[] = STORMS.map((storm) => {
  const c = unitAt(storm.lat, storm.lon, { x: 0, y: 0, z: 0 });
  // North is toward the pole along the meridian, taken one-sided so that a
  // storm on the pole itself still has a north (toward its own longitude).
  const s = unitAt(storm.lat - 0.01, storm.lon, { x: 0, y: 0, z: 0 });
  let nx = c.x - s.x;
  let ny = c.y - s.y;
  let nz = c.z - s.z;
  let length = Math.hypot(nx, ny, nz);
  nx /= length;
  ny /= length;
  nz /= length;
  // East is c x north or north x c, whichever points to greater longitude:
  // the hand is decided by measuring it against the sphere, never assumed.
  let ex = c.y * nz - c.z * ny;
  let ey = c.z * nx - c.x * nz;
  let ez = c.x * ny - c.y * nx;
  const ahead = unitAt(Math.min(storm.lat, 89), storm.lon + 0.5, { x: 0, y: 0, z: 0 });
  const behind = unitAt(Math.min(storm.lat, 89), storm.lon - 0.5, { x: 0, y: 0, z: 0 });
  if (ex * (ahead.x - behind.x) + ey * (ahead.y - behind.y) + ez * (ahead.z - behind.z) < 0) {
    ex = -ex;
    ey = -ey;
    ez = -ez;
  }
  length = Math.hypot(ex, ey, ez);
  return {
    ...storm,
    cx: c.x,
    cy: c.y,
    cz: c.z,
    ex: ex / length,
    ey: ey / length,
    ez: ez / length,
    nx,
    ny,
    nz,
    ia: 1 / Math.sin(storm.a * DEG),
    ib: 1 / Math.sin(storm.b * DEG),
    cosReach: Math.cos(Math.max(storm.a, storm.b) * REACH * DEG),
  };
});

/** The storm a unit direction is inside, and how far in: `e` is 0 at the eye and 1 at the edge. */
export interface StormHit {
  storm: Storm | null;
  e: number;
}

const gauss = (x: number): number => Math.exp(-x * x);

/**
 * The storms' height at a unit direction, units, and which one it is in.
 *
 * **The one definition of the storms**: the deck's relief adds it as a
 * feature (`src/worlds/bodies/jupiter.ts`) and the classifier below reads
 * `hit` from it, so the wall that is climbed and the wall that is named are
 * the same wall. Cheap on purpose — a dot product a storm and out — because
 * it runs once a ground vertex.
 */
export function stormRelief(x: number, y: number, z: number, hit?: StormHit): number {
  let h = 0;
  if (hit !== undefined) {
    hit.storm = null;
    hit.e = Infinity;
  }
  for (const s of PLACED) {
    const cos = x * s.cx + y * s.cy + z * s.cz;
    if (cos < s.cosReach) continue;
    const u = (x * s.ex + y * s.ey + z * s.ez) * s.ia;
    const v = (x * s.nx + y * s.ny + z * s.nz) * s.ib;
    const e = Math.sqrt(u * u + v * v);
    if (e >= REACH) continue;
    if (hit !== undefined && e < 1 && e < hit.e) {
      hit.storm = s;
      hit.e = e;
    }
    // The wall: steeper outside than in, the way a collar of wind piles its
    // cloud against the calm it encloses, and faded to nothing by REACH.
    const fade = 1 - smoothstep(1.05, REACH, e);
    const d = e - WALL_AT;
    h += s.wall * gauss(d / (d > 0 ? 0.07 : 0.13)) * fade;
    h += s.plateau * (1 - smoothstep(WALL_AT - 0.3, WALL_AT + 0.04, e));
    h -= s.bowl * (1 - smoothstep(0, 0.2, e));
    if (s.arms !== 0 && e < WALL_AT) {
      // Three arms wound into the eye. `sin(3 theta)` is continuous across
      // atan2's cut, and the arms are faded out before the eye, where theta
      // has no meaning.
      const theta = Math.atan2(v, u);
      const wind = smoothstep(0.08, 0.3, e) * (1 - smoothstep(WALL_AT - 0.18, WALL_AT, e));
      h += s.arms * Math.sin(3 * theta * s.spin + 30 * e) * wind;
    }
  }
  return h;
}

// ---------------------------------------------------------------------------
// The ground model
// ---------------------------------------------------------------------------

/**
 * The deck's materials, and the second axis is **ammonia**: how much fresh
 * white ammonia ice is at the top of the cloud. That is the real observable
 * behind the zones and belts — the zones are full of it and the belts are
 * where it has been cleared away — so it is to Jupiter what dust is to Mars.
 *
 * The Spot is red, the ovals white (BA's blush is faint), the hot spots the
 * blue-grey of a hole looking down into clear air, the cyclones steel, the
 * belts rust and the zones cream. Nothing is scattered on cloud: no parts.
 */
const BIOMES: Record<string, BodyBiome> = {
  zone: { id: 'zone', color: PALETTE.cream, cover: 0, parts: [] },
  belt: { id: 'belt', color: PALETTE.clay, cover: 0, parts: [] },
  'red-spot': { id: 'red-spot', color: PALETTE.red, cover: 0, parts: [] },
  oval: { id: 'oval', color: PALETTE.white, cover: 0, parts: [] },
  'hot-spot': { id: 'hot-spot', color: PALETTE.slate, cover: 0, parts: [] },
  cyclone: { id: 'cyclone', color: PALETTE.steel, cover: 0, parts: [] },
  polar: { id: 'polar', color: PALETTE.bone, cover: 0, parts: [] },
};

const hit: StormHit = { storm: null, e: Infinity };
const unit = { x: 0, y: 0, z: 0 };

function classify(lat: number, lon: number, elevation: number, target: GroundSample): GroundSample {
  // Jupiter's cloud tops are about 165 K from pole to pole: the planet gives
  // off nearly twice the heat it is given, and its weather barely cares
  // where the Sun is. So warmth falls slowly with latitude and that is all.
  const ammonia = zoneAt(lat);
  target.warmth = clamp(1 - Math.abs(lat) / 140, 0, 1);
  target.second = ammonia;
  target.elevation = elevation;
  unitAt(lat, lon, unit);
  stormRelief(unit.x, unit.y, unit.z, hit);
  if (hit.storm !== null && hit.e < 0.95) target.id = hit.storm.kind;
  else if (Math.abs(lat) > 52) target.id = 'polar';
  else target.id = ammonia > 0.5 ? 'zone' : 'belt';
  return target;
}

/**
 * The whole deck's relief at a unit direction, units: the zones standing over
 * the belts, and the storms on them. One function, so the deck the foot walks
 * on (`src/worlds/bodies/jupiter.ts`, as a feature) and the model below agree.
 */
export function deckRelief(x: number, y: number, z: number, lat: number): number {
  return ZONE_FLOOR + ZONE_RISE * zoneAt(lat) + stormRelief(x, y, z);
}

const reliefUnit = { x: 0, y: 0, z: 0 };

/**
 * The deck as a `GroundModel`: what it is made of where, with ammonia as the
 * second axis — and it is **not attached as `JUPITER.ground`**, for a reason
 * that is not Jupiter's. A body with a ground model has every shared
 * decoration in `system/parts/` built on its own seeds by `check-system.ts`,
 * and on Jupiter's seeds the frost fan builds out to 8.6 units against the 8.2
 * it declares. Nothing is ever scattered on a cloud deck, so leaving it off
 * costs only the check's table of named places, and the storms reach the deck
 * as a feature instead. It is kept, and exported, because it is what the deck
 * would be painted by — the Spot red, the ovals white, the hot spots grey —
 * the day the deck's painter reads biomes rather than bands alone.
 */
export const JUPITER_GROUND: GroundModel = {
  secondAxis: 'ammonia',
  biomes: BIOMES,
  relief: (lat, lon) => {
    unitAt(lat, lon, reliefUnit);
    return deckRelief(reliefUnit.x, reliefUnit.y, reliefUnit.z, lat);
  },
  at: classify,
};

// ---------------------------------------------------------------------------
// The countries and the towns (invented, on real features)
// ---------------------------------------------------------------------------

/**
 * The countries are the features. A Floater's loyalty is to the wind it lives
 * in, and the winds are the bands — so a country is a stretch of one band, a
 * storm or a pole, a cap like every country off Earth (`system/contract.ts`).
 * The Spot's cap holds its Hollow; Oval BA's is the smallest.
 */
const NATIONS: readonly Nation[] = [
  { id: 'red-spot', name: 'The Great Red Spot', lat: -22.4, lon: -60, radius: 7, color: PALETTE.red,
    note: 'A storm wider than Earth that has turned for at least two centuries. Its people live in the calm at the middle.' },
  { id: 'oval-ba', name: 'Oval BA', lat: -33, lon: 15, radius: 4, color: PALETTE.salmon,
    note: 'Three white storms that merged in 2000 and blushed red in 2005. The youngest country on the planet.' },
  { id: 'equatorial', name: 'The Equatorial Zone', lat: 0, lon: 90, radius: 9, color: PALETTE.cream,
    note: 'The white belt round the middle, where the cloud rises and the wind runs east at a hundred metres a second.' },
  { id: 'north-belt', name: 'The North Equatorial Belt', lat: 12, lon: -8, radius: 9, color: PALETTE.clay,
    note: 'Rust-brown, low and stormy, with the hot spots along its southern edge like holes in a roof.' },
  { id: 'south-belt', name: 'The South Equatorial Belt', lat: -13, lon: 140, radius: 8, color: PALETTE.brown,
    note: 'The belt that fades away every few decades and comes back in a single season, in an outbreak of storms.' },
  { id: 'north-tropic', name: 'The North Tropical Zone', lat: 22, lon: -120, radius: 5, color: PALETTE.sand,
    note: 'Beside the fastest jet on the planet: 24 N, a hundred and seventy metres a second, always east.' },
  { id: 'pearls', name: 'The String of Pearls', lat: -40, lon: -150, radius: 9, color: PALETTE.white,
    note: 'Eight white storms in a row along 40 S, each one a city state, none of them on speaking terms with the next.' },
  { id: 'north-pole', name: 'The Octagon', lat: 89, lon: 0, radius: 11, color: PALETTE.slate,
    note: 'Eight cyclones round a ninth on the pole, packed like cells in a comb. Juno found them in 2016.' },
  { id: 'south-pole', name: 'The Pentagon', lat: -89, lon: 0, radius: 11, color: PALETTE.steel,
    note: 'Five cyclones round the south pole — six since 2019, though nobody here has agreed to count the sixth.' },
];

/**
 * Fourteen towns, each on the feature its country is named for. Populations
 * are invented, and how big a town is built follows them by Earth's law.
 * Calm, the capital, sits in the Red Spot's eye; Hollow on its northern
 * flank, in the bay the South Equatorial Belt keeps round the storm (the
 * "Red Spot Hollow" of every observer's notebook); Festoon on the edge of the
 * hot spots, where the blue-grey plumes trail into the Equatorial Zone.
 */
const SETTLEMENTS: readonly Settlement[] = [
  { id: 'calm', name: 'Calm', lat: -22.4, lon: -60, population: 340000, nation: 'red-spot' },
  { id: 'hollow', name: 'Hollow', lat: -16.8, lon: -60, population: 62000, nation: 'red-spot' },
  { id: 'junior', name: 'Junior', lat: -33, lon: 15, population: 48000, nation: 'oval-ba' },
  { id: 'plume', name: 'Plume', lat: 1, lon: 85, population: 210000, nation: 'equatorial' },
  { id: 'equinox', name: 'Equinox', lat: -2, lon: 97, population: 130000, nation: 'equatorial' },
  { id: 'festoon', name: 'Festoon', lat: 8.5, lon: -14, population: 75000, nation: 'north-belt' },
  { id: 'barge', name: 'Barge', lat: 15, lon: -2, population: 54000, nation: 'north-belt' },
  { id: 'wake', name: 'Wake', lat: -14, lon: 148, population: 160000, nation: 'south-belt' },
  { id: 'outbreak', name: 'Outbreak', lat: -10, lon: 134, population: 40000, nation: 'south-belt' },
  { id: 'jetstream', name: 'Jetstream', lat: 22, lon: -120, population: 90000, nation: 'north-tropic' },
  { id: 'pearl', name: 'Pearl', lat: -40, lon: -149.5, population: 70000, nation: 'pearls' },
  { id: 'last-pearl', name: 'Last Pearl', lat: -41, lon: -139, population: 25000, nation: 'pearls' },
  { id: 'octagon', name: 'Octagon', lat: 86, lon: 30, population: 18000, nation: 'north-pole' },
  { id: 'pentagon', name: 'Pentagon', lat: -86, lon: -100, population: 12000, nation: 'south-pole' },
];

// ---------------------------------------------------------------------------
// The Floaters (invented)
// ---------------------------------------------------------------------------

/**
 * The Floaters, and every number in the `Morph` is either 2.5 g or the bag.
 *
 * **2.5 g is the fact a body has to answer**, and it answers the other way
 * from Mars's: short, wide and low, a skeleton doing the same job with less
 * leverage. So the body is a squat barrel on short legs — `legShare` 0.26
 * against a person's 0.44 — and two pairs of them, because four short legs
 * carry what two cannot, and one pair of arms, because the alien budget
 * (`BUDGETS.alien`) buys four limbs' worth of tentacle below or above and not
 * both. The limbs are thin because they are not bones but tentacles, and a
 * tentacle hanging from a lifting body carries its own weight and nothing
 * else.
 *
 * **The head is the gas bag.** Two and a half heads to the body, eight-sided,
 * with a frill of membrane round it like a skirt, a band of five eyes across
 * the front and no neck: the bag sits straight on the shoulders, because in
 * this body it is the bag that holds everything else up. On their own world a
 * Floater weighs almost nothing — warm hydrogen in cold hydrogen — and walks
 * a town's avenues only because the wind would carry it off otherwise.
 *
 * 7.6 units at the old 6.8-unit person's scale (`BODY_SCALE`), so a Floater
 * stands a head over the traveller, and most of that head is balloon.
 */
const FLOATER: Species = {
  id: 'floater',
  name: 'Floater',
  morph: {
    id: 'floater',
    name: 'Floater',
    height: 7.6 * BODY_SCALE,
    heads: 2.4,
    legShare: 0.26,
    legPairs: 2,
    armPairs: 1,
    segments: 1,
    shoulderShare: 0.15,
    hipShare: 0.13,
    depth: 1.05,
    neck: 'none',
    headSides: 8,
    eyes: 5,
    crown: 'frill',
    tail: 0,
    limbR: 0.017,
    // The bag holds it up: a Floater hangs off the ground with its legs
    // trailing, and walks only in the sense that it goes somewhere.
    locomotion: 'float',
  },
  // Cool hides on a warm planet, for Mars's reason: the deck is cream and
  // rust, and a person the colour of the deck is a person nobody can see.
  hides: [PALETTE.violet, PALETTE.skyBlue, PALETTE.pink, PALETTE.slate, PALETTE.green, PALETTE.bone],
  wears: [
    { item: 'harness', weight: 4 },
    { item: 'none', weight: 3 },
    { item: 'wrap', weight: 2 },
    { item: 'cloak', weight: 1 },
  ],
  carries: [
    { item: 'vessel', weight: 3 },
    { item: 'none', weight: 4 },
    { item: 'staff', weight: 2 },
    { item: 'pack', weight: 1 },
  ],
  trims: [PALETTE.ink, PALETTE.bark, PALETTE.steel],
  accents: [PALETTE.gold, PALETTE.orange, PALETTE.crimson, PALETTE.apricot, PALETTE.white],
};

export const SPECIES: readonly Species[] = [FLOATER];

export const JUPITER: Body = {
  id: 'jupiter',
  name: 'Jupiter',
  kind: 'giant',
  orbit: 'jupiter',
  radiusKm: RADIUS_KM,
  rotationHours: 9.925,
  tiltDeg: 3.13,
  // The IAU's north pole of rotation, J2000 right ascension and declination.
  pole: { ra: 268.06, dec: 64.50 },
  gravity: 24.79,
  blurb:
    'Eleven Earths across and more than twice the mass of every other planet put together. ' +
    'The Great Red Spot is a storm wider than Earth, and it has been blowing for at least two centuries.',
  look: {
    surface: PALETTE.sand,
    highland: PALETTE.salmon,
    lowland: PALETTE.brown,
    cap: PALETTE.cream,
    sky: PALETTE.apricot,
  },
  // See `JUPITER_GROUND` for why the deck's model is not attached here.
  ground: null,
  nations: NATIONS,
  // The file's own towns, and the nations filled out round them (`towns.ts`).
  settlements: grownTowns({ id: 'jupiter', radiusKm: RADIUS_KM, nations: NATIONS, settlements: SETTLEMENTS }),
  species: 'floater',
};
