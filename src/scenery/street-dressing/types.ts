import * as THREE from 'three';
import type { FloorField } from '../floor.ts';
import type { TownGrid } from '../grid.ts';
import type { Solid } from '../solids.ts';
import type { PropModels } from './models.ts';

/** A built variant as `settlements.ts` flattened it: what `facadeOf` reads. */
export interface FacadeSource {
  position: Float32Array;
  normal: Float32Array;
  glow: Uint8Array;
  box: { minX: number; maxX: number; minZ: number; maxZ: number };
  height: number;
}

/** One building facing a street: its variant, where it stands and its wall. */
export interface DressFront {
  flat: FacadeSource;
  /** Variant space to the town's frame: yaw, uniform scale, and the seat on its terrace. */
  matrix: THREE.Matrix4;
  solid: Solid;
  kind: string;
  /** A baked CC0 building (`RegionStyle.assets`), whose windows have no shutters of their own. */
  baked: boolean;
}

export interface DressInput {
  seed: string;
  /** `RegionStyle.id`. */
  region: string;
  /** The country, for the colour of its post boxes. */
  iso: string;
  /** `urbanityOf` the town's population, 0 to 1. */
  urbanity: number;
  grid: TownGrid;
  /** `streetBand` for the town's region. */
  band: number;
  /** Every paved cell's terrace, by `cellKey`: `Ground.terraces`. */
  levels: ReadonlyMap<number, number>;
  field: FloorField;
  /** The gates' mouths, which flare the street into the plots: kept clear. */
  mouths: readonly (readonly [number, number, number, number])[];
  fronts: readonly DressFront[];
  /** Everything that already stands as a wall: buildings, benches, parked cars. */
  solids: readonly Solid[];
  /** Round things in the way, as `x, z, radius` triples: lamps, lights, trees. */
  discs: readonly number[];
  /** Whether a landmark's ground reaches `(x, z)`. */
  blocked(x: number, z: number): boolean;
  /** The ground a building may take in a cell: `rectOf` for the one cell. */
  plotRect(col: number, row: number): { x0: number; x1: number; z0: number; z1: number };
  /** The paving at `(x, z)` on the terrace `level`, as a point of the town's frame, into `out`. */
  seat(x: number, z: number, level: number, out: number[]): void;
  /** The paving's distance from the planet's centre on the terrace `level`: a wall's base. */
  floorRadius(level: number): number;
  /** The most triangles the dressing may add. */
  budget: number;
  /** The region's carriageway colour (`GroundStyle.road`), which the ironwork on it is a darker tone of. */
  road: number;
  /** Where the CC0 pieces come from (`propModels`); null draws every piece in code. */
  models: PropModels | null;
}

export interface DressSeat {
  kind: string;
  /** The item's base on the paving, in the town's frame. */
  x: number;
  y: number;
  z: number;
  /** A decal's lift over the paving, which a seat check expects; 0 for what stands on it. */
  lift: number;
}

/**
 * Somewhere a piece offers: `'seat'`, a café chair's sitter's spot and the way
 * a sitter faces (what `Bench.position` and `Bench.facing` are); `'bike'`, a
 * rack's slot, the middle of where a bicycle stands and the way its front
 * points. On the paving, in the town's frame.
 */
export interface Anchor {
  kind: 'seat' | 'bike';
  x: number;
  y: number;
  z: number;
  fx: number;
  fz: number;
}

export interface Dressed {
  position: Float32Array;
  normal: Float32Array;
  color: Float32Array;
  glow: Uint8Array;
  triangles: number;
  emits: boolean;
  solids: Solid[];
  seats: DressSeat[];
  /** The chairs' seats and the racks' slots. */
  anchors: Anchor[];
  counts: Record<string, number>;
}
