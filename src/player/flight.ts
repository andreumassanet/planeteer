/**
 * What the aircraft share: the climb keys, the course's pull, a refused
 * landing, and a knock against a wall.
 */
import * as THREE from 'three';
import { PLANET_RADIUS } from '../globe.ts';
import { FOUNDER_DRAG, PLANE_CLIMB_MIN, WATERLINE, founderDepth } from '../vehicles.ts';
import type { CraftModel } from '../craft/contract.ts';
import { BREAK_SPEED, punchOf } from '../breakables/kinds.ts';
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
  WRECK_INTO,
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
   * An aircraft sweeping from `from` to `to`, a body of `radius` going
   * `velocity`: whatever breakable it meets at whatever height is knocked over
   * (`PlayerOptions.strike`), its wall down before the walls are asked, so a
   * tree is never what stops or wrecks it.
   */
  function smash(from: THREE.Vector3, to: THREE.Vector3, radius: number, velocity: THREE.Vector3, model: CraftModel): void {
    if (options.strike === undefined || velocity.length() < BREAK_SPEED) return;
    const jolt = options.strike(from, to, radius, velocity, punchOf(model.size[0], model.size[1]));
    if (jolt > 0) options.onEvent?.('broke', jolt);
  }

  /** Wrecked: the explosion and the body thrown out are the controller's, at the end of this frame (`player.ts`). */
  function wreck(strength: number): void {
    s.wreck = Math.max(s.wreck, strength);
  }

  /**
   * A plane in the air into a wall, `push` the way out of it, coming down at
   * `sink` units a second. Into it faster than `WRECK_INTO`, along the wall's
   * normal or straight down onto it (a dive onto a roof is met by a wall's
   * push sideways), it is wrecked and this returns true; else it is turned
   * off the wall and slowed to `PLANE_BOUNCE` of its speed, climbing away as a
   * refused landing does, and a `crashed` told with the speed lost.
   */
  function bounce(push: THREE.Vector3, sink = 0): boolean {
    const depth = push.length();
    if (depth < 1e-9) return false;
    direction.copy(push).divideScalar(depth);
    const into = forward.dot(direction);
    const impact = Math.max(-into * s.speed, sink);
    if (impact >= WRECK_INTO) {
      wreck(Math.max(impact, Math.hypot(s.speed, sink) * 0.5));
      return true;
    }
    // Out of the wall first, then the part of the heading into it turned back.
    advance(direction, depth / position.length());
    if (into < 0) forward.addScaledVector(direction, -1.5 * into).projectOnPlane(up).normalize();
    const lost = s.speed * (1 - PLANE_BOUNCE);
    s.speed *= PLANE_BOUNCE;
    s.goAround = PLANE_GO_AROUND;
    s.climbing = Math.max(s.climbing, PLANE_CLIMB_MIN);
    if (s.sinceCrash >= CRASH_QUIET) {
      s.sinceCrash = 0;
      options.onEvent?.('crashed', lost);
    }
    return false;
  }

  /**
   * An aircraft gone into the water (`founder` from 0, or from `FOUNDER_FLOAT`
   * for a plunge), one frame: its way dying over `FOUNDER_DRAG`, going down
   * by `founderDepth`, until `sunk` hands it to the fleet and the body swims.
   */
  function sink(dt: number): void {
    s.founder += dt;
    s.founderWay *= Math.exp(-dt / FOUNDER_DRAG);
    s.speed = s.founderWay;
    if (Math.abs(s.speed) > 1e-6) advance(forward, (s.speed * dt) / position.length());
    s.height = PLANET_RADIUS + WATERLINE - founderDepth(s.founder);
    position.setLength(s.height);
    s.altitude = s.height - PLANET_RADIUS;
    s.velocity = Math.abs(s.speed);
    s.climbing = s.climbAccel = 0;
    s.climbRate = s.climbRateRate = 0;
  }

  return { liftOf, pullOf, assistTurn, assistClimb, refuse, bounce, wreck, sink, smash };
}

export type Flight = ReturnType<typeof createFlight>;
