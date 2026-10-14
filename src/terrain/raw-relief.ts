// The land as the noise alone would have it: the shore ramp, the swell, the
// ranges and the downs, before valleys or monument pads touch it.

import { latOf, lonOf } from '../sphere.ts';
import {
  COAST_CELL,
  DOWNS_FREQUENCY,
  DOWNS_HEIGHT,
  DOWNS_LOW,
  DOWNS_MEAN,
  DOWNS_OCTAVES,
  LAND_SHELF,
  MASSIF_FLOOR,
  MAX_RELIEF,
  NOISE_RANGE_HEIGHT,
  RIDGE_FREQUENCY,
  RIDGE_OCTAVES,
  SHORE_LIP,
  SHORE_SPAN,
  SWELL_FREQUENCY,
  SWELL_HEIGHT,
} from './constants.ts';
import { shoreDistance } from './coast-field.ts';
import { fbm, ridged, smoothstep } from './noise.ts';
import { rangeHeight } from './ranges.ts';
import { shoreFall } from './shore.ts';

/** `rawRelief` at a point on the unit sphere. */
export function rawReliefAt(x: number, y: number, z: number): number {
  return rawRelief(x, y, z, latOf(y), lonOf(x, z));
}

/** The land as the noise alone would have it, before any monument flattens it. */
export function rawRelief(x: number, y: number, z: number, lat: number, lon: number): number {
  // The first land cell centre is one cell from the sea and the shore runs
  // between the two, so a point on it samples about half a cell. Subtracting
  // that puts the zero of the fade on the water's edge.
  const coarse = shoreDistance(lat, lon) - COAST_CELL * 0.5;

  // The shore ramp is the only term that is ever negative: the shelf gives back
  // all but `SHORE_LIP` of its height at the water, so the land slopes into the
  // sea. Bounded because `shoreFall` is in [0,1].
  const shore = -(LAND_SHELF - SHORE_LIP) * shoreFall(x, y, z, lat, lon, coarse);

  const inland = smoothstep(0, SHORE_SPAN, coarse);
  // The whole coastline returns here and it is most of the mesh, so it pays only for the ramp.
  if (inland <= 0) return shore;

  // One field read twice: how high the ground lies and, above a threshold,
  // whether it has mountains on it. Ranges then sit on high ground rather than
  // covering the planet in an even corduroy, and the plains between stay smooth
  // and nearly free in triangles.
  const swelling = fbm(x * SWELL_FREQUENCY, y * SWELL_FREQUENCY, z * SWELL_FREQUENCY, 4);
  const swell = SWELL_HEIGHT * swelling;
  const orogeny = smoothstep(0.55, 0.80, swelling);
  const amplitude = Math.max(NOISE_RANGE_HEIGHT * orogeny, rangeHeight(x, y, z));
  // A range is a massif with peaks on it, not a field of peaks: the ridged noise
  // sits near zero most of the time, so `MASSIF_FLOOR` lifts the whole footprint
  // and the noise shapes the top of it.
  const ridges = amplitude > 0.5
    ? amplitude * (MASSIF_FLOOR + (1 - MASSIF_FLOOR)
      * ridged(x * RIDGE_FREQUENCY, y * RIDGE_FREQUENCY, z * RIDGE_FREQUENCY, RIDGE_OCTAVES))
    : 0;

  // Modulated by the same swell that gates the ranges, so the Sahara and the
  // Amazon keep their plains.
  const downs = DOWNS_HEIGHT
    * (DOWNS_LOW + (1 - DOWNS_LOW) * smoothstep(0.30, 0.65, swelling))
    * (ridged(x * DOWNS_FREQUENCY, y * DOWNS_FREQUENCY, z * DOWNS_FREQUENCY, DOWNS_OCTAVES)
      - DOWNS_MEAN);

  // The downs can be negative above the shelf, so the floor is here: it puts a
  // hollow's trough on the plain the world already has rather than cutting a dry
  // lake bed inland.
  return shore + Math.min(MAX_RELIEF, Math.max(0, inland * (swell + ridges + downs)));
}
