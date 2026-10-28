/** The vegetation streamer's public types. */
import type * as THREE from 'three';
import type { MonumentContext } from '../monuments/contract.ts';
import type { Placement } from '../placement.ts';
import type { Place } from '../places.ts';
import type { Road } from '../roads.ts';
import type { ParkedCar, Settlements } from '../settlements.ts';
import type { FieldIndex } from '../fleet.ts';
import type { Countryside, CountrysideStats } from '../countryside.ts';
import type { CountryMotionRows } from '../countryside-tile.ts';
import type { Breakables } from '../breakables/types.ts';

/** What the grass needs to know at one point. */
export interface GrassSite {
  /** The surface it grows on, as a distance from the planet's centre: the drawn land, or a town's lawn. */
  radius: number;
  /** How thick, 0 to 1: the biome's `sward`, laid between the lattice's corners. */
  density: number;
  /** The linear colour it grows from: the ground's, or the crop's in a field of straw. */
  r: number;
  g: number;
  b: number;
  /** How dry, 0 green to 1 straw. */
  dry: number;
  /** How tall it stands: 1, `STRIP_MOWN` on an airstrip, less where the countryside has worn it down. */
  height: number;
  /**
   * How far the ground it grows on goes on past the site, in units: a town's
   * ground's clearance from its streets, walls and risers, less a blade's
   * lean, up to `GRASS_EDGE`; `GRASS_OPEN` on open ground. The field stands a
   * blade only within a growing texel's edge of it, measured square, as the
   * town's margins are.
   */
  edge: number;
}

/** The most a town's `GrassSite.edge` says: over half the coarse field's texel, so a lawn's texels' reaches meet. */
export const GRASS_EDGE = 3;
/** Open ground's `GrassSite.edge`: far enough that laid between texels it never stops a blade the density grows. */
export const GRASS_OPEN = 1000;

/**
 * The questions `grass.ts` asks. Whether grass grows at a point, how thick, in
 * what colour and on what surface is decided here and nowhere else, so it
 * obeys the same refusals as the wood. Slope is the one it ignores: grass
 * stands on any face the land probe keeps.
 */
export interface GrassGround {
  /** Whether the drawn land is gathered along `direction` (a unit vector), so an `at` there is an answer. */
  covers(direction: THREE.Vector3): boolean;
  /**
   * Gathers what is built within `reach` units of `direction` (monuments,
   * towns' squares, carriageways) for the `at`s that follow, into lists of its
   * own so a tile built in between is undisturbed.
   */
  gather(direction: THREE.Vector3, reach: number): void;
  /**
   * The grass at `direction`, inside the last `gather`: the ground it stands
   * on, at no density where the ground goes on bare (sand, a verge, a paddy),
   * or null where there is no ground for it (the sea, a town's paving).
   * `spread` (units) widens every keep-off of a made surface by that much.
   */
  at(direction: THREE.Vector3, out: GrassSite, spread?: number): GrassSite | null;
  /** `settlements.floorChanges`, passed through. */
  floorChanges(since: number, into: number[]): number;
  /** Moves when every answer may have: the prominence knob, which builds and unbuilds towns. */
  version(): number;
}

export interface VegetationStats {
  /** Tiles standing in the world right now. */
  tiles: number;
  /** Wanted, and waiting for a frame with room to build them. */
  pending: number;
  /** Of those, the ones within `NEAR_BUILD` of the viewer. `main.ts` holds the arrival curtain until it is zero. */
  nearPending: number;
  /** Plants standing. */
  plants: number;
  /** Leaf cards standing, and whether a finest tile of them is drawn (the shadow map is redrawn every frame while it is). */
  cards: number;
  swaying: boolean;
  /** Triangles of resident geometry. */
  triangles: number;
  /** Megabytes of vertex buffers held by resident tiles. */
  megabytes: number;
  /** Tiles built since the world loaded. Rising while you stand still is a bug. */
  built: number;
  /** Tiles found to be all sea or all ice, remembered so they are asked once. */
  barren: number;
  /** Milliseconds the last build took. */
  lastBuildMs: number;
  /** How far vegetation is built, as a slant distance. */
  range: number;
  /** The same along the ground. */
  reach: number;
  /** Resident tiles by level, finest first. */
  byLevel: number[];
  /** Tiles no longer wanted and still drawn until their replacements arrive. */
  retiring: number;
  /** Tiles built and not yet drawn because what they replace is still standing. */
  staged: number;
  /** The countryside's plans and what the standing tiles hold of them. */
  country: CountrysideStats & {
    pieces: number;
    fields: number;
    fences: number;
    rotors: number;
    beacons: number;
    smokes: number;
    /** Near tiles waiting for the drawn land to lay their fields on. */
    provisional: number;
  };
}

export interface Vegetation {
  group: THREE.Group;
  stats: VegetationStats;
  /** One mesh per program this draws with, for `warm.ts` to compile while the menu is up. */
  proxies(): THREE.Object3D[];
  /** Parts a biome table names that the registry has no file for. */
  missing: string[];
  /** Anything that refused to build, with the contract's complaint. */
  broken: string[];
  /**
   * Call each frame. Streams tiles in and out and spends a few ms building.
   * Without a camera every tile in range is admitted; with one, only what is
   * on the screen is built.
   */
  update(viewer: THREE.Vector3, altitude: number, camera?: THREE.Camera): void;
  /** Builds the tile under a point twice and reports whether the two agree. */
  verify(lat: number, lon: number, level?: number): unknown;
  /** What one tile costs and what is standing on it, for the console. */
  sample(lat: number, lon: number, level?: number): unknown;
  /** Whether grass grows at a point and on what, for `grass.ts`; null without the drawn land. */
  grass: GrassGround | null;
  /**
   * The tile over a point at a level, built as the streamer builds it and
   * handed over placed, or null if nothing grows there; the caller disposes
   * its geometry. For the headless checks.
   */
  raiseTile(lat: number, lon: number, level?: number): THREE.Mesh | null;
  /** The countryside's planner, for the console. Null without the places. */
  countryside: Countryside | null;
  /**
   * The trunks, boulders and farm buildings of the drawn tiles near a point
   * as walls: `settlements.collide`'s contract, the displacement along the
   * ground in `push`.
   */
  collide(point: THREE.Vector3, radius: number, push: THREE.Vector3): boolean;
  /** `settlements.freeSpotNear`'s contract, against the same solids. */
  freeSpotNear(point: THREE.Vector3, radius: number, out: THREE.Vector3): boolean;
  /** Whether a point is inside a farm building and under its roof. For the camera. */
  blocksSight(point: THREE.Vector3): boolean;
  /**
   * The vehicles the countryside stands in the drawn tiles within `radius` of
   * `viewer` that can be taken and have not been. Appends to `out`.
   */
  parkedNear(viewer: THREE.Vector3, radius: number, out: ParkedCar[]): void;
  /** One of them has been taken: folded out of every tile that draws it, and its wall down. Idempotent. */
  hideParked(id: string): void;
  /** Whether one has been taken, asked by every tile built; until set, nothing has. */
  setParkedTaken(test: (id: string) => boolean): void;
  /**
   * The crowns of the drawn near tiles within `range` units of `point`, as
   * `(list, offset)` into a flat list of `CROWN_STRIDE` floats each (see
   * `placeCrown`). What the falling leaves and litter are laid from.
   */
  crownsNear(point: THREE.Vector3, range: number, visit: (list: Float32Array, offset: number) => void): void;
  /** Every drawn tile's rotors, lamps and fires. A staged tile is not drawn; a retiring one is. */
  motion(visit: (rows: CountryMotionRows) => void): void;
}

/**
 * Where a plant's base went, in world space: its part, whether it is a tree
 * (upright but for its lean) or follows the slope, its height and the reach
 * its seat was measured over. `sample` hands them back for `pnpm seated`.
 */
export interface PlantSeat {
  id: string;
  tree: boolean;
  /** Seated on the drawn land, rather than on the relief where the probe had not gathered. */
  drawn: boolean;
  x: number;
  y: number;
  z: number;
  height: number;
  reach: number;
}

export interface VegetationOptions {
  /** Share the monument context, so one material cache serves the whole world. */
  context?: MonumentContext;
  /** Settlements, so nothing grows where something is built or paved. */
  places?: readonly Place[];
  /** Monuments, so nothing grows inside one. */
  monuments?: readonly Placement[];
  /**
   * The pruned road network `main.ts` hands the streamer. It indexes into
   * `places`, so the two arrive together or not at all. Every road keeps its
   * verge whatever is drawn, so a tile is the same however often it is built.
   */
  roads?: readonly Road[];
  /** The land mesh (`buildLand`), which the grass stands on. Without it there is no grass. */
  land?: THREE.Mesh;
  /** The towns' lawns, which the grass grows on too. */
  lawns?: Pick<Settlements, 'swardAt' | 'floorChanges'>;
  /**
   * The fields a light plane or a balloon stands in, so no tree grows through
   * a wing. The grass grows in them, mown on an airstrip's strip.
   */
  fields?: FieldIndex;
  /** Where a drawn tile registers the trees a vehicle may knock over (`breakables.ts`). Without it no tree breaks. */
  breakables?: Pick<Breakables, 'register' | 'forget'>;
}
