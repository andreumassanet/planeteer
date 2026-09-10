import * as THREE from 'three';
import { ShapeUtils } from 'three';
import type { LandRing, World } from './geo.ts';
import { LAND_HEIGHT, insideRing } from './geo.ts';
import { MAX_RELIEF, RELIEF_DETAIL, detailWeightAt, flattenWeightAt, prepareTerrain, reliefAt, shoreAt, shoreSample } from './terrain.ts';
import { CONTINENT_COLORS, DEFAULT_LAND, MOSAIC_LAND, PALETTE, createToonRamp } from './theme.ts';
import type { FlagLayer, LandFlagData, RingSpan } from './land-flags.ts';
import { BIOMES, biomeAt, biomeSample } from './biome.ts';

/**
 * Planet radius.
 *
 * It drives nearly everything else, and the two constants below are derived
 * from it rather than tuned, so changing it here is enough.
 *
 * At 400 the world was a marble: the horizon (~sqrt(2*R*h)) was 126 units and
 * Spain is 70 wide, so you saw a whole country at once. 4000 fixed that but was
 * still too small for its own islands — Mallorca came out 59 units across
 * against a 6.8-unit avatar, a 1.3-second walk. At 16000 it is 235 units, about
 * 35 avatars, and a lap of the planet is 13 minutes at a run.
 *
 * Note what does *not* change with it: the triangle count. The land mesh is
 * built from angles, not distances, so a bigger planet is the same 302,000
 * triangles spread further apart. Nor does `LAND_HEIGHT`: a coastal cliff is a
 * human-scale feature, so it stays 20 units — three avatars — while the
 * geography around it grows.
 */
export const PLANET_RADIUS = 16000;

/** World units per degree of arc. One degree is 279 units; the player is 6.8. */
export const UNITS_PER_DEGREE = (PLANET_RADIUS * Math.PI) / 180;

// Re-exported so nothing outside `geo.ts` has to know that the cliff height
// lives with the rings. It has to: each ring's height is baked into the index
// so the mesh and `groundRadius` cannot drift apart.
export { LAND_HEIGHT } from './geo.ts';

const DEG = Math.PI / 180;

/**
 * The angle whose chord sags by `sag` units below a sphere of `PLANET_RADIUS`.
 *
 * Every tessellation limit here is this same question. A flat triangle spanning
 * an angle `t` dips below the surface by `R*(1-cos(t/2))` at its centre, so
 * whatever must not sink through the water sets the largest angle allowed.
 * Deriving both limits from it means a change to `PLANET_RADIUS` needs no
 * retuning: the sag budget is in units, and the angles follow.
 */
export function angleForSag(sag: number): number {
  return 2 * Math.acos(1 - sag / PLANET_RADIUS);
}

/**
 * The water sphere used to be built here and lives in `src/ocean.ts` now,
 * together with the shallows and the sun's path on them. What is left of it in
 * this file is `angleForSag` above, which both meshes derive their limits from,
 * and `coastEdges` at the bottom, which is the one answer to "is this edge of
 * the outlines a coastline or a frontier".
 *
 * What that sphere was is worth keeping: a plain icosphere, every vertex the
 * same colour. It used to be detail 160 — half a million faces — because the
 * land was made by pushing this same sphere's vertices outward, so the
 * coastline was quantised to the vertex spacing, 43.8 km. Mallorca is 100 km
 * across and came out as two triangles; Ibiza, at 40 km, landed between vertices
 * and did not exist at all. Rendering it properly would have needed detail 703,
 * or 9.9 million faces. The land is real polygons now and that sphere is only
 * water.
 */

/**
 * Longest edge allowed in the land mesh.
 *
 * Which of the two limits binds changed when the land got relief. It used to be
 * the chord sag — half the cliff height, so a triangle could dip that far and
 * still sit above the sea — and that came out at 4 degrees, 1,130 units. A
 * triangle that long can span an entire hill without either of its ends
 * noticing, and the error test below only ever asks about ends. So the ceiling
 * is two cells of the finest octave of the relief instead: about a degree,
 * whose own chord sag is half a unit, so the old limit no longer binds at all.
 *
 * It is the expensive line in this file. Measured, tightening it from 3 degrees
 * to 1 costs about a hundred thousand triangles — most of them spent splitting
 * the long thin ones the ear clipper leaves along the coast — and it halves the
 * worst disagreement between the mesh and the ground the player stands on, from
 * 10 units to 5. That is the trade, and it is why the number is derived from
 * the terrain rather than chosen.
 */
const MAX_EDGE = Math.min(angleForSag(LAND_HEIGHT * 0.5), RELIEF_DETAIL * 2);

/**
 * Largest gap allowed between the mesh and `reliefAt`, in world units.
 *
 * This is the second tessellation limit, and the one the relief added. The sag
 * budget above answers "how flat may a triangle be against the sphere"; this
 * answers "how flat may it be against the terrain", by testing the middle of
 * every edge against the average of its ends and splitting when they disagree.
 *
 * Making it an error rather than a length is what keeps the cost sane. A
 * uniform edge fine enough for a ridge would be fine everywhere, and the Sahara
 * does not need it: measured against the curvature, a smooth plain keeps its
 * kilometre-wide triangles and only the mountains pay.
 *
 * It bounds the edges, not the middle of a triangle, so the real figure is a
 * little worse than three: sampling a few thousand random land points, the mesh
 * sits 0.5 units from `elevationAt` on average and never more than 5 — under an
 * avatar, and better than the flat plate managed in the middle of the Sahara.
 */
const RELIEF_SAG = 3;

/**
 * And the budget under a monument, which has to be tighter.
 *
 * Three units is half an avatar: nothing on a hillside, and too much where a
 * model with a footprint is standing. `terrain.ts` flattens the relief under
 * each monument, but a flat pad is only as flat as the triangles over it, and
 * one that straddles the rim cuts the corner and leaves a dip under the edge of
 * the model. Grading the budget by how strongly the pad claims the point spends
 * the triangles on the rim and none in the middle, which is already flat and
 * refines to nothing: measured over the 65 sites, the mesh goes from 3.0 units
 * out under the widest footprint the contract allows to 1.4, and from 20 sites
 * over a unit to 2, for 9,000 triangles. It buys nothing on its own any more —
 * the pad rims are what bind now, and `PAD_MIN_EDGE` is what holds them.
 */
const PAD_SAG = 0.6;

/**
 * Floor on the edge length: at some point a smaller triangle is a smaller
 * triangle and not more mountain. Without it a cliff in the noise would recurse
 * until the pass limit stopped it, and pay a few hundred thousand triangles for
 * a feature two avatars wide.
 */
const MIN_EDGE = 0.08 * DEG;

/**
 * And the floor at the rim of a monument's pad, which has to be finer.
 *
 * 22 units is nothing on a hillside and it is most of the feature here. A
 * triangle with one corner on a level pad and the rest on the skirt below it
 * cuts across the lip, and dips under the model by however far into the pad it
 * reaches — so the pad is only reliably flat a floor's width inside its own
 * edge, and `terrain.ts` has to keep that width as bare ground around every
 * model. Cutting the floor to a third takes the worst gap measured under any of
 * the 65 models from 2.24 units to 1.68 and lets `PAD_MARGIN` come down to 20,
 * for triangles spent on 65 rims and nowhere else.
 *
 * A third rather than further: at a quarter the numbers do not move again. The
 * error budget stops the refinement well before this floor does on most rims,
 * which is what makes it cheap.
 */
const PAD_MIN_EDGE = MIN_EDGE / 3;

/** Error budget for a point, given how strongly a pad claims it. */
function sagFor(pad: number): number {
  return RELIEF_SAG - (RELIEF_SAG - PAD_SAG) * pad;
}

/** Shortest edge worth building there, by the same grading. */
function floorFor(pad: number): number {
  return MIN_EDGE - (MIN_EDGE - PAD_MIN_EDGE) * pad;
}

/** Error budget at a point: `RELIEF_SAG`, tightening to `PAD_SAG` under a pad. */
function sagAt(point: THREE.Vector3): number {
  return sagFor(flattenWeightAt(point.x, point.y, point.z));
}

/**
 * How far the coastal cliff sinks below sea level, hiding the seam. It only has
 * to clear the ocean sphere's own sag, with room to spare.
 */
const EMBED = 25;

/**
 * Thinnest triangle worth keeping, in world units: its area over its longest
 * edge, which is its own height.
 *
 * A triangle this thin is invisible — a twentieth of a unit against a 6.8-unit
 * avatar — and its normal is worse than invisible. Positions are float32, so at
 * a radius of 16,000 they carry about a thousandth of a unit; the cross product
 * of two edges of a sliver is made of that rounding error and points wherever it
 * likes, including sideways out of a horizontal surface.
 *
 * **It used to be an area and the shore ramp is what proved that wrong.** The
 * outlines carry collinear runs of points, and the ear clipper turns them into
 * slivers a hundred units long and a hundredth of a unit thick — whose *area*
 * is a fraction of a unit either way, so an area threshold either keeps them
 * all or starts eating real triangles. As long as the coast was flat those
 * slivers were exactly degenerate and fell out on their own. The ramp gives the
 * coastal band a gradient, which pulls their ends apart in radius and hands
 * every one of them a garbage normal: `pnpm check` went from 456 walls facing
 * inland to 5,045, and not one of the new ones was a wall. Height is the
 * measurement that tells a sliver from a small triangle, and nothing legitimate
 * is near it — the mesh's own floor is `PAD_MIN_EDGE`, 7.4 units, so the
 * thinnest triangle the refinement can build is a hundred times this.
 */
const MIN_TRIANGLE_HEIGHT = 0.05;

/** A point on the unit sphere. Matches `toLatLon` in `geo.ts`, inverted. */
export function onSphere(lon: number, lat: number, target: THREE.Vector3): THREE.Vector3 {
  const cos = Math.cos(lat * DEG);
  return target.set(cos * Math.cos(lon * DEG), Math.sin(lat * DEG), -cos * Math.sin(lon * DEG));
}

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/** Relief at a point given in degrees, for the two functions below. */
function reliefAtLonLat(lon: number, lat: number, scratch: THREE.Vector3): number {
  onSphere(lon, lat, scratch);
  return reliefAt(scratch.x, scratch.y, scratch.z);
}

/**
 * Worst gap between the relief along an edge and `steps` straight spans of it,
 * as a fraction of the budget allowed at each span's own middle.
 *
 * Sampled at the middle of each span, which is where a straight line across a
 * curve is furthest from it — and which is also the point `refine` will test if
 * this edge ends up on the boundary, so the two ask the same question of the
 * same place and cannot come to different answers about a ring edge.
 */
function edgeReliefError(p: number[], q: number[], steps: number, scratch: THREE.Vector3): number {
  const lon = q[0]! - p[0]!;
  const lat = q[1]! - p[1]!;
  let previous = reliefAtLonLat(p[0]!, p[1]!, scratch);
  let worst = 0;
  for (let k = 0; k < steps; k++) {
    const t = (k + 1) / steps;
    const next = reliefAtLonLat(p[0]! + lon * t, p[1]! + lat * t, scratch);
    const middle = (k + 0.5) / steps;
    const centre = reliefAtLonLat(p[0]! + lon * middle, p[1]! + lat * middle, scratch);
    worst = Math.max(worst, Math.abs(centre - (previous + next) * 0.5) / sagAt(scratch));
    previous = next;
  }
  return worst;
}

/**
 * Splits ring edges until none spans more than `MAX_EDGE`, nor misses the
 * relief under it by more than `RELIEF_SAG`.
 *
 * Done before triangulating rather than after, so the coastline's own edges are
 * already short enough on both counts and the refinement below never has to
 * touch them. That keeps the boundary of the triangulated surface identical to
 * the ring the walls are built from — otherwise the top and the cliff would not
 * meet, and a hill rising at the shoreline would tear the coast open.
 *
 * The count depends on the edge and nothing else, so where two countries share
 * a border both rings split it in the same places and their surfaces still meet
 * along it.
 */
function densify(points: number[][]): number[][] {
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const scratch = new THREE.Vector3();
  const out: number[][] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const q = points[(i + 1) % points.length]!;
    out.push(p);
    const span = onSphere(p[0]!, p[1]!, a).angleTo(onSphere(q[0]!, q[1]!, b));
    let steps = Math.max(1, Math.ceil(span / MAX_EDGE));
    // Then as many more as the relief asks for. Doubling, because the test
    // answers "is this enough" over the whole edge rather than "how much".
    //
    // Stricter than `refine` by a hair, and that margin is the point: the two
    // measure the midpoint of a sub-segment from lon/lat and from the chord
    // respectively, which agree to about a part in a million. Without the
    // margin an edge sitting exactly on the budget could pass here and fail
    // there, and a split boundary edge is a torn coast.
    //
    // The floor is the finest `refine` could ever ask for, not the ordinary
    // one, and that is not caution: `refine` splits any edge of any triangle,
    // the boundary ones included, and a boundary edge it splits is a vertex the
    // cliff below does not have — a crack the height of a hill. Stopping here
    // one floor before `refine` would is the only thing that keeps the coast
    // shut, so the two floors have to be the same number.
    while (steps * 2 * PAD_MIN_EDGE <= span && edgeReliefError(p, q, steps, scratch) > 0.98) {
      steps *= 2;
    }
    for (let k = 1; k < steps; k++) {
      const t = k / steps;
      out.push([p[0]! + (q[0]! - p[0]!) * t, p[1]! + (q[1]! - p[1]!) * t]);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Taking the lakes out of the land
// ---------------------------------------------------------------------------

/**
 * A lake, prepared once for the whole build.
 *
 * The outline is densified here and *shared*, which is the only reason the seams
 * close. The same ring is cut out of one country as a hole and spliced into
 * another's coastline as a bay, and both have to end on the identical points —
 * `densify` splits an edge by its own two ends, so two callers handing it the
 * same pair get the same subdivision and the two surfaces meet exactly.
 */
interface Lake {
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

/**
 * `contour \ lake`, as a new contour, when the two boundaries cross.
 *
 * **A lake that straddles a border is not a hole and cannot be one, and that is
 * the whole reason this function exists.** 366 of the 459 lake-and-ring pairs on
 * this planet are a lake sitting wholly inside one country, which
 * `ShapeUtils.triangulateShape` takes as a hole and cuts perfectly. The other 93
 * are the ones worth having — Superior, Huron, Erie, Ontario, Victoria,
 * Tanganyika, Titicaca, the Aral — where the international border is drawn
 * *across the water*, so the lake belongs partly to each of two rings and is
 * strictly inside neither.
 *
 * Handing earcut a hole that pokes out of its contour is measured and it is not
 * a near miss. Same frame, Lake Superior against the two rings it straddles:
 * **the United States came back with 2,284 triangles summing to 872 square
 * degrees against a ring of 834 — 38 of pure garbage, 169 triangles outside the
 * ring entirely and 33 still inside the lake — and Canada's hole was silently
 * ignored**, 3,312 triangles either way and the lake left as dry land. Neither
 * threw.
 *
 * So the lake is spliced into the coastline instead, and the splice needs no
 * geometry at all — no segment intersections, no epsilon, nothing that can be
 * numerically unlucky. It is one combinatorial fact used twice: **both windings
 * mean the same thing.** `build-countries.mjs` winds a country so the land is on
 * the right of `a -> b`; `build-lakes.mjs` winds a lake the other way round so
 * that the land — which is now *outside* it — is on the right as well. The
 * boundary of the difference is therefore just "walk forward, keeping land on
 * your right, changing curve where they cross": drop the run of contour points
 * that fell inside the lake, and put the run of lake points that fell inside the
 * contour in its place, in the lake's own stored order.
 *
 * The joins land on the nearest vertex rather than on the true crossing, which
 * costs half a lake segment — about seven units, one avatar — at the two points
 * per lake where a border meets a shore. **That is deliberately paid to keep the
 * seam exact**: an interpolated crossing point is a vertex the neighbouring
 * country's ring does not have, and the two surfaces would meet along a chord
 * one of them subdivided and the other did not.
 *
 * Returns null when the runs do not pair up, which is the degenerate case of a
 * border drawn *along* a shore rather than across it and weaving over it. Six
 * pairs on this planet do that; `buildLand` falls back to dropping the
 * triangles that land on water and `pnpm check` counts what is left.
 */
type LakeCut =
  /** The lake is somewhere else entirely, or shares only a bounding box. */
  | { kind: 'clear' }
  /** Wholly inside this ring: `triangulateShape` takes it as a hole. */
  | { kind: 'hole' }
  /** It crosses the ring's boundary; this is the coastline with the bay in it. */
  | { kind: 'splice'; contour: number[][] }
  /** A border drawn along the shore rather than across it. See above. */
  | { kind: 'unpaired' };

function subtractLake(contour: number[][], lake: Lake): LakeCut {
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

/** Latitude clamped off the poles, where a ray cast along the polar edge is degenerate. */
const clampLat = (lat: number): number => (lat > 89.999 ? 89.999 : lat < -89.999 ? -89.999 : lat);

/** Packs an ordered pair of vertex indices into one number, for the map below. */
const EDGE_KEY = 8388608;

/**
 * Subdivides the triangulated interior until every edge is both short enough
 * and close enough to the relief.
 *
 * Whether an edge splits depends only on the edge, and both triangles sharing
 * it ask the same question and get the same cached answer, so the mesh stays
 * watertight. A scheme that decided per triangle would leave T-junctions, and
 * since every new vertex is pushed back onto the sphere and then displaced by
 * its own relief, each T-junction would open a crack the height of a hill.
 *
 * `relief` grows alongside `vertices`: a midpoint's height is worked out to
 * decide the split and then kept, so no point of this mesh is evaluated twice.
 */
function refine(vertices: THREE.Vector3[], relief: number[], faces: number[][]): number[][] {
  const midpoint = new THREE.Vector3();

  // Kept for the whole refinement rather than per pass, and this is what makes
  // the build affordable: the verdict on an edge depends only on its two ends,
  // which never move, so an edge that survives one pass survives all of them.
  // Re-deciding them every pass was nearly half the build. Keyed by number
  // and not by string for the same reason — it ends up holding every edge of
  // the finished mesh, and string keys spend longer being allocated and
  // collected than the test itself takes.
  const edges = new Map<number, number>();

  /** Midpoint vertex of an edge, or -1 when the edge is good enough as it is. */
  const midOf = (i: number, j: number): number => {
    const lo = i < j ? i : j;
    const hi = i < j ? j : i;
    const key = lo * EDGE_KEY + hi;
    const known = edges.get(key);
    if (known !== undefined) return known;

    const a = vertices[lo]!;
    const b = vertices[hi]!;
    const angle = a.angleTo(b);
    const tooLong = angle > MAX_EDGE;
    if (!tooLong && angle <= PAD_MIN_EDGE) {
      edges.set(key, -1);
      return -1;
    }
    // The midpoint is needed before either verdict now, because both the floor
    // and the budget are graded by the pad under it. One lookup answers both.
    midpoint.copy(a).add(b).normalize();
    // A monument's pad and a settlement's paving want the same thing from the
    // mesh — the relief resolved finely enough that a flat surface laid on it
    // meets it — so they share one budget and the stronger claim wins.
    const pad = Math.max(
      flattenWeightAt(midpoint.x, midpoint.y, midpoint.z),
      detailWeightAt(midpoint.x, midpoint.y, midpoint.z),
    );
    if (!tooLong && angle <= floorFor(pad)) {
      edges.set(key, -1);
      return -1;
    }
    const height = reliefAt(midpoint.x, midpoint.y, midpoint.z);
    if (!tooLong && Math.abs(height - (relief[lo]! + relief[hi]!) * 0.5) <= sagFor(pad)) {
      edges.set(key, -1);
      return -1;
    }
    const m = vertices.length;
    vertices.push(midpoint.clone());
    relief.push(height);
    edges.set(key, m);
    return m;
  };

  // Triangles that no longer have a splittable edge are set aside and never
  // looked at again. Most of them settle in the first pass or two, and they are
  // the ones the coastline is made of.
  const settled: number[][] = [];
  let triangles = faces;
  for (let pass = 0; pass < 12; pass++) {
    const next: number[][] = [];
    for (const [a, b, c] of triangles as [number, number, number][]) {
      const ab = midOf(a, b);
      const bc = midOf(b, c);
      const ca = midOf(c, a);
      const split = (ab >= 0 ? 1 : 0) + (bc >= 0 ? 1 : 0) + (ca >= 0 ? 1 : 0);
      if (split === 0) settled.push([a, b, c]);
      else if (split === 3) next.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]);
      else if (split === 1) {
        if (ab >= 0) next.push([a, ab, c], [ab, b, c]);
        else if (bc >= 0) next.push([a, b, bc], [a, bc, c]);
        else next.push([a, b, ca], [ca, b, c]);
      } else if (ab >= 0 && bc >= 0) next.push([a, ab, bc], [ab, b, bc], [a, bc, c]);
      else if (bc >= 0 && ca >= 0) next.push([b, bc, ca], [bc, c, ca], [b, ca, a]);
      else next.push([c, ca, ab], [ca, a, ab], [c, ab, b]);
    }
    if (next.length === 0) return settled;
    triangles = next;
  }
  return settled.concat(triangles);
}

/**
 * How much of the country's own colour survives on top of the biome.
 *
 * Zero would be a physical globe and one is the political one this used to be.
 * The argument for not going to zero is the minimap and the orbit view: a
 * planet where you can see the shape of a country is worth more than one extra
 * degree of realism, and at a quarter the border is a shift in tint that reads
 * from space and is invisible from the ground — which is exactly where each of
 * the two wants to be.
 */
const COUNTRY_TINT = 0.25;

/** Continent colour with a small stable per-country shift, so borders read. */
function paletteFor(world: World): THREE.Color[] {
  return world.countries.map((country) => {
    let hash = 0;
    for (const ch of country.iso) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    const color = new THREE.Color(CONTINENT_COLORS[country.continent] ?? DEFAULT_LAND);
    const hsl = { h: 0, s: 0, l: 0 };
    color.getHSL(hsl);
    color.setHSL(
      hsl.h + (((hash >> 3) % 13) - 6) * 0.004,
      hsl.s,
      hsl.l + (((hash >> 7) % 11) - 5) * 0.017,
    );
    return color;
  });
}

/**
 * The colour of the ground at a point on the unit sphere: the biome, tinted by
 * whose it is.
 *
 * **The land used to be one flat colour per country** — the whole of Spain one
 * green, the whole of Algeria one clay — which is a political map, and a
 * political map is the wrong thing to stand on. `biome.ts` is the one
 * definition of what the ground is made of and this is the only place anything
 * turns that into a colour.
 *
 * The lightness rides the moisture on top of the biome's own colour, so that a
 * biome is a range rather than a swatch and its edges are a gradient rather
 * than a step. Without it the Sahara is one enormous unbroken rectangle of
 * `sand`, which is not what a desert looks like from a plane.
 *
 * `tint` is passed in rather than looked up because the mesh calls this once
 * per triangle — 770,000 times in a single build — and it already knows which
 * ring it is filling. `groundColorAt` is the same law for callers that do not.
 */
const shadeSample = biomeSample();
const shadeHsl = { h: 0, s: 0, l: 0 };

/**
 * The shore, once the ramp under it has decided where one is.
 *
 * `terrain.ts` shapes the coast and this only colours what it shaped, which is
 * the whole reason the two cannot disagree about where a beach is: there is one
 * `shoreFallAt` and the ground either slopes here or it does not.
 *
 * **Not every shore is sand and the world already knows which.** Three things
 * take it away and none of them is a table of coasts:
 *
 * - **The ramp itself.** A bluff coast has almost no ramp to put sand on, so
 *   Norway and Chile keep their rock without anything here naming them.
 * - **Cold.** Above the treeline a shore is shingle and then ice, so the colour
 *   runs from `bone` to `sand` across the same warmth that decides whether
 *   anything grows on it.
 * - **The top of the ramp.** Sand starts a quarter of the way down rather than
 *   at the break of slope, so the bank above it stays whatever the biome is and
 *   the beach reads as a strip on a coast rather than as a rim round a country.
 */
const SHORE_SAND = PALETTE.sand;
/**
 * Warmth a shore needs before it is sand, and it is the strongest of the three
 * gates by a distance.
 *
 * The first version leaned on the ramp's own width and on how rocky the
 * hinterland is, and it painted the Norwegian fjords cream from Bergen to the
 * Arctic — the *exact* uniform band the biome work was done to get rid of. The
 * hinterland is too weak a signal to carry it: measured, the noise puts more
 * high ground behind Mauritania (35) than behind the Sognefjord (48), because
 * this planet's mountains are noise plus a table of ranges and neither of them
 * knows about a coast. Latitude does know. Sand starts at the Atlantic edge of
 * Brittany, is complete through the Mediterranean and the tropics, and there is
 * none of it in Norway, Iceland, Patagonia or Alaska — which is a sentence you
 * can check against an atlas, and the other two gates were not.
 *
 * The ramp underneath is *not* gated by any of this. Every shore on the planet
 * slopes into its water; only some of them are sand.
 */
const SHORE_WARM0 = 0.30;
const SHORE_WARM1 = 0.50;
const shoreColor = new THREE.Color();
const shoreHsl = { h: 0, s: 0, l: 0 };
const shore = shoreSample();

function groundShade(
  ux: number,
  uy: number,
  uz: number,
  elevation: number,
  tint: THREE.Color,
  target: THREE.Color,
): THREE.Color {
  const lat = Math.asin(uy < -1 ? -1 : uy > 1 ? 1 : uy) / DEG;
  const lon = Math.atan2(-uz, ux) / DEG;
  biomeAt(ux, uy, uz, lat, lon, elevation, shadeSample);
  const biome = BIOMES[shadeSample.id];
  target.setHex(biome.color);
  target.getHSL(shadeHsl);
  // Two multipliers on the lightness and they are doing different jobs.
  //
  // Moisture makes a biome a range rather than a swatch, so its edges are a
  // gradient and the Sahara is not one unbroken rectangle of `sand`.
  //
  // Cover darkens ground that has things growing on it, and that one is there
  // for `vegetation.ts` rather than for the land: the scatter can only afford
  // to fill a disc around you, so from the air a forest was a square patch of
  // trees sitting on bare ground and the tile boundary read as a bug. Ground
  // that is already the colour of canopy turns that edge into a change of
  // density instead of a change of surface. It costs nothing — the number is
  // in `BIOMES` and was being ignored.
  target.setHSL(
    shadeHsl.h,
    shadeHsl.s,
    shadeHsl.l * (1.05 - 0.13 * shadeSample.moisture) * (1 - 0.2 * biome.cover),
  );
  target.lerp(tint, COUNTRY_TINT);

  // And the shore on top of the country, not under it: a beach is the same sand
  // whoever it belongs to, and a tint on it would be the political map coming
  // back at exactly the place the eye is looking hardest.
  //
  // Asked only where the ground is *below* its shelf, which is the ramp and
  // nothing else: the shore is the one term in `reliefAt` that is ever negative,
  // so the sign is a free and exact test for whether this triangle is on a shore
  // at all. Without it every one of the 1.2 million asks the index, and the
  // colour costs more than the geometry it is colouring — 1.2 s of a 4.6 s
  // build, measured.
  if (elevation < 0) shoreAt(ux, uy, uz, shore);
  else shore.fall = shore.sand = 0;
  const sand = shore.sand * smoothstep(SHORE_WARM0, SHORE_WARM1, shadeSample.warmth);
  if (sand > 0) {
    // Lightened against whatever it is laid on, because the one place this has
    // to read and cannot rely on hue is a desert coast, where the ground behind
    // the beach is already `sand`.
    shoreColor.setHex(SHORE_SAND).getHSL(shoreHsl);
    shoreColor.setHSL(shoreHsl.h, shoreHsl.s, Math.min(1, shoreHsl.l * 1.06));
    target.lerp(shoreColor, sand * smoothstep(0.25, 0.8, shore.fall));
  }
  return target;
}

/**
 * What colour the land mesh is at a world-space point.
 *
 * The same shape as `groundRadius` and for the same reason: **anything that
 * lays a surface on the land has to meet it, and the only way to meet it
 * exactly is to ask.** A settlement's paving fades into the ground around it, a
 * dirt track is the ground a shade darker — reproduce that colour from
 * `biome.ts` alone and you get the biome right and the country tint wrong,
 * which shows up as a lighter ring at every town in Africa.
 *
 * It is not what `buildLand` calls, because `buildLand` already knows which
 * country's triangle it is filling and a point-in-polygon query per triangle
 * would cost two seconds of the load. Both go through `groundShade`, so there
 * is one law and two ways in.
 *
 * The relief is sampled at the point rather than averaged over a triangle, so
 * against the mesh this can differ by however much the relief moves inside one
 * triangle — which is bounded by `RELIEF_SAG`, three units, and is nothing next
 * to the width of a colour band. `pnpm check` measures the whole residue.
 *
 * **Over water it returns the biome with the default land tint**, because there
 * is no country to take a tint from. That is the honest answer rather than a
 * throw: it is also what the mesh does at a coastal triangle whose centre of
 * mass falls outside its own ring, which is 1.5% of them.
 */
const tintPalettes = new WeakMap<World, THREE.Color[]>();
const defaultTint = new THREE.Color(DEFAULT_LAND);
const groundUnit = new THREE.Vector3();

export function groundColorAt(
  world: World,
  point: THREE.Vector3,
  target: THREE.Color,
): THREE.Color {
  let palette = tintPalettes.get(world);
  if (palette === undefined) {
    palette = paletteFor(world);
    tintPalettes.set(world, palette);
  }
  groundUnit.copy(point).normalize();
  const country = world.countryAtPoint(point);
  const tint = country > 0 ? (palette[country - 1] ?? defaultTint) : defaultTint;
  return groundShade(
    groundUnit.x,
    groundUnit.y,
    groundUnit.z,
    reliefAt(groundUnit.x, groundUnit.y, groundUnit.z),
    tint,
    target,
  );
}

/**
 * Outline width for the planet.
 *
 * `OutlineEffect` scales this by distance, so it is a screen-space width, not a
 * world one. 0.0015 — carried over from when the planet was a single icosphere —
 * came out under a pixel and the coast had no ink line at all, which is half the
 * style gone. 0.005 draws the coastline and the vertical creases of the cliffs
 * without turning the whole globe into a scribble when seen from orbit.
 */
const OUTLINE_THICKNESS = 0.005;

/**
 * How much darker a coastal wall is than the ground on top of it.
 *
 * Named because a second file has to use the same number: `land-flags.ts`
 * darkens a wall's flag colour by exactly this, or a flagged coast comes out
 * with a bright rim where the cliff used to read as rock.
 */
const WALL_SHADE = 0.72;

/**
 * The flag overlay, reached through a dynamic `import()` and not a static one.
 *
 * `flags.ts` pulls in the 2,091 lines of `flag-data.ts`, and this file is in
 * the initial graph — so importing it here would put all 232 flags in front of
 * `countries.bin`, which is the trap `main.ts` writes down about the twelve
 * preloaded chunks. Deferred, it costs nothing until the key is pressed, and by
 * then the chunk is already in the browser's cache because `hud.ts` and
 * `map.ts` share it.
 *
 * `landFlags(world, land)` hands back the layer — one per mesh, whoever asks —
 * which builds itself in slices and then answers `setFade`. `buildLand` leaves
 * the same call on the mesh as `land.userData.flags`, so nothing has to be
 * threaded through `main.ts` for it to be reachable from a console.
 */
export async function landFlags(world: World, mesh: THREE.Mesh): Promise<FlagLayer> {
  const { createFlagLayer } = await import('./land-flags.ts');
  return createFlagLayer(world, mesh);
}

/**
 * The mosaic: the cell a piece of ground belongs to, in world units,
 * flat-to-flat.
 *
 * The reference this look is chasing is an icosphere at detail 40 with every
 * triangle's colour multiplied by a random factor, and from above it reads as
 * a soft mosaic of facets in three or four tones of each green, each facet
 * taking its own band under a low sun. This mesh cannot carry that in its
 * vertices: `MAX_EDGE` is 266 units on flat ground, so a whole town sits inside
 * one triangle in the Sahara and only relief ever refines to `MIN_EDGE`. The
 * cell is therefore a fragment-shader thing — a hex tiling of the surface with
 * every cell hashing to its own tone and its own tilt — laid over whatever
 * colour the vertex already carries. **It multiplies and never restates**: the
 * biome, the country tint, the shore sand and the wall's shade are all still
 * `groundShade`'s, and this is one more factor on top of them, which is why
 * `groundColorAt`'s readers (a town's floor, a road's verge) need not know it
 * exists.
 *
 * Twelve units is 1.8 avatars, against the reference's facets at about 1.5 of
 * its own character; it is also the plot pitch of the kit's tightest region
 * (13), so a town's paving cells and the land's are the same grain and the
 * town is part of the mosaic rather than a plate on it. Human scale, like
 * `LAND_HEIGHT`: it does not move with `PLANET_RADIUS`. `HEX_SUPER` is the
 * second octave — super-cells four across, at half the amplitude — and it is
 * what keeps the mosaic reading from 700 units up, where a 12-unit cell is
 * under two pixels and averages out.
 *
 * `atlas.scene.getObjectByName('land').material.userData.uniforms.atlasMosaic
 * .value = 0` is the A/B: the same program with the tone and the tilt at zero.
 */
export const HEX_CELL = 12;
const HEX_SUPER = 4;

/**
 * How far a cell leans its normal, in degrees, in a direction of its own.
 *
 * The tone alone is under the cel ramp's faintest step and stays a texture;
 * what makes the reference *faceted* is that each facet catches its own band,
 * and the only way to a band is through the normal. `MeshToonMaterial` steps
 * at `dot(n, sun)` of 0.5, 0 and -0.5 — a sun 60, 90 and 120 degrees off the
 * normal — so a lean of six degrees moves a cell across a band edge only when
 * the ground is already within six degrees of one. On a flat plain that is a
 * sun between 24 and 36 degrees up, about fifty minutes twice a day, and the
 * rest of the day every cell of the plain sits in the one band it always had;
 * on a hillside, where the light was already stepping, the step runs along the
 * cells instead of along the mesh's triangles. Ten degrees was tried on the
 * same frames and turned the Sahara at 10:00 into salt-and-pepper; six is the
 * largest lean that leaves the plains alone.
 */
const MOSAIC_TILT = 6;

/** How much of `MOSAIC_LAND`'s span the fine cells carry; the super-cells take the rest. */
const MOSAIC_FINE_SHARE = 2 / 3;

/**
 * The functions the land's fragment stage gets. Dave Hoskins' hash without a
 * sine, because the input is a cell id in the hundreds and `fract(sin(x) *
 * 43758.5)` at that magnitude is whatever the vendor's `sin` does past 2 pi.
 * The hex tiling is the Voronoi of two rectangular lattices, one on
 * half-integers and one on integers, so the id it returns is unique per cell.
 */
const MOSAIC_GLSL = /* glsl */ `
varying vec3 vAtlasPos;
uniform float atlasMosaic;
uniform float atlasFlag;
float atlasHash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
vec3 atlasHash3(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yxz + 33.33);
  return fract((q.xxy + q.yzz) * q.zyx);
}
vec2 atlasHexCell(vec2 p) {
  const vec2 s = vec2(1.0, 1.7320508);
  vec4 c = floor(vec4(p, p - vec2(0.5, 1.0)) / s.xyxy) + 0.5;
  vec4 h = vec4(p - c.xy * s, p - (c.zw + 0.5) * s);
  return dot(h.xy, h.xy) < dot(h.zw, h.zw) ? c.xy : c.zw + 0.5;
}`;

/**
 * How fast the mosaic gets out of the flag's way.
 *
 * The two are the same kind of mark — a factor on the diffuse colour — and a
 * flag under a hex tone is a flag printed on canvas. So the tone and the tilt
 * both go to nothing as the wash comes up, and at twice the blend they are gone
 * by the time it is half laid: at the fade's own ceiling of 0.60 that is 83% of
 * the way up the climb, which is over water and mountains where nobody is
 * looking for a facet. Below the fade the mosaic is exactly what it was.
 */
const MOSAIC_YIELD = 2;

/**
 * Hooks the mosaic, and the flag over it, into the material's own program.
 *
 * After `color_fragment`, so `diffuseColor` already holds the vertex colour and
 * the factor multiplies it; after `normal_fragment_begin`, so the lean is on
 * the normal the toon ramp is about to step. The shadow, fog and light chunks
 * are untouched and run as they always did. The outline pass is untouched too,
 * and for the right reason: `OutlineEffect` builds its own program and this
 * moves no vertex — a colour or a normal is the fill's business alone, where
 * a displaced `transformed` would leave the hull drawn round the old shape.
 *
 * The plane the cells are tiled in is picked by the dominant axis of the
 * position, which on a planet centred at the origin is the local up: three
 * tilings, and the seams where one hands over to the next are cell edges like
 * any other, because every cell's tone is its own anyway. A cell at the seam
 * is stretched by up to root two, which nothing can tell from a cell.
 *
 * **The flag is a second colour attribute and it is not in the program until it
 * exists.** `land-flags.ts` builds `flag` over a second or so of frames the
 * first time the player climbs, and calls `useFlagAttribute` when it is bound;
 * until then the shader has no `attribute vec3 flag` in it, because a declared
 * attribute with nothing bound to it reads whatever the last generic vertex
 * attribute value was. Two programs, and `customProgramCacheKey` says which —
 * Three keys a program on the shader source *plus* that string, and two
 * materials that compile differently and answer the same key get one program
 * between them.
 *
 * The mix is in the square root and not in linear, which is the one line here
 * that is a judgement rather than plumbing. An opacity is a painting operation:
 * mixing two linear colours halfway gives a result darker than either painter
 * would expect, and `DEFAULT_OPACITY`'s whole measurement was taken against a
 * blend in a gamma space. `sqrt` is gamma 2.0 against sRGB's 2.2, four cheap
 * instructions against a `pow`, and the difference between the two is under a
 * byte on flat colour, which is all a flag is.
 */
function mosaic(material: THREE.MeshToonMaterial): void {
  const uniforms = { atlasMosaic: { value: 1 }, atlasFlag: { value: 0 } };
  material.userData.uniforms = uniforms;
  const [low, high] = MOSAIC_LAND;
  const mid = (low + high) / 2;
  const fine = (high - low) * MOSAIC_FINE_SHARE;
  const coarse = (high - low) * (1 - MOSAIC_FINE_SHARE);
  const lean = Math.tan(MOSAIC_TILT * DEG);
  /** Flipped once, by `land-flags.ts`, when the attribute is on the geometry. */
  let flagged = false;
  material.onBeforeCompile = (shader) => {
    shader.uniforms['atlasMosaic'] = uniforms.atlasMosaic;
    shader.uniforms['atlasFlag'] = uniforms.atlasFlag;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\nvarying vec3 vAtlasPos;${
          flagged ? '\nattribute vec3 flag;\nvarying vec3 vAtlasFlag;' : ''
        }`,
      )
      // World space through `modelMatrix`, which is the identity for this mesh
      // and is one multiply a vertex if it ever stops being.
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\n  vAtlasPos = (modelMatrix * vec4(transformed, 1.0)).xyz;${
          flagged ? '\n  vAtlasFlag = flag;' : ''
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\n${MOSAIC_GLSL}${flagged ? '\nvarying vec3 vAtlasFlag;' : ''}`,
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
  vec3 atlasAbs = abs(vAtlasPos);
  vec2 atlasPlane = (atlasAbs.y >= atlasAbs.x && atlasAbs.y >= atlasAbs.z) ? vAtlasPos.xz
    : (atlasAbs.x >= atlasAbs.z ? vAtlasPos.zy : vAtlasPos.xy);
  // A cell smaller than a pixel is noise, especially when its normal changes
  // the cel band. Fade both tone and tilt before that happens, even with B off.
  float atlasFootprint = max(length(dFdx(atlasPlane)), length(dFdy(atlasPlane)));
  float atlasQuiet = (1.0 - min(1.0, atlasFlag * ${MOSAIC_YIELD.toFixed(1)}))
    * (1.0 - smoothstep(${(HEX_CELL * 0.4).toFixed(1)}, ${(HEX_CELL * 1.2).toFixed(1)}, atlasFootprint));
  vec2 atlasCell = atlasHexCell(atlasPlane * ${(1 / HEX_CELL).toFixed(8)});
  vec2 atlasSuper = atlasHexCell(atlasPlane * ${(1 / (HEX_CELL * HEX_SUPER)).toFixed(8)});
  float atlasTone = ${mid.toFixed(5)}
    + (atlasHash(atlasCell) - 0.5) * ${fine.toFixed(5)}
    + (atlasHash(atlasSuper + vec2(0.37, 0.71)) - 0.5) * ${coarse.toFixed(5)};
  diffuseColor.rgb *= mix(1.0, atlasTone, atlasMosaic * atlasQuiet);${
    flagged
      ? /* glsl */ `
  // The flag, in the square root: a wash is a painting operation. A triangle
  // with no flag of its own carries the land's own colour here, so this is the
  // identity for it at every opacity and needs no mask of its own.
  diffuseColor.rgb = mix(sqrt(max(diffuseColor.rgb, 0.0)), sqrt(vAtlasFlag), atlasFlag);
  diffuseColor.rgb *= diffuseColor.rgb;`
      : ''
  }`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        /* glsl */ `#include <normal_fragment_begin>
  {
    // The flag map wants a globe, not a relief: as the flag rises the facet's
    // normal gives way to the sphere's own, so a country reads as one sheet of
    // colour and not a mosaic of lit and unlit hillsides in its own colours.
    // Squared, so the relief holds until the flag is well over half way in.
    vec3 atlasSphere = normalize(mat3(viewMatrix) * normalize(vAtlasPos));
    normal = normalize(mix(normal, atlasSphere, atlasFlag * atlasFlag));
    // A direction of the cell's own, world space into view space by the view
    // matrix alone — the camera carries no scale — then flattened onto the
    // face, so the lean is at most MOSAIC_TILT whatever the hash returned.
    vec3 atlasLean = mat3(viewMatrix) * normalize(atlasHash3(atlasCell) * 2.0 - 1.0);
    atlasLean -= normal * dot(atlasLean, normal);
    normal = normalize(normal + atlasLean * (${lean.toFixed(5)} * atlasMosaic * atlasQuiet));
  }`,
      );
  };
  // Two materials that compile to different programs must not share a cache
  // key, and Three keys on the source plus this.
  material.customProgramCacheKey = () => (flagged ? 'atlas-mosaic-flag' : 'atlas-mosaic');
  material.userData['useFlagAttribute'] = (): void => {
    if (flagged) return;
    flagged = true;
    material.needsUpdate = true;
  };
}

function toonMaterial(): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: createToonRamp(4) });
  material.userData.outlineParameters = { thickness: OUTLINE_THICKNESS, color: [0.11, 0.02, 0.01] };
  mosaic(material);
  return material;
}

/**
 * The land, built from the country outlines themselves: a surface at the ring's
 * height plus its relief, and a vertical cliff dropping to the sea.
 *
 * This is what makes islands possible. It also makes the visible coast and
 * `countryAt` the same data, so a monument snapped to the shore lands on the
 * shore you can see.
 */
export function buildLand(world: World): THREE.Mesh {
  // Idempotent, and normally already done by `loadWorld`. It is repeated here
  // because a mesh built against a different terrain than the one the player
  // walks on is the one failure this whole arrangement exists to prevent.
  prepareTerrain(world.rings, UNITS_PER_DEGREE, (lat, lon) => world.countryAt(lat, lon) !== 0);

  const positions: number[] = [];
  /**
   * Bytes, not floats, and the normal is now built here rather than by
   * `computeVertexNormals`.
   *
   * `vegetation.ts` already did this and the arithmetic is the same one level
   * up: position, normal and colour as `Float32` is 36 bytes a vertex and 108 a
   * triangle, and this mesh is the largest buffer in the project. A normal is a
   * unit vector and a cel colour is one of two dozen palette entries mixed with
   * a biome, so eight bits each costs a quarter of a degree of normal error
   * against a `gradientMap` with four bands in it. The position cannot go: it is
   * a point 16,000 units from the origin and `float32` is already only good to
   * about a thousandth of a unit there.
   *
   * **Scale by 127 and not 128** — `normalized: true` divides a signed byte by
   * 127, so 128 clips every normal that is exactly 1 on an axis, which on a
   * coastal wall is most of them.
   *
   * Dropping `computeVertexNormals` is not a saving of the same kind and it is
   * worth saying which: the mesh is non-indexed, so that call was computing the
   * face normal a second time from the three vertices `emit` had just crossed,
   * and allocating a full `Float32` attribute to put it in. The normal stored
   * here is the same cross product, after the winding flip rather than before
   * it, which is what `computeVertexNormals` was reading off the emitted order.
   */
  const normals: number[] = [];
  const colors: number[] = [];
  /** Which triangles belong to which ring; see `RingSpan` in `land-flags.ts`. */
  const spans: RingSpan[] = [];
  const palette = paletteFor(world);

  const scratch = new THREE.Vector3();
  const up = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const outward = new THREE.Vector3();
  const edge1 = new THREE.Vector3();
  const edge2 = new THREE.Vector3();
  const normal = new THREE.Vector3();

  const top = new THREE.Color();
  const cliff = new THREE.Color();
  const ground = new THREE.Color();

  /**
   * The lakes, densified once.
   *
   * They are rings of `world.rings` like any other — see `LandRing.water` — and
   * everything downstream of this file already reaches them without being told
   * they exist, because `build-lakes.mjs` winds them by the same law the coast
   * obeys. What is left for the mesh to do is the one thing that does not fall
   * out: **take the land away from underneath them.**
   */
  const lakes: Lake[] = (world.rings as LandRing[])
    .filter((ring) => ring.water)
    .map((ring) => ({
      points: ring.points,
      outline: densify(ring.points),
      box: box(ring.points),
      area: ring.area,
    }));

  /**
   * What each land ring has to do about each lake, worked out once.
   *
   * It is a pass of its own because the answer is needed twice and it is the
   * expensive half: two point-in-polygon sweeps per pair, and the pairs are
   * chosen by bounding box so there are 697 of them and not 640,000.
   */
  const land = (world.rings as LandRing[]).filter((ring) => !ring.water);
  const plan = land.map((ring) => {
    const ringBox = box(ring.points);
    const cuts: { lake: Lake; cut: LakeCut }[] = [];
    for (const lake of lakes) {
      if (!overlaps(ringBox, lake.box)) continue;
      const cut = subtractLake(ring.points, lake);
      if (cut.kind !== 'clear') cuts.push({ lake, cut });
    }
    return cuts;
  });

  /**
   * Which ring builds the wall round a lake that is a hole in more than one.
   *
   * The bake keeps only outer rings, so an enclave sits *inside* its neighbour's
   * polygon and a lake in Lesotho is also a lake in South Africa — both cut the
   * hole, because whichever did not would leave its own land over the water, and
   * the two surfaces already coincide there and always have. Two coincident
   * *walls* are different: a wall is four units of visible geometry standing
   * over the waterline, and drawing it twice is a depth tie in the one place on
   * a lake the eye is looking hardest. The smallest ring owns it, which is the
   * same ring `countryAt` would name. A spliced lake needs no such rule: its rim
   * is partitioned between the rings that share it, so each draws its own arc
   * exactly once.
   */
  const wallOwner = new Map<Lake, LandRing>();
  plan.forEach((cuts, index) => {
    for (const { lake, cut } of cuts) {
      if (cut.kind !== 'hole') continue;
      const held = wallOwner.get(lake);
      if (held === undefined || land[index]!.area < held.area) wallOwner.set(lake, land[index]!);
    }
  });

  /** What the splice could not pair up, and what dropping triangles cost instead. */
  let unpaired = 0;
  let droppedFaces = 0;

  /** Appends a triangle, flipping it if its normal disagrees with `facing`. */
  const emit = (
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3,
    facing: THREE.Vector3,
    color: THREE.Color,
  ): void => {
    normal.crossVectors(edge1.subVectors(b, a), edge2.subVectors(c, a));
    // Degenerate triangles draw nothing but carry a meaningless normal, which
    // then shows up in every sanity check. Antarctica makes several: its ring
    // runs along latitude -90, and every point on that line is the same point on
    // the sphere. The length of the cross product is twice the area, and twice
    // the area over the longest edge is the triangle's own height.
    const longest = Math.sqrt(Math.max(
      edge1.lengthSq(),
      edge2.lengthSq(),
      b.distanceToSquared(c),
    ));
    const length = normal.length();
    if (length < MIN_TRIANGLE_HEIGHT * longest) return;
    const flipped = normal.dot(facing) < 0;
    const second = flipped ? c : b;
    const third = flipped ? b : c;
    positions.push(a.x, a.y, a.z, second.x, second.y, second.z, third.x, third.y, third.z);
    // The winding decides the sign: emitting `a, c, b` reverses the cross
    // product, and the normal has to be the one the emitted triangle has.
    const scale = length > 0 ? ((flipped ? -127 : 127) / length) : 0;
    const nx = Math.round(normal.x * scale);
    const ny = Math.round(normal.y * scale);
    const nz = Math.round(normal.z * scale);
    const r = Math.round(color.r * 255);
    const g = Math.round(color.g * 255);
    const b8 = Math.round(color.b * 255);
    for (let v = 0; v < 3; v++) {
      normals.push(nx, ny, nz);
      colors.push(r, g, b8);
    }
  };

  land.forEach((ring, index) => {
    // The lakes, taken out of this ring's coastline before anything is built.
    // A splice changes the outline itself — a bay is not a hole — so it happens
    // on the raw points and *before* `densify`: two countries sharing a border
    // through a lake then hand `densify` the same pair of ends and get the same
    // subdivision, which is the only reason their surfaces still meet.
    let points = ring.points;
    const holes: Lake[] = [];
    const drops: Lake[] = [];
    for (const { lake, cut } of plan[index]!) {
      if (cut.kind === 'hole') {
        holes.push(lake);
        continue;
      }
      if (cut.kind === 'unpaired') {
        unpaired++;
        drops.push(lake);
        continue;
      }
      // Asked again against the coastline as it now stands, not as the plan
      // found it: two lakes on one ring are two cuts, and the second has to see
      // what the first did or it splices against points that are gone.
      const again = subtractLake(points, lake);
      if (again.kind === 'splice') points = again.contour;
      else if (again.kind === 'hole') holes.push(lake);
      else if (again.kind === 'unpaired') {
        unpaired++;
        drops.push(lake);
      }
    }

    const outline = densify(points);
    const holeOutlines = holes.map((lake) => lake.outline);
    const contour = outline.map(([lon, lat]) => new THREE.Vector2(lon!, lat!));

    // `ShapeUtils.triangulateShape` is Three's own ear clipper, so this needs no
    // dependency the project does not already have — and it takes holes, which
    // is what cuts a lake that sits wholly inside one country.
    let faces: number[][];
    try {
      faces = ShapeUtils.triangulateShape(
        contour,
        holeOutlines.map((hole) => hole.map(([lon, lat]) => new THREE.Vector2(lon!, lat!))),
      );
    } catch {
      return;
    }
    if (faces.length === 0) return;

    // The vertex list earcut indexed: the contour, then each hole in turn.
    const all = holeOutlines.length === 0 ? outline : outline.concat(...holeOutlines);
    const unit = all.map(([lon, lat]) => onSphere(lon!, lat!, new THREE.Vector3()));
    const relief = unit.map((p) => reliefAt(p.x, p.y, p.z));
    let triangles = refine(unit, relief, faces);

    // The fallback for a lake this ring could not splice: drop the faces that
    // came out on the water. It leaves a shore ragged at the refinement's own
    // edge length rather than at the outline's, and it is six pairs on the whole
    // planet — `pnpm check` counts what it leaves behind rather than trusting it.
    if (drops.length > 0) {
      const before = triangles.length;
      triangles = triangles.filter(([a, b, c]) => {
        // From `unit` and not from `all`: `refine` grows the vertex array with
        // every midpoint it splits, so the lon/lat list the triangulator was
        // handed no longer covers the indices that come back out of it.
        scratch.copy(unit[a!]!).add(unit[b!]!).add(unit[c!]!).normalize();
        const lat = Math.asin(Math.max(-1, Math.min(1, scratch.y))) / DEG;
        const lon = Math.atan2(-scratch.z, scratch.x) / DEG;
        return !drops.some((lake) => insideRing(lake.points, lon, clampLat(lat)));
      });
      droppedFaces += before - triangles.length;
    }

    // The shelf comes from the ring, the relief from the point. Exactly the sum
    // `world.elevationAt` returns, which is the only reason the player's feet
    // land on this surface rather than somewhere near it.
    const surface = PLANET_RADIUS + ring.height;
    const base = PLANET_RADIUS - EMBED;
    const raised = unit.map((p, i) => p.clone().multiplyScalar(surface + relief[i]!));

    const tint = palette[ring.country - 1]!;

    // Where this ring's triangles start, so `land-flags.ts` can find them
    // again. It is two integers a ring — 2,849 pairs against the 2.15 million
    // a country index per triangle would have cost — and it is possible at all
    // because the buffer is already grouped: a ring's surface, then the wall
    // under its boundary, then the next ring.
    const surfaceFrom = positions.length / 9;

    for (const [a, b, c] of triangles as [number, number, number][]) {
      // The biome is sampled once per triangle, at its centre. Per vertex would
      // be three times the cost for a mesh that is flat-shaded anyway: one
      // normal per face is what gives the facets, so one colour per face is the
      // resolution the surface actually has.
      const ua = unit[a]!;
      const ub = unit[b]!;
      const uc = unit[c]!;
      scratch.set(ua.x + ub.x + uc.x, ua.y + ub.y + uc.y, ua.z + ub.z + uc.z).normalize();
      groundShade(
        scratch.x,
        scratch.y,
        scratch.z,
        (relief[a]! + relief[b]! + relief[c]!) / 3,
        tint,
        ground,
      );
      emit(raised[a]!, raised[b]!, raised[c]!, ua, ground);
    }

    // The cliff, one quad per boundary edge. The outline was densified before
    // triangulating, so these edges are exactly the boundary of the surface
    // above and the two meet with no gap — including where the relief lifts
    // the shoreline, since the wall is built from the raised points themselves.
    //
    // **A lake's rim is a boundary like any other**, and the loop below runs
    // over every one this ring has: the coastline first, then each hole. The
    // sign needs no case — a hole is wound so that the land is on the right of
    // `a -> b` exactly as a coastline is, so `cross(up, b - a)` comes out
    // pointing at the water either way. That is the whole of what
    // `build-lakes.mjs` bought by reversing the winding, and getting it wrong
    // would build every lake's wall facing out into the country, where it is
    // invisible, which is the coastal version of this failure word for word.
    const wallFrom = positions.length / 9;
    const boundaries: [number, number][] = [[0, outline.length]];
    let cursor = outline.length;
    holes.forEach((lake, k) => {
      const length = holeOutlines[k]!.length;
      if (wallOwner.get(lake) === ring) boundaries.push([cursor, length]);
      cursor += length;
    });

    for (const [start, count] of boundaries) {
      for (let n = 0; n < count; n++) {
        const i = start + n;
        const j = start + ((n + 1) % count);
        const topA = raised[i]!;
        const topB = raised[j]!;
        const baseA = scratch.copy(unit[i]!).multiplyScalar(base).clone();
        const baseB = unit[j]!.clone().multiplyScalar(base);

        // The bake winds every ring so that the land is on the right of a -> b.
        // Outward is therefore cross(up, b - a) on a right-handed planet. The
        // reverse looks just as plausible and builds every cliff facing inland,
        // where it is invisible, so `pnpm check` steps off each wall along its own
        // normal and asserts it lands in the water.
        up.copy(unit[i]!);
        dir.subVectors(topB, topA);
        outward.crossVectors(up, dir).normalize();

        // The cliff is the ground above it a shade down. It reads as rock before
        // the light even touches it, and it keeps the coast legible from above —
        // and taking the shade from the biome rather than from the country is
        // what makes a Saharan coast a sand cliff and a Norwegian one grey.
        groundShade(up.x, up.y, up.z, relief[i]!, tint, cliff).multiplyScalar(WALL_SHADE);

        emit(topA, baseA, baseB, outward, cliff);
        emit(topA, baseB, topB, outward, cliff);
      }
    }

    spans.push({
      ring,
      surface: [surfaceFrom, wallFrom],
      wall: [wallFrom, positions.length / 9],
    });
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  // One normal per face, written three times: non-indexed on purpose, because
  // that is what gives flat facets. Smoothing them would dissolve the cel bands.
  geometry.setAttribute('normal', new THREE.Int8BufferAttribute(normals, 3, true));
  geometry.setAttribute('color', new THREE.Uint8BufferAttribute(colors, 3, true));
  geometry.computeBoundingSphere();

  const mesh = new THREE.Mesh(geometry, toonMaterial());
  mesh.name = 'land';
  // Receives the sun's cast shadows and never casts them: a shadow pass over
  // 2.15 M triangles is a second draw of the whole planet, and what stands on
  // the land is what the map is for. See `sun.ts`.
  mesh.receiveShadow = true;
  // Where every ring's triangles are, and the shade its wall took, which is all
  // `land-flags.ts` needs to paint a flag over any of them. Kilobytes.
  mesh.userData['landFlags'] = { spans, wallShade: WALL_SHADE } satisfies LandFlagData;
  // The layer, on the mesh rather than threaded through `main.ts`, so that
  // `atlas.scene.getObjectByName('land').userData.flags()` works with no wiring
  // at all. One per mesh however it is reached; `main.ts` publishes the same
  // one as `atlas.flags`.
  mesh.userData['flags'] = (): Promise<FlagLayer> => landFlags(world, mesh);
  // What the lakes cost and what the splice could not do, on the mesh rather
  // than in a log line, because `pnpm check` has to be able to fail on it.
  mesh.userData['lakes'] = {
    count: lakes.length,
    holes: plan.reduce((n, cuts) => n + cuts.filter((c) => c.cut.kind === 'hole').length, 0),
    splices: plan.reduce((n, cuts) => n + cuts.filter((c) => c.cut.kind === 'splice').length, 0),
    unpaired,
    droppedFaces,
  };
  return mesh;
}

/** Ground height (distance to centre) under an arbitrary point. */
export function groundRadius(world: World, point: THREE.Vector3): number {
  return PLANET_RADIUS + world.elevationAt(point);
}

/**
 * How far off an edge to step to ask what is on the other side of it.
 *
 * The same 8 units the cliff check and the shore index use, and the same
 * limitation: where the land or the channel beside it is thinner than the probe
 * the answer is wrong, which `pnpm check` measures at about 0.3% of walls.
 */
const COAST_PROBE = 8;

/**
 * Which edges of the outlines have sea on their outward side.
 *
 * **The rings are country outlines, so a boundary is not a coastline**, and
 * three separate things in this project need to know which is which: the shore
 * index in `terrain.ts` (so a distance-to-water does not dig a trench down the
 * Rhine), `borders.ts` (so a frontier is drawn and a coast is not) and now the
 * sea (so the surf does not run along the Rhine either). Each of them was
 * answering it the same way — step off the edge along its own outward normal
 * and ask `countryAt` — and each was paying **366 ms** of point-in-polygon for
 * the answer. This is that answer, computed once and memoised on the world.
 *
 * Land is on the right of `a -> b`, so outward is `cross(up, b - a)`. That sign
 * is tied to the planet's handedness and flipped with it; `pnpm check` asserts
 * it a third way, by walking in from the water and requiring the ground to rise.
 *
 * A `Uint8Array` per ring, one byte per point, 1 where the edge leaving that
 * point faces the sea. Degenerate edges — Antarctica's ring holds 258
 * consecutive points at exactly lat -90 — are 0, because they are not an edge.
 */
const coastCache = new WeakMap<World, Uint8Array[]>();

export function coastEdges(world: World): Uint8Array[] {
  const cached = coastCache.get(world);
  if (cached !== undefined) return cached;

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const mid = new THREE.Vector3();
  const along = new THREE.Vector3();
  const outward = new THREE.Vector3();
  const probe = new THREE.Vector3();

  const flags = (world.rings as LandRing[]).map((ring) => {
    const points = ring.points;
    const seaward = new Uint8Array(points.length);
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      onSphere(points[i]![0]!, points[i]![1]!, a);
      onSphere(points[j]![0]!, points[j]![1]!, b);
      if (a.angleTo(b) * PLANET_RADIUS < 0.001) continue;
      mid.copy(a).add(b).normalize();
      along.subVectors(b, a).normalize();
      outward.crossVectors(mid, along).normalize();
      probe.copy(mid).addScaledVector(outward, COAST_PROBE / PLANET_RADIUS).normalize();
      const lat = Math.asin(Math.max(-1, Math.min(1, probe.y))) / DEG;
      const lon = Math.atan2(-probe.z, probe.x) / DEG;
      if (world.countryAt(lat, lon) === 0) seaward[i] = 1;
    }
    return seaward;
  });

  coastCache.set(world, flags);
  return flags;
}
