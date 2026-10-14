/**
 * Moving over the sphere: the surface frame is rotated about the player's own right axis, so nothing here names a latitude and there is no pole to cross.
 */
import * as THREE from 'three';
import { isWater } from '../vehicles.ts';
import {
  BAIL_LANDING,
  FOLLOW_SLOPE,
  GRAVITY,
  HEIGHT_SMOOTHING,
  HULL_PROBES,
  JUMP_SPEED,
  LANDING_HARD,
} from './constants.ts';
import { approach } from './math.ts';
import type { PlayerCore } from './core.ts';

export function createFrame(core: PlayerCore) {
  const { avatar, axis, bow, forward, landAt, motion, moved, options, position, probe, up } = core;
  const s = core.fields;
  const cross = new THREE.Vector3();
  /** Where the frame's step started, to go back to when it meets a wall of made ground. */
  const stepFrom = new THREE.Vector3();
  const stepUp = new THREE.Vector3();
  const stepForward = new THREE.Vector3();

  /** Signed angle from `from` to `to`, measured about `about`. */
  function angleAbout(from: THREE.Vector3, to: THREE.Vector3, about: THREE.Vector3): number {
    cross.crossVectors(from, to);
    return Math.atan2(cross.dot(about), from.dot(to));
  }

  /** Moves `arc` radians along a tangent direction, carrying the frame with it. */
  function advance(along: THREE.Vector3, arc: number): void {
    if (arc === 0) return;
    axis.crossVectors(up, along).normalize();
    position.applyAxisAngle(axis, arc);
    forward.applyAxisAngle(axis, arc).normalize();
    up.copy(position).normalize();
  }

  /** The point `arc` radians from here along a tangent direction. */
  function pointAhead(along: THREE.Vector3, arc: number, out: THREE.Vector3): THREE.Vector3 {
    axis.crossVectors(up, along).normalize();
    return out.copy(position).applyAxisAngle(axis, arc);
  }

  /** Is there water for the whole width of the hull, `arc` radians ahead? */
  function clearAhead(along: THREE.Vector3, arc: number): boolean {
    for (const offset of HULL_PROBES) {
      bow.copy(along);
      if (offset !== 0) bow.applyAxisAngle(up, offset).normalize();
      pointAhead(bow, arc, probe);
      if (!isWater(landAt(probe))) return false;
    }
    return true;
  }

  /** Rotates the frame by `moved`, carrying `motion` and the facing with it; returns the distance. */
  function travel(): number {
    const distance = moved.length();
    stepFrom.copy(position);
    stepUp.copy(up);
    stepForward.copy(forward);
    if (distance > 1e-9) {
      const arc = distance / position.length();
      axis.crossVectors(up, moved).normalize();
      position.applyAxisAngle(axis, arc);
      motion.applyAxisAngle(axis, arc);
      forward.applyAxisAngle(axis, arc).normalize();
      up.copy(position).normalize();
    }
    return distance;
  }

  /** Back to where the frame's move started. */
  function undo(): void {
    position.copy(stepFrom);
    up.copy(stepUp);
    forward.copy(stepForward);
    motion.set(0, 0, 0);
  }

  /** Height after a move of `distance` over the ground: follow a rise and a slope down, glide down a step, fall off a cliff. */
  function settle(dt: number, ground: number, drop: number, distance: number): void {
    if (s.airborne) {
      s.vertical -= GRAVITY * dt;
      s.height += s.vertical * dt;
      if (s.height <= ground) {
        s.height = ground;
        if (!isWater(ground)) {
          options.onTouchdown?.(-s.vertical);
          avatar.land(s.tumbling ? BAIL_LANDING : (-s.vertical - JUMP_SPEED) / (JUMP_SPEED * LANDING_HARD));
        }
        s.tumbling = false;
        s.vertical = 0;
        s.airborne = false;
      }
    } else if (ground >= s.height) {
      // Uphill. Follow it exactly: see HEIGHT_SMOOTHING.
      s.height = ground;
    } else if (ground < s.height - drop) {
      // Off a cliff. Falling is the honest answer; sliding down the face of a
      // 20-unit coast is not.
      s.airborne = true;
      s.vertical = 0;
    } else if (s.height - ground <= distance * FOLLOW_SLOPE) {
      // Downhill: see FOLLOW_SLOPE.
      s.height = ground;
    } else {
      s.height += (ground - s.height) * approach(HEIGHT_SMOOTHING, dt);
    }
    position.setLength(s.height);
  }

  return { angleAbout, advance, pointAhead, clearAhead, travel, undo, settle };
}

export type Frame = ReturnType<typeof createFrame>;
