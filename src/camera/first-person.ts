/**
 * First person: the eye in the head on foot, or in the seat in a vehicle. There is no chase, no collision test and no lerp, because nothing is between the lens and the eye.
 */
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
import type { CameraSubject } from './types.ts';
import type { CameraCore } from './core.ts';
import type { Placement } from './placement.ts';

export function createFirstPerson(core: CameraCore, placement: Placement) {
  const { camera, headEuler, headTurn, heading, offset, orbit, pivot, seatTurn, target } = core;
  const s = core.fields;
  const { aimAt } = placement;

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
    offset.copy(heading).multiplyScalar(Math.cos(elevation))
      .addScaledVector(player.up, -Math.sin(elevation));
    // `aimAt` takes its target in `pivot`, and going through it rather than
    // calling `lookAt` here is what keeps the explicit roll: straight down, the
    // view direction is parallel to `up` and there is no roll left to infer.
    pivot.copy(camera.position).addScaledVector(offset, EYE_FOCUS);
    target.copy(pivot);
    aimAt(player, 0);
  }

  return { inTheHead, cockpitOn, cockpit, showBody, eye };
}

export type FirstPerson = ReturnType<typeof createFirstPerson>;
