import * as THREE from 'three';
import type { Emote } from '../../server/src/limits.ts';
import type { ClipName, Person } from '../cast.ts';

/**
 * Which clip each gesture plays, and whether it goes on until the body moves.
 * The sitting clip is sat on a chair (`retarget-clips.ts`), and nothing here
 * brings one.
 */
export const GESTURES: Readonly<Record<Emote, { clip: ClipName; loop: boolean }>> = {
  wave: { clip: 'Wave', loop: false },
  dance: { clip: 'Dance', loop: true },
  sit: { clip: 'Sit', loop: true },
};
/** How fast a gesture comes in and goes out, per second: a fifth of a second either way. */
export const GESTURE_RATE = 10;
/** A body moving at more than this share of `WALK_SPEED`, or leaving the ground, ends its gesture. */
export const GESTURE_MOVES = 0.15;

export interface Clips {
  idle: THREE.AnimationAction;
  shift: THREE.AnimationAction;
  walk: THREE.AnimationAction;
  run: THREE.AnimationAction;
  air: THREE.AnimationAction;
  land: THREE.AnimationAction;
  swim: THREE.AnimationAction;
  tread: THREE.AnimationAction;
}

export interface Weights {
  idle: number;
  walk: number;
  run: number;
  air: number;
  swim: number;
  tread: number;
}

export const CLIP_OF: Readonly<Record<keyof Clips, ClipName>> = {
  idle: 'Idle_Neutral',
  shift: 'Idle_Shift',
  walk: 'Walk',
  run: 'Run',
  air: 'Jump',
  land: 'Jump_Land',
  swim: 'Swim',
  tread: 'Swim_Idle',
};

/** The actions of `person` a motion plays, started at no weight; the hand-driven ones held still. */
export function clipsOf(person: Person): Clips {
  const clips = {} as Clips;
  for (const key of Object.keys(CLIP_OF) as (keyof Clips)[]) {
    const action = person.actions.get(CLIP_OF[key]);
    if (action === undefined) throw new Error(`motion: no ${CLIP_OF[key]} clip`);
    action.play();
    action.setEffectiveWeight(0);
    // A pooled person comes back with every action at a time scale of one.
    action.timeScale = 1;
    clips[key] = action;
  }
  // The walk, the run and the stroke are driven by distance, and the landing
  // by its own clock: all by hand, never by the mixer's.
  clips.walk.timeScale = 0;
  clips.run.timeScale = 0;
  clips.swim.timeScale = 0;
  clips.land.timeScale = 0;
  return clips;
}

export const bone = (person: Person, name: string): THREE.Bone | null => person.bones.get(name) ?? person.bones.get(name.replace('.', '')) ?? null;

// Scratch for the hand-written turns, so a frame allocates nothing.
export const rootTurn = new THREE.Quaternion();
export const axisWorld = new THREE.Vector3();
export const parentWorld = new THREE.Quaternion();
export const parentInverse = new THREE.Quaternion();
export const turnWorld = new THREE.Quaternion();

/**
 * Turns `bone` by `angle` about `axis`, a direction in world space, on top of
 * whatever the clips left it at: `L' = P^-1 T P L`, P its parent's world turn.
 */
export function turnBone(target: THREE.Bone, axis: THREE.Vector3, angle: number): void {
  target.parent!.getWorldQuaternion(parentWorld);
  turnWorld.setFromAxisAngle(axis, angle);
  parentInverse.copy(parentWorld).invert();
  turnWorld.premultiply(parentInverse).multiply(parentWorld);
  target.quaternion.premultiply(turnWorld);
}
