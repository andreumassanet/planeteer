/** The ambient systems' shared types and helpers. */

import * as THREE from 'three';
import type { Rng } from '../../scenery/random.ts';
import type { AmbientSpec } from '../contract.ts';

export interface Devil {
  position: THREE.Vector3;
  drift: THREE.Vector3;
  up: THREE.Vector3;
  height: number;
  color: number;
  /** The dust it owes, carried from frame to frame. */
  carry: Float64Array;
  placed: boolean;
}

/** A system updated once a frame with the frame's tangent basis. */
export interface System {
  update(frame: Frame, dt: number): void;
}

/** What every system shares in a frame: where the traveller is, which way is up, north and east. */
export interface Frame {
  time: number;
  player: THREE.Vector3;
  eye: THREE.Vector3;
  up: THREE.Vector3;
  north: THREE.Vector3;
  east: THREE.Vector3;
  /** How far the traveller has walked east and north since the start, units. */
  walkedE: number;
  walkedN: number;
  radius: number;
  groundAt: (point: THREE.Vector3) => number;
}

/** What the systems are built with: the group they hang from, the shared random stream and the things to dispose. */
export interface AmbientContext {
  group: THREE.Group;
  rng: Rng;
  disposables: { dispose(): void }[];
  /** A soft round spot, made on first use. */
  soft(): THREE.DataTexture;
  /** A drift's direction (east, north) and speed: the spec's, else the wind's, else `fallback`. */
  driftOf(spec: AmbientSpec, fallback: number): { e: number; n: number; speed: number };
}

/** `v` wrapped into [-half, half). */
export const wrap = (v: number, size: number): number => ((((v + size / 2) % size) + size) % size) - size / 2;

/** Where a tangent-plane coordinate is in the world: east, north, and up from the traveller's ground. */
export const place = (frame: Frame, e: number, n: number, up: number, out: THREE.Vector3): THREE.Vector3 =>
  out.copy(frame.player).addScaledVector(frame.east, e).addScaledVector(frame.north, n).addScaledVector(frame.up, up);
