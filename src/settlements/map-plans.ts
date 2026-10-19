import * as THREE from 'three';
import type { World } from '../geo.ts';
import { PLANET_RADIUS, groundColorAt } from '../globe.ts';
import { planGap } from '../landmark-ground.ts';
import { isShown } from '../places.ts';
import { toByte } from '../raster.ts';
import { OUTSKIRT_MIN_CELLS, OUTSKIRT_RING, cellCentre, outskirtScore, streetBand } from '../scenery/grid.ts';
import type { TownGrid } from '../scenery/grid.ts';
import { cellKey, pavementOf, trodden } from '../scenery/ground.ts';
import type { Placed } from '../scenery/index.ts';
import type { Solid } from '../scenery/solids.ts';
import { mayBuild } from '../view.ts';
import { PLAN_BUILD_MS, drain } from './budget.ts';
import type { TownFrame } from './frame.ts';
import { pavedUnder, solidOf } from './plots.ts';
import { KIND_OF, footprintOf } from './rules.ts';
import { standsDry } from './shore.ts';
import type { FlatVariant, Slot, TownPlan } from './types.ts';
import type { Variants } from './variants.ts';

/**
 * Each town's plan as the map draws it (`TownPlan`): what a near town stood,
 * or what a far job (`'townplans'`) works out for one that never stood near.
 */
export interface MapPlans {
  /** Keeps a plan, letting the oldest go past `MAP_PLANS_KEPT`. */
  keepPlan(index: number, plan: TownPlan | null): void;
  /** A town's plan out of what stands on its square; only while the frame and terraces are still this town's. */
  slotPlan(
    slot: Slot, grid: TownGrid, solids: readonly Solid[], flats: readonly FlatVariant[],
    kinds: readonly number[], trees: readonly number[], pavedCells: ReadonlySet<number>,
  ): TownPlan;
  /** Abandons the plan under way: a town is about to be built, and the frame is its. */
  endPlanJob(): void;
  /** Whether a plan is under way or wanted. */
  readonly pending: boolean;
  /** Plans what the map has asked for while the frame's far share allows, one plan at a time. */
  stepPlans(began: number): void;
  townPlan(index: number): TownPlan | null | undefined;
  townPlanNow(index: number): TownPlan | null;
}

/** At most this many plans are kept; a plan is a few kilobytes. */
const MAP_PLANS_KEPT = 400;

/** What a map plan is worked out with. */
interface PlanDeps {
  readonly world: World;
  readonly frame: TownFrame;
  readonly variants: Variants;
  readonly squareSteps: (slot: Slot) => Generator<void, TownGrid | null, void>;
  readonly planTownSteps: (slot: Slot, grid: TownGrid) => Generator<void, { placed: Placed[] }, void>;
  readonly inTheCountry: WeakSet<Placed>;
  readonly land: THREE.Color;
  readonly yard: THREE.Color;
  readonly direction: THREE.Vector3;
  readonly scratch: THREE.Vector3;
}

export function createMapPlans(
  world: World,
  frame: TownFrame,
  slots: readonly Slot[],
  variants: Variants,
  squareSteps: (slot: Slot) => Generator<void, TownGrid | null, void>,
  planTownSteps: (slot: Slot, grid: TownGrid) => Generator<void, { placed: Placed[] }, void>,
  inTheCountry: WeakSet<Placed>,
  /** Makes way for a plan built now: abandons the town build under way. */
  endTownJob: () => void,
): MapPlans {
  const deps: PlanDeps = {
    world, frame, variants, squareSteps, planTownSteps, inTheCountry,
    land: new THREE.Color(), yard: new THREE.Color(), direction: new THREE.Vector3(), scratch: new THREE.Vector3(),
  };
  const mapPlans = new Map<number, TownPlan | null>();
  /** The towns the map has asked for and nothing has planned yet, oldest first. */
  const planWanted: number[] = [];
  const planAsked = new Set<number>();
  /** The plan under way, which shares the town frame and terraces with a town's build and gives way to one. */
  let planJob: { index: number; steps: Generator<void, TownPlan | null, void> } | null = null;

  function keepPlan(index: number, plan: TownPlan | null): void {
    mapPlans.delete(index);
    mapPlans.set(index, plan);
    planAsked.delete(index);
    while (mapPlans.size > MAP_PLANS_KEPT) mapPlans.delete(mapPlans.keys().next().value!);
  }

  return {
    keepPlan,
    slotPlan: (slot, grid, solids, flats, kinds, trees, pavedCells) => slotPlan(deps, slot, grid, solids, flats, kinds, trees, pavedCells),
    endPlanJob() {
      if (planJob === null) return;
      planJob.steps.return(null);
      planWanted.unshift(planJob.index);
      planJob = null;
    },
    get pending() {
      return planJob !== null || planWanted.length > 0;
    },
    stepPlans(began) {
      while (mayBuild(began, PLAN_BUILD_MS, false, 'townplans')) {
        if (planJob === null) {
          let index = planWanted.shift();
          while (index !== undefined && mapPlans.has(index)) index = planWanted.shift();
          if (index === undefined) return;
          planJob = { index, steps: planSteps(deps, slots[index]!) };
        }
        const step = planJob.steps.next();
        if (step.done === true) {
          keepPlan(planJob.index, step.value);
          planJob = null;
        }
      }
    },
    townPlan(index) {
      const known = mapPlans.get(index);
      if (known !== undefined || mapPlans.has(index)) return known ?? null;
      const slot = slots[index];
      if (slot === undefined || !isShown(slot.place)) return null;
      if (!planAsked.has(index)) {
        planAsked.add(index);
        planWanted.push(index);
      }
      return undefined;
    },
    townPlanNow(index) {
      const known = mapPlans.get(index);
      if (known !== undefined) return known;
      const slot = slots[index];
      if (slot === undefined || !isShown(slot.place)) return null;
      endTownJob();
      const plan = drain(planSteps(deps, slot));
      keepPlan(index, plan);
      return plan;
    },
  };
}

/** A town's plan out of what stands on its square, read while the frame and terraces are still this town's. */
function slotPlan(
  deps: PlanDeps, slot: Slot, grid: TownGrid, solids: readonly Solid[], flats: readonly FlatVariant[],
  kinds: readonly number[], trees: readonly number[], pavedCells: ReadonlySet<number>,
): TownPlan {
  const { world, frame, land: planLand, yard: planYard, direction: planDir } = deps;
  const n = grid.cells;
  const style = slot.ground;
  const cells = new Uint8Array(n * n);
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      const key = cellKey(col, row);
      if (frame.terraceAt(col, row) === null) continue;
      const cx = cellCentre(grid, col);
      const cz = cellCentre(grid, row);
      // The floor's own tests: a landmark's ground, a block's paving, a lawn at the edge.
      const plaza = frame.parcelCell(col, row) || frame.keepouts.some((keepout) => planGap(keepout.shape, cx - keepout.x, cz - keepout.z) < keepout.radius);
      const outer = style.yard !== 'earth' && (n < OUTSKIRT_MIN_CELLS || outskirtScore(grid, slot.seed, col, row) > OUTSKIRT_RING);
      cells[row * n + col] = plaza ? 4 : pavedCells.has(key) ? 2 : outer ? 3 : 1;
    }
  }
  frame.directionAt(0, 0, planDir);
  groundColorAt(world, planDir.multiplyScalar(PLANET_RADIUS), planLand);
  if (style.yard === 'paved') planYard.setHex(style.walk);
  else if (style.yard === 'earth') trodden(planLand, planYard);
  else planYard.copy(planLand);
  const buildings = new Float32Array(solids.length * 6);
  const roofs = new Uint32Array(solids.length);
  solids.forEach((solid, k) => {
    buildings.set([solid.x, solid.z, solid.cos, solid.sin, solid.hx, solid.hz], k * 6);
    roofs[k] = roofOf(flats[k]!);
  });
  const band = streetBand(grid, style.street);
  return {
    index: slot.index,
    up: frame.up.clone(),
    across: frame.across.clone(),
    north: frame.north.clone(),
    grid,
    cells,
    band,
    walk: pavementOf(band),
    colours: { road: style.road, walk: style.walk, yard: planYard.getHex(), land: planLand.getHex(), plaza: style.plaza },
    buildings,
    kinds: Uint8Array.from(kinds),
    roofs,
    trees: Float32Array.from(trees),
  };
}

/**
 * A town's plan as it would stand near, without standing it: its near
 * variants, its square and its plots, each kept or refused by the raise's own
 * tests (the sea under it, a cell with no terrace). Trees are dots, so the
 * slope test on the country's is left out.
 */
function* planSteps(deps: PlanDeps, slot: Slot): Generator<void, TownPlan | null, void> {
  const { world, frame, variants, squareSteps, planTownSteps, inTheCountry, scratch } = deps;
  // A near copy: the square and the plan read a slot and write nothing the town keeps.
  const near: Slot = { ...slot, peopled: true };
  yield* variants.warmSteps(near);
  const grid = yield* squareSteps(near);
  if (grid === null) return null;
  yield;
  const placed = (yield* planTownSteps(near, grid)).placed;
  const solids: Solid[] = [];
  const flats: FlatVariant[] = [];
  const kinds: number[] = [];
  const trees: number[] = [];
  const pavedCells = new Set<number>();
  let k = 0;
  for (const entry of placed) {
    if ((++k & 31) === 0) yield;
    const flat = variants.variantOf(entry.partId, near.style, entry.variant);
    if (flat === null) continue;
    frame.directionAt(entry.plot.x, entry.plot.z, scratch);
    if (world.elevationAt(scratch) <= 0) continue;
    const country = inTheCountry.has(entry);
    if (!country && frame.terraceAt(entry.plot.col, entry.plot.row) === null) continue;
    const shore = country ? null : frame.shoreAt(entry.plot.col, entry.plot.row);
    if (shore !== null && !standsDry(shore, entry.plot.x, entry.plot.z, footprintOf(entry.partId) * entry.scale)) continue;
    const kind = KIND_OF.get(entry.partId);
    if (kind === 'tree') {
      trees.push(entry.plot.x, entry.plot.z, footprintOf(entry.partId) * entry.scale);
      continue;
    }
    if (country ? kind !== 'dwelling' : kind !== 'dwelling' && kind !== 'block' && kind !== 'civic') continue;
    const solid = solidOf(flat, entry.plot.x, entry.plot.z, entry.plot.yaw, entry.scale, 0);
    solids.push(solid);
    flats.push(flat);
    kinds.push(kind === 'block' ? 1 : kind === 'civic' ? 2 : 0);
    if (kind !== 'dwelling') pavedUnder(solid, grid, pavedCells);
  }
  return slotPlan(deps, near, grid, solids, flats, kinds, trees, pavedCells);
}

/** A variant's roof, as the map paints it: its up-facing triangles high on it, averaged by area seen from above. */
const roofColours = new WeakMap<FlatVariant, number>();
function roofOf(flat: FlatVariant): number {
  const known = roofColours.get(flat);
  if (known !== undefined) return known;
  const p = flat.position;
  const c = flat.color;
  let r = 0;
  let g = 0;
  let b = 0;
  let weight = 0;
  let anyR = 0;
  let anyG = 0;
  let anyB = 0;
  let anyWeight = 0;
  const high = flat.height * 0.35;
  for (let t = 0; t < flat.triangles; t++) {
    const k = t * 9;
    const ax = p[k + 3]! - p[k]!;
    const ay = p[k + 4]! - p[k + 1]!;
    const az = p[k + 5]! - p[k + 2]!;
    const bx = p[k + 6]! - p[k]!;
    const by = p[k + 7]! - p[k + 1]!;
    const bz = p[k + 8]! - p[k + 2]!;
    // The cross product's y is twice the area seen from above, signed by which way the face looks.
    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;
    const area = Math.hypot(nx, ny, nz);
    if (area <= 0) continue;
    const cr = (c[k]! + c[k + 3]! + c[k + 6]!) / 3;
    const cg = (c[k + 1]! + c[k + 4]! + c[k + 7]!) / 3;
    const cb = (c[k + 2]! + c[k + 5]! + c[k + 8]!) / 3;
    anyR += cr * area;
    anyG += cg * area;
    anyB += cb * area;
    anyWeight += area;
    if (ny / area < 0.45 || (p[k + 1]! + p[k + 4]! + p[k + 7]!) / 3 < high) continue;
    r += cr * ny;
    g += cg * ny;
    b += cb * ny;
    weight += ny;
  }
  if (weight <= 0) {
    r = anyR;
    g = anyG;
    b = anyB;
    weight = Math.max(1e-9, anyWeight);
  }
  const hex = (toByte(r / weight) << 16) | (toByte(g / weight) << 8) | toByte(b / weight);
  roofColours.set(flat, hex);
  return hex;
}
