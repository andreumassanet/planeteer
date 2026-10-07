/**
 * The Moon's ground: what it is made of, how high it stands, and the named
 * places in it a person can walk to.
 *
 * Two kinds of ground and nothing else, and they are the first fact about the
 * Moon anyone ever learned by looking up: **the maria**, dark basalt that
 * flooded the great basins three to four billion years ago, and **the
 * highlands**, pale anorthosite crust older than that and cratered to
 * saturation. So the second axis of this ground model is not dust (Mars) or
 * altitude (Venus) but *how much mare basalt lies here*, and it is built the
 * way `mars.ts` builds its dust: **a table of the real maria at their real
 * centres**, plus a little noise so a shore is ragged and not a circle.
 *
 * Every coordinate in this file is selenographic and real — the IAU's, east
 * positive, the near side centred on 0 N 0 E — and every size is the real one
 * divided by `KM_PER_UNIT`, **except where a comment says it was drawn larger**
 * (the skylights, the rilles, Shorty): those are true in place and false in
 * size, because a pit a hundred metres across is a quarter of a unit and
 * nobody would find it.
 *
 * What it adds over the system's ground model, as `Feature`s in walking units:
 *
 * - **The named craters** — Tycho, Copernicus, Clavius and its arc, Plato,
 *   Aristarchus, Kepler, Theophilus, Tsiolkovskiy, Daedalus, Shackleton — with
 *   terraced walls and central peaks where the real ones have them.
 * - **The bright rays** of the young craters, which are colour and not height:
 *   the classifier draws them, streaked and broken, across whatever they cross.
 * - **Two sinuous rilles** (Rima Hadley, Vallis Schröteri with its Cobra Head),
 *   **the Straight Wall** (Rupes Recta), and **three lava-tube skylights**
 *   (Marius Hills, Mare Tranquillitatis, Mare Ingenii) — which is where the
 *   people of this world come up for air they do not breathe.
 */

import { KM_PER_UNIT, surfaceRadiusOf } from '../../../system/contract.ts';
import type { BodyBiome, GroundModel, GroundSample } from '../../../system/contract.ts';
import { reliefBudget } from '../../../system/ground.ts';
import { clamp, fbm, ridged, smoothstep } from '../../../system/noise.ts';
import { toUnit } from '../../../sphere.ts';
import { PALETTE } from '../../../theme.ts';
import type { Feature } from '../../contract.ts';

export const RADIUS_KM = 1737.4;

/** 4,363 units: the person's own scale, as on every world. */
export const SURFACE_RADIUS = surfaceRadiusOf(RADIUS_KM);

/**
 * The Moon's real range is **19.9 km**, from the Selenean summit on the far
 * side (+10.8 km) to the floor of Antoniadi in the South Pole–Aitken basin
 * (−9.1 km) — more than Earth's land relief on a body a quarter of its size.
 * The rule every body obeys (`reliefBudget`: Earth's exaggeration, capped at
 * 12% of the radius) asks for 1,538 units and the cap binds at 523: the Moon
 * is drawn at **26 units of height to the kilometre** against Mars's 35.
 */
export const MAX_RELIEF = Math.floor(reliefBudget(19.9, SURFACE_RADIUS));
const UNITS_PER_KM = MAX_RELIEF / 19.9;
/** The mean radius in the 0..MAX_RELIEF band: Antoniadi's floor is the bottom. */
const DATUM = 9.1 * UNITS_PER_KM;

/** Kilometres of real radius to world units: the horizontal scale, which is never exaggerated. */
const unitsOf = (km: number): number => km / KM_PER_UNIT;

// ---------------------------------------------------------------------------
// Caps: a direction, a reach and a weight, asked by one dot product
// ---------------------------------------------------------------------------

interface Cap {
  x: number;
  y: number;
  z: number;
  /** Cosine of the reach: a point with a smaller dot is outside. */
  edge: number;
  weight: number;
  /** How the weight falls from the centre: 1 a cone, under 1 a plateau. */
  shape: number;
  /**
   * For a province rather than a landform: the share of the way in (in the
   * cosine) by which the weight is whole. 1 is a soft hill of a weight; 0.4
   * is a sea with a shore, flat across most of its reach.
   */
  soft: number;
}

const scratch = [0, 0, 0];

function cap(lat: number, lon: number, extentDeg: number, weight: number, shape = 1, soft = 1): Cap {
  toUnit(lat, lon, scratch);
  return { x: scratch[0]!, y: scratch[1]!, z: scratch[2]!, edge: Math.cos((extentDeg * Math.PI) / 180), weight, shape, soft };
}

/** A province with a shore: whole over most of its reach, falling off at the edge. */
const sea = (lat: number, lon: number, extentDeg: number, weight: number): Cap => cap(lat, lon, extentDeg, weight, 1, 0.4);

/** Sum of the caps' weights at a unit point, each smoothstepped from its edge in. */
function sumCaps(caps: readonly Cap[], x: number, y: number, z: number): number {
  let sum = 0;
  for (const c of caps) {
    const d = x * c.x + y * c.y + z * c.z;
    if (d <= c.edge) continue;
    sum += c.weight * smoothstep(0, c.soft, (d - c.edge) / (1 - c.edge));
  }
  return sum;
}

// ---------------------------------------------------------------------------
// The relief: the basins, their rings, the far side's highlands
// ---------------------------------------------------------------------------

/**
 * The great basins and the far side's bulge, in real kilometres against the
 * mean radius. The maria lie in the basins because the basins are where the
 * crust was thinnest and the lava could reach the surface — so the low ground
 * and the dark ground are the same ground, and a player who walks downhill
 * on the near side walks into a sea.
 */
const BASINS: readonly Cap[] = [
  // The South Pole–Aitken basin: 2,500 km across and the oldest impact
  // structure on the Moon. Its centre is 53 S, 191 E.
  cap(-53, -169, 36, -6.5, 0.8),
  // The far-side highlands, whose top is the Selenean summit at 5.4 N, 201 E:
  // the crust there is twice as thick as under the near side's seas.
  cap(5, -159, 40, 5.2, 0.6),
  cap(-20, 120, 34, 1.6, 0.6),
  cap(45, 120, 30, 1.8, 0.6),
  // The near side's basins, floors in km under the mean.
  cap(32.8, -15.6, 19, -2.7, 0.5), // Imbrium
  cap(18.4, -57.4, 26, -1.6, 0.5), // Procellarum
  cap(28.0, 17.5, 10, -2.6, 0.6), // Serenitatis
  cap(8.5, 31.4, 13, -1.6, 0.6), // Tranquillitatis
  cap(17.0, 59.1, 9, -3.4, 0.6), // Crisium
  cap(-7.8, 51.3, 9, -1.6, 0.6), // Fecunditatis
  cap(-15.2, 35.5, 6, -2.2, 0.6), // Nectaris
  cap(-21.3, -16.6, 11, -1.4, 0.6), // Nubium
  cap(-24.4, -38.6, 6.5, -2.2, 0.6), // Humorum
  cap(-19.4, -92.8, 9, -2.8, 0.7), // Orientale's centre
  cap(27.3, 147.9, 4.5, -2.4, 0.7), // Moscoviense
];

/**
 * The mountain rings round two basins, which are what the Moon has instead of
 * ranges: **Montes Apenninus, Carpatus and Alpes** are the rim of Imbrium,
 * thrown up by the impact, and **Montes Cordillera and Rook** the two rings of
 * Orientale's bull's-eye. Imbrium's ring is open to the west, where
 * Procellarum's lava overtopped it, so it fades out past 30 W.
 */
interface Ring {
  x: number;
  y: number;
  z: number;
  /** Ring radius and half-width, degrees, and the outer cosine for the early out. */
  ring: number;
  width: number;
  outer: number;
  km: number;
  /** Longitudes west of which the ring fades away, or null for a whole ring. */
  openWest: readonly [number, number] | null;
}

function ring(lat: number, lon: number, ringDeg: number, widthDeg: number, km: number, openWest: readonly [number, number] | null): Ring {
  toUnit(lat, lon, scratch);
  return { x: scratch[0]!, y: scratch[1]!, z: scratch[2]!, ring: ringDeg, width: widthDeg, outer: Math.cos(((ringDeg + widthDeg) * Math.PI) / 180), km, openWest };
}

const RINGS: readonly Ring[] = [
  ring(32.8, -15.6, 18.6, 2.6, 3.6, [-34, -20]),
  ring(-19.4, -92.8, 15.3, 1.8, 3.0, null),
  ring(-19.4, -92.8, 10.4, 1.4, 2.0, null),
];

// ---------------------------------------------------------------------------
// The second axis: how much mare basalt
// ---------------------------------------------------------------------------

/** The maria at their real centres. Weights over 0.5 are sea; the reach is each one's own. */
const MARIA: readonly Cap[] = [
  sea(22, -55, 24, 0.85), // Oceanus Procellarum, north
  sea(0, -50, 16, 0.8), // Procellarum, south
  sea(8, -66, 12, 0.8), // Procellarum, west, out to the limb
  sea(5, -40, 10, 0.6), // round Kepler
  sea(32.8, -15.6, 16, 0.95), // Imbrium
  sea(28.0, 17.5, 9.5, 0.95), // Serenitatis
  sea(8.5, 31.4, 11, 0.95), // Tranquillitatis
  sea(4, 24, 6, 0.6), // its western bay, where Apollo 11 came down
  sea(17.0, 59.1, 8.5, 1.0), // Crisium
  sea(-7.8, 51.3, 9, 0.9), // Fecunditatis
  sea(-15.2, 35.5, 5.5, 0.9), // Nectaris
  sea(-21.3, -16.6, 11, 0.85), // Nubium
  sea(-10, -23, 6, 0.75), // Cognitum
  sea(-24.4, -38.6, 6.5, 0.9), // Humorum
  sea(13.3, 3.6, 4.5, 0.85), // Vaporum
  sea(7.5, -30.9, 8, 0.75), // Insularum
  sea(2.4, 1.7, 3.5, 0.65), // Sinus Medii
  sea(11, -9, 4, 0.7), // Sinus Aestuum
  sea(56, -20, 7, 0.8), // Frigoris, west
  sea(58, 10, 7, 0.8), // Frigoris, east
  sea(-19.4, -92.8, 4, 0.85), // Orientale's small sea
  sea(27.3, 147.9, 4, 0.9), // Moscoviense
  sea(-33.7, 163.5, 3, 0.75), // Ingenii
  sea(51.6, -9.4, 1.6, 1.2), // Plato's dark floor
  sea(-20.4, 129.1, 1.6, 1.2), // Tsiolkovskiy's dark floor
];

/**
 * Titanium, which is the colour of a mare: the high-titanium basalts of
 * Tranquillitatis and western Procellarum are the bluish, darker seas, and
 * Serenitatis and Imbrium the paler, browner ones. Apollo 11 brought home the
 * first of the former and Apollo 15 the latter, and you can see the boundary
 * between them from Earth with binoculars.
 */
const TITANIUM: readonly Cap[] = [sea(8.5, 31.4, 13, 1.0), sea(10, -60, 15, 0.9), sea(26, -28, 6, 0.6)];

/**
 * The dark mantle: volcanic glass sprayed out by fire fountains, darker than
 * any mare. The floor of Taurus-Littrow, where Apollo 17 landed to find it;
 * Sulpicius Gallus; Rima Bode; Sinus Aestuum; the Aristarchus plateau.
 */
const MANTLE: readonly Cap[] = [sea(20.2, 30.8, 2.2, 1), sea(20, 10, 2.5, 1), sea(13, -4, 2, 1), sea(11, -8, 2.2, 0.8), sea(26, -51, 4, 1)];

const P = [0, 0, 0];

/** How much mare there is at a unit point, 0 to 1. */
export function mareAt(x: number, y: number, z: number): number {
  return clamp(sumCaps(MARIA, x, y, z) + fbm(x * 9.3, y * 9.3, z * 9.3, 3) * 0.14, 0, 1);
}

function relief(lat: number, lon: number): number {
  toUnit(lat, lon, P);
  const x = P[0]!;
  const y = P[1]!;
  const z = P[2]!;
  let km = 0;
  for (const b of BASINS) {
    const d = x * b.x + y * b.y + z * b.z;
    if (d <= b.edge) continue;
    km += b.weight * Math.pow((d - b.edge) / (1 - b.edge), b.shape);
  }
  for (const r of RINGS) {
    const d = x * r.x + y * r.y + z * r.z;
    if (d <= r.outer) continue;
    const angle = (Math.acos(Math.min(1, d)) * 180) / Math.PI;
    const s = 1 - Math.abs(angle - r.ring) / r.width;
    if (s <= 0) continue;
    const open = r.openWest === null ? 1 : smoothstep(r.openWest[0], r.openWest[1], lon);
    // Ridged across the ring, so it is a range of peaks and not a levee.
    const peaks = 0.55 + 0.45 * ridged(x * 31, y * 31, z * 31, 2);
    km += r.km * s * s * (3 - 2 * s) * open * peaks;
  }
  // The highlands are rough and the seas are smooth: the lava filled every
  // hollow and set flat, and nothing much has happened to it since.
  const rough = 1 - 0.75 * mareAt(x, y, z);
  km += ridged(x * 6.1, y * 6.1, z * 6.1, 4) * 1.2 * rough;
  km += fbm(x * 2.3, y * 2.3, z * 2.3, 3) * 0.8;
  km += ridged(x * 36, y * 36, z * 36, 3) * 0.45 * rough;
  return clamp(DATUM + km * UNITS_PER_KM, 0, MAX_RELIEF);
}

// ---------------------------------------------------------------------------
// The rays
// ---------------------------------------------------------------------------

/** An integer hash to [0, 1): the rays' angles and lengths, fixed at load. */
function hash(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

interface Rayed {
  name: string;
  x: number;
  y: number;
  z: number;
  /** A tangent basis at the centre, for the azimuth. */
  ex: [number, number, number];
  ny: [number, number, number];
  /** Crater radius, units: inside 2.4 of it the ejecta blanket is bright all round. */
  radius: number;
  /** Cosine of the farthest ray's reach. */
  edge: number;
  rays: { angle: number; length: number; width: number; streak: number }[];
}

/**
 * The young craters whose ejecta still lies bright on the ground, rays and
 * all: the solar wind darkens lunar soil over a billion years or so, and
 * these have not had that long. Tycho's rays really reach 1,500 km; they are
 * drawn to 28 degrees (850 km) so the southern uplands are not one white sheet.
 */
function rayed(name: string, lat: number, lon: number, diameterKm: number, reachDeg: number, count: number, seed: number): Rayed {
  toUnit(lat, lon, scratch);
  const x = scratch[0]!;
  const y = scratch[1]!;
  const z = scratch[2]!;
  // North in the tangent plane, then east as up x north.
  let nx = -x * y;
  let ny = 1 - y * y;
  let nz = -z * y;
  const n = Math.hypot(nx, ny, nz) || 1;
  nx /= n;
  ny /= n;
  nz /= n;
  const e: [number, number, number] = [y * nz - z * ny, z * nx - x * nz, x * ny - y * nx];
  const radius = unitsOf(diameterKm / 2);
  const reach = (reachDeg * Math.PI) / 180;
  const rays: Rayed['rays'] = [];
  for (let k = 0; k < count; k++) {
    rays.push({
      angle: hash(seed * 97 + k) * Math.PI * 2,
      length: reach * SURFACE_RADIUS * (0.4 + 0.6 * hash(seed * 131 + k)),
      width: radius * (0.25 + 0.35 * hash(seed * 173 + k)),
      streak: 60 + 140 * hash(seed * 211 + k),
    });
  }
  return { name, x, y, z, ex: e, ny: [nx, ny, nz], radius, edge: Math.cos(reach), rays };
}

const RAYED: readonly Rayed[] = [
  rayed('Tycho', -43.31, -11.36, 85, 28, 14, 1),
  rayed('Copernicus', 9.62, -20.08, 93, 11, 12, 2),
  rayed('Kepler', 8.12, -38.01, 31, 6, 10, 3),
  rayed('Aristarchus', 23.73, -47.49, 40, 5, 9, 4),
  rayed('Proclus', 16.1, 46.8, 28, 6, 7, 5),
  rayed('Giordano Bruno', 35.9, 102.8, 22, 5, 9, 6),
  rayed('Jackson', 22.4, -163.1, 71, 8, 10, 7),
];

/** 0 to 1: how bright the fresh ejecta is at a unit point. */
function rayAt(x: number, y: number, z: number): number {
  let best = 0;
  for (const c of RAYED) {
    const d = x * c.x + y * c.y + z * c.z;
    if (d <= c.edge) continue;
    const dist = Math.acos(Math.min(1, d)) * SURFACE_RADIUS;
    // The continuous blanket: bright all round, out to 2.4 crater radii.
    if (dist < c.radius * 2.4) return 1;
    const azimuth = Math.atan2(x * c.ny[0] + y * c.ny[1] + z * c.ny[2], x * c.ex[0] + y * c.ex[1] + z * c.ex[2]);
    for (const ray of c.rays) {
      if (dist > ray.length) continue;
      let off = Math.abs(azimuth - ray.angle);
      if (off > Math.PI) off = Math.PI * 2 - off;
      const across = off * dist;
      // A ray narrows and breaks up as it goes: a streak, then a gap, then a
      // fainter streak, which is what secondary craters strung along it do.
      const width = ray.width * (1 - 0.55 * (dist / ray.length));
      if (across > width) continue;
      const fade = 1 - smoothstep(0.55, 1, dist / ray.length);
      const streak = 0.55 + 0.45 * Math.sin(dist / ray.streak + ray.angle * 7);
      best = Math.max(best, (1 - smoothstep(0.5, 1, across / width)) * fade * streak * 1.4);
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// The classifier
// ---------------------------------------------------------------------------

/** Shorty, the little crater at Taurus-Littrow whose rim was orange. See `FEATURES`. */
const SHORTY = { lat: 19.7, lon: 30.05, radius: 8 };
const SHORTY_CAP = cap(SHORTY.lat, SHORTY.lon, ((SHORTY.radius * 1.5) / SURFACE_RADIUS) * (180 / Math.PI), 1);

export const BIOMES: Record<string, BodyBiome> = {
  highland: { id: 'highland', color: PALETTE.bone, cover: 0.1, parts: ['moon-blocks', 'moon-split-rock'] },
  margin: { id: 'margin', color: PALETTE.tan, cover: 0.07, parts: ['moon-blocks', 'moon-split-rock'] },
  mare: { id: 'mare', color: PALETTE.slate, cover: 0.04, parts: ['moon-blocks'] },
  'mare-dark': { id: 'mare-dark', color: PALETTE.steel, cover: 0.04, parts: ['moon-blocks'] },
  mantle: { id: 'mantle', color: PALETTE.bark, cover: 0.02, parts: ['moon-blocks'] },
  ray: { id: 'ray', color: PALETTE.white, cover: 0.16, parts: ['moon-blocks', 'moon-split-rock'] },
  // "It's orange!" — Harrison Schmitt, Apollo 17, 12 December 1972: volcanic
  // glass beads in the rim of Shorty, the one patch of colour on the Moon.
  orange: { id: 'orange', color: PALETTE.orange, cover: 0, parts: [] },
};

function classify(lat: number, lon: number, elevation: number, target: GroundSample): GroundSample {
  toUnit(lat, lon, P);
  const x = P[0]!;
  const y = P[1]!;
  const z = P[2]!;
  const mare = mareAt(x, y, z);
  // The first axis is how hard the sun beats down at noon: there is no
  // weather to make it anything else.
  target.warmth = clamp(1 - Math.abs(lat) / 90, 0, 1);
  target.second = mare;
  target.elevation = elevation;

  // Order: the orange glass, then the rays over everything they cross, then
  // the dark mantle, then the sea by its titanium, then the shore, then the
  // highland that is everything else.
  if (x * SHORTY_CAP.x + y * SHORTY_CAP.y + z * SHORTY_CAP.z > SHORTY_CAP.edge) target.id = 'orange';
  else if (rayAt(x, y, z) > 0.5) target.id = 'ray';
  else if (sumCaps(MANTLE, x, y, z) > 0.45) target.id = 'mantle';
  else if (mare > 0.5) target.id = sumCaps(TITANIUM, x, y, z) > 0.4 ? 'mare-dark' : 'mare';
  else if (mare > 0.3) target.id = 'margin';
  else target.id = 'highland';
  return target;
}

export const MOON_GROUND: GroundModel = {
  secondAxis: 'mare basalt',
  biomes: BIOMES,
  relief,
  at: classify,
};

/**
 * The random crater field is a third as dense on the seas: they are younger
 * by half a billion years and more, and a mare is the only ground on the Moon
 * smooth enough to land on — which is exactly why every Apollo came down on one.
 */
export function craterDensity(lat: number, lon: number): number {
  toUnit(lat, lon, P);
  return 1 - 0.62 * clamp(sumCaps(MARIA, P[0]!, P[1]!, P[2]!), 0, 1);
}

// ---------------------------------------------------------------------------
// The features, in walking units
// ---------------------------------------------------------------------------

interface Crater {
  name: string;
  x: number;
  y: number;
  z: number;
  /** Rim radius, units. */
  radius: number;
  /** Depth and rim height in units. */
  depth: number;
  rim: number;
  /** The flat floor's share of the radius. */
  floor: number;
  /** Terraces on the wall: slumped benches, which every big fresh crater has. */
  terraces: number;
  /** Central peak height as a share of the depth. */
  peak: number;
  /** How far the ejecta reaches, in radii: 2.2 fresh, 1.4 old and worn down. */
  outer: number;
  /** Cosine of the outer reach. */
  edge: number;
}

/**
 * `depth` and `rim` are shares of the **diameter**, as in `craters.ts`. Real
 * complex craters are shallower than this (Tycho is 4.8 km deep in 85, a
 * twentieth); drawn true, a crater a person stands in reads as a dish. These
 * are about twice the truth, which keeps the walls under the 63 degrees the
 * ground may tilt and makes the rim a climb.
 */
function crater(name: string, lat: number, lon: number, diameterKm: number, depth: number, rim: number, floor: number, terraces: number, peak: number, fresh: boolean): Crater {
  toUnit(lat, lon, scratch);
  const radius = unitsOf(diameterKm / 2);
  const outer = fresh ? 2.2 : 1.4;
  return {
    name,
    x: scratch[0]!,
    y: scratch[1]!,
    z: scratch[2]!,
    radius,
    depth: depth * radius * 2,
    rim: rim * radius * 2,
    floor,
    terraces,
    peak,
    outer,
    edge: Math.cos((radius * outer) / SURFACE_RADIUS),
  };
}

const CRATERS: readonly Crater[] = [
  crater('Tycho', -43.31, -11.36, 85, 0.12, 0.035, 0.42, 3, 0.55, true),
  crater('Copernicus', 9.62, -20.08, 93, 0.11, 0.03, 0.45, 3, 0.4, true),
  crater('Kepler', 8.12, -38.01, 31, 0.14, 0.04, 0.3, 1, 0.3, true),
  crater('Aristarchus', 23.73, -47.49, 40, 0.15, 0.04, 0.35, 2, 0.4, true),
  crater('Theophilus', -11.4, 26.4, 100, 0.11, 0.03, 0.42, 3, 0.6, true),
  crater('Plato', 51.6, -9.4, 101, 0.05, 0.03, 0.8, 1, 0, false),
  crater('Clavius', -58.4, -14.4, 231, 0.05, 0.015, 0.7, 0, 0, false),
  // Clavius's arc: five craters inside it, each smaller than the last,
  // curving across the floor. Positions approximate, sizes real.
  crater('Clavius D', -58.8, -12.4, 28, 0.13, 0.03, 0.3, 0, 0.2, false),
  crater('Clavius C', -57.6, -13.6, 21, 0.13, 0.03, 0.3, 0, 0, false),
  crater('Clavius N', -57.4, -15.7, 12, 0.14, 0.03, 0.25, 0, 0, false),
  crater('Clavius J', -58.1, -17.2, 12, 0.14, 0.03, 0.25, 0, 0, false),
  crater('Clavius JA', -59.0, -17.6, 6, 0.15, 0.03, 0.2, 0, 0, false),
  crater('Tsiolkovskiy', -20.4, 129.1, 185, 0.05, 0.02, 0.65, 2, 0.5, true),
  // Daedalus's central peaks are left out: a town stands on its floor.
  crater('Daedalus', -5.9, 179.4, 93, 0.09, 0.03, 0.5, 2, 0, false),
  crater('Shackleton', -89.9, 0, 21, 0.2, 0.04, 0.3, 0, 0, true),
  // Drawn at 16 units across against a real 110 m, so a player can find it.
  crater('Shorty', SHORTY.lat, SHORTY.lon, SHORTY.radius * 2 * KM_PER_UNIT, 0.12, 0.04, 0.3, 0, 0, true),
];

function craterProfile(c: Crater, t: number): number {
  if (t >= c.outer) return 0;
  if (t >= 1) {
    const fall = (c.outer - t) / (c.outer - 1);
    return c.rim * fall * fall;
  }
  let s = smoothstep(c.floor, 1, t);
  if (c.terraces > 0) {
    // Benches: the wall's rise held back and let go, k under 1 so it never
    // turns downhill.
    const n = c.terraces;
    s -= (0.7 * Math.sin(2 * Math.PI * s * n)) / (2 * Math.PI * n);
  }
  let h = -c.depth + (c.depth + c.rim) * s;
  if (c.peak > 0 && t < 0.2) {
    const q = 1 - t / 0.2;
    h += c.depth * c.peak * q * q * (3 - 2 * q);
  }
  return h;
}

const namedCraters: Feature = (dir) => {
  let h = 0;
  for (const c of CRATERS) {
    const d = dir.x * c.x + dir.y * c.y + dir.z * c.z;
    if (d <= c.edge) continue;
    const t = (Math.acos(Math.min(1, d)) * SURFACE_RADIUS) / c.radius;
    h += craterProfile(c, t);
  }
  return h;
};

/**
 * A sinuous rille: a lava channel, or a lava tube whose roof fell in, winding
 * along a great-circle segment. **Rima Hadley** is 1.5 km wide and 300 m deep
 * and Apollo 15 parked on its lip; **Vallis Schröteri** begins at the Cobra
 * Head, a crater-like vent, and winds 160 km across the Aristarchus plateau.
 * Both are drawn wider and shallower than they are, so a person can walk down
 * into them without the ground tearing.
 */
interface Rille {
  ax: number;
  ay: number;
  az: number;
  /** The pole of the segment's great circle, and the unit vector along it at `a`. */
  n: [number, number, number];
  t: [number, number, number];
  length: number;
  halfWidth: number;
  depth: number;
  meander: number;
  wavelength: number;
  /** How much wider the head is: the Cobra Head. */
  head: number;
  /** Midpoint and the cosine of the reach, for the early out. */
  m: [number, number, number];
  edge: number;
}

function rille(fromLat: number, fromLon: number, toLat: number, toLon: number, halfWidth: number, depth: number, meander: number, wavelength: number, head: number): Rille {
  toUnit(fromLat, fromLon, scratch);
  const a: [number, number, number] = [scratch[0]!, scratch[1]!, scratch[2]!];
  toUnit(toLat, toLon, scratch);
  const b: [number, number, number] = [scratch[0]!, scratch[1]!, scratch[2]!];
  const n: [number, number, number] = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const nl = Math.hypot(...n);
  n[0] /= nl;
  n[1] /= nl;
  n[2] /= nl;
  // Along the circle at a, toward b: n x a.
  const t: [number, number, number] = [n[1] * a[2] - n[2] * a[1], n[2] * a[0] - n[0] * a[2], n[0] * a[1] - n[1] * a[0]];
  const span = Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const m: [number, number, number] = [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const ml = Math.hypot(...m);
  m[0] /= ml;
  m[1] /= ml;
  m[2] /= ml;
  const reach = span / 2 + (halfWidth * head + meander * 2) / SURFACE_RADIUS;
  return { ax: a[0], ay: a[1], az: a[2], n, t, length: span * SURFACE_RADIUS, halfWidth, depth, meander, wavelength, head, m, edge: Math.cos(reach) };
}

const RILLES: readonly Rille[] = [
  // Rima Hadley, held 70 units west of the landing site so the site's pad does
  // not level it away.
  rille(24.4, 2.3, 28.0, 3.0, 16, 10, 8, 160, 1),
  // Vallis Schröteri, from the Cobra Head north-west across the plateau.
  rille(24.2, -49.5, 27.0, -53.0, 20, 11, 14, 240, 2.2),
];

const rilles: Feature = (dir) => {
  let h = 0;
  for (const r of RILLES) {
    if (dir.x * r.m[0] + dir.y * r.m[1] + dir.z * r.m[2] <= r.edge) continue;
    const across = Math.asin(clamp(dir.x * r.n[0] + dir.y * r.n[1] + dir.z * r.n[2], -1, 1)) * SURFACE_RADIUS;
    const along = Math.atan2(dir.x * r.t[0] + dir.y * r.t[1] + dir.z * r.t[2], dir.x * r.ax + dir.y * r.ay + dir.z * r.az) * SURFACE_RADIUS;
    if (along < -r.halfWidth * r.head || along > r.length + r.halfWidth) continue;
    const u = clamp(along / r.length, 0, 1);
    const centre = r.meander * Math.sin((2 * Math.PI * along) / r.wavelength) * Math.sin(Math.PI * u);
    const width = r.halfWidth * (1 + (r.head - 1) * (1 - smoothstep(0, 0.12, u)));
    // The ends close over a width, so the channel begins and ends in a bowl.
    const endA = along < 0 ? -along : 0;
    const endB = along > r.length ? along - r.length : 0;
    const off = Math.hypot(across - centre, endA + endB);
    if (off >= width) continue;
    h -= r.depth * (1 - smoothstep(width * 0.35, width, off)) * (r.head > 1 ? 1 + 0.3 * (1 - smoothstep(0, 0.12, u)) : 1);
  }
  return h;
};

/**
 * **Rupes Recta**, the Straight Wall: a fault 110 km long across the eastern
 * floor of Mare Nubium, the ground east of it standing a few hundred metres
 * higher. Drawn as a scarp sixteen units tall, which is four people: a wall to
 * walk along, and climb at either end where it fades out.
 */
const WALL = (() => {
  toUnit(-20.6, -8.3, scratch);
  const a: [number, number, number] = [scratch[0]!, scratch[1]!, scratch[2]!];
  toUnit(-23.6, -7.3, scratch);
  const b: [number, number, number] = [scratch[0]!, scratch[1]!, scratch[2]!];
  const n: [number, number, number] = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const nl = Math.hypot(...n);
  n[0] /= nl;
  n[1] /= nl;
  n[2] /= nl;
  // Which side of the circle is east, asked of a point that is: no handedness
  // is assumed in a cross product nobody checked.
  toUnit(-22, -5, scratch);
  if (scratch[0]! * n[0] + scratch[1]! * n[1] + scratch[2]! * n[2] < 0) {
    n[0] = -n[0];
    n[1] = -n[1];
    n[2] = -n[2];
  }
  const t: [number, number, number] = [n[1] * a[2] - n[2] * a[1], n[2] * a[0] - n[0] * a[2], n[0] * a[1] - n[1] * a[0]];
  const span = Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const m: [number, number, number] = [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const ml = Math.hypot(...m);
  return { a, n, t, length: span * SURFACE_RADIUS, m: m.map((v) => v / ml), edge: Math.cos(span * 0.7 + 400 / SURFACE_RADIUS), height: 16, width: 10, apron: 300 };
})();

const straightWall: Feature = (dir) => {
  const w = WALL;
  if (dir.x * w.m[0]! + dir.y * w.m[1]! + dir.z * w.m[2]! <= w.edge) return 0;
  const across = Math.asin(clamp(dir.x * w.n[0] + dir.y * w.n[1] + dir.z * w.n[2], -1, 1)) * SURFACE_RADIUS;
  const along = Math.atan2(dir.x * w.t[0] + dir.y * w.t[1] + dir.z * w.t[2], dir.x * w.a[0] + dir.y * w.a[1] + dir.z * w.a[2]) * SURFACE_RADIUS;
  // The step, faded out along its length at both ends and back to nothing
  // `apron` units east, so the raised side is a terrace and not a continent.
  const ends = smoothstep(-40, 30, along) * (1 - smoothstep(w.length - 30, w.length + 40, along));
  if (ends <= 0) return 0;
  const step = smoothstep(-w.width, w.width, across) * (1 - smoothstep(w.apron * 0.5, w.apron, across));
  return w.height * step * ends;
};

/**
 * The lava-tube skylights: pits where a tube's roof fell in, found by the
 * Kaguya and Lunar Reconnaissance Orbiter cameras. **Marius Hills** (2009),
 * **Mare Tranquillitatis** (2009) and **Mare Ingenii** (2010) are each about
 * a hundred metres across and as deep; drawn here 26 units in radius and
 * twenty deep — a funnel to the dark, about twenty times the truth across.
 */
const PITS: readonly { x: number; y: number; z: number; inner: number; outer: number; depth: number; edge: number }[] = [
  [14.09, -56.81],
  [8.335, 33.222],
  [-35.95, 166.06],
].map(([lat, lon]) => {
  toUnit(lat!, lon!, scratch);
  return { x: scratch[0]!, y: scratch[1]!, z: scratch[2]!, inner: 6, outer: 26, depth: 20, edge: Math.cos(30 / SURFACE_RADIUS) };
});

const skylights: Feature = (dir) => {
  let h = 0;
  for (const p of PITS) {
    const d = dir.x * p.x + dir.y * p.y + dir.z * p.z;
    if (d <= p.edge) continue;
    const r = Math.acos(Math.min(1, d)) * SURFACE_RADIUS;
    // A lip a unit high round the edge, where the roof broke and slumped outward.
    h += -p.depth * (1 - smoothstep(p.inner, p.outer, r)) + 1.2 * Math.max(0, 1 - Math.abs(r - p.outer) / 4);
  }
  return h;
};

export const FEATURES: readonly Feature[] = [namedCraters, rilles, straightWall, skylights];
