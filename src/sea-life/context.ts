// The scratch and the small helpers every swimmer shares: one set of vectors so
// a frame allocates nothing, the instance placement, a swimmer's round about its
// home, and what swam this frame.

import * as THREE from 'three';
import { PLANET_RADIUS } from '../globe.ts';
import { roundAt } from '../sea-floor.ts';

export interface SwimContext {
  home: THREE.Vector3;
  east: THREE.Vector3;
  north: THREE.Vector3;
  at: THREE.Vector3;
  ahead: THREE.Vector3;
  forward: THREE.Vector3;
  up: THREE.Vector3;
  side: THREE.Vector3;
  centre: THREE.Vector3;
  heading: THREE.Vector3;
  /** The camera of the frame being built. */
  eye: THREE.Vector3;
  colour: THREE.Color;
  /** The frame's clock, seconds. */
  clock: { now: number };
  /** How many of each big swimmer this frame, by kind. */
  bigCount: Record<string, number>;
  seenKinds: string[];
  seenAt: number[];
  /** Records that something swam at `where`, for `snapshot`. */
  saw(kind: string, where: THREE.Vector3): void;
  /** Unit east and north at a unit direction. */
  frameAt(unit: THREE.Vector3): void;
  /** Writes an instance's matrix. */
  place(mesh: THREE.InstancedMesh, index: number, position: THREE.Vector3, fwd: THREE.Vector3, upward: THREE.Vector3, size: number): void;
  /** A swimmer on its round about `home` (unit), at depth `depth` under the sea's radius. */
  onRound(seed: number, roam: number, speed: number, t: number, depth: number, lift: number): void;
}

export function createSwimContext(): SwimContext {
  const home = new THREE.Vector3();
  const east = new THREE.Vector3();
  const north = new THREE.Vector3();
  const at = new THREE.Vector3();
  const ahead = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const up = new THREE.Vector3();
  const side = new THREE.Vector3();
  const centre = new THREE.Vector3();
  const heading = new THREE.Vector3();
  const eye = new THREE.Vector3();
  const colour = new THREE.Color();
  const placeSide = new THREE.Vector3();
  const placeUp = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const scaled = new THREE.Matrix4();
  const round = { e: 0, n: 0, lift: 0 };
  const roundAhead = { e: 0, n: 0, lift: 0 };
  /** What swam this frame, for `snapshot`: a kind each and three numbers each, kept rather than formatted. */
  const seenKinds: string[] = [];
  const seenAt: number[] = [];
  const saw = (kind: string, where: THREE.Vector3): void => {
    seenKinds.push(kind);
    seenAt.push(where.x, where.y, where.z);
  };

  /** Unit east and north at a unit direction. */
  function frameAt(unit: THREE.Vector3): void {
    north.set(0, 1, 0).projectOnPlane(unit);
    if (north.lengthSq() < 1e-8) north.set(1, 0, 0).projectOnPlane(unit);
    north.normalize();
    east.crossVectors(north, unit).normalize();
  }

  /**
   * An instance's matrix: at `position`, nose along `forward`, back towards
   * `upward`, scaled by `size`. `side = up x forward` makes the basis
   * right-handed, which is asserted: a reflected instance draws as a blob of
   * ink.
   */
  function place(mesh: THREE.InstancedMesh, index: number, position: THREE.Vector3, fwd: THREE.Vector3, upward: THREE.Vector3, size: number): void {
    placeSide.crossVectors(upward, fwd).normalize();
    placeUp.crossVectors(fwd, placeSide).normalize();
    matrix.makeBasis(placeSide, placeUp, fwd);
    scaled.makeScale(size, size, size);
    matrix.multiply(scaled).setPosition(position);
    if (!(matrix.determinant() > 0)) throw new Error('sea life: a swimmer\'s basis would be mirrored');
    mesh.setMatrixAt(index, matrix);
  }

  /** A swimmer on its round about `home` (unit), at depth `depth` under the sea's radius. */
  function onRound(seed: number, roam: number, speed: number, t: number, depth: number, lift: number): void {
    roundAt(seed, roam, speed, t, round);
    roundAt(seed, roam, speed, t + 0.25, roundAhead);
    at.copy(home).addScaledVector(east, round.e / PLANET_RADIUS).addScaledVector(north, round.n / PLANET_RADIUS).normalize();
    ahead.copy(home).addScaledVector(east, roundAhead.e / PLANET_RADIUS).addScaledVector(north, roundAhead.n / PLANET_RADIUS).normalize();
    const radius = PLANET_RADIUS - depth + round.lift * lift;
    const radiusAhead = PLANET_RADIUS - depth + roundAhead.lift * lift;
    at.multiplyScalar(radius);
    ahead.multiplyScalar(radiusAhead);
    forward.subVectors(ahead, at);
    if (forward.lengthSq() < 1e-10) forward.copy(east);
    forward.normalize();
  }

  return {
    home, east, north, at, ahead, forward, up, side, centre, heading, eye, colour,
    clock: { now: 0 },
    bigCount: {},
    seenKinds,
    seenAt,
    saw,
    frameAt,
    place,
    onRound,
  };
}
