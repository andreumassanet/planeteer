/** Everybody else's vehicles: followed while in reach, and the marks they leave. */
import { PLANET_RADIUS } from '../globe.ts';
import { PLANE_ROTATE } from '../vehicles.ts';
import * as THREE from 'three';
import type { OtherVisitor } from './types.ts';
import { H, REACH, topSpeed, HULLS, SUBMERGED, ENGINES, isJump } from './constants.ts';
import { T_LAST, T_SEEN, T_SPEED, T_CLIMB, newTrack } from './layout.ts';
import { p3 } from './helpers.ts';
import type { Track } from './layout.ts';
import type { Pools } from './pools.ts';
import { createSpawners } from './spawn.ts';
import { createEmitters } from './emitters.ts';

export function createTracking(fx: Pools) {
  const { ribbonOwned, ribbonBroken, stats, eye, tracks, trackFree, motion, delta, seen, upAt, fwdAt, rightAt } = fx;
  const { takeRibbon } = createSpawners(fx);
  const { wake, contrail, exhaust, flame, rooster } = createEmitters(fx);
  /* --- everybody else --------------------------------------------------- */

  const follow: OtherVisitor = (object, kind, model) => {
    const now = object.getWorldPosition(seen);
    let entry = tracks.get(object);
    if (entry === undefined) {
      entry = trackFree.pop() ?? newTrack();
      entry.row.fill(0);
      p3(entry.row, T_LAST, now.x, now.y, now.z);
      entry.row[T_SEEN] = fx.frame;
      tracks.set(object, entry);
      return;
    }
    const track = entry.row;
    track[T_SEEN] = fx.frame;
    delta.set(now.x - track[T_LAST]!, now.y - track[T_LAST + 1]!, now.z - track[T_LAST + 2]!);
    p3(track, T_LAST, now.x, now.y, now.z);
    const run = delta.length();
    if (fx.frameDt <= 0) return;
    if (isJump(run, fx.frameDt, kind)) {
      // A pose that arrived late, or a pooled group put to another vehicle:
      // start again from here.
      stats.jumps++;
      track[T_SPEED] = 0;
      track[T_CLIMB] = 0;
      entry.slots.fill(0);
      for (let i = 0; i < 3; i++) if (entry.ribbons[i]! >= 0) ribbonBroken[entry.ribbons[i]!] = 1;
      return;
    }
    upAt.copy(now).normalize();
    const top = topSpeed(kind);
    track[T_SPEED] = track[T_SPEED]! + (Math.min(top, run / fx.frameDt) - track[T_SPEED]!) * Math.min(1, fx.frameDt * 4);
    const rising = delta.dot(upAt) / fx.frameDt;
    track[T_CLIMB] = track[T_CLIMB]! + (rising - track[T_CLIMB]!) * Math.min(1, fx.frameDt * 4);
    if (now.distanceTo(eye) > REACH) return;
    const speed = track[T_SPEED]!;
    object.getWorldDirection(fwdAt);
    fwdAt.addScaledVector(upAt, -fwdAt.dot(upAt)).normalize();
    rightAt.crossVectors(upAt, fwdAt).normalize();
    const length = model?.size[0] ?? H * 2;
    const width = model?.size[1] ?? H * 0.8;
    const height = model?.size[2] ?? H;
    motion.copy(delta).multiplyScalar(1 / fx.frameDt);
    if (kind !== null && HULLS.has(kind) && now.length() > PLANET_RADIUS - SUBMERGED) {
      for (let i = 0; i < 3; i++) if (entry.ribbons[i]! < 0) entry.ribbons[i] = takeRibbon();
      wake(entry.slots, entry.ribbons, now, fwdAt, upAt, rightAt, speed, run, length, width, fx.frameDt);
      if (kind === 'jetski') rooster(entry.slots, now, fwdAt, upAt, rightAt, speed, length, fx.frameDt);
    } else if (kind === 'plane') {
      if (speed > PLANE_ROTATE * 1.05) contrail(entry.slots, now, fwdAt, upAt, rightAt, speed, run, length, height, 0);
    } else if (kind !== null && ENGINES.has(kind)) {
      if (speed > 0.5) exhaust(entry.slots, now, fwdAt, upAt, rightAt, speed, 0, motion, length, width, height, fx.frameDt);
    } else if (kind === 'balloon' && model?.burner !== undefined && track[T_CLIMB]! > 0.3) {
      flame(entry.slots, now, upAt, model.burner, fx.frameDt);
    }
  };

  /** Lets a followed vehicle go: its ribbons drain where they are and are then free for another. */
  function release(entry: Track): void {
    for (let i = 0; i < 3; i++) {
      const ribbon = entry.ribbons[i]!;
      if (ribbon >= 0) ribbonOwned[ribbon] = 0;
      entry.ribbons[i] = -1;
    }
    trackFree.push(entry);
  }

  const forget = (entry: Track, object: THREE.Object3D): void => {
    if (entry.row[T_SEEN] === fx.frame) return;
    tracks.delete(object);
    release(entry);
  };

  return { follow, release, forget };
}
