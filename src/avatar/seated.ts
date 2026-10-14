import * as THREE from 'three';
import { foldLegs, holdWheel, poseAstride, type AstrideSeat, type SeatedPose } from '../cast.ts';
import type { Avatar } from './avatar-type.ts';
import type { BodyKit } from './body-kit.ts';
import { FIGURE } from './figure.ts';
import { DRIVE_SHIN, DRIVE_THIGH, SEAT_SHIN, SEAT_THIGH } from './seat-folds.ts';

/** Seated and astride poses: the idle clip above the waist, the legs folded or on the pedals by hand. */
export function createSeated(kit: BodyKit): { sit: Avatar['sit']; ride: Avatar['ride'] } {
  const { group, body, motion, handsOn, handsOff, foldHead } = kit;
  const hipAt = new THREE.Vector3();
  const to = new THREE.Vector3();

  /**
   * Seated: the idle clip for everything above the waist, and the legs folded
   * by hand (`foldLegs` in `cast.ts`, which carries each foot, an IK control
   * under the root, to its folded ankle), because the pack has no sitting clip.
   */
  function sit(dt: number, seat?: SeatedPose, turn = 0): void {
    handsOff();
    body.position.set(0, 0, 0);
    body.rotation.set(0, 0, 0);
    motion.still(dt, 4);
    handsOn();
    const driving = seat?.legs === 'drive';
    foldLegs(kit.rig().limbs, group, driving ? DRIVE_THIGH : SEAT_THIGH, driving ? DRIVE_SHIN : SEAT_SHIN);
    // Put this character's own hips where `FIGURE` says a seated hip is.
    hipAt.copy(group.worldToLocal(kit.rig().limbs.hips.getWorldPosition(to)));
    body.position.x -= hipAt.x;
    body.position.y += FIGURE.hipY - hipAt.y;
    body.position.z -= hipAt.z;
    // The hands on the wheel, once the hips are where they sit: the
    // shoulders the arms are solved from move with them.
    if (seat?.wheel !== undefined) holdWheel(kit.rig().limbs, group, hipAt.set(0, FIGURE.hipY, 0), seat.wheel, turn);
    foldHead();
  }

  function ride(dt: number, seat: AstrideSeat, phase: number): void {
    handsOff();
    body.position.set(0, 0, 0);
    body.rotation.set(0, 0, 0);
    motion.still(dt, 4);
    handsOn();
    group.updateMatrixWorld(true);
    hipAt.copy(group.worldToLocal(kit.rig().limbs.hips.getWorldPosition(to)));
    poseAstride(kit.rig().limbs, group, hipAt, seat, phase);
    // The hips where `FIGURE` says a seated hip is, as `sit` puts them.
    hipAt.copy(group.worldToLocal(kit.rig().limbs.hips.getWorldPosition(to)));
    body.position.x -= hipAt.x;
    body.position.y += FIGURE.hipY - hipAt.y;
    body.position.z -= hipAt.z;
    foldHead();
  }

  return { sit, ride };
}
