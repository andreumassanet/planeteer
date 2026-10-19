import * as THREE from 'three';
import { closeHand } from './grip.ts';
import { aimBone, foldTip, reachArms, type Limbs } from './limbs.ts';

/** What a body astride is put to: `Seat`'s grip, footrests and crank (`craft/contract.ts`). */
export interface AstrideSeat {
  grip?: readonly [number, number, number];
  feet?: readonly [number, number, number];
  crank?: number;
}

export const legHip = new THREE.Vector3();
export const legKnee = new THREE.Vector3();
export const legAnkle = new THREE.Vector3();
export const legTarget = new THREE.Vector3();
export const legAlong = new THREE.Vector3();
export const legPole = new THREE.Vector3();
export const legThigh = new THREE.Vector3();
export const legShin = new THREE.Vector3();
export const gripAt = new THREE.Vector3();
/** Which way a knee bends, in the frame: forward, and up a little. */
export const KNEE_POLE = new THREE.Vector3(0, 0.35, 1).normalize();
/**
 * The furthest a rider leans forward from the hips to reach a grip, radians,
 * and the step the lean is found in. The lean is a turn laid on the spine, so
 * it is found from the clips' own spine every frame: the caller puts the bone
 * back before the clips run (`handsOff` in `avatar.ts`), or a grip out of
 * reach winds the body down over the bars a step a frame.
 */
export const RIDE_LEAN = 0.7;
export const LEAN_STEP = 0.05;
export const leanFrom = new THREE.Vector3();
export const leanTo = new THREE.Vector3();
export const leanAxis = new THREE.Vector3();
export const leanTurn = new THREE.Quaternion();
export const leanParent = new THREE.Quaternion();
export const leanInverse = new THREE.Quaternion();

/**
 * A body astride: each leg from its hip to its footrest, the knee bent forward
 * over it, and both hands to the grip.
 *
 * `hip` is where the `Hips` bone is in `frame`, and the seat's grip and feet
 * are about it (`Seat` in `craft/contract.ts`): the left foot's rest, and the
 * right the same mirrored; +X is the body's left. A seat with a `crank` has
 * its feet on the pedals instead, the crank's axle at `feet` and the left
 * pedal `phase` radians round from the bottom — the pedal's own
 * `(-cos, -sin)` in (y, z), which is how `craft/cycles.ts` turns the crank —
 * and the right one half a turn on.
 *
 * Each leg is the two-bone solve: the hip and the target fix the plane with
 * the knee's pole, the thigh and the shin keep their lengths, and a target out
 * of reach is reached for with the leg straight. The feet are carried to the
 * shins' ends as `foldLegs` carries them. Allocates nothing.
 */
export function poseAstride(limbs: Limbs, frame: THREE.Object3D, hip: THREE.Vector3, seat: AstrideSeat, phase: number): void {
  frame.updateMatrixWorld(true);
  const feet = seat.feet;
  if (feet !== undefined) {
    limbs.legs.forEach((leg, i) => {
      const side = i === 0 ? 1 : -1;
      legTarget.set(hip.x + side * feet[0], hip.y + feet[1], hip.z + feet[2]);
      if (seat.crank !== undefined) {
        const turn = phase + (side < 0 ? Math.PI : 0);
        legTarget.y -= seat.crank * Math.cos(turn);
        legTarget.z -= seat.crank * Math.sin(turn);
      }
      // Everything in the frame: the joints where they are now, the lengths as built.
      frame.worldToLocal(leg.upper.getWorldPosition(legHip));
      frame.worldToLocal(leg.lower.getWorldPosition(legKnee));
      frame.worldToLocal(leg.lower.localToWorld(legAnkle.copy(leg.ankle)));
      const thigh = legHip.distanceTo(legKnee);
      const shin = legKnee.distanceTo(legAnkle);
      legAlong.copy(legTarget).sub(legHip);
      const reach = Math.min(thigh + shin - 1e-4, Math.max(Math.abs(thigh - shin) + 1e-4, legAlong.length()));
      legAlong.normalize();
      legPole.copy(KNEE_POLE).addScaledVector(legAlong, -KNEE_POLE.dot(legAlong));
      if (legPole.lengthSq() < 1e-8) legPole.set(0, 0, 1);
      legPole.normalize();
      const cosine = Math.min(1, Math.max(-1, (thigh * thigh + reach * reach - shin * shin) / (2 * thigh * reach)));
      const sine = Math.sqrt(1 - cosine * cosine);
      legThigh.copy(legAlong).multiplyScalar(cosine).addScaledVector(legPole, sine);
      // The knee, and the shin from it to the target, both as directions.
      legShin.copy(legHip).addScaledVector(legThigh, thigh);
      legShin.subVectors(legHip.addScaledVector(legAlong, reach), legShin).normalize();
      aimBone(leg.upper, leg.lower.getWorldPosition(foldTip), legThigh, frame);
      aimBone(leg.lower, leg.lower.localToWorld(foldTip.copy(leg.ankle)), legShin, frame);
      leg.lower.localToWorld(foldTip.copy(leg.ankle));
      leg.foot.position.copy(leg.foot.parent!.worldToLocal(foldTip));
      leg.foot.updateMatrixWorld(true);
    });
  }
  if (seat.grip === undefined) return;
  gripAt.set(hip.x + seat.grip[0], hip.y + seat.grip[1], hip.z + seat.grip[2]);
  // Leaning forward from the waist until the shoulders are an arm, less a
  // twentieth, from the grip — no further than `RIDE_LEAN`.
  const spine = limbs.spine;
  if (spine !== null) {
    frame.worldToLocal(spine.getWorldPosition(leanFrom));
    const [left, right] = limbs.arms as [Limbs['arms'][number], Limbs['arms'][number]];
    frame.worldToLocal(left.upper.getWorldPosition(legHip));
    frame.worldToLocal(right.upper.getWorldPosition(legKnee));
    legHip.add(legKnee).multiplyScalar(0.5).sub(leanFrom);
    frame.worldToLocal(left.lower.getWorldPosition(legKnee));
    frame.worldToLocal(left.wrist.getWorldPosition(legAnkle));
    frame.worldToLocal(left.upper.getWorldPosition(legTarget));
    const arm = (legTarget.distanceTo(legKnee) + legKnee.distanceTo(legAnkle)) * 0.95;
    let lean = 0;
    for (; lean < RIDE_LEAN; lean += LEAN_STEP) {
      const c = Math.cos(lean);
      const n = Math.sin(lean);
      leanTo.set(leanFrom.x + legHip.x, leanFrom.y + legHip.y * c - legHip.z * n, leanFrom.z + legHip.y * n + legHip.z * c);
      if (leanTo.distanceTo(gripAt) <= arm) break;
    }
    if (lean > 0) {
      // About the frame's own +X, which takes its +Y towards +Z: forward.
      leanAxis.set(1, 0, 0).transformDirection(frame.matrixWorld);
      spine.parent!.getWorldQuaternion(leanParent);
      leanTurn.setFromAxisAngle(leanAxis, Math.min(lean, RIDE_LEAN));
      leanTurn.premultiply(leanInverse.copy(leanParent).invert()).multiply(leanParent);
      spine.quaternion.premultiply(leanTurn);
      spine.updateMatrixWorld(true);
    }
  }
  reachArms(limbs, frame, gripAt);
  // The fingers round the bars or the reins.
  for (const hand of limbs.hands) closeHand(hand);
}
