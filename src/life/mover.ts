/**
 * A mover: one thing the life streamer has admitted, its route and its
 * per-frame state. A route is a pure function of the world clock.
 */
import * as THREE from 'three';
import type { Person } from '../cast.ts';
import { PLANET_RADIUS } from '../globe.ts';
import type { Herding } from './herd-types.ts';
import { INSIDE, INSIDE_RIGHT, WALK_PHASES } from './tuning.ts';

/** Where a mover is and which way it is going, this instant. */
export interface Frame {
  /** Unit vector at the mover. */
  dir: THREE.Vector3;
  /** Distance from the planet's centre. */
  height: number;
  /** Unit tangent: the way it faces. */
  forward: THREE.Vector3;
  /** Roll about `forward`: a boat leaning into its turn. */
  roll: number;
  /** Pitch, nose up positive: a car climbing a town street's ramp. */
  pitch: number;
  /** False when it has ended up somewhere it may not be — over water, say. */
  live: boolean;
}

export function emptyFrame(): Frame {
  return {
    dir: new THREE.Vector3(1, 0, 0),
    height: PLANET_RADIUS,
    forward: new THREE.Vector3(0, 0, 1),
    roll: 0,
    pitch: 0,
    live: true,
  };
}

export type Family = 'road' | 'water' | 'foot' | 'herd';

export interface Mover {
  family: Family;
  /** Stable identity: two scans that admit the same thing produce the same key. */
  key: string;
  /** Which pooled geometry. A walker's phase is appended at draw time. */
  pool: string;
  /** `pool` with each walk phase appended, and with the near-build suffixes; built on first use. */
  phaseKeys?: string[];
  insideKeys?: [string, string];
  /** Units a second along its own route, which is also the walker's leg cadence. */
  speed: number;
  /** `ground` false skips the point-in-polygon and answers at the shelf. */
  route: (clock: number, out: Frame, ground: boolean) => void;
  at: THREE.Vector3;
  mesh: THREE.Mesh | null;
  distance: number;
  /** How many animals are in this one mesh. Herds only. */
  heads?: number;
  /** A walker drawn from the cast, when there is one: its own skinned body. */
  person?: { holder: THREE.Group; person: Person } | null;
  /** A walker knocked down by a vehicle (`breakables/knock.ts`): seconds since, where, the way it was flung, how far. */
  knock?: { t: number; at: THREE.Vector3; dir: THREE.Vector3; fling: number } | null;
  /** A herd near enough to be its animals rather than its merged buffer. */
  animated?: Herding | null;
  /** A road vehicle's giving way. Road movers only. */
  way?: Way;
  /** Which of the traffic kit's vehicles a road mover is: `hatchback`, `bicycle`. Road movers only. */
  vehicle?: string;
}

/** What kind of thing holds a road vehicle up; see `give-way.ts`. */
export const BLOCK_PLAYER = 0;
export const BLOCK_VEHICLE = 1;
export const BLOCK_PERSON = 2;
export const BLOCK_ANIMAL = 3;
export const BLOCK_TRAFFIC = 4;

/** A road vehicle's giving-way state: see `YIELD_REACH`. */
export interface Way {
  /** Seconds of the clock it is behind its route, and the share of the route's speed it drives at. */
  delay: number;
  pace: number;
  /** Seconds stood behind the same kind of thing, of those behind one that has not moved, and until the horn may sound again. */
  waited: number;
  stillFor: number;
  horn: number;
  /** Offset across its own left, units: pulled out to pass, and the target. */
  shift: number;
  shiftTo: number;
  /** What it is passing and how wide; valid while `shiftTo` is not 0. */
  passing: THREE.Vector3;
  passingRadius: number;
  /** Where its blocker stood when the wait began, and what it was (`BLOCK_*`, -1 nothing). */
  blockedAt: THREE.Vector3;
  blocker: number;
  /** Stopped looking at traffic after `GRIDLOCK`. */
  ghost: boolean;
  /** As drawn last frame: facing, whether drawn, and the drive part. */
  facing: THREE.Vector3;
  shown: boolean;
  part: number;
  /** Its box, from the geometry it was measured from, its lane offset, and which side the road keeps. */
  sized: THREE.BufferGeometry | null;
  halfLength: number;
  halfWidth: number;
  lane: number;
  keep: number;
  /** Who goes first when two block each other. */
  rank: number;
  /**
   * A city's lights ahead on its streets, as drawn last frame: route units
   * from its front to the stop line (Infinity where there is none ahead), the
   * town, and the street it came in by (`signals.ts`).
   */
  hold: number;
  holdTown: number;
  holdAxis: 0 | 1;
}

export function wayFor(key: string, lane: number, keep: number): Way {
  let rank = 0;
  for (let i = 0; i < key.length; i++) rank = (rank * 31 + key.charCodeAt(i)) >>> 0;
  return {
    delay: 0, pace: 1, waited: 0, stillFor: 0, horn: 0, shift: 0, shiftTo: 0,
    passing: new THREE.Vector3(), passingRadius: 0, blockedAt: new THREE.Vector3(), blocker: -1, ghost: false,
    facing: new THREE.Vector3(0, 0, 1), shown: false, part: 0,
    // Until its geometry is there: about a placed car.
    sized: null, halfLength: 3.3, halfWidth: 1.2, lane, keep, rank,
    hold: Infinity, holdTown: -1, holdAxis: 0,
  };
}

/**
 * What the traffic gives way to and a herd keeps off besides the movers
 * themselves, handed in by `main.ts` once the player and the fleet exist.
 */
export interface InTheWay {
  /**
   * Every body the traffic stops for, as a centre and a radius along the
   * ground: the player on foot or in what he drives (`player` true), and every
   * vehicle standing about or driven by somebody else.
   */
  each(visit: (at: THREE.Vector3, radius: number, player: boolean) => void): void;
  /** Whether a body of `radius` at `point` would stand in a townsman. */
  people?(point: THREE.Vector3, radius: number): boolean;
  /** Whether a vehicle a player has moved stands within `radius` of a point on the ground. */
  parked?(point: THREE.Vector3, radius: number): boolean;
  /** A road vehicle kept waiting by the player sounds its horn, here. */
  horn?(at: THREE.Vector3): void;
}

/** A walker's pool key at walk phase `phase`. */
export function phaseKeyOf(mover: Mover, phase: number): string {
  let keys = mover.phaseKeys;
  if (keys === undefined) {
    keys = [];
    for (let k = 0; k < WALK_PHASES; k++) keys.push(`${mover.pool}|${k}`);
    mover.phaseKeys = keys;
  }
  return keys[phase]!;
}

/** A road vehicle's near build's pool key, with the driver on the right or not. */
export function insideKeyOf(mover: Mover, right: boolean): string {
  const keys = (mover.insideKeys ??= [`${mover.pool}|${INSIDE}`, `${mover.pool}|${INSIDE_RIGHT}`]);
  return keys[right ? 1 : 0];
}

/** `t` folded into [0, 1). */
export const wrap = (t: number): number => {
  const f = t % 1;
  return f < 0 ? f + 1 : f;
};
