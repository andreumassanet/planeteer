/** The countryside builder's types and the constants its meshes share. */
import type * as THREE from 'three';
import type { BodyKind } from '../scenery/occupancy.ts';
import type { LeafArrays } from '../scenery/tree-forms.ts';
import type { LandProbe } from '../land-probe.ts';
import type { CountryPlan } from '../countryside.ts';
import type { RotorKind } from '../countryside-kit.ts';

/** Over the drawn land, by level: clears the land's own creases between a field's vertices; coarser levels, seen from further, need more for the depth buffer to tell the two apart. */
export const FIELD_LIFTS = [0.22, 0.3, 0.5, 0.8];
/** Over the relief, where the drawn land cannot be asked. */
export const FAR_FIELD_LIFT = 1.6;
/** How far the skirt of such a field goes into the ground below it. */
export const FAR_SKIRT = 3.5;
/** The longest a field's strip runs between two heights, by level: the drawn land's creases are what it follows. */
export const SEGMENT = [6, 12, 40, 80];
/** Levels whose tiles hand what turns to the moving mesh, rather than merging it still. */
export const MOTION_LEVEL = 1;
/** How far a piece is bedded: burying is invisible, floating is not. */
export const PIECE_BURY = 0.2;

/** The parts that are the fleet's own vehicles, standing still until one is taken (`CountryMachine`). */
export const MACHINES: ReadonlySet<string> = new Set(['tractor']);

/** A flattened build: what `vegetation/tiles.ts` calls a `FlatVariant`. */
export interface CountryFlat {
  position: Float32Array;
  normal: Float32Array;
  color: Float32Array;
  outline: Float32Array;
  triangles: number;
  height: number;
  footprint: number;
  tilt: number;
  /** What it is to a body walking into it; absent, nothing. */
  solid?: BodyKind;
  /** A building's `atlasSurface` bytes, one a vertex (`src/surfaces.ts`); absent, drawn as it is. */
  surface?: Uint8Array;
  /** Its panes' corners, two bytes a vertex, where it has glass. */
  pane?: Uint8Array | null;
}

export interface CountryPlaced {
  flat: CountryFlat;
  matrix: THREE.Matrix4;
  /** A near tree's leaf cards and whether its wood bends in the wind. */
  leaves?: LeafArrays | null;
  sways?: boolean;
  /** A vehicle that can be taken (a farm's tractor). */
  machine?: CountryMachine;
}

/**
 * A vehicle the countryside stands that the fleet can take: a farm's tractor,
 * named `countryVehicleId` of its cell and its ordinal there, merged into its
 * tile as the fleet's own craft in the look its id decides (`craft/parked.ts`).
 */
export interface CountryMachine {
  id: string;
  /** The craft that takes its place. */
  model: string;
  /** Its base, and the way it faces, in the world. */
  position: THREE.Vector3;
  forward: THREE.Vector3;
}

/** Rows of numbers for `countryside-motion.ts`, world space. */
export interface CountryMotionRows {
  /** Per rotor: hub (3), axis (3), up (3), kind index, phase, scale. */
  rotors: Float32Array;
  /** Per lamp: position (3), up (3), phase. */
  beacons: Float32Array;
  /** Per fire: position (3), up (3). */
  smokes: Float32Array;
}
export const ROTOR_STRIDE = 12;
export const BEACON_STRIDE = 7;
export const SMOKE_STRIDE = 6;
export const ROTOR_KINDS: readonly RotorKind[] = ['sails', 'blades', 'vanes'];

export interface CountryTile {
  placed: CountryPlaced[];
  vertices: number;
  /** The vertices it would have were every tree drawn as lumps: what the budget counts. */
  priced: number;
  pieces: number;
  fields: number;
  fences: number;
  motion: CountryMotionRows | null;
  /** Built near without the drawn land to lay its fields on: to be built again when it answers. */
  provisional: boolean;
}

/** The tile being built, as the countryside needs it: its level, its frame and world to tile. */
export interface CountryFrame {
  level: number;
  across: THREE.Vector3;
  north: THREE.Vector3;
  /** World to the tile's own space. */
  inverse: THREE.Matrix4;
  /** A near tile: a tree is its wood and its leaf cards, not its lumps. */
  cards?: boolean;
  /** Where each piece's base went, while `vegetation.sample` is asking. */
  seats?: { id: string; x: number; y: number; z: number; reach: number; drawn: boolean }[];
}

export interface CountryBuilder {
  /** The plans of every finest cell under a tile. */
  plansUnder(level: number, row: number, column: number): CountryPlan[];
  /**
   * Works out the plans under a tile that are not yet, one at least and then
   * while `more` says the frame has room; true when all of them are. A coarse
   * tile holds sixty-four cells, which is tens of milliseconds planned cold,
   * so the streamer spreads them over frames before it builds the tile.
   */
  ensure(level: number, row: number, column: number, more: () => boolean): boolean;
  /** Readies the keepouts for a tile, in its frame; `blocks` answers against them until the next call. */
  prepare(plans: readonly CountryPlan[], frame: CountryFrame): void;
  /** Whether a plant `spread` wide at (x, z) in the tile's frame stands on something planned. */
  blocks(x: number, z: number, spread: number): boolean;
  /** The tile's share of the countryside. `floor` is the smallest thing legible at its level. */
  build(plans: readonly CountryPlan[], frame: CountryFrame, floor: number, land: LandProbe | undefined, landReady: boolean): CountryTile;
  /** Whether a vehicle the countryside stands has been taken, asked by every build. Until set, nothing has been. */
  setTaken(test: (id: string) => boolean): void;
}
