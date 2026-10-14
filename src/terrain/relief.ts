import { latOf, lonOf } from '../sphere.ts';
import { COAST_CELL, LAND_SHELF, SHORE_LIP } from './constants.ts';
import { shoreDistance } from './coast-field.ts';
import { SHORE_CEILING, lookUpPads, pad, padsReady } from './pads.ts';
import { ensureQueries } from './queries.ts';
import { rawRelief } from './raw-relief.ts';
import { shoreFall } from './shore.ts';
import { valleyed } from './town-sites.ts';

/**
 * Height of the land above its ring's shelf, at a point on the unit sphere.
 *
 * Bounded below by `SHORE_LIP - LAND_SHELF` and above by `MAX_RELIEF`, both by
 * construction rather than by clamping the answer: the shore ramp is the only
 * negative term and a fraction of a fixed drop, everything else is floored at
 * zero, and the pads only mix two values that already obey both.
 */
export function reliefAt(x: number, y: number, z: number): number {
  ensureQueries();
  const lat = latOf(y);
  const lon = lonOf(x, z);
  const relief = valleyed(x, y, z, lat, lon, rawRelief(x, y, z, lat, lon));
  if (!padsReady()) return relief;
  lookUpPads(x, y, z, lat, lon, relief);
  if (pad.weight <= 0) return relief;
  // Past its level core a pad follows the shore down rather than holding the
  // coast up: outside the core the level the skirt aims at comes down with the
  // shore ramp itself, fading in over the skirt's first `SKIRT_LIP`. Otherwise a
  // pad a few hundred units from the sea would hold most of its correction at
  // the water's edge, the cliff the ramp deletes, which no swimmer can climb.
  let target = pad.level;
  if (pad.core < 1) {
    const fall = shoreFall(x, y, z, lat, lon, shoreDistance(lat, lon) - COAST_CELL * 0.5);
    // Never under the lip, the lowest ground on the planet.
    if (fall > 0) target = Math.max(SHORE_CEILING, target - (LAND_SHELF - SHORE_LIP) * fall * (1 - pad.core));
  }
  return relief + (target - relief) * pad.weight;
}
