/**
 * A near peer's body: dressed as they chose to look, played by the hero's own motion, and held in its seat.
 */
import * as THREE from 'three';
import { decodeAppearance } from '../appearance.ts';
import { AVATAR_HEIGHT, DRIVE_SHIN, DRIVE_THIGH, SEAT_SHIN, SEAT_THIGH, createMotion } from '../avatar.ts';
import { foldLegs, handHold, holdWheel, limbsOf, poseAstride } from '../cast.ts';
import type { Body, Peer, SeatFrameData } from './types.ts';
import type { PeersCore } from './core.ts';

export function createBodies(core: PeersCore) {
  const { cross, folk, forward, group, hipAt, local, looks, scale, up } = core;
  const s = core.fields;

  /**
   * The cast body for a peer, made the first time they are near: at the hero's own
   * height, so a peer walks with the hero's stride and wears its name at the hero's
   * head; as they chose to look, or, with no look this build can read, as the crowd.
   */
  function dressed(peer: Peer): Body | null {
    if (peer.body !== null) return peer.body;
    // At the hero's own height, never a child's or a random adult's: a peer
    // walks with the hero's stride and wears its name at the hero's head.
    // As they chose to look, or, with no look or one this build cannot read,
    // as the crowd.
    const appearance = decodeAppearance(looks.get(peer.id));
    const person =
      appearance !== null
        ? folk.wear(appearance, AVATAR_HEIGHT)
        : folk.dress(`peer:${peer.id}`, 'atlantic-europe', undefined, AVATAR_HEIGHT);
    if (person === null) return null;
    // Read in the rest pose, before any clip has moved a bone.
    const limbs = limbsOf(person);
    person.root.traverse((object) => {
      if ((object as THREE.Mesh).isMesh) object.castShadow = true;
    });
    peer.holder.add(person.root);
    peer.body = { person, motion: createMotion(person), limbs, hold: handHold(limbs), facing: new THREE.Vector3(), airborne: false, under: 0 };
    return peer.body;
  }

  /**
   * On foot, played exactly as the hero is: the walk and the run blended by speed,
   * the turn on the spot, the jump and the knees giving at its landing. How hard a
   * peer landed is not on the wire, so every landing is an ordinary jump's.
   */
  function stride(body: Body, dt: number, speed: number, airborne: boolean): void {
    let turn = 0;
    if (dt > 0 && body.facing.lengthSq() > 0) {
      cross.crossVectors(body.facing, forward);
      turn = Math.atan2(cross.dot(up), body.facing.dot(forward)) / dt;
    }
    body.facing.copy(forward);
    body.hold.off();
    if (body.airborne && !airborne) body.motion.land(0);
    body.airborne = airborne;
    body.motion.foot(dt, speed, airborne, { turn });
  }

  /**
   * In a seat, whose frame the holder has just been put on: the idle above the
   * waist, the legs folded as the hero's are unless the seat is stood at, or astride
   * to its grip and footrests as the hero rides, and the character's own hips moved
   * onto the frame.
   */
  function seat(peer: Peer, body: Body, dt: number, data: SeatFrameData): void {
    const root = body.person.root;
    const pose = data.pose ?? 'sit';
    body.hold.off();
    body.motion.still(dt);
    body.hold.on();
    const driving = data.seat?.legs === 'drive';
    if (pose === 'sit') foldLegs(body.limbs, peer.holder, driving ? DRIVE_THIGH : SEAT_THIGH, driving ? DRIVE_SHIN : SEAT_SHIN);
    else if (pose === 'ride' && data.seat !== undefined) {
      peer.holder.updateMatrixWorld(true);
      hipAt.copy(peer.holder.worldToLocal(body.limbs.hips.getWorldPosition(hipAt)));
      poseAstride(body.limbs, peer.holder, hipAt, data.seat, data.motion?.phase ?? 0);
    }
    peer.holder.updateMatrixWorld(true);
    hipAt.copy(peer.holder.worldToLocal(body.limbs.hips.getWorldPosition(hipAt)));
    root.position.sub(hipAt);
    // At a wheel, the hands on it once the hips are on the frame: the hip is
    // the frame's own origin then, and the wheel turns as the vehicle does.
    if (pose === 'sit' && data.seat?.wheel !== undefined) holdWheel(body.limbs, peer.holder, hipAt.set(0, 0, 0), data.seat.wheel, data.motion?.steer ?? 0);
  }

  /** Puts the holder on a seat frame, through whatever carries this group. Null when the seat is not drawn. */
  function onSeat(peer: Peer): THREE.Object3D | null {
    const held = s.seatOf?.(peer.id) ?? null;
    const frame = held === null ? null : s.seats?.seatFrame(held.vehicle, held.seat) ?? null;
    if (frame === null) return null;
    frame.updateWorldMatrix(true, false);
    group.updateWorldMatrix(true, false);
    local.copy(group.matrixWorld).invert().multiply(frame.matrixWorld);
    local.decompose(peer.holder.position, peer.holder.quaternion, scale);
    return frame;
  }

  return { dressed, stride, seat, onSeat };
}

export type Bodies = ReturnType<typeof createBodies>;
