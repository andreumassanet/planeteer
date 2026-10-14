import type { Vehicle } from './types.ts';
import { PLACED_LENGTH_CAP, PLACED_SECTION } from './scale.ts';

/**
 * What a vehicle is, which is also what it costs and where it may go.
 *
 * - `cycle`: bicycles, scooters, motorbikes.
 * - `car`: private cars.
 * - `utility`: working road vehicles under about eight units.
 * - `heavy`: buses and trucks, long enough that road curvature matters.
 * - `craft`: anything on water.
 * - `air`: anything in it.
 */
export type VehicleKind = 'cycle' | 'car' | 'utility' | 'heavy' | 'craft' | 'air';

/** Where a vehicle can be placed at all. A placer keys off this and nothing else. */
export type Medium = 'road' | 'water' | 'air';

export interface KindSpec {
  medium: Medium;
  /** Longest a built variant may come out, along Z. */
  length: number;
  /** Shortest, so a `car` cannot quietly be a scooter. */
  minLength: number;
  /** Widest, across X: decides whether it fits a lane. */
  width: number;
  /** Tallest. */
  height: number;
  /** Triangle cap per variant. */
  triangles: number;
  /** Mesh cap, mostly a cap on build time. */
  meshes: number;
  /** Cap on distinct palette colours; colours multiply draw calls. */
  colors: number;
  /**
   * How far below y = 0 the model may reach. Non-zero only on water, where
   * y = 0 is the waterline and the draft is what sits under it.
   */
  draft: number;
}

// Each cap is the worst baked model of its kind plus a margin.
export const KINDS: Record<VehicleKind, KindSpec> = {
  cycle: { medium: 'road', length: 3.4, minLength: 1.6, width: 1.4, height: 2.4, triangles: 1400, meshes: 20, colors: 4, draft: 0 },
  car: { medium: 'road', length: 6.6, minLength: 4.2, width: 2.7, height: 2.8, triangles: 1400, meshes: 22, colors: 4, draft: 0 },
  utility: { medium: 'road', length: 8.0, minLength: 2.6, width: 2.9, height: 3.9, triangles: 1800, meshes: 26, colors: 5, draft: 0 },
  heavy: { medium: 'road', length: 16.0, minLength: 7.5, width: 3.4, height: 4.6, triangles: 1700, meshes: 28, colors: 5, draft: 0 },
  craft: { medium: 'water', length: 11.0, minLength: 2.6, width: 3.6, height: 8.0, triangles: 500, meshes: 24, colors: 5, draft: 1.2 },
  air: { medium: 'air', length: 22.0, minLength: 6.0, width: 22.0, height: 28.0, triangles: 340, meshes: 24, colors: 6, draft: 0 },
};

/**
 * Variants of one vehicle a region builds. A vehicle varies mostly by paint,
 * and each colourway is a material and so a draw call.
 */
export const VARIANTS = 4;

/**
 * The scale a placer applies, as `[x, y, z]`: width, height, length. A vehicle
 * faces +Z, so the length crop is a z scale. `air` is exempt.
 *
 * The determinant is `PLACED_SECTION^2 * lengthScale` and must stay positive,
 * or the winding flips and the outline hull renders the vehicle as a blob.
 */
export function placedScale(vehicle: Vehicle): [number, number, number] {
  if (KINDS[vehicle.kind].medium === 'air') return [1, 1, 1];
  const length = Math.min(PLACED_SECTION, PLACED_LENGTH_CAP / vehicle.size[0]);
  return [PLACED_SECTION, PLACED_SECTION, length];
}

/** `Vehicle.size` after `placedScale`, in the same `[length, width, height]` order. */
export function placedSize(vehicle: Vehicle): [number, number, number] {
  const [x, y, z] = placedScale(vehicle);
  return [vehicle.size[0] * z, vehicle.size[1] * x, vehicle.size[2] * y];
}
