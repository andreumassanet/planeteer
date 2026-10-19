import * as THREE from 'three';
import type { ClipName } from '../cast.ts';
import { WALK_STRIDE } from '../avatar.ts';
import { ASIDE_EASE, BLEND_TIME, GLANCE_LIMIT, GLANCE_REACH, TALK_BLEND, TURN_RATE, hash, turnBetween, type Standing, type TownsfolkState } from './standing.ts';
import { crossStep, place, startGesture, stroll, yawTowards } from './stroll.ts';

export const GESTURES: readonly ClipName[] = ['Interact', 'Wave'];
/** A pair talking gestures as they talk. */
export const TALKING: readonly ClipName[] = ['Interact', 'Interact', 'Wave'];

/** A gesture fades in over a quarter second and out over the last third of one. */
export function animate(st: TownsfolkState, entry: Standing, dt: number, clock: number, near: boolean): void {
  const { person, base, walk, talk } = entry;
  const seated = entry.mode === 'sit';
  const moving = entry.mode === 'stroll' ? stroll(st, entry, dt) : entry.mode === 'cross' ? crossStep(st, entry, dt) : false;
  // The walk shows as much as the pace is of a stroll, so a body easing to
  // a stop has its legs slowing with it rather than walking on the spot.
  let stepping = moving ? THREE.MathUtils.clamp(entry.pace / (entry.speed * 0.6), 0, 1) : 0;
  // Stepping aside from a horn or a bump, and back: the feet go with it.
  if (entry.asideFor > 0) {
    entry.asideFor -= dt;
    if (entry.asideFor <= 0) entry.asideTarget.set(0, 0, 0);
  }
  const asideStep = entry.aside.distanceTo(entry.asideTarget) * (1 - Math.exp(-ASIDE_EASE * dt));
  if (asideStep > 1e-4) {
    entry.aside.lerp(entry.asideTarget, 1 - Math.exp(-ASIDE_EASE * dt));
    entry.phase = (entry.phase + asideStep / WALK_STRIDE) % 1;
    stepping = Math.max(stepping, THREE.MathUtils.clamp(asideStep / Math.max(1e-6, dt) / (entry.speed * 0.6), 0, 1));
  }
  const d0 = stepping - entry.walking;
  entry.walking = THREE.MathUtils.clamp(entry.walking + Math.sign(d0) * Math.min(Math.abs(d0), dt / BLEND_TIME), 0, 1);
  // Talking: to the player while held, by turns in a pair.
  let speaking = entry.held;
  if (!speaking && (entry.mode === 'chat' || (seated && entry.anchor.chatting))) {
    speaking = Math.floor(clock / entry.turnLength + entry.speaksAt) % 2 === 0;
  }
  const t0 = (speaking ? 1 : 0) - entry.talking;
  entry.talking += Math.sign(t0) * Math.min(Math.abs(t0), dt / TALK_BLEND);
  // Turning, whoever is asking: the stroll's way, the partner, the player.
  if (seated) entry.targetYaw = entry.restYaw;
  else if (entry.held) entry.targetYaw = yawTowards(st, entry, st.holdTowards);
  else if (entry.asideFor > 0 && entry.mode !== 'stroll' && entry.mode !== 'cross') entry.targetYaw = yawTowards(st, entry, entry.startledBy);
  else if (entry.mode !== 'stroll' && entry.mode !== 'cross') entry.targetYaw = entry.restYaw;
  const d = turnBetween(entry.yaw, entry.targetYaw);
  entry.yaw += Math.sign(d) * Math.min(Math.abs(d), TURN_RATE * dt);
  place(st, entry);

  // A gesture is for a listener: a speaker's hands are already talking.
  if (!seated && entry.gesture === null && entry.walking === 0 && entry.talking < 0.5 && clock >= entry.nextGesture) {
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
  if (entry.seatTalk !== null) {
    // Seated: the sitting clip whole, the talking one over the upper body.
    base.setEffectiveWeight(1);
    talk.setEffectiveWeight(0);
    entry.seatTalk.setEffectiveWeight(entry.talking);
  } else {
    base.setEffectiveWeight((1 - entry.walking) * (1 - g) * (1 - entry.talking));
    talk.setEffectiveWeight((1 - entry.walking) * (1 - g) * entry.talking);
  }
  if (entry.head !== null) entry.head.quaternion.copy(entry.headRest);
  st.umbrellas.unpose(person);
  person.mixer.update(dt);
  st.umbrellas.pose(person, entry.anchor.key, dt);
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
