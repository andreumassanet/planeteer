/** The quadtree streamer: which tiles are wanted, building them nearest first, and swapping levels without holes. */
import * as THREE from 'three';
import { prominenceVersion } from '../places.ts';
import type { ViewCone } from '../view.ts';
import { detailBuild, detailVersion, mayBuild, NEAR_BUILD } from '../view.ts';
import { BUILD_BUDGET_MS, RESCAN_MOVE, RESCAN_TURN, levelBudget, maxTiles, totalBudget } from './budget.ts';
import { GROVE_FROM, GROVE_PLANTS, groveSpacing, pitchOf, rangeFor, reachFor, visibleTo } from './levels.ts';
import { admit, createResidency, drop, release, retire, settle } from './residency.ts';
import type { StreamState } from './residency.ts';
import { refreshStats } from './stats.ts';
import type { Tile } from './tiles.ts';
import type { Enumerator } from './enumerate.ts';
import type { VegetationCountry } from './country.ts';
import type { LandAccess } from './land.ts';
import type { TileBuilder } from './tile-builder.ts';
import type { VegetationStats } from './types.ts';

export type { StreamState } from './residency.ts';

/** Tiles asked and found empty are remembered; past this many the set is emptied (a build, not a wrong answer, is the loss). */
const BARREN_CAP = 20_000;

export interface StreamerDeps {
  group: THREE.Group;
  stats: VegetationStats;
  cone: ViewCone;
  enumerator: Enumerator;
  builder: TileBuilder;
  country: VegetationCountry | null;
  landAccess: LandAccess;
  /** Re-reads the built places after the prominence knob moves. */
  rebuildKeepouts: () => void;
}

export interface Streamer {
  state: StreamState;
  update(viewer: THREE.Vector3, altitude: number, camera?: THREE.Camera): void;
}

/**
 * What a tile will cost before it is built, in triangles: plots (or groves)
 * times a mean cover of 0.5 times a mean plant of 100 triangles. It only
 * decides whether to start; the real number replaces it once the tile exists.
 */
function estimate(tile: Tile): number {
  if (tile.level >= GROVE_FROM) {
    const spacing = groveSpacing(tile.level);
    const groves = ((tile.halfEast * 2) / spacing) * ((tile.halfNorth * 2) / spacing);
    return Math.round(groves * 0.5 * GROVE_PLANTS * 100);
  }
  const pitch = pitchOf(tile.level);
  const cells = ((tile.halfEast * 2) / pitch) * ((tile.halfNorth * 2) / pitch);
  return Math.round(cells * 0.5 * 100);
}

export function createStreamer(deps: StreamerDeps): Streamer {
  const { group, stats, cone, enumerator, builder, country, landAccess } = deps;
  const r = createResidency();
  const { standing, retiring, barren, refused, provisional } = r;
  let queue: Tile[] = [];
  const scannedAt = new THREE.Vector3(Infinity, Infinity, Infinity);
  const scannedAxis = new THREE.Vector3(0, 0, 1);
  let scannedRange = -1;
  // Turning the detail knob forces a rescan: neither the movement nor the turn
  // threshold sees it, but every budget and the refinement distance changed.
  let scannedDetail = -1;
  // The prominence knob invalidates standing tiles: their plots were tested against the old keepouts.
  let scannedProminence = prominenceVersion();

  function scan(viewer: THREE.Vector3, range: number): void {
    if (barren.size > BARREN_CAP) barren.clear();
    const found = enumerator.enumerate(viewer, range * 1.15).filter((tile) => {
      if (barren.has(tile.key)) return false;
      // Past the distance its own contents can be seen at, whatever the reach
      // says: the outermost level has no level above it to bound its band.
      if (tile.distance > visibleTo(tile.level)) return false;
      // A tile already standing is judged by the wide cone the descent used;
      // one that is not must be inside the narrower admitting cone.
      if (standing.has(tile.key)) return true;
      return cone.admits(tile.centre, tile.radius);
    });
    found.sort((a, b) => a.distance - b.distance);

    const wanted: Tile[] = [];
    const budget = totalBudget();
    const tileCap = maxTiles();
    let triangles = 0;
    for (const tile of found) {
      if (wanted.length >= tileCap) break;
      const already = standing.get(tile.key);
      const cost = already?.triangles ?? estimate(tile);
      if (triangles + cost > budget && wanted.length > 0) continue;
      triangles += cost;
      wanted.push(tile);
    }

    const keep = new Set(wanted.map((tile) => tile.key));
    for (const key of [...standing.keys()]) {
      if (!keep.has(key)) retire(r, group, key);
    }
    // A retiring tile wanted again is simply standing again.
    for (const tile of wanted) {
      const back = retiring.get(tile.key);
      if (back === undefined) continue;
      retiring.delete(tile.key);
      standing.set(tile.key, back);
      r.residentTriangles += back.priced;
      r.residentByLevel[back.level] = r.residentByLevel[back.level]! + back.priced;
    }
    r.wanted = wanted;
    refused.clear();
    queue = wanted.filter((tile) => !standing.has(tile.key));
  }

  /**
   * Builds from the head of the queue while the frame allows: the near tiles
   * only, or everything left. The queue is nearest first, so the near pass
   * stops at the first far tile. Returns how many it built.
   */
  function buildTiles(began: number, nearOnly: boolean): number {
    const budget = totalBudget();
    const allowance = detailBuild(BUILD_BUDGET_MS);
    let built = 0;
    while (queue.length > 0) {
      const tile = queue[0]!;
      const near = tile.distance - Math.hypot(tile.halfEast, tile.halfNorth) < NEAR_BUILD;
      if (nearOnly && !near) break;
      if (!mayBuild(began, allowance, near, 'wood')) break;
      // The countryside's plans under it first, over as many frames as they take.
      if (country !== null && !standing.has(tile.key) && !country.builder.ensure(tile.level, tile.row, tile.column, () => mayBuild(began, allowance, near, 'wood'))) break;
      queue.shift();
      if (standing.has(tile.key)) continue;
      // This level has had its share. The tile is dropped rather than deferred:
      // behind it is the coarser ring the share exists to protect.
      if (r.residentByLevel[tile.level]! >= levelBudget(tile.level)) {
        refused.add(tile.key);
        continue;
      }
      const result = builder.raise(tile);
      built++;
      if (result.mesh === null) {
        barren.add(tile.key);
        continue;
      }
      admit(r, tile, result);
      // The real cap.
      if (r.residentTriangles >= budget) {
        for (const left of queue) refused.add(left.key);
        queue.length = 0;
        break;
      }
    }
    return built;
  }

  function resetForProminence(): void {
    scannedProminence = prominenceVersion();
    for (const key of [...standing.keys()]) drop(r, group, key);
    for (const old of retiring.values()) release(r, group, old);
    retiring.clear();
    barren.clear();
    refused.clear();
    deps.rebuildKeepouts();
    country?.planner.reset();
    provisional.clear();
    scannedDetail = -1;
  }

  /** Re-queues the provisional tiles once the drawn land answers. */
  function rebuildProvisional(): void {
    for (const key of provisional) {
      const tile = r.wanted.find((wanted) => wanted.key === key);
      if (tile !== undefined && standing.has(key)) {
        retire(r, group, key);
        refused.delete(key);
        queue.unshift(tile);
      }
    }
    provisional.clear();
  }

  function update(viewer: THREE.Vector3, altitude: number, camera?: THREE.Camera): void {
    r.fader.update();
    const range = rangeFor(altitude);
    stats.range = Math.round(range);
    stats.reach = Math.round(reachFor(altitude));
    cone.aim(camera);
    if (scannedProminence !== prominenceVersion()) resetForProminence();
    if (
      viewer.distanceToSquared(scannedAt) > RESCAN_MOVE * RESCAN_MOVE ||
      Math.abs(range - scannedRange) > scannedRange * 0.1 ||
      cone.turnFrom(scannedAxis) > RESCAN_TURN ||
      scannedDetail !== detailVersion()
    ) {
      // The scan position and not the live one: the refinement test compares a
      // distance, and a tile on a switch distance would otherwise split and
      // merge on alternate frames.
      scannedAt.copy(viewer);
      scannedAxis.copy(cone.axis);
      scannedRange = range;
      scannedDetail = detailVersion();
      scan(scannedAt, range);
    }

    // Nearest first, in the frame's order (`mayBuild` in `view.ts`): the wood
    // you are standing in, then the grass under your feet, then the far wood
    // out of what the frame has left.
    const began = performance.now();
    let built = 0;
    built += buildTiles(began, true);
    const preparing = performance.now();
    landAccess.prepare(viewer, camera);
    // The land index slice is the probe's time, not the wood's.
    const sown = performance.now() - preparing;
    if (provisional.size > 0 && landAccess.ready()) rebuildProvisional();
    built += buildTiles(began + sown, false);
    if (built > 0) {
      stats.lastBuildMs = Number((performance.now() - began - sown).toFixed(2));
      stats.built += built;
    }
    settle(r, group);
    refreshStats(stats, r, country, queue);
  }

  return { state: r, update };
}
