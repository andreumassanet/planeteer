/**
 * What the aircraft share: the climb keys, a refused landing, and a knock against a wall.
 */
import * as THREE from 'three';
import { PLANE_CLIMB_MIN } from '../vehicles.ts';
import { CRASH_QUIET, PLANE_BOUNCE, PLANE_GO_AROUND, REFUSAL_QUIET } from './constants.ts';
import { clamp } from './math.ts';
import type { PlayerInput } from './types.ts';
import type { PlayerCore } from './core.ts';
import type { Frame } from './frame.ts';

export function createFlight(core: PlayerCore, frame: Frame) {
  const { controls, direction, forward, options, position, up } = core;
  const s = core.fields;
  const { advance } = frame;

  /**
   * Up or down, as an aircraft reads the keys: the climb key (`Space`) up, the run
   * key (`Shift`) or the descend key (`C`) down, and up and down together nothing.
   */
  function liftOf(input: PlayerInput): number {
    return clamp(controls.lift - (input.run ? 1 : 0), -1, 1);
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

  return { liftOf, refuse, bounce };
}

export type Flight = ReturnType<typeof createFlight>;
