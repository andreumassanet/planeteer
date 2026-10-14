import * as THREE from 'three';
import { PLANET_RADIUS, UNITS_PER_DEGREE } from '../globe.ts';
import { isShown } from '../places.ts';
import type { Place } from '../places.ts';
import { seedOf } from '../scenery/random.ts';
import { placeDirection } from './town.ts';

/**
 * Which towns the network joins. The bake chooses the edges and `pnpm check`
 * re-derives them without trusting the file, so both call these functions.
 */

const DEG = Math.PI / 180;

/**
 * Longest road the network will build, in world units: 1,000 units is about
 * 400 km, past which two towns no longer read as connected.
 */
export const MAX_ROAD_LENGTH = 1000;

/**
 * The two proximity graphs. Gabriel keeps an edge when no third place lies in
 * the circle on it as a diameter; the relative neighbourhood graph keeps it
 * only when no third place is nearer both ends than they are to each other,
 * and is a subgraph of Gabriel that still contains the minimum spanning tree.
 */
export type ProximityGraph = 'gabriel' | 'rng';

export interface GraphEdge {
  /** Indices into the place list, always `a < b`, so a pair has one key. */
  a: number;
  b: number;
  /** Chord length in world units. Monotonic in the arc, which is all it is for. */
  length: number;
}

/**
 * Builds one of the two graphs over a list of places. Both tests are local
 * (an edge is only checked against places inside a disc it defines), so each
 * place's neighbour list, gathered from a lat/lon grid, is all either needs.
 */
export function proximityGraph(
  places: readonly Place[],
  kind: ProximityGraph,
  maxLength = MAX_ROAD_LENGTH,
): GraphEdge[] {
  const unit = new Float64Array(places.length * 3);
  const scratch = new THREE.Vector3();
  places.forEach((place, i) => {
    placeDirection(place, scratch);
    unit[i * 3] = scratch.x;
    unit[i * 3 + 1] = scratch.y;
    unit[i * 3 + 2] = scratch.z;
  });
  const chord = (i: number, j: number): number => {
    const dx = unit[i * 3]! - unit[j * 3]!;
    const dy = unit[i * 3 + 1]! - unit[j * 3 + 1]!;
    const dz = unit[i * 3 + 2]! - unit[j * 3 + 2]!;
    return Math.sqrt(dx * dx + dy * dy + dz * dz) * PLANET_RADIUS;
  };

  // A 4-degree cell is wider than `maxLength` (3.6 degrees of latitude), so
  // a query looks at a 3x3 block; the longitude span opens with the cosine
  // so a search near the poles stays local.
  const CELL = 4;
  const COLS = Math.round(360 / CELL);
  const ROWS = Math.round(180 / CELL);
  const grid: number[][] = Array.from({ length: COLS * ROWS }, () => []);
  const cellOf = (lat: number, lon: number): number =>
    Math.min(ROWS - 1, Math.max(0, Math.floor((90 - lat) / CELL))) * COLS +
    (((Math.floor((lon + 180) / CELL) % COLS) + COLS) % COLS);
  places.forEach((place, i) => grid[cellOf(place.lat, place.lon)]!.push(i));

  const near = (i: number, radius: number): number[] => {
    const place = places[i]!;
    const found: number[] = [];
    const latSpan = Math.ceil(radius / UNITS_PER_DEGREE / CELL);
    const lonSpan = Math.ceil(
      radius / UNITS_PER_DEGREE / Math.max(0.02, Math.cos(place.lat * DEG)) / CELL,
    );
    const row0 = Math.max(0, Math.floor((90 - place.lat) / CELL) - latSpan);
    const row1 = Math.min(ROWS - 1, Math.floor((90 - place.lat) / CELL) + latSpan);
    const col = Math.floor((place.lon + 180) / CELL);
    for (let r = row0; r <= row1; r++) {
      for (let c = col - lonSpan; c <= col + lonSpan; c++) {
        // The search wraps the whole planet: walk every column once.
        if (lonSpan * 2 + 1 >= COLS && c > col - lonSpan + COLS - 1) break;
        for (const j of grid[r * COLS + (((c % COLS) + COLS) % COLS)]!) {
          if (j !== i && chord(i, j) <= radius) found.push(j);
        }
      }
    }
    return found;
  };

  const edges: GraphEdge[] = [];
  for (let i = 0; i < places.length; i++) {
    const neighbours = near(i, maxLength);
    for (const j of neighbours) {
      if (j < i) continue;
      const length = chord(i, j);
      if (length > maxLength || length < 1e-6) continue;
      let kept = true;
      for (const k of neighbours) {
        if (k === i || k === j) continue;
        const ik = chord(i, k);
        const jk = chord(j, k);
        if (kind === 'gabriel') {
          // Inside the circle on `ij` as a diameter: the angle at k is obtuse.
          if (ik * ik + jk * jk < length * length) {
            kept = false;
            break;
          }
        } else if (Math.max(ik, jk) < length) {
          // In the lune: closer to both ends than they are to each other.
          kept = false;
          break;
        }
      }
      if (kept) edges.push({ a: i, b: j, length });
    }
  }
  return edges;
}

/** One key per unordered pair, for the set difference the bake and the check both take. */
export function pairKey(places: number, a: number, b: number): number {
  return Math.min(a, b) * places + Math.max(a, b);
}

/**
 * The candidate pairs over the places that are built (`isShown`), so every
 * road joins two towns you can walk into. The indices returned are into the
 * whole `places` list. Being a function of `isShown`, it follows
 * `PROMINENCE_RADIUS`: turning that knob needs a re-bake, and `pnpm check`
 * asserts the file against this function.
 */
export function builtGraph(
  places: readonly Place[],
  kind: ProximityGraph,
  maxLength = MAX_ROAD_LENGTH,
): GraphEdge[] {
  const index: number[] = [];
  const built: Place[] = [];
  places.forEach((place, i) => {
    if (!isShown(place)) return;
    index.push(i);
    built.push(place);
  });
  // `proximityGraph` emits `a < b` in input order and `index` is increasing,
  // so the remapped pair is still ordered and `pairKey` still works.
  return proximityGraph(built, kind, maxLength).map((edge) => ({
    a: index[edge.a]!,
    b: index[edge.b]!,
    length: edge.length,
  }));
}

/**
 * The bow a pair of places gets, seeded from their identities rather than
 * their indices, so adding a village to `places.bin` does not re-shape every
 * road. Up to a twentieth of the length either way.
 */
export function bendFor(a: Place, b: Place): number {
  const first = a.name < b.name ? a : b;
  const second = a.name < b.name ? b : a;
  const seed = seedOf(
    `${first.name}@${first.lat},${first.lon}`,
    `${second.name}@${second.lat},${second.lon}`,
  );
  return (((seed >>> 0) / 4294967296) * 2 - 1) * 0.05;
}
