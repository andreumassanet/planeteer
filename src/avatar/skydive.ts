import * as THREE from 'three';
import { aimArm, aimLeg, twoBone } from '../cast.ts';
import type { Avatar } from './avatar-type.ts';
import type { BodyKit } from './body-kit.ts';
import { DANGLE, DANGLE_RATE, FALL_ARM, FALL_FOREARM, FALL_SHIN, FALL_THIGH, FLUTTER, FLUTTER_RATE, FREEFALL_BANK, FREEFALL_PITCH, HANG_SHIN, HANG_THIGH } from './motion-config.ts';

/** The skydiver's fall and the hang under a canopy, over the idle clip. */
export function createSkydive(kit: BodyKit): Avatar['skydive'] {
  const { group, body, motion, handsOn, handsOff } = kit;
  const hipAt = new THREE.Vector3();
  const to = new THREE.Vector3();
  const skyTurn = new THREE.Vector3();
  const skyUpper = new THREE.Vector3();
  const skyLower = new THREE.Vector3();
  const skyHang = new THREE.Vector3();
  const skyHangLower = new THREE.Vector3();
  const skyRoot = new THREE.Vector3();
  const skyMiddle = new THREE.Vector3();
  const skyEnd = new THREE.Vector3();
  const skyTarget = new THREE.Vector3();
  const skyPole = new THREE.Vector3();
  /** The wind on a falling limb: both its directions shaken a little, each limb on its own phase. */
  function flutter(limb: number, fall: number): void {
    if (fall < 1e-3) return;
    const t = skyClock * FLUTTER_RATE * Math.PI * 2 + limb * 1.7;
    const shake = FLUTTER * fall;
    skyUpper.x += Math.sin(t) * shake;
    skyUpper.z += Math.sin(t * 1.37 + 0.5) * shake;
    skyUpper.normalize();
    skyLower.x += Math.sin(t * 1.21 + 1.1) * shake * 1.6;
    skyLower.y += Math.sin(t * 0.83 + 2.3) * shake * 1.6;
    skyLower.normalize();
  }

  /** The two directions of a limb, blended from the fall's to the canopy's by `open`. */
  function blendLimb(
    side: number,
    fall: readonly [number, number, number],
    fallLower: readonly [number, number, number],
    hang: THREE.Vector3,
    hangLower: THREE.Vector3,
    open: number,
  ): void {
    skyUpper.set(side * fall[0], fall[1], fall[2]).normalize().lerp(hang, open).normalize();
    skyLower.set(side * fallLower[0], fallLower[1], fallLower[2]).normalize().lerp(hangLower, open).normalize();
  }

  /**
   * Out of an aircraft. Falling is the skydiver's box: face down and pitched
   * `FREEFALL_PITCH` about the hips, back arched, upper arms out to the sides,
   * forearms bent up past the head, knees bent, banked into a turn. Under the
   * canopy the body hangs upright with each hand on its toggle (`grip`), the
   * elbow placed by the two-bone solve and the legs together. The idle clip is
   * under both, for the spine and head; `open` blends one into the other.
   */
  let skyClock = 0;
  function skydive(
    dt: number,
    open: number,
    turn: number,
    grip: readonly [number, number, number],
    pull = 0,
    lag: readonly [number, number] = [0, 0],
  ): void {
    handsOff();
    skyClock += dt;
    body.position.set(0, 0, 0);
    body.rotation.set(0, 0, 0);
    motion.still(dt, 4);
    handsOn();
    group.updateMatrixWorld(true);
    hipAt.copy(group.worldToLocal(kit.rig().limbs.hips.getWorldPosition(to)));
    // Pitched about the hips: the body's own +Y, its length, comes forward.
    const fall = 1 - open;
    body.rotation.set(FREEFALL_PITCH * fall, -turn * FREEFALL_BANK * fall, 0);
    skyTurn.copy(hipAt).applyEuler(body.rotation);
    body.position.copy(hipAt).sub(skyTurn);
    body.updateMatrixWorld(true);
    const limbs = kit.rig().limbs;
    limbs.arms.forEach((arm, i) => {
      const side = i === 0 ? 1 : -1;
      // The hand to its toggle, in the body's frame.
      body.worldToLocal(arm.upper.getWorldPosition(skyRoot));
      body.worldToLocal(arm.lower.getWorldPosition(skyMiddle));
      body.worldToLocal(arm.wrist.getWorldPosition(skyEnd));
      // A turn to the right (+) pulls the right toggle (side -1) down, a left the left.
      const pulled = Math.max(0, side < 0 ? turn : -turn) * pull;
      body.worldToLocal(group.localToWorld(skyTarget.set(side * grip[0], grip[1] - pulled, grip[2] + pulled * 0.25)));
      skyPole.set(side, -0.35, -0.3);
      twoBone(skyRoot, skyRoot.distanceTo(skyMiddle), skyMiddle.distanceTo(skyEnd), skyTarget, skyPole, skyHang, skyHangLower);
      blendLimb(side, FALL_ARM, FALL_FOREARM, skyHang, skyHangLower, open);
      flutter(i * 2, 1 - open);
      aimArm(arm, body, skyUpper, skyLower);
    });
    const beat = skyClock * DANGLE_RATE * Math.PI * 2;
    limbs.legs.forEach((leg, i) => {
      const side = i === 0 ? 1 : -1;
      // Each leg on its own beat, the shin behind the thigh, and both trailing the swing.
      const own = beat + i * 2.1;
      skyHang
        .set(side * HANG_THIGH[0] + lag[0] * 0.6 + Math.sin(own * 0.7) * DANGLE * 0.4, HANG_THIGH[1], HANG_THIGH[2] + lag[1] * 0.6 + Math.sin(own) * DANGLE)
        .normalize();
      skyHangLower
        .set(side * HANG_SHIN[0] + lag[0] + Math.sin(own * 0.7 - 0.8) * DANGLE * 0.5, HANG_SHIN[1], HANG_SHIN[2] + lag[1] + Math.sin(own - 0.9) * DANGLE * 1.4)
        .normalize();
      blendLimb(side, FALL_THIGH, FALL_SHIN, skyHang, skyHangLower, open);
      flutter(i * 2 + 5, 1 - open);
      aimLeg(leg, body, skyUpper, skyLower);
    });
  }

  return skydive;
}
