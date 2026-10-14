import * as THREE from 'three';
import type { Emote } from '../../server/src/limits.ts';
import { approach, smoothstep } from './maths.ts';
import { GESTURES, GESTURE_RATE, axisWorld, rootTurn, turnBone, type Weights } from './motion-clips.ts';
import { FALL_FLAIL, FALL_RAISE, LOOK_CHEST, RUN_PHASE } from './motion-config.ts';
import type { MotionState } from './motion-state.ts';

export function blend(s: MotionState, dt: number, rate: number, goal: Weights): void {
  const k = approach(rate, dt);
  s.weights.idle += (goal.idle - s.weights.idle) * k;
  s.weights.walk += (goal.walk - s.weights.walk) * k;
  s.weights.run += (goal.run - s.weights.run) * k;
  s.weights.air += (goal.air - s.weights.air) * k;
  s.weights.swim += (goal.swim - s.weights.swim) * k;
  s.weights.tread += (goal.tread - s.weights.tread) * k;
}

export function aim(s: MotionState, idle: number, walk: number, run: number, air: number, swim: number, tread: number): Weights {
  s.target.idle = idle;
  s.target.walk = walk;
  s.target.run = run;
  s.target.air = air;
  s.target.swim = swim;
  s.target.tread = tread;
  return s.target;
}

/** The landing's share of the pose now: in over a twentieth of a second, out as the clip stands up. */
export function landing(s: MotionState): number {
  if (s.landAt === Infinity) return 0;
  const u = s.landAt * s.landRate;
  if (u >= s.clips.land.getClip().duration) {
    s.landAt = Infinity;
    return 0;
  }
  return s.landPeak * s.landDamp * smoothstep(u, 0, 0.05) * (1 - smoothstep(u, 0.45, 0.9));
}

/** The gesture's share of the pose this frame, its clip played by hand on its own clock. */
export function gesturing(s: MotionState, dt: number): number {
  const action = s.gestureAction;
  if (action === null) return 0;
  const duration = action.getClip().duration;
  s.gestureTime += dt;
  // A one-off starts going out a fifth of a second before its end.
  if (s.gesture !== null && !s.gestureLoop && s.gestureTime >= duration - 0.2) s.gesture = null;
  s.gestureWeight += ((s.gesture !== null ? 1 : 0) - s.gestureWeight) * approach(GESTURE_RATE, dt);
  if (s.gesture === null && s.gestureWeight < 0.01) {
    dropGesture(s);
    return 0;
  }
  action.time = s.gestureLoop ? s.gestureTime % duration : Math.min(s.gestureTime, duration);
  action.setEffectiveWeight(s.gestureWeight);
  return s.gestureWeight;
}

export function dropGesture(s: MotionState): void {
  s.gestureAction?.setEffectiveWeight(0);
  s.gestureAction?.stop();
  s.gestureAction = null;
  s.gesture = null;
  s.gestureWeight = 0;
}

export function emote(s: MotionState, name: Emote | null): boolean {
  if (name === null) {
    s.gesture = null;
    return true;
  }
  const wanted = GESTURES[name];
  const action = s.person.actions.get(wanted.clip);
  if (action === undefined) return false;
  if (s.gestureAction !== action) {
    // Another gesture's clip gives way at once; the weight it had carries on.
    if (s.gestureAction !== null) {
      s.gestureAction.setEffectiveWeight(0);
      s.gestureAction.stop();
    }
    action.reset().play();
    action.timeScale = 0;
    action.setEffectiveWeight(s.gestureWeight);
    s.gestureAction = action;
  }
  s.gesture = name;
  s.gestureLoop = wanted.loop;
  s.gestureTime = 0;
  return true;
}

export function apply(s: MotionState, dt: number): void {
  if (s.landAt !== Infinity) s.landAt += dt;
  const landed = landing(s);
  const gestured = gesturing(s, dt);
  const keep = (1 - landed) * (1 - gestured);
  s.clips.idle.setEffectiveWeight(s.weights.idle * (1 - s.shift) * keep);
  s.clips.shift.setEffectiveWeight(s.weights.idle * s.shift * keep);
  s.clips.walk.setEffectiveWeight(s.weights.walk * keep);
  s.clips.run.setEffectiveWeight(s.weights.run * keep);
  s.clips.air.setEffectiveWeight(s.weights.air * keep);
  s.clips.swim.setEffectiveWeight(s.weights.swim * (1 - gestured));
  s.clips.tread.setEffectiveWeight(s.weights.tread * (1 - gestured));
  s.clips.land.setEffectiveWeight(landed);
  if (landed > 0) s.clips.land.time = s.landAt * s.landRate;
  s.clips.walk.time = s.phase * s.clips.walk.getClip().duration;
  s.clips.run.time = ((s.phase + RUN_PHASE) % 1) * s.clips.run.getClip().duration;
  s.clips.swim.time = s.stroke * s.clips.swim.getClip().duration;
  unlay(s);
  s.person.mixer.update(dt);
  lay(s);
}

/**
 * What no clip does: the look, and the arms of a fall, turned about the body's
 * own axes.
 *
 * Each turned bone is put back before the mixer runs (`unlay`): the mixer
 * writes a bone only when its blended value changed, so a bone its clips hold
 * still keeps whatever was done to it by hand, and a turn laid on it every
 * frame would wind it round and round.
 */
export function lay(s: MotionState): void {
  const looking = Math.abs(s.look) > 1e-3;
  const falling = s.fall > 1e-3;
  if (!looking && !falling) return;
  s.person.root.getWorldQuaternion(rootTurn);
  if (looking) {
    axisWorld.set(0, 1, 0).applyQuaternion(rootTurn);
    if (s.chest !== null) turnLaid(s, 0, s.chest, s.look * LOOK_CHEST);
    if (s.head !== null) turnLaid(s, 1, s.head, s.look * (1 - LOOK_CHEST));
  }
  if (falling) {
    // About the body's forward axis: +X is its left, so a left arm hanging
    // down swings out and up under a positive turn and a right arm under a
    // negative one.
    axisWorld.set(0, 0, 1).applyQuaternion(rootTurn);
    const wave = Math.sin(s.flail * Math.PI * 2) * FALL_FLAIL;
    if (s.arms[0] !== null) turnLaid(s, 2, s.arms[0], s.fall * (FALL_RAISE + wave));
    if (s.arms[1] !== null) turnLaid(s, 3, s.arms[1], -s.fall * (FALL_RAISE - wave));
  }
}

export function turnLaid(s: MotionState, slot: number, joint: THREE.Bone, angle: number): void {
  if (s.laid[slot] === null) {
    s.laid[slot] = joint;
    s.before[slot]!.copy(joint.quaternion);
  }
  turnBone(joint, axisWorld, angle);
}

export function unlay(s: MotionState): void {
  for (let i = 0; i < s.laid.length; i++) {
    s.laid[i]?.quaternion.copy(s.before[i]!);
    s.laid[i] = null;
  }
}
