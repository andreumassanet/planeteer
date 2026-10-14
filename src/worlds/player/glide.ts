/** Falling from an aircraft, and under a canopy: Earth's `glide`, its laws shared from `craft/parachute.ts`. */

import * as THREE from 'three';
import { AVATAR_HEIGHT } from '../../avatar.ts';
import type { InputState } from '../../input.ts';
import {
  CANOPY_OPENING,
  CHUTE_FORCED,
  CHUTE_GLIDE,
  CHUTE_GLIDE_RATE,
  CHUTE_GRIP,
  CHUTE_PACE,
  CHUTE_PULL,
  CHUTE_SINK,
  CHUTE_SINK_RATE,
  CHUTE_SWING,
  CHUTE_TURN,
  FREEFALL_DIVE,
  FREEFALL_MIN,
  FREEFALL_RATE,
  FREEFALL_TRACK,
  buildParachute,
  openCanopy,
  swingUnder,
  trailOf,
} from '../../craft/parachute.ts';
import { BODY_RADIUS } from '../player.ts';
import { FORWARD, RIGHT, UP, WANT, orient } from './frame.ts';
import type { PlayerState } from './state.ts';

/** The canopy over the body while it is open, in the body's own upright frame. */
function drawCanopy(s: PlayerState): void {
  if (!s.chute || s.canopy === 0) {
    if (s.parachute !== null) s.parachute.visible = false;
    return;
  }
  if (s.parachute === null) {
    // Hung in the body's upright frame: a holder there, the canopy in it.
    s.parachute = new THREE.Group();
    s.parachute.name = 'parachute';
    s.parachute.add(buildParachute());
    s.home?.add(s.parachute);
  }
  s.parachute.visible = true;
  s.parachute.position.copy(s.position);
  orient(s.parachute, UP.copy(s.position).normalize(), s.facing);
  openCanopy(s.parachute.children[0]!, s.canopy, s.lean + (s.swing.roll - s.lean) * 0.3, s.steering, s.swing.pitch * 0.3);
}

/**
 * The jump key opens the canopy and stows it again over `CHUTE_FORCED`; under
 * it the keys steer rather than walk.
 */
export function glide(s: PlayerState, dt: number, input: InputState, steer: THREE.Vector3): void {
  const up = UP.copy(s.position).normalize();
  s.facing.addScaledVector(up, -s.facing.dot(up)).normalize();
  const over = s.position.length() - (s.world.radius + s.world.groundAt(s.position));
  if (input.jump && over > CHUTE_FORCED) s.canopy = s.canopy > 0 ? 0 : 1e-3;
  if (s.canopy === 0 && over <= CHUTE_FORCED) s.canopy = 1e-3;
  const open = s.canopy > 0;
  if (open) s.canopy += dt;
  s.spread += ((open ? 1 : 0) - s.spread) * (1 - Math.exp(-dt * (open ? 1 / CANOPY_OPENING : 8)));
  const stickX = Math.max(-1, Math.min(1, input.move.x));
  const stickY = Math.max(-1, Math.min(1, input.move.y));
  let fall: number;
  if (open) {
    s.steering += (stickX - s.steering) * (1 - Math.exp(-3 * dt));
    s.facing.applyAxisAngle(up, -s.steering * CHUTE_TURN * dt).normalize();
    const pace = 1 + CHUTE_PACE * stickY;
    WANT.copy(s.facing).multiplyScalar((CHUTE_GLIDE + over * CHUTE_GLIDE_RATE) * pace);
    s.motion.lerp(WANT, 1 - Math.exp(-1.5 * dt));
    fall = (CHUTE_SINK + over * CHUTE_SINK_RATE) * (1 + CHUTE_PACE * 0.5 * stickY);
  } else {
    // Tracked across the ground like a walk, towards the camera's way, and
    // facing where the camera looks.
    const heading = FORWARD.copy(steer).addScaledVector(up, -steer.dot(up));
    if (heading.lengthSq() < 1e-8) heading.copy(s.facing);
    heading.normalize();
    const side = RIGHT.crossVectors(heading, up).normalize();
    WANT.set(0, 0, 0).addScaledVector(heading, stickY).addScaledVector(side, stickX);
    if (WANT.lengthSq() > 1) WANT.normalize();
    s.motion.lerp(WANT.multiplyScalar(FREEFALL_TRACK), 1 - Math.exp(-1.2 * dt));
    s.facing.lerp(heading, 1 - Math.exp(-4 * dt)).normalize();
    s.steering += (stickX - s.steering) * (1 - Math.exp(-3 * dt));
    fall = Math.max(FREEFALL_MIN, over * FREEFALL_RATE) * (stickY > 0 ? FREEFALL_DIVE : 1);
  }
  s.vertical += (-fall - s.vertical) * (1 - Math.exp(-(open ? 2 : 4) * dt));
  s.motion.addScaledVector(up, -s.motion.dot(up));
  s.velocity.copy(s.motion);
  const height = s.position.length() + s.vertical * dt;
  s.position.addScaledVector(s.motion, dt);
  if (over < AVATAR_HEIGHT * 4) s.world.collide(s.position, BODY_RADIUS);
  s.lean = open ? s.steering * CHUTE_SWING : 0;
  const ground = s.world.radius + s.world.groundAt(s.position);
  if (height > ground) s.position.setLength(height);
  else {
    // Down.
    s.chute = false;
    s.canopy = 0;
    s.spread = 0;
    s.airborne = false;
    s.motion.set(0, 0, 0);
    s.velocity.set(0, 0, 0);
    s.position.setLength(ground);
    s.world.onTouchdown?.(-s.vertical);
    s.vertical = 0;
    s.avatar.land(0.4);
  }
  // The fall's pose, and the body swung about the hands under the canopy.
  swingUnder(s.swing, dt, s.motion.length(), s.lean, s.spread);
  trailOf(s.swing, s.lean, s.spread, s.trail);
  if (s.chute) s.avatar.skydive(dt, s.spread, s.steering, CHUTE_GRIP, CHUTE_PULL, s.trail);
  s.avatar.group.position.copy(s.position);
  orient(s.avatar.group, UP.copy(s.position).normalize(), s.facing);
  if (s.chute) {
    const pivot = CHUTE_GRIP[1] * s.spread;
    s.swingEuler.set(s.swing.pitch * s.spread, 0, s.lean + (s.swing.roll - s.lean) * s.spread);
    s.swung.setFromEuler(s.swingEuler);
    s.hangFrom.set(0, pivot, 0).applyQuaternion(s.swung);
    s.hangFrom.set(-s.hangFrom.x, pivot - s.hangFrom.y, -s.hangFrom.z).applyQuaternion(s.avatar.group.quaternion);
    s.avatar.group.quaternion.multiply(s.swung);
    s.avatar.group.position.add(s.hangFrom);
  }
  drawCanopy(s);
}
