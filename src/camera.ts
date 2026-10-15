/**
 * The third-person camera rig: the lens, the chase, the framing for what the
 * player is doing, the ground and walls kept out of the lens, first person, and
 * a knock's shake. One rig serves Earth's player and the traveller on every
 * other world (`CameraSubject`).
 *
 * The parts live in `camera/` over a shared `CameraCore`; this file builds them
 * and exposes the rig.
 */
import * as THREE from 'three';
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
import type { CameraOptions, CameraRig, CameraSubject } from './camera/types.ts';
import { BODY_NEAR, SIGHT_RATE, SIGHT_ZOOM_MAX } from './camera/constants.ts';
import { approach, seated } from './camera/math.ts';
import { AVATAR_HEIGHT } from './stature.ts';
import { SIGHT_BODY, setSight } from './see-through.ts';

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

  const middle = new THREE.Vector3();
  /** What is in the way of the body seen through: on foot, in third person, with the body drawn. */
  function see(dt: number, player: CameraSubject): void {
    const s = fields;
    const wanted =
      core.seesThrough && !s.firstPerson && !seated(player) && camera.position.distanceTo(core.pivot) > BODY_NEAR ? 1 : 0;
    s.sight += (wanted - s.sight) * approach(SIGHT_RATE, dt);
    if (wanted === 0 && s.sight < 0.02) s.sight = 0;
    middle.copy(player.position).addScaledVector(player.up, AVATAR_HEIGHT * 0.5);
    const widen = Math.min(SIGHT_ZOOM_MAX, Math.sqrt(Math.max(1, s.zoom)));
    setSight(camera, middle, player.up, AVATAR_HEIGHT * 0.5, s.sight, SIGHT_BODY * widen);
  }

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
      see(dt, player);
    },
    snap(player, groundRadiusAt) {
      core.shaken.set(0, 0, 0);
      fields.shakeLeft = 0;
      snapping.snap(player, groundRadiusAt);
      see(0, player);
    },
    resize(width, height) {
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    },
  };
  core.rig = rig;
  return rig;
}
