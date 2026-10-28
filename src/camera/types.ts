import type * as THREE from 'three';
import type { InputState } from '../input.ts';
import type { Player } from '../player.ts';

/**
 * What the lens follows: Earth's `Player` is one, and so is the traveller on
 * another world (`worlds/index.ts`), so there is one camera in the game. Only
 * what the camera reads is here.
 */
export interface CameraSubject {
  readonly position: THREE.Vector3;
  readonly up: THREE.Vector3;
  readonly forward: THREE.Vector3;
  /** Ground speed, units a second. */
  readonly velocity: number;
  readonly airborne: boolean;
  readonly altitude: number;
  readonly depth: number;
  readonly sink: number;
  readonly sitting: boolean;
  readonly state: Player['state'];
  readonly controls: { lift: number };
  /**
   * An aircraft aloft: its body's rotation in the frame of its bow (side, up,
   * `forward`). The chase turns with it; absent, or the identity, it chases
   * the heading alone.
   */
  readonly attitude?: THREE.Quaternion;
  /** A plane in full control, flown close behind in its own frame. */
  readonly aerobatic?: boolean;
  readonly ride: { readonly model: { readonly kind: string; readonly size: readonly [number, number, number] } } | null;
  seatEye(position: THREE.Vector3, orientation: THREE.Quaternion): boolean;
  setBodyVisible(visible: boolean): void;
  setCockpit(on: boolean): void;
  setEyeInHead(on: boolean): void;
}

export interface CameraRig {
  camera: THREE.PerspectiveCamera;
  /** Unit vector: where the camera faces, projected tangent to the surface. Feed to player. */
  heading: THREE.Vector3;
  /**
   * What `WASD` is measured against on foot: a sampled copy of `heading`, not
   * `heading` itself. It is re-taken only when the movement changes or the mouse
   * turns the view, so the camera swinging behind the player does not rotate the
   * meaning of the key being held.
   */
  steer: THREE.Vector3;
  /**
   * Framing levers. On foot they are yours (`rig.view.height = 30000` pulls back
   * until the whole planet fits). In a vehicle the rig drives them from the
   * altitude and takes them back when you land.
   */
  view: { distance: number; height: number };
  /**
   * True while the eye is in the avatar's head. `V` toggles it, the rig owns the
   * state, and it is settable: `atlas.rig.firstPerson = true`. On foot and in
   * every seat; in a seat the eye is the seated body's (`Player.seatEye`) and the
   * mouse turns the head within `COCKPIT_YAW` and `COCKPIT_PITCH`.
   */
  firstPerson: boolean;
  /** Update yaw/pitch from mouse look. Call BEFORE player.update. */
  aim(dt: number, input: InputState, player: CameraSubject): void;
  /** Chase the player. Call AFTER player.update. */
  follow(dt: number, player: CameraSubject, groundRadiusAt: (p: THREE.Vector3) => number): void;
  /** Place the camera with no interpolation: first frame, and after a teleport. */
  snap(player: CameraSubject, groundRadiusAt: (p: THREE.Vector3) => number): void;
  resize(width: number, height: number): void;
  /**
   * A knock felt through the lens: `strength` from 0 to 1, a car into a wall at
   * full boost being about 1. Nothing at all while `shakes` is off.
   */
  shake(strength: number): void;
  /** Whether `shake` moves the lens. The Settings card's *Camera shake*. */
  shakes: boolean;
  /**
   * How much of a sense of speed the lens is giving, 0 to 1: it opens by up to
   * `FOV_RUSH` degrees. Set from outside every frame; 0 leaves the lens alone.
   */
  rush: number;
}

export interface CameraOptions {
  /**
   * Whether a point is inside something built (a building's walls and under its
   * roof), which the lens must not be behind. A callback because the walls belong
   * to `settlements.ts`. Without it only the ground stops the camera.
   */
  blocks?: (point: THREE.Vector3) => boolean;
  /**
   * Whether what stands between the lens and the body is seen through
   * (`see-through.ts`) rather than walked in front of: a wall then pulls the
   * lens in only when the lens itself would be inside it. The ground always
   * pulls it in.
   */
  seesThrough?: boolean;
}
