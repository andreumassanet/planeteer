import { openTileStore, type TileStore } from '../tile-store.ts';
import type { MapTile, MapTilesOptions, TilePainter } from './types.ts';

/** Tiles held past the baked levels, the least recently drawn let go first. */
export const MAX_TILES = 260;
/**
 * How long a tile may wait on a features painter's data (a town's plan,
 * worked out between the towns' own builds) before it is painted without it,
 * ms. Such a tile is drawn and not stored, and painted again the next time it
 * is wanted once `INCOMPLETE_KEEP_MS` has passed.
 */
export const WAIT_LIMIT_MS = 6000;
/**
 * How long a stored tile's read may take before the tile is painted instead,
 * ms: a read's answer waits for the main thread, which a slow frame can hold.
 */
export const STORE_PATIENCE_MS = 4000;
export const INCOMPLETE_KEEP_MS = 15000;

/** Everything one tile cache owns: the painter and store, the tiles held and who wants which. */
export interface TileCache {
  readonly options: MapTilesOptions;
  readonly painter: TilePainter;
  readonly store: TileStore | null;
  readonly tiles: Map<number, MapTile>;
  /** In the order they are served: what the disc shows now, then the open sheet's screenful, then what is warmed. */
  readonly lists: Map<string, readonly MapTile[]>;
  readonly nearLists: Set<string>;
  version: number;
  useClock: number;
  painted: number;
  stored: number;
  bakedCount: number;
  worstPumpMs: number;
  readonly pumps: number[];
  readonly times: Map<number, number[]>;
  disposed: boolean;
  /** The bake: one image a level, fetched on the first ask. */
  readonly bakedLevels: (Promise<ImageBitmap | null> | ImageBitmap | null | undefined)[];
  bakeChecked: Promise<boolean> | boolean | null;
  bakedAsked: boolean;
}

export function createCache(options: MapTilesOptions, painter: TilePainter): TileCache {
  return {
    options,
    painter,
    store: options.store === undefined ? openTileStore(painter.stamp) : options.store,
    tiles: new Map(),
    lists: new Map([['minimap', []], ['map', []], ['warm', []]]),
    nearLists: new Set(),
    version: 0,
    useClock: 0,
    painted: 0,
    stored: 0,
    bakedCount: 0,
    worstPumpMs: 0,
    pumps: [],
    times: new Map(),
    disposed: false,
    bakedLevels: [],
    bakeChecked: null,
    bakedAsked: false,
  };
}

/** The tile's key in the map of tiles held. */
export function tileKey(z: number, i: number, j: number): number {
  return z * 4_194_304 + i * 2048 + j;
}
