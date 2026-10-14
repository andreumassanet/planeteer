// Taking the lakes out of the land: which land rings a lake is a hole in, which
// it is spliced into as a bay, and which it cannot be paired with.

import type { LandRing, World } from '../geo.ts';
import { insideRing } from '../geo.ts';
import { densify } from './tessellation.ts';

/**
 * A lake, prepared once for the whole build. The outline is densified here and
 * shared: the same ring is cut out of one country as a hole and spliced into
 * another's coastline as a bay, and both must end on identical points.
 */
export interface Lake {
  points: number[][];
  outline: number[][];
  box: [number, number, number, number];
  area: number;
}

const box = (points: number[][]): [number, number, number, number] => {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const p of points) {
    if (p[0]! < minLon) minLon = p[0]!;
    if (p[0]! > maxLon) maxLon = p[0]!;
    if (p[1]! < minLat) minLat = p[1]!;
    if (p[1]! > maxLat) maxLat = p[1]!;
  }
  return [minLon, minLat, maxLon, maxLat];
};

const overlaps = (a: readonly number[], b: readonly number[]): boolean =>
  a[0]! <= b[2]! && a[2]! >= b[0]! && a[1]! <= b[3]! && a[3]! >= b[1]!;

/** Maximal cyclic runs of `true`, as `[start, length]` pairs. */
function cyclicRuns(flags: boolean[]): [number, number][] {
  const n = flags.length;
  if (n === 0 || !flags.some(Boolean)) return [];
  if (flags.every(Boolean)) return [[0, n]];
  const runs: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    if (!flags[i] || flags[(i + n - 1) % n]) continue;
    let length = 1;
    while (flags[(i + length) % n]) length++;
    runs.push([i, length]);
  }
  return runs;
}

const distanceSq = (a: number[], b: number[]): number =>
  (a[0]! - b[0]!) ** 2 + (a[1]! - b[1]!) ** 2;

/** Latitude clamped off the poles, where a ray cast along the polar edge is degenerate. */
export const clampLat = (lat: number): number => (lat > 89.999 ? 89.999 : lat < -89.999 ? -89.999 : lat);

export type LakeCut =
  /** The lake is somewhere else entirely, or shares only a bounding box. */
  | { kind: 'clear' }
  /** Wholly inside this ring: `triangulateShape` takes it as a hole. */
  | { kind: 'hole' }
  /** It crosses the ring's boundary; this is the coastline with the bay in it. */
  | { kind: 'splice'; contour: number[][] }
  /** A border drawn along the shore rather than across it. */
  | { kind: 'unpaired' };

/**
 * `contour \ lake`, as a new contour, when the two boundaries cross.
 *
 * A lake that straddles a border is strictly inside neither ring, so it cannot
 * be a hole (earcut ignores or garbles a hole that pokes out of its contour).
 * It is spliced into the coastline instead. Both windings mean the same thing:
 * countries are wound with the land on the right of `a -> b`, lakes the other
 * way round so the land outside them is on the right too. The boundary of the
 * difference is then "walk forward keeping land on the right, changing curve
 * where they cross": drop the run of contour points inside the lake and put the
 * run of lake points inside the contour in its place.
 *
 * Joins land on the nearest vertex rather than the true crossing. That costs
 * half a lake segment but keeps the seam exact: an interpolated crossing would
 * be a vertex the neighbouring ring does not have.
 *
 * Returns `unpaired` when the runs do not pair up, which is a border drawn along
 * a shore and weaving over it; the mesh then drops the triangles on the water.
 */
export function subtractLake(contour: number[][], lake: Lake): LakeCut {
  const inLake = contour.map(([lon, lat]) => insideRing(lake.points, lon!, clampLat(lat!)));
  const inContour = lake.points.map(([lon, lat]) => insideRing(contour, lon!, clampLat(lat!)));

  const lakeRuns = cyclicRuns(inContour);
  if (lakeRuns.length === 0) return { kind: 'clear' };
  // Wholly inside, and no part of the contour inside it: a hole, not a bay.
  if (lakeRuns[0]![1] === lake.points.length && !inLake.some(Boolean)) return { kind: 'hole' };

  // What is left of the contour, as maximal runs of points still on land. A
  // lake that swallows the whole ring leaves nothing and is not a lake.
  const keptRuns = cyclicRuns(inLake.map((f) => !f));
  if (keptRuns.length === 0) return { kind: 'unpaired' };
  // One arc of lake per gap in the coastline. Anything else is a boundary that
  // runs along the shore rather than across it, and there is no pairing to make.
  if (keptRuns.length !== lakeRuns.length) return { kind: 'unpaired' };

  const n = contour.length;
  const m = lake.points.length;
  const at = (run: [number, number], k: number, points: number[][]): number[] =>
    points[(run[0] + k) % points.length]!;

  const out: number[][] = [];
  for (let r = 0; r < keptRuns.length; r++) {
    const kept = keptRuns[r]!;
    for (let k = 0; k < kept[1]; k++) out.push(at(kept, k, contour));

    // The gap this run leaves, and the lake arc that fills it: the one whose
    // own start is nearest where the coastline went into the water and whose end
    // is nearest where it comes back out.
    const exit = contour[(kept[0] + kept[1] - 1) % n]!;
    const entry = contour[keptRuns[(r + 1) % keptRuns.length]![0]!]!;
    let best = -1;
    let bestCost = Infinity;
    for (let i = 0; i < lakeRuns.length; i++) {
      const run = lakeRuns[i]!;
      const cost = distanceSq(exit, lake.points[run[0]!]!) +
        distanceSq(entry, lake.points[(run[0] + run[1] - 1) % m]!);
      if (cost < bestCost) {
        bestCost = cost;
        best = i;
      }
    }
    const arc = lakeRuns[best]!;
    lakeRuns.splice(best, 1);
    for (let k = 0; k < arc[1]; k++) out.push(at(arc, k, lake.points));
  }
  return { kind: 'splice', contour: out };
}

/** The world's lakes, densified once. */
export function lakesOf(world: World): Lake[] {
  return (world.rings as LandRing[])
    .filter((ring) => ring.water)
    .map((ring) => ({
      points: ring.points,
      outline: densify(ring.points),
      box: box(ring.points),
      area: ring.area,
    }));
}

/** What each land ring has to do about each lake. */
export interface LakePlan {
  /** The land rings, in order. */
  land: LandRing[];
  /** For each land ring, the lakes that touch it and how. */
  cuts: { lake: Lake; cut: LakeCut }[][];
  /** The ring that builds the wall round a lake that is a hole in several. */
  wallOwner: Map<Lake, LandRing>;
}

/**
 * Works out once what each land ring does about each lake. Pairs are chosen by
 * bounding box, since a point-in-polygon sweep per pair is the expensive part.
 *
 * The bake keeps only outer rings, so an enclave sits inside its neighbour's
 * polygon and a lake in Lesotho is also a lake in South Africa. Both cut the
 * hole, but only the smallest ring (the one `countryAt` names) builds the wall,
 * or two coincident walls would z-fight. A spliced lake needs no such rule: its
 * rim is partitioned between the rings that share it.
 */
export function planLakes(world: World, lakes: Lake[]): LakePlan {
  const land = (world.rings as LandRing[]).filter((ring) => !ring.water);
  const cuts = land.map((ring) => {
    const ringBox = box(ring.points);
    const found: { lake: Lake; cut: LakeCut }[] = [];
    for (const lake of lakes) {
      if (!overlaps(ringBox, lake.box)) continue;
      const cut = subtractLake(ring.points, lake);
      if (cut.kind !== 'clear') found.push({ lake, cut });
    }
    return found;
  });
  const wallOwner = new Map<Lake, LandRing>();
  cuts.forEach((ringCuts, index) => {
    for (const { lake, cut } of ringCuts) {
      if (cut.kind !== 'hole') continue;
      const held = wallOwner.get(lake);
      if (held === undefined || land[index]!.area < held.area) wallOwner.set(lake, land[index]!);
    }
  });
  return { land, cuts, wallOwner };
}
