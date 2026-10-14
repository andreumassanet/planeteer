import { mayBuild } from '../view.ts';
import { TILE } from './projection.ts';
import { BAKED_LEVELS, rowsAt } from './projection.ts';
import { WAIT_LIMIT_MS, type TileCache, tileKey } from './cache.ts';
import { drop, evict, finish, start, tileAt } from './loader.ts';
import type { MapTile, MapTilesStats, TileSource } from './types.ts';

/** Replaces what a consumer wants painted, nearest first. */
export function wantTiles(c: TileCache, who: string, list: readonly MapTile[], near = false): void {
  const { options, lists, nearLists } = c;
  // The baked levels, all of them, on the first ask: a fetch a level, and
  // every tile then has an ancestor to stand in for it from the start.
  if (!c.bakedAsked && options.baked !== undefined) {
    c.bakedAsked = true;
    for (let z = 0; z < BAKED_LEVELS; z++) {
      for (let j = 0; j < rowsAt(z); j++) for (let i = 0; i < 2 ** z; i++) start(c, tileAt(c, z, i, j));
    }
  }
  const was = lists.get(who) ?? [];
  lists.set(who, list);
  if (near) nearLists.add(who);
  else nearLists.delete(who);
  // A tile nobody wants any more stops being painted and lets go of what its
  // job holds (its raster and masks); it starts again from nothing if wanted.
  if (was.length > 0) {
    const wanted = new Set<MapTile>();
    for (const other of lists.values()) for (const tile of other) wanted.add(tile);
    for (const tile of was) {
      if (wanted.has(tile) || tile.state !== 'painting') continue;
      tile.job?.return(undefined);
      tile.job = null;
      tile.raster = null;
      tile.run = null;
      tile.work = 0;
      tile.waitingSince = 0;
      tile.state = 'new';
    }
  }
  evict(c);
}

/** Runs jobs for at most `budgetMs`, the first list first; true if a tile became drawable. */
export function pumpTiles(c: TileCache, budgetMs: number, frame = false): boolean {
  const { lists, nearLists, pumps } = c;
  const began = performance.now();
  let changed = false;
  const before = c.version;
  outer: for (const [who, list] of lists) {
    const near = nearLists.has(who);
    const open = (): boolean => (frame ? mayBuild(began, budgetMs, near, 'maptiles') : performance.now() - began < budgetMs);
    for (const tile of list) {
      if (!open()) {
        if (near) continue outer;
        break outer;
      }
      if (tile.state === 'new') start(c, tile);
      if (tile.state !== 'painting' || tile.job === null) continue;
      const now = performance.now();
      if (tile.waitingSince > 0) {
        if (now - tile.waitingSince > WAIT_LIMIT_MS) tile.run!.hurry = true;
      }
      const tileBegan = now;
      for (;;) {
        const step = tile.job.next();
        if (step.done === true) {
          tile.work += performance.now() - tileBegan;
          finish(c, tile, tile.work);
          break;
        }
        if (step.value === 'wait') {
          if (tile.waitingSince === 0) tile.waitingSince = performance.now();
          break;
        }
        if (!open()) break;
      }
      if (tile.state === 'painting') tile.work += performance.now() - tileBegan;
    }
  }
  changed = c.version !== before;
  const spent = performance.now() - began;
  if (frame && spent > 0.05) {
    c.worstPumpMs = Math.max(c.worstPumpMs, spent);
    pumps.push(spent);
    if (pumps.length > 120) pumps.shift();
  }
  return changed;
}

/** The picture to draw for a tile: its own, or the nearest ancestor's corner. */
export function sourceOf(c: TileCache, z: number, i: number, j: number, out: TileSource): boolean {
  const { tiles } = c;
  const n = 2 ** z;
  const wrapI = ((i % n) + n) % n;
  for (let up = 0; up <= z; up++) {
    const tile = tiles.get(tileKey(z - up, wrapI >> up, j >> up));
    if (tile?.image == null) continue;
    tile.used = ++c.useClock;
    const part = TILE / 2 ** up;
    out.image = tile.image;
    out.size = part;
    out.sx = tile.sx + (wrapI - ((wrapI >> up) << up)) * part;
    out.sy = tile.sy + (j - ((j >> up) << up)) * part;
    out.up = up;
    return true;
  }
  return false;
}

export function statsOf(c: TileCache): MapTilesStats {
  const { options, tiles, lists, pumps, times } = c;
  let readyCount = 0;
  let pending = 0;
  let loading = 0;
  let waiting = 0;
  const wanted = new Set<MapTile>();
  for (const list of lists.values()) for (const tile of list) wanted.add(tile);
  for (const tile of tiles.values()) {
    if (tile.state === 'ready') readyCount++;
    else if (tile.state !== 'new' && (wanted.has(tile) || tile.z < BAKED_LEVELS)) pending++;
    if (tile.state === 'loading') loading++;
    if (tile.state === 'painting' && tile.waitingSince > 0) waiting++;
  }
  // What is wanted and not yet begun is pending too.
  for (const tile of wanted) if (tile.state === 'new') pending++;
  const paintMs: MapTilesStats['paintMs'] = {};
  for (const [z, list] of times) {
    const sorted = [...list].sort((a, b) => a - b);
    paintMs[z] = { median: Number((sorted[sorted.length >> 1] ?? 0).toFixed(1)), worst: Number((sorted[sorted.length - 1] ?? 0).toFixed(1)), count: list.length };
  }
  const sortedPumps = [...pumps].sort((a, b) => a - b);
  return {
    ready: readyCount,
    pending,
    loading,
    waiting,
    painted: c.painted,
    stored: c.stored,
    baked: c.bakedCount,
    bake: { from: options.baked ?? null, current: typeof c.bakeChecked === 'boolean' ? c.bakeChecked : null },
    paintMs,
    worstPumpMs: Number(c.worstPumpMs.toFixed(2)),
    medianPumpMs: Number((sortedPumps[sortedPumps.length >> 1] ?? 0).toFixed(2)),
  };
}

/** Lets go of every tile held but the baked levels. */
export function forgetTiles(c: TileCache): void {
  const { tiles, lists } = c;
  for (const tile of [...tiles.values()]) if (tile.z >= BAKED_LEVELS) drop(c, tile);
  for (const who of lists.keys()) lists.set(who, []);
  c.version++;
}

export function disposeTiles(c: TileCache): void {
  const { tiles, lists, bakedLevels } = c;
  c.disposed = true;
  for (const tile of [...tiles.values()]) drop(c, tile);
  for (const level of bakedLevels) if (level instanceof ImageBitmap) level.close();
  lists.clear();
}
