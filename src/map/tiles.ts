import { type MapTile, type TileSource, TILE, rowsAt } from '../map-tiles.ts';
import { KEEP_LEVEL, WARM_AFTER_MS, WARM_BUDGET_MS, WARM_EVERY_MS } from './constants.ts';
import type { MapSheet } from './sheet.ts';
import { busy, levelAt, resize } from './view.ts';

const NO_IMAGE = null as unknown as CanvasImageSource;
/** One `TileSource`, reused: what `drawTiles` draws a tile from. */
const tileSource: TileSource = { image: NO_IMAGE, sx: 0, sy: 0, size: TILE, up: 0 };

/**
 * The tiles a view at this middle and zoom draws, nearest the middle first,
 * without drawing: what `warm` asks for before the sheet is opened on it.
 */
export function tilesAt(s: MapSheet, midU: number, midV: number, scale: number): MapTile[] {
  const { mapTiles } = s;
  const z = levelAt(s, scale);
  const n = 2 ** z;
  const rows = rowsAt(z);
  const halfU = s.width / 2 / scale;
  const halfV = s.height / 2 / scale;
  const out: { tile: MapTile; d: number }[] = [];
  for (let j = Math.max(0, Math.floor((midV - halfV) * n)); j <= Math.min(rows - 1, Math.floor((midV + halfV) * n)); j++) {
    for (let i = Math.floor((midU - halfU) * n); i <= Math.floor((midU + halfU) * n); i++) {
      const d = Math.hypot((i + 0.5) / n - midU, (j + 0.5) / n - midV);
      out.push({ tile: mapTiles.tile(z, ((i % n) + n) % n, j), d });
    }
  }
  out.sort((a, b) => a.d - b.d);
  return out.map((entry) => entry.tile);
}

/**
 * While the sheet is shut: the first levels, then the screenful it would
 * open on, asked of the paper as `'warm'` and painted in the far share's
 * turn by whoever owns the paper (this sheet, when the paper is its own).
 */
export function warm(s: MapSheet, now: number): void {
  const { ownTiles, mapTiles, me, createdAt } = s;
  if (!me.known || now - createdAt < WARM_AFTER_MS) return;
  if (s.width === 0) resize(s);
  if (s.width <= 1) return;
  const z = levelAt(s, s.S);
  const n = 2 ** z;
  const key = `${z}:${Math.floor(me.u * n)}:${Math.floor(me.v * n)}`;
  if (key !== s.warmedKey && now - s.warmedAt >= WARM_EVERY_MS) {
    s.warmedKey = key;
    s.warmedAt = now;
    const queue = [mapTiles.tile(0, 0, 0)];
    for (let lv = 1; lv <= KEEP_LEVEL; lv++) {
      for (let j = 0; j < rowsAt(lv); j++) for (let i = 0; i < 2 ** lv; i++) queue.push(mapTiles.tile(lv, i, j));
    }
    queue.push(...tilesAt(s, me.u, me.v, s.S));
    mapTiles.want('warm', queue.filter((tile) => tile.state !== 'ready'));
  }
  if (ownTiles) mapTiles.pump(WARM_BUDGET_MS, true);
}

// --- the view --------------------------------------------------------------

export function drawTiles(s: MapSheet): void {
  const { mapTiles, ctx } = s;
  s.level = levelAt(s, s.S);
  const n = 2 ** s.level;
  const tilePx = s.S / n;
  const rows = rowsAt(s.level);
  const uLeft = s.cu - s.width / 2 / s.S;
  const iFirst = Math.floor(uLeft * n);
  const iLast = Math.floor((s.cu + s.width / 2 / s.S) * n);
  const jFirst = Math.max(0, Math.floor((s.cv - s.height / 2 / s.S) * n));
  const jLast = Math.min(rows - 1, Math.floor((s.cv + s.height / 2 / s.S) * n));
  const want: { tile: MapTile; d: number }[] = [];
  ctx.imageSmoothingEnabled = true;
  // The best filter only once the sheet is still; while it moves, the
  // plain one, and the still frame after it draws the fine one.
  s.drawnBusy = busy(s);
  ctx.imageSmoothingQuality = s.drawnBusy ? 'low' : 'high';
  for (let j = jFirst; j <= jLast; j++) {
    for (let i = iFirst; i <= iLast; i++) {
      const wrapI = ((i % n) + n) % n;
      const x = s.width / 2 + (i / n - s.cu) * s.S;
      const y = s.height / 2 + (j / n - s.cv) * s.S;
      const tile = mapTiles.tile(s.level, wrapI, j);
      if (tile.state !== 'ready') want.push({ tile, d: Math.hypot(x + tilePx / 2 - s.width / 2, y + tilePx / 2 - s.height / 2) });
      // The tile, or the nearest painted ancestor cut down to this tile's
      // corner of it; a hair over a pixel each way, so the seams between
      // scaled tiles never show the sea underneath.
      if (!mapTiles.source(s.level, wrapI, j, tileSource)) continue;
      ctx.drawImage(tileSource.image, tileSource.sx, tileSource.sy, tileSource.size, tileSource.size, x, y, tilePx + 0.6, tilePx + 0.6);
    }
  }
  // What this view wants comes first, nearest the middle.
  want.sort((a, b) => a.d - b.d);
  mapTiles.want('map', want.map((entry) => entry.tile));
  s.drawnVersion = mapTiles.version;
}
