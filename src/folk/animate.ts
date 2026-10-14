import * as THREE from 'three';
import type { ClipName } from '../cast.ts';
import { BLEND_TIME, GLANCE_LIMIT, GLANCE_REACH, TALK_BLEND, TURN_RATE, hash, turnBetween, type Standing, type TownsfolkState } from './standing.ts';
import { place, startGesture, stroll, yawTowards } from './stroll.ts';

export const GESTURES: readonly ClipName[] = ['Interact', 'Wave'];
/** A pair talking gestures as they talk. */
export const TALKING: readonly ClipName[] = ['Interact', 'Interact', 'Wave'];

/** A gesture fades in over a quarter second and out over the last third of one. */
export function animate(st: TownsfolkState, entry: Standing, dt: number, clock: number, near: boolean): void {
  const { person, base, walk, talk } = entry;
  const moving = entry.mode === 'stroll' && stroll(st, entry, dt);
  // The walk shows as much as the pace is of a stroll, so a body easing to
  // a stop has its legs slowing with it rather than walking on the spot.
  const stepping = moving ? THREE.MathUtils.clamp(entry.pace / (entry.speed * 0.6), 0, 1) : 0;
  const d0 = stepping - entry.walking;
  entry.walking = THREE.MathUtils.clamp(entry.walking + Math.sign(d0) * Math.min(Math.abs(d0), dt / BLEND_TIME), 0, 1);
  // Talking: to the player while held, by turns in a pair.
  let speaking = entry.held;
  if (!speaking && entry.mode === 'chat') {
    speaking = Math.floor(clock / entry.turnLength + entry.speaksAt) % 2 === 0;
  }
  const t0 = (speaking ? 1 : 0) - entry.talking;
  entry.talking += Math.sign(t0) * Math.min(Math.abs(t0), dt / TALK_BLEND);
  // Turning, whoever is asking: the stroll's way, the partner, the player.
  if (entry.held) entry.targetYaw = yawTowards(st, entry, st.holdTowards);
  else if (entry.mode !== 'stroll') entry.targetYaw = entry.restYaw;
  const d = turnBetween(entry.yaw, entry.targetYaw);
  entry.yaw += Math.sign(d) * Math.min(Math.abs(d), TURN_RATE * dt);
  place(st, entry);

  // A gesture is for a listener: a speaker's hands are already talking.
  if (entry.gesture === null && entry.walking === 0 && entry.talking < 0.5 && clock >= entry.nextGesture) {
    const list = entry.mode === 'chat' ? TALKING : GESTURES;
    startGesture(entry, list[Math.floor(hash(entry.anchor.key, `g${Math.floor(clock)}`) * list.length)]!, clock);
  }
  let g = 0;
  if (entry.gesture !== null) {
    const duration = entry.gesture.getClip().duration;
    const t = clock - entry.gestureAt;
    if (t >= duration || moving) {
      entry.gesture.stop();
      entry.gesture = null;
      const [rest, spread] = entry.mode === 'chat' ? [2, 6] : [8, 20];
      entry.nextGesture = clock + rest + hash(entry.anchor.key, `n${Math.floor(clock)}`) * spread;
    } else {
      g = THREE.MathUtils.smoothstep(t, 0, 0.25) * (1 - THREE.MathUtils.smoothstep(t, duration - 0.3, duration));
      entry.gesture.time = t;
      entry.gesture.setEffectiveWeight(g * (1 - entry.walking));
    }
  }
  walk.time = entry.phase * walk.getClip().duration;
  walk.setEffectiveWeight(entry.walking);
  base.setEffectiveWeight((1 - entry.walking) * (1 - g) * (1 - entry.talking));
  talk.setEffectiveWeight((1 - entry.walking) * (1 - g) * entry.talking);
  if (entry.head !== null) entry.head.quaternion.copy(entry.headRest);
  person.mixer.update(dt);
  if (entry.head === null) return;
  entry.headRest.copy(entry.head.quaternion);
  // A glance at the player, near and not otherwise busy: the head alone,
  // turned about the town's up, so the body keeps the way it was facing.
  let want = 0;
  if (near && !entry.held && entry.walking === 0 && entry.position.distanceToSquared(st.viewerAt) < GLANCE_REACH ** 2) {
    want = THREE.MathUtils.clamp(turnBetween(entry.yaw, yawTowards(st, entry, st.viewerAt)), -GLANCE_LIMIT, GLANCE_LIMIT);
  }
  const e = want - entry.glance;
  entry.glance += Math.sign(e) * Math.min(Math.abs(e), TURN_RATE * 0.5 * dt);
  if (Math.abs(entry.glance) < 1e-3) return;
  // The turn about the world's up, carried into the head's parent frame.
  const parent = entry.head.parent!;
  st.upAxis.set(0, 1, 0).applyQuaternion(entry.anchor.town);
  parent.getWorldQuaternion(st.parentTurn);
  st.turn.setFromAxisAngle(st.upAxis, entry.glance);
  // parent^-1 * turn * parent * rest
  entry.head.quaternion.copy(st.parentTurn).invert().multiply(st.turn).multiply(st.parentTurn).multiply(entry.headRest);
}
