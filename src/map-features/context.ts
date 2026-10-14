import * as THREE from 'three';
import type { World } from '../geo.ts';
import type { Place } from '../places.ts';
import { type Road, emptyCourse } from '../roads.ts';
import { regionFor } from '../scenery/regions.ts';
import { biomeSample } from '../biome.ts';
import { SHEET_HEIGHT, latOfV } from '../map-tiles.ts';
import type { Affine, TileView } from '../map-tiles.ts';
import type { Raster } from '../raster.ts';
import { landmarkFrame } from '../landmark-ground.ts';
import type { EarthFeatureSources } from '../map-features.ts';

/** A road with its box in degrees, its path (worked out when first drawn) and its tarmac. */
export interface RoadEntry {
  south: number;
  north: number;
  west: number;
  east: number;
  path: Float64Array | null;
  tarmac: [number, number, number];
}

/**
 * What the painters of one Earth-features instance share: the sources, the
 * indexes built the first time a tile asks, and scratch objects reused so a
 * tile allocates nothing per mark.
 */
export interface FeatureCtx {
  readonly sources: EarthFeatureSources;
  readonly world: World;
  readonly places: readonly Place[];
  readonly roads: readonly Road[];
  readonly regionOf: (place: Place) => ReturnType<typeof regionFor>;

  /** The shown towns bucketed by degree, and the roads' boxes; null until `ready` has run. */
  townBuckets: Map<number, number[]> | null;
  roadEntries: RoadEntry[] | null;
  prepared: boolean;
  preparing: Generator<undefined, void, void> | null;
  /** Which gates each town's roads come in by, from `roads.bin`. */
  roadGates: Map<number, number[]> | null;
  /** A town's cells before its plan is known, by place index. */
  readonly townCells: Map<number, Uint8Array>;

  readonly roadCourse: ReturnType<typeof emptyCourse>;
  readonly roadColour: THREE.Color;
  readonly roadAsphalt: THREE.Color;

  // Scratch.
  readonly p: { x: number; y: number };
  readonly q: { x: number; y: number };
  readonly affine: Affine;
  readonly xs: number[];
  readonly ys: number[];
  readonly unit: THREE.Vector3;
  readonly sample: ReturnType<typeof biomeSample>;
  readonly frameAcross: THREE.Vector3;
  readonly frameNorth: THREE.Vector3;
  readonly cellScratch: { south: number; west: number; dLat: number; dLon: number };
  readonly townUp: THREE.Vector3;
  readonly landmarkUp: THREE.Vector3;
  readonly corners: THREE.Vector3[];
  readonly centre: THREE.Vector3;
}

export function createCtx(sources: EarthFeatureSources): FeatureCtx {
  const { world, places, roads } = sources;
  const continentOf = new Map<string, string>(world.countries.map((country) => [country.iso, country.continent]));
  return {
    sources,
    world,
    places,
    roads,
    regionOf: (place) => regionFor(place.iso, continentOf.get(place.iso) ?? '', place.lat),
    townBuckets: null,
    roadEntries: null,
    prepared: false,
    preparing: null,
    roadGates: null,
    townCells: new Map(),
    roadCourse: emptyCourse(),
    roadColour: new THREE.Color(),
    roadAsphalt: new THREE.Color(),
    p: { x: 0, y: 0 },
    q: { x: 0, y: 0 },
    affine: { ox: 0, oy: 0, xx: 0, xy: 0, zx: 0, zy: 0 },
    xs: [],
    ys: [],
    unit: new THREE.Vector3(),
    sample: biomeSample(),
    frameAcross: new THREE.Vector3(),
    frameNorth: new THREE.Vector3(),
    cellScratch: { south: 0, west: 0, dLat: 0, dLon: 0 },
    townUp: new THREE.Vector3(),
    landmarkUp: new THREE.Vector3(),
    corners: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()],
    centre: new THREE.Vector3(),
  };
}

export function project(f: FeatureCtx, view: TileView, xyz: ArrayLike<number>, count: number, margin: number): boolean {
  const { p, xs, ys } = f;
  xs.length = 0;
  ys.length = 0;
  let near = false;
  for (let k = 0; k < count; k++) {
    view.at({ x: xyz[k * 3]!, y: xyz[k * 3 + 1]!, z: xyz[k * 3 + 2]! }, p);
    xs.push(p.x);
    ys.push(p.y);
    if (view.inside(p.x, p.y, margin)) near = true;
  }
  // A run near enough to the tile to be on it between its points.
  if (!near && count > 1) {
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (let k = 0; k < count; k++) {
      x0 = Math.min(x0, xs[k]!);
      x1 = Math.max(x1, xs[k]!);
      y0 = Math.min(y0, ys[k]!);
      y1 = Math.max(y1, ys[k]!);
    }
    near = x1 >= -margin && y1 >= -margin && x0 <= 256 + margin && y0 <= 256 + margin;
  }
  return near;
}

/** A box in a local frame — centre, first axis `(c, s)`, half extents — as a parallelogram on the tile. */
export function localBox(raster: Raster, a: Affine, x: number, z: number, c: number, s: number, hx: number, hz: number): void {
  const cx = a.ox + a.xx * x + a.zx * z;
  const cy = a.oy + a.xy * x + a.zy * z;
  raster.box(cx, cy, (a.xx * c + a.zx * s) * hx, (a.xy * c + a.zy * s) * hx, (-a.xx * s + a.zx * c) * hz, (-a.xy * s + a.zy * c) * hz);
}


/** The same box's four corners, for its ink. */
export function localCorners(f: FeatureCtx, a: Affine, x: number, z: number, c: number, s: number, hx: number, hz: number): void {
  const { xs, ys } = f;
  xs.length = 0;
  ys.length = 0;
  for (const [i, j] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    const lx = x + c * hx * i - s * hz * j;
    const lz = z + s * hx * i + c * hz * j;
    xs.push(a.ox + a.xx * lx + a.zx * lz);
    ys.push(a.oy + a.xy * lx + a.zy * lz);
  }
}

/** The tangent frame at a point, as `townFrame` builds it. */
export function frameAt(f: FeatureCtx, up: THREE.Vector3): void {
  const { frameAcross, frameNorth } = f;
  landmarkFrame(up, frameAcross, frameNorth);
}

/** The latitude at a tile's pixel row. */
export function latAt(view: TileView, y: number): number {
  return latOfV(Math.min(SHEET_HEIGHT, Math.max(0, view.v0 + y / view.scale)));
}

/** Whether a box in degrees overlaps the tile, taking the sheet's copies either side. */
export function overlaps(view: TileView, s: number, n: number, w: number, e: number): boolean {
  if (n < view.south || s > view.north) return false;
  for (const shift of [0, -360, 360]) if (e + shift >= view.west && w + shift <= view.east) return true;
  return false;
}
