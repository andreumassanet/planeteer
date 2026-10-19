/**
 * Nothing of a landmark hangs over the water: every one whose plan or base
 * reaches past the coastline stands on a foundation down to the sea floor.
 *
 * Each model is built as the game builds it, and its plan (a grid at
 * `GRID_STEP`) and the outline of its base are asked of the outlines. Where
 * any of it is over water the landmark must carry a foundation
 * (`needsFoundation`), the foundation must take in every wet point of the
 * base, and its foot must be under the sea floor (`seaDepthAt`) at every wet
 * point of the plan, from the height the landmark is seated at.
 */
import { at, check } from './harness.ts';
import type { WorldContext } from './context.ts';
import { Vector3 } from 'three';
import { PLANET_RADIUS } from '../../src/globe.ts';
import { createContext } from '../../src/monuments/contract.ts';
import { planShape } from '../../src/landmark-ground.ts';
import { FOUNDATION_DEPTH, buildFoundation, foundationOutline, isRocky, needsFoundation } from '../../src/landmark-foundation.ts';
import { prepareSeaFloor, seaDepthAt } from '../../src/sea-floor.ts';
import { offsetDirection, townFrame } from '../../src/scenery/grid.ts';
import { latOf, lonOf } from '../../src/sphere.ts';
import { loadMonumentModels } from './monument-models.ts';

/** Spacing of the points asked over a plan, in units. */
const GRID_STEP = 3;
/** How far into the sea floor a foundation's foot must reach, in units. */
const FLOOR_EMBED = 1;
/** How far the game seats a landmark under its ground (`LANDMARK_BURY` in `placement/seating.ts`). */
const BURY = 0.25;

/** Whether a point is inside a convex polygon wound either way, with a margin. */
function insideConvex(outline: readonly [number, number][], x: number, z: number, margin = 0.05): boolean {
  let sign = 0;
  for (let i = 0; i < outline.length; i++) {
    const [ax, az] = outline[i]!;
    const [bx, bz] = outline[(i + 1) % outline.length]!;
    const length = Math.hypot(bx - ax, bz - az) || 1;
    const side = ((bx - ax) * (z - az) - (bz - az) * (x - ax)) / length;
    if (Math.abs(side) <= margin) continue;
    const s = Math.sign(side);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

export async function checkFoundations(ctx: WorldContext): Promise<void> {
  const { world, placed } = ctx;
  prepareSeaFloor(world);
  const modelContext = createContext();
  const models = new Map((await loadMonumentModels()).map((model) => [model.id, model]));
  const up = new Vector3();
  const across = new Vector3();
  const north = new Vector3();
  const point = new Vector3();
  const wetAt = (x: number, z: number): Vector3 | null => {
    offsetDirection(up, across, north, x, z, point);
    return world.countryAt(latOf(point.y), lonOf(point.x, point.z)) === 0 ? point : null;
  };

  const hanging: string[] = [];
  const uncovered: string[] = [];
  const short: string[] = [];
  const audit: string[] = [];
  let worstReach = Infinity;
  for (const m of placed) {
    const model = models.get(m.id);
    if (model === undefined) continue;
    up.copy(at(m.lat, m.lon)).normalize();
    townFrame(up, across, north);
    const shape = planShape(m);
    const group = model.build(modelContext);
    const base = foundationOutline(group, m);

    // The plan's ground, a grid over the box cut by the footprint's disc.
    const extent = Number.isFinite(shape.hx) ? Math.max(Math.abs(shape.cx) + shape.hx, Math.abs(shape.cz) + shape.hz) : shape.radius;
    const wetPlan: Vector3[] = [];
    let asked = 0;
    for (let x = -extent; x <= extent; x += GRID_STEP) {
      for (let z = -extent; z <= extent; z += GRID_STEP) {
        if (Math.hypot(x, z) > shape.radius) continue;
        if (Number.isFinite(shape.hx) && (Math.abs(x - shape.cx) > shape.hx || Math.abs(z - shape.cz) > shape.hz)) continue;
        asked++;
        const wet = wetAt(x, z);
        if (wet !== null) wetPlan.push(wet.clone());
      }
    }
    const wetBase = base.filter(([x, z]) => wetAt(x, z) !== null);
    if (wetPlan.length === 0 && wetBase.length === 0) continue;

    if (!needsFoundation(m)) {
      hanging.push(`${m.id} (${wetPlan.length} of ${asked} plan points and ${wetBase.length} of its base's corners over water)`);
      continue;
    }
    const footing = buildFoundation(modelContext, group, m);
    if (footing === null) {
      hanging.push(`${m.id} (no foundation built)`);
      continue;
    }
    // The foundation is cut to the base's outline: every wet corner of the base is in it.
    const outline = foundationOutline(footing, m);
    const missed = wetBase.filter(([x, z]) => !insideConvex(outline, x, z, 0.5)).length;
    if (missed > 0) uncovered.push(`${m.id} (${missed} wet corners of its base outside it)`);

    // Seated on its ground, its foot under the floor at every wet point.
    const seat = PLANET_RADIUS + world.elevationAt(at(m.lat, m.lon)) - BURY;
    const foot = seat - FOUNDATION_DEPTH;
    let deepest = 0;
    for (const p of wetPlan) {
      const floor = PLANET_RADIUS - seaDepthAt(p);
      deepest = Math.max(deepest, seaDepthAt(p));
      worstReach = Math.min(worstReach, floor - foot);
      if (foot > floor - FLOOR_EMBED) {
        short.push(`${m.id} (floor ${(floor - PLANET_RADIUS).toFixed(1)}, foot ${(foot - PLANET_RADIUS).toFixed(1)})`);
        break;
      }
    }
    audit.push(
      `${m.id} ${((wetPlan.length / Math.max(1, asked)) * 100).toFixed(0)}% wet, floor to ${deepest.toFixed(1)}, ` +
      `${isRocky(m.id) ? 'rock' : 'plinth'}${m.shore === true ? '' : ' (not shore)'}`,
    );
  }
  console.log(`  --   ${audit.length} of ${placed.length} landmarks reach over water — share of the plan wet, the deepest floor under it, the foundation:\n       ${audit.join(' · ')}`);
  check(hanging.length === 0, 'no landmark hangs over the water without a foundation', hanging.slice(0, 5).join('; '));
  check(uncovered.length === 0, 'every foundation takes in its base where the base is over water', uncovered.slice(0, 5).join('; '));
  check(
    short.length === 0,
    'every foundation reaches into the sea floor',
    short.length > 0 ? short.slice(0, 5).join('; ') : `the foot at least ${worstReach === Infinity ? '-' : worstReach.toFixed(1)} under the floor`,
  );
}
