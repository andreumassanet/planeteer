import * as THREE from 'three';
import type { Person } from './types.ts';

/** A person's limbs, as a hand-written pose needs them. */
export interface Limbs {
  hips: THREE.Bone;
  /** The first bone of the spine over the hips, which a rider leans forward on; null on a rig without one. */
  spine: THREE.Bone | null;
  legs: { upper: THREE.Bone; lower: THREE.Bone; foot: THREE.Bone; ankle: THREE.Vector3 }[];
  arms: { upper: THREE.Bone; lower: THREE.Bone; wrist: THREE.Bone }[];
}

/**
 * Finds the bones a seated pose moves and measures each ankle in its shin's own
 * frame, in the bind pose. Three drops the dot from a glTF bone's name, so both
 * spellings are tried.
 */
export function limbsOf(person: Person): Limbs {
  const bone = (name: string): THREE.Bone => {
    const found = person.bones.get(name) ?? person.bones.get(name.replace('.', ''));
    if (found === undefined) throw new Error(`cast: the rig has no ${name}`);
    return found;
  };
  person.mesh.skeleton.pose();
  person.root.updateMatrixWorld(true);
  const legs = (['L', 'R'] as const).map((side) => {
    const upper = bone(`UpperLeg.${side}`);
    const lower = bone(`LowerLeg.${side}`);
    const foot = bone(`Foot.${side}`);
    const ankle = lower.worldToLocal(foot.getWorldPosition(new THREE.Vector3()));
    return { upper, lower, foot, ankle };
  });
  const arms = (['L', 'R'] as const).map((side) => ({
    upper: bone(`UpperArm.${side}`),
    lower: bone(`LowerArm.${side}`),
    wrist: bone(`Wrist.${side}`),
  }));
  const spine = person.bones.get('Abdomen') ?? null;
  return { hips: bone('Hips'), spine, legs, arms };
}

/**
 * Where the clips left every bone a hand-written pose moves (the spine a
 * rider leans on, the arms, the legs and the feet), kept by `on` just before
 * the pose is written and put back by `off` before the clips run again.
 *
 * A hand pose not taken off stays on: the mixer writes a bone only when the
 * value its clips blend to has changed, and the relaxed idle holds the spine
 * and much of the arms still. `off` does nothing unless `on` came first.
 */
export interface HandHold {
  on(): void;
  off(): void;
}

export function handHold(limbs: Limbs): HandHold {
  const bones: THREE.Bone[] = limbs.spine === null ? [] : [limbs.spine];
  for (const arm of limbs.arms) bones.push(arm.upper, arm.lower, arm.wrist);
  for (const leg of limbs.legs) bones.push(leg.upper, leg.lower, leg.foot);
  const turns = bones.map(() => new THREE.Quaternion());
  const places = bones.map(() => new THREE.Vector3());
  let held = false;
  return {
    on() {
      bones.forEach((bone, i) => {
        turns[i]!.copy(bone.quaternion);
        places[i]!.copy(bone.position);
      });
      held = true;
    },
    off() {
      if (!held) return;
      bones.forEach((bone, i) => {
        bone.quaternion.copy(turns[i]!);
        bone.position.copy(places[i]!);
      });
      held = false;
    },
  };
}

export const aimFrom = new THREE.Vector3();
export const aimAlong = new THREE.Vector3();
export const aimTo = new THREE.Vector3();
export const aimTurn = new THREE.Quaternion();
export const aimOwn = new THREE.Quaternion();
export const aimParent = new THREE.Quaternion();

/** Swings `bone` so that the world point `tip` comes to lie along `direction`, given in `frame`. */
export function aimBone(bone: THREE.Bone, tip: THREE.Vector3, direction: THREE.Vector3, frame: THREE.Object3D): void {
  bone.getWorldPosition(aimFrom);
  aimAlong.copy(tip).sub(aimFrom).normalize();
  aimTo.copy(direction).transformDirection(frame.matrixWorld);
  aimTurn.setFromUnitVectors(aimAlong, aimTo);
  bone.getWorldQuaternion(aimOwn);
  bone.parent!.getWorldQuaternion(aimParent);
  bone.quaternion.copy(aimParent.invert().multiply(aimTurn.multiply(aimOwn)));
  bone.updateMatrixWorld(true);
}

export const foldTip = new THREE.Vector3();

/**
 * Folds both legs: thighs along `thigh`, shins along `shin`, both in `frame`.
 * The rig's feet are IK controls hanging off its root, not children of the
 * shins, so each foot bone is carried to its folded ankle or the shoe stays
 * standing on the floor.
 */
export function foldLegs(limbs: Limbs, frame: THREE.Object3D, thigh: THREE.Vector3, shin: THREE.Vector3): void {
  frame.updateMatrixWorld(true);
  for (const leg of limbs.legs) {
    aimBone(leg.upper, leg.lower.getWorldPosition(foldTip), thigh, frame);
    aimBone(leg.lower, leg.lower.localToWorld(foldTip.copy(leg.ankle)), shin, frame);
    leg.lower.localToWorld(foldTip.copy(leg.ankle));
    leg.foot.position.copy(leg.foot.parent!.worldToLocal(foldTip));
    leg.foot.updateMatrixWorld(true);
  }
}

export const armTarget = new THREE.Vector3();
export const armShoulder = new THREE.Vector3();
export const armMiddle = new THREE.Vector3();
export const armHand = new THREE.Vector3();
export const armFrom = new THREE.Vector3();
export const armDirection = new THREE.Vector3();
export const armTip = new THREE.Vector3();

/**
 * Points both arms at `grip`, a point in `frame`: the upper arm and the
 * forearm along the same line. Allocates nothing, so a rider's hands can be
 * put on the bars every frame.
 */
export function reachArms(limbs: Limbs, frame: THREE.Object3D, grip: THREE.Vector3): void {
  frame.updateMatrixWorld(true);
  frame.localToWorld(armTarget.copy(grip));
  limbs.arms[0]!.upper.getWorldPosition(armMiddle).add(limbs.arms[1]!.upper.getWorldPosition(armHand)).multiplyScalar(0.5);
  for (const arm of limbs.arms) {
    // Each hand a shoulder's width out from the middle of the grip.
    arm.upper.getWorldPosition(armShoulder);
    armHand.copy(armShoulder).sub(armMiddle).multiplyScalar(0.8).add(armTarget);
    frame.worldToLocal(armDirection.copy(armHand));
    frame.worldToLocal(armFrom.copy(armShoulder));
    armDirection.sub(armFrom).normalize();
    aimBone(arm.upper, arm.lower.getWorldPosition(armTip), armDirection, frame);
    aimBone(arm.lower, arm.wrist.getWorldPosition(armTip), armDirection, frame);
  }
}

/**
 * One arm along two directions in `frame`: the upper arm along `upper`, the
 * forearm along `lower`. Allocates nothing.
 */
export function aimArm(arm: Limbs['arms'][number], frame: THREE.Object3D, upper: THREE.Vector3, lower: THREE.Vector3): void {
  aimBone(arm.upper, arm.lower.getWorldPosition(armTip), upper, frame);
  aimBone(arm.lower, arm.wrist.getWorldPosition(armTip), lower, frame);
}

/**
 * One leg along two directions in `frame`, the thigh along `thigh` and the
 * shin along `shin`, and its foot — an IK control under the root — carried to
 * the shin's end, as `foldLegs` carries both. Allocates nothing.
 */
export function aimLeg(leg: Limbs['legs'][number], frame: THREE.Object3D, thigh: THREE.Vector3, shin: THREE.Vector3): void {
  aimBone(leg.upper, leg.lower.getWorldPosition(foldTip), thigh, frame);
  aimBone(leg.lower, leg.lower.localToWorld(foldTip.copy(leg.ankle)), shin, frame);
  leg.lower.localToWorld(foldTip.copy(leg.ankle));
  leg.foot.position.copy(leg.foot.parent!.worldToLocal(foldTip));
  leg.foot.updateMatrixWorld(true);
}

export const twoAlong = new THREE.Vector3();
export const twoPole = new THREE.Vector3();
export const twoEnd = new THREE.Vector3();

/**
 * The two-bone solve, as directions: a limb from `root`, `first` and `second`
 * long, reaching for `target`, its middle joint bent towards `pole`. Writes
 * the first bone's direction into `upper` and the second's into `lower`; a
 * target out of reach is reached for with the limb straight. Every point and
 * direction in one frame. Allocates nothing.
 */
export function twoBone(
  root: THREE.Vector3,
  first: number,
  second: number,
  target: THREE.Vector3,
  pole: THREE.Vector3,
  upper: THREE.Vector3,
  lower: THREE.Vector3,
): void {
  twoAlong.copy(target).sub(root);
  const reach = Math.min(first + second - 1e-4, Math.max(Math.abs(first - second) + 1e-4, twoAlong.length()));
  twoAlong.normalize();
  twoPole.copy(pole).addScaledVector(twoAlong, -pole.dot(twoAlong));
  if (twoPole.lengthSq() < 1e-8) twoPole.set(0, 0, 1);
  twoPole.normalize();
  const cosine = Math.min(1, Math.max(-1, (first * first + reach * reach - second * second) / (2 * first * reach)));
  upper.copy(twoAlong).multiplyScalar(cosine).addScaledVector(twoPole, Math.sqrt(1 - cosine * cosine));
  twoEnd.copy(root).addScaledVector(twoAlong, reach);
  lower.copy(twoEnd).sub(root).addScaledVector(upper, -first).normalize();
}
