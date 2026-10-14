import { DEG } from './constants.ts';
import { reliefAt } from './relief.ts';
import { scale } from './scale.ts';

/**
 * How steep the ground may be under anything this world stands on the land: the
 * angle of repose (the steepest a loose slope holds), 30 degrees. The wood, the
 * herds, the roads and the town's cells all ask `gradeAt`, so a slope that
 * refuses a tree cannot admit a carriageway.
 */
export const MAX_SLOPE = Math.tan(30 * DEG);

/** What `gradeAt` measured: the tilt, and the two extremes it came from. */
export interface Slope {
  /** The gradient's magnitude, rise over run. Compare it against `MAX_SLOPE`. */
  grade: number;
  /**
   * And the two components it is the magnitude of, along the caller's own
   * tangents, so the same measurement that refuses a site can also *lay*
   * something on it: `-across, -north` against the up vector is the surface
   * normal in the frame it was asked in. See `TILT_OF` in `vegetation.ts`.
   */
  across: number;
  north: number;
  /** The lowest of the four probes: what a thing standing here is bedded to. */
  lowest: number;
  /** The highest: what has to be cut away, walled, or climbed over. */
  highest: number;
}

/**
 * The tilt of the relief at a point, over a footprint of its own.
 *
 * Four probes at the corners of a square `reach` units across, in the frame the
 * caller is about to place something in, give the central difference a height
 * field's normal is built from; in the caller's frame the answer can lay the
 * thing down as well as refuse it. The reach is the caller's: a plant asks over
 * its footprint, a road over its width, a town over one cell.
 *
 * `into` is filled and returned rather than allocated, because the vegetation
 * calls this once per plot.
 */
export function gradeAt(
  up: { x: number; y: number; z: number },
  across: { x: number; y: number; z: number },
  north: { x: number; y: number; z: number },
  reach: number,
  into: Slope,
): Slope {
  // The probes are `reach` units out along the tangents; a unit vector plus a
  // tangent times an angle is the point at that angle once normalised.
  const span = reach / scale.unitsPerRadian;
  let lowest = Infinity;
  let highest = -Infinity;
  for (let corner = 0; corner < 4; corner++) {
    const angle = (corner / 4) * Math.PI * 2 + Math.PI / 4;
    const dx = Math.cos(angle) * span;
    const dz = Math.sin(angle) * span;
    const px = up.x + across.x * dx + north.x * dz;
    const py = up.y + across.y * dx + north.y * dz;
    const pz = up.z + across.z * dx + north.z * dz;
    const length = Math.hypot(px, py, pz) || 1;
    const height = reliefAt(px / length, py / length, pz / length);
    probes[corner] = height;
    if (height < lowest) lowest = height;
    if (height > highest) highest = height;
  }
  const wide = 2 * Math.SQRT2 * reach;
  into.across = (probes[0]! + probes[3]! - probes[1]! - probes[2]!) / wide;
  into.north = (probes[0]! + probes[1]! - probes[2]! - probes[3]!) / wide;
  into.grade = Math.hypot(into.across, into.north);
  into.lowest = lowest;
  into.highest = highest;
  return into;
}

/** The four corner heights `gradeAt` samples, reused: it is called per plot. */
const probes = [0, 0, 0, 0];
