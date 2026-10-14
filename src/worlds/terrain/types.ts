/** The ground's shared types: one sample of it, a levelled pad, and the `Terrain` handle. */

import type { WorldSpec } from '../contract.ts';
/** Everything one point of ground is. Reused: `sample` fills it. */
export interface TerrainSample {
  height: number;
  lat: number;
  lon: number;
  /** 0 to 1, from the crater field. */
  bowl: number;
  ejecta: number;
  /** The body's biome here, or null where it has no ground model. */
  biome: string | null;
  /** Linear RGB, before slope and light. */
  r: number;
  g: number;
  b: number;
}

/** A disc levelled for something built: a settlement or a landmark. */
export interface Pad {
  id: string;
  /** Unit vector of its centre. */
  x: number;
  y: number;
  z: number;
  /** Built radius, units, and how far the levelling reaches. */
  radius: number;
  reach: number;
  /** The ground's height at the centre before any levelling: where the pad's plane touches. */
  height: number;
  /** Cosines of `radius` and `reach` as angles, for the cheap test. */
  cosInner: number;
  cosOuter: number;
}

export interface Terrain {
  readonly spec: WorldSpec;
  /** Walkable radius, units. */
  readonly radius: number;
  /** The quadtree's depth and the finest grid's step in face coordinates. */
  readonly levels: number;
  readonly pads: readonly Pad[];
  /** Generous bounds on the height anywhere, for bounding spheres and the check. */
  readonly low: number;
  readonly high: number;
  /** The field: height over the radius at a unit direction. */
  heightAt(x: number, y: number, z: number): number;
  /** The field and everything about it, colour included. */
  sample(x: number, y: number, z: number, out: TerrainSample): TerrainSample;
  /** The drawn surface: the finest grid's triangle under a direction (unit or not). */
  groundAt(x: number, y: number, z: number): number;
  /** The pad a direction stands in, if any. */
  padAt(x: number, y: number, z: number): Pad | null;
  /**
   * Ground kept bare of what lies about: a launch pad past a town's edge
   * (`rocket.ts`). Registered before the tiles round it are decorated.
   */
  keepBare(x: number, y: number, z: number, radius: number): void;
  /** Whether a direction is on bare ground: a town's pad or a kept clearing. */
  bareAt(x: number, y: number, z: number): boolean;
}

export const newSample = (): TerrainSample => ({ height: 0, lat: 0, lon: 0, bowl: 0, ejecta: 0, biome: null, r: 1, g: 1, b: 1 });
