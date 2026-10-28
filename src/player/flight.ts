/**
 * What the aircraft share: the climb keys, the course's pull, a refused
 * landing, and a knock against a wall.
 */
import * as THREE from 'three';
import { PLANE_CLIMB_MIN } from '../vehicles.ts';
import {
  ASSIST_GAIN_MAX,
  ASSIST_GAIN_MIN,
  ASSIST_LEAD,
  ASSIST_NEAR,
  ASSIST_RISE_MAX,
  ASSIST_RISE_MIN,
  CRASH_QUIET,
  PLANE_BOUNCE,
  PLANE_GO_AROUND,
  REFUSAL_QUIET,
} from './constants.ts';
import { clamp } from './math.ts';
import type { PlayerInput } from './types.ts';
import type { PlayerCore } from './core.ts';
import type { Frame } from './frame.ts';

/**
 * The course's pull as an aircraft reads it: the target's bearing off the bow
 * (radians, positive to the left, as a turn about `up` is), its distance along
 * the ground, how far over the aircraft it is, and how firmly it pulls, 0 to 1.
 */
export interface Pull {
  bearing: number;
  distance: number;
  rise: number;
  strength: number;
}

export function createFlight(core: PlayerCore, frame: Frame) {
  const { controls, direction, forward, options, position, up } = core;
  const s = core.fields;
  const { advance } = frame;
  const toward = new THREE.Vector3();
  const cross = new THREE.Vector3();
  const pull: Pull = { bearing: 0, distance: 0, rise: 0, strength: 0 };

  /**
   * Up or down, as an aircraft reads the keys: the climb key (`Space`) or the
   * nose-up key (`K`) up, the run key (`Shift`), the descend key (`C`) or the
   * nose-down key (`I`) down, and up and down together nothing.
   */
  function liftOf(input: PlayerInput): number {
    const stick = input.attitude?.pitch ?? 0;
    return clamp(controls.lift - (input.run ? 1 : 0) + Math.sign(stick), -1, 1);
  }

  /**
   * The pull this frame, or null: no target, no strength, or one already
   * within `ASSIST_NEAR`, which is being flown through rather than steered for.
   */
  function pullOf(input: PlayerInput): Pull | null {
    const assist = input.assist;
    if (assist === undefined || assist === null || !(assist.strength > 0)) return null;
    toward.subVectors(assist.target, position);
    toward.addScaledVector(up, -toward.dot(up));
    const distance = toward.length();
    if (distance < ASSIST_NEAR) return null;
    toward.divideScalar(distance);
    cross.crossVectors(forward, toward);
    pull.bearing = Math.atan2(cross.dot(up), forward.dot(toward));
    pull.distance = distance;
    pull.rise = assist.target.length() - position.length();
    pull.strength = Math.min(1, assist.strength);
    return pull;
  }

  /**
   * The turn the pull asks for at `speed`, radians a second, positive to the
   * left and never past `top`: the arc onto the target while it is ahead,
   * the whole of `top` while it is behind.
   */
  function assistTurn(speed: number, at: Pull, top: number): number {
    const gain = clamp((2 * speed) / at.distance, ASSIST_GAIN_MIN, ASSIST_GAIN_MAX);
    const rate = Math.abs(at.bearing) > Math.PI / 2 ? Math.sign(at.bearing) * top : at.bearing * gain;
    return clamp(rate, -top, top) * at.strength;
  }

  /** The vertical speed the pull asks for at `speed`, units a second, within `sink` (negative) and `climb`. */
  function assistClimb(speed: number, at: Pull, sink: number, climb: number): number {
    const gain = clamp((ASSIST_LEAD * speed) / at.distance, ASSIST_RISE_MIN, ASSIST_RISE_MAX);
    return clamp(at.rise * gain, sink, climb) * at.strength;
  }

  /** Says a landing was refused, once in `REFUSAL_QUIET`, and goes round again. */
  function refuse(event: 'water-refused' | 'steep-refused'): void {
    s.goAround = PLANE_GO_AROUND;
    if (s.sinceRefusal < REFUSAL_QUIET) return;
    s.sinceRefusal = 0;
    options.onEvent?.(event, 0);
  }

  /**
   * A plane in the air into a wall, `push` the way out of it: turned off the wall
   * and slowed to `PLANE_BOUNCE` of its speed, climbing away as a refused landing
   * does, and a `crashed` told with the speed lost.
   */
  function bounce(push: THREE.Vector3): void {
    const depth = push.length();
    if (depth < 1e-9) return;
    direction.copy(push).divideScalar(depth);
    // Out of the wall first, then the part of the heading into it turned back.
    advance(direction, depth / position.length());
    const into = forward.dot(direction);
    if (into < 0) forward.addScaledVector(direction, -1.5 * into).projectOnPlane(up).normalize();
    const lost = s.speed * (1 - PLANE_BOUNCE);
    s.speed *= PLANE_BOUNCE;
    s.goAround = PLANE_GO_AROUND;
    s.climbing = Math.max(s.climbing, PLANE_CLIMB_MIN);
    if (s.sinceCrash >= CRASH_QUIET) {
      s.sinceCrash = 0;
      options.onEvent?.('crashed', lost);
    }
  }

  return { liftOf, pullOf, assistTurn, assistClimb, refuse, bounce };
}

export type Flight = ReturnType<typeof createFlight>;
