/**
 * The third-person camera rig: the lens, the chase, the framing for what the
 * player is doing, the ground and walls kept out of the lens, first person, and
 * a knock's shake. One rig serves Earth's player and the traveller on every
 * other world (`CameraSubject`).
 *
 * The parts live in `camera/` over a shared `CameraCore`; this file builds them
 * and exposes the rig.
 */
import { createCameraCore } from './camera/core.ts';
import { createChase } from './camera/chase.ts';
import { createFirstPerson } from './camera/first-person.ts';
import { createFraming } from './camera/framing.ts';
import { createHeading } from './camera/heading.ts';
import { createLens } from './camera/lens.ts';
import { createLook } from './camera/look.ts';
import { createPlacement } from './camera/placement.ts';
import { createShake } from './camera/shake.ts';
import { createSnap } from './camera/snap.ts';
import type { CameraOptions, CameraRig } from './camera/types.ts';

export type { CameraOptions, CameraRig, CameraSubject } from './camera/types.ts';

export function createCameraRig(options: CameraOptions = {}): CameraRig {
  const core = createCameraCore(options);
  const { camera, heading, steer, view, fields } = core;

  const framer = createFraming(core);
  const carrying = createHeading(core);
  const optics = createLens(core);
  const placement = createPlacement(core);
  const eyes = createFirstPerson(core, placement);
  const look = createLook(core, carrying, framer);
  const chase = createChase(core, framer, optics, carrying, eyes, placement);
  const snapping = createSnap(core, framer, optics, eyes, placement);
  const shaking = createShake(core);

  const rig: CameraRig = {
    camera,
    heading,
    steer,
    view,
    shakes: true,
    shake: shaking.shake,
    get firstPerson() {
      return fields.firstPerson;
    },
    set firstPerson(value: boolean) {
      fields.firstPerson = value;
    },
    aim: look.aim,
    follow(dt, player, groundRadiusAt) {
      shaking.unshake();
      chase.follow(dt, player, groundRadiusAt);
      shaking.shakeStep(dt);
    },
    snap(player, groundRadiusAt) {
      core.shaken.set(0, 0, 0);
      fields.shakeLeft = 0;
      snapping.snap(player, groundRadiusAt);
    },
    resize(width, height) {
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    },
  };
  core.rig = rig;
  return rig;
}
