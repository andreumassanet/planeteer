import { toUnit } from '../../sphere.ts';
import type { Body } from '../contract.ts';
import { angularDistance } from '../contract.ts';
import { fbm } from '../noise.ts';

const DEG = Math.PI / 180;


/**
 * How far the warp moves a point, in radians of fbm's output (about four
 * degrees): enough to bend a frontier without moving a nation. Much less
 * leaves frontiers between grid-laid seeds as near-great circles; much more
 * throws islands into neighbours.
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
export interface Seeds {
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
 * The seeds the map is grown from: the nations' caps and the towns the body's
 * file names, plus those grown towns (\`towns.ts\`) the map would otherwise hand
 * to a neighbour, which are the few on a frontier.
 */
export function seedsOf(body: Body): Seeds {
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
  // An enclave (a cap whose centre is inside a bigger one) keeps a core.
  // Weighted by angle alone, two caps sharing a centre leave the smaller
  // nothing; inside `CORE` of its own radius an enclave wins outright,
  // smallest first.
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
export function judge(seeds: Seeds, px: number, py: number, pz: number): number {
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
