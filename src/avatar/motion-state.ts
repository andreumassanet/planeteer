import * as THREE from 'three';
import type { Emote } from '../../server/src/limits.ts';
import type { Person } from '../cast.ts';
import { bone, clipsOf, type Clips, type Weights } from './motion-clips.ts';

/** Everything one body's motion remembers between frames. */
export interface MotionState {
  person: Person;
  clips: Clips;
  readonly weights: Weights;
  head: THREE.Bone | null;
  chest: THREE.Bone | null;
  arms: readonly [THREE.Bone | null, THREE.Bone | null];
  /** Stride cycles completed, 0..1. */
  phase: number;
  /** Stroke cycles completed, afloat. */
  stroke: number;
  /** The share of the standing pose that is the second idle. */
  shift: number;
  airTime: number;
  stillTime: number;
  fall: number;
  flail: number;
  /** Seconds since touching down; Infinity when no landing is playing. */
  landAt: number;
  landPeak: number;
  landRate: number;
  /** How far the landing gives way for a body moving off, 1 standing. */
  landDamp: number;
  look: number;
  pitch: number;
  lastSpeed: number;
  accel: number;
  /** The gesture asked for, its action on this person, how far in and how much of the pose it is. */
  gesture: Emote | null;
  gestureAction: THREE.AnimationAction | null;
  gestureLoop: boolean;
  gestureTime: number;
  gestureWeight: number;
  /** Scratch weights `aim` fills. */
  readonly target: Weights;
  /** The bones `lay` turned this frame and what the clips had left them at. */
  readonly laid: (THREE.Bone | null)[];
  readonly before: THREE.Quaternion[];
}

export function createState(first: Person): MotionState {
  return {
    person: first,
    clips: clipsOf(first),
    weights: { idle: 1, walk: 0, run: 0, air: 0, swim: 0, tread: 0 },
    head: bone(first, 'Head'),
    chest: bone(first, 'Chest'),
    arms: [bone(first, 'UpperArm.L'), bone(first, 'UpperArm.R')] as const,
    phase: 0,
    stroke: 0,
    shift: 0,
    airTime: 0,
    stillTime: 0,
    fall: 0,
    flail: 0,
    landAt: Infinity,
    landPeak: 0,
    landRate: 1,
    landDamp: 1,
    look: 0,
    pitch: 0,
    lastSpeed: 0,
    accel: 0,
    gesture: null,
    gestureAction: null,
    gestureLoop: false,
    gestureTime: 0,
    gestureWeight: 0,
    target: { idle: 0, walk: 0, run: 0, air: 0, swim: 0, tread: 0 },
    laid: [null, null, null, null],
    before: [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()],
  };
}
