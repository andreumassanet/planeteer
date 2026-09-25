/**
 * The ground a landmark takes: its plan, and what keeps off it.
 *
 * **A landmark was a disc, and the disc was the platform.** Every question the
 * world asked about a monument's ground — how much the relief is levelled, what
 * a town leaves unbuilt, where a tree may not grow — was asked of one circle,
 * the model's declared `footprint`, which is the radius the contract holds its
 * *furthest* vertex to. For a square model that is a fair answer. For most of
 * them it is not: the Alhambra is 94 units long and 18 deep and stood in the
 * middle of a level disc 136 across; Tower Bridge, the Charles Bridge and the
 * Brandenburg Gate are a line with a circle of empty ground round it. What a
 * player saw was the circle, not the building.
 *
 * So a landmark carries its **plan**: the box its model's own triangles stand
 * in, in the model's own north-up frame, measured by `build-monuments.ts` when
 * it bakes the placement (`plan` in `monuments.json`). Everything here is a
 * distance from the ground that box and the footprint's disc both hold (see
 * `PlanShape`), and a site with no plan — a landmark with no model yet, or a
 * hand-written site — falls back to the old disc of its footprint, which is
 * the same function with a box of no bounds.
 *
 * **The frame is the town's** (`townFrame` in `scenery/grid.ts`) **and the
 * model's** (`placement.ts`): `x` along `up x north`, `z` along north, both on
 * the tangent plane at the landmark. A direction `p` on the unit sphere is at
 * `(R p.across, R p.north)` there, which is exact to the tenth of a unit out to
 * a thousand units at this radius and is what `settlements.ts` already does.
 *
 * Node-safe and free of Three, so the bakes, the checks and `terrain.ts` read
 * it as they are.
 */
import { MAX_FOOTPRINT } from './monuments/contract.ts';
import { latOf, lonOf, unitAt } from './sphere.ts';
import type { XYZ } from './sphere.ts';

/** The box a model stands in, in its own frame: `[x0, x1, z0, z1]`, world units. */
export type Plan = readonly [number, number, number, number];

/** Where a landmark stands and what it takes: a row of `monuments.json` is one. */
export interface LandmarkSite {
  lat: number;
  lon: number;
  /** The model's footprint radius; the contract's widest where absent. */
  footprint?: number;
  /** The model's plan; the footprint's disc where absent. */
  plan?: Plan;
}

/**
 * Ground kept clear round a landmark's plan, in world units: no building, no
 * gate, no carriageway. Eight is a street and its two pavements — what a town
 * leaves between the landmark and its first house, and a road between the
 * landmark and its kerb.
 */
export const LANDMARK_KEEP = 8;

/**
 * A plan as the ground it holds: the box, and the footprint's disc about the
 * landmark's own point. **The model is inside both** — the box by measurement,
 * the disc by contract — so the ground it stands on is their intersection,
 * and that is tighter than either: a square box's corners are empty wherever
 * the model is round (the Colosseum, Mount Fuji), and the disc is empty
 * wherever it is long (the Alhambra, every bridge). A site with no plan has an
 * unbounded box, and its ground is the disc alone, which is what every
 * landmark's was.
 */
export interface PlanShape {
  cx: number;
  cz: number;
  hx: number;
  hz: number;
  /** The footprint's radius, about `(0, 0)`. */
  radius: number;
}

export function planShape(site: { footprint?: number; plan?: Plan }): PlanShape {
  const footprint = site.footprint;
  const radius = footprint === undefined || !(footprint > 0) ? MAX_FOOTPRINT : Math.min(footprint, MAX_FOOTPRINT);
  const plan = site.plan;
  if (plan === undefined) return { cx: 0, cz: 0, hx: Infinity, hz: Infinity, radius };
  return { cx: (plan[0] + plan[1]) / 2, cz: (plan[2] + plan[3]) / 2, hx: (plan[1] - plan[0]) / 2, hz: (plan[3] - plan[2]) / 2, radius };
}

/**
 * How far `(x, z)` in the landmark's frame is outside its plan; 0 or less
 * inside it. The larger of the distances to the box and to the disc, which is
 * exact inside and on every side and a little short of the truth off a corner
 * the disc cuts — so what is kept off it is kept off by a hair more, never less.
 */
export function planGap(shape: PlanShape, x: number, z: number): number {
  const dx = Math.max(Math.abs(x - shape.cx) - shape.hx, 0);
  const dz = Math.max(Math.abs(z - shape.cz) - shape.hz, 0);
  return Math.max(Math.hypot(dx, dz), Math.hypot(x, z) - shape.radius);
}

/**
 * The gap between the plan and an axis-aligned box in the same frame, 0 or
 * less where they touch, on the same terms as `planGap`. A town's cell asks
 * this, in a frame that is the town's and not the landmark's; the two are
 * north-up about points a few hundred units apart and turn by well under a
 * degree against each other, which `LANDMARK_KEEP` swallows.
 */
export function planGapToBox(shape: PlanShape, x0: number, x1: number, z0: number, z1: number): number {
  const dx = Math.max(x0 - (shape.cx + shape.hx), shape.cx - shape.hx - x1, 0);
  const dz = Math.max(z0 - (shape.cz + shape.hz), shape.cz - shape.hz - z1, 0);
  const ox = Math.max(x0, 0, -x1);
  const oz = Math.max(z0, 0, -z1);
  return Math.max(Math.hypot(dx, dz), Math.hypot(ox, oz) - shape.radius);
}

/** The furthest the plan reaches from the landmark's own point, in world units. */
export function planReach(shape: PlanShape): number {
  return Math.min(Math.hypot(Math.abs(shape.cx) + shape.hx, Math.abs(shape.cz) + shape.hz), shape.radius);
}

/**
 * How far along a ray from the landmark's point the plan reaches: the
 * distance to where it leaves the box or the disc along `(dx, dz)`, a unit
 * vector. The skirt of `terrain.ts`'s pad is probed this far out plus its own
 * length.
 */
export function planExtent(shape: PlanShape, dx: number, dz: number): number {
  // The box's own centre may be off the point; halve the step onto its edge.
  let t = 0;
  for (let step = 64; step >= 1 / 16; step /= 2) {
    while (t + step <= shape.radius && Math.abs((t + step) * dx - shape.cx) <= shape.hx && Math.abs((t + step) * dz - shape.cz) <= shape.hz) t += step;
  }
  return t;
}

/**
 * The tangent frame at a unit direction, `across = up x north`: the same pair
 * `townFrame` builds with Three, written out for a caller without it.
 */
export function landmarkFrame(up: XYZ, across: XYZ, north: XYZ): void {
  let nx = -up.x * up.y;
  let ny = 1 - up.y * up.y;
  let nz = -up.z * up.y;
  let length = Math.hypot(nx, ny, nz);
  if (length < 1e-9) {
    nx = 1 - up.x * up.x;
    ny = -up.x * up.y;
    nz = -up.x * up.z;
    length = Math.hypot(nx, ny, nz) || 1;
  }
  north.x = nx / length;
  north.y = ny / length;
  north.z = nz / length;
  across.x = up.y * north.z - up.z * north.y;
  across.y = up.z * north.x - up.x * north.z;
  across.z = up.x * north.y - up.y * north.x;
  const a = Math.hypot(across.x, across.y, across.z) || 1;
  across.x /= a;
  across.y /= a;
  across.z /= a;
}

// ---------------------------------------------------------------------------
// Every landmark, for the questions the road bake and its check ask
// ---------------------------------------------------------------------------

/** Degrees a cell of the index, and so the furthest a query is looked up. */
const CELL = 2;
const COLS = Math.round(360 / CELL);
const ROWS = Math.round(180 / CELL);

interface Indexed {
  up: XYZ;
  across: XYZ;
  north: XYZ;
  shape: PlanShape;
  /** The cosine of the angle past which nothing of it is within `reach` of a point. */
  cosReach: number;
}

let indexed: Indexed[] = [];
let cells: Indexed[][] | null = null;
let radius = 1;

/**
 * Registers the landmarks the road bake and `pnpm check` keep a carriageway
 * off, once, with the planet's radius. The game never asks: its roads are
 * baked, and the town and the pad read the placements they are handed.
 */
export function setLandmarks(sites: readonly LandmarkSite[], planetRadius: number): void {
  radius = planetRadius;
  indexed = sites.map((site) => {
    const up = unitAt(site.lat, site.lon, { x: 0, y: 0, z: 0 });
    const across = { x: 0, y: 0, z: 0 };
    const north = { x: 0, y: 0, z: 0 };
    landmarkFrame(up, across, north);
    const shape = planShape(site);
    return { up, across, north, shape, cosReach: Math.cos((planReach(shape) + 4 * LANDMARK_KEEP) / planetRadius) };
  });
  cells = Array.from({ length: COLS * ROWS }, () => []);
  const reachDegrees = Math.max(0, ...indexed.map((site) => Math.acos(site.cosReach) * (180 / Math.PI)));
  for (const site of indexed) {
    const lat = latOf(site.up.y);
    const lon = lonOf(site.up.x, site.up.z);
    const spanLat = Math.ceil(reachDegrees / CELL) + 1;
    const spanLon = Math.min(COLS, Math.ceil(reachDegrees / CELL / Math.max(0.02, Math.cos(lat * (Math.PI / 180)))) + 1);
    const row = Math.floor((90 - lat) / CELL);
    const col = Math.floor((lon + 180) / CELL);
    for (let r = Math.max(0, row - spanLat); r <= Math.min(ROWS - 1, row + spanLat); r++) {
      for (let c = col - spanLon; c <= col + spanLon; c++) cells[r * COLS + (((c % COLS) + COLS) % COLS)]!.push(site);
    }
  }
}

/**
 * How far a point on the unit sphere is from the nearest registered
 * landmark's plan, in world units, looking no further than `limit` past it;
 * Infinity where none is that near or none is registered.
 */
export function landmarkGap(p: XYZ, limit = 4 * LANDMARK_KEEP): number {
  if (cells === null) return Infinity;
  const lat = latOf(p.y);
  const lon = lonOf(p.x, p.z);
  const row = Math.min(ROWS - 1, Math.max(0, Math.floor((90 - lat) / CELL)));
  const col = Math.min(COLS - 1, Math.max(0, Math.floor((lon + 180) / CELL)));
  let best = Infinity;
  for (const site of cells[row * COLS + col]!) {
    const dot = p.x * site.up.x + p.y * site.up.y + p.z * site.up.z;
    if (dot < site.cosReach) continue;
    const x = (p.x * site.across.x + p.y * site.across.y + p.z * site.across.z) * radius;
    const z = (p.x * site.north.x + p.y * site.north.y + p.z * site.north.z) * radius;
    const gap = planGap(site.shape, x, z);
    if (gap < best) best = gap;
  }
  return best <= limit ? best : Infinity;
}

/**
 * Every registered landmark whose plan may come within `reach` of a point on
 * the unit sphere, handed to `visit` with its direction and plan. For a
 * caller that measures in a frame of its own — a town's, whose cells and
 * gates are boxes and points in it.
 */
export function eachLandmarkNear(p: XYZ, reach: number, visit: (up: XYZ, shape: PlanShape) => void): void {
  for (const site of indexed) {
    const dot = p.x * site.up.x + p.y * site.up.y + p.z * site.up.z;
    if (dot < Math.cos((planReach(site.shape) + reach) / radius)) continue;
    visit(site.up, site.shape);
  }
}
