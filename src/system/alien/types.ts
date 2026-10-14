import type { Bone, Group } from 'three';

export interface LegRig {
  hip: Bone;
  knee: Bone;
  ankle: Bone;
  pair: number;
  /** 0 or 1; `sign` is which way along X it stands. */
  side: number;
  sign: number;
  /** How far the sole is under the ankle joint, units: the foot is kept level. */
  sole: number;
  /** Where the hip stands across, before the stance spreads it. */
  x: number;
}

export interface ArmRig {
  shoulder: Bone;
  elbow: Bone;
  pair: number;
  side: number;
  sign: number;
  /** From the elbow to the middle of the hand, units. */
  reach: number;
}

/**
 * A built body and its joints. Every `Bone` is in `bones`, in the order a
 * traversal of `root` meets them, which is the order a skeleton is made in
 * and a clone of the root is walked in.
 */
export interface AlienRig {
  group: Group;
  root: Bone;
  bones: Bone[];
  legs: LegRig[];
  arms: ArmRig[];
  upper: Bone;
  head: Bone;
  /** The tail's joints from the base out, or empty. */
  tail: Bone[];
  /** A carried staff stands on its own joint under the root, or there is none. */
  staff: Bone | null;
  /** Lengths the animation reads. */
  height: number;
  hip: number;
  /** A comfortable step, heel to heel, units. */
  stride: number;
  /** How far a floater hangs over the ground, units; 0 for a walker. */
  hover: number;
}
