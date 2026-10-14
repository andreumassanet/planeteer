// Monument pads: level ground under a landmark, and the skirt that hands the
// land back. The pads live in the relief rather than in `placement.ts` for the
// same reason the relief does: the mesh is built from `reliefAt` and the
// player's feet go to the same number, and a pad only one of them knew about is
// the disagreement the terrain exists to prevent.

import { landmarkFrame, planExtent, planGap, planReach, planShape } from '../landmark-ground.ts';
import type { Plan, PlanShape } from '../landmark-ground.ts';
import { latOf, lonOf, toUnit, unitAt } from '../sphere.ts';
import { DEG, LAND_SHELF, SHORE_LIP, SITE_CELL, SITE_COLS, SITE_ROWS } from './constants.ts';
import { clamp, smoothstep } from './noise.ts';
import { ensureQueries, queriesStarted } from './queries.ts';
import { openReliefAt } from './town-sites.ts';
import { scale } from './scale.ts';

/**
 * Level ground kept outside the model's own edge, world units. The pad is a
 * level disc and the mesh is triangles, so a triangle with one corner inside
 * the disc and the rest on the skirt cuts across the lip and dips under the
 * model. The error test only bounds edges, so the defence is this distance plus
 * the shorter edges the mesh builds near the rim.
 */
export const PAD_MARGIN = 20;

/**
 * How far the skirt takes to reach its full slope, world units. The pad ends in
 * a break of slope, which the pen inks like a cut bench, but a break from level
 * to 60 degrees in one triangle is a step, so the skirt opens quadratically over
 * this distance and then runs straight.
 */
const SKIRT_LIP = 30;

/**
 * How much dry ground past its plan a landmark's pad needs to meet the shore as
 * a slope: its level core, `PAD_MARGIN`, and the skirt's first `SKIRT_LIP`.
 * With less, the core stands at the landmark's level nearer the water than the
 * ramp can come down in. `build-monuments.ts` looks this far when it moves a landmark.
 */
export const SHORE_CLEAR = PAD_MARGIN + SKIRT_LIP;

/**
 * Where the skirt is built to land, as a multiple of the pad's own radius. A
 * level disc of radius `r` cut into a slope `s` moves `r*s` of ground that has
 * to be given back: over a short skirt as a steep bank, over a long one as a
 * gentle ramp. Landing at four radii keeps the ramp at about half as steep again
 * as the hill it is cut into; more buys less, since the ramp can never be
 * gentler than the hill.
 */
const SKIRT_REACH = 4;

/** Gentlest skirt ever built, as a gradient (about 14 degrees). On a plain the skirt has no length. */
const SKIRT_FLOOR = 0.25;

/** Bearings sampled around a site to work out how steep its skirt must be. */
const SKIRT_PROBES = 64;

/**
 * How much of the correction the skirt has given back `distance` units out:
 * quadratic at the rim, straight after it. A correction reduced at a constant
 * rate per unit of ground makes a level pad into a ramp of exactly that
 * gradient, which reads as a shoulder on a ridge.
 */
function spent(distance: number): number {
  return distance <= 0 ? 0 : (distance * distance) / (distance + SKIRT_LIP);
}

/**
 * `SHORE_LIP` above the sea, as a relief: the ceiling on a pad that stands over
 * water. A pad may cut the land down but may not build it back up at the water's
 * edge, or it restores the vertical coast the shore ramp deletes. The cost is a
 * bench: the pad plus its skirt comes down to the waterline.
 */
export const SHORE_CEILING = SHORE_LIP - LAND_SHELF;

/** Where a monument stands, and how much room its model needs to stand on. */
export interface FlattenSite {
  lat: number;
  lon: number;
  /** Radius of the model's own footprint. Defaults to the contract's widest. */
  footprint?: number;
  /**
   * The box the model stands in, in its own north-up frame, as the bake
   * measured it (`landmark-ground.ts`). The pad is cut to it: level to
   * `PAD_MARGIN` past the ground the box and the footprint's disc both hold.
   * Without one, the disc.
   */
  plan?: Plan;
  /**
   * How much same-shelf ground the bake found around it: past the plan's edge
   * where there is a plan (negative where the plan itself reaches the water),
   * the radius of it capped at `footprint` where there is not. Short of the
   * model means it stands over water, and its pad may not stand higher than the
   * shore (`SHORE_CEILING`). Read rather than measured here: whether a footprint
   * reaches water is a question about the outlines that the bake already
   * answers, and a second sweep would be a second definition of one number.
   */
  clearance?: number;
}

/** Unit vectors of the sites, set once, before anything asks about the ground. */
let siteDirection: Float64Array | null = null;
/** Each site's tangent frame, `across = up x north` then north, six to a site. */
let siteFrame: Float64Array | null = null;
/** Each site's plan, as `landmark-ground.ts` shapes it. */
let siteShape: PlanShape[] | null = null;
/** How far past its plan each site's level ground runs (`PAD_MARGIN`). */
let siteCore: Float64Array | null = null;
/** How far past its plan each site's skirt ends. */
let siteReach: Float64Array | null = null;
/** Highest each pad may stand, `SHORE_CEILING` where the model is over water. */
let siteCeiling: Float64Array | null = null;
/** Gradient of each site's skirt, worked out from the land it is cut into. */
let siteSlope: Float64Array | null = null;
/** Pad height per site, worked out on the first query; see `beginPads`. */
let siteHeight: Float64Array | null = null;
/** Sites per cell of a coarse lat/lon grid, so most queries cost one lookup. */
let siteGrid: number[][] | null = null;

/**
 * Declares the places the relief has to be flat, once, before it is asked
 * anything. It throws on a second or late call, because both are silent: the
 * mesh is built once, and terrain that changed afterwards would no longer match
 * what is drawn.
 */
export function setFlattenSites(sites: readonly FlattenSite[]): void {
  if (queriesStarted()) {
    throw new Error(
      'terrain: setFlattenSites after the relief was queried — the mesh and elevationAt would disagree',
    );
  }
  if (siteDirection !== null) throw new Error('terrain: setFlattenSites called twice');
  // Copied out now, so nothing the caller does to its list later can change the
  // shape of a planet that has already been built.
  const directions = new Float64Array(sites.length * 3);
  const frames = new Float64Array(sites.length * 6);
  const shapes: PlanShape[] = [];
  const cores = new Float64Array(sites.length);
  const ceilings = new Float64Array(sites.length);
  const up = { x: 0, y: 0, z: 0 };
  const across = { x: 0, y: 0, z: 0 };
  const north = { x: 0, y: 0, z: 0 };
  sites.forEach((site, i) => {
    // Through `sphere.ts`, like every other conversion in the repo. Written out
    // here with `+sin`, this frame would be the mirror image of the world's and
    // each pad would land at longitude `-lon` — and because the sites are only
    // ever compared with each other, nothing downstream could tell. See the
    // assertion in `check-world.ts`.
    // Through `sphere.ts`: written out by hand this frame would be the world's
    // mirror image.
    toUnit(site.lat, site.lon, directions, i * 3);
    up.x = directions[i * 3]!;
    up.y = directions[i * 3 + 1]!;
    up.z = directions[i * 3 + 2]!;
    // The frame the model is stood in (`placement.ts`) and its plan measured in.
    landmarkFrame(up, across, north);
    frames.set([across.x, across.y, across.z, north.x, north.y, north.z], i * 6);
    // A footprint the contract could not have issued is a bug upstream, and
    // `planShape` clamps it: cheaper than a pad the size of a country.
    shapes.push(planShape(site));
    cores[i] = PAD_MARGIN;
    // A site that does not say is a site that stands on land, which is what a
    // bake older than this field means and what a hand-written one means too.
    const wet = site.clearance !== undefined &&
      (site.plan !== undefined ? site.clearance < 0 : site.clearance < shapes[i]!.radius);
    ceilings[i] = wet ? SHORE_CEILING : Infinity;
  });
  siteDirection = directions;
  siteFrame = frames;
  siteShape = shapes;
  siteCore = cores;
  siteCeiling = ceilings;
}

/**
 * Freezes the pads: works out, per site, the level to hold and how steep a
 * skirt it takes to get back to the land.
 *
 * The level is the land under the monument's own centre, so a summit stays a
 * summit and the single sample `placement.ts` takes there is right by
 * construction; only the shore may lower it. Pads that overlap across their
 * margins share one level, because the alternative is a warped shared terrace
 * (a point inside one pad pulled towards the other's by an amount that changes
 * as you cross it). A chain of them, like the Sphinx and the pyramids, makes one
 * plaza.
 *
 * The skirt's gradient is measured: walking out to where it should land along
 * `SKIRT_PROBES` bearings gives the worst height it has to give back, and
 * dividing by the ground it has to do it in gives the gentlest gradient that
 * still lands there.
 */
export function beginPads(): void {
  const directions = siteDirection;
  const cores = siteCore;
  const shapes = siteShape;
  const frames = siteFrame;
  if (directions === null || cores === null || shapes === null || frames === null || directions.length === 0) return;

  const ceilings = siteCeiling;
  const count = directions.length / 3;
  const heights = new Float64Array(count);
  const slopes = new Float64Array(count);
  const reaches = new Float64Array(count);
  let furthest = 0;

  for (let i = 0; i < count; i++) {
    heights[i] = openReliefAt(directions[i * 3]!, directions[i * 3 + 1]!, directions[i * 3 + 2]!);
    // The skirt is three times the disc's level radius, with the disc's radius
    // the plan's reach, so a pad cut to a smaller plan gives its correction
    // back no more steeply.
    const bound = planReach(shapes[i]!);
    reaches[i] = (bound + cores[i]!) * SKIRT_REACH - bound;
    if (bound + reaches[i]! > furthest) furthest = bound + reaches[i]!;
  }

  // Pads that overlap take the mean of their levels. Union-find over the pairs
  // whose pads touch, so a chain of three settles on one plaza rather than on
  // three pairwise compromises that no two of them agree about.
  const parent = new Int32Array(count).map((_, i) => i);
  const root = (i: number): number => {
    let r = i;
    while (parent[r]! !== r) r = parent[r]!;
    while (parent[i]! !== i) {
      const next = parent[i]!;
      parent[i] = r;
      i = next;
    }
    return r;
  };
  for (let i = 0; i < count; i++) {
    for (let j = i + 1; j < count; j++) {
      const dot = directions[i * 3]! * directions[j * 3]! +
        directions[i * 3 + 1]! * directions[j * 3 + 1]! +
        directions[i * 3 + 2]! * directions[j * 3 + 2]!;
      if (Math.acos(clamp(dot, -1, 1)) * scale.unitsPerRadian >= planReach(shapes[i]!) + cores[i]! + planReach(shapes[j]!) + cores[j]!) continue;
      const a = root(i);
      const b = root(j);
      if (a !== b) parent[a] = b;
    }
  }
  const clusterSum = new Float64Array(count);
  const clusterCount = new Int32Array(count);
  const clusterCeiling = new Float64Array(count).fill(Infinity);
  for (let i = 0; i < count; i++) {
    const r = root(i);
    clusterSum[r] = clusterSum[r]! + heights[i]!;
    clusterCount[r] = clusterCount[r]! + 1;
    const ceiling = ceilings?.[i] ?? Infinity;
    if (ceiling < clusterCeiling[r]!) clusterCeiling[r] = ceiling;
  }
  // The shore's ceiling applies to the cluster, not the member: capping one
  // member only halves the effect (the mean pulls it back up) and giving the
  // two different levels is the warped terrace the averaging prevents. The
  // lowest ceiling in the cluster owns the shared level.
  for (let i = 0; i < count; i++) {
    const r = root(i);
    const level = clusterCount[r]! > 1 ? clusterSum[r]! / clusterCount[r]! : heights[i]!;
    heights[i] = Math.min(level, clusterCeiling[r]!);
  }

  for (let i = 0; i < count; i++) {
    const x = directions[i * 3]!;
    const y = directions[i * 3 + 1]!;
    const z = directions[i * 3 + 2]!;

    // Out along a bearing in the site's own frame, to where the skirt should
    // land: past the plan's edge on that bearing by the skirt's reach.
    const ax = frames[i * 6]!;
    const ay = frames[i * 6 + 1]!;
    const az = frames[i * 6 + 2]!;
    const nx = frames[i * 6 + 3]!;
    const ny = frames[i * 6 + 4]!;
    const nz = frames[i * 6 + 5]!;

    const level = heights[i]!;
    const budget = spent(reaches[i]! - cores[i]!);
    let steepest = SKIRT_FLOOR;
    for (let p = 0; p < SKIRT_PROBES; p++) {
      const bearing = (p / SKIRT_PROBES) * 2 * Math.PI;
      const cb = Math.cos(bearing);
      const sb = Math.sin(bearing);
      const angle = (planExtent(shapes[i]!, sb, cb) + reaches[i]!) / scale.unitsPerRadian;
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      const px = x * cosine + (nx * cb + ax * sb) * sine;
      const py = y * cosine + (ny * cb + ay * sb) * sine;
      const pz = z * cosine + (nz * cb + az * sb) * sine;
      const drop = Math.abs(level - openReliefAt(px, py, pz)) / budget;
      if (drop > steepest) steepest = drop;
    }
    slopes[i] = steepest;
  }
  siteHeight = heights;
  siteSlope = slopes;
  siteReach = reaches;

  // A cell keeps every site whose skirt can reach it. Tested against the cell's
  // centre in three dimensions and with the cell's own half-diagonal added, so
  // the poles and the antimeridian need no special case: a site at the South
  // Pole simply lands in every cell of the bottom row.
  const cosReach = Math.cos(furthest / scale.unitsPerRadian + SITE_CELL * DEG);
  const grid: number[][] = Array.from({ length: SITE_COLS * SITE_ROWS }, () => []);
  const centre = { x: 0, y: 0, z: 0 };
  for (let r = 0; r < SITE_ROWS; r++) {
    const lat = 90 - (r + 0.5) * SITE_CELL;
    for (let c = 0; c < SITE_COLS; c++) {
      const { x: cx, y: cy, z: cz } = unitAt(lat, -180 + (c + 0.5) * SITE_CELL, centre);
      const cell = grid[r * SITE_COLS + c]!;
      for (let i = 0; i < count; i++) {
        const dot = cx * directions[i * 3]! + cy * directions[i * 3 + 1]! + cz * directions[i * 3 + 2]!;
        if (dot > cosReach) cell.push(i);
      }
    }
  }
  siteGrid = grid;
}

/**
 * How far a point on the unit sphere is past site `i`'s plan, world units:
 * `planGap` in the site's own frame, and Infinity on the far side of the planet.
 */
function gapOf(i: number, x: number, y: number, z: number): number {
  const directions = siteDirection!;
  const frames = siteFrame!;
  if (x * directions[i * 3]! + y * directions[i * 3 + 1]! + z * directions[i * 3 + 2]! <= 0) return Infinity;
  const across = (x * frames[i * 6]! + y * frames[i * 6 + 1]! + z * frames[i * 6 + 2]!) * scale.unitsPerRadian;
  const north = (x * frames[i * 6 + 3]! + y * frames[i * 6 + 4]! + z * frames[i * 6 + 5]!) * scale.unitsPerRadian;
  return planGap(siteShape![i]!, across, north);
}

/** The pad at the point last looked up: its strength, its height, and how far inside its level core the point is. */
export const pad = { weight: 0, level: 0, core: 0 };

/**
 * Reads the pads at a point into `pad`, given the height the noise alone would
 * have put there.
 *
 * The correction a pad wants is the whole difference between its level and the
 * land; this answers how much of it still applies out here. Inside the pad, all
 * of it. Outside, the skirt gives it back at its own fixed gradient and the
 * correction is whatever survives, so a pad on a ridge stretches into a spur
 * down the fall lines and stops dead across the contour, and one on a plain
 * cannot be seen.
 *
 * Where several pads reach one point the levels are mixed by the odds of their
 * weights, `w / (1 - w)`, not the weights: a mean weighted by `w` lets a pad two
 * hundred units away drag the ground inside another off level (a bowl under a
 * monument, not a plane). Odds go to infinity as a pad takes full hold.
 */
export function lookUpPads(x: number, y: number, z: number, lat: number, lon: number, land: number): void {
  pad.weight = 0;
  pad.level = 0;
  pad.core = 0;
  const grid = siteGrid;
  const directions = siteDirection;
  const heights = siteHeight;
  const cores = siteCore;
  const reaches = siteReach;
  const slopes = siteSlope;
  if (grid === null || directions === null || heights === null) return;
  if (cores === null || reaches === null || slopes === null) return;
  const row = clamp(Math.floor((90 - lat) / SITE_CELL), 0, SITE_ROWS - 1);
  const col = clamp(Math.floor((lon + 180) / SITE_CELL), 0, SITE_COLS - 1);
  const cell = grid[row * SITE_COLS + col]!;
  if (cell.length === 0) return;
  let held = 0;
  let heldSum = 0;
  let oddsSum = 0;
  let oddsLevel = 0;
  for (const i of cell) {
    const distance = gapOf(i, x, y, z);
    const core = cores[i]!;
    const reach = reaches[i]!;
    if (distance >= reach) continue;
    const inCore = smoothstep(core + SKIRT_LIP, core, distance);
    if (inCore > pad.core) pad.core = inCore;
    const rise = Math.abs(heights[i]! - land);
    const budget = slopes[i]! * spent(distance - core);
    // Inside the pad the skirt has spent nothing, so the pad holds outright —
    // including where the land is already at its level, which is every contour
    // line the level crosses and the centre point itself. The ratio below is
    // 0/0 there, and the limit of it inside the pad is one, not zero. Getting
    // that backwards leaves a thread of wrong height across the middle of a
    // pad, and `placement.ts` samples the ground at exactly the point on it.
    // Inside the pad the skirt has spent nothing, so the pad holds outright,
    // including where the land is already at its level (the ratio below is 0/0
    // there and the limit is one, not zero).
    if (budget > 0 && budget >= rise) continue;
    const left = budget > 0 ? 1 - budget / rise : 1;
    // The skirt says how much of the correction is left; the reach says the pad
    // has no say at all out here. A clamp has no idea how far away it is and
    // would re-engage on high ground beyond where it was built to land.
    const weight = left * smoothstep(reach, core, distance);
    if (weight >= 1) {
      heldSum += heights[i]!;
      held++;
    } else {
      const odds = weight / (1 - weight);
      oddsSum += odds;
      oddsLevel += odds * heights[i]!;
    }
    if (weight > pad.weight) pad.weight = weight;
  }
  // Pads that hold the same point outright overlap, and `beginPads` has already
  // given those one level, so this average is over identical numbers.
  if (held > 0) pad.level = heldSum / held;
  else if (oddsSum > 0) pad.level = oddsLevel / oddsSum;
}

/** How many `SKIRT_LIP` of rim `padClaim` refines against. */
const CLAIM_LIPS = 2;

/**
 * How strongly a monument's pad claims this point, from 0 to 1, for tightening
 * the mesh (the error budget and the shortest edge) around a pad's rim. It is
 * the pad's geometry, not the correction it makes: this is asked once per
 * candidate mesh edge, and the correction would cost another noise evaluation
 * each. Claiming the rim in every direction over-refines a little and can never
 * under-refine. The band outside the pad is two `SKIRT_LIP`.
 */
function padClaim(x: number, y: number, z: number, lat: number, lon: number): number {
  const grid = siteGrid;
  const directions = siteDirection;
  const cores = siteCore;
  if (grid === null || directions === null || cores === null) return 0;

  const row = clamp(Math.floor((90 - lat) / SITE_CELL), 0, SITE_ROWS - 1);
  const col = clamp(Math.floor((lon + 180) / SITE_CELL), 0, SITE_COLS - 1);
  const cell = grid[row * SITE_COLS + col]!;
  if (cell.length === 0) return 0;

  let best = 0;
  for (const i of cell) {
    const distance = gapOf(i, x, y, z);
    const core = cores[i]!;
    const claim = smoothstep(core + CLAIM_LIPS * SKIRT_LIP, core, distance);
    if (claim > best) best = claim;
  }
  return best;
}

/** Whether any pad has been declared and built. */
export function padsReady(): boolean {
  return siteGrid !== null;
}

/** How strongly a pad claims this point (see `padClaim`), for the mesh's refinement. */
export function flattenWeightAt(x: number, y: number, z: number): number {
  ensureQueries();
  return padClaim(x, y, z, latOf(y), lonOf(x, z));
}
