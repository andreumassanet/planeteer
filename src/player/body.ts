/**
 * The body on its ride: which seat it sits in, whether it is drawn, and where the eye is.
 */
import * as THREE from 'three';
import { SEAT_EYE } from '../craft/body.ts';
import { faintGlass } from '../craft/build.ts';
import type { Seat } from '../craft/contract.ts';
import { AVATAR_HIP } from '../vehicles.ts';
import { RIDE_EYE_AHEAD, SEAT_EYE_AHEAD, SEAT_EYE_UP, STAND_EYE } from './constants.ts';
import type { Held } from './core.ts';
import type { PlayerCore } from './core.ts';

export function createBody(core: PlayerCore) {
  const { LOCAL_Y, avatar, craft, object, position, seat } = core;
  const s = core.fields;
  const seatShift = new THREE.Vector3();
  const eyeLocal = new THREE.Vector3();
  const eyeTurn = new THREE.Quaternion();
  /** What `applyBody` last did to which ride's materials. */
  const swapped: { group: THREE.Object3D | null; ink: boolean; faint: boolean } = { group: null, ink: false, faint: false };
  const noInk = new WeakMap<THREE.Material, THREE.Material>();

  /** The seat you are in, as the model publishes it. */
  const seatOf = (held: Held): Seat => held.model.seats[held.seat] ?? held.model.seats[0]!;

  /**
   * Whether the body is drawn: wanted by the camera, and on a seat that shows it.
   * In first person in a seat it is drawn whatever the camera wanted, its head
   * folded away, so the eye sees its own arms on the wheel; and the ride's glass is
   * all but cleared (`faintGlass`). A seat that hides its body keeps it hidden and
   * the shell is drawn without its ink (`inkless`).
   */
  function applyBody(): void {
    const inside = s.cockpit && s.ride !== null;
    const shown = s.ride === null || seatOf(s.ride).shown;
    const onFoot = s.eyeInHead && s.ride === null;
    avatar.group.visible = shown && (s.bodyWanted || inside || onFoot);
    avatar.setHeadless((inside && shown) || onFoot);
    if (s.ride === null) return;
    // Only when the answer changes: the camera says what it wants of the body
    // every frame, and each swap walks the whole vehicle. And the later swap
    // undone first, since the glass's may hold the ink's copy as its own.
    const ink = inside && !shown;
    if (swapped.group === s.ride.group && swapped.ink === ink && swapped.faint === inside) return;
    faintGlass(s.ride.group, false);
    inkless(s.ride.group, ink);
    faintGlass(s.ride.group, inside);
    swapped.group = s.ride.group;
    swapped.ink = ink;
    swapped.faint = inside;
  }

  /**
   * A closed shell seen from inside it, without its ink: the ink hull is drawn
   * from its back faces, and from inside a hull is a screen of ink. Each of the
   * ride's meshes gets a copy of its material with the ink off, kept per material,
   * and its own back after. Closed craft are lined (`liner` in `craft/cabin.ts`), so
   * this is only for a seat that hides its body (`Seat.shown` false).
   */
  function inkless(group: THREE.Object3D, on: boolean): void {
    group.traverse((part) => {
      const mesh = part as THREE.Mesh;
      if (!mesh.isMesh || Array.isArray(mesh.material)) return;
      const own = mesh.userData.inked as THREE.Material | undefined;
      if (!on) {
        if (own !== undefined) mesh.material = own;
        delete mesh.userData.inked;
        return;
      }
      if (own !== undefined) return;
      const material = mesh.material;
      let bare = noInk.get(material);
      if (bare === undefined) {
        bare = material.clone();
        // `Material.copy` leaves the shader patches behind, and a car's paint
        // or a town's lights are in them: the clone keeps the same program.
        bare.onBeforeCompile = material.onBeforeCompile;
        bare.customProgramCacheKey = material.customProgramCacheKey;
        bare.userData.outlineParameters = { ...(material.userData.outlineParameters as object | undefined), visible: false };
        noInk.set(material, bare);
      }
      mesh.userData.inked = material;
      mesh.material = bare;
    });
  }

  /**
   * Puts the body on a seat. A seat is a hip point for both poses
   * (`craft/body.ts`): seated, the hip goes on it; standing (a balloon's basket) the
   * soles go `AVATAR_HIP` under it, and the body keeps its own offset.
   */
  function seatOn(where: Seat): void {
    seat.rotation.set(0, where.yaw, 0);
    if (where.pose === 'stand') {
      seat.position.set(where.x, where.y - AVATAR_HIP, where.z);
      return;
    }
    seatShift.set(avatar.group.position.x, avatar.group.position.y + AVATAR_HIP, avatar.group.position.z)
      .applyAxisAngle(LOCAL_Y, where.yaw);
    seat.position.set(where.x - seatShift.x, where.y - seatShift.y, where.z - seatShift.z);
  }

  /** Lets go of the vehicle's group, which the fleet takes back. */
  function dropRide(): void {
    if (s.ride === null) return;
    craft.remove(s.ride.group);
    faintGlass(s.ride.group, false);
    inkless(s.ride.group, false);
    swapped.group = null;
    s.ride = null;
    s.carriedFrom = false;
    s.grounded = false;
    s.founder = -1;
    avatar.reset();
    applyBody();
  }

  /** Where the eyes are in the seat, into `at`, and the way the seat faces, into `orientation`. False when not seated. */
  function seatEye(at: THREE.Vector3, orientation: THREE.Quaternion): boolean {
    if (s.ride === null) return false;
    const where = seatOf(s.ride);
    if (where.pose === 'stand') eyeLocal.set(0, STAND_EYE - AVATAR_HIP, 0);
    else eyeLocal.set(0, where.legs === 'drive' ? SEAT_EYE.inCar : SEAT_EYE_UP, where.pose === 'ride' ? RIDE_EYE_AHEAD : SEAT_EYE_AHEAD);
    eyeLocal.applyAxisAngle(LOCAL_Y, where.yaw);
    eyeLocal.x += where.x;
    eyeLocal.y += where.y + s.ride.motion.lift;
    eyeLocal.z += where.z;
    // Through the ride's own roll, nose and swell, then the surface frame.
    orientation.copy(object.quaternion).multiply(craft.quaternion);
    at.copy(eyeLocal).applyQuaternion(craft.quaternion).add(craft.position).applyQuaternion(object.quaternion).add(position);
    eyeTurn.setFromAxisAngle(LOCAL_Y, where.yaw);
    orientation.multiply(eyeTurn);
    return true;
  }

  return { seatOf, applyBody, inkless, seatOn, seatEye, dropRide };
}

export type BodyRig = ReturnType<typeof createBody>;
