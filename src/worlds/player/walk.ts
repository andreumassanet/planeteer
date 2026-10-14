/** On foot: the keys against the camera's heading, a jump at the world's gravity, the gait and its heel strikes. */

import type * as THREE from 'three';
import { RUN_SPEED, WALK_SPEED } from '../../avatar.ts';
import type { InputState } from '../../input.ts';
import { BODY_RADIUS, JUMP_SPEED } from '../player.ts';
import { FORWARD, RIGHT, UP, WANT, WAS_FACING, angleAbout, orient } from './frame.ts';
import type { PlayerState } from './state.ts';

/** A step this high or lower is walked down without leaving the ground. */
const STEP_DOWN = 1.2;

/** One step on foot under `input`, steered by `steer` (a tangent, the camera's). */
export function walk(s: PlayerState, dt: number, input: InputState, steer: THREE.Vector3): void {
  const up = UP.copy(s.position).normalize();
  // Carry the facing and the velocity across the sphere: tangent again.
  s.facing.addScaledVector(up, -s.facing.dot(up)).normalize();
  s.velocity.addScaledVector(up, -s.velocity.dot(up));

  // The keys, against the camera's tangent heading.
  const forward = FORWARD.copy(steer).addScaledVector(up, -steer.dot(up)).normalize();
  const right = RIGHT.crossVectors(forward, up).normalize();
  const speed = input.run ? RUN_SPEED : WALK_SPEED;
  const want = WANT.set(0, 0, 0).addScaledVector(forward, input.move.y).addScaledVector(right, input.move.x);
  if (want.lengthSq() > 1) want.normalize();
  want.multiplyScalar(speed);
  // Grip on the ground, a little steering in the air.
  const grip = s.airborne ? 1.2 : 12;
  s.velocity.lerp(want, Math.min(1, grip * dt));
  WAS_FACING.copy(s.facing);
  if (want.lengthSq() > 0.01) s.facing.lerp(want.clone().normalize(), Math.min(1, dt * 10)).normalize();
  // What the body is told on top of its speed, as on Earth: how fast it
  // turns, and where the camera looks from its facing, which the head and
  // chest turn towards while it stands.
  s.cues.turn = dt > 0 ? angleAbout(WAS_FACING, s.facing, up) / dt : 0;
  s.cues.look = angleAbout(s.facing, forward, up);

  s.position.addScaledVector(s.velocity, dt);
  s.world.collide(s.position, BODY_RADIUS);

  const ground = s.world.radius + s.world.groundAt(s.position);
  let radial = s.position.length();
  if (input.jump && !s.airborne) {
    s.vertical = JUMP_SPEED;
    s.airborne = true;
    radial = Math.max(radial, ground);
  }
  if (s.airborne) {
    s.vertical -= s.gravity * dt;
    radial += s.vertical * dt;
    if (radial <= ground) {
      const hardness = Math.max(0, (-s.vertical - JUMP_SPEED) / (JUMP_SPEED * 2));
      radial = ground;
      s.airborne = false;
      s.world.onTouchdown?.(-s.vertical);
      s.vertical = 0;
      s.avatar.land(hardness);
    }
  } else if (radial - ground > STEP_DOWN) {
    // Off a ledge: fall, at this world's rate.
    s.airborne = true;
    s.vertical = 0;
  } else {
    radial = ground;
  }
  s.position.setLength(radial);

  const horizontal = s.velocity.length();
  // A gesture is made standing: the first step puts it down.
  if (s.avatar.emoting !== null && want.lengthSq() > 0.01) s.avatar.emote(null);
  s.avatar.stride(dt, horizontal, s.airborne, s.cues);
  // A heel strike at each half of the cycle; see `Avatar.phase`.
  const stepPhase = s.avatar.phase;
  if (!s.airborne && horizontal > WALK_SPEED * 0.3 && (stepPhase < s.lastStep || (s.lastStep < 0.5 && stepPhase >= 0.5))) {
    s.world.onStep?.(horizontal / WALK_SPEED);
  }
  s.lastStep = stepPhase;
  s.avatar.group.position.copy(s.position);
  orient(s.avatar.group, UP.copy(s.position).normalize(), s.facing);
}
