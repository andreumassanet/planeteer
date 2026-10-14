import type * as THREE from 'three';

/** One edge of the network, as `roads.bin` stores it (see `src/pack.ts`). */
export interface Road {
  /** Indices into `places`; `pnpm check` asserts the two files were baked together. */
  a: number;
  b: number;
  /** 0 lane, 1 road, 2 trunk. See `ROAD_CLASSES`. */
  cls: number;
  /**
   * Lateral bow as a fraction of the road's length: a `sin^2` bump over the
   * middle, flat at both ends so the road leaves its gate square to the kerb.
   * Baked because it decides whether the road crosses water, so the path the
   * bake tested is the path that is drawn.
   */
  bend: number;
  /**
   * The gate of town `a` the road leaves by and the gate of `b` it arrives at:
   * indices into `gatesOf(townGrid(radiusOf(place)))`. Baked for the same
   * reason as the bow; a change to `gatesOf` or `townGrid` needs a re-bake.
   */
  gateA: number;
  gateB: number;
  /**
   * The bridge over water, as distances along the path from gate A in world
   * units (first and last wet probe), or both 0 for a road that stays on land.
   * Baked for the same reason as the bow. See `BRIDGE_SPAN`.
   */
  bridgeFrom: number;
  bridgeTo: number;
  /** Depth layer: 0 in front, one behind the deepest overlapping road that outranks it. See `layersOf`. */
  layer: number;
}

export interface RoadData {
  /** How many places the graph was baked against. Asserted, not trusted. */
  places: number;
  /** Which proximity graph the bake kept. See `build-roads.ts`. */
  graph: string;
  roads: Road[];
}

export interface RoadStats {
  /** Tiles standing. */
  resident: number;
  /** Tiles wanted and waiting for a frame with room. */
  pending: number;
  /** Roads drawn, across every resident tile. */
  roads: number;
  /** Every triangle standing, the roadside's included, and the roadside's alone. */
  triangles: number;
  roadside: number;
  /** Street lamps standing down the towns' approaches. */
  lamps: number;
  megabytes: number;
  built: number;
  lastBuildMs: number;
  /** Ground reach, and the slant distance actually compared against. */
  reach: number;
  range: number;
}

export interface Roads {
  group: THREE.Group;
  stats: RoadStats;
  /**
   * Ground something else has taken, which nothing beside a road may stand
   * on: the railway's track and stations. Laid roadsides are laid again.
   */
  setTaken(taken: ((point: THREE.Vector3, footprint: number) => boolean) | null): void;
  /** One mesh per program this draws with, for `warm.ts` to compile while the menu is up. */
  proxies(): THREE.Object3D[];
  /** Every road in `roads.bin`, which is every road that is drawn. */
  all: readonly Road[];
  /** Degree of every place in the graph, for the console. */
  degrees(): { mean: number; max: number; isolated: number; histogram: number[] };
  /**
   * How high the carriageway or its bank rides here, as a radius from the
   * planet's centre, or 0 where no road is drawn over the land.
   */
  ribbonHeightAt(point: THREE.Vector3): number;
  /**
   * The land a road's bank is measured against for `ribbonHeightAt`: the
   * drawn land's radius under a point (`drawnRadius`). Unset, it is the
   * relief, which is what a headless check gets.
   */
  setGround(ground: ((point: THREE.Vector3) => number) | null): void;
  /**
   * Merges the street lamps down the towns' approaches into a list of near
   * lamp heads that already holds `count` (`x, y, z, distance`, nearest first),
   * keeping it sorted and within `radius` and the list's length. Returns the
   * new count. See `setNearLamps` in `lights.ts`.
   */
  lampsNear(viewer: THREE.Vector3, radius: number, out: Float32Array, count: number): number;
  /** Call each frame. The camera is optional; without one, admission is a radius. */
  update(viewer: THREE.Vector3, altitude: number, camera?: THREE.Camera): void;
}
