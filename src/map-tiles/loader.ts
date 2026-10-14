import { Raster } from '../raster.ts';
import { bakedLevel } from './bake.ts';
import { INCOMPLETE_KEEP_MS, MAX_TILES, STORE_PATIENCE_MS, type TileCache, tileKey } from './cache.ts';
import { BAKED_LEVELS, TILE } from './projection.ts';
import type { MapTile } from './types.ts';

/** The key a tile is stored under. */
function storeKey(c: TileCache, tile: MapTile): string {
  return `${c.painter.stamp}/${tile.z}/${tile.i}/${tile.j}`;
}

export function ready(c: TileCache, tile: MapTile, image: CanvasImageSource, sx: number, sy: number): void {
  const { tiles } = c;
  if (c.disposed || tiles.get(tileKey(tile.z, tile.i, tile.j)) !== tile) {
    // Let go meanwhile: its own bitmap goes with it, a baked level's stays.
    if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap && tile.z >= BAKED_LEVELS) image.close();
    return;
  }
  tile.image = image;
  tile.sx = sx;
  tile.sy = sy;
  tile.state = 'ready';
  tile.job = null;
  tile.raster = null;
  c.version++;
}

export function begin(c: TileCache, tile: MapTile): void {
  const { painter } = c;
  tile.state = 'painting';
  tile.raster = new Raster(TILE, TILE);
  tile.run = { hurry: false, incomplete: false };
  tile.waitingSince = 0;
  tile.job = painter.paint(tile.z, tile.i, tile.j, tile.raster, tile.run);
}


/** Starts a tile: the bake's level, the store, or a paint. */
export function start(c: TileCache, tile: MapTile): void {
  const { options, store } = c;
  tile.state = 'loading';
  if (tile.z < BAKED_LEVELS && options.baked !== undefined) {
    Promise.resolve(bakedLevel(c, tile.z)).then((bitmap) => {
      if (bitmap === null) begin(c, tile);
      else {
        c.bakedCount++;
        ready(c, tile, bitmap, tile.i * TILE, tile.j * TILE);
      }
    });
    return;
  }
  if (store === null) {
    begin(c, tile);
    return;
  }
  // A read that has not come back in `STORE_PATIENCE_MS` is given up on and
  // the tile painted: a store busy writing (or wedged) must not hold a tile.
  Promise.race([store.get(storeKey(c, tile)), new Promise<null>((resolve) => setTimeout(() => resolve(null), STORE_PATIENCE_MS))]).then(
    (blob) => {
      if (tile.state !== 'loading') return;
      if (blob === null) {
        begin(c, tile);
        return;
      }
      createImageBitmap(blob).then(
        (bitmap) => {
          c.stored++;
          ready(c, tile, bitmap, 0, 0);
        },
        () => begin(c, tile),
      );
    },
    () => begin(c, tile),
  );
}


/** A painted raster as a picture, drawn at once and stored when it is whole. */
export function finish(c: TileCache, tile: MapTile, workMs: number): void {
  const { store, times } = c;
  const raster = tile.raster!;
  const whole = tile.run?.incomplete !== true;
  c.painted++;
  const list = times.get(tile.z) ?? [];
  list.push(workMs);
  if (list.length > 64) list.shift();
  times.set(tile.z, list);
  const image = new ImageData(raster.data, TILE, TILE);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TILE;
  canvas.getContext('2d')!.putImageData(image, 0, 0);
  ready(c, tile, canvas, 0, 0);
  if (!whole) tile.staleAfter = performance.now() + INCOMPLETE_KEEP_MS;
  // A bitmap when the browser has made one, and the canvas let go.
  if (typeof createImageBitmap === 'function') {
    createImageBitmap(image).then(
      (bitmap) => {
        if (tile.image === canvas) tile.image = bitmap;
        else bitmap.close();
      },
      () => {
        // The canvas serves.
      },
    );
  }
  if (whole && store !== null) {
    canvas.toBlob((blob) => {
      if (blob !== null) store.put(storeKey(c, tile), blob);
    }, 'image/png');
  }
}

export function drop(c: TileCache, tile: MapTile): void {
  const { tiles } = c;
  if (typeof ImageBitmap !== 'undefined' && tile.image instanceof ImageBitmap && tile.z >= BAKED_LEVELS) tile.image.close();
  tile.image = null;
  tile.job?.return(undefined);
  tile.job = null;
  tile.raster = null;
  tiles.delete(tileKey(tile.z, tile.i, tile.j));
}

export function evict(c: TileCache): void {
  const { tiles, lists } = c;
  if (tiles.size <= MAX_TILES + 40) return;
  const wanted = new Set<MapTile>();
  for (const list of lists.values()) for (const tile of list) wanted.add(tile);
  const loose = [...tiles.values()].filter((tile) => tile.z >= BAKED_LEVELS && !wanted.has(tile));
  loose.sort((a, b) => a.used - b.used);
  for (let k = 0; k < loose.length - MAX_TILES; k++) drop(c, loose[k]!);
}

export function tileAt(c: TileCache, z: number, i: number, j: number): MapTile {
  const { tiles } = c;
  const k = tileKey(z, i, j);
  let tile = tiles.get(k);
  if (tile !== undefined && tile.state === 'ready' && tile.staleAfter > 0 && performance.now() > tile.staleAfter) {
    // Painted without data it waited for, long enough ago: once more.
    drop(c, tile);
    tile = undefined;
  }
  if (tile === undefined) {
    tile = { z, i, j, image: null, sx: 0, sy: 0, state: 'new', job: null, raster: null, run: null, waitingSince: 0, staleAfter: 0, used: 0, work: 0 };
    tiles.set(k, tile);
  }
  tile.used = ++c.useClock;
  return tile;
}
