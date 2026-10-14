/** The towns' shared types: sites, footprints, plots and the `Settlements` handle. */

import type * as THREE from 'three';
import type { KitCraft, VehicleSpec } from '../contract.ts';
import { DEFAULT_KITS } from '../craft/kit-model.ts';
import type { GridTown } from '../town-grid.ts';
import type { RoadNetwork } from '../roads.ts';

/** How high a cloud-deck town's floor floats over the levelled deck. */
export const PLATFORM_LIFT = 2;

/** What is parked on a grid town's main streets, as craft to take: the engine's own rover models. */
export const PARKED_KITS: readonly KitCraft[] = [DEFAULT_KITS.rover!, { id: 'rover-cab', length: 11, seat: [-0.17, 0.3, 0.17], closed: true }];

/** A craft standing in a site, in the site's frame. */
export interface CraftSpot {
  vehicle: VehicleSpec;
  x: number;
  y: number;
  z: number;
  yaw: number;
}
export interface Footprint {
  /** In the town's own frame. */
  x: number;
  z: number;
  radius: number;
  height: number;
  /**
   * Which building a circle belongs to, where a building is more than one: the
   * circles of one overlap each other by design. Omitted, a building of one.
   */
  part?: number;
}

/** Where a spaceport's crew stand: round the pad, in the town's frame. */
export interface Port {
  x: number;
  z: number;
  /** The pad's radius. */
  r: number;
  /** Which way the ship points. */
  yaw: number;
}

export interface Site {
  id: string;
  name: string;
  nation: string;
  population: number;
  /** Built radius and the radius the paving reaches. */
  radius: number;
  paving: number;
  /** The square in the middle, and the avenues' angles in the town's frame. */
  plaza: number;
  avenues: number[];
  /** Half an avenue's width, units. */
  avenueHalf: number;
  /** Unit vector of the centre, the frame's origin, and the frame itself (y up). */
  dir: THREE.Vector3;
  origin: THREE.Vector3;
  quaternion: THREE.Quaternion;
  /** Where the floor is in the town's frame: 0 on a crust, the platform's top on a deck. */
  floor: number;
  /** Whether this is a landmark and not a town: one building, no people. */
  landmark: boolean;
  footprints: Footprint[];
  /** The landing pad, where the town has one. */
  port: Port | null;
  mesh: THREE.Mesh | null;
  /** Whether what stands was built from the kit, or from the code-built stand-ins. */
  kit: boolean;
  /**
   * The town laid out like Earth's (`town-grid.ts`): square, streets, plots,
   * pavements and lamps. Null for a landmark and for a civilisation without a
   * colony of kit modules, which keeps the disc of forms.
   */
  town: GridTown | null;
}

export interface Settlements {
  group: THREE.Group;
  sites: readonly Site[];
  /** How far towns are built and kept, as a multiple of the base reach: the settings' render distance. */
  reach: number;
  /** Builds and drops by distance; at most one build a call. */
  update(eye: THREE.Vector3): void;
  /** Builds every site within reach of `eye` at once: the first frame. */
  prime(eye: THREE.Vector3): void;
  /** Pushes a body of `radius` at `position` out of every wall; true if it moved. */
  collide(position: THREE.Vector3, radius: number): boolean;
  /** Height over the walkable radius of a made floor at `dir`, or null where there is none. */
  floorAt(x: number, y: number, z: number): number | null;
  /**
   * The lights of the standing towns within `LAMP_FIELD` of `point` (street
   * lanterns and lit doorways) as `x, y, z, distance` in the world, nearest
   * first, at most `max`; returns how many. `night.ts` hands them to Earth's
   * per-pixel pools.
   */
  lampsNear(point: THREE.Vector3, out: Float32Array, max: number): number;
  /**
   * The craft standing in a town or at a landmark, in its own frame: the cars
   * on its main streets, the ship on its pad, a landmark's own. Pure, so every
   * visitor finds the same ones.
   */
  craftAt(site: Site): readonly CraftSpot[];
  /** Whether a point is inside a building, for the camera. */
  blocks(point: THREE.Vector3): boolean;
  /** The nearest site to a direction, and the angle to it in radians. */
  nearest(dir: THREE.Vector3, filter?: (site: Site) => boolean): { site: Site; angle: number } | null;
  /** A site's frame point to a world position. */
  toWorld(site: Site, x: number, y: number, z: number, out: THREE.Vector3): THREE.Vector3;
  /** How brightly what glows in a town glows: about 0.6 by day and 2 at night. */
  glow: number;
  /** The roads between the towns (`roads.ts`), which the towns' main streets lead onto. */
  readonly network: RoadNetwork;
  readonly stats: { built: number; triangles: number; buildMs: number; kit: number };
  dispose(): void;
}

/** One building's place in a town's layout. */
export interface Plot {
  /** A kit building's id, a form's name, or `pad`. */
  form: string;
  x: number;
  z: number;
  yaw: number;
  scale: number;
  seed: string;
  /** The circle the plot keeps to, units; the building may sit forward in it to leave a yard. */
  room?: number;
  /** A yard of panels and plants behind it. */
  yard?: boolean;
  /** The roof piece it carries, if any. */
  roof?: string;
  /** The row along an avenue it stands in (avenue * 2 + side), and its place in it; tubes join neighbours. */
  row?: number;
  place?: number;
}
