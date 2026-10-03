/**
 * The political map of every walked world but Earth: its nations as outlines,
 * its towns as places, and the `World` that answers `countryAt` over them.
 *
 * **Earth's map is real cartography and every other world's is a cap.** A
 * `Nation` is a centre and an angular radius (`contract.ts`), which is enough
 * to say whose ground a point is and nothing like enough to draw: caps overlap,
 * leave the ground between them nobody's, and a frontier drawn as a circle is
 * a pin with a ring round it. What the shared map, minimap, HUD and menu need
 * is what Earth hands them — `Country` rings and `Place` rows, read by
 * `geo.ts`'s own smallest-ring `countryAt` — so this file turns the caps into
 * exactly that, and nothing downstream has to know which world it is on.
 *
 * ## The truth
 *
 * `truthAt` is the one definition of whose ground a point is, and the rings
 * are drawn from it. Every nation's cap centre and every one of its towns is a
 * **seed** labelled with that nation and weighted by the cap's radius, and a
 * point belongs to the seed nearest it **in angle divided by weight** — a
 * multiplicatively weighted Voronoi diagram on the sphere. Three properties
 * make it the right one:
 *
 * - **It tiles the sphere.** There is no nobody's ground and no sea between
 *   the caps: the answer is never 0, which is what a world without water owes
 *   the HUD, the passport and the chat.
 * - **A seed always wins at itself** — its score there is 0 — so a town is
 *   always in the nation it declares and a small cap inside a big one is an
 *   enclave, which is the resolution `nationAt` makes and the one `countryAt`
 *   makes for Lesotho. A power diagram (`d² - w²`) was the first design and
 *   it fails exactly here: the Far Side's 55-degree weight outbids Mare
 *   Moscoviense at Moscoviense's own centre.
 * - **A nation's size follows its cap**, because the frontier between two
 *   seeds falls where their distances are in the ratio of their radii.
 *
 * Straight weighted bisectors read as a diagram rather than a map, so the
 * point is **domain-warped** before it is judged: moved by `WARP` radians of
 * `noise.ts`'s fbm, which bends every frontier into something a surveyor might
 * have walked. Near a seed the warp fades out (`WARP_CLEAR`), so a town is
 * never warped out of its own country.
 *
 * ## The outlines
 *
 * The truth is sampled on a half-degree lattice, and the boundary between
 * cells of different label is chained into **polylines between junctions**.
 * Each shared polyline is smoothed once — the staircase's corners cut to the
 * midpoints of its steps, Douglas–Peucker at `SIMPLIFY`, two rounds of
 * Chaikin — and both neighbours take the same array, one of them reversed, so
 * two countries' frontiers meet exactly and no gap or overlap opens between
 * them. Rings are wound with **the land on the right**, `geo.ts`'s own
 * convention, so a ring is clockwise in lon/lat.
 *
 * Every ring is kept inside one **tile** — a quarter of the longitudes and one
 * hemisphere — so none spans more than 90 degrees either way, none crosses
 * the antimeridian, and a polar nation closes along the pole the way
 * Antarctica's ring does. And there are **no holes**: `geo.ts` keeps only
 * outer rings and resolves an enclave by the smaller ring, which a computed
 * map could honour only by drawing the surrounding nation's ring over its
 * enclave, and then a frontier would lie in one ring rather than two. So a
 * tile that would hold a hole is cut by one more meridian through the hole
 * until none is left. The cuts are straight lattice lines between two pieces
 * of one nation; `frontiers` lists only the polylines between two nations,
 * and that is what a map draws as a border.
 *
 * Pure and deterministic, and memoised: the first call for a body costs a
 * fraction of a second and every later one is a lookup.
 */

import { Color, Quaternion, SRGBColorSpace, Vector3 } from 'three';
import type { Country, World } from '../geo.ts';
import { worldFromCountries } from '../geo.ts';
import type { Place } from '../places.ts';
import { PROMINENCE_CAP } from '../places.ts';
import { latLonOf, lonOf, toUnit, unitAt } from '../sphere.ts';
import type { Body, Nation } from './contract.ts';
import { angularDistance, eclipticToWorld, poleOf, surfaceRadiusOf, townRadii } from './contract.ts';
import { fbm } from './noise.ts';
import { heliocentric, moonMeanLongitude, periodOf } from './orbits.ts';
import { MERCURY } from './bodies/mercury.ts';
import { VENUS } from './bodies/venus.ts';
import { MOON } from './bodies/moon.ts';
import { MARS } from './bodies/mars.ts';
import { JUPITER } from './bodies/jupiter.ts';
import { SATURN } from './bodies/saturn.ts';
import { URANUS } from './bodies/uranus.ts';
import { NEPTUNE } from './bodies/neptune.ts';

const DEG = Math.PI / 180;

/**
 * Every world that can be walked besides Earth, in the order the passport's
 * chapters and any list of them run: out from the Sun, the Moon after Venus
 * because its orbit is Earth's. `worlds/registry.ts` has one row for each.
 */
export const WALKABLE: readonly Body[] = [MERCURY, VENUS, MOON, MARS, JUPITER, SATURN, URANUS, NEPTUNE];

/** A walkable body by id, or undefined for Earth, the Sun and anything else. */
export const walkableBody = (id: string): Body | undefined => WALKABLE.find((one) => one.id === id);

/* ------------------------------------------------------------------------- *
 * The shapes handed out
 * ------------------------------------------------------------------------- */

/** One frontier: the smoothed line two nations share, as `[lon, lat]` points. */
export interface Frontier {
  points: number[][];
  /** The two nations either side, 1-based indices into `Geography.countries`. */
  left: number;
  right: number;
}

/**
 * A world's political map in Earth's own shapes.
 *
 * `countries[i]` is `body.nations[i]` — same order, so a 1-based `countryAt`
 * answer of `k` is nation `k - 1` — with `iso` the nation's key
 * (`keyOf(id)`, `'mars:tharsis'`), `continent` the body's name, the cap's
 * centre as its label point (its biggest town's where an enclave stands on
 * the centre) and `color` the nation's own. `places[i]` is
 * `body.settlements[i]`, with `iso` its nation's key, the biggest town of each
 * nation its capital and the town law's radius.
 */
export interface Geography {
  body: Body;
  countries: Country[];
  places: Place[];
  /** `geo.ts`'s index over `countries`, never answering 0: every point is someone's. */
  world: World;
  /** The lines between two nations, each once; what a map draws as a border. */
  frontiers: Frontier[];
  /** The nation's key: `'<body>:<nation>'`, which the flags, the stamps and the chat carry. */
  keyOf(nationId: string): string;
  /** The nation a key names, or undefined. */
  nationOf(iso: string): Nation | undefined;
  /**
   * The truth the rings were drawn from, as a 1-based index into `countries`.
   * Within about half a degree of a frontier it and `world.countryAt` may
   * differ; everywhere else they agree, and `scripts/check-system.ts` holds
   * them to it.
   */
  truthAt(lat: number, lon: number): number;
}

/**
 * One chapter of the passport: a world and every nation in it, stamped or not.
 *
 * Declared here for the worlds' side and by the same shape in `planet.ts` for
 * the book's, which cannot import this file without pulling the system into
 * Earth's first load; the two must stay structurally identical. `script`
 * writes a nation's name in the species' own glyphs and is supplied by the
 * walking engine once it has loaded, never by this file.
 */
export interface PassportChapter {
  /** The body's id: `'mars'`. */
  body: string;
  /** What the chapter is called: `'Mars'`. */
  name: string;
  /** The body's colour on its tab and its visa: its ground's `look.surface`. */
  color?: number;
  nations: { iso: string; name: string; color: number }[];
  script?: (text: string) => SVGElement;
}

/** Every walked world's chapter, in `WALKABLE`'s order. Cheap: no outline is computed. */
export function chaptersOf(): PassportChapter[] {
  return WALKABLE.map((body) => ({
    body: body.id,
    name: body.name,
    color: body.look.surface,
    nations: body.nations.map((nation) => ({ iso: keyFor(body.id, nation.id), name: nation.name, color: nation.color })),
  }));
}

const keyFor = (bodyId: string, nationId: string): string => `${bodyId}:${nationId}`;

/* ------------------------------------------------------------------------- *
 * The truth
 * ------------------------------------------------------------------------- */

/**
 * How far the warp moves a point, in radians of fbm's output: about 0.07 of
 * typical displacement, four degrees, which bends a frontier without moving a
 * nation. At 0.12 (two degrees) the frontiers between seeds laid out near a
 * grid came out as near-great circles — Arabia Terra's with Syrtis Major ran
 * within three and a half degrees of the 40th meridian for thirty-two degrees
 * of latitude — and on the menu's globe they read as the lattice cuts a map
 * must never draw. At 0.3 they were wavy and every third nation threw off an
 * island into its neighbour.
 */
const WARP = 0.22;
/** The warp's frequency over the unit sphere: bends a dozen degrees long. */
const WARP_FREQUENCY = 3.2;
/**
 * Within this angle of a seed, degrees, there is no warp, and over the next
 * band it fades in — so a town is judged where it stands and is never bent
 * into a neighbour's country.
 */
const WARP_CLEAR = 1.2;
const WARP_FULL = 4;
/** How much of an enclave's own radius is its, whatever its neighbours weigh. */
const CORE = 0.6;

/** The seeds of one body, flat for the inner loop. */
interface Seeds {
  x: Float64Array;
  y: Float64Array;
  z: Float64Array;
  /** 1 / weight, the weight in radians. */
  inverse: Float64Array;
  /** 0-based nation index. */
  nation: Int32Array;
  /** Per-body offsets into the noise, so no two worlds share a frontier. */
  offset: [number, number, number];
  /** The enclaves' cores, smallest first: centre, cosine of the core's radius, nation. */
  cores: { x: number; y: number; z: number; cos: number; nation: number }[];
}

/**
 * The seeds the map is grown from: the nations' caps and the towns the
 * body's file names, and of the grown towns (`towns.ts`) only those the map
 * would otherwise hand to a neighbour — the few on a frontier. Every grown
 * town as a seed was ten times the seeds and ten times the map's cost, for a
 * map that came out the same.
 */
function seedsOf(body: Body): Seeds {
  const index = new Map(body.nations.map((nation, i) => [nation.id, i]));
  const rows: { lat: number; lon: number; radius: number; nation: number }[] = [];
  body.nations.forEach((nation, i) => rows.push({ lat: nation.lat, lon: nation.lon, radius: nation.radius, nation: i }));
  for (const place of body.settlements) {
    const i = index.get(place.nation);
    if (i === undefined || place.grown === true) continue;
    rows.push({ lat: place.lat, lon: place.lon, radius: body.nations[i]!.radius, nation: i });
  }
  // To a fixed point: a seed added moves its neighbours' frontiers too.
  const unit: number[] = [0, 0, 0];
  const added = new Set<string>();
  let seeds = seedsFrom(body, rows);
  for (let round = 0; round < 6; round++) {
    let more = false;
    for (const place of body.settlements) {
      const i = index.get(place.nation);
      if (i === undefined || place.grown !== true || added.has(place.id)) continue;
      toUnit(place.lat, place.lon, unit);
      if (judge(seeds, unit[0]!, unit[1]!, unit[2]!) === i) continue;
      rows.push({ lat: place.lat, lon: place.lon, radius: body.nations[i]!.radius, nation: i });
      added.add(place.id);
      more = true;
    }
    if (!more) break;
    seeds = seedsFrom(body, rows);
  }
  return seeds;
}

function seedsFrom(body: Body, rows: readonly { lat: number; lon: number; radius: number; nation: number }[]): Seeds {
  const n = rows.length;
  const seeds: Seeds = {
    x: new Float64Array(n),
    y: new Float64Array(n),
    z: new Float64Array(n),
    inverse: new Float64Array(n),
    nation: new Int32Array(n),
    offset: [0, 0, 0],
    cores: [],
  };
  const unit: number[] = [0, 0, 0];
  rows.forEach((row, k) => {
    toUnit(row.lat, row.lon, unit);
    seeds.x[k] = unit[0]!;
    seeds.y[k] = unit[1]!;
    seeds.z[k] = unit[2]!;
    seeds.inverse[k] = 1 / (row.radius * DEG);
    seeds.nation[k] = row.nation;
  });
  // An enclave — a cap whose centre is inside a bigger one — keeps a core.
  // Weighted by angle alone, two caps that share a centre leave the smaller
  // nothing: Saturn's Rose sits on the pole inside the Hexagon, and the
  // Hexagon's sixteen degrees outbid its three everywhere but at the Rose's
  // one town. Inside `CORE` of its own radius an enclave wins outright, the
  // smallest first, which is `nationAt`'s smallest-cap rule where it matters.
  body.nations.forEach((nation, i) => {
    const inside = body.nations.some((other) =>
      other.radius > nation.radius && angularDistance(nation.lat, nation.lon, other.lat, other.lon) < other.radius);
    if (!inside) return;
    toUnit(nation.lat, nation.lon, unit);
    seeds.cores.push({ x: unit[0]!, y: unit[1]!, z: unit[2]!, cos: Math.cos(CORE * nation.radius * DEG), nation: i });
  });
  seeds.cores.sort((a, b) => b.cos - a.cos);
  // A hash of the id, spread over the noise's lattice.
  let h = 0x811c9dc5;
  for (let i = 0; i < body.id.length; i++) h = Math.imul(h ^ body.id.charCodeAt(i), 0x01000193);
  seeds.offset = [((h >>> 0) % 997) + 11.3, ((h >>> 10) % 991) + 37.7, ((h >>> 20) % 983) + 71.1];
  return seeds;
}

const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Whose ground the unit vector `(px, py, pz)` is: a 0-based nation index. */
function judge(seeds: Seeds, px: number, py: number, pz: number): number {
  const { x, y, z, inverse, nation, offset } = seeds;
  const n = x.length;
  // The nearest seed by plain angle decides how much warp there is.
  let nearest = -1;
  for (let k = 0; k < n; k++) {
    const d = px * x[k]! + py * y[k]! + pz * z[k]!;
    if (d > nearest) nearest = d;
  }
  const angle = Math.acos(Math.min(1, nearest)) / DEG;
  const fade = smoothstep(WARP_CLEAR, WARP_FULL, angle);
  let qx = px;
  let qy = py;
  let qz = pz;
  if (fade > 0) {
    const fx = px * WARP_FREQUENCY;
    const fy = py * WARP_FREQUENCY;
    const fz = pz * WARP_FREQUENCY;
    const gain = WARP * fade;
    qx += gain * fbm(fx + offset[0], fy, fz, 3);
    qy += gain * fbm(fx, fy + offset[1], fz, 3);
    qz += gain * fbm(fx, fy, fz + offset[2], 3);
    const length = Math.hypot(qx, qy, qz);
    qx /= length;
    qy /= length;
    qz /= length;
  }
  for (const core of seeds.cores) {
    if (qx * core.x + qy * core.y + qz * core.z > core.cos) return core.nation;
  }
  let best = Infinity;
  let answer = 0;
  for (let k = 0; k < n; k++) {
    const d = qx * x[k]! + qy * y[k]! + qz * z[k]!;
    const score = Math.acos(Math.max(-1, Math.min(1, d))) * inverse[k]!;
    if (score < best) {
      best = score;
      answer = nation[k]!;
    }
  }
  return answer;
}

/* ------------------------------------------------------------------------- *
 * The lattice
 * ------------------------------------------------------------------------- */

/** Degrees a lattice cell. */
const STEP = 0.5;
const NX = Math.round(360 / STEP);
const NY = Math.round(180 / STEP);
/** Cells a side of the coarse block the lattice is first judged in. */
const BLOCK = 4;
/** Douglas–Peucker's tolerance on a frontier, degrees. */
const SIMPLIFY = 0.15;
/** Rounds of Chaikin's corner cutting after it. */
const CHAIKIN = 2;

/**
 * Every cell's nation, judged where it has to be.
 *
 * Judging all 259,200 cells costs most of a second, and nearly all of them are
 * deep inside a nation. So the truth is first sampled at the corners of
 * two-degree blocks, and a block is filled whole when every corner within one
 * block of it agrees and no seed stands in it; the rest — the blocks a
 * frontier is near, and every block a seed is in, so no enclave smaller than
 * a block can fall between the corners — are judged cell by cell.
 */
function labelLattice(seeds: Seeds): Int16Array {
  const labels = new Int16Array(NX * NY);
  const BX = NX / BLOCK;
  const BY = NY / BLOCK;
  const corner = new Int16Array((BX + 1) * (BY + 1));
  const unit: number[] = [0, 0, 0];
  for (let b = 0; b <= BY; b++) {
    for (let a = 0; a <= BX; a++) {
      toUnit(-90 + b * BLOCK * STEP, -180 + a * BLOCK * STEP, unit);
      corner[b * (BX + 1) + a] = judge(seeds, unit[0]!, unit[1]!, unit[2]!);
    }
  }
  const seeded = new Uint8Array(BX * BY);
  for (let k = 0; k < seeds.x.length; k++) {
    const { lat, lon } = latLonOf({ x: seeds.x[k]!, y: seeds.y[k]!, z: seeds.z[k]! });
    const a = Math.min(BX - 1, Math.max(0, Math.floor((lon + 180) / (BLOCK * STEP))));
    const b = Math.min(BY - 1, Math.max(0, Math.floor((lat + 90) / (BLOCK * STEP))));
    seeded[b * BX + a] = 1;
  }
  for (let b = 0; b < BY; b++) {
    for (let a = 0; a < BX; a++) {
      let uniform = seeded[b * BX + a] === 0;
      const first = corner[b * (BX + 1) + a]!;
      for (let bb = Math.max(0, b - 1); uniform && bb <= Math.min(BY, b + 2); bb++) {
        for (let da = -1; da <= 2; da++) {
          // Longitude wraps; the corner at a = BX is the one at a = 0.
          const aa = (((a + da) % BX) + BX) % BX;
          if (corner[bb * (BX + 1) + aa] !== first) {
            uniform = false;
            break;
          }
        }
      }
      for (let j = b * BLOCK; j < (b + 1) * BLOCK; j++) {
        for (let i = a * BLOCK; i < (a + 1) * BLOCK; i++) {
          if (uniform) {
            labels[j * NX + i] = first;
          } else {
            toUnit(-90 + (j + 0.5) * STEP, -180 + (i + 0.5) * STEP, unit);
            labels[j * NX + i] = judge(seeds, unit[0]!, unit[1]!, unit[2]!);
          }
        }
      }
    }
  }
  return labels;
}

/* ------------------------------------------------------------------------- *
 * From cells to rings
 * ------------------------------------------------------------------------- */

const VX = NX + 1;
/** A lattice vertex: column `i` of `0..NX`, row `j` of `0..NY`. */
const vertex = (i: number, j: number): number => j * VX + i;
const lonAt = (v: number): number => -180 + (v % VX) * STEP;
const latAt = (v: number): number => -90 + Math.floor(v / VX) * STEP;

/** Undirected lattice edges: horizontal ones first, then vertical. */
const H_EDGES = NX * (NY + 1);
const hEdge = (i: number, j: number): number => j * NX + i;
const vEdge = (i: number, j: number): number => H_EDGES + j * VX + i;


interface Directed {
  /** From and to vertices. */
  from: Int32Array;
  to: Int32Array;
  /** East 0, north 1, west 2, south 3; a right turn is `(d + 3) % 4`. */
  dir: Int8Array;
  /** The undirected edge it runs along, and whether it runs that edge's way. */
  edge: Int32Array;
  region: Int32Array;
  count: number;
}

/**
 * The region of every cell: its nation, its hemisphere and which strip of
 * longitude it falls in between the hemisphere's cuts. Two cells of one
 * nation in different regions are different rings.
 */
function regionsOf(labels: Int16Array, cuts: readonly number[][]): Int32Array {
  const region = new Int32Array(NX * NY);
  const stripOf = cuts.map((list) => {
    const strip = new Int32Array(NX);
    let s = 0;
    let c = 0;
    const sorted = [...list].sort((p, q) => p - q);
    for (let i = 0; i < NX; i++) {
      while (c < sorted.length && sorted[c]! <= i) {
        if (sorted[c]! > 0) s++;
        c++;
      }
      strip[i] = s;
    }
    return strip;
  });
  for (let j = 0; j < NY; j++) {
    const h = j < NY / 2 ? 0 : 1;
    const strip = stripOf[h]!;
    for (let i = 0; i < NX; i++) region[j * NX + i] = (labels[j * NX + i]! * 2 + h) * NX + strip[i]!;
  }
  return region;
}

/** Every directed edge with a region on its right and something else on its left. */
function directedEdges(region: Int32Array): Directed {
  const capacity = 2 * (H_EDGES + VX * NY);
  const out: Directed = {
    from: new Int32Array(capacity),
    to: new Int32Array(capacity),
    dir: new Int8Array(capacity),
    edge: new Int32Array(capacity),
    region: new Int32Array(capacity),
    count: 0,
  };
  const push = (from: number, to: number, dir: number, edge: number, r: number): void => {
    const k = out.count++;
    out.from[k] = from;
    out.to[k] = to;
    out.dir[k] = dir;
    out.edge[k] = edge;
    out.region[k] = r;
  };
  for (let j = 0; j < NY; j++) {
    for (let i = 0; i < NX; i++) {
      const r = region[j * NX + i]!;
      // Clockwise round the cell, so the cell is on the right of each edge.
      if (j + 1 === NY || region[(j + 1) * NX + i] !== r) push(vertex(i, j + 1), vertex(i + 1, j + 1), 0, hEdge(i, j + 1), r);
      if (i + 1 === NX || region[j * NX + i + 1] !== r) push(vertex(i + 1, j + 1), vertex(i + 1, j), 3, vEdge(i + 1, j), r);
      if (j === 0 || region[(j - 1) * NX + i] !== r) push(vertex(i + 1, j), vertex(i, j), 2, hEdge(i, j), r);
      if (i === 0 || region[j * NX + i - 1] !== r) push(vertex(i, j), vertex(i, j + 1), 1, vEdge(i, j), r);
    }
  }
  return out;
}

/**
 * The directed edges chained into closed loops, region by region.
 *
 * At a vertex where a region touches itself only corner to corner, there are
 * two ways on, and the walk takes the sharper right turn: with the region on
 * the right, that keeps the two cells' rings apart rather than pinching them
 * into one ring that crosses itself.
 */
function loopsOf(edges: Directed): number[][] {
  const outStart = new Int32Array(VX * (NY + 1) + 1);
  for (let k = 0; k < edges.count; k++) outStart[edges.from[k]! + 1]!++;
  for (let v = 0; v < VX * (NY + 1); v++) outStart[v + 1]! += outStart[v]!;
  const outList = new Int32Array(edges.count);
  const cursor = outStart.slice(0, VX * (NY + 1));
  for (let k = 0; k < edges.count; k++) outList[cursor[edges.from[k]!]!++] = k;

  const used = new Uint8Array(edges.count);
  const loops: number[][] = [];
  for (let start = 0; start < edges.count; start++) {
    if (used[start]) continue;
    const loop: number[] = [];
    let k = start;
    while (!used[k]) {
      used[k] = 1;
      loop.push(k);
      const v = edges.to[k]!;
      const r = edges.region[k]!;
      const d = edges.dir[k]!;
      let next = -1;
      let rank = 9;
      for (let s = outStart[v]!; s < outStart[v + 1]!; s++) {
        const e = outList[s]!;
        if (edges.region[e] !== r) continue;
        const turn = (edges.dir[e]! - d + 4) % 4;
        // Right (3) before straight (0) before left (1).
        const order = turn === 3 ? 0 : turn === 0 ? 1 : 2;
        if (order < rank) {
          rank = order;
          next = e;
        }
      }
      if (next < 0) throw new Error(`geography: a ring broke open at vertex ${v}`);
      k = next;
    }
    loops.push(loop);
  }
  return loops;
}

/** Twice the signed area of a loop in lon/lat: negative is clockwise, an outer ring. */
function loopArea(edges: Directed, loop: readonly number[]): number {
  let sum = 0;
  for (const k of loop) {
    const a = edges.from[k]!;
    const b = edges.to[k]!;
    sum += lonAt(a) * latAt(b) - lonAt(b) * latAt(a);
  }
  return sum;
}

/** Perpendicular distance of `p` from the segment `a`-`b`, degrees of lon/lat. */
function offSegment(p: number[], a: number[], b: number[]): number {
  const dx = b[0]! - a[0]!;
  const dy = b[1]! - a[1]!;
  const length2 = dx * dx + dy * dy;
  if (length2 === 0) return Math.hypot(p[0]! - a[0]!, p[1]! - a[1]!);
  const t = Math.max(0, Math.min(1, ((p[0]! - a[0]!) * dx + (p[1]! - a[1]!) * dy) / length2));
  return Math.hypot(p[0]! - a[0]! - t * dx, p[1]! - a[1]! - t * dy);
}

/** Douglas–Peucker over an open line, its two ends kept. */
function simplify(points: number[][], tolerance: number): number[][] {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [a, b] = stack.pop()!;
    let worst = -1;
    let at = -1;
    for (let i = a + 1; i < b; i++) {
      const d = offSegment(points[i]!, points[a]!, points[b]!);
      if (d > worst) {
        worst = d;
        at = i;
      }
    }
    if (at >= 0 && worst > tolerance) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  return points.filter((_, i) => keep[i] === 1);
}

/** Chaikin's corner cutting; an open line keeps its two ends, a closed one has none. */
function chaikin(points: number[][], closed: boolean): number[][] {
  const n = points.length;
  if (n < 3) return points;
  const out: number[][] = closed ? [] : [points[0]!];
  const segments = closed ? n : n - 1;
  for (let s = 0; s < segments; s++) {
    const a = points[s]!;
    const b = points[(s + 1) % n]!;
    out.push([0.75 * a[0]! + 0.25 * b[0]!, 0.75 * a[1]! + 0.25 * b[1]!]);
    out.push([0.25 * a[0]! + 0.75 * b[0]!, 0.25 * a[1]! + 0.75 * b[1]!]);
  }
  if (!closed) {
    // The first and last cuts sit a quarter of the way along the end
    // segments; the ends themselves are junctions and must not move.
    out.splice(1, 1);
    out.splice(out.length - 1, 1);
    out.push(points[n - 1]!);
  }
  return out;
}

/** A staircase's corners cut: its steps' midpoints, between its two ends. */
function midpoints(vertices: readonly number[], closed: boolean): number[][] {
  const out: number[][] = [];
  if (!closed) out.push([lonAt(vertices[0]!), latAt(vertices[0]!)]);
  const n = vertices.length;
  const segments = closed ? n : n - 1;
  for (let s = 0; s < segments; s++) {
    const a = vertices[s]!;
    const b = vertices[(s + 1) % n]!;
    out.push([(lonAt(a) + lonAt(b)) / 2, (latAt(a) + latAt(b)) / 2]);
  }
  if (!closed) out.push([lonAt(vertices[n - 1]!), latAt(vertices[n - 1]!)]);
  return out;
}

/** A straight run's corners only: the points where it turns. */
function corners(vertices: readonly number[], closed: boolean): number[][] {
  const n = vertices.length;
  const out: number[][] = [];
  for (let s = 0; s < n; s++) {
    const v = vertices[s]!;
    if ((s === 0 || s === n - 1) && !closed) {
      out.push([lonAt(v), latAt(v)]);
      continue;
    }
    const before = vertices[(s - 1 + n) % n]!;
    const after = vertices[(s + 1) % n]!;
    const turns = (lonAt(v) - lonAt(before)) * (latAt(after) - latAt(v)) - (latAt(v) - latAt(before)) * (lonAt(after) - lonAt(v));
    if (turns !== 0) out.push([lonAt(v), latAt(v)]);
  }
  return out;
}

/** A closed line's smoothing, split at two far points so Douglas–Peucker has ends to hold. */
function smoothClosed(points: number[][]): number[][] {
  let far = 0;
  let worst = -1;
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(points[i]![0]! - points[0]![0]!, points[i]![1]! - points[0]![1]!);
    if (d > worst) {
      worst = d;
      far = i;
    }
  }
  const one = simplify(points.slice(0, far + 1), SIMPLIFY);
  const two = simplify([...points.slice(far), points[0]!], SIMPLIFY);
  let line = [...one, ...two.slice(1, -1)];
  for (let round = 0; round < CHAIKIN; round++) line = chaikin(line, true);
  return line;
}

interface Polyline {
  /** Lattice vertices, first to last; a closed one does not repeat its first. */
  vertices: number[];
  closed: boolean;
  /** Nations either side (0-based, -1 outside), when this is a frontier. */
  frontier: [number, number] | null;
  points: number[][];
}

interface Outlines {
  rings: number[][][][];
  frontiers: Frontier[];
}

/**
 * The rings of every nation from a labelled lattice, cutting tiles until none
 * holds a hole.
 */
function outlinesOf(labels: Int16Array, nations: number): Outlines {
  const cuts: number[][] = [
    [NX / 4, NX / 2, (3 * NX) / 4],
    [NX / 4, NX / 2, (3 * NX) / 4],
  ];
  let region = regionsOf(labels, cuts);
  let edges = directedEdges(region);
  let loops = loopsOf(edges);
  for (let pass = 0; pass < 64; pass++) {
    let holes = 0;
    for (const loop of loops) {
      if (loopArea(edges, loop) <= 0) continue;
      // A hole. The cell on the left of its first edge is inside it, and a
      // meridian along that cell's west side splits the tile through the
      // hole, so neither half holds it.
      const k = loop[0]!;
      const from = edges.from[k]!;
      const d = edges.dir[k]!;
      // Left of a directed edge is a quarter turn anticlockwise from its heading.
      const li = (from % VX) + (d === 0 ? 0 : d === 1 ? -1 : d === 2 ? -1 : 0);
      const lj = Math.floor(from / VX) + (d === 0 ? 0 : d === 1 ? 0 : d === 2 ? -1 : -1);
      const ci = Math.min(NX - 1, Math.max(0, li));
      const cj = Math.min(NY - 1, Math.max(0, lj));
      const h = cj < NY / 2 ? 0 : 1;
      const column = ci === 0 ? 1 : ci;
      if (!cuts[h]!.includes(column)) {
        cuts[h]!.push(column);
        holes++;
      }
    }
    if (holes === 0) break;
    region = regionsOf(labels, cuts);
    edges = directedEdges(region);
    loops = loopsOf(edges);
  }

  // The undirected boundary, and the vertices where three or more edges of it
  // meet: the junctions every polyline runs between.
  const isBoundary = new Uint8Array(H_EDGES + VX * NY);
  for (let k = 0; k < edges.count; k++) isBoundary[edges.edge[k]!] = 1;
  const degree = new Uint8Array(VX * (NY + 1));
  const incident = (v: number): number[] => {
    const i = v % VX;
    const j = Math.floor(v / VX);
    const list: number[] = [];
    if (i > 0 && isBoundary[hEdge(i - 1, j)]) list.push(hEdge(i - 1, j));
    if (i < NX && isBoundary[hEdge(i, j)]) list.push(hEdge(i, j));
    if (j > 0 && isBoundary[vEdge(i, j - 1)]) list.push(vEdge(i, j - 1));
    if (j < NY && isBoundary[vEdge(i, j)]) list.push(vEdge(i, j));
    return list;
  };
  const endsOf = (e: number): [number, number] => {
    if (e < H_EDGES) {
      const i = e % NX;
      const j = Math.floor(e / NX);
      return [vertex(i, j), vertex(i + 1, j)];
    }
    const f = e - H_EDGES;
    const i = f % VX;
    const j = Math.floor(f / VX);
    return [vertex(i, j), vertex(i, j + 1)];
  };
  for (let e = 0; e < isBoundary.length; e++) {
    if (!isBoundary[e]) continue;
    const [a, b] = endsOf(e);
    degree[a]!++;
    degree[b]!++;
  }
  /** The nations either side of an undirected edge, -1 outside the lattice. */
  const sidesOf = (e: number): [number, number] => {
    if (e < H_EDGES) {
      const i = e % NX;
      const j = Math.floor(e / NX);
      return [j > 0 ? labels[(j - 1) * NX + i]! : -1, j < NY ? labels[j * NX + i]! : -1];
    }
    const f = e - H_EDGES;
    const i = f % VX;
    const j = Math.floor(f / VX);
    return [i > 0 ? labels[j * NX + i - 1]! : -1, i < NX ? labels[j * NX + i]! : -1];
  };

  // Polylines, each undirected boundary edge in exactly one.
  const polyOf = new Int32Array(isBoundary.length).fill(-1);
  const indexIn = new Int32Array(isBoundary.length);
  const polylines: Polyline[] = [];
  const trace = (start: number, first: number): void => {
    const id = polylines.length;
    const vertices = [start];
    let v = start;
    let e = first;
    let closed = false;
    for (;;) {
      polyOf[e] = id;
      indexIn[e] = vertices.length - 1;
      const [a, b] = endsOf(e);
      v = a === v ? b : a;
      // Back where it began with no junction on the way: a loop, an enclave's
      // whole frontier, which does not repeat its first vertex.
      if (v === start && degree[v] === 2) {
        closed = true;
        break;
      }
      vertices.push(v);
      if (degree[v] !== 2) break;
      e = incident(v).find((f) => f !== e)!;
    }
    const [s0, s1] = sidesOf(first);
    const frontier = s0 >= 0 && s1 >= 0 && s0 !== s1 ? ([s0, s1] as [number, number]) : null;
    polylines.push({ vertices, closed, frontier, points: [] });
  };
  for (let v = 0; v < degree.length; v++) {
    if (degree[v] === 0 || degree[v] === 2) continue;
    for (const e of incident(v)) if (polyOf[e]! < 0) trace(v, e);
  }
  for (let e = 0; e < isBoundary.length; e++) {
    if (!isBoundary[e] || polyOf[e]! >= 0) continue;
    trace(endsOf(e)[0], e);
  }
  for (const line of polylines) {
    if (line.frontier === null) {
      line.points = corners(line.vertices, line.closed);
    } else if (line.closed) {
      line.points = smoothClosed(midpoints(line.vertices, true));
    } else {
      let points = simplify(midpoints(line.vertices, false), SIMPLIFY);
      for (let round = 0; round < CHAIKIN; round++) points = chaikin(points, false);
      line.points = points;
    }
  }

  // Each loop as points: the polylines it runs along, forwards or back.
  const rings: number[][][][] = Array.from({ length: nations }, () => []);
  for (const loop of loops) {
    const n = loop.length;
    let at = -1;
    for (let s = 0; s < n; s++) {
      if (degree[edges.from[loop[s]!]!] !== 2) {
        at = s;
        break;
      }
    }
    const nation = Math.floor(edges.region[loop[0]!]! / NX / 2);
    const points: number[][] = [];
    if (at < 0) {
      const line = polylines[polyOf[edges.edge[loop[0]!]!]!]!;
      const forward = line.vertices[indexIn[edges.edge[loop[0]!]!]!] === edges.from[loop[0]!];
      const run = forward ? line.points : [...line.points].reverse();
      points.push(...run.map((p) => [p[0]!, p[1]!]));
    } else {
      let s = 0;
      while (s < n) {
        const k = loop[(at + s) % n]!;
        const e = edges.edge[k]!;
        const line = polylines[polyOf[e]!]!;
        const count = line.closed ? line.vertices.length : line.vertices.length - 1;
        const forward = line.vertices[indexIn[e]!] === edges.from[k];
        const run = forward ? line.points : [...line.points].reverse();
        for (let p = 0; p < run.length - 1; p++) points.push([run[p]![0]!, run[p]![1]!]);
        s += count;
      }
    }
    rings[nation]!.push(points);
  }

  const frontiers: Frontier[] = [];
  for (const line of polylines) {
    if (line.frontier === null) continue;
    const points = line.closed ? [...line.points, line.points[0]!] : line.points;
    frontiers.push({ points, left: line.frontier[0] + 1, right: line.frontier[1] + 1 });
  }
  return { rings, frontiers };
}

/* ------------------------------------------------------------------------- *
 * The political colours
 * ------------------------------------------------------------------------- */

/**
 * How far round the hue circle a body's political colours range, degrees,
 * centred on its ground's own hue: a red planet's map is reds, oranges,
 * ochres and a rose or two, never a green or a blue.
 */
const POLITICAL_SPAN = 90;
/** Hues across that span, and the lightness steps each is offered at (sRGB HSL). */
const POLITICAL_HUES = 9;
const POLITICAL_LIGHTNESS = [0.56, 0.67, 0.78] as const;
/** The saturations every candidate is offered at, and a grey world's, whose span is the whole circle. */
const POLITICAL_SATURATION = [0.3, 0.5] as const;
const GREY_SATURATION = [0.22, 0.36] as const;
/** Under this saturation a ground has no hue worth keeping to: the Moon. */
const GREY_GROUND = 0.2;
/** How much keeping near the nation's own colour weighs against standing apart, in OKLab units. */
const KEEP_OWN = 0.3;
/**
 * Two nations that share a frontier are never closer than this in OKLab:
 * Earth's own `country-colors.ts` threshold, and `scripts/check-system.ts`
 * holds every world to it.
 */
export const POLITICAL_CONTRAST = 0.06;

/** sRGB bytes to OKLab, the space `country-colors.ts` measures Earth's in. */
export function oklabOf(hexColor: number): [number, number, number] {
  const lin = (c: number): number => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const r = lin((hexColor >> 16) & 0xff);
  const g = lin((hexColor >> 8) & 0xff);
  const b = lin(hexColor & 0xff);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

const oklabDistance = (a: readonly number[], b: readonly number[]): number =>
  Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

/**
 * One flat colour a nation for every map of its world — the menu's globe, the
 * sheet behind `M`, the minimap and the ground seen from the air — and no two
 * that touch alike.
 *
 * **A nation's own `color` is its banner's field and is not a map colour.**
 * Drawn from the 24 of `PALETTE`, a body's nations repeat one another (Mars
 * has two creams, two browns and two whites) and half of them are the dark
 * earths a ground is already made of, so a political map tinted by them was
 * fifteen shades of the same mud with neighbours you could not tell apart.
 * Earth's answer is `country-colors.ts`: a colour off the flag, nudged off its
 * neighbours. This is the same answer for a world with no flags to read.
 *
 * The candidates are a fan of hues round the ground's own — `POLITICAL_SPAN`
 * of them, the whole circle for a grey world — at three lightnesses and two
 * saturations, so every map of a world is in its family and reads as a
 * political map rather than as more ground. The nations are taken biggest cap
 * first, and each takes the candidate that stands furthest from its
 * neighbours (and, at half the weight, from every nation already coloured),
 * less `KEEP_OWN` times how far that is from its own banner's colour: Elysium
 * stays an apricot, Marineris a gold. Deterministic: the order is the body's
 * file and the candidates a fixed table.
 */
export function politicalColors(body: Body, frontiers: readonly Frontier[]): number[] {
  const nations = body.nations;
  const touching = nations.map(() => new Set<number>());
  for (const frontier of frontiers) {
    touching[frontier.left - 1]?.add(frontier.right - 1);
    touching[frontier.right - 1]?.add(frontier.left - 1);
  }
  const hsl = { h: 0, s: 0, l: 0 };
  const color = new Color();
  color.setHex(body.look.surface, SRGBColorSpace).getHSL(hsl, SRGBColorSpace);
  const grey = hsl.s < GREY_GROUND;
  const span = grey ? 360 * (1 - 1 / POLITICAL_HUES) : POLITICAL_SPAN;
  const saturation = grey ? GREY_SATURATION : POLITICAL_SATURATION;
  const candidates: { hex: number; lab: [number, number, number] }[] = [];
  for (let k = 0; k < POLITICAL_HUES; k++) {
    const hue = (((hsl.h * 360 + span * (k / (POLITICAL_HUES - 1) - 0.5)) % 360) + 360) % 360;
    for (const lightness of POLITICAL_LIGHTNESS) {
      for (const chroma of saturation) {
        const hex = color.setHSL(hue / 360, chroma, lightness, SRGBColorSpace).getHex(SRGBColorSpace);
        candidates.push({ hex, lab: oklabOf(hex) });
      }
    }
  }
  const order = nations.map((_, i) => i).sort((a, b) => nations[b]!.radius - nations[a]!.radius || a - b);
  const chosen: ([number, number, number] | null)[] = nations.map(() => null);
  const out: number[] = nations.map((nation) => nation.color);
  for (const i of order) {
    const own = oklabOf(nations[i]!.color);
    let best = -Infinity;
    let pick = candidates[0]!;
    for (const candidate of candidates) {
      let near = Infinity;
      let anyone = Infinity;
      for (let j = 0; j < nations.length; j++) {
        const other = chosen[j];
        if (other === null || other === undefined) continue;
        const d = oklabDistance(candidate.lab, other);
        anyone = Math.min(anyone, d);
        if (touching[i]!.has(j)) near = Math.min(near, d);
      }
      const apart = Math.min(near, 2 * anyone, 1);
      const score = apart - KEEP_OWN * oklabDistance(candidate.lab, own);
      if (score > best) {
        best = score;
        pick = candidate;
      }
    }
    chosen[i] = pick.lab;
    out[i] = pick.hex;
  }
  return out;
}

/* ------------------------------------------------------------------------- *
 * The geography
 * ------------------------------------------------------------------------- */

const cache = new Map<string, Geography>();

/** The political map of a walkable body, computed once. Earth has its own and is refused. */
export function geographyOf(body: Body): Geography {
  const known = cache.get(body.id);
  if (known !== undefined) return known;
  const geography = buildGeography(body);
  cache.set(body.id, geography);
  return geography;
}

/**
 * `geographyOf` without the memo: the whole computation, every call. For the
 * check, which builds a body twice to hold it to determinism and times it.
 */
export function buildGeography(body: Body): Geography {
  if (body.id === 'earth' || body.nations.length === 0) throw new Error(`geography: '${body.id}' has no invented map`);

  const seeds = seedsOf(body);
  const labels = labelLattice(seeds);
  const { rings, frontiers } = outlinesOf(labels, body.nations.length);

  const keyOf = (nationId: string): string => keyFor(body.id, nationId);
  const biggest = new Map<string, number>();
  for (const place of body.settlements) {
    biggest.set(place.nation, Math.max(biggest.get(place.nation) ?? 0, place.population));
  }
  const unit: number[] = [0, 0, 0];
  const truthAt = (lat: number, lon: number): number => {
    toUnit(lat, lon, unit);
    return judge(seeds, unit[0]!, unit[1]!, unit[2]!) + 1;
  };
  const countries: Country[] = body.nations.map((nation, i) => {
    // The label point is the cap's centre, unless an enclave stands on it —
    // the Hexagon's centre is the Rose's pole — and then its biggest town.
    let { lat, lon } = nation;
    if (truthAt(lat, lon) !== i + 1) {
      const capital = body.settlements.find((place) => place.nation === nation.id && place.population === biggest.get(nation.id));
      if (capital !== undefined) ({ lat, lon } = capital);
    }
    return { iso: keyOf(nation.id), name: nation.name, continent: body.name, lat, lon, rings: rings[i]!, color: nation.color };
  });
  // The map's colour, not the banner's: see `politicalColors`.
  const political = politicalColors(body, frontiers);
  countries.forEach((country, i) => (country.color = political[i]!));

  const places: Place[] = body.settlements.map((place) => ({
    name: place.name,
    iso: keyOf(place.nation),
    lat: place.lat,
    lon: place.lon,
    pop: place.population,
    capital: biggest.get(place.nation) === place.population,
    // Built at the radius the walking engine builds it at (`townRadii`).
    radius: townRadii(body).get(place.id)!,
    // Every town is built: none is hidden by a bigger neighbour.
    prominence: PROMINENCE_CAP,
    zone: '',
  }));

  const surface = surfaceRadiusOf(body.radiusKm);
  const ground = body.ground;
  const built = worldFromCountries(countries, [], (surface * Math.PI) / 180, {
    elevationAt(point: Vector3): number {
      if (ground === null) return 0;
      const { lat, lon } = latLonOf(point);
      return ground.relief(lat, lon);
    },
  });

  // Longitude 180 is the east edge of the rings that end there and the west
  // edge of none — the other side of the seam is written -180 — so a point
  // exactly on it would be in no ring. Read the seam as -180.
  const countryAt = (lat: number, lon: number): number => built.countryAt(lat, lon >= 180 ? lon - 360 : lon);
  const world: World = {
    ...built,
    countryAt,
    countryAtPoint(point) {
      const { lat, lon } = latLonOf(point);
      return countryAt(lat, lon);
    },
  };

  const byIso = new Map(body.nations.map((nation) => [keyOf(nation.id), nation]));
  return {
    body,
    countries,
    places,
    world,
    frontiers,
    keyOf,
    nationOf: (iso) => byIso.get(iso),
    truthAt,
  };
}

/* ------------------------------------------------------------------------- *
 * The clock
 * ------------------------------------------------------------------------- */

const J2000_MS = Date.UTC(2000, 0, 1, 12);
const Y = new Vector3(0, 1, 0);

/**
 * Local solar time at a longitude, 0 to 24: the hour the walking engine's sky
 * (`worlds/sky.ts`) shows there at `date` before anyone has turned its clock.
 *
 * The same construction, step for step, so the menu's clock and the sky
 * agree: the body's pole turned onto +y, its spin about it — from the date on
 * a turning world, from where Earth is on a locked one — and the hour the
 * angle round the pole between the observer's meridian and the Sun's, read
 * the other way on a world that turns backwards.
 */
export function localHour(body: Body, lon: number, date: Date): number {
  const pole = poleOf(body);
  const P = new Vector3(pole.x, pole.y, pole.z).normalize();
  const align = new Quaternion().setFromUnitVectors(P, Y);
  let turn: number;
  if (body.locked === true) {
    const toward = unitAt(0, moonMeanLongitude(date) + 180, new Vector3()).applyQuaternion(align);
    turn = lonOf(toward.x, toward.z) * DEG;
  } else {
    const hours = (date.getTime() - J2000_MS) / 3600000;
    turn = (2 * Math.PI * hours) / body.rotationHours;
  }
  const spin = new Quaternion().setFromAxisAngle(Y, -turn);
  const celestial = spin.multiply(align);
  const here = eclipticToWorld(heliocentric(body.orbit ?? 'earth', date));
  const sun = new Vector3(-here.x, -here.y, -here.z).normalize().applyQuaternion(celestial);
  const sense = Math.sign(body.rotationHours) || 1;
  let angle = lon - lonOf(sun.x, sun.z);
  angle = ((angle + 540) % 360) - 180;
  return (((12 + (sense * angle) / 15) % 24) + 24) % 24;
}

/** How long a solar day is on a body, Earth hours: its turn against the Sun's. */
export function solarDayHours(body: Body): number {
  return Math.abs(1 / (1 / body.rotationHours - 1 / (periodOf(body.orbit ?? 'earth') * 24)));
}
