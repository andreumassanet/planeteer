// Settlements as the relief sees them: places the mesh must resolve finely
// (detail sites), and the valley a steep built town opens round itself.
//
// A town on a mountainside would be a handful of loose terraces, and levelling
// the ground under it a gash in the mountain. So a built town whose ground is
// steep multiplies the relief's departure from the town's own level by a factor
// that is `VALLEY_FLOOR` inside `VALLEY_CORE` radii and grows as
// `1 - (1 - VALLEY_FLOOR) * core / r` beyond, the one shape whose `r * f(r)`
// grows at exactly one, so no slope out there is steeper than the mountain's
// own. What the land is short of is handed back between `VALLEY_FADE_FROM` and
// `VALLEY_FADE_TO` radii.

import { latOf, lonOf, toUnit } from '../sphere.ts';
import { DEG, SHORE_RAMP, SITE_CELL, SITE_COLS, SITE_ROWS } from './constants.ts';
import { shoreDistance } from './coast-field.ts';
import { clamp, smoothstep } from './noise.ts';
import { queriesStarted } from './queries.ts';
import { rawRelief, rawReliefAt } from './raw-relief.ts';
import { scale } from './scale.ts';

let detailDirection: Float64Array | null = null;
let detailReach: Float64Array | null = null;
let detailGrid: number[][] | null = null;

/** How far past its own radius a settlement keeps the mesh fine. */
const DETAIL_MARGIN = 1.6;

/**
 * A place the mesh resolves finely though the ground stays as it is. A
 * settlement lays paving from the exact relief while the land around it is a
 * triangulation carrying up to the error budget, and in flat country a whole
 * town fits in one triangle, so the triangle's edge would draw a line through
 * the paving.
 */
export interface DetailSite {
  lat: number;
  lon: number;
  /** How far out the mesh stays fine, in world units: `places.detailRadiusOf(place)`. */
  radius: number;
  /**
   * The radius a built town stands in, `radiusOf(place)`, for its valley — or
   * 0 or absent for a place that is not built, which the relief leaves alone.
   * See `VALLEY_FLOOR`.
   */
  valley?: number;
}

/**
 * Declares them, once, before anything asks about the ground. The mesh is built
 * once, and terrain that changed afterwards would no longer match what is drawn.
 */
export function setDetailSites(sites: readonly DetailSite[]): void {
  if (queriesStarted()) {
    throw new Error('terrain: setDetailSites after the relief was queried');
  }
  if (detailDirection !== null) throw new Error('terrain: setDetailSites called twice');
  const directions = new Float64Array(sites.length * 3);
  const reach = new Float64Array(sites.length);
  const valleys = new Float64Array(sites.length);
  sites.forEach((site, i) => {
    toUnit(site.lat, site.lon, directions, i * 3);
    reach[i] = Math.max(0, site.radius) * DETAIL_MARGIN;
    valleys[i] = Math.max(0, site.valley ?? 0);
  });
  detailDirection = directions;
  detailReach = reach;
  detailValley = valleys;
}

const VALLEY_FLOOR = 0.15;
/** How far the floor of the valley runs, in town radii. */
const VALLEY_CORE = 1.1;
/** Where the land is handed back what the valley took, in town radii. */
const VALLEY_FADE_FROM = 3;
const VALLEY_FADE_TO = 8;
/**
 * How steep a town's ground has to be to open a valley: the worst fall from its
 * centre to its rim, over the rim's distance. A third is about 18 degrees, where
 * a cell of a square starts to be cut to a different level from its neighbour;
 * plains are left as they were.
 */
const VALLEY_MIN_GRADE = 1 / 3;
/** How many bearings `buildValleys` walks out to a town's rim to measure it. */
const VALLEY_PROBES = 12;

let detailValley: Float64Array | null = null;
let valleyDirection: Float64Array | null = null;
let valleyRadius: Float64Array | null = null;
let valleyLevel: Float64Array | null = null;
let valleyGrid: number[][] | null = null;

/**
 * Picks the towns that open a valley and works out each one's level, on the
 * first query: the relief at the town's centre, and whether any of
 * `VALLEY_PROBES` points on its rim falls or rises from it by more than
 * `VALLEY_MIN_GRADE`. Registered in the cells their whole reach touches.
 */
export function buildValleys(): void {
  const directions = detailDirection;
  const valleys = detailValley;
  if (directions === null || valleys === null) return;
  const kept: number[] = [];
  const levels: number[] = [];
  const radii: number[] = [];
  for (let i = 0; i < valleys.length; i++) {
    const radius = valleys[i]!;
    if (!(radius > 0)) continue;
    const x = directions[i * 3]!;
    const y = directions[i * 3 + 1]!;
    const z = directions[i * 3 + 2]!;
    const level = rawReliefAt(x, y, z);
    // A tangent frame, as `beginPads` builds one for the pads.
    let nx = -x * y;
    let ny = 1 - y * y;
    let nz = -z * y;
    let length = Math.hypot(nx, ny, nz);
    if (length < 1e-9) {
      nx = 1 - x * x;
      ny = -x * y;
      nz = -x * z;
      length = Math.hypot(nx, ny, nz) || 1;
    }
    nx /= length;
    ny /= length;
    nz /= length;
    const ax = ny * z - nz * y;
    const ay = nz * x - nx * z;
    const az = nx * y - ny * x;
    const angle = radius / scale.unitsPerRadian;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    let steepest = 0;
    for (let p = 0; p < VALLEY_PROBES; p++) {
      const bearing = (p / VALLEY_PROBES) * 2 * Math.PI;
      const cb = Math.cos(bearing);
      const sb = Math.sin(bearing);
      const fall = Math.abs(rawReliefAt(
        x * cosine + (nx * cb + ax * sb) * sine,
        y * cosine + (ny * cb + ay * sb) * sine,
        z * cosine + (nz * cb + az * sb) * sine,
      ) - level) / radius;
      if (fall > steepest) steepest = fall;
    }
    if (steepest < VALLEY_MIN_GRADE) continue;
    kept.push(i);
    levels.push(level);
    radii.push(radius);
  }
  const count = kept.length;
  const direction = new Float64Array(count * 3);
  kept.forEach((i, k) => {
    direction[k * 3] = directions[i * 3]!;
    direction[k * 3 + 1] = directions[i * 3 + 1]!;
    direction[k * 3 + 2] = directions[i * 3 + 2]!;
  });
  valleyDirection = direction;
  valleyRadius = Float64Array.from(radii);
  valleyLevel = Float64Array.from(levels);
  const grid: number[][] = Array.from({ length: SITE_COLS * SITE_ROWS }, () => []);
  for (let k = 0; k < count; k++) {
    const lat = latOf(direction[k * 3 + 1]!);
    const lon = lonOf(direction[k * 3]!, direction[k * 3 + 2]!);
    const span = (radii[k]! * VALLEY_FADE_TO) / scale.unitsPerRadian / DEG;
    const lonSpan = Math.min(180, span / Math.max(0.02, Math.cos(lat * DEG)));
    const c0 = Math.floor((lon - lonSpan + 180) / SITE_CELL);
    const c1 = Math.floor((lon + lonSpan + 180) / SITE_CELL);
    const r0 = Math.max(0, Math.floor((90 - lat - span) / SITE_CELL));
    const r1 = Math.min(SITE_ROWS - 1, Math.floor((90 - lat + span) / SITE_CELL));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) grid[r * SITE_COLS + (((c % SITE_COLS) + SITE_COLS) % SITE_COLS)]!.push(k);
    }
  }
  valleyGrid = grid;
}

/**
 * The relief with the valleys opened in it, given the noise's own answer.
 *
 * Where several valleys reach one point, each asks for its own level with its
 * own strength `1 - f`; the level taken is their mean weighted by the fourth
 * power of the strengths, so inside one town's floor that town's level wins, and
 * the strength is the strongest of them. A valley may cut the land down anywhere
 * but may raise it only as far from the sea as the shore ramp allows, so a coast
 * below a town keeps its beach.
 */
export function valleyed(x: number, y: number, z: number, lat: number, lon: number, land: number): number {
  const grid = valleyGrid;
  const directions = valleyDirection;
  const radii = valleyRadius;
  const levels = valleyLevel;
  if (grid === null || directions === null || radii === null || levels === null) return land;
  const row = clamp(Math.floor((90 - lat) / SITE_CELL), 0, SITE_ROWS - 1);
  const col = (((Math.floor((lon + 180) / SITE_CELL)) % SITE_COLS) + SITE_COLS) % SITE_COLS;
  const cell = grid[row * SITE_COLS + col]!;
  if (cell.length === 0) return land;
  let strongest = 0;
  let sum = 0;
  let weights = 0;
  for (const k of cell) {
    const dot = x * directions[k * 3]! + y * directions[k * 3 + 1]! + z * directions[k * 3 + 2]!;
    const distance = Math.acos(clamp(dot, -1, 1)) * scale.unitsPerRadian;
    const radius = radii[k]!;
    if (distance >= radius * VALLEY_FADE_TO) continue;
    const core = radius * VALLEY_CORE;
    const f = distance < core ? VALLEY_FLOOR : 1 - (1 - VALLEY_FLOOR) * (core / distance);
    const fade = smoothstep(radius * VALLEY_FADE_FROM, radius * VALLEY_FADE_TO, distance);
    const strength = 1 - (f + (1 - f) * fade);
    if (strength <= 0) continue;
    const w = strength * strength * strength * strength;
    sum += w * levels[k]!;
    weights += w;
    if (strength > strongest) strongest = strength;
  }
  if (weights === 0) return land;
  let change = (sum / weights - land) * strongest;
  if (change > 0) change *= smoothstep(0, SHORE_RAMP, shoreDistance(lat, lon));
  return land + change;
}

/** The relief with the valleys opened and before any monument flattens it: the ground a pad is levelled against. */
export function openReliefAt(x: number, y: number, z: number): number {
  const lat = latOf(y);
  const lon = lonOf(x, z);
  return valleyed(x, y, z, lat, lon, rawRelief(x, y, z, lat, lon));
}

/**
 * Buckets the detail sites, on the first query rather than in the setter: the
 * setter runs before `prepareTerrain` has fixed the scale that turns a radius in
 * units into a span in degrees.
 */
function buildDetailGrid(): number[][] {
  const directions = detailDirection!;
  const reach = detailReach!;
  const grid: number[][] = Array.from({ length: SITE_COLS * SITE_ROWS }, () => []);
  for (let i = 0; i < reach.length; i++) {
    const y = directions[i * 3 + 1]!;
    const lat = latOf(y);
    const lon = lonOf(directions[i * 3]!, directions[i * 3 + 2]!);
    // Registered in every cell its disc touches, so a query only ever looks at
    // the one cell it is in. A reach of at most a few tenths of a degree
    // against four-degree cells means that is nearly always one cell.
    const span = reach[i]! / scale.unitsPerRadian / DEG;
    const lonSpan = Math.min(180, span / Math.max(0.02, Math.cos(lat * DEG)));
    const c0 = Math.floor((lon - lonSpan + 180) / SITE_CELL);
    const c1 = Math.floor((lon + lonSpan + 180) / SITE_CELL);
    const r0 = Math.max(0, Math.floor((90 - lat - span) / SITE_CELL));
    const r1 = Math.min(SITE_ROWS - 1, Math.floor((90 - lat + span) / SITE_CELL));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        grid[r * SITE_COLS + (((c % SITE_COLS) + SITE_COLS) % SITE_COLS)]!.push(i);
      }
    }
  }
  return grid;
}

/** 1 inside a settlement, tapering to 0 at its margin, 0 everywhere else. */
export function detailWeightAt(x: number, y: number, z: number): number {
  if (detailDirection === null) return 0;
  const grid = detailGrid ?? (detailGrid = buildDetailGrid());
  const lat = latOf(y);
  const lon = lonOf(x, z);
  const cell =
    Math.min(SITE_ROWS - 1, Math.max(0, Math.floor((90 - lat) / SITE_CELL))) * SITE_COLS +
    (((Math.floor((lon + 180) / SITE_CELL) % SITE_COLS) + SITE_COLS) % SITE_COLS);
  const here = grid[cell]!;
  if (here.length === 0) return 0;
  const directions = detailDirection;
  const reach = detailReach!;
  let best = 0;
  for (const i of here) {
    const dot =
      x * directions[i * 3]! + y * directions[i * 3 + 1]! + z * directions[i * 3 + 2]!;
    const distance = Math.acos(dot < -1 ? -1 : dot > 1 ? 1 : dot) * scale.unitsPerRadian;
    const r = reach[i]!;
    if (distance >= r) continue;
    const core = r / DETAIL_MARGIN;
    const t = 1 - Math.max(0, (distance - core) / (r - core));
    const eased = t * t * (3 - 2 * t);
    if (eased > best) best = eased;
    if (best >= 0.999) break;
  }
  return best;
}
