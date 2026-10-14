import type { Alien } from '../contract.ts';
import type { ArmRig, AlienRig, LegRig } from './types.ts';

/**
 * Four still poses, in swings and bends (see *The angles* above): a hip swung
 * forward is positive, a knee or an elbow bent is positive, an arm swung
 * forward is positive, a lean forward is positive.
 *
 * Both entries of a pair are the two sides, and they must not be equal in a
 * walk — an ipsilateral gait is the one thing a walk cannot get wrong, and
 * `POSES.walk` on Earth shipped that way for months. A second pair of legs
 * takes the *other* side's angles, which is a trot's diagonal and the only
 * four-legged stance that stands.
 */
export interface PoseAngles {
  hip: readonly [number, number];
  knee: readonly [number, number];
  /** Per arm pair: swing at the shoulder. */
  arm: readonly [number, number];
  elbow: readonly [number, number];
  /** Outward splay of every arm. Never under about 0.2 — see the note above. */
  splay: number;
  lean: number;
  /** How far apart the feet stand, as a multiple of `legX`. */
  stance: number;
}

export const ALIEN_POSES: Record<Alien['pose'], PoseAngles> = {
  stand: { hip: [0.04, -0.04], knee: [0.06, 0.06], arm: [0.05, -0.05], elbow: [0.16, 0.2], splay: 0.24, lean: 0.02, stance: 1 },
  // Contralateral, and stated as such: the arm on a side opposes the leg on
  // that side. First hip forward, first arm back.
  walk: { hip: [0.34, -0.26], knee: [0.05, 0.40], arm: [-0.30, 0.28], elbow: [0.22, 0.30], splay: 0.26, lean: 0.06, stance: 0.9 },
  work: { hip: [0.1, -0.12], knee: [0.24, 0.20], arm: [0.62, 0.54], elbow: [0.85, 0.9], splay: 0.34, lean: 0.28, stance: 1.25 },
  watch: { hip: [-0.05, 0.05], knee: [0.05, 0.08], arm: [0.16, -0.42], elbow: [0.3, 1.1], splay: 0.3, lean: -0.05, stance: 1.05 },
};


/**
 * Turns the joints to a still pose. `sway` nudges every swing and `stoop`
 * leans the trunk on top of the pose's own lean.
 */
export function poseAlien(rig: AlienRig, pose: PoseAngles, sway = 0, stoop = 0): void {
  for (const leg of rig.legs) {
    // A second pair takes the other side's angles: the trot's diagonal.
    const k = (leg.side + leg.pair) % 2;
    const swing = pose.hip[k]! + sway * 0.09;
    // Forward of vertical, the knee may only straighten.
    const bend = swing >= 0 ? pose.knee[k]! * 0.35 : pose.knee[k]!;
    setLeg(leg, swing, bend);
    leg.hip.position.x = leg.x * pose.stance;
  }
  for (const arm of rig.arms) {
    const swing = pose.arm[arm.side]! + sway * (arm.pair === 0 ? 0.12 : -0.1);
    setArm(arm, swing, pose.elbow[arm.side]!, pose.splay);
  }
  rig.upper.rotation.set(pose.lean + stoop, 0, 0);
  rig.head.rotation.set(-(pose.lean + stoop) * 0.5, 0, 0);
}

/** A leg's swing (forward positive) and knee bend (positive), the foot kept level. */
export function setLeg(leg: LegRig, swing: number, bend: number): void {
  leg.hip.rotation.set(-swing, 0, 0);
  leg.knee.rotation.set(bend, 0, 0);
  leg.ankle.rotation.set(swing - bend, 0, 0);
}

/** An arm's swing (forward positive), elbow bend (positive) and outward splay. */
export function setArm(arm: ArmRig, swing: number, bend: number, splay: number): void {
  arm.shoulder.rotation.set(-swing, 0, arm.sign * splay);
  arm.elbow.rotation.set(-bend, 0, 0);
}
