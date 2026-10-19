/**
 * Placing the camera with no interpolation: the first frame, and after a teleport.
 */
import * as THREE from 'three';
import { BODY_NEAR } from './constants.ts';
import { pivotHeight, seated } from './math.ts';
import type { CameraSubject } from './types.ts';
import type { CameraCore } from './core.ts';
import type { Framing } from './framing.ts';
import type { Lens } from './lens.ts';
import type { FirstPerson } from './first-person.ts';
import type { Placement } from './placement.ts';

export function createSnap(core: CameraCore, framer: Framing, optics: Lens, eyes: FirstPerson, placement: Placement) {
  const { camera, desired, framing, heading, lastUp, orbit, pivot, previous, view } = core;
  const s = core.fields;
  const { want } = framer;
  const { lens } = optics;
  const { cockpit, cockpitOn, eye, inTheHead, showBody } = eyes;
  const { aimAt, place, unclip } = placement;

  /** Place the camera with no interpolation. */
  function snap(player: CameraSubject, groundRadiusAt: (p: THREE.Vector3) => number): void {
    lens(player, 1);
    lastUp.copy(player.up);
    // Without this the frame after a teleport measures the whole jump as one
    // frame of velocity, and the lead throws the camera across the planet.
    previous.copy(player.position);
    s.lead = seated(player) ? 1 : 0;
    // A heading carried across a teleport points at nothing in particular, so
    // it is rebuilt from the player's own facing.
    heading.copy(player.forward).projectOnPlane(player.up);
    if (heading.lengthSq() < 1e-8) heading.set(0, 0, 1).projectOnPlane(player.up);
    heading.normalize();
    // The view is dead astern now, so a craft has no look left to return.
    s.glance = 0;
    s.riding = seated(player);

    // Only take `view` over if the rig already owns it, or is about to: a
    // teleport must not quietly reset a framing the console set by hand.
    if (s.driving || seated(player)) {
      want(player);
      view.distance = framing.distance;
      view.height = framing.height;
      s.driving = seated(player);
    }

    if (s.firstPerson && seated(player) && cockpit(player)) return;
    cockpitOn(player, false);
    if (inTheHead(player)) {
      // The pivot kept on the body, so that `V` off pulls back from the
      // head and not from wherever first person began.
      orbit.copy(player.position).addScaledVector(player.up, pivotHeight(player));
      s.held = Infinity;
      showBody(player, true, true);
      eye(player);
      return;
    }

    orbit.copy(player.position).addScaledVector(player.up, pivotHeight(player));
    s.held = Infinity;
    place(player, !seated(player));
    const lift = unclip(desired, groundRadiusAt, !seated(player));
    camera.position.copy(desired);
    showBody(player, camera.position.distanceTo(pivot) > BODY_NEAR);
    aimAt(player, lift);
  }

  return { snap };
}

export type Snap = ReturnType<typeof createSnap>;
