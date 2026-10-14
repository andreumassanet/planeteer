import type { World } from '../geo.ts';
import type { PlanetSurface } from '../planet.ts';
import type { XYZ } from '../sphere.ts';
import type { SheetRing } from '../map-outline.ts';
import type { Raster } from '../raster.ts';
import type { TileStore } from '../tile-store.ts';

/** An affine from a local frame's `(x, z)`, world units, to tile pixels. */
export interface Affine {
  ox: number;
  oy: number;
  /** Pixels for one unit along local `x`, and along local `z`. */
  xx: number;
  xy: number;
  zx: number;
  zy: number;
}

/** One tile, as a features painter sees it. */
export interface TileView {
  readonly z: number;
  readonly i: number;
  readonly j: number;
  /** The tile's top-left corner on the sheet, and pixels per sheet unit. */
  readonly u0: number;
  readonly v0: number;
  readonly scale: number;
  /** Its extent in degrees: `west` may be under -180 by nothing; the tile is inside one copy of the sheet. */
  readonly south: number;
  readonly north: number;
  readonly west: number;
  readonly east: number;
  /** World units a pixel, east-west at the tile's middle latitude. */
  readonly unitsPerPixel: number;
  /** The planet's radius, world units. */
  readonly radius: number;
  /** A latitude and longitude to tile pixels, the longitude taken on the copy nearest the tile. */
  px(lat: number, lon: number, out: { x: number; y: number }): void;
  /** A point on the sphere (any length) to tile pixels. */
  at(point: XYZ, out: { x: number; y: number }): void;
  /**
   * A local frame — a town's, a landmark's — as an affine onto the tile,
   * from the frame's own three vectors: nothing here assumes which way its
   * `x` points (on this planet `across` is west; `landmarkFrame`).
   */
  frame(up: XYZ, across: XYZ, north: XYZ, out: Affine): Affine;
  /** Whether a point in pixels is within `margin` of the tile. */
  inside(x: number, y: number, margin: number): boolean;
  /** True once the tile has waited `WAIT_LIMIT_MS` for data: paint what is known and say so. */
  readonly hurry: boolean;
  /** Set by a painter that painted without data it waited for: the tile is not stored. */
  incomplete: boolean;
}

/**
 * What stands, painted over the ground. A generator so a tile with a city on
 * it yields between its streets: `undefined` is "more to do", `'wait'` is
 * "data I asked for is not there yet" — the tile is put back and the next
 * one painted meanwhile.
 */
export interface MapFeatures {
  /** Part of every stored tile's key: what the painter's data is (counts, versions). */
  readonly stamp: string;
  /** The first level anything is drawn at; the ground alone above it. */
  readonly fromLevel: number;
  paint(view: TileView, raster: Raster): Generator<'wait' | undefined, void, void>;
}

export interface TilePainterOptions {
  world: World;
  /** The body; Earth when omitted. */
  surface?: PlanetSurface;
  features?: MapFeatures;
}

export interface TilePainter {
  /** The rings on the sheet, which `map.ts` draws its coast and frontiers from. */
  rings(): SheetRing[];
  /** The ground's stamp: the style, the body and its outlines. What the bake is keyed on. */
  readonly groundStamp: string;
  /** And with the features': what a stored tile is keyed on. */
  readonly stamp: string;
  /** The first level the features painter draws at, or `Infinity` with none: under it a map draws its own roads and towns. */
  readonly fromLevel: number;
  /** One tile, in steps; `features` false paints the ground alone (the bake's levels). */
  paint(z: number, i: number, j: number, raster: Raster, view?: { hurry: boolean; incomplete: boolean }, features?: boolean): Generator<'wait' | undefined, void, void>;
  /** The same, to its end, waiting on nothing: for the bake and the checks. */
  paintNow(z: number, i: number, j: number, features?: boolean): { raster: Raster; incomplete: boolean };
}

/** A tile held: its picture, or the job painting it. */
export interface MapTile {
  readonly z: number;
  readonly i: number;
  readonly j: number;
  /** The picture, and where in it the tile is: a baked level is one image for the whole level. */
  image: CanvasImageSource | null;
  sx: number;
  sy: number;
  state: 'new' | 'loading' | 'painting' | 'ready';
  job: Generator<'wait' | undefined, void, void> | null;
  raster: Raster | null;
  run: { hurry: boolean; incomplete: boolean } | null;
  /** When it began waiting on data, and when a tile painted without it may be painted again. */
  waitingSince: number;
  staleAfter: number;
  used: number;
  /** Milliseconds its job has run so far, waiting excluded. */
  work: number;
}

/** Where to draw a tile from: its own picture or an ancestor's corner of one. */
export interface TileSource {
  image: CanvasImageSource;
  sx: number;
  sy: number;
  /** The source square's edge, in the image's pixels. */
  size: number;
  /** How many levels up it came from: 0 is the tile itself. */
  up: number;
}

export interface MapTilesOptions extends TilePainterOptions {
  /** Where the bake put this world's levels (`public/maps/<id>/`), or nothing to paint them. */
  baked?: string;
  /** The stored tiles (`tile-store.ts`): opened under the painter's stamp when omitted, none with null. */
  store?: TileStore | null;
}

export interface MapTilesStats {
  /** Tiles held with a picture, and how many that are wanted are still to come. */
  ready: number;
  pending: number;
  /** Of those, how many are being read (the bake, the store) and how many wait on a features painter's data. */
  loading: number;
  waiting: number;
  /** Painted here since load, read from the store, and from the bake. */
  painted: number;
  stored: number;
  baked: number;
  /** The bake: where it is read from, and whether its stamp was this painter's (null while asked). */
  bake: { from: string | null; current: boolean | null };
  /** The median and the slowest time to paint a tile, by level, in ms of work (not of waiting). */
  paintMs: Record<number, { median: number; worst: number; count: number }>;
  /**
   * The most one `pump` kept to the frame's allowance spent, ms (`frame`),
   * and the median of the last 120 that painted anything: what a frame pays
   * while tiles fill. An open sheet's own pumps are not in it.
   */
  worstPumpMs: number;
  medianPumpMs: number;
}

export interface MapTiles {
  readonly painter: TilePainter;
  /** Bumped whenever a tile becomes drawable: a consumer that drew an older one redraws. */
  readonly version: number;
  /** The tile, created the first time it is asked for; nothing is painted until a `want` lists it. */
  tile(z: number, i: number, j: number): MapTile;
  /**
   * What a consumer wants painted, nearest first, replacing what it wanted
   * last time: the disc's `'minimap'`, the sheet's `'map'`, its warming
   * `'warm'`. `pump` serves the lists in the order they are first given.
   * `near` says whose allowance a list's painting is out of, when `pump` is
   * asked to keep to the frame's (`view.ts`): the frame's near share for
   * what is on the screen now, the far share's turn (`'maptiles'`) for the
   * rest.
   */
  want(who: string, tiles: readonly MapTile[], near?: boolean): void;
  /**
   * Runs jobs for at most `budgetMs`, the first list first; true if a tile
   * became drawable. `frame` keeps each list to the frame's allowance as
   * well (`mayBuild`); the open sheet, which is all the player is looking
   * at, paints on its own budget.
   */
  pump(budgetMs: number, frame?: boolean): boolean;
  /** The picture to draw for a tile: its own, or the nearest ancestor's corner. */
  source(z: number, i: number, j: number, out: TileSource): boolean;
  readonly stats: MapTilesStats;
  /** Lets go of every tile held but the baked levels: what is wanted next comes from the store or is painted. For the console. */
  forget(): void;
  dispose(): void;
}
