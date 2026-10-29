/**
 * First person: the eye in the head on foot, or in the seat in a vehicle. There is no chase, no collision test and no lerp, because nothing is between the lens and the eye.
 */
import * as THREE from 'three';
import {
  ABOUT_FACE,
  COCKPIT_DOWN,
  DOWN_BY_KIND,
  EYE_FOCUS,
  EYE_AHEAD,
  EYE_HEIGHT,
  EYE_MAX_ELEVATION,
  EYE_MIN_ELEVATION,
  SEATED_EYE_HEIGHT,
} from './constants.ts';
import { clamp, pivotHeight, seated } from './math.ts';
import { BODY_SCALE } from '../stature.ts';
import { RUN_SPEED, RUN_STRIDE, WALK_SPEED, WALK_STRIDE } from '../avatar.ts';
import type { CameraSubject } from './types.ts';
import type { CameraCore } from './core.ts';
import type { Placement } from './placement.ts';

/**
 * The head's bob in first person, units at the body's scale: how far the eye
 * dips at each footfall and sways from foot to foot, walking and at a full
 * run. A little, so the ground feels walked rather than glided over.
 */
const BOB_DIP = [0.1 * BODY_SCALE, 0.2 * BODY_SCALE] as const;
const BOB_SWAY = [0.05 * BODY_SCALE, 0.08 * BODY_SCALE] as const;
/** How fast the bob comes in when walking starts and settles when it stops, a second. */
const BOB_EASE = 6;

export function createFirstPerson(core: CameraCore, placement: Placement) {
  const { camera, headEuler, headTurn, heading, offset, orbit, pivot, seatTurn, target } = core;
  const s = core.fields;
  const { aimAt } = placement;
  const side = new THREE.Vector3();
  /** The stride's phase, radians, driven by the ground covered as the legs are; and the bob's share, eased. */
  let phase = 0;
  let bob = 0;
  let last = 0;

  /** True when the eye is actually in the head on foot, swimming, or falling under a canopy. */
  const inTheHead = (player: CameraSubject): boolean => s.firstPerson && !seated(player);

  /** Tells the player whether the eye is in the seat, when that changes. */
  function cockpitOn(player: CameraSubject, on: boolean): void {
    if (on === s.inCockpit) return;
    s.inCockpit = on;
    player.setCockpit(on);
  }

  /** First person in a seat: the lens at the seated eye, turned with the vehicle and then by the head. */
  function cockpit(player: CameraSubject): boolean {
    if (!player.seatEye(camera.position, seatTurn)) return false;
    const down = (player.ride === null ? undefined : DOWN_BY_KIND[player.ride.model.kind]) ?? COCKPIT_DOWN;
    headTurn.setFromEuler(headEuler.set(s.lookPitch + down, s.lookYaw, 0, 'YXZ'));
    camera.quaternion.copy(seatTurn).multiply(headTurn).multiply(ABOUT_FACE);
    orbit.copy(player.position).addScaledVector(player.up, pivotHeight(player));
    s.held = Infinity;
    cockpitOn(player, true);
    return true;
  }

  /**
   * Shows or hides the avatar. With the eye in the head on foot the body stays
   * drawn and only its head is folded away (`setEyeInHead`).
   */
  function showBody(player: CameraSubject, visible: boolean, inHead = false): void {
    player.setBodyVisible(visible);
    player.setEyeInHead(inHead);
  }

  /**
   * First person on foot. `pitch` is the same accumulator the third-person rig
   * uses, so a look in progress carries across the switch, but its neutral is level
   * rather than the framing's own elevation.
   */
  function eye(player: CameraSubject): void {
    s.pitch = clamp(s.pitch, EYE_MIN_ELEVATION, EYE_MAX_ELEVATION);
    const elevation = s.pitch;

    camera.position.copy(player.position).addScaledVector(player.up, (player.sitting ? SEATED_EYE_HEIGHT : EYE_HEIGHT) - player.sink)
      .addScaledVector(player.forward, EYE_AHEAD);
    stepBob(player);
    offset.copy(heading).multiplyScalar(Math.cos(elevation))
      .addScaledVector(player.up, -Math.sin(elevation));
    // `aimAt` takes its target in `pivot`, and going through it rather than
    // calling `lookAt` here is what keeps the explicit roll: straight down, the
    // view direction is parallel to `up` and there is no roll left to infer.
    pivot.copy(camera.position).addScaledVector(offset, EYE_FOCUS);
    target.copy(pivot);
    aimAt(player, 0);
  }

  /** Dips the eye at each footfall and sways it from foot to foot, by the ground covered, while walking on the ground. */
  function stepBob(player: CameraSubject): void {
    const now = performance.now();
    const dt = last === 0 ? 0 : Math.min(0.1, (now - last) / 1000);
    last = now;
    const walking = !player.airborne && !player.sitting && player.velocity > 0.5;
    const pace = clamp((player.velocity - WALK_SPEED) / (RUN_SPEED - WALK_SPEED), 0, 1);
    phase = (phase + (player.velocity * dt * 2 * Math.PI) / (WALK_STRIDE + (RUN_STRIDE - WALK_STRIDE) * pace)) % (2 * Math.PI);
    bob += ((walking ? 1 : 0) - bob) * Math.min(1, dt * BOB_EASE);
    if (bob < 1e-3) return;
    const dip = (BOB_DIP[0] + (BOB_DIP[1] - BOB_DIP[0]) * pace) * bob;
    const sway = (BOB_SWAY[0] + (BOB_SWAY[1] - BOB_SWAY[0]) * pace) * bob;
    side.crossVectors(player.forward, player.up).normalize();
    // Twice a cycle down, once a cycle across: a footfall on each foot.
    camera.position.addScaledVector(player.up, -dip * (0.5 - 0.5 * Math.cos(2 * phase))).addScaledVector(side, sway * Math.sin(phase));
  }

  return { inTheHead, cockpitOn, cockpit, showBody, eye };
}

export type FirstPerson = ReturnType<typeof createFirstPerson>;
