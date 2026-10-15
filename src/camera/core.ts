/**
 * The camera's shared state. Every part (framing, placement, first person, look,
 * chase, shake) is built over one `CameraCore`: the lens, the vectors the parts
 * write their answers into in turn, and the mutable fields (`fields`).
 */
import * as THREE from 'three';
import { FAR, FOV_FOOT, NEAR, RETURN_DELAY, RETURN_EASE, WALK_FRAMING } from './constants.ts';
import type { CameraOptions, CameraRig } from './types.ts';

export interface CameraFields {
  /** The wheel's multiple of `WALK_FRAMING`, and where it is heading. */
  zoom: number;
  zoomTarget: number;
  /** The mouse's tilt of the framing, radians; the neutral is the framing's own elevation (level in first person). */
  pitch: number;
  /** A movement key is held and the steering basis has been taken for it. */
  steering: boolean;
  /** An about-face is being closed; see `RETURN_RUSH`. */
  rushing: boolean;
  /**
   * In a craft, how far the mouse has turned the view off the line the view is
   * chasing, radians about `up`; the rest of the gap to the bow is the turn's.
   * `riding` is whether it has been handed its share yet.
   */
  glance: number;
  riding: boolean;
  /** True while the rig owns `view`. */
  driving: boolean;
  /** The eye is in the avatar's head (or the seat's). */
  firstPerson: boolean;
  /** First person in a seat: the head's turn off the seat's ahead (left positive) and its tilt (down positive). */
  lookYaw: number;
  lookPitch: number;
  /** The player has been told the eye is in the seat. */
  inCockpit: boolean;
  /** Seconds since the mouse last turned the view. Starts past the whole ramp so the first step is followed. */
  sinceLook: number;
  shakeLeft: number;
  shakePower: number;
  shakeClock: number;
  /** How far out from the pivot the lens is held after a wall; see `WALL_RELEASE`. */
  held: number;
  /** How much of the lead term is in play; 1 in a vehicle, 0 on foot. */
  lead: number;
  /** How strongly what is in the way is seen through, eased; see `see-through.ts`. */
  sight: number;
}

export interface CameraCore {
  readonly fields: CameraFields;
  readonly camera: THREE.PerspectiveCamera;
  readonly blocks: CameraOptions['blocks'];
  readonly seesThrough: boolean;
  readonly view: { distance: number; height: number };
  /** Set by `createCameraRig` once built; the shake reads `shakes` off it. */
  rig: CameraRig;
  /**
   * The tangent vector itself, carried along with the player (there is no fixed
   * axis to measure a yaw against on a sphere).
   */
  readonly heading: THREE.Vector3;
  readonly lastUp: THREE.Vector3;
  readonly steer: THREE.Vector3;
  readonly lastMove: { x: number; y: number };
  readonly seatTurn: THREE.Quaternion;
  readonly headTurn: THREE.Quaternion;
  readonly headEuler: THREE.Euler;
  /** What the shake laid on the lens this frame, taken off again before the next chase. */
  readonly shaken: THREE.Vector3;
  readonly shakeAxis: THREE.Vector3;
  readonly pivot: THREE.Vector3;
  readonly offset: THREE.Vector3;
  readonly right: THREE.Vector3;
  readonly desired: THREE.Vector3;
  readonly sample: THREE.Vector3;
  readonly look: THREE.Vector3;
  readonly cross: THREE.Vector3;
  readonly travel: THREE.Vector3;
  /** What the lens looks at: the pivot, on foot moved `SHOULDER` to the right with the camera. */
  readonly target: THREE.Vector3;
  readonly drift: THREE.Vector3;
  /**
   * On foot, the pivot as the camera follows it. The chase is on the pivot and
   * not on the lens, so turning the view is an exact orbit round the body.
   */
  readonly orbit: THREE.Vector3;
  readonly previous: THREE.Vector3;
  readonly transport: THREE.Quaternion;
  readonly framing: { distance: number; height: number };
}

export function createCameraCore(options: CameraOptions): CameraCore {
  return {
    fields: {
      zoom: 1,
      zoomTarget: 1,
      pitch: 0,
      steering: false,
      rushing: false,
      glance: 0,
      riding: false,
      driving: false,
      firstPerson: false,
      lookYaw: 0,
      lookPitch: 0,
      inCockpit: false,
      sinceLook: RETURN_DELAY + RETURN_EASE,
      shakeLeft: 0,
      shakePower: 0,
      shakeClock: 0,
      held: Infinity,
      lead: 0,
      sight: 0,
    },
    camera: new THREE.PerspectiveCamera(FOV_FOOT, 1, NEAR, FAR),
    blocks: options.blocks,
    seesThrough: options.seesThrough === true,
    view: { distance: WALK_FRAMING.distance, height: WALK_FRAMING.height },
    rig: undefined as unknown as CameraRig,
    heading: new THREE.Vector3(0, 0, 1),
    lastUp: new THREE.Vector3(),
    steer: new THREE.Vector3(0, 0, 1),
    lastMove: { x: 0, y: 0 },
    seatTurn: new THREE.Quaternion(),
    headTurn: new THREE.Quaternion(),
    headEuler: new THREE.Euler(0, 0, 0, 'YXZ'),
    shaken: new THREE.Vector3(),
    shakeAxis: new THREE.Vector3(),
    pivot: new THREE.Vector3(),
    offset: new THREE.Vector3(),
    right: new THREE.Vector3(),
    desired: new THREE.Vector3(),
    sample: new THREE.Vector3(),
    look: new THREE.Vector3(),
    cross: new THREE.Vector3(),
    travel: new THREE.Vector3(),
    target: new THREE.Vector3(),
    drift: new THREE.Vector3(),
    orbit: new THREE.Vector3(),
    previous: new THREE.Vector3(),
    transport: new THREE.Quaternion(),
    framing: { distance: WALK_FRAMING.distance, height: WALK_FRAMING.height },
  };
}
