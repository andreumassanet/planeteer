/** The streamer's stats, refilled from what stands every frame. */
import { NEAR_BUILD } from '../view.ts';
import { BEACON_STRIDE, ROTOR_STRIDE, SMOKE_STRIDE } from '../countryside-tile.ts';
import { LEVELS } from '../tile-grid.ts';
import type { VegetationCountry } from './country.ts';
import type { Residency } from './residency.ts';
import type { Tile } from './tiles.ts';
import type { VegetationStats } from './types.ts';

export function emptyStats(): VegetationStats {
  return {
    tiles: 0,
    pending: 0,
    nearPending: 0,
    plants: 0,
    cards: 0,
    swaying: false,
    triangles: 0,
    megabytes: 0,
    built: 0,
    barren: 0,
    lastBuildMs: 0,
    range: 0,
    reach: 0,
    byLevel: new Array(LEVELS).fill(0),
    retiring: 0,
    staged: 0,
    country: { planned: 0, cached: 0, slowestMs: 0, meanMs: 0, byKind: {}, refused: {}, pieces: 0, fields: 0, fences: 0, rotors: 0, beacons: 0, smokes: 0, provisional: 0 },
  };
}

/** Refills `stats` from the standing tiles and the build queue, and re-derives the residency counts from them. */
export function refreshStats(stats: VegetationStats, r: Residency, country: VegetationCountry | null, queue: readonly Tile[]): void {
  const { standing } = r;
  let triangles = 0;
  let plants = 0;
  let pieces = 0;
  let fieldCount = 0;
  let fences = 0;
  let rotors = 0;
  let beacons = 0;
  let smokes = 0;
  let bytes = 0;
  let priced = 0;
  let cardCount = 0;
  let swaying = false;
  // The stats' own array, refilled: this runs every frame.
  const byLevel = stats.byLevel;
  byLevel.fill(0);
  for (const entry of standing.values()) {
    triangles += entry.triangles;
    priced += entry.priced;
    plants += entry.plants;
    bytes += entry.bytes;
    byLevel[entry.level]!++;
    if (entry.leaves !== null) {
      cardCount += entry.leaves.geometry.getAttribute('position').count / 6;
      if (entry.shown && entry.level === 0) swaying = true;
    }
    pieces += entry.pieces;
    fieldCount += entry.fields;
    fences += entry.fences;
    if (entry.motion !== null) {
      rotors += entry.motion.rotors.length / ROTOR_STRIDE;
      beacons += entry.motion.beacons.length / BEACON_STRIDE;
      smokes += entry.motion.smokes.length / SMOKE_STRIDE;
    }
  }
  if (country !== null) {
    Object.assign(stats.country, country.planner.stats);
    Object.assign(stats.country, { pieces, fields: fieldCount, fences, rotors, beacons, smokes, provisional: r.provisional.size });
  }
  r.residentTriangles = priced;
  for (let level = 0; level < LEVELS; level++) r.residentByLevel[level] = 0;
  for (const entry of standing.values()) r.residentByLevel[entry.level] = r.residentByLevel[entry.level]! + entry.priced;
  stats.tiles = standing.size;
  stats.retiring = r.retiring.size;
  stats.staged = 0;
  for (const entry of standing.values()) if (!entry.shown) stats.staged++;
  stats.pending = queue.length;
  stats.nearPending = 0;
  for (const tile of queue) if (tile.distance - Math.hypot(tile.halfEast, tile.halfNorth) < NEAR_BUILD) stats.nearPending++;
  stats.triangles = triangles;
  stats.plants = plants;
  stats.cards = cardCount;
  stats.swaying = swaying;
  stats.megabytes = Number((bytes / 1048576).toFixed(1));
  stats.barren = r.barren.size;
}
