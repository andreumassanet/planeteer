import * as THREE from 'three';
import { AVATAR_HEIGHT } from '../avatar.ts';
import { SIT_EYE } from '../bench.ts';
import { ASIDE_HOLD, PERSON_RADIUS, STEP_ASIDE, type Standing, type Talker, type TownsfolkState } from './standing.ts';
import { startGesture } from './stroll.ts';

/** A sitter's crown over the root, as a share of their standing height: the sitting clip's eye (`SIT_EYE`) and the head over it. */
const SEATED_CROWN = SIT_EYE + 0.07;

export function collide(st: TownsfolkState, point: THREE.Vector3, radius: number, push: THREE.Vector3): boolean {
  let hit = false;
  const reach = radius + PERSON_RADIUS;
  const r = point.length();
  for (const entry of st.standing.values()) {
    st.gap.copy(point).sub(entry.position).sub(entry.aside);
    // Along the ground: the part of the gap that is not up.
    const up = st.gap.dot(point) / r;
    // Over their heads, or under their feet on a terrace below: no touch.
    if (up > entry.person.height || up < -AVATAR_HEIGHT) continue;
    st.gap.addScaledVector(point, -up / r);
    const d2 = st.gap.lengthSq();
    if (d2 >= reach * reach) continue;
    const d = Math.sqrt(d2);
    // Dead centre: out along any direction on the ground.
    if (d < 1e-6) {
      st.gap.set(1, 0, 0).addScaledVector(point, -point.x / (r * r));
      if (st.gap.lengthSq() < 1e-6) st.gap.set(0, 0, 1).addScaledVector(point, -point.z / (r * r));
      st.gap.normalize();
    }
    else st.gap.divideScalar(d);
    push.addScaledVector(st.gap, reach - d);
    hit = true;
  }
  return hit;
}

export function nearest(st: TownsfolkState, point: THREE.Vector3, reach: number): Talker | null {
  let best: Standing | null = null;
  let bestD = reach;
  for (const entry of st.standing.values()) {
    const d = entry.position.distanceTo(point);
    if (d < bestD) {
      bestD = d;
      best = entry;
    }
  }
  if (best === null) return null;
  st.talker.key = best.anchor.key;
  st.talker.position.copy(best.position);
  st.talker.height = best.person.height;
  st.talker.distance = bestD;
  return st.talker;
}

export function engage(st: TownsfolkState, key: string | null, towards?: THREE.Vector3): boolean {
  if (st.heldKey !== null && st.heldKey !== key) {
    const was = st.standing.get(st.heldKey);
    if (was !== undefined) was.held = false;
  }
  st.heldKey = key;
  if (key === null) return true;
  const entry = st.standing.get(key);
  if (entry === undefined) {
    st.heldKey = null;
    return false;
  }
  if (towards !== undefined) st.holdTowards.copy(towards);
  if (!entry.held) {
    entry.held = true;
    // A wave hello, on the townsfolk's own clock; a sitter stays sat and only talks.
    if (entry.mode !== 'sit') startGesture(entry, 'Wave', st.now);
  }
  return true;
}

export function crownOf(st: TownsfolkState, key: string, out: THREE.Vector3): boolean {
  const entry = st.standing.get(key);
  if (entry === undefined) return false;
  st.upAxis.set(0, 1, 0).applyQuaternion(entry.anchor.town);
  out.copy(entry.position).add(entry.aside).addScaledVector(st.upAxis, entry.person.height * (entry.mode === 'sit' ? SEATED_CROWN : 1));
  return true;
}

/**
 * Whoever stands within `reach` of `point`, or touches a body there when
 * `reach` is 0, steps aside from it along the ground and turns to look. A
 * sitter stays sat, and only looks (`animate`'s glance).
 */
export function startle(st: TownsfolkState, point: THREE.Vector3, reach: number): void {
  const r = point.length();
  const near = Math.max(reach, PERSON_RADIUS * 3);
  for (const entry of st.standing.values()) {
    if (entry.mode === 'sit' || entry.held) continue;
    st.gap.copy(entry.position).add(entry.aside).sub(point);
    st.gap.addScaledVector(point, -st.gap.dot(point) / (r * r));
    const d = st.gap.length();
    if (d > near) continue;
    if (d < 1e-6) st.gap.set(1, 0, 0).applyQuaternion(entry.anchor.town);
    entry.asideTarget.copy(st.gap.normalize()).multiplyScalar(STEP_ASIDE);
    entry.asideFor = ASIDE_HOLD;
    entry.startledBy.copy(point);
  }
}
