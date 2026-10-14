/** The space vehicles' shared types. */

import type * as THREE from 'three';
import type { VehicleKind } from '../contract.ts';
import type { SeatedPose } from '../../cast.ts';
import type { UfoState } from '../ufo.ts';

/** What a craft is told each frame while it is driven. */
export interface Controls {
  /** -1 to 1: throttle back to forward. */
  throttle: number;
  /** -1 to 1: left to right. */
  steer: number;
  climb: boolean;
  descend: boolean;
  /** The run key: a ship's afterburner (`TURBO`). */
  boost?: boolean;
}

export interface Craft {
  kind: VehicleKind;
  name: string;
  object: THREE.Group;
  position: THREE.Vector3;
  /** Unit tangent: where it points. */
  heading: THREE.Vector3;
  speed: number;
  /** Its top speed, units a second: what the engine's note is measured against. */
  top: number;
  vertical: number;
  airborne: boolean;
  /** Where the driver's hips go, in the craft's frame. */
  seat: THREE.Vector3;
  /**
   * Whether the driver is out of sight. A closed craft is glazed and furnished
   * (`cockpit.ts`) and its driver seen through the glass; this is for one whose
   * cabin could not be fitted to the person, whose body is hidden in the hull.
   */
  closed: boolean;
  /** Whether the pilot stands rather than sits: a balloon's basket. */
  standing: boolean;
  /**
   * How the driver sits, as Earth's seats say it (`SeatedPose`): the legs to
   * the pedals or hanging, and the hands on what it is steered by — a wheel,
   * a yoke, the saucer's two sticks, the rover's T-handle (`holdWheel` in
   * `cast.ts`). Null standing in a basket.
   */
  pose: SeatedPose | null;
  /** The wheel's turn, radians, positive clockwise as the driver sees it: what the hands on it follow. */
  turn: number;
  /**
   * The eye in the craft's frame, for `V` in the seat: seated, `SEAT_EYE`
   * over the hip as on Earth; standing, a standing body's eye over its soles.
   */
  eye: THREE.Vector3 | null;
  /** Whether the run key is an afterburner rather than a way down: what flies on thrust. */
  boosts: boolean;
  /** How far a person stands from its centre to board, units. */
  reach: number;
  /** Footprint radius: the wall it is when parked. */
  radius: number;
  /** Advances it a step under `controls`, or parked (`null`): it settles where it is. */
  update(dt: number, controls: Controls | null, groundAt: (point: THREE.Vector3) => number, gravity: number, radius: number): void;
}

export interface Model {
  group: THREE.Group;
  seat: THREE.Vector3;
  radius: number;
  closed: boolean;
  /** The legs a ship stands on, folded away in flight; null for a craft with none. */
  gear: THREE.Object3D | null;
  /** Its exhausts' flames, each pointing back along -Z at a nozzle's mouth: scaled by how hard it burns. */
  flames: THREE.Object3D[];
  /** Whether its pilot stands, as in a balloon's basket, rather than sits. */
  stand?: boolean;
  /** The seated eye, for `V` in the seat; see `Craft.eye`. */
  eye?: THREE.Vector3;
  /** How the driver sits and what the hands hold; see `Craft.pose`. */
  pose?: SeatedPose;
  /** The wheels and the needles that turn as it is driven (`'steer'`, `'needle'` pivots, `cabin.ts`'s parts). */
  steers?: THREE.Object3D[];
  needles?: THREE.Object3D[];
  /** Its lights, legs and beam, told each frame how it is going (the saucer's). */
  animate?(dt: number, state: UfoState): void;
  /** Its group is drawn already — merged where it can be, glass and light where it cannot — and is not merged again. */
  drawn?: boolean;
}
