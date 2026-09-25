import * as THREE from 'three';
import type { LandRing, World } from './geo.ts';
import { PLANET_RADIUS, UNITS_PER_DEGREE, coastEdges, onSphere } from './globe.ts';
import { meanTemperature } from './biome.ts';
import { fbm } from './terrain.ts';
import { hash3 } from './weather.ts';
import { latOf, lonOf } from './sphere.ts';

/**
 * The floor of the sea, as a pure function of the world.
 *
 * **Until this file the sea had no bottom.** The water was an opaque sphere at
 * `PLANET_RADIUS` and the only depth it had was a colour: a ramp from shoal to
 * abyss by distance from land (`ocean.ts`). This is the depth itself — how far
 * under the surface the sand, the reef and the kelp stand — and it is the one
 * definition of it: the seabed mesh is laid on it, a diver and a submarine are
 * floored by it, the corals and the fish are placed against it, and the water
 * over it is as clear as it is shallow.
 *
 * **It is a function of the distance to the nearest coast, and of nothing
 * else that moves.** This planet has no bathymetry, and the colour ramp already
 * made the call that distance from land is most of what decides the look of a
 * sea; the floor follows the same law, so the water is pale exactly where it is
 * shallow. The profile is the one a real coast has in section: a sandy shelf
 * falling gently from the beach, a reef flat where the corals grow, a reef edge
 * where it drops away, and the deep. Two slow noises break it up — one
 * stretches or squeezes the whole profile, so some coasts shelve for a long
 * way and some drop off at once, and one lays bumps and hollows on it in
 * proportion to its depth.
 *
 * **The distance is exact, not a field.** `terrain.ts` owns two coast fields
 * and neither answers this: `shoreDistance` is zero everywhere at sea, and the
 * fine shore index stops at the shore ramp's 130 units. So the coastline is
 * indexed here again, from `coastEdges` — the same segments the shallows lay
 * their surf along — with the distance *along* the shore kept on each segment,
 * because the surf is a phase running down the beach and the water drawn here
 * has to carry it on where the ribbon hands over.
 *
 * **The distance is unsigned, and that is safe rather than lazy.** A point on
 * land a few units from the coast gets the same shallow depth a point in the
 * water does, and nothing is wrong: the lowest ground on the planet is
 * `SHORE_LIP`, four units *over* the sea, and the shallowest floor is
 * `MIN_DEPTH` under it, so a seabed under land is always under the land and
 * never seen. What does need the side — whether a coral or a fish is in the
 * water at all — asks `countryAt`.
 */

const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------
// The profile
// ---------------------------------------------------------------------------

/**
 * The depth profile, in world units under the sea's radius, against distance
 * from the coast in world units. One unit is 0.79 m at `SCENERY_SCALE`.
 *
 * - `COAST_DEPTH` at the waterline: two knees of water where the land's wall
 *   meets the sand, so the beach runs straight in.
 * - `SHELF_DEPTH` at `SHELF_RUN`: the sandy shelf, wading and then swimming
 *   depth, where the water is turquoise over sand.
 * - `FLAT_DEPTH` at `REEF_EDGE`: the reef flat, where the corals are densest.
 * - `SLOPE_DEPTH` at `DROP_END`: the reef edge, the drop-off where the water
 *   turns from turquoise to blue in a few body lengths.
 * - `OPEN_DEPTH` at `SEA_REACH` and beyond: the deep, which nothing shows.
 */
export const COAST_DEPTH = 1.2;
export const SHELF_DEPTH = 6.5;
export const FLAT_DEPTH = 11;
export const SLOPE_DEPTH = 55;
export const OPEN_DEPTH = 130;
export const SHELF_RUN = 100;
export const REEF_EDGE = 200;
export const DROP_END = 320;
export const SEA_REACH = 560;
/** The shallowest the floor ever is, anywhere: the bumps may not bring it closer to the surface. */
export const MIN_DEPTH = 0.9;
/**
 * How far a coast is looked for when a colour needs it, in units: the water's
 * shoal-to-deep ramp runs past the floor's reach (`ABYSS` in `ocean.ts`), and
 * the water drawn over the floor has to agree with the ribbon and the sphere
 * where it hands over to them.
 */
export const COLOUR_REACH = 1200;

/** How far the profile stretches or squeezes, and the scale it does it over (a unit-sphere frequency). */
const STRETCH_MIN = 0.6;
const STRETCH_MAX = 1.5;
const STRETCH_FREQUENCY = 8;
/** The bumps: their frequency (about 60 units across) and how deep, as a share of the depth, capped. */
const BUMP_FREQUENCY = 266;
const BUMP_SHARE = 0.28;
const BUMP_MAX = 3.5;

const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);
const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * The depth at a point on the unit sphere `distance` units from the nearest
 * coast: the profile, stretched by the coast's own noise, with its bumps.
 * Continuous in both, so the floor has no step anywhere.
 */
export function depthAtDistance(x: number, y: number, z: number, distance: number): number {
  const stretch = STRETCH_MIN + (STRETCH_MAX - STRETCH_MIN) *
    smoothstep(0.3, 0.7, fbm(x * STRETCH_FREQUENCY, y * STRETCH_FREQUENCY, z * STRETCH_FREQUENCY, 2));
  const d = Math.max(0, distance) / stretch;
  let depth: number;
  if (d < SHELF_RUN) depth = COAST_DEPTH + (SHELF_DEPTH - COAST_DEPTH) * smoothstep(0, SHELF_RUN, d) ** 0.8;
  else if (d < REEF_EDGE) depth = SHELF_DEPTH + (FLAT_DEPTH - SHELF_DEPTH) * ((d - SHELF_RUN) / (REEF_EDGE - SHELF_RUN));
  else if (d < DROP_END) depth = FLAT_DEPTH + (SLOPE_DEPTH - FLAT_DEPTH) * smoothstep(REEF_EDGE, DROP_END, d);
  else depth = SLOPE_DEPTH + (OPEN_DEPTH - SLOPE_DEPTH) * smoothstep(DROP_END, SEA_REACH, d);
  const bump = (fbm(x * BUMP_FREQUENCY, y * BUMP_FREQUENCY, z * BUMP_FREQUENCY, 3) - 0.5) * 2;
  depth += bump * Math.min(BUMP_MAX, depth * BUMP_SHARE);
  return Math.max(MIN_DEPTH, depth);
}

// ---------------------------------------------------------------------------
// The coast, indexed
// ---------------------------------------------------------------------------

/** The coast index's cell, in degrees: about 140 units, a few surf spans. */
const CELL = 0.5;
const COLS = 360 / CELL;
const ROWS = 180 / CELL;
/** The surf's phase wraps here, as the ribbon's does (`PHASE_WRAP` in `ocean.ts`). */
export const PHASE_WRAP = 90000;

interface CoastIndex {
  /** Per segment: its two ends on the unit sphere, six numbers. */
  ends: Float64Array;
  /** Per segment: the distance along the shore at each end, in units. */
  phases: Float64Array;
  /** Per segment: 1 if it is a lake's shore. */
  lake: Uint8Array;
  head: Int32Array;
  next: Int32Array;
  item: Int32Array;
  segments: number;
}

let index: CoastIndex | null = null;
let indexedFor: World | null = null;
let worldOf: World | null = null;

/**
 * Indexes the coast once per world. Idempotent; the world, the game and the
 * headless check each call it before asking anything here.
 *
 * The phase along the shore is counted the way the shallows count it
 * (`buildShallows` in `ocean.ts`): round each ring from its first land edge,
 * over the land edges as well, so a coast interrupted by a frontier picks the
 * phase up where it left it and the surf drawn here runs on from the ribbon's.
 */
export function prepareSeaFloor(world: World): void {
  if (indexedFor === world && index !== null) return;
  const seaward = coastEdges(world);
  const ends: number[] = [];
  const phases: number[] = [];
  const lakes: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const rings = world.rings as LandRing[];
  for (let r = 0; r < rings.length; r++) {
    const ring = rings[r]!;
    const flags = seaward[r]!;
    const points = ring.points;
    const n = points.length;
    let start = 0;
    while (start < n && flags[start] === 1) start++;
    if (start === n) start = 0;
    let travelled = 0;
    for (let k = 0; k < n; k++) {
      const i = (start + k) % n;
      const j = (i + 1) % n;
      onSphere(points[i]![0]!, points[i]![1]!, a);
      onSphere(points[j]![0]!, points[j]![1]!, b);
      const span = a.angleTo(b) * PLANET_RADIUS;
      if (flags[i] === 1 && span >= 0.001) {
        ends.push(a.x, a.y, a.z, b.x, b.y, b.z);
        phases.push(travelled, travelled + span);
        lakes.push(ring.water === true ? 1 : 0);
      }
      travelled += span;
    }
  }
  const segments = lakes.length;
  const head = new Int32Array(COLS * ROWS).fill(-1);
  const item: number[] = [];
  const next: number[] = [];
  for (let s = 0; s < segments; s++) {
    const alat = latOf(ends[s * 6 + 1]!);
    const alon = lonOf(ends[s * 6]!, ends[s * 6 + 2]!);
    const blat = latOf(ends[s * 6 + 4]!);
    const blon = lonOf(ends[s * 6 + 3]!, ends[s * 6 + 5]!);
    const r0 = clamp(Math.floor((90 - Math.max(alat, blat)) / CELL), 0, ROWS - 1);
    const r1 = clamp(Math.floor((90 - Math.min(alat, blat)) / CELL), 0, ROWS - 1);
    // A segment across the antimeridian is filed at both of its ends' columns
    // rather than at every column between them the long way round.
    const across = Math.abs(alon - blon) > 180;
    const columns = across
      ? [Math.floor((alon + 180) / CELL), Math.floor((blon + 180) / CELL)]
      : null;
    const c0 = Math.floor((Math.min(alon, blon) + 180) / CELL);
    const c1 = Math.floor((Math.max(alon, blon) + 180) / CELL);
    for (let row = r0; row <= r1; row++) {
      const file = (col: number): void => {
        const cell = row * COLS + (((col % COLS) + COLS) % COLS);
        item.push(s);
        next.push(head[cell]!);
        head[cell] = item.length - 1;
      };
      if (columns !== null) for (const col of columns) file(col);
      else for (let col = c0; col <= c1; col++) file(col);
    }
  }
  index = {
    ends: Float64Array.from(ends),
    phases: Float64Array.from(phases),
    lake: Uint8Array.from(lakes),
    head,
    next: Int32Array.from(next),
    item: Int32Array.from(item),
    segments,
  };
  indexedFor = world;
  worldOf = world;
  tiles.clear();
}

/** How many coast segments the index holds; for the check and the console. */
export const coastSegments = (): number => index?.segments ?? 0;

/** What `coastAt` answers, written in place. */
export interface CoastSample {
  /** Units to the nearest coast along the surface, or `Infinity` past the reach asked. */
  distance: number;
  /** How far along the shore the nearest point of it is, units, wrapped at `PHASE_WRAP`. */
  phase: number;
  /** Whether that shore is a lake's. */
  lake: boolean;
}

export const coastSample = (): CoastSample => ({ distance: Infinity, phase: 0, lake: false });

/**
 * The nearest coast to a point on the unit sphere, within `reach` units.
 *
 * The cells are searched outwards in rings, and a ring is the last one needed
 * once the nearest segment found so far is closer than the ring's own inner
 * edge: anything nearer would have had to cross it. Near a coast that is the
 * first ring or two; in the open ocean it is a walk over empty cells, which is
 * a read of `head` each.
 */
export function coastAt(x: number, y: number, z: number, reach: number, out: CoastSample): CoastSample {
  out.distance = Infinity;
  out.phase = 0;
  out.lake = false;
  const at = index;
  if (at === null) throw new Error('sea-floor: prepareSeaFloor(world) has to run first');
  const { ends, head, next, item } = at;
  const lat = latOf(y);
  const lon = lonOf(x, z);
  const row = clamp(Math.floor((90 - lat) / CELL), 0, ROWS - 1);
  const col = Math.floor((lon + 180) / CELL);
  const cellUnits = CELL * UNITS_PER_DEGREE;

  let best = Infinity;
  let bestSegment = -1;
  let bestT = 0;
  const scan = (r: number, c: number): void => {
    let entry = head[r * COLS + (((c % COLS) + COLS) % COLS)]!;
    while (entry >= 0) {
      const s = item[entry]!;
      const o = s * 6;
      const px = ends[o]!, py = ends[o + 1]!, pz = ends[o + 2]!;
      const ex = ends[o + 3]! - px, ey = ends[o + 4]! - py, ez = ends[o + 5]! - pz;
      const span = ex * ex + ey * ey + ez * ez;
      const t = span > 0 ? clamp(((x - px) * ex + (y - py) * ey + (z - pz) * ez) / span, 0, 1) : 0;
      const dx = x - (px + ex * t);
      const dy = y - (py + ey * t);
      const dz = z - (pz + ez * t);
      const chord = dx * dx + dy * dy + dz * dz;
      if (chord < best) {
        best = chord;
        bestSegment = s;
        bestT = t;
      }
      entry = next[entry]!;
    }
  };
  const arcOf = (chord2: number): number => 2 * Math.asin(Math.min(1, Math.sqrt(chord2) / 2)) * PLANET_RADIUS;

  // Ring 0 is the point's own cell; ring k the cells k rows or k columns'
  // worth of *distance* away, which near a pole is many columns.
  let lastRows = -1;
  let lastCols = -1;
  let wideDone = false;
  for (let k = 0; ; k++) {
    const rowsOut = k;
    // A degree of longitude is narrowest at the poleward edge of the rows in
    // range, so that is the latitude the columns are counted at.
    const edge = Math.min(90, Math.abs(lat) + (k + 1) * CELL);
    const colsOut = Math.ceil(k / Math.max(1e-3, Math.cos(edge * DEG)));
    const wide = colsOut * 2 + 1 >= COLS;
    if (wide) {
      if (!wideDone) {
        // Past the pole's worth of columns: every column of every row in range, once.
        for (let r = Math.max(0, row - rowsOut); r <= Math.min(ROWS - 1, row + rowsOut); r++) {
          for (let c = 0; c < COLS; c++) scan(r, c);
        }
        wideDone = true;
      } else {
        for (const r of [row - rowsOut, row + rowsOut]) {
          if (r < 0 || r >= ROWS) continue;
          for (let c = 0; c < COLS; c++) scan(r, c);
        }
      }
    } else {
      for (let r = row - rowsOut; r <= row + rowsOut; r++) {
        if (r < 0 || r >= ROWS) continue;
        const inner = Math.abs(r - row) <= lastRows;
        for (let c = col - colsOut; c <= col + colsOut; c++) {
          if (inner && Math.abs(c - col) <= lastCols) continue;
          scan(r, c);
        }
      }
    }
    lastRows = rowsOut;
    lastCols = colsOut;
    // Everything within `k` cells of the point's own cell has been read, so
    // nothing unread is nearer than `k` cells.
    const covered = k * cellUnits;
    if (bestSegment >= 0 && arcOf(best) <= covered) break;
    if (covered >= reach || (wide && row - rowsOut <= 0 && row + rowsOut >= ROWS - 1)) break;
  }
  if (bestSegment < 0) return out;
  const distance = arcOf(best);
  if (distance > reach) return out;
  out.distance = distance;
  const pa = at.phases[bestSegment * 2]!;
  const pb = at.phases[bestSegment * 2 + 1]!;
  out.phase = (pa + (pb - pa) * bestT) % PHASE_WRAP;
  out.lake = at.lake[bestSegment] === 1;
  return out;
}

const depthSample = coastSample();

/**
 * How far the floor is under the sea's radius at a point (any length; only its
 * direction is read), in world units. `OPEN_DEPTH` past `SEA_REACH`.
 *
 * Over land it answers too, and what it answers is under the land; see the
 * file's head.
 */
export function seaDepthAt(point: { x: number; y: number; z: number }): number {
  const length = Math.hypot(point.x, point.y, point.z) || 1;
  const x = point.x / length, y = point.y / length, z = point.z / length;
  coastAt(x, y, z, SEA_REACH, depthSample);
  return depthAtDistance(x, y, z, depthSample.distance === Infinity ? SEA_REACH : depthSample.distance);
}

// ---------------------------------------------------------------------------
// What lives down there
// ---------------------------------------------------------------------------

/**
 * Which of four seas a place is, from the mean temperature of its latitude
 * (`meanTemperature` in `biome.ts`, the one thermometer on the planet):
 *
 * - `reef`: warm water, over `REEF_WARM`, where corals build. About 28 degrees
 *   north and south of the equator: the Caribbean, the Red Sea, the Maldives,
 *   the Great Barrier Reef, Indonesia.
 * - `kelp`: cold water, under `KELP_COLD` and over `KELP_ICE`: forests of it
 *   off California, Chile, the Cape, Tasmania, Norway and Japan's north.
 * - `meadow`: the water between, and every lake: seagrass and rock.
 * - `barren`: the polar seas, rock and not much else.
 */
export type SeaZone = 'reef' | 'kelp' | 'meadow' | 'barren';
export const REEF_WARM = 20;
export const KELP_COLD = 16;
export const KELP_ICE = -1;

export function seaZoneAt(lat: number, lake: boolean): SeaZone {
  if (lake) return 'meadow';
  const t = meanTemperature(lat, 0);
  if (t >= REEF_WARM) return 'reef';
  if (t <= KELP_ICE) return 'barren';
  if (t <= KELP_COLD) return 'kelp';
  return 'meadow';
}

/** The things on the floor, by what they are drawn as. */
export const DECOR_KINDS = ['branch', 'brain', 'fan', 'tubes', 'kelp', 'grass', 'rock', 'star', 'urchin'] as const;
export type DecorKind = (typeof DECOR_KINDS)[number];

/** Which zones grow each of them, and between which depths. */
export const DECOR_RANGE: Readonly<Record<DecorKind, { zones: readonly SeaZone[]; shallow: number; deep: number }>> = {
  branch: { zones: ['reef'], shallow: 1.6, deep: 18 },
  brain: { zones: ['reef'], shallow: 1.4, deep: 18 },
  fan: { zones: ['reef'], shallow: 2.5, deep: 22 },
  tubes: { zones: ['reef'], shallow: 1.6, deep: 16 },
  kelp: { zones: ['kelp'], shallow: 3, deep: 26 },
  grass: { zones: ['meadow', 'reef', 'kelp'], shallow: 1.2, deep: 12 },
  rock: { zones: ['reef', 'kelp', 'meadow', 'barren'], shallow: 1.2, deep: 40 },
  star: { zones: ['reef', 'kelp', 'meadow'], shallow: 1.2, deep: 14 },
  urchin: { zones: ['reef', 'kelp'], shallow: 1.4, deep: 16 },
};

/** The fish, the sharks, the rays and the turtles that live on a tile. */
export type CruiserKind = 'shark' | 'ray' | 'turtle';
export const CRUISER_KINDS: readonly CruiserKind[] = ['shark', 'ray', 'turtle'];

export interface Decor {
  kind: DecorKind;
  /** Where it stands, on the unit sphere. */
  x: number;
  y: number;
  z: number;
  /** The floor's depth under it. */
  depth: number;
  scale: number;
  yaw: number;
  /** 0 to 1, which of its colours it wears. */
  tone: number;
}

export interface School {
  /** The middle of its home water, on the unit sphere. */
  x: number;
  y: number;
  z: number;
  /** The floor's depth there, and the depth it swims at. */
  floor: number;
  swim: number;
  /** How wide it wanders from home, units, and how fast, units a second. */
  roam: number;
  speed: number;
  count: number;
  /** 0 to 1: which of the zone's colourings. */
  tone: number;
  seed: number;
  zone: SeaZone;
}

export interface Cruiser {
  kind: CruiserKind;
  x: number;
  y: number;
  z: number;
  floor: number;
  swim: number;
  roam: number;
  speed: number;
  seed: number;
}

// ---------------------------------------------------------------------------
// The tiles
// ---------------------------------------------------------------------------

/**
 * The floor is cut into tiles on a **cube sphere**, fixed to the planet: six
 * faces, each `TILES_PER_FACE` tiles square, each tile `TILE_QUADS` quads
 * square, the angles equalised (`tan` of the face coordinate) so a quad is
 * within a few percent of `TILE_UNITS / TILE_QUADS` everywhere. Fixed to the
 * planet is the point: a tile is a pure function of its key, so what stands on
 * it is the same however you arrive, and two tiles share their edge vertices
 * exactly — across a cube's edge as well — so the floor has no crack.
 */
export const TILES_PER_FACE = 64;
export const TILE_QUADS = 32;
/** A tile's side along the middle of a face, in units: a quarter of a degree short of four hundred. */
export const TILE_UNITS = (PLANET_RADIUS * Math.PI) / 2 / TILES_PER_FACE;

/** The six faces: normal, then the two in-face axes, `U x W = N` so a quad wound U then W faces out. */
const FACES: readonly (readonly [number, number, number, number, number, number, number, number, number])[] = [
  [1, 0, 0, 0, 0, -1, 0, 1, 0],
  [-1, 0, 0, 0, 0, 1, 0, 1, 0],
  [0, 1, 0, 1, 0, 0, 0, 0, -1],
  [0, -1, 0, 1, 0, 0, 0, 0, 1],
  [0, 0, 1, 1, 0, 0, 0, 1, 0],
  [0, 0, -1, -1, 0, 0, 0, 1, 0],
];

/** A tile's key: `face * 4096 + ti * 64 + tj`. */
export const tileKey = (face: number, ti: number, tj: number): number => face * TILES_PER_FACE * TILES_PER_FACE + ti * TILES_PER_FACE + tj;
export const tileFace = (key: number): number => Math.floor(key / (TILES_PER_FACE * TILES_PER_FACE));
export const tileI = (key: number): number => Math.floor(key / TILES_PER_FACE) % TILES_PER_FACE;
export const tileJ = (key: number): number => key % TILES_PER_FACE;

/** The tile a direction falls in. */
export function tileOf(x: number, y: number, z: number): number {
  const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
  const face = ax >= ay && ax >= az ? (x >= 0 ? 0 : 1) : ay >= az ? (y >= 0 ? 2 : 3) : z >= 0 ? 4 : 5;
  const f = FACES[face]!;
  const n = x * f[0] + y * f[1] + z * f[2];
  const u = (x * f[3] + y * f[4] + z * f[5]) / n;
  const w = (x * f[6] + y * f[7] + z * f[8]) / n;
  const a = (Math.atan(u) * 4) / Math.PI;
  const b = (Math.atan(w) * 4) / Math.PI;
  const ti = clamp(Math.floor(((a + 1) / 2) * TILES_PER_FACE), 0, TILES_PER_FACE - 1);
  const tj = clamp(Math.floor(((b + 1) / 2) * TILES_PER_FACE), 0, TILES_PER_FACE - 1);
  return tileKey(face, ti, tj);
}

/**
 * Vertex `(i, j)` of a tile, `0 .. TILE_QUADS` each way — fractions allowed,
 * which is how a point inside a quad is found — on the unit sphere.
 */
export function tilePoint(key: number, i: number, j: number, out: { x: number; y: number; z: number }): typeof out {
  const f = FACES[tileFace(key)]!;
  const span = TILES_PER_FACE * TILE_QUADS;
  const a = -1 + (2 * (tileI(key) * TILE_QUADS + i)) / span;
  const b = -1 + (2 * (tileJ(key) * TILE_QUADS + j)) / span;
  const u = Math.tan((a * Math.PI) / 4);
  const w = Math.tan((b * Math.PI) / 4);
  const x = f[0] + u * f[3] + w * f[6];
  const y = f[1] + u * f[4] + w * f[7];
  const z = f[2] + u * f[5] + w * f[8];
  const length = Math.hypot(x, y, z);
  out.x = x / length;
  out.y = y / length;
  out.z = z / length;
  return out;
}

/**
 * What stands on one tile: the decor on its floor, its schools of fish and its
 * larger swimmers. A pure function of the key and the world, memoised.
 */
export interface TileLife {
  key: number;
  zone: SeaZone;
  decor: Decor[];
  schools: School[];
  cruisers: Cruiser[];
  /** Whether any of it is water at all; a tile wholly inland is skipped. */
  wet: boolean;
}

const tiles = new Map<number, TileLife>();
/** How many tiles' life is remembered; far more than are ever in range. */
const TILE_MEMORY = 96;

/** Candidates a tile draws its decor from: most fall on land, too deep or in the wrong zone. */
const DECOR_TRIES = 520;
/** Where coral clumps: a patchiness field (about 150 units across) and the share of it that is reef. */
const PATCH_FREQUENCY = 100;
/** How many schools and swimmers a tile tries for. */
const SCHOOL_TRIES = 10;
const CRUISER_TRIES = 3;

/** Deterministic numbers for one tile: `hash3` of the key, a counter and a salt. */
function tileRandom(key: number, n: number, salt: number): number {
  return hash3(key, n, salt);
}

const lifeSample = coastSample();
const point = { x: 0, y: 0, z: 0 };

/** The zone at a direction, and whether the water there is a lake's. */
function zoneAt(x: number, y: number, z: number): SeaZone {
  coastAt(x, y, z, SEA_REACH, lifeSample);
  return seaZoneAt(latOf(y), lifeSample.lake);
}

/** Whether a direction is water, by the outlines: the one land/sea answer (`countryAt`). */
export function isSeaAt(x: number, y: number, z: number): boolean {
  if (worldOf === null) throw new Error('sea-floor: prepareSeaFloor(world) has to run first');
  return worldOf.countryAt(latOf(y), lonOf(x, z)) === 0;
}

/**
 * The life of one tile, worked out a slice at a time: `step` does what it can
 * before `deadline` (a `performance.now()`), and returns the tile's life once
 * it is done. The answer does not depend on how it was sliced — the
 * candidates are taken in order, each from its own hash — so a tile built
 * over twenty frames is the tile built in one.
 */
export interface TileLifeJob {
  readonly key: number;
  step(deadline: number): TileLife | null;
}

export function tileLifeJob(key: number): TileLifeJob {
  const known = tiles.get(key);
  if (known !== undefined) {
    // Most recently used goes last, so the first key is the one to forget.
    tiles.delete(key);
    tiles.set(key, known);
    return { key, step: () => known };
  }
  const middle = tilePoint(key, TILE_QUADS / 2, TILE_QUADS / 2, { x: 0, y: 0, z: 0 });
  const zone = zoneAt(middle.x, middle.y, middle.z);
  const life: TileLife = { key, zone, decor: [], schools: [], cruisers: [], wet: false };
  let cursor = 0;
  let done: TileLife | null = null;
  return {
    key,
    step(deadline) {
      if (done !== null) return done;
      while (cursor < DECOR_TRIES) {
        decorCandidate(key, cursor++, life);
        if ((cursor & 15) === 0 && performance.now() > deadline) return null;
      }
      finishLife(key, life, middle);
      done = life;
      tiles.set(key, life);
      if (tiles.size > TILE_MEMORY) tiles.delete(tiles.keys().next().value!);
      return life;
    },
  };
}

/** The life of one tile, all at once: for the check, and for a tile needed now. */
export function tileLife(key: number): TileLife {
  const job = tileLifeJob(key);
  let life: TileLife | null = null;
  while (life === null) life = job.step(Infinity);
  return life;
}

/** One decor candidate of a tile: the `n`th, pushed onto `life` if it stands. */
function decorCandidate(key: number, n: number, life: TileLife): void {
  tilePoint(key, tileRandom(key, n, 1) * TILE_QUADS, tileRandom(key, n, 2) * TILE_QUADS, point);
  coastAt(point.x, point.y, point.z, SEA_REACH, lifeSample);
  if (lifeSample.distance === Infinity) return;
  const depth = depthAtDistance(point.x, point.y, point.z, lifeSample.distance);
  if (depth > 40) return;
  const here = seaZoneAt(latOf(point.y), lifeSample.lake);
  const patch = fbm(point.x * PATCH_FREQUENCY, point.y * PATCH_FREQUENCY, point.z * PATCH_FREQUENCY, 2);
  const pick = tileRandom(key, n, 3);
  let kind: DecorKind;
  if (here === 'reef') {
    // Corals clump: most of a reef's floor is sand, and the coral is in
    // heads and banks. Outside a clump, sand with a rock or a star on it.
    const clump = smoothstep(0.42, 0.62, patch);
    if (tileRandom(key, n, 4) < clump * 0.92) kind = pick < 0.34 ? 'branch' : pick < 0.58 ? 'brain' : pick < 0.78 ? 'tubes' : pick < 0.9 ? 'fan' : 'urchin';
    else kind = pick < 0.5 ? 'grass' : pick < 0.8 ? 'rock' : 'star';
  } else if (here === 'kelp') {
    const forest = smoothstep(0.38, 0.6, patch);
    if (tileRandom(key, n, 4) < forest * 0.9) kind = 'kelp';
    else kind = pick < 0.45 ? 'rock' : pick < 0.7 ? 'urchin' : pick < 0.85 ? 'star' : 'grass';
  } else if (here === 'meadow') {
    const bed = smoothstep(0.4, 0.62, patch);
    if (tileRandom(key, n, 4) < bed * 0.85) kind = 'grass';
    else kind = pick < 0.7 ? 'rock' : 'star';
  } else {
    if (tileRandom(key, n, 4) > 0.35) return;
    kind = 'rock';
  }
  const range = DECOR_RANGE[kind];
  if (depth < range.shallow || depth > range.deep || !range.zones.includes(here)) return;
  // The one land/sea test, and the dearest: only for what has passed the rest.
  if (!isSeaAt(point.x, point.y, point.z)) return;
  life.wet = true;
  life.decor.push({
    kind,
    x: point.x,
    y: point.y,
    z: point.z,
    depth,
    scale: 0.7 + 0.6 * tileRandom(key, n, 5),
    yaw: tileRandom(key, n, 6) * Math.PI * 2,
    tone: tileRandom(key, n, 7),
  });
}

/** A tile's schools and big swimmers, once its decor is done; cheap beside it. */
function finishLife(key: number, life: TileLife, middle: { x: number; y: number; z: number }): void {
  for (let n = 0; n < SCHOOL_TRIES; n++) {
    tilePoint(key, 2 + tileRandom(key, n, 11) * (TILE_QUADS - 4), 2 + tileRandom(key, n, 12) * (TILE_QUADS - 4), point);
    coastAt(point.x, point.y, point.z, SEA_REACH, lifeSample);
    const floor = depthAtDistance(point.x, point.y, point.z, lifeSample.distance === Infinity ? SEA_REACH : lifeSample.distance);
    if (floor < SCHOOL_FLOOR || floor > 60) continue;
    if (!isSeaAt(point.x, point.y, point.z)) continue;
    life.wet = true;
    const here = seaZoneAt(latOf(point.y), lifeSample.lake);
    // Between a third and two thirds of the way down, clear of both.
    const swim = floor * (0.35 + 0.3 * tileRandom(key, n, 13));
    // Its wander stays inside water this deep: a school roams no further than
    // the coast is from its home, less a margin, so it never swims ashore.
    const room = lifeSample.distance === Infinity ? 60 : Math.max(0, lifeSample.distance - SCHOOL_SHORE);
    if (room < 6) continue;
    life.schools.push({
      x: point.x,
      y: point.y,
      z: point.z,
      floor,
      swim,
      roam: Math.min(room, 10 + 22 * tileRandom(key, n, 14)),
      speed: 1.2 + 1.6 * tileRandom(key, n, 15),
      count: 10 + Math.floor(tileRandom(key, n, 16) * 16),
      tone: tileRandom(key, n, 17),
      seed: Math.floor(tileRandom(key, n, 18) * 1e6),
      zone: here,
    });
  }

  for (let n = 0; n < CRUISER_TRIES; n++) {
    if (tileRandom(key, n, 21) > 0.45) continue;
    tilePoint(key, 3 + tileRandom(key, n, 22) * (TILE_QUADS - 6), 3 + tileRandom(key, n, 23) * (TILE_QUADS - 6), point);
    coastAt(point.x, point.y, point.z, SEA_REACH, lifeSample);
    if (lifeSample.lake) continue;
    const floor = depthAtDistance(point.x, point.y, point.z, lifeSample.distance === Infinity ? SEA_REACH : lifeSample.distance);
    const here = seaZoneAt(latOf(point.y), false);
    const pick = tileRandom(key, n, 24);
    // Turtles graze the reef and the seagrass; rays lie on sand anywhere
    // warm enough; sharks patrol the reef's edge and the kelp.
    const kind: CruiserKind | null =
      here === 'reef' ? (pick < 0.4 ? 'turtle' : pick < 0.7 ? 'ray' : 'shark')
      : here === 'meadow' ? (pick < 0.5 ? 'ray' : pick < 0.75 ? 'turtle' : 'shark')
      : here === 'kelp' ? (pick < 0.6 ? 'shark' : 'ray')
      : null;
    if (kind === null) continue;
    if (floor < CRUISER_FLOOR || floor > 70) continue;
    if (!isSeaAt(point.x, point.y, point.z)) continue;
    const room = lifeSample.distance === Infinity ? 90 : Math.max(0, lifeSample.distance - CRUISER_SHORE);
    if (room < 10) continue;
    life.wet = true;
    life.cruisers.push({
      kind,
      x: point.x,
      y: point.y,
      z: point.z,
      floor,
      swim: kind === 'ray' ? Math.min(floor - 1, floor * 0.8) : floor * (0.3 + 0.35 * tileRandom(key, n, 25)),
      roam: Math.min(room, 20 + 30 * tileRandom(key, n, 26)),
      speed: kind === 'shark' ? 4 + 2 * tileRandom(key, n, 27) : kind === 'ray' ? 2.2 : 1.6,
      seed: Math.floor(tileRandom(key, n, 28) * 1e6),
    });
  }

  if (!life.wet) life.wet = isSeaAt(middle.x, middle.y, middle.z);
}

/** The shallowest water a school lives over, and how far from the shore it keeps. */
export const SCHOOL_FLOOR = 3;
export const SCHOOL_SHORE = 14;
/** The same for the big swimmers. */
export const CRUISER_FLOOR = 5;
export const CRUISER_SHORE = 24;

// ---------------------------------------------------------------------------
// Where they are at an instant
// ---------------------------------------------------------------------------

/**
 * Where a swimmer is on its round at `t` seconds, as an east/north offset in
 * units from its home and a depth: a lazy figure of two circles at speeds
 * that do not divide, radius `roam`, so it wanders its whole home water and
 * never runs a visible loop. Pure, so every client puts a fish in the same
 * place at the same second.
 */
export function roundAt(seed: number, roam: number, speed: number, t: number, out: { e: number; n: number; lift: number }): typeof out {
  const phase = (seed % 1000) / 1000 * Math.PI * 2;
  const rate = speed / Math.max(4, roam);
  const a = t * rate + phase;
  const b = t * rate * 0.37 + phase * 1.7;
  out.e = roam * (0.72 * Math.cos(a) + 0.28 * Math.cos(b * 2.3));
  out.n = roam * (0.72 * Math.sin(a) + 0.28 * Math.sin(b * 1.9 + 0.4));
  out.lift = Math.sin(t * rate * 1.3 + phase * 2.1);
  return out;
}

/**
 * The dolphins and the whales: rarer, wider-ranging, and not tied to a tile.
 * A coarse cell of the sphere and a slot of time decide whether a pod passes
 * through, and where; a pure function of both, so everybody sees the same pod.
 */
export interface Pod {
  kind: 'dolphin' | 'whale';
  /** Where the pass starts and its heading, as a unit direction and a unit tangent. */
  x: number;
  y: number;
  z: number;
  hx: number;
  hy: number;
  hz: number;
  /** When it starts, seconds on the clock handed in, and how long it lasts. */
  from: number;
  length: number;
  speed: number;
  count: number;
  seed: number;
}

/** A dolphins' cell, units, and how long a slot of theirs lasts, seconds; the same for the whales. */
export const DOLPHIN_CELL = 700;
export const DOLPHIN_SLOT = 70;
export const DOLPHIN_CHANCE = 0.35;
export const WHALE_CELL = 2400;
export const WHALE_SLOT = 200;
export const WHALE_CHANCE = 0.3;
/** The shallowest water either will pass through along the whole of its path. */
export const DOLPHIN_FLOOR = 8;
export const WHALE_FLOOR = 45;

const podPoint = new THREE.Vector3();
const podNorth = new THREE.Vector3();
const podEast = new THREE.Vector3();
const podHeading = new THREE.Vector3();
/** The pods worked out, by kind and cell, each with the slot it was worked out for. */
const podCache = { dolphin: new Map<number, { slot: number; pod: Pod | null }>(), whale: new Map<number, { slot: number; pod: Pod | null }>() };

/**
 * The pod in one cell and slot, or null. The cell is a latitude band and a
 * longitude step sized to it, so cells are about `cell` units square
 * everywhere short of the poles. Remembered per cell for its slot, so asking
 * every frame costs a lookup.
 */
export function podIn(kind: 'dolphin' | 'whale', row: number, col: number, slot: number): Pod | null {
  const cache = podCache[kind];
  const key = (row + 16) * 65536 + col;
  const known = cache.get(key);
  if (known !== undefined && known.slot === slot) return known.pod;
  const pod = findPod(kind, row, col, slot);
  if (known !== undefined) {
    known.slot = slot;
    known.pod = pod;
  } else {
    cache.set(key, { slot, pod });
    if (cache.size > 400) cache.delete(cache.keys().next().value!);
  }
  return pod;
}

function findPod(kind: 'dolphin' | 'whale', row: number, col: number, slot: number): Pod | null {
  const cell = kind === 'dolphin' ? DOLPHIN_CELL : WHALE_CELL;
  const slotLength = kind === 'dolphin' ? DOLPHIN_SLOT : WHALE_SLOT;
  const chance = kind === 'dolphin' ? DOLPHIN_CHANCE : WHALE_CHANCE;
  const salt = kind === 'dolphin' ? 71 : 73;
  let pod: Pod | null = null;
  if (hash3(row * 7919 + col, slot, salt) < chance) {
    const degrees = cell / UNITS_PER_DEGREE;
    const lat = 90 - (row + hash3(row, col, salt + 1)) * degrees;
    const band = Math.max(1, Math.floor((360 * Math.cos(clamp(90 - (row + 0.5) * degrees, -89, 89) * DEG)) / degrees));
    const lon = -180 + ((col % band) + hash3(row, col, salt + 2)) * (360 / band);
    onSphere(lon, clamp(lat, -89.5, 89.5), podPoint);
    podNorth.set(0, 1, 0).projectOnPlane(podPoint).normalize();
    podEast.crossVectors(podNorth, podPoint).normalize();
    const bearing = hash3(row, slot, salt + 3) * Math.PI * 2;
    podHeading.copy(podNorth).multiplyScalar(Math.cos(bearing)).addScaledVector(podEast, Math.sin(bearing));
    const speed = kind === 'dolphin' ? 11 + 4 * hash3(col, slot, salt + 4) : 4 + 2 * hash3(col, slot, salt + 4);
    const length = slotLength * 0.8;
    // The whole pass has to be over water deep enough: the start, the end and
    // the points between, a fifth of the way each.
    const floor = kind === 'dolphin' ? DOLPHIN_FLOOR : WHALE_FLOOR;
    let ok = true;
    const travel = (speed * length) / PLANET_RADIUS;
    const axis = new THREE.Vector3().crossVectors(podPoint, podHeading).normalize();
    const probe = new THREE.Vector3();
    for (let k = 0; k <= 5 && ok; k++) {
      probe.copy(podPoint).applyAxisAngle(axis, (travel * k) / 5);
      if (!isSeaAt(probe.x, probe.y, probe.z)) ok = false;
      else if (seaDepthAt(probe) < floor) ok = false;
      else if (kind === 'dolphin' && coastAt(probe.x, probe.y, probe.z, SEA_REACH, lifeSample).lake) ok = false;
    }
    if (ok && kind === 'dolphin' && seaZoneAt(latOf(podPoint.y), false) === 'barren') ok = false;
    if (ok) {
      pod = {
        kind,
        x: podPoint.x,
        y: podPoint.y,
        z: podPoint.z,
        hx: podHeading.x,
        hy: podHeading.y,
        hz: podHeading.z,
        from: slot * slotLength + hash3(row, col, slot) * (slotLength - length),
        length,
        speed,
        count: kind === 'dolphin' ? 3 + Math.floor(hash3(row, slot, salt + 5) * 4) : 1,
        seed: Math.floor(hash3(col, row, slot) * 1e6),
      };
    }
  }
  return pod;
}

/** The cell a direction is in, for a kind of pod: its row and column. */
export function podCellOf(kind: 'dolphin' | 'whale', x: number, y: number, z: number): { row: number; col: number } {
  const cell = kind === 'dolphin' ? DOLPHIN_CELL : WHALE_CELL;
  const degrees = cell / UNITS_PER_DEGREE;
  const lat = latOf(y);
  const lon = lonOf(x, z);
  const row = Math.floor((90 - lat) / degrees);
  const band = Math.max(1, Math.floor((360 * Math.cos(clamp(90 - (row + 0.5) * degrees, -89, 89) * DEG)) / degrees));
  const col = Math.floor(((lon + 180) / 360) * band);
  return { row, col };
}

/** The life cache's size, for the console. */
export const tileMemory = (): number => tiles.size;

/** Forgets every tile's life and every pod, so the next ask works it out again: for the check. */
export function forgetTiles(): void {
  tiles.clear();
  podCache.dolphin.clear();
  podCache.whale.clear();
}
