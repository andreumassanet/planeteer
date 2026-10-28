/**
 * A hull's own state: the slide it carries out of a turn, the sea it rides, a
 * leap off a crest, and the wind on a sail. `water.ts` drives it across the
 * water; `hull-pose.ts` rides it on the waves and draws it.
 *
 * The sea is three trains of waves running before the wind, kept as phases at
 * the hull rather than as a field over the planet: each phase advances by the
 * hull's own speed along the train and by the train's, so nothing here names
 * a latitude and a turn or a change of wind never makes a phase jump.
 */
import * as THREE from 'three';
import { clamp } from './math.ts';

/** Where the wind comes from, compass degrees (0 north, 90 east), and how hard, metres a second. */
export interface Breeze {
  from: number;
  speed: number;
}

export interface HullState {
  /** Sideways speed, units a second, positive to the right: what a turn leaves a hull carrying. */
  slip: number;
  /** A powerslide, 0 to 1, eased. */
  slide: number;
  /** The boost key last frame, so a press can kick. */
  boosting: boolean;
  /** A nose-up kick owed to the pose, radians a second: the boost's punch. */
  punch: number;
  /** Seconds a press of Space is held for a leap: one asked in the air is taken on landing. */
  leap: number;
  /** The waves' phases at the hull, radians. */
  phase: Float64Array;
  /** How rough the sea is, eased: a multiple of the waves' heights. */
  sea: number;
  /** The sea under the hull's middle last frame, its rate, and the highest rate of the rise under way. */
  surface: number;
  surfaceRate: number;
  rising: number;
  /** Out of the water: the hull's height over the waterline and its rate. */
  aloft: boolean;
  hop: number;
  hopRate: number;
  /** Seconds since it last came down. */
  sinceLanding: number;
  /** Heave, pitch and roll on the sea, each with its rate: see `HEAVE`, `PITCH`, `ROLL`. */
  springs: Float64Array;
  /** The wind as last asked, and how long until it is asked again. */
  windBearing: number;
  windSpeed: number;
  windClock: number;
  /** The wind against the bow: where it comes from, radians, positive from starboard. */
  windFrom: number;
  /** Seconds to the next spray off a powerslide. */
  spray: number;
  /** The submarine's depth last frame, to see it break the surface. */
  lastDive: number;
}

/** Offsets into `HullState.springs`: each value is followed by its rate. */
export const HEAVE = 0;
export const PITCH = 2;
export const ROLL = 4;

/** The wind when nobody says: a light westerly, as `weatherSample` has it. */
export const STILL_AIR: Readonly<Breeze> = { from: 270, speed: 3 };
/** How often the wind is asked, seconds. */
export const WIND_EVERY = 0.25;

/**
 * The trains: each one's bearing off the wind's, its length, units, and its
 * height at a sea of 1, units. The longest is the swell, the shortest the chop
 * a fast hull slaps across.
 */
export const WAVES: readonly { angle: number; length: number; height: number }[] = [
  { angle: 0, length: 34, height: 0.22 },
  { angle: 0.6, length: 19, height: 0.11 },
  { angle: -0.9, length: 11, height: 0.05 },
];
/** The waves' gravity, in this world's units: a swell's period of about four seconds. */
const WAVE_G = 13;
const WAVE_K = WAVES.map((wave) => (Math.PI * 2) / wave.length);
const WAVE_W = WAVE_K.map((k) => Math.sqrt(WAVE_G * k));

export function newHull(): HullState {
  return {
    slip: 0,
    slide: 0,
    boosting: false,
    punch: 0,
    leap: 0,
    phase: new Float64Array(WAVES.length).map((_, i) => i * 2.1),
    sea: 1,
    surface: 0,
    surfaceRate: 0,
    rising: 0,
    aloft: false,
    hop: 0,
    hopRate: 0,
    sinceLanding: 1,
    springs: new Float64Array(6),
    windBearing: STILL_AIR.from,
    windSpeed: STILL_AIR.speed,
    windClock: 0,
    windFrom: 0,
    spray: 0,
    lastDive: 0,
  };
}

/** Back to a hull at rest on a flat sea; the wind is kept, and asked again at once. */
export function resetHull(h: HullState): void {
  h.slip = h.slide = h.punch = h.leap = h.hop = h.hopRate = h.spray = h.lastDive = 0;
  h.surface = h.surfaceRate = h.rising = 0;
  h.boosting = h.aloft = false;
  h.sinceLanding = 1;
  h.springs.fill(0);
  h.windClock = 0;
}

/** The sea a wind of `speed` metres a second raises: a breath is half the waves, a gale twice them. */
export const seaOf = (speed: number): number => clamp(0.5 + speed / 10, 0.5, 2);

/** Steps every train's phase by the hull's way through it: `ahead` along the bow and `slip` to the right, units a second. */
export function stepWaves(h: HullState, dt: number, ahead: number, slip: number): void {
  for (let i = 0; i < WAVES.length; i++) {
    const bearing = h.windFrom + Math.PI + WAVES[i]!.angle;
    const along = ahead * Math.cos(bearing) + slip * Math.sin(bearing);
    h.phase[i] = (h.phase[i]! + (WAVE_K[i]! * along - WAVE_W[i]!) * dt) % (Math.PI * 2);
  }
}

/** The sea's height `along` the bow and `across` to the right of the hull's middle, units over the waterline. */
export function seaAt(h: HullState, along: number, across: number): number {
  let height = 0;
  for (let i = 0; i < WAVES.length; i++) {
    const bearing = h.windFrom + Math.PI + WAVES[i]!.angle;
    height += WAVES[i]!.height * Math.sin(h.phase[i]! + WAVE_K[i]! * (along * Math.cos(bearing) + across * Math.sin(bearing)));
  }
  return height * h.sea;
}

/**
 * How much of a sail's best a hull makes at `angle` off the wind, radians, 0
 * head to wind and pi dead before it: nothing in irons, the most on a beam
 * reach, a little less running. Degrees and shares.
 */
const POLAR: readonly (readonly [number, number])[] = [
  [0, 0.12],
  [30, 0.16],
  [45, 0.62],
  [70, 0.92],
  [100, 1],
  [135, 0.88],
  [180, 0.7],
];

export function sailShare(angle: number): number {
  const degrees = clamp((Math.abs(angle) * 180) / Math.PI, 0, 180);
  for (let i = 1; i < POLAR.length; i++) {
    const [d1, s1] = POLAR[i]!;
    if (degrees > d1) continue;
    const [d0, s0] = POLAR[i - 1]!;
    return s0 + ((s1 - s0) * (degrees - d0)) / (d1 - d0);
  }
  return POLAR[POLAR.length - 1]![1];
}

/** A sail's pace in a wind of `speed` metres a second, as a multiple of its handling: slow in a breath, flying in a gale. */
export const windStrength = (speed: number): number => clamp(0.6 + speed / 14, 0.6, 1.45);

/** Where the sail starts drawing, radians off the wind: inside it the sail luffs. */
export const LUFF_FROM = (20 * Math.PI) / 180;
export const DRAW_FROM = (45 * Math.PI) / 180;

const north = new THREE.Vector3();
const east = new THREE.Vector3();
const right = new THREE.Vector3();
const from = new THREE.Vector3();

/**
 * The wind against the bow, radians, positive from starboard, for a hull at
 * `up` facing `forward`, with the wind from `bearing` compass degrees.
 */
export function windAgainst(bearing: number, up: THREE.Vector3, forward: THREE.Vector3): number {
  north.set(0, 1, 0).projectOnPlane(up);
  if (north.lengthSq() < 1e-10) north.set(0, 0, -1).projectOnPlane(up);
  north.normalize();
  east.crossVectors(north, up);
  const b = (bearing * Math.PI) / 180;
  from.copy(north).multiplyScalar(Math.cos(b)).addScaledVector(east, Math.sin(b));
  // Screen right is forward x up.
  right.crossVectors(forward, up);
  return Math.atan2(from.dot(right), from.dot(forward));
}
