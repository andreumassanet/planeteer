import * as THREE from 'three';
import { WALK_STRIDE } from '../avatar.ts';
import type { ClipName } from '../cast.ts';
import { mayWalk } from '../signals.ts';
import { AXIS_UP, PERSON_RADIUS, STROLL_ARRIVE, STROLL_EASE, STROLL_PAUSE, STROLL_SLOWING, hash, turnBetween, type Standing, type TownsfolkState } from './standing.ts';

/** The yaw, in the person's town frame, that faces a world point. */
export function yawTowards(st: TownsfolkState, entry: Standing, point: THREE.Vector3): number {
  st.inverse.copy(entry.anchor.town).invert();
  st.local.copy(point).sub(entry.position).applyQuaternion(st.inverse);
  return Math.atan2(st.local.x, st.local.z);
}

/** The holder where the entry says: its position, and its yaw in its town's frame. */
export function place(st: TownsfolkState, entry: Standing): void {
  entry.holder.position.copy(entry.position).add(entry.aside);
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

/** Seconds a walker at a crossing's corner stands before looking at the light again. */
const CORNER_PAUSE: readonly [number, number] = [0.5, 4];

/**
 * One step on a city's crossing: wait at the corner for the walk light of the
 * zebra ahead, walk it, and on to the next; back the other way from the far
 * end. Once on a zebra the walker goes on to the far kerb whatever the light.
 */
export function crossStep(st: TownsfolkState, entry: Standing, dt: number): boolean {
  const crossing = entry.anchor.crossing;
  if (crossing === undefined) return false;
  const { corners, axes, signalTown } = crossing;
  const from = corners[entry.leg]!;
  const to = corners[entry.leg + entry.heading]!;
  st.local.copy(to).sub(from).applyQuaternion(st.inverse.copy(entry.anchor.town).invert());
  entry.targetYaw = Math.atan2(st.local.x, st.local.z);
  if (entry.held) {
    entry.pace = 0;
    return false;
  }
  if (entry.pause > 0) {
    entry.pace = 0;
    entry.pause -= dt;
    return false;
  }
  if (entry.along === 0) {
    const axis = axes[entry.heading === 1 ? entry.leg : entry.leg - 1]!;
    if (!mayWalk(signalTown, st.worldClock, axis) || Math.abs(turnBetween(entry.yaw, entry.targetYaw)) > 0.5) {
      entry.pace = 0;
      return false;
    }
  }
  const length = Math.max(1e-3, from.distanceTo(to));
  entry.pace += (entry.speed - entry.pace) * (1 - Math.exp(-STROLL_EASE * dt));
  let next = entry.along + (entry.pace * dt) / length;
  // The player just ahead is waited for, as a stroller waits.
  st.ahead.lerpVectors(from, to, Math.min(1, next));
  st.gap.copy(st.viewerAt).sub(st.ahead);
  if (st.gap.lengthSq() < (PERSON_RADIUS * 3) ** 2 && st.gap.dot(st.local.copy(to).sub(from)) > 0) {
    entry.pace = 0;
    return false;
  }
  let moved = (Math.min(1, next) - entry.along) * length;
  if (next >= 1) {
    // At the far kerb: the next zebra from here, or back the way it came.
    entry.leg += entry.heading;
    if (entry.leg <= 0 || entry.leg >= corners.length - 1) entry.heading = entry.heading === 1 ? -1 : 1;
    next = 0;
    entry.turns++;
    entry.pause = THREE.MathUtils.lerp(CORNER_PAUSE[0], CORNER_PAUSE[1], hash(entry.anchor.key, `c${entry.turns}`));
    entry.position.copy(to);
  } else {
    entry.position.lerpVectors(from, to, next);
  }
  entry.along = next;
  moved = Math.max(0, moved);
  entry.phase = (entry.phase + moved / WALK_STRIDE) % 1;
  return moved > 0;
}
