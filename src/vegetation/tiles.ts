/** The streamer's internal records: tiles, what stands, what a build returns. */
import type * as THREE from 'three';
import type { LeafArrays } from '../scenery/tree-forms.ts';
import type { BodyKind } from '../scenery/occupancy.ts';
import type { Solid, SolidField } from '../scenery/solids.ts';
import type { ParkedCar } from '../settlements.ts';
import type { CountryMotionRows } from '../countryside-tile.ts';
import type { PlanShape } from '../landmark-ground.ts';

/**
 * Tiles at or under this level draw a tree as it is (wood plus alpha-tested
 * leaf cards, both in the wind); coarser tiles merge the part's own lumpy
 * build. The budget prices a near tile as its lumps (`Built.priced`), so the
 * cards cost memory and triangles on top without shrinking the near field.
 */
export const CARD_LEVEL = 1;

/** Tiles at or under this level are solid to a walking body. */
export const SOLID_LEVEL = 1;
/** Past a tile's half-diagonal, how far a query may still reach into its solids. */
export const SOLID_MARGIN = 20;

/** One built variant, reduced to the arrays a tile is assembled from by `mergeMeshes`. */
export interface FlatVariant {
  position: Float32Array;
  normal: Float32Array;
  color: Float32Array;
  /** The ink's normals: a painted part's welded `outlineNormal`, a code part's own normal. */
  outline: Float32Array;
  triangles: number;
  height: number;
  footprint: number;
  /** How far this one follows the slope it stands on (`TILT_OF`). */
  tilt: number;
  /** What it is to a body walking into it; absent, nothing. */
  solid?: BodyKind;
}

/** What a near tile draws of a tree: its wood as a flat variant, and its cards. */
export interface NearVariant {
  wood: FlatVariant;
  leaves: LeafArrays;
}

/** A tile's solids, in its own tangent frame. */
export interface TileWalls {
  field: SolidField;
  /** What `field` was made of, for a taken vehicle to remove its own. */
  solids: Solid[];
  across: THREE.Vector3;
  north: THREE.Vector3;
  up: THREE.Vector3;
  /** `up . direction` over this and a point may be near enough to meet a solid. */
  cosBound: number;
}

/**
 * A vehicle standing in a tile that the fleet can take (a farm's tractor), and
 * where it is in the tile's buffer and walls.
 */
export interface TileMachine extends ParkedCar {
  start: number;
  count: number;
  solids: Solid[];
  hidden: boolean;
}

/** Where a tile sits in the quadtree. */
export interface Cell {
  level: number;
  row: number;
  column: number;
}

export interface Tile extends Cell {
  key: string;
  /** Unit vector at the tile centre. */
  direction: THREE.Vector3;
  lat: number;
  lon: number;
  /** Half the tile's extent along the ground, east and north, in world units. */
  halfEast: number;
  halfNorth: number;
  /**
   * The tile centre in world space, on the relief (the frustum is tested on
   * it; the tallest peak is 620 units, so the sea-level sphere would not bound
   * the ground).
   */
  centre: THREE.Vector3;
  /** Bounding radius, padded by `TILE_SLACK`. */
  radius: number;
  distance: number;
}

export interface Standing extends Cell {
  mesh: THREE.Mesh;
  /** What the budget counts it as (`CARD_LEVEL`). */
  priced: number;
  /** Its leaf cards, a child of `mesh`, dissolving with it; null past `CARD_LEVEL`. */
  leaves: THREE.Mesh | null;
  triangles: number;
  plants: number;
  bytes: number;
  /** The countryside's pieces, fields and fences in it. */
  pieces: number;
  fields: number;
  fences: number;
  /** What in it turns, shines or smokes; null for nothing. */
  motion: CountryMotionRows | null;
  /** In the group and drawn. False while it waits for what it replaces. */
  shown: boolean;
  walls: TileWalls | null;
  /** Its trees' crowns in world space, while it is drawn. */
  crowns: Float32Array | null;
  machines: TileMachine[] | null;
}

/**
 * Whether two tiles cover any of the same ground: one is the other or an
 * ancestor of it. A tile's parent is `(level + 1, row >> 1, column >> 1)`.
 */
export function overlaps(a: Cell, b: Cell): boolean {
  const low = a.level <= b.level ? a : b;
  const high = low === a ? b : a;
  const shift = high.level - low.level;
  return low.row >> shift === high.row && low.column >> shift === high.column;
}

/** What building one tile returns. */
export interface Built {
  mesh: THREE.Mesh | null;
  /** The vehicles in it that can be taken, and where they are in its buffer. */
  machines: TileMachine[] | null;
  /** What the budget counts it as: its triangles drawn as lumps. */
  priced: number;
  /** The leaf cards, a child of `mesh`; only at or under `CARD_LEVEL`. */
  leaves: THREE.Mesh | null;
  triangles: number;
  plants: number;
  bytes: number;
  /** Plots the grid offered, before cover, sea, keepouts and legibility. */
  plots: number;
  inTheSea: number;
  builtOver: number;
  /** Plots refused for a carriageway or its verge. */
  onRoad: number;
  /** Plots refused for ground steeper than `MAX_SLOPE`. */
  onSlope: number;
  /** Plots refused for a farm, field or fence of the countryside. */
  onCountry: number;
  fastPath: boolean;
  pieces: number;
  fields: number;
  fences: number;
  motion: CountryMotionRows | null;
  /** Near, with fields laid on the relief because the drawn land was not ready: built again when it is. */
  provisional: boolean;
  walls: TileWalls | null;
  /** Its trees' crowns in world space, `CROWN_STRIDE` floats each. */
  crowns: Float32Array | null;
}

/** A keepout around something built, in a tile's frame. */
export interface Keepout {
  x: number;
  z: number;
  radius: number;
  /** Which built place this is, for the grass's town squares. */
  index: number;
  /** A monument's plan; null for a town's disc. */
  shape: PlanShape | null;
}

/** A stretch of carriageway in the tile's frame, and how far its verge reaches. */
export interface RoadKeepout {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** Half the drawn ribbon (`roadClearance`); the plant adds its own spread. */
  clearance: number;
}

/** A plane's or balloon's field in the tile's frame; the plant adds its spread. */
export interface FieldDisc {
  x: number;
  z: number;
  radius: number;
}
