import * as THREE from 'three';
import { FADES } from '../fade.ts';
import { prominenceVersion } from '../places.ts';
import {
  NEAR_BUILD, createViewCone, detailArea, detailBuild, detailVersion, mayBuild, slantRange,
} from '../view.ts';
import type { RoadCaches } from './caches.ts';
import { SPANS, bandFor, classReaches, reachFor } from './lod.ts';
import { NO_REACH } from './material.ts';
import type { RibbonCache } from './ribbon-cache.ts';
import type { Ribbon } from './ribbon-writer.ts';
import type { RoadSummary } from './summary.ts';
import { dropTile, raiseProps, raiseRibbons } from './tiles.ts';
import type { Tile } from './tiles.ts';
import type { Road, RoadStats } from './types.ts';

const DEG = Math.PI / 180;

/** Triangles a piece of ribbon costs in the near band: two banks and their skirts, two shoulders, the carriageway, two edge lines and a dash. */
const TRIANGLES_NEAR = 20;
/** Triangles of resident road. `OutlineEffect` draws them twice. */
const TRIANGLE_BUDGET = 260_000;
const triangleBudget = (): number => detailArea(TRIANGLE_BUDGET);
/** Milliseconds of building allowed in one frame. */
const BUILD_BUDGET_MS = 3;
/** How far the viewer moves, or turns, before the candidate list is worked out again. */
const RESCAN_MOVE = 90;
const RESCAN_TURN = 8 * DEG;
/**
 * Roads inside this of the camera are built whatever it is pointed at, so a
 * fast mouse flick cannot delete the road underfoot. Fixed, not scaled by the
 * detail knob, as in `settlements.ts`.
 */
const KEEP_ALL_WITHIN = 620;
const keepAllWithin = (): number => KEEP_ALL_WITHIN;

export interface RoadStreamerSource {
  roads: readonly Road[];
  summary: RoadSummary;
  tiles: readonly Tile[];
  caches: RoadCaches;
  ribbons: RibbonCache;
  material: THREE.Material;
  propsMaterial: THREE.Material;
  /** The material's per-class reach uniform (x lane, y road, z trunk). */
  reach: { value: THREE.Vector3 };
  group: THREE.Group;
}

export interface RoadStreamer {
  stats: RoadStats;
  update(viewer: THREE.Vector3, altitude: number, camera?: THREE.Camera): void;
  lampsNear(viewer: THREE.Vector3, radius: number, out: Float32Array, count: number): number;
}

/**
 * Streams the tiles round the viewer: which roads are worth drawing from the
 * eye (by class reach), which tiles are wanted within the triangle budget, and
 * building them a ribbon at a time under the frame's build allowance.
 */
export function createRoadStreamer(source: RoadStreamerSource): RoadStreamer {
  const { roads, summary, tiles, caches, ribbons, group } = source;
  /** Set by `scan`: whether each road is close enough to be worth drawing. */
  const roadDrawn = new Uint8Array(roads.length);
  /**
   * Where the eye was at the last scan: the camera, not the player, since the
   * class reach is about how far a mark is from what looks at it. Kept because
   * the queue outlives the scan that priced it.
   */
  const eye = new THREE.Vector3();
  const reaches = [0, 0, 0];
  const stats: RoadStats = {
    resident: 0, pending: 0, roads: 0, triangles: 0, roadside: 0, lamps: 0,
    megabytes: 0, built: 0, lastBuildMs: 0, reach: 0, range: 0,
  };
  let wanted: Tile[] = [];
  let queue: { tile: Tile; band: number; sign: number }[] = [];
  const scannedAt = new THREE.Vector3(Infinity, Infinity, Infinity);
  const scannedAxis = new THREE.Vector3(0, 0, 1);
  let scannedRange = -1;
  /** Turning the detail knob forces a rescan; nothing else can see that it moved. */
  let scannedDetail = -1;
  /** And the prominence knob, since a ramp climbs only into a built town (`rampOf` asks `isShown`). */
  let scannedProminence = -1;
  const cone = createViewCone(keepAllWithin);

  /**
   * Which roads are worth drawing from the eye: a road is drawn when the
   * nearest of its three sample points is inside its class's reach. Global
   * rather than per tile, so two tiles sharing a junction agree.
   */
  function priceRoads(): void {
    const samples = summary.samples;
    for (let i = 0; i < roads.length; i++) {
      const reach = reaches[roads[i]!.cls] ?? reaches[0]!;
      const limit = reach * reach;
      let drawn = 0;
      for (let k = 0; k < 3; k++) {
        const dx = samples[i * 9 + k * 3]! - eye.x;
        const dy = samples[i * 9 + k * 3 + 1]! - eye.y;
        const dz = samples[i * 9 + k * 3 + 2]! - eye.z;
        if (dx * dx + dy * dy + dz * dz <= limit) {
          drawn = 1;
          break;
        }
      }
      roadDrawn[i] = drawn;
    }
  }

  /**
   * A tile's admitted members as an FNV-1a hash, in `members` order, or 0 for
   * none: the rebuild key, so a tile is rebuilt the scan its drawn set changes.
   */
  function signOf(tile: Tile): number {
    let sign = 2166136261;
    let count = 0;
    for (const index of tile.members) {
      if (roadDrawn[index] === 0) continue;
      count++;
      sign = Math.imul(sign ^ (index + 1), 16777619);
    }
    // 0 means nothing here is worth drawing; a hash that lands on it is bumped.
    if (count === 0) return 0;
    return (sign >>> 0) || 1;
  }

  /**
   * Roughly what a tile costs before it is built, from the courses' estimated
   * lengths: six triangles a span, `TRIANGLES_NEAR` in the near band.
   */
  function estimate(tile: Tile, band: number): number {
    const span = SPANS[band]!.span;
    let total = 0;
    for (const index of tile.members) {
      if (roadDrawn[index] === 0) continue;
      total += Math.max(2, Math.ceil(summary.lengths[index]! / span)) * (band === 0 ? TRIANGLES_NEAR : 6);
    }
    return total;
  }

  function scan(viewer: THREE.Vector3, altitude: number): void {
    const reach = reachFor(altitude);
    // The eye decides the spans and the classes; the player decides how far the
    // streamer reaches (`slantRange`). Without a camera the two are the same.
    eye.copy(cone.active ? cone.apex : viewer);
    classReaches(reaches);
    if (FADES) source.reach.value.set(reaches[0] ?? NO_REACH, reaches[1] ?? NO_REACH, reaches[2] ?? NO_REACH);
    priceRoads();
    const candidates: { tile: Tile; distance: number; band: number; sign: number }[] = [];
    for (const tile of tiles) {
      const distance = tile.anchor.distanceTo(viewer);
      if (distance - tile.bound > slantRange(altitude, reach)) continue;
      const admitted = tile.band >= 0
        ? cone.keeps(tile.anchor, tile.bound)
        : cone.admits(tile.anchor, tile.bound);
      if (!admitted) continue;
      const sign = signOf(tile);
      // Nothing in it is worth drawing from here: dropped rather than built as nothing.
      if (sign === 0) continue;
      candidates.push({ tile, distance, band: bandFor(tile.anchor.distanceTo(eye)), sign });
    }
    candidates.sort((x, y) => x.distance - y.distance);

    wanted = [];
    queue = [];
    let triangles = 0;
    const keep = new Set<Tile>();
    for (const candidate of candidates) {
      const cost = candidate.tile.triangles > 0
        ? candidate.tile.triangles
        : estimate(candidate.tile, candidate.band);
      if (triangles + cost > triangleBudget() && wanted.length > 0) continue;
      triangles += cost;
      wanted.push(candidate.tile);
      keep.add(candidate.tile);
      // Rebuilt when its band or its drawn set changed.
      if (candidate.tile.band !== candidate.band || candidate.tile.sign !== candidate.sign) {
        queue.push({ tile: candidate.tile, band: candidate.band, sign: candidate.sign });
      }
    }
    for (const tile of tiles) if (!keep.has(tile)) dropTile(tile, group);
  }

  /** Builds a tile from its cached ribbons, and in the near band its roadside. */
  function raise(tile: Tile, band: number, sign: number): void {
    const parts: { ribbon: Ribbon; road: Road; index: number }[] = [];
    let vertices = 0;
    let drawn = 0;
    for (const index of tile.members) {
      // The level of detail, per road from the eye (`priceRoads`).
      if (roadDrawn[index] === 0) continue;
      drawn++;
      const ribbon = ribbons.ribbonOf(index, band);
      parts.push({ ribbon, road: roads[index]!, index });
      vertices += ribbon.glow.length;
    }
    // A tile none of whose roads drew anything is built as nothing, or it
    // would be queued again every scan.
    tile.band = band;
    tile.sign = sign;
    if (vertices === 0) return;
    const origin = raiseRibbons(tile, parts, vertices, source.material, group);
    tile.drawn = drawn;
    if (band === 0) {
      const members = parts.map((part) => part.index);
      raiseProps(tile, members, members.map((index) => caches.roadsideOf(index)), origin, source.propsMaterial, group);
    }
  }

  /** Drops everything when the prominence knob turns: the ramps, gate lights and roadsides all ask `isShown`. */
  function forgetIfProminenceMoved(): void {
    if (scannedProminence === prominenceVersion()) return;
    for (const tile of tiles) dropTile(tile, group);
    caches.clear();
    ribbons.clear();
    scannedProminence = prominenceVersion();
    scannedAt.set(Infinity, Infinity, Infinity);
  }

  /** Builds queued tiles under the frame's allowance, one ribbon at a time; the old mesh stands until the new one is raised. */
  function serveQueue(viewer: THREE.Vector3): void {
    if (queue.length === 0) return;
    const began = performance.now();
    let built = 0;
    while (queue.length > 0) {
      // The road underfoot out of the whole frame, a far tile out of its share; see `mayBuild`.
      const head = queue[0]!.tile;
      const near = head.anchor.distanceTo(viewer) - head.bound < NEAR_BUILD;
      if (!mayBuild(began, detailBuild(BUILD_BUDGET_MS), near, 'roads')) break;
      const next = queue[0]!;
      if (next.tile.band === next.band && next.tile.sign === next.sign) {
        queue.shift();
        continue;
      }
      if (!ribbons.warm(next.tile.members, roadDrawn, next.band, () => mayBuild(began, detailBuild(BUILD_BUDGET_MS), near, 'roads'))) break;
      queue.shift();
      dropTile(next.tile, group);
      raise(next.tile, next.band, next.sign);
      built++;
    }
    if (built > 0) {
      stats.lastBuildMs = Number((performance.now() - began).toFixed(2));
      stats.built += built;
    }
  }

  function tally(): void {
    let resident = 0;
    let drawn = 0;
    let triangles = 0;
    let bytes = 0;
    let roadside = 0;
    let lamps = 0;
    for (const tile of wanted) {
      if (tile.mesh === null) continue;
      resident++;
      drawn += tile.drawn;
      triangles += tile.triangles;
      bytes += tile.bytes;
      roadside += tile.props === null ? 0 : tile.props.geometry.getAttribute('position').count / 3;
      lamps += tile.heads === null ? 0 : tile.heads.length / 3;
    }
    stats.roadside = roadside;
    stats.lamps = lamps;
    stats.resident = resident;
    stats.pending = queue.length;
    stats.roads = drawn;
    stats.triangles = triangles;
    stats.megabytes = Number((bytes / 1048576).toFixed(1));
  }

  return {
    stats,
    update(viewer, altitude, camera) {
      const reach = reachFor(altitude);
      const range = slantRange(altitude, reach);
      stats.reach = Math.round(reach);
      stats.range = Math.round(range);
      cone.aim(camera);
      forgetIfProminenceMoved();
      if (
        viewer.distanceToSquared(scannedAt) > RESCAN_MOVE * RESCAN_MOVE ||
        Math.abs(range - scannedRange) > scannedRange * 0.1 ||
        cone.turnFrom(scannedAxis) > RESCAN_TURN ||
        scannedDetail !== detailVersion()
      ) {
        scan(viewer, altitude);
        scannedAt.copy(viewer);
        scannedAxis.copy(cone.axis);
        scannedRange = range;
        scannedDetail = detailVersion();
      }
      serveQueue(viewer);
      tally();
    },
    lampsNear(viewer, radius, out, count) {
      const max = Math.floor(out.length / 4);
      if (max === 0) return count;
      let n = Math.min(count, max);
      for (const tile of wanted) {
        const heads = tile.heads;
        if (heads === null || tile.anchor.distanceTo(viewer) - tile.bound > radius) continue;
        for (let i = 0; i + 2 < heads.length; i += 3) {
          const dx = heads[i]! - viewer.x;
          const dy = heads[i + 1]! - viewer.y;
          const dz = heads[i + 2]! - viewer.z;
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (d > radius) continue;
          // An insertion into the list, which is sorted by distance and capped.
          let at = n < max ? n : max - 1;
          if (n === max && d >= out[at * 4 + 3]!) continue;
          while (at > 0 && out[(at - 1) * 4 + 3]! > d) {
            out.copyWithin(at * 4, (at - 1) * 4, at * 4);
            at--;
          }
          out[at * 4] = heads[i]!;
          out[at * 4 + 1] = heads[i + 1]!;
          out[at * 4 + 2] = heads[i + 2]!;
          out[at * 4 + 3] = d;
          if (n < max) n++;
        }
      }
      return n;
    },
  };
}
