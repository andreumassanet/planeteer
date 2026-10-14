/** What the player carries between frames, shared by its parts. */

import * as THREE from 'three';
import type { Avatar } from '../../avatar.ts';
import type { Craft } from '../craft.ts';
import { newChuteSwing } from '../../craft/parachute.ts';
import type { PlayerWorld } from '../player.ts';

export interface PlayerState {
  world: PlayerWorld;
  avatar: Avatar;
  /** The world's gravity in units a second squared. */
  gravity: number;
  position: THREE.Vector3;
  facing: THREE.Vector3;
  velocity: THREE.Vector3;
  vertical: number;
  airborne: boolean;
  craft: Craft | null;
  /** Where the avatar hangs while on foot: the scene, given back on leaving a craft. */
  home: THREE.Object3D | null;
  /** Where the gait was last frame, for the heel strikes. */
  lastStep: number;
  /** What `avatar.stride` is told on top of the speed; see `MotionCues`. */
  cues: { turn: number; look: number };
  /**
   * Out of an aircraft: falling (`chute` true, `canopy` 0) and under the
   * canopy (`canopy` the seconds since it began to open), as on Earth; how much
   * of the pose is the canopy's (`spread`), the turn's lever and lean, and the
   * body's swing under it.
   */
  chute: boolean;
  canopy: number;
  spread: number;
  steering: number;
  lean: number;
  swing: ReturnType<typeof newChuteSwing>;
  trail: [number, number];
  parachute: THREE.Group | null;
  motion: THREE.Vector3;
  swung: THREE.Quaternion;
  swingEuler: THREE.Euler;
  hangFrom: THREE.Vector3;
}

export function createPlayerState(world: PlayerWorld, avatar: Avatar, gravity: number): PlayerState {
  return {
    world,
    avatar,
    gravity,
    position: new THREE.Vector3(0, world.radius, 0),
    facing: new THREE.Vector3(0, 0, 1),
    velocity: new THREE.Vector3(),
    vertical: 0,
    airborne: false,
    craft: null,
    home: null,
    lastStep: 0,
    cues: { turn: 0, look: 0 },
    chute: false,
    canopy: 0,
    spread: 0,
    steering: 0,
    lean: 0,
    swing: newChuteSwing(),
    trail: [0, 0],
    parachute: null,
    motion: new THREE.Vector3(),
    swung: new THREE.Quaternion(),
    swingEuler: new THREE.Euler(),
    hangFrom: new THREE.Vector3(),
  };
}
