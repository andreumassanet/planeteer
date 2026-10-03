/**
 * The lens on another world: **Earth's own rig** (`camera.ts`), not a copy.
 *
 * A walked world is the same game, so it is framed by the same camera: the
 * same lens, the chase on the pivot, the wheel, `V`, the walls, and the swing
 * that brings the view round behind a body walking away from it — the part a
 * restated rig had left out, so walking backwards on Mars walked out of the
 * frame. What is this file's own is the seam: the traveller as the rig reads
 * a body (`CameraSubject`), and the near and far planes, which on Earth
 * `main.ts` sets from Earth's radius and here follow the world's.
 */

import * as THREE from 'three';
import { createCameraRig } from '../camera.ts';
import type { CameraSubject } from '../camera.ts';
import type { InputState } from '../input.ts';
import type { VehicleKind } from './contract.ts';
import type { WorldPlayer } from './player.ts';

/** A craft of the walked worlds as the rig frames it: Earth's nearest kind. */
const FRAMED_AS: Readonly<Record<VehicleKind, string>> = {
  rover: 'car',
  skiff: 'boat',
  lander: 'plane',
  aerostat: 'balloon',
};

export interface WorldRig {
  camera: THREE.PerspectiveCamera;
  /** Tangent unit vector the camera faces. */
  heading: THREE.Vector3;
  /** What `WASD` means on foot: Earth's sampled steering (`CameraRig.steer`). */
  steer: THREE.Vector3;
  firstPerson: boolean;
  /** Mouse look and the wheel; call before the player moves. */
  aim(dt: number, input: InputState, player: WorldPlayer): void;
  /**
   * Places the lens after the player has moved. `top` is the highest the
   * ground anywhere can stand over `radius`, which is what decides how far
   * past the horizon a peak still shows.
   */
  follow(dt: number, player: WorldPlayer, groundAt: (point: THREE.Vector3) => number, radius: number, top: number): void;
  /** The lens put behind the traveller at once: the first frame, and after a jump. */
  snap(player: WorldPlayer, groundAt: (point: THREE.Vector3) => number, radius: number, top: number): void;
  /** Height over the ground under the player, for the haze and the reach. */
  readonly altitude: number;
  resize(width: number, height: number): void;
}

export function createWorldRig(blocks: (point: THREE.Vector3) => boolean): WorldRig {
  const rig = createCameraRig({ blocks });
  const camera = rig.camera;
  const up = new THREE.Vector3(0, 1, 0);
  const controls = { lift: 0 };
  const size: [number, number, number] = [1, 1, 1];
  const model = { kind: 'car', size };
  const ride = { model };
  let altitude = 0;
  let traveller: WorldPlayer | null = null;
  let groundOf: (point: THREE.Vector3) => number = () => 0;
  let worldRadius = 1;

  /** The traveller as the rig reads a body, re-pointed at whoever it is handed. */
  const subject: CameraSubject = {
    get position() {
      return traveller!.position;
    },
    get up() {
      return up;
    },
    get forward() {
      return traveller!.facing;
    },
    get velocity() {
      const p = traveller!;
      return p.craft !== null ? Math.abs(p.craft.speed) : p.velocity.length();
    },
    get airborne() {
      const p = traveller!;
      return p.craft !== null ? p.craft.airborne : p.airborne;
    },
    get altitude() {
      const p = traveller!;
      return Math.max(0, p.position.length() - (worldRadius + groundOf(p.position)));
    },
    depth: 0,
    sink: 0,
    sitting: false,
    get state() {
      return traveller!.craft !== null ? 'seated' : 'foot';
    },
    controls,
    get ride() {
      const craft = traveller!.craft;
      if (craft === null) return null;
      model.kind = FRAMED_AS[craft.kind];
      // The kit's footprint radius is half its longest side.
      size[0] = craft.radius * 2;
      size[1] = craft.radius * 1.2;
      size[2] = craft.radius;
      return ride;
    },
    // No seated eye on these craft: `V` in a seat stays behind it.
    seatEye: () => false,
    setBodyVisible(visible) {
      if (traveller !== null) traveller.avatar.group.visible = traveller.craft !== null ? !traveller.craft.closed : visible;
    },
    setCockpit: () => {},
  };

  function bind(player: WorldPlayer, groundAt: (point: THREE.Vector3) => number, radius: number): void {
    traveller = player;
    groundOf = groundAt;
    worldRadius = radius;
    up.copy(player.position).normalize();
  }

  const groundRadius = (point: THREE.Vector3): number => worldRadius + groundOf(point);

  /**
   * Near and far follow the altitude. Far is the geometric limit: the eye's
   * own horizon over the sphere plus the distance past it at which the
   * highest ground on the planet still stands over it — so a peak on the
   * skyline is never cut off by the far plane, and nothing beyond it is drawn
   * for nobody.
   */
  function planes(radius: number, top: number): void {
    altitude = Math.max(0, camera.position.length() - groundRadius(camera.position));
    const eyeR = camera.position.length();
    const horizon = Math.sqrt(Math.max(0, eyeR * eyeR - radius * radius));
    const beyond = Math.sqrt(Math.max(0, (radius + top) ** 2 - radius * radius));
    camera.near = Math.max(0.25, Math.min(50, altitude * 0.02));
    camera.far = Math.max(3000, horizon + beyond);
    camera.updateProjectionMatrix();
  }

  return {
    camera,
    heading: rig.heading,
    steer: rig.steer,
    get firstPerson() {
      return rig.firstPerson;
    },
    set firstPerson(value: boolean) {
      rig.firstPerson = value;
    },
    get altitude() {
      return altitude;
    },
    aim(dt, input, player) {
      traveller = player;
      up.copy(player.position).normalize();
      rig.aim(dt, input, subject);
    },
    follow(dt, player, groundAt, radius, top) {
      bind(player, groundAt, radius);
      rig.follow(dt, subject, groundRadius);
      planes(radius, top);
    },
    snap(player, groundAt, radius, top) {
      bind(player, groundAt, radius);
      rig.snap(subject, groundRadius);
      planes(radius, top);
    },
    resize(width, height) {
      rig.resize(width, height);
    },
  };
}
