/** Types shared by the small life's parts: the options, the frame, the cells, the crowns and the buffers. */
import type { BiomeId } from '../biome.ts';
import { birdGeometry } from '../life.ts';
import * as THREE from 'three';

export interface AmbientOptions {
  /** The drawn land's radius under a point (`drawnRadius`). */
  groundAt(point: THREE.Vector3): number;
  /** A town's floor or a road's ribbon under a point, as a radius, or 0 (`main.ts`'s `madeHeightAt`). */
  madeHeightAt(point: THREE.Vector3): number;
  /** Whether a unit direction is inside a meadow of the countryside (`countryside.meadowAt`). */
  meadowAt?(direction: THREE.Vector3): boolean;
  /**
   * The crowns within `range` units of a point that shed, as `(list, offset)`
   * into flat lists of `CROWN_STRIDE` floats (`placeCrown` in
   * `tree-forms.ts`): `vegetation.crownsNear` and `settlements.crownsNear`
   * together.
   */
  crownsNear?(point: THREE.Vector3, range: number, visit: (list: Float32Array, offset: number) => void): void;
  /** Whether a unit direction is over a harbour town or its water, where the gulls gather (`harbours/towns.ts`). */
  harbourNear?(direction: THREE.Vector3): boolean;
  /** A splash on the water at a point, `reach` units across (`effects.splashAt`). */
  splash?(point: THREE.Vector3, reach: number): void;
  /**
   * How many new cells a frame may work out. Each is a biome, a coast
   * distance and seven ground heights; the headless check lifts it.
   */
  admitPerFrame?: number;
}

/** The weather where the player is, as `weather-view.ts`'s `here()` gives it: only what this reads. */
export interface AmbientWeather {
  precipitation: number;
  snow: number;
  storm: number;
  fog: number;
  temperatureC: number;
  lying: number;
  wind: { speed: number; from: number };
}

export interface AmbientFrame {
  /** The player: the range is centred here. */
  player: THREE.Vector3;
  /** The camera's height over the ground under the player, in units. */
  cameraHeight: number;
  /** The sky's clock: the season. */
  time: Date;
  /** `sky.state.daylight`, 0 full night to 1 full day. */
  daylight: number;
  /** On the water: swimming or in a boat, when the fish jump anywhere near and not only off the shore. */
  afloat: boolean;
}

export interface AmbientStats {
  enabled: boolean;
  /** Small cells in range, and cells worked out since the page loaded. */
  cells: number;
  gullCells: number;
  admitted: number;
  fireflies: number;
  motes: number;
  butterflies: number;
  /** Leaves in the air, and fallen ones lying before they go. */
  leaves: number;
  lying: number;
  /** The crowns in range that shed, and the leaves lying under them (`LITTER_MAX` a crown at most). */
  crowns: number;
  litter: number;
  /** Ground heights asked for the leaves since the page loaded: a landing each, and one a leaf of litter. */
  groundAsks: number;
  fish: number;
  gulls: number;
  /** On the beaches in range: shells, sandcastles and crabs drawn. */
  shells: number;
  castles: number;
  crabs: number;
  /** 0 to 3. */
  calls: number;
  /** Why the insects are in, if they are: `rain`, `cold`, `wind`, `snow`, or `''`. */
  quiet: string;
  /** Autumn here, 0 to 1. */
  autumn: number;
  updateMs: number;
}

export interface Ambient {
  group: THREE.Group;
  /** Off hides both meshes and does no work; the Settings card's *Effects* switch carries it. */
  enabled: boolean;
  readonly stats: AmbientStats;
  /** Every frame. `weather` is read at most every `WEATHER_EVERY` seconds. */
  update(dt: number, frame: AmbientFrame, weather: () => AmbientWeather): void;
  /**
   * Every live creature's position, rounded to a thousandth and sorted: two
   * runs that end at the same place and clock agree on this, however they got
   * there. For the headless check and the console.
   */
  snapshot(): string[];
  /** One mesh per program, for `warm.ts`. */
  proxies(): THREE.Object3D[];
}



/** A small cell, worked out once and kept. */
export interface Cell {
  key: number;
  row: number;
  column: number;
  /** Unit vector at its middle, and the local frame there. */
  up: THREE.Vector3;
  east: THREE.Vector3;
  north: THREE.Vector3;
  biome: BiomeId;
  water: boolean;
  /** Units to the nearest water. */
  shore: number;
  town: boolean;
  meadow: boolean;
  fireflies: number;
  butterflies: number;
  motes: number;
  fish: boolean;
  /** The anchors: ground points as unit direction and radius, `[x, y, z, r]` each. */
  anchors: Float32Array;
  anchorCount: number;
  /** What lies on a beach cell: `BEACH_STRIDE` floats a thing (`ambient/beach.ts`), or null. */
  beach: Float32Array | null;
  /** The clock when it was worked out, for the fade in. */
  born: number;
  /** The last jump slot splashed going in and coming out. */
  fishIn: number;
  fishOut: number;
  /** This frame's fade, distance and age together. */
  fade: number;
}

/** A gull cell: the sky over a stretch of coast. */
export interface GullCell {
  key: number;
  up: THREE.Vector3;
  east: THREE.Vector3;
  north: THREE.Vector3;
  /** How many gulls wheel here, 0 to 3, and the height they wheel at. */
  count: number;
  altitude: number;
  row: number;
  column: number;
  born: number;
  fade: number;
}


/** A crown that sheds, as the near wood or a near town handed it over, worked out once and kept. */
export interface Crown {
  /** Where it stands, hashed: the same crown whoever built it. */
  key: number;
  /** Its middle's unit direction and the frame there; its middle's radius, and the ground's under it. */
  up: THREE.Vector3;
  east: THREE.Vector3;
  north: THREE.Vector3;
  middle: number;
  foot: number;
  radius: number;
  half: number;
  colour: THREE.Color;
  shed: number;
  distance: number;
  /** The scan that last found it, so two tiles overlapping in a swap hand it in once. */
  scan: number;
  born: number;
  /** Its litter's ground radii, `NaN` until asked and `-1` on water; `asked` of them so far. */
  litter: Float32Array;
  asked: number;
}

/** Where a leaf lets go and lands, fixed when it lets go: the drift and the ground there. */
export interface Landing {
  cycle: number;
  /** Where it lets go, across the crown's frame, and how far it drifts by the time it lands. */
  e: number;
  n: number;
  de: number;
  dn: number;
  /** The radius of what it lies on. */
  radius: number;
  seen: number;
}

/** Everything that changes during a run, apart from the buffers and the cell maps. */
export interface AmbientState {
  lightCursor: number;
  vertexCursor: number;
  clock: number;
  pending: boolean;
  scanId: number;
  crownBudget: number;
  litterAsks: number;
  litterDirty: boolean;
  litterAge: number;
  litterCount: number;
  weatherAge: number;
  sinceScan: number;
}

/** Vectors reused by every creature, so a frame allocates nothing. */
export interface Scratch {
  point: THREE.Vector3;
  other: THREE.Vector3;
  forward: THREE.Vector3;
  right: THREE.Vector3;
  lift: THREE.Vector3;
  tipA: THREE.Vector3;
  tipB: THREE.Vector3;
  axisA: THREE.Vector3;
  axisB: THREE.Vector3;
  scanUp: THREE.Vector3;
}

/** The three meshes and the arrays behind them. */
export interface Buffers {
  group: THREE.Group;
  lights: THREE.Points;
  lightMat: THREE.ShaderMaterial;
  lightGeometry: THREE.BufferGeometry;
  lightAttributes: THREE.BufferAttribute[];
  lightPosition: Float32Array;
  lightGlow: Float32Array;
  lightSize: Float32Array;
  lightKind: Float32Array;
  gull: ReturnType<typeof birdGeometry>;
  gullVertices: number;
  MAX_VERTICES: number;
  bodies: THREE.Mesh;
  bodyMat: THREE.MeshToonMaterial;
  bodyGeometry: THREE.BufferGeometry;
  bodyAttributes: THREE.BufferAttribute[];
  bodyPosition: Float32Array;
  bodyNormal: Float32Array;
  bodyColor: Float32Array;
  litter: THREE.Mesh;
  litterMat: THREE.MeshToonMaterial;
  litterGeometry: THREE.BufferGeometry;
  litterAttributes: THREE.BufferAttribute[];
  litterPosition: Float32Array;
  litterNormal: Float32Array;
  litterColor: Float32Array;
}

/** Appends to the lights and to the body triangles. */
export interface Writer {
  light(at: THREE.Vector3, glow: number, size: number, kind: number): void;
  triangle(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, colour: THREE.Color): void;
  vertex(p: THREE.Vector3, nx: number, ny: number, nz: number, colour: THREE.Color): void;
}

/** What the sub-systems share. */
export interface AmbientContext {
  options: AmbientOptions;
  admitPerFrame: number;
  stats: AmbientStats;
  state: AmbientState;
  scratch: Scratch;
  buffers: Buffers;
  writer: Writer;
}
