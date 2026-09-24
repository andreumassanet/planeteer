/**
 * Mars, end to end: its ground, its countries, its cities and its people.
 *
 * **This is the architecture and the other seven are table entries**, which is
 * the order the whole directory was built in and the reason this file is four
 * times the size of `venus.ts`. Everything invented here is invented against a
 * rule that can be checked:
 *
 * - **Every coordinate in this file is a real one.** Olympus Mons is at
 *   18.65 N, 226.2 E because that is where it is; Hellas is at 42.4 S, 70.5 E;
 *   Jezero is where Perseverance landed. The countries are named after the real
 *   albedo and geological provinces that every Mars map has carried since
 *   Schiaparelli, so a reader can check the map against an atlas exactly as
 *   `pnpm check` checks 25 Terran places against theirs. Nothing here is a
 *   name someone liked the sound of.
 * - **The ground model is the shape of `biome.ts` with a different second
 *   axis.** Earth's pair is temperature against *moisture*; a world with no
 *   water cycle has no moisture, and Mars's second axis is **dust** — which is
 *   not a substitution of convenience, it is the axis Mars's own map is drawn
 *   in. The bright and dark regions of a telescopic Mars map are dust over
 *   basalt and basalt swept bare, and they have been the primary observable
 *   about this planet for two hundred years.
 * - **The species is a `Morph`, not a re-skin.** Four arms, three eyes, a
 *   crest, and half again the height of the 6.8-unit avatar of before
 *   2026-09-24 (see `people` below) — because 0.38 g is the one
 *   physical fact about Mars that a body could be expected to answer to.
 */

import { BODY_SCALE } from '../../stature.ts';
import { PALETTE } from '../../theme.ts';
import type { Body, GroundModel, GroundSample, Nation, Settlement, Species } from '../contract.ts';
import { surfaceRadiusOf } from '../contract.ts';
import { alignment, clamp, fbm, onSphere, ridged, smoothstep } from '../noise.ts';

const RADIUS_KM = 3389.5;

/** 8,514 units, at the 0.398 km per unit the avatar's own height fixes. */
const SURFACE_RADIUS = surfaceRadiusOf(RADIUS_KM);

/**
 * How much relief this world is allowed, and the rule is stated because the
 * true number is unusable.
 *
 * Mars really does run from Olympus Mons at +21.2 km to the floor of Hellas at
 * −7.2 km — **28.4 km of range on a body half Earth's size**, which is 0.84% of
 * its own radius against Earth's 0.14%. Earth is drawn with `MAX_RELIEF` = 680
 * units on a 16,000-unit radius, an exaggeration of 34 times; apply the same
 * exaggeration here and Mars's relief is **2,412 units on a radius of 8,514 —
 * 28% of the planet.**
 *
 * So the rule is: *keep the true ratio to Earth's relief, up to a ceiling of
 * 12% of the body's own radius.* Mars's true ratio is 3.2 (28.4 km against
 * Earth's 8.8 km of land relief), which asks for 2,196 units; the ceiling binds
 * at 1,022 and this is 1,000. **The cost is that Olympus Mons is drawn 1.47
 * times Everest where it really is 2.4 times**, and that crop is written here
 * rather than discovered later.
 *
 * **The 12% is not measured and this note is the honest part.** Nothing stands
 * on Mars yet to measure it against. What it is aimed at is the failure the
 * cloud deck already found from orbit — *the outer edge of the limb is the
 * tallest top on a chord crossing dozens of cells, and the wobble is the crust*
 * — and Earth sits at 4.25% and reads smooth. 12% is three times that and is a
 * number to falsify, not a result.
 */
export const MAX_RELIEF = 1000;

/** Kilometres of real Martian elevation to a world unit of drawn relief. */
const UNITS_PER_KM = MAX_RELIEF / 28.4;

/** Where the Martian datum sits in the 0..MAX_RELIEF band. Hellas is the floor. */
const DATUM = 7.2 * UNITS_PER_KM;

/**
 * The named topography, and it is the same construction `terrain.ts` uses for
 * Earth: **a table of real ranges plus noise**, because a purely procedural
 * planet has no Alps and no Andes and reads as one texture everywhere.
 *
 * `km` is the real height above or below the Martian datum and `extent` the
 * angular radius over which it falls off. The falloff is a smoothstep in the
 * cosine of the angle rather than in the angle, which is one trigonometric
 * function fewer per feature per sample and matters because the classifier is
 * called per triangle.
 */
interface Feature {
  name: string;
  lat: number;
  lon: number;
  /** Real elevation of the feature's centre against the datum, km. */
  km: number;
  /** Angular radius, degrees. */
  extent: number;
  /** How the flank falls: 1 is a cone, 2 is a shield, 0.5 is a plateau. */
  shape: number;
}

const FEATURES: readonly Feature[] = [
  // The Tharsis volcanoes. The shields are wide and the summits are not.
  { name: 'Olympus Mons', lat: 18.65, lon: -133.8, km: 19.0, extent: 9, shape: 1.6 },
  { name: 'Ascraeus Mons', lat: 11.8, lon: -104.5, km: 11.6, extent: 5, shape: 1.5 },
  { name: 'Pavonis Mons', lat: 0.8, lon: -113.0, km: 7.6, extent: 4.5, shape: 1.5 },
  { name: 'Arsia Mons', lat: -8.35, lon: -120.1, km: 11.2, extent: 5.5, shape: 1.5 },
  { name: 'Alba Mons', lat: 40.5, lon: -109.6, km: 4.6, extent: 13, shape: 0.6 },
  // The Tharsis rise itself, which is the bulge all four stand on.
  { name: 'Tharsis Rise', lat: 0, lon: -100, km: 7.0, extent: 42, shape: 0.7 },
  // Elysium, the other volcanic province.
  { name: 'Elysium Mons', lat: 25.02, lon: 147.2, km: 9.6, extent: 6, shape: 1.5 },
  { name: 'Elysium Rise', lat: 22, lon: 148, km: 4.5, extent: 22, shape: 0.7 },
  // The basins. Hellas is the deepest place on the planet and one of the
  // largest impact structures in the solar system.
  { name: 'Hellas Planitia', lat: -42.4, lon: 70.5, km: -7.2, extent: 18, shape: 0.9 },
  { name: 'Argyre Planitia', lat: -49.7, lon: -44.0, km: -5.2, extent: 11, shape: 0.9 },
  { name: 'Isidis Planitia', lat: 12.9, lon: 87.0, km: -3.8, extent: 9, shape: 0.9 },
  { name: 'Utopia Planitia', lat: 46.7, lon: 117.5, km: -4.5, extent: 20, shape: 0.8 },
  { name: 'Chryse Planitia', lat: 28.4, lon: -40.3, km: -2.5, extent: 12, shape: 0.9 },
];

/**
 * Valles Marineris, as a segment rather than a disc.
 *
 * It is 4,000 km long and 200 wide — a shape no cap can hold, and the one
 * feature on Mars that everybody can name from a photograph. The distance to a
 * great-circle segment is worth the twelve lines: modelled as a disc it comes
 * out as a round hole in the middle of Tharsis, which is neither where it is
 * nor what it looks like.
 */
const CHASMA = { fromLat: -5.5, fromLon: -105, toLat: -14.5, toLon: -35, km: -5.5, halfWidth: 3.5 };

/** Angle from a point to a great-circle segment, degrees. */
function toSegment(lat: number, lon: number): number {
  const p = onSphere(lat, lon);
  const a = onSphere(CHASMA.fromLat, CHASMA.fromLon);
  const b = onSphere(CHASMA.toLat, CHASMA.toLon);
  // The pole of the plane through a and b. A point's distance to the great
  // circle is 90 degrees minus its angle to that pole.
  const nx = a[1] * b[2] - a[2] * b[1];
  const ny = a[2] * b[0] - a[0] * b[2];
  const nz = a[0] * b[1] - a[1] * b[0];
  const nlen = Math.hypot(nx, ny, nz);
  if (nlen < 1e-9) return 180;
  const off = Math.abs((p[0] * nx + p[1] * ny + p[2] * nz) / nlen);
  const perpendicular = Math.asin(clamp(off, 0, 1)) * (180 / Math.PI);
  // And whether the foot of that perpendicular lies between the two ends: if
  // not, the distance is to the nearer end and the canyon does not run on for
  // ever round the planet.
  const along = p[0] * (a[0] + b[0]) + p[1] * (a[1] + b[1]) + p[2] * (a[2] + b[2]);
  const spanDot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const inside = along > (1 + spanDot) * 0.5 * 0.62;
  if (inside) return perpendicular;
  const da = Math.acos(clamp(p[0] * a[0] + p[1] * a[1] + p[2] * a[2], -1, 1)) * (180 / Math.PI);
  const db = Math.acos(clamp(p[0] * b[0] + p[1] * b[1] + p[2] * b[2], -1, 1)) * (180 / Math.PI);
  return Math.min(da, db);
}

/**
 * The crustal dichotomy: the single largest fact about Martian topography.
 *
 * The northern third of the planet is a smooth plain about five kilometres
 * below the cratered southern highlands, and the boundary between them is a
 * great circle inclined about 35 degrees to the equator. It is why the north
 * is Vastitas Borealis and the south is Noachis and Terra Sirenum, and a Mars
 * with no dichotomy in it is a Mars nobody would recognise from a globe.
 *
 * Modelled as one dot product against the pole of that circle — the cheapest
 * possible statement of "which side of the boundary" — and then smoothstepped
 * across about 20 degrees, which is roughly how wide the real fretted terrain
 * of the boundary is.
 */
const LOWLAND_POLE = { lat: 55, lon: 160 };

function dichotomy(lat: number, lon: number): number {
  const t = smoothstep(-0.1, 0.55, alignment(lat, lon, LOWLAND_POLE.lat, LOWLAND_POLE.lon));
  return 2.2 - t * 6.2;
}

/**
 * Relief, in world units above the lowest ground on the planet.
 *
 * Same contract as `reliefAt`: a pure function of a point, one definition,
 * everything downstream reads it. `ridged` and not `fbm` for the fine octaves,
 * for the reason Earth measured — *smooth relief reads as flat; only a crease
 * reads as terrain*, because a four-band ramp only steps where the normal
 * turns — and `fbm` for the broad swell, which is a swell and not a range.
 */
function relief(lat: number, lon: number): number {
  const [x, y, z] = onSphere(lat, lon);

  let km = dichotomy(lat, lon);

  for (const f of FEATURES) {
    const cos = alignment(lat, lon, f.lat, f.lon);
    const edge = Math.cos((f.extent * Math.PI) / 180);
    if (cos <= edge) continue;
    const t = (cos - edge) / (1 - edge);
    km += f.km * Math.pow(t, f.shape);
  }

  const chasma = toSegment(lat, lon);
  if (chasma < CHASMA.halfWidth) {
    km += CHASMA.km * (1 - smoothstep(0, CHASMA.halfWidth, chasma));
  }

  // Cratering, as the fine octaves, and heavier in the south because that is
  // what "the ancient highlands" means. One term, not a crater generator.
  const age = smoothstep(-0.5, 0.3, -alignment(lat, lon, LOWLAND_POLE.lat, LOWLAND_POLE.lon));
  km += ridged(x * 7.3, y * 7.3, z * 7.3, 4) * (0.5 + 1.6 * age);
  km += fbm(x * 2.1, y * 2.1, z * 2.1, 3) * 1.4;

  return clamp(DATUM + km * UNITS_PER_KM, 0, MAX_RELIEF);
}

/**
 * The dust, which is Mars's second axis and is not a stand-in for moisture.
 *
 * Bright and dark is what a Mars map *is*. Syrtis Major was the first surface
 * feature ever seen on another planet — Huygens, 1659 — and it is dark because
 * the wind sweeps the dust off basalt there; Arabia and Amazonis are bright
 * because the dust settles and stays. The named centres below are the classical
 * albedo features at their real coordinates, and the classifier turns them into
 * ground the same way `zonalMoisture` turns the Hadley cells into deserts.
 *
 * The one zonal term is that dust piles up in the basins, which is why Hellas
 * and Argyre are the brightest things on the planet after the caps.
 */
interface Albedo {
  name: string;
  lat: number;
  lon: number;
  /** Positive is bright dust, negative is swept basalt. */
  weight: number;
  extent: number;
}

const ALBEDO: readonly Albedo[] = [
  { name: 'Syrtis Major', lat: 8.4, lon: 69.5, weight: -0.50, extent: 16 },
  { name: 'Sinus Sabaeus', lat: -8, lon: -10, weight: -0.42, extent: 20 },
  { name: 'Terra Sirenum', lat: -35, lon: -155, weight: -0.44, extent: 26 },
  { name: 'Mare Cimmerium', lat: -25, lon: 145, weight: -0.42, extent: 24 },
  { name: 'Acidalia Planitia', lat: 46.7, lon: -22, weight: -0.36, extent: 22 },
  { name: 'Solis Lacus', lat: -28, lon: -85, weight: -0.38, extent: 12 },
  { name: 'Meridiani Planum', lat: 0, lon: 0, weight: -0.36, extent: 12 },
  { name: 'Arabia Terra', lat: 21, lon: 6, weight: 0.46, extent: 26 },
  { name: 'Amazonis Planitia', lat: 24.8, lon: -164, weight: 0.50, extent: 24 },
  { name: 'Tharsis', lat: 0, lon: -100, weight: 0.42, extent: 34 },
  { name: 'Elysium', lat: 24, lon: 150, weight: 0.36, extent: 22 },
  { name: 'Hellas Planitia', lat: -42.4, lon: 70.5, weight: 0.52, extent: 18 },
  { name: 'Argyre Planitia', lat: -49.7, lon: -44, weight: 0.44, extent: 12 },
  { name: 'Utopia Planitia', lat: 46.7, lon: 117.5, weight: -0.22, extent: 20 },
];

function dustAt(lat: number, lon: number): number {
  const [x, y, z] = onSphere(lat, lon);
  let dust = 0.45;
  for (const a of ALBEDO) {
    const cos = alignment(lat, lon, a.lat, a.lon);
    const edge = Math.cos((a.extent * Math.PI) / 180);
    if (cos <= edge) continue;
    dust += a.weight * smoothstep(0, 1, (cos - edge) / (1 - edge));
  }
  // The noise is the smallest term on purpose, for the reason `biome.ts` gives:
  // it is there so a boundary is a ragged line rather than a circle, not so the
  // map is a surprise.
  dust += fbm(x * 4.7, y * 4.7, z * 4.7, 3) * 0.12;
  return clamp(dust, 0, 1);
}

/**
 * How cold it is, and Mars is cold everywhere.
 *
 * Earth's `WARMTH_PER_DEGREE` is `1/86.7`, a straight line fitted to +27 at the
 * equator and about −10 at 63 degrees. Mars runs from about −60 mean at the
 * equator to −125 at the poles, so the same treatment gives a steeper line and
 * a lower ceiling: nothing on this planet is warm, and what the axis has to
 * separate is *frost* from *no frost* rather than palm from pine. The lapse
 * rate is the same idea as Earth's — `MAX_RELIEF` gives up most of the range —
 * and it is what puts frost on Olympus Mons at 18 degrees north.
 */
const WARMTH_PER_DEGREE = 1 / 105;
const LAPSE = 0.42;

const BIOMES = {
  ice: { id: 'ice', color: PALETTE.white, cover: 0, parts: [] },
  frost: { id: 'frost', color: PALETTE.bone, cover: 0.05, parts: ['frost-fan', 'wind-stone'] },
  dust: { id: 'dust', color: PALETTE.sand, cover: 0.06, parts: ['dust-drift', 'wind-stone'] },
  regolith: { id: 'regolith', color: PALETTE.clay, cover: 0.1, parts: ['wind-stone', 'dust-drift', 'iron-spire'] },
  duricrust: { id: 'duricrust', color: PALETTE.brown, cover: 0.12, parts: ['wind-stone', 'iron-spire'] },
  basalt: { id: 'basalt', color: PALETTE.bark, cover: 0.14, parts: ['iron-spire', 'wind-stone'] },
  lava: { id: 'lava', color: PALETTE.steel, cover: 0.08, parts: ['iron-spire'] },
  chasma: { id: 'chasma', color: PALETTE.tan, cover: 0.16, parts: ['wind-stone', 'iron-spire', 'dust-drift'] },
  rock: { id: 'rock', color: PALETTE.slate, cover: 0.02, parts: ['iron-spire'] },
} as const;

function classify(lat: number, lon: number, elevation: number, target: GroundSample): GroundSample {
  const warmth = clamp(1 - Math.abs(lat) * WARMTH_PER_DEGREE - (elevation / MAX_RELIEF) * LAPSE, 0, 1);
  const dust = dustAt(lat, lon);

  target.warmth = warmth;
  target.second = dust;
  target.elevation = elevation;

  // Order, and it is the order the planet decides in: cold beats everything,
  // then the canyon, then bare summit rock, then the volcanic flanks, then how
  // much dust is lying on what is left.
  if (warmth < 0.16) target.id = 'ice';
  else if (toSegment(lat, lon) < CHASMA.halfWidth * 1.15 && elevation < DATUM + 60) target.id = 'chasma';
  else if (warmth < 0.30) target.id = 'frost';
  else if (elevation > MAX_RELIEF * 0.82) target.id = 'rock';
  else if (elevation > MAX_RELIEF * 0.56) target.id = 'lava';
  else if (dust > 0.62) target.id = 'dust';
  else if (dust < 0.26) target.id = 'basalt';
  else if (dust < 0.44) target.id = 'duricrust';
  else target.id = 'regolith';

  return target;
}

export const MARS_GROUND: GroundModel = {
  secondAxis: 'dust',
  biomes: BIOMES,
  relief,
  at: classify,
};

/**
 * The countries, and the rule that produced them is the one that chose the
 * later monuments: **name them after what is already on the map.**
 *
 * Every one is a real Martian province with a real centre. Nobody has to argue
 * about whether Tharsis is a place, and a player who looks Mars up finds the
 * same names. Two of them are enclaves and that is deliberate — Isidis sits
 * inside Syrtis and Marineris inside Noachis, so `nationAt`'s smallest-cap
 * resolution is exercised by the data rather than only by a unit test. It is
 * the same arrangement Lesotho and Western Sahara forced on `countryAt`.
 */
const NATIONS: readonly Nation[] = [
  { id: 'tharsis', name: 'The Tharsis Rise', lat: 4, lon: -110, radius: 38, color: PALETTE.clay,
    note: 'Four volcanoes on a bulge that lifted a tenth of the planet. The high country, and the windiest.' },
  { id: 'elysium', name: 'Elysium', lat: 20, lon: 150, radius: 26, color: PALETTE.apricot,
    note: 'The second volcanic province, and the one with the young lava. Half of it flowed yesterday, geologically.' },
  { id: 'utopia', name: 'Utopia', lat: 48, lon: 155, radius: 38, color: PALETTE.steel,
    note: 'The northern plain: flat, low, and buried in ice that nobody has dug up.' },
  { id: 'acidalia', name: 'Acidalia', lat: 40, lon: -28, radius: 32, color: PALETTE.bark,
    note: 'Dark ground swept clean of dust, and the outflow channels of a sea that drained.' },
  { id: 'arabia', name: 'Arabia Terra', lat: 12, lon: 5, radius: 30, color: PALETTE.sand,
    note: 'The dustiest country on the planet. Craters filled to the rim and then filled again.' },
  { id: 'syrtis', name: 'Syrtis Major', lat: 9, lon: 78, radius: 24, color: PALETTE.darkOlive,
    note: 'The first thing anyone ever saw on another world, in 1659, and it is still the darkest.' },
  { id: 'isidis', name: 'Isidis', lat: 13, lon: 87, radius: 9, color: PALETTE.olive,
    note: 'A basin inside Syrtis, with a river delta at its western edge. An enclave, like Lesotho.' },
  { id: 'hellas', name: 'Hellas', lat: -42, lon: 70, radius: 22, color: PALETTE.cream,
    note: 'The deepest hole on Mars and the only place with enough air above it for liquid water.' },
  { id: 'noachis', name: 'Noachis', lat: -42, lon: -25, radius: 34, color: PALETTE.tan,
    note: 'The oldest ground in the solar system that you can stand on. Everything here is cratered twice.' },
  { id: 'marineris', name: 'Marineris', lat: -10, lon: -70, radius: 17, color: PALETTE.gold,
    note: 'A canyon four thousand kilometres long and seven deep. An enclave of Noachis by the map and of nothing by the eye.' },
  { id: 'amazonis', name: 'Amazonis', lat: 25, lon: -165, radius: 21, color: PALETTE.cream,
    note: 'The flattest ground in the solar system. Lava under dust under more dust, and not a crater in sight.' },
  { id: 'sirenum', name: 'Terra Sirenum', lat: -37, lon: -157, radius: 30, color: PALETTE.brown,
    note: 'Dark southern highland, magnetised in stripes from when Mars still had a field.' },
  { id: 'aeolis', name: 'Aeolis', lat: -4, lon: 140, radius: 20, color: PALETTE.brown,
    note: 'The dichotomy boundary itself: highland breaking down into lowland, one mesa at a time.' },
  { id: 'boreum', name: 'Planum Boreum', lat: 85, lon: 0, radius: 13, color: PALETTE.white,
    note: 'Water ice in layers, a spiral of troughs cut by the wind, and a cap that breathes each year.' },
  { id: 'australe', name: 'Planum Australe', lat: -85, lon: 160, radius: 13, color: PALETTE.white,
    note: 'The southern cap. Carbon dioxide over water ice, and the only place the ground goes off as a gas.' },
];

/**
 * The cities, at the coordinates of the real features they stand on.
 *
 * Twenty of them against Earth's 23,867, and the ratio is the point: `pnpm
 * check`'s lesson about a gazetteer is that *a cartographic file is not a
 * gazetteer* and no filter recovers what is not in the file. There is no
 * Martian gazetteer, so this is a cartographic file — hand-picked, one per
 * feature worth walking to — and it should be read as the Natural Earth of
 * Mars rather than as its GeoNames. What it must not do is pretend otherwise:
 * a rule that thins these for overlap, or a population curve fitted to them,
 * would be arithmetic performed on twenty invented numbers.
 */
const SETTLEMENTS: readonly Settlement[] = [
  { id: 'caldera', name: 'Caldera', lat: 18.65, lon: -133.8, population: 240000, nation: 'tharsis' },
  { id: 'arsia-gate', name: 'Arsia Gate', lat: -8.35, lon: -120.1, population: 88000, nation: 'tharsis' },
  { id: 'pavonis-tether', name: 'Pavonis Tether', lat: 0.8, lon: -113.0, population: 410000, nation: 'tharsis' },
  { id: 'alba-shelf', name: 'Alba Shelf', lat: 40.5, lon: -109.6, population: 36000, nation: 'tharsis' },
  { id: 'elysium-hold', name: 'Elysium Hold', lat: 25.02, lon: 147.2, population: 120000, nation: 'elysium' },
  { id: 'cerberus', name: 'Cerberus', lat: 10.0, lon: 157.0, population: 45000, nation: 'elysium' },
  { id: 'vastitas', name: 'Vastitas', lat: 46.7, lon: 117.5, population: 190000, nation: 'utopia' },
  { id: 'arcadia', name: 'Arcadia', lat: 47.2, lon: -175.7, population: 61000, nation: 'utopia' },
  { id: 'cydonia', name: 'Cydonia', lat: 40.75, lon: -9.46, population: 74000, nation: 'acidalia' },
  { id: 'chryse-landing', name: 'Chryse Landing', lat: 28.4, lon: -40.3, population: 155000, nation: 'acidalia' },
  { id: 'meridiani', name: 'Meridiani', lat: 0, lon: 0, population: 300000, nation: 'arabia' },
  { id: 'sabaeus', name: 'Sabaeus', lat: -4, lon: -8, population: 52000, nation: 'arabia' },
  { id: 'syrtis-deep', name: 'Syrtis Deep', lat: 8.4, lon: 69.5, population: 210000, nation: 'syrtis' },
  { id: 'jezero', name: 'Jezero', lat: 18.38, lon: 77.58, population: 96000, nation: 'syrtis' },
  { id: 'isidis-quay', name: 'Isidis Quay', lat: 12.9, lon: 87.0, population: 130000, nation: 'isidis' },
  { id: 'hellas-floor', name: 'Hellas Floor', lat: -42.4, lon: 70.5, population: 520000, nation: 'hellas' },
  { id: 'noachis-keep', name: 'Noachis Keep', lat: -45, lon: -10, population: 43000, nation: 'noachis' },
  { id: 'argyre', name: 'Argyre', lat: -49.7, lon: -44.0, population: 67000, nation: 'noachis' },
  { id: 'coprates', name: 'Coprates', lat: -13.4, lon: -61.0, population: 280000, nation: 'marineris' },
  { id: 'sirenum-watch', name: 'Sirenum Watch', lat: -39.7, lon: -150, population: 29000, nation: 'sirenum' },
  { id: 'amazonis-flats', name: 'Amazonis Flats', lat: 24.8, lon: -164, population: 38000, nation: 'amazonis' },
  { id: 'gale', name: 'Gale', lat: -5.4, lon: 137.8, population: 71000, nation: 'aeolis' },
  { id: 'boreum-station', name: 'Boreum Station', lat: 84.0, lon: 20.0, population: 9000, nation: 'boreum' },
  { id: 'australe-station', name: 'Australe Station', lat: -84.0, lon: 155.0, population: 6000, nation: 'australe' },
];

/**
 * The people, and every unusual number in the `Morph` has an argument.
 *
 * **0.38 g is the fact a body could answer to**, and it answers in the
 * direction everything about low gravity does: a skeleton doing the same job
 * can be longer and thinner, because what a leg has to resist is weight. So the
 * height is one and a half times a person's — 10.2 units against the 6.8 a
 * person was until 2026-09-24, scaled with them by `BODY_SCALE` — with the
 * legs at half the height rather than 0.44 and the limbs a third narrower.
 *
 * **Five heads and not four.** The avatar is exactly four heads, which is the
 * stylised middle between a real adult's 7.5 and a toddler's 3.2, and it is
 * tuned to keep the head 44 px at the distance the third-person camera sits.
 * Five is the same head at a taller body, which reads as *elongated* rather
 * than as small-headed — the single cheapest way to say "not human" at 40
 * units, where a person is a 159-pixel mark.
 *
 * **Four arms and three eyes are not gravity, they are silhouette.** The
 * measurement `pnpm people` makes is how many of a crowd are distinguishable at
 * the pixel size they are really seen at, and the honest reading of it is that
 * what survives at 300 units is *height, the hat, the hem and two colours*. A
 * second pair of arms is a change to the outline that survives all the way out;
 * a differently shaped ear is not. The eyes are for the near view and they cost
 * six triangles.
 */
const MARTIAN: Species = {
  id: 'martian',
  name: 'Martian',
  morph: {
    id: 'martian',
    name: 'Martian',
    height: 10.2 * BODY_SCALE,
    heads: 5,
    legShare: 0.5,
    legPairs: 1,
    armPairs: 2,
    segments: 2,
    shoulderShare: 0.105,
    hipShare: 0.082,
    depth: 0.68,
    neck: 'long',
    headSides: 6,
    eyes: 3,
    crown: 'crest',
    tail: 0,
    limbR: 0.021,
  },
  // Complementary to the ground on purpose: the whole planet is ochre, so a
  // person who is also ochre is a person nobody can see. Cool, desaturated
  // hides against a warm ground is the same choice `GROUND_STYLES` makes when
  // it refuses a dark neutral road on dark neutral ground.
  hides: [PALETTE.slate, PALETTE.violet, PALETTE.steel, PALETTE.bone, PALETTE.olive, PALETTE.tan],
  wears: [
    { item: 'wrap', weight: 4 },
    { item: 'harness', weight: 3 },
    { item: 'cloak', weight: 2 },
    { item: 'suit', weight: 2 },
    { item: 'none', weight: 1 },
  ],
  carries: [
    { item: 'none', weight: 5 },
    { item: 'pack', weight: 3 },
    { item: 'staff', weight: 2 },
    { item: 'vessel', weight: 2 },
  ],
  trims: [PALETTE.bark, PALETTE.darkOlive, PALETTE.ink, PALETTE.steel],
  accents: [PALETTE.gold, PALETTE.crimson, PALETTE.orange, PALETTE.skyBlue, PALETTE.pink],
};

export const SPECIES: readonly Species[] = [MARTIAN];

export const MARS: Body = {
  id: 'mars',
  name: 'Mars',
  kind: 'rocky',
  orbit: 'mars',
  radiusKm: RADIUS_KM,
  rotationHours: 24.6229,
  tiltDeg: 25.19,
  gravity: 3.721,
  blurb:
    'Half the size of Earth and all of it dry land. One volcano taller than three Everests, ' +
    'a canyon you could lose the Alps in, and a sky the colour of butterscotch.',
  look: {
    surface: PALETTE.clay,
    highland: PALETTE.sand,
    lowland: PALETTE.bark,
    cap: PALETTE.white,
    // Not blue, and it is the one thing everybody gets wrong about Mars: the
    // dust scatters the red forward, so the day sky is butterscotch and it is
    // the *sunset* that goes blue. `apricot` is the palette's own answer.
    sky: PALETTE.apricot,
  },
  ground: MARS_GROUND,
  nations: NATIONS,
  settlements: SETTLEMENTS,
  species: 'martian',
};

export { SURFACE_RADIUS };
