import type * as THREE from 'three';
import type { Solid } from '../scenery/solids.ts';
import type { PropKind } from './kinds.ts';

/** A run of a merged buffer's vertices that is one prop (its wood, its leaf cards), and what the copy of it is drawn with. */
export interface PropRange {
  mesh: THREE.Mesh;
  /** First vertex and how many, in `mesh`'s geometry. */
  start: number;
  count: number;
  /** The host's own material, never a fade clone. */
  material: THREE.Material;
  /** The shadow pass's program where the host has one of its own. */
  depth?: THREE.Material;
}

/** One thing that may be knocked over, as the streamer that merged it registers it. */
export interface Prop {
  kind: PropKind;
  /** Its foot, in the host mesh's own frame. */
  x: number;
  y: number;
  z: number;
  /** How far it reaches out from its foot along the ground, and how tall it stands, units. */
  radius: number;
  height: number;
  ranges: PropRange[];
  /** Its walls among the host's solids; empty when it was never one. */
  solids: readonly Solid[];
  /**
   * Runs of the host's first range's mesh that go down with it and come back
   * with it, asked at the knock: what hangs on a building's fronts.
   */
  clings?: () => PropRange[];
}

/**
 * A merged mesh with props in it: a standing town, a drawn wood tile. The
 * streamer registers it when the mesh is shown and forgets it when the mesh
 * retires; a broken prop whose host is gone stays debris until it is swept.
 */
export interface PropHost {
  /** The frame every range is in: the mesh the props were merged into. */
  mesh: THREE.Mesh;
  props: Prop[];
  /** Takes these walls down, in one rebuild of the host's field. */
  dropSolids(solids: readonly Solid[]): void;
  /** Puts walls taken down back, as a prop stands again; without it a regrown prop stays walked through. */
  restoreSolids?(solids: readonly Solid[]): void;
}

/** What a knock reports, for the sound, the dust and the camera. */
export interface Knock {
  point: THREE.Vector3;
  kind: PropKind;
  /** The way the vehicle was going, a unit tangent, and its speed. */
  facing: THREE.Vector3;
  speed: number;
  /** The prop's own colour, linear, for what it throws. */
  hex: number;
  /** How tall it stood, units. */
  height: number;
  /** Knocked down by a blast rather than a vehicle: one of many at once. */
  blasted: boolean;
}

export interface BreakablesOptions {
  /** The ground a thrown prop lands on: the drawn land and the made surfaces, as a radius under `point`. */
  floorAt(point: THREE.Vector3): number;
  /** A prop knocked over, told once at the knock. */
  onBreak?(knock: Knock): void;
  /** A thrown prop hitting the ground, the first time: `weight` 0 to 1 by its size and fall. */
  onLand?(point: THREE.Vector3, kind: PropKind, weight: number): void;
}

export interface BreakablesStats {
  hosts: number;
  props: number;
  /** Props folded away right now; copies in the air or lying, of which lying still; and copies fading back in. */
  folded: number;
  thrown: number;
  lying: number;
  returning: number;
  /** Buildings down right now. */
  collapsed: number;
  /** Knocks since the world loaded. */
  broken: number;
}

export interface Breakables {
  /** The thrown copies' parent; add it to the scene. */
  group: THREE.Group;
  readonly stats: BreakablesStats;
  register(host: PropHost): void;
  forget(host: PropHost): void;
  /**
   * A body of `radius` swept from `from` to `to` going `velocity` by a vehicle
   * of `punch` (`punchOf`): every breakable prop in its way is knocked over
   * (its vertices folded, its wall down, a copy thrown). Returns how hard
   * the knocks are felt, at most `MAX_JOLT`, 0 for nothing hit.
   */
  strike(from: THREE.Vector3, to: THREE.Vector3, radius: number, velocity: THREE.Vector3, punch: number): number;
  /**
   * A blast of `power` 0 to 1 at `point` reaching `radius` units: everything
   * breakable in it knocked down and thrown outwards (`blown`), a building
   * near enough brought down, its wall dropped, until it stands again.
   * Returns how many went down.
   */
  blast(point: THREE.Vector3, radius: number, power: number): number;
  /** Once a frame: the thrown copies fall, bounce and lie; the old ones go; the regrown return. `dt` in seconds. */
  update(dt: number): void;
  /** Everything thrown swept away and every folded prop put back at once. */
  clear(): void;
}
