/** The crowd's shared types. */

import type * as THREE from 'three';
import type { Site } from '../settlements.ts';
import type { Walk } from '../town-grid.ts';
import type { Rigged } from '../../models.ts';
import type { SpaceCreature } from '../../space-kit.ts';

/** A disc in a town's frame that nobody stands in or walks through. */
export interface KeepClear {
  x: number;
  z: number;
  r: number;
}

export interface Lane {
  angle: number;
  from: number;
  to: number;
  /** Whether its inner end reaches the walk round the square. */
  ring: boolean;
}

export interface Pocket {
  lane: number;
  along: number;
  x: number;
  z: number;
}

export interface Plan {
  lanes: Lane[];
  pockets: Pocket[];
  /** The walk round the square, or null where the landmark leaves no room for one. */
  ring: number | null;
  half: number;
}

export interface Walker {
  key: string;
  site: Site;
  /** The walker as it stands in the world: moved and turned each frame. */
  mesh: THREE.Group;
  creature: SpaceCreature;
  rigged: Rigged;
  /** A crew member from elsewhere: stands at the pad and is not spoken to. */
  visitor: boolean;
  /** Units tall, and the scale from the pack's units. */
  height: number;
  scale: number;
  /** How far round its middle the body reaches, units: half its widest, as it is drawn. */
  room: number;
  /** Where it is in the town's frame, and which way it faces. */
  x: number;
  z: number;
  yaw: number;
  lane: number;
  /** The pocket it is in or bound for, or -1. */
  pocket: number;
  /** In a grid town, the stretch of pavement it strolls end to end; null for one who stands. */
  stretch: Walk | null;
  path: { x: number; z: number }[];
  /** Seconds to stand where it is, and how long to stand once the path is walked. */
  wait: number;
  rest: number;
  speed: number;
  clock: number;
  decisions: number;
  /** Set while it is being talked to: it stands and faces this. */
  facing: THREE.Vector3 | null;
  /** Lines said so far this visit. */
  turn: number;
  /** The clip playing, its action, and until when a one-off (a wave, a nod) holds. */
  clip: string;
  action: THREE.AnimationAction | null;
  holdUntil: number;
  nextGesture: number;
  talking: boolean;
}

export interface Crowd {
  group: THREE.Group;
  walkers: readonly Walker[];
  /** Stands people up and puts them away round `player`, moves them, and animates those near `eye`. */
  update(dt: number, player: THREE.Vector3, eye?: THREE.Vector3): void;
  /** The nearest walker to a point within `reach` who can be spoken to, or null. */
  nearest(point: THREE.Vector3, reach: number): Walker | null;
  /** Where a walker's head is, in the world. */
  headOf(walker: Walker, out: THREE.Vector3): THREE.Vector3;
  readonly stats: { walkers: number; bodies: number; buildMs: number; animated: number; pooled: number };
  dispose(): void;
}
