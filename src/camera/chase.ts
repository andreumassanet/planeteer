/**
 * Chasing the player: the framing eases towards what the vehicle wants, and the lens follows the pivot.
 */
import * as THREE from 'three';
import { AVATAR_HEIGHT } from '../avatar.ts';
import {
  BODY_NEAR,
  CAMERA_LAG,
  CAMERA_LAG_UP,
  FOV_RATE,
  FRAMING_RATE,
  PIVOT_HEIGHT,
  RISE_TRAIL,
  WALL_RELEASE,
} from './constants.ts';
import { approach, pivotHeight, seated } from './math.ts';
import type { CameraSubject } from './types.ts';
import type { CameraCore } from './core.ts';
import type { Framing } from './framing.ts';
import type { Lens } from './lens.ts';
import type { Heading } from './heading.ts';
import type { FirstPerson } from './first-person.ts';
import type { Placement } from './placement.ts';
import { createFlightChase } from './flight.ts';

export function createChase(
  core: CameraCore,
  framer: Framing,
  optics: Lens,
  carrying: Heading,
  eyes: FirstPerson,
  placement: Placement,
) {
  const { camera, desired, drift, framing, orbit, pivot, previous, travel, view } = core;
  const s = core.fields;
  const { want } = framer;
  const { lens } = optics;
  const { align } = carrying;
  const { cockpit, cockpitOn, eye, inTheHead, showBody } = eyes;
  const { aimAt, place, unclip } = placement;
  const flight = createFlightChase(core);

  /** Chase the player. Call after `player.update`. */
  function follow(dt: number, player: CameraSubject, groundRadiusAt: (p: THREE.Vector3) => number): void {
    want(player);
    lens(player, approach(FOV_RATE, dt));
    if (seated(player)) s.driving = true;
    if (s.driving) {
      const rate = approach(FRAMING_RATE, dt);
      view.distance += (framing.distance - view.distance) * rate;
      view.height += (framing.height - view.height) * rate;
      // Hand `view` back once a landing has finished putting it away, so the
      // console lever stays the player's on foot.
      if (
        !seated(player) &&
        Math.abs(view.distance - framing.distance) < 0.5 &&
        Math.abs(view.height - framing.height) < 0.5
      ) {
        view.distance = framing.distance;
        view.height = framing.height;
        s.driving = false;
      }
    }

    // Where the vehicle will be, not where it is: adding the trail back on
    // cancels it, so the smoothing only absorbs turns instead of lagging behind
    // a straight line. Measured from the position, because a climb is part of
    // it and `velocity` is only the ground speed.
    travel.subVectors(player.position, previous);
    previous.copy(player.position);
    s.lead += ((seated(player) ? 1 : 0) - s.lead) * approach(FRAMING_RATE, dt);
    // `v / CAMERA_LAG` is the trail of the continuous chase; the discrete one
    // trails slightly less, and the continuous figure would overshoot the
    // target past the vertical at cruise. Guarded against dt = 0, where
    // 0 * Infinity would poison the camera.
    const chase = approach(CAMERA_LAG, dt);
    const trail = chase > 1e-6 ? (1 - chase) / chase : 0;

    align(player);
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
    if (!seated(player)) {
      // Chase the pivot, then orbit it exactly.
      drift.copy(player.position).addScaledVector(player.up, pivotHeight(player)).sub(orbit);
      // A jump of twenty bodies is caught outright, height and all (scaling by
      // `1 / chase` would catch only the level part, and is Infinity when dt is 0).
      if (drift.lengthSq() > AVATAR_HEIGHT * AVATAR_HEIGHT * 400) orbit.add(drift);
      else {
        const rise = drift.dot(player.up);
        drift.addScaledVector(player.up, -rise);
        const climbing = dt > 0 ? Math.abs(travel.dot(player.up)) / dt : 0;
        orbit.addScaledVector(drift, chase).addScaledVector(player.up, rise * approach(Math.max(CAMERA_LAG_UP, climbing / RISE_TRAIL), dt));
      }
      place(player, true);
      const lift = unclip(desired, groundRadiusAt, true);
      // A wall pulls the lens in at once and lets it out gently.
      drift.subVectors(desired, pivot);
      const reach = drift.length();
      s.held = reach < s.held ? reach : s.held + (reach - s.held) * approach(WALL_RELEASE, dt);
      camera.position.copy(pivot).addScaledVector(drift, reach > 1e-6 ? s.held / reach : 0);
      showBody(player, camera.position.distanceTo(pivot) > BODY_NEAR);
      aimAt(player, lift);
      return;
    }
    // In a craft the lens is chased as it always was, and the pivot is
    // kept where the body is for the step back ashore. An aircraft aloft is
    // chased in its own frame.
    orbit.copy(player.position).addScaledVector(player.up, PIVOT_HEIGHT);
    s.held = Infinity;
    const aloft = flight.place(player, dt);
    if (!aloft) place(player);
    desired.addScaledVector(travel, s.lead * trail);
    const walls = false;
    // The ground is answered where the camera wants to be, not where it has got
    // to so far; after the interpolation the lift would be only a sliver.
    const lift = unclip(desired, groundRadiusAt, walls);
    // Across at the chase and along `up` slower, on foot: see `CAMERA_LAG_UP`.
    drift.subVectors(desired, camera.position);
    const rise = drift.dot(player.up);
    drift.addScaledVector(player.up, -rise);
    camera.position.addScaledVector(drift, chase)
      .addScaledVector(player.up, rise * (walls ? approach(CAMERA_LAG_UP, dt) : chase));
    // Again on the smoothed position, because the lerp cuts corners and would
    // cross the ground, or the building a lens swinging back out has left.
    unclip(camera.position, groundRadiusAt, walls);
    showBody(player, camera.position.distanceTo(pivot) > BODY_NEAR);
    if (aloft) flight.aim(player, lift);
    else aimAt(player, lift);
  }

  return { follow };
}

export type Chase = ReturnType<typeof createChase>;
