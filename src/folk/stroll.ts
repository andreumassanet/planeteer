import * as THREE from 'three';
import { WALK_STRIDE } from '../avatar.ts';
import type { ClipName } from '../cast.ts';
import { AXIS_UP, PERSON_RADIUS, STROLL_ARRIVE, STROLL_EASE, STROLL_PAUSE, STROLL_SLOWING, hash, turnBetween, type Standing, type TownsfolkState } from './standing.ts';

/** The yaw, in the person's town frame, that faces a world point. */
export function yawTowards(st: TownsfolkState, entry: Standing, point: THREE.Vector3): number {
  st.inverse.copy(entry.anchor.town).invert();
  st.local.copy(point).sub(entry.position).applyQuaternion(st.inverse);
  return Math.atan2(st.local.x, st.local.z);
}

/** The holder where the entry says: its position, and its yaw in its town's frame. */
export function place(st: TownsfolkState, entry: Standing): void {
  entry.holder.position.copy(entry.position);
  st.turn.setFromAxisAngle(AXIS_UP, entry.yaw);
  entry.holder.quaternion.copy(entry.anchor.town).multiply(st.turn);
}

/**
 * One step of a stroll: walk the stretch, stand at its end, turn, walk back.
 * Anybody in the way — the player — is waited for rather than walked through.
 */
export function stroll(st: TownsfolkState, entry: Standing, dt: number): boolean {
  const { anchor } = entry;
  if (entry.held) {
    entry.pace = 0;
    return false;
  }
  if (entry.pause > 0) {
    entry.pace = 0;
    entry.pause -= dt;
    if (entry.pause <= 0) {
      entry.heading = entry.heading === 1 ? -1 : 1;
      entry.turns++;
    }
    entry.targetYaw = entry.heading === 1 ? entry.strollYaw : entry.strollYaw + Math.PI;
    return false;
  }
  entry.targetYaw = entry.heading === 1 ? entry.strollYaw : entry.strollYaw + Math.PI;
  // Not yet facing the way: turn on the spot first.
  if (Math.abs(turnBetween(entry.yaw, entry.targetYaw)) > 0.5) {
    entry.pace = 0;
    return false;
  }
  // Setting off, and pulling up over the last few steps of the stretch.
  const left = (entry.heading === 1 ? 1 - entry.along : entry.along) * entry.length;
  const wanted = entry.speed * THREE.MathUtils.clamp(left / STROLL_SLOWING, STROLL_ARRIVE, 1);
  entry.pace += (wanted - entry.pace) * (1 - Math.exp(-STROLL_EASE * dt));
  const step = (entry.pace * dt) / entry.length;
  let next = entry.along + step * entry.heading;
  // Somebody standing just ahead is waited for.
  st.ahead.lerpVectors(anchor.from, anchor.to, THREE.MathUtils.clamp(next, 0, 1));
  st.gap.copy(st.viewerAt).sub(st.ahead);
  if (st.gap.lengthSq() < (PERSON_RADIUS * 3) ** 2) {
    st.local.copy(anchor.to).sub(anchor.from).multiplyScalar(entry.heading);
    if (st.gap.dot(st.local) > 0) {
      entry.pace = 0;
      return false;
    }
  }
  if (next >= 1 || next <= 0) {
    next = THREE.MathUtils.clamp(next, 0, 1);
    entry.pause = THREE.MathUtils.lerp(STROLL_PAUSE[0], STROLL_PAUSE[1], hash(anchor.key, `p${entry.turns}`));
  }
  const moved = Math.abs(next - entry.along) * entry.length;
  entry.along = next;
  entry.position.lerpVectors(anchor.from, anchor.to, next);
  entry.phase = (entry.phase + moved / WALK_STRIDE) % 1;
  return moved > 0;
}

export function startGesture(entry: Standing, which: ClipName, clock: number): void {
  entry.gesture?.stop();
  entry.gesture = entry.person.actions.get(which)!;
  entry.gesture.reset().play();
  entry.gesture.timeScale = 0;
  entry.gestureAt = clock;
}
