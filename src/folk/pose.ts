import * as THREE from 'three';
import { WALK_SPEED } from '../avatar.ts';
import type { ClipName } from '../cast.ts';
import { STANCES, STROLL_PACE, STROLL_PAUSE, STROLL_SHARE, TALK_TURN, hash, type FolkAnchor, type Mode, type Standing, type TownsfolkState } from './standing.ts';
import { place } from './stroll.ts';

export function release(st: TownsfolkState, entry: Standing): void {
  st.group.remove(entry.holder);
  if (entry.head !== null) entry.head.quaternion.copy(entry.headRest);
  // Back to the cast's pool, not disposed: see `Cast.release`.
  st.folk.release(entry.person);
  st.standing.delete(entry.anchor.key);
}

export function dress(st: TownsfolkState, anchor: FolkAnchor, clock: number): Standing | null {
  const person = st.folk.dress(anchor.key, anchor.region, anchor.warmth);
  if (person === null) return null;
  const holder = new THREE.Group();
  holder.add(person.root);
  st.group.add(holder);
  // Mostly the relaxed idle; some stand ready, the way people waiting do,
  // and some with their weight on one leg.
  let pick = hash(anchor.key, 'stance');
  let stance: ClipName = STANCES[0]![0];
  for (const [clip, share] of STANCES) {
    stance = clip;
    if ((pick -= share) < 0) break;
  }
  const base = person.actions.get(stance)!;
  base.play();
  // Every action a pooled person comes back with is at a time scale of one
  // and full weight (`Cast.release`): each is set here before it plays.
  base.setEffectiveWeight(1);
  // Out of step with each other, or a square breathes in unison.
  base.time = hash(anchor.key, 'phase') * base.getClip().duration;
  base.timeScale = 0.85 + hash(anchor.key, 'rate') * 0.3;
  // The walk is driven by distance, as the hero's and the verge walkers'
  // are, so it is played held and its time is written each frame.
  const walk = person.actions.get('Walk')!;
  walk.play();
  walk.timeScale = 0;
  walk.setEffectiveWeight(0);
  const talk = person.actions.get('Talk')!;
  talk.play();
  talk.setEffectiveWeight(0);
  talk.time = hash(anchor.key, 'talk') * talk.getClip().duration;
  talk.timeScale = 0.9 + hash(anchor.key, 'talk-rate') * 0.2;
  const length = anchor.from.distanceTo(anchor.to);
  const mode: Mode = anchor.chatting
    ? 'chat'
    : length > 1 && hash(anchor.key, 'strolls') < STROLL_SHARE
      ? 'stroll'
      : 'stand';
  // The anchor's yaw, read back out of its quaternion in the town's frame.
  st.local.set(0, 0, 1).applyQuaternion(anchor.quaternion).applyQuaternion(st.inverse.copy(anchor.town).invert());
  const yaw = Math.atan2(st.local.x, st.local.z);
  st.local.copy(anchor.to).sub(anchor.from).applyQuaternion(st.inverse);
  const strollYaw = Math.atan2(st.local.x, st.local.z);
  const head = person.bones.get('Head') ?? null;
  const entry: Standing = {
    anchor,
    holder,
    person,
    mode,
    base,
    walk,
    talk,
    talking: 0,
    gesture: null,
    gestureAt: 0,
    nextGesture: clock + (mode === 'chat' ? 1 : 3) + hash(anchor.key, 'first') * (mode === 'chat' ? 5 : 14),
    owed: 0,
    lane: Math.floor(hash(anchor.key, 'lane') * 4),
    position: anchor.position.clone(),
    yaw,
    targetYaw: yaw,
    restYaw: yaw,
    along: length > 1e-6 ? THREE.MathUtils.clamp(anchor.from.distanceTo(anchor.position) / length, 0, 1) : 0,
    heading: hash(anchor.key, 'heading') < 0.5 ? 1 : -1,
    length,
    speed: WALK_SPEED * THREE.MathUtils.lerp(STROLL_PACE[0], STROLL_PACE[1], hash(anchor.key, 'pace')),
    pace: 0,
    strollYaw,
    pause: hash(anchor.key, 'pause') * STROLL_PAUSE[1],
    turnLength: THREE.MathUtils.lerp(TALK_TURN[0], TALK_TURN[1], hash(anchor.key, 'st.turn')),
    speaksAt: hash(anchor.key, 'speaks') * 2,
    phase: hash(anchor.key, 'stride'),
    walking: 0,
    head,
    headRest: head === null ? new THREE.Quaternion() : head.quaternion.clone(),
    glance: 0,
    held: false,
    turns: 0,
  };
  place(st, entry);
  return entry;
}
