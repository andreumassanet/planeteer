// Which tiles of the sea floor stand round the player: the wanted list, the
// slice-by-slice build under the frame's allowance, and the window the opaque sea
// steps aside in, as wide as the tiles standing let it be.

import * as THREE from 'three';
import { PLANET_RADIUS } from '../globe.ts';
import { TILE_QUADS, TILE_UNITS, coastAt, coastSample, tileOf, tilePoint } from '../sea-floor.ts';
import { mayBuild } from '../view.ts';
import {
  ACTIVE_CEILING,
  ACTIVE_REACH,
  BUILD_SHARE,
  PREFETCH,
  SLOTS,
  WANT_EVERY,
  WANT_MOVE,
  WINDOW,
  WINDOW_MIN,
} from './constants.ts';
import type { SlotBuffers } from './slots.ts';
import type { Tile, TileBuilder } from './tiles.ts';

/** The tiles wanted round the player, nearest first, re-listed now and then. */
interface WantList {
  keys: number[];
  set: Set<number>;
  from: THREE.Vector3;
  clock: number;
}

/** Lists the tiles a disc of `PREFETCH` round the player touches, nearest first, at most `SLOTS`. */
function listWanted(want: WantList, player: THREE.Vector3): void {
  const unit = new THREE.Vector3().copy(player).normalize();
  const north = new THREE.Vector3(0, 1, 0).projectOnPlane(unit);
  if (north.lengthSq() < 1e-8) north.set(1, 0, 0).projectOnPlane(unit);
  north.normalize();
  const east = new THREE.Vector3().crossVectors(north, unit).normalize();
  const probe = new THREE.Vector3();
  const point = { x: 0, y: 0, z: 0 };
  const { keys, set } = want;
  keys.length = 0;
  set.clear();
  const step = TILE_UNITS / 3;
  const reach = Math.ceil(PREFETCH / step);
  for (let a = -reach; a <= reach; a++) {
    for (let b = -reach; b <= reach; b++) {
      if (Math.hypot(a, b) * step > PREFETCH + step) continue;
      probe.copy(unit).addScaledVector(east, (a * step) / PLANET_RADIUS).addScaledVector(north, (b * step) / PLANET_RADIUS).normalize();
      const key = tileOf(probe.x, probe.y, probe.z);
      if (set.has(key)) continue;
      set.add(key);
      keys.push(key);
    }
  }
  // Nearest first, by each tile's middle.
  const distances = new Map<number, number>();
  for (const key of keys) {
    tilePoint(key, TILE_QUADS / 2, TILE_QUADS / 2, point);
    distances.set(key, probe.set(point.x, point.y, point.z).distanceTo(unit));
  }
  keys.sort((p, q) => distances.get(p)! - distances.get(q)!);
  if (keys.length > SLOTS) {
    for (const key of keys.splice(SLOTS)) set.delete(key);
  }
}

export interface TileStreamer {
  readonly tiles: Map<number, Tile>;
  /** Whether there is a floor worth drawing round the player. */
  readonly active: boolean;
  /** The window's radius now: 0 is the opaque sea. */
  readonly windowRadius: number;
  /** Milliseconds the last build pass took. */
  readonly buildMs: number;
  /** Re-checks, twice a second, whether the player is near enough a coast (or under the sea) for a floor to be drawn. */
  refreshActive(dt: number, player: THREE.Vector3, cameraRadius: number, underwater: boolean): void;
  /** Re-lists the wanted tiles now and then, starts the new ones and lets go of the stale. */
  refreshTiles(dt: number, player: THREE.Vector3): void;
  /** Builds the wanted tiles, nearest first, under the frame's allowance. */
  build(): void;
  /** Moves the window towards the widest the standing tiles allow. */
  updateWindow(dt: number, player: THREE.Vector3): void;
}

export function createTileStreamer(slots: SlotBuffers, builder: TileBuilder): TileStreamer {
  const tiles = new Map<number, Tile>();
  const want: WantList = { keys: [], set: new Set(), from: new THREE.Vector3(Infinity, 0, 0), clock: 0 };
  const sample = coastSample();
  const unit = new THREE.Vector3();
  const playerPoint = new THREE.Vector3();
  let activeClock = 0;
  let active = false;
  let windowRadius = 0;
  let buildMs = 0;

  return {
    tiles,
    get active() {
      return active;
    },
    get windowRadius() {
      return windowRadius;
    },
    get buildMs() {
      return buildMs;
    },
    refreshActive(dt, player, cameraRadius, underwater) {
      activeClock -= dt;
      if (activeClock > 0) return;
      activeClock = 0.5;
      unit.copy(player).normalize();
      coastAt(unit.x, unit.y, unit.z, ACTIVE_REACH, sample);
      const over = cameraRadius - PLANET_RADIUS;
      active = over < ACTIVE_CEILING && (sample.distance < ACTIVE_REACH || underwater);
    },
    refreshTiles(dt, player) {
      if (active) {
        want.clock -= dt;
        if (want.clock <= 0 || want.from.distanceTo(player) > WANT_MOVE) {
          want.clock = WANT_EVERY;
          want.from.copy(player);
          listWanted(want, player);
        }
        for (const key of want.keys) if (!tiles.has(key)) tiles.set(key, builder.newTile(key));
      } else if (want.keys.length > 0) {
        want.keys.length = 0;
        want.set.clear();
      }

      // Let go of what is no longer wanted after a moment, so a step back and
      // forth over a tile's edge does not rebuild it.
      for (const tile of tiles.values()) {
        tile.unwanted = want.set.has(tile.key) ? 0 : tile.unwanted + dt;
        if (tile.unwanted > 2) {
          slots.retire(tile);
          tiles.delete(tile.key);
        }
      }
    },
    build() {
      const began = performance.now();
      for (const key of want.keys) {
        if (!mayBuild(began, BUILD_SHARE, true)) break;
        const tile = tiles.get(key);
        if (tile === undefined || tile.state !== 'building') continue;
        if (builder.stepTile(tile, began + BUILD_SHARE)) slots.stand(tile);
      }
      buildMs = performance.now() - began;
    },
    updateWindow(dt, player) {
      playerPoint.copy(player).setLength(PLANET_RADIUS);
      let target = active ? WINDOW : 0;
      if (target > 0) {
        for (const key of want.keys) {
          const tile = tiles.get(key);
          if (tile === undefined || tile.state !== 'building') continue;
          const clear = tile.centre.distanceTo(playerPoint) - tile.reach;
          if (clear < target) target = Math.max(0, clear);
        }
        if (target < WINDOW_MIN) target = 0;
      }
      // In at once, out gradually, so a tile arriving does not snap the edge.
      windowRadius = target < windowRadius ? target : windowRadius + (target - windowRadius) * Math.min(1, dt * 1.5);
      if (windowRadius < WINDOW_MIN) windowRadius = target < WINDOW_MIN ? 0 : windowRadius;
    },
  };
}
