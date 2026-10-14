import { PLANET_RADIUS } from '../globe.ts';
import { townGrid } from '../scenery/grid.ts';
import { detailArea, detailCount, detailPixels, detailReach, fogFar, horizonAt, slantRange } from '../view.ts';
import type { Slot } from './types.ts';

/** How far, how much and how often the settlement streamer builds. */

/**
 * How far along the ground a settlement is built, in world units: twice the
 * horizon, capped by the haze and by the detail knob. `rangeFor` turns it into
 * the slant distance a town's anchor is compared against, which in the air is
 * the hypotenuse with the altitude.
 */
export function reachFor(altitude: number): number {
  return Math.min(fogFar(altitude, PLANET_RADIUS) * 1.1, detailReach(Math.min(20000, Math.max(1400, horizonAt(altitude, PLANET_RADIUS) * 2))));
}

export function rangeFor(altitude: number): number {
  return slantRange(altitude, reachFor(altitude));
}

/** The far share a frame gives the map's town plans (`planSteps`), ms. */
export const PLAN_BUILD_MS = 2;

/** Runs a build in steps to its end at once: what every caller but the far job wants. */
export function drain<T>(steps: Generator<void, T, void>): T {
  for (;;) {
    const step = steps.next();
    if (step.done === true) return step.value;
  }
}

/**
 * How many pixels of the screen a settlement has to span before it is built:
 * the whole level-of-detail scheme. An object subtends about
 * `PIXELS_PER_RADIAN * size / distance` pixels at a 900 px viewport and the
 * world's 55 degree lens; below this a town is a smudge with an outline.
 */
const MIN_APPARENT_PIXELS = 8;
export const minPixels = (): number => detailPixels(MIN_APPARENT_PIXELS);
export const PIXELS_PER_RADIAN = 937;

/**
 * The ceiling on resident geometry, in triangles (drawn twice by the outline
 * pass), at detail 1. Binds where the count cap does not: standing among
 * several large cities.
 */
const TRIANGLE_BUDGET = 380_000;

/** As the knob leaves it; the ground inside a radius goes as its square. */
export const triangleBudget = (): number => detailArea(TRIANGLE_BUDGET);

/**
 * A hard count at detail 1, since every resident town is one draw call; it
 * scales with the knob (`detailCount`) and past about detail 2 the triangle
 * budget binds instead.
 */
const MAX_RESIDENT = 140;
export const maxResident = (): number => detailCount(MAX_RESIDENT);

/**
 * The radius inside which every town is built whatever the camera faces, so a
 * fast turn finds them standing: the on-foot haze closes at about 1,430 units.
 * Not scaled with the detail knob, or it would become a frustum-free range.
 */
export const KEEP_ALL_WITHIN = 1450;
export const keepAllWithin = (): number => KEEP_ALL_WITHIN;

/** Radians of turn that force the candidate list to be worked out again: a tenth of the admitting cone's margin. */
export const RESCAN_TURN = 8 * (Math.PI / 180);

/** How far the viewer moves before the candidate list is worked out again, in world units. */
export const RESCAN_MOVE = 60;
/** And a share of the range on top of it, so a fast plane does not rescan every other frame. */
export const RESCAN_SHARE = 0.01;

/**
 * Milliseconds of building allowed in one frame before detail scaling. A
 * metropolis is a few ms, so the queue is served by a clock and a town that
 * does not fit is built in the next frame.
 */
export const BUILD_BUDGET_MS = 3.5;

/**
 * How many of the nearest settlements are peopled, and how far one has to
 * fall before it is emptied again. A person costs more than a house, so only
 * the nearest towns get a crowd; two thresholds so a town on the line does not
 * rebuild every scan.
 */
export const PEOPLED_RANK = 12;
export const UNPEOPLE_RANK = 20;

/**
 * How near a town has to be, as well as among the nearest, to be peopled: the
 * on-foot haze, past which a person is not worth a triangle. `UNPEOPLE_REACH`
 * is its hysteresis.
 */
export const PEOPLED_REACH = KEEP_ALL_WITHIN;
export const UNPEOPLE_REACH = 1.25;

/** How many unbuilt far towns the scan wants at once: about a second of the far builder from the plane. */
export const FAR_WANTING = 12;

/**
 * How many triangles the near towns may cost over what the same towns would
 * cost far, in total, before the excess is charged to the triangle budget: a
 * near town is the kit's buildings and a crowd, and charging all of it would
 * evict the far field.
 */
export const NEAR_ALLOWANCE = 240_000;

/**
 * What a settlement will cost before it is built, in triangles: cells times a
 * mean fill of 0.72 parts at about 150 triangles each, plus about 14 of ground
 * a cell. Only decides whether to start; the real count replaces it once built.
 */
export function estimateTriangles(slot: Slot): number {
  const grid = townGrid(slot.radius);
  const cells = grid.cells * grid.cells;
  return Math.round(cells * (0.72 * 150 + 14));
}
