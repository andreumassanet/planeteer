/**
 * How every craft is driven: the numbers per medium (road, water, air), the
 * handling table of each kind, and `isWater`, which is what the sea is.
 *
 * The models are `src/craft/`'s, the sites are `fleet/`'s, and `player/` drives
 * them on the numbers below. The camera, the audio and the fleet read the same
 * numbers. Every dimension that depends on the body is derived from `FIGURE`
 * (`avatar.ts`) or the crowd's seated frame (`traffic/contract.ts`).
 */
import * as THREE from 'three';
import { FIGURE } from './avatar.ts';
import { BODY_SCALE } from './stature.ts';
import { PLANET_RADIUS, WORLD_SCALE } from './globe.ts';
import { MAX_SLOPE } from './terrain.ts';
import { createContext } from './monuments/contract.ts';
import type { CraftKind } from './craft/contract.ts';

/**
 * One context, made at import. `createContext` registers its ramp with
 * `theme.ts` so the moods repaint it, so it must be made once and not once per craft.
 */
const ctx = createContext();
const P = ctx.palette;
/**
 * Anything within this of sea level is water. Not zero: land heights vary, and a
 * comparison against an exact radius would flicker between land and sea on the
 * shoreline. The lowest ground on the planet is `SHORE_LIP`, eight times this.
 */
const SEA_LEVEL_EPSILON = 0.5;

export function isWater(ground: number): boolean {
  return ground <= PLANET_RADIUS + SEA_LEVEL_EPSILON;
}

/**
 * Where the water's surface is taken to be, over the sea's own radius: what a
 * hull's waterline and a swimmer's chest ride on. Not zero, because the water
 * sphere sags between its vertices and the shallows are lifted over it, so the
 * surface anyone sees near a shore is about half a unit up.
 */
export const WATERLINE = 0.5;

/**
 * What is not a boat sinks. A car, a bicycle, a bus or a tractor driven off a
 * quay or down a beach (or left rolling on alone, or an aircraft come down on the
 * sea) floats for `FOUNDER_FLOAT` seconds at the waterline, then goes down at
 * `FOUNDER_SINK` units a second with its nose dropping to `FOUNDER_NOSE`
 * radians, and at `FOUNDER_TIME` it is gone: whoever was in it is put out
 * swimming and the vehicle goes back to its site (`FleetLink.sink`). Its way
 * through the water dies over `FOUNDER_DRAG` seconds. A horse stops at the
 * water's edge instead.
 */
export const FOUNDER_FLOAT = 1.2;
export const FOUNDER_SINK = 1.8;
export const FOUNDER_NOSE = 0.45;
export const FOUNDER_TIME = 4.5;
export const FOUNDER_DRAG = 0.8;
/** How far under the waterline a foundering vehicle is, `t` seconds after it met the water. */
export function founderDepth(t: number): number {
  return Math.max(0, t - FOUNDER_FLOAT) * FOUNDER_SINK;
}
/** And how far its nose is down, in radians. */
export function founderNose(t: number): number {
  return FOUNDER_NOSE * Math.min(1, Math.max(0, t - FOUNDER_FLOAT * 0.5) / (FOUNDER_TIME - FOUNDER_FLOAT * 0.5));
}
/** Whether a vehicle founders in water rather than stopping at its edge; a hull floats on it. */
export function founders(kind: CraftKind, medium: 'road' | 'water' | 'air'): boolean {
  return medium !== 'water' && kind !== 'horse';
}

// ---- road vehicles ----------------------------------------------------------

/** A car on the road: cruise and flat out, in units a second, and backwards. */
export const CAR_SPEED = 45;
export const CAR_BOOST = 75;
export const CAR_REVERSE = 12;
/** Time constants of the throttle, the brake and the coast, in seconds. */
export const CAR_ACCELERATION_TIME = 1.3;
export const CAR_BRAKE_TIME = 0.45;
export const CAR_COAST_TIME = 2.2;
/** Full lock, radians a second, reached from `CAR_GRIP_SPEED` up: a car does not turn standing still. */
export const CAR_TURN = 1.25;
export const CAR_GRIP_SPEED = 10;
/** How long the wheel takes to go over to a lock, in seconds, and how much of the lock is left at `CAR_BOOST`. */
export const CAR_STEER_TIME = 0.15;
export const CAR_FAST_LOCK = 0.6;
/**
 * A car driven into a wall: the share of its speed it comes back off it at, and
 * the speed lost at a stroke that counts as a crash rather than a nudge, in units
 * a second. A crash is told (`PlayerEvent`).
 */
export const CAR_BOUNCE = 0.25;
export const CRASH_SPEED = 14;
/** The most a wheel climbs in one go without it being a wall, in units: a kerb is 0.4, a terrace riser four. */
export const CAR_STEP = 1.1;

/** The balloon: its speed along the heading you steer, the most it rises or sinks a second, how fast it turns, and the highest it goes above the sea. */
export const BALLOON_SPEED = 10;
export const BALLOON_CLIMB = 9;
/** How the burner and the vent take hold, in seconds, and how near the ground the sink is held (a share of the basket's height a second, never under `BALLOON_TOUCHDOWN`). */
export const BALLOON_LIFT_TIME = 1.25;
export const BALLOON_SETTLE = 0.5;
export const BALLOON_TOUCHDOWN = 1.5;
export const BALLOON_TURN = 0.45;
export const BALLOON_CEILING = 2400;

// ---- handling, a kind at a time ---------------------------------------------

const DEG_ = Math.PI / 180;

/**
 * How a vehicle on wheels or hooves is driven: `drive` in `player/road.ts` reads
 * one of these for whatever it is in.
 *
 * - `speed`, `boost`, `reverse`: units a second at `W`, with `Shift`, and backwards.
 * - `accelerationTime`, `brakeTime`, `coastTime`: the ease's time constants.
 * - `turn`, `gripSpeed`, `fastLock`, `steerTime`: the steering law of
 *   `steerWheels`: full lock in radians a second from `gripSpeed` up, what is
 *   left of it at `boost`, and how long the bars go over in.
 * - `pivot`: the share of the turn left standing still. A car has none; a horse
 *   turns on its haunches.
 * - `step`, `slope`: the most it climbs in one go without it being a wall, and
 *   the steepest ground it climbs, as a gradient.
 * - `rough`: the share of its speed it keeps off anything made.
 * - `lean`: how far a two-wheeler or a rider banks into a turn at full lateral
 *   pull, radians; 0 for a car, whose body rolls on its springs instead.
 * - `wheelie`: radians of nose-up a unit a second squared of acceleration gives
 *   a motorbike, and the most of it; 0 for anything else.
 * - `bounce`: the share of its speed it comes back off a wall at.
 */
export interface RoadHandling {
  speed: number;
  boost: number;
  reverse: number;
  accelerationTime: number;
  brakeTime: number;
  coastTime: number;
  turn: number;
  gripSpeed: number;
  fastLock: number;
  steerTime: number;
  pivot: number;
  step: number;
  slope: number;
  rough: number;
  lean: number;
  wheelie: number;
  bounce: number;
}

const CAR: RoadHandling = {
  speed: CAR_SPEED,
  boost: CAR_BOOST,
  reverse: CAR_REVERSE,
  accelerationTime: CAR_ACCELERATION_TIME,
  brakeTime: CAR_BRAKE_TIME,
  coastTime: CAR_COAST_TIME,
  turn: CAR_TURN,
  gripSpeed: CAR_GRIP_SPEED,
  fastLock: CAR_FAST_LOCK,
  steerTime: CAR_STEER_TIME,
  pivot: 0,
  step: CAR_STEP,
  slope: MAX_SLOPE,
  rough: 1,
  lean: 0,
  wheelie: 0,
  bounce: CAR_BOUNCE,
};

/** Every road kind's handling. A walk is 6.5 units a second and a run 20 (`avatar.ts`), a car 45. */
export const ROAD_HANDLING: Partial<Record<CraftKind, RoadHandling>> = {
  car: CAR,
  van: CAR,
  bicycle: {
    ...CAR,
    speed: 26, boost: 36, reverse: 3,
    accelerationTime: 1.6, brakeTime: 0.6, coastTime: 5,
    turn: 1.9, gripSpeed: 4, fastLock: 0.55, steerTime: 0.18,
    step: 0.9, slope: Math.tan(26 * DEG_), rough: 0.75, lean: 0.5, bounce: 0.2,
  },
  motorbike: {
    ...CAR,
    speed: 48, boost: 82, reverse: 4,
    accelerationTime: 0.9, brakeTime: 0.4, coastTime: 2.6,
    turn: 1.7, gripSpeed: 6, fastLock: 0.5, steerTime: 0.14,
    rough: 0.8, lean: 0.62, wheelie: 0.006, bounce: 0.2,
  },
  tuktuk: {
    ...CAR,
    speed: 30, boost: 40, reverse: 8,
    accelerationTime: 1.5, brakeTime: 0.5, coastTime: 2,
    turn: 1.6, gripSpeed: 6, fastLock: 0.7, steerTime: 0.15,
    step: 1, rough: 0.7,
  },
  bus: {
    ...CAR,
    speed: 32, boost: 44, reverse: 8,
    accelerationTime: 2.6, brakeTime: 0.8, coastTime: 3.5,
    turn: 0.8, gripSpeed: 10, steerTime: 0.3,
    slope: Math.tan(24 * DEG_), rough: 0.6,
  },
  tractor: {
    ...CAR,
    speed: 16, boost: 22, reverse: 8,
    accelerationTime: 1.2, brakeTime: 0.5, coastTime: 1.5,
    turn: 1, gripSpeed: 4, fastLock: 0.8, steerTime: 0.25,
    step: 1.6, slope: Math.tan(40 * DEG_), rough: 1, bounce: 0.1,
  },
  jeep: {
    ...CAR,
    speed: 40, boost: 62, reverse: 12,
    accelerationTime: 1.4, brakeTime: 0.5, coastTime: 2.4,
    turn: 1.2, gripSpeed: 8, steerTime: 0.16,
    step: 1.6, slope: Math.tan(42 * DEG_), rough: 1,
  },
  horse: {
    ...CAR,
    speed: 15, boost: 34, reverse: 3,
    accelerationTime: 1, brakeTime: 0.6, coastTime: 0.9,
    turn: 2.2, gripSpeed: 3, fastLock: 0.55, steerTime: 0.2, pivot: 0.5,
    step: 1.4, slope: Math.tan(38 * DEG_), rough: 1, lean: 0.12, bounce: 0.3,
  },
};

/**
 * How a hull is driven: `sail` in `player/water.ts`. The launch's row is the boat
 * constants below; besides speeds and turn:
 *
 * - `accelerationTime`, `rudderTime`: the throttle's and the helm's eases.
 * - `astern`: the share of `speed` it backs at.
 * - `heel`: how far it rolls in a turn, radians; a displacement hull heels out of
 *   a turn and a planing one into it.
 * - `bow`: how far the bow comes up onto the plane, radians.
 * - `hop`: how far it leaps off the chop at speed, units; 0 for a hull that sits in the water.
 * - `list`: a constant heel, radians (the wind's in a sail).
 */
export interface WaterHandling {
  speed: number;
  boost: number;
  turn: number;
  accelerationTime: number;
  rudderTime: number;
  astern: number;
  heel: number;
  bow: number;
  hop: number;
  list: number;
}

/** The other hulls' handling. The wind is constant here. */
export const WATER_HANDLING: Partial<Record<CraftKind, WaterHandling>> = {
  jetski: { speed: 40, boost: 76, turn: 2.3, accelerationTime: 0.55, rudderTime: 0.1, astern: 0.3, heel: 0.45, bow: 0.1, hop: 0.35, list: 0 },
  sailboat: { speed: 18, boost: 24, turn: 0.75, accelerationTime: 3.5, rudderTime: 0.45, astern: 0.15, heel: 0.12, bow: 0.02, hop: 0, list: 0.16 },
  submarine: { speed: 16, boost: 26, turn: 0.9, accelerationTime: 2.2, rudderTime: 0.35, astern: 0.3, heel: 0.05, bow: 0.02, hop: 0, list: 0 },
};

/**
 * The submarine under the surface: how fast it dives and rises on the two keys,
 * units a second; how its vertical speed eases; the most it ever goes down; how
 * far it keeps off the floor, over its draft; and how far down it counts as
 * under, for the camera, the wake and getting out (a submarine is left only at
 * the surface).
 */
export const SUB_DIVE = 6;
export const SUB_RISE = 7;
export const SUB_VERTICAL_TIME = 0.9;
export const SUB_MAX_DEPTH = 60;
export const SUB_FLOOR_CLEAR = 1.5;
export const SUB_UNDER = 1.2;

/**
 * The helicopter: its cruise and how far backwards, units a second; its climb and
 * descent; its yaw on the pedals, radians a second; the eases of the cyclic (the
 * speed) and the collective (the climb); how far the nose goes down at full
 * cruise and the bank at a full-rate turn; and the highest it goes over the sea.
 * It comes down anywhere flatter than `HELI_LANDING_GRADE` and hovers over water.
 */
export const HELI_SPEED = 70;
export const HELI_REVERSE = 14;
export const HELI_CLIMB = 22;
export const HELI_SINK = 16;
export const HELI_TOUCHDOWN = 3;
export const HELI_TURN = 1.3;
export const HELI_ACCELERATION_TIME = 1.4;
export const HELI_VERTICAL_TIME = 0.6;
export const HELI_NOSE = 0.2;
export const HELI_BANK = 0.3;
export const HELI_CEILING = 2600;
export const HELI_LANDING_GRADE = Math.tan(16 * DEG_);
/** How long the rotor takes to wind up before it lifts, in seconds. */
export const HELI_SPOOL = 1.2;

/**
 * The fastest a kind goes, units a second, with room: what `effects.ts` takes a
 * move for travel rather than a jump by, and the audio's throttle's top.
 */
export function topSpeedOf(kind: CraftKind): number {
  const road = ROAD_HANDLING[kind];
  if (road !== undefined) return road.boost;
  const water = WATER_HANDLING[kind];
  if (water !== undefined) return water.boost;
  switch (kind) {
    case 'boat':
      return BOAT_BOOST;
    case 'plane':
      return PLANE_CRUISE_HIGH;
    case 'balloon':
      return BALLOON_SPEED + BALLOON_CLIMB;
    case 'helicopter':
      return HELI_SPEED + HELI_CLIMB;
    default:
      return CAR_BOOST;
  }
}

// ---- the launch -------------------------------------------------------------

/** Cruise and full ahead, in units a second. Oceans are the plane's; the launch is for a coast, a lake and the crossing to the next island. */
export const BOAT_SPEED = 30;
export const BOAT_BOOST = 70;
/** Rudder, radians per second. */
export const BOAT_TURN = 1.15;
export const BOAT_ACCELERATION_TIME = 1.1;

/**
 * How far inland stepping ashore puts you. It has to exceed the bow's reach,
 * because the hull is stopped by land found that far ahead (`HULL_PROBES` in
 * `player/constants.ts`); step short of that and you disembark into the water you
 * were floating on.
 */
export const SHORE_REACH = 22 * BODY_SCALE;

// ---- the plane --------------------------------------------------------------

/** Highest the plane will hold: a little over the clouds (`CLOUD_BASE`), so the top of the climb is flying over the weather with the land still there below. */
export const PLANE_CEILING = 3000;
/**
 * Cruise at the floor and at the ceiling. Speed rides altitude: low, you can see
 * what you are crossing; climbing is how you cover an ocean.
 */
export const PLANE_CRUISE_LOW = 140;
/**
 * The cruise at the ceiling on the nominal planet. The other worlds keep it;
 * Earth's is `WORLD_SCALE` times it, because its oceans are that much wider.
 */
export const PLANE_CRUISE_NOMINAL = 1500;
export const PLANE_CRUISE_HIGH = PLANE_CRUISE_NOMINAL * WORLD_SCALE;
/**
 * The cruise at a height over the sea: low, from the floor to about a third of
 * the ceiling, nearly `PLANE_CRUISE_LOW`, then rising to `PLANE_CRUISE_HIGH`
 * at the ceiling, by the square of the share of it. Square, so a loop or a
 * climb out of a valley does not change the air it flies in.
 */
export function planeCruiseAt(altitude: number): number {
  const share = Math.min(1, Math.max(0, altitude / PLANE_CEILING));
  return PLANE_CRUISE_LOW + (PLANE_CRUISE_HIGH - PLANE_CRUISE_LOW) * share * share;
}
/** The throttle, `W` and `S`, as a share of the cruise it opens up or closes down. */
export const PLANE_THROTTLE_UP = 0.6;
export const PLANE_THROTTLE_DOWN = 0.35;
/**
 * Rate of turn at full stick once the plane is banked into it, in radians a
 * second. A rate and not a radius, deliberately: what the eye reads is the curve
 * against the view, and the view grows with the speed.
 */
export const PLANE_TURN = 1.0;
export const PLANE_ACCELERATION_TIME = 2.6;
/**
 * The most the speed changes in a second, units a second squared: the ease
 * above crosses the ocean-crossing speeds in seconds, not in one, and coming
 * out of aerobatics high up winds up rather than leaps.
 */
export const PLANE_SPEED_RATE = 400;
/** The throttle closes faster than it opens, so a landing is aimable. */
export const PLANE_LANDING_TIME = 1.2;

/**
 * The climb, as a vertical speed the keys ask for and the plane eases into. The
 * rate is `PLANE_CLIMB_RATE` times the height over the ground, and never under
 * `PLANE_CLIMB_MIN`, so the climb reads as a zoom out of the map. Descending is
 * the same law the other way, and it flares: under `PLANE_FLARE` times the
 * height, and no less than `PLANE_TOUCHDOWN`: slower than the climb, so the
 * fall from the ceiling to the low air takes about eight seconds (the height
 * falls by `PLANE_FLARE` of itself a second) and reads as a descent.
 */
export const PLANE_CLIMB_MIN = 18;
export const PLANE_CLIMB_RATE = 0.7;
/** Time constant of the vertical speed, in seconds. */
export const PLANE_VERTICAL_TIME = 0.7;
export const PLANE_FLARE = 0.28;
export const PLANE_TOUCHDOWN = 4;

/**
 * The light aircraft on the ground: the speed it lifts off at (a take-off run
 * reaches it with the throttle or the climb key held) and the most it taxis at
 * rolling out of a landing. The run opens the throttle for a quarter past it,
 * over `PLANE_RUN_TIME` (its own time constant, so the run fits the strip,
 * `STRIP_LENGTH` in `craft/airstrip.ts`); the plane then climbs out at
 * `PLANE_CLIMB_MIN` for `PLANE_CLIMB_OUT` seconds whatever the keys say.
 */
export const PLANE_ROTATE = PLANE_CRUISE_LOW * 0.6;
export const PLANE_RUN_TIME = 1.6;
export const PLANE_TAXI = 30;
export const PLANE_CLIMB_OUT = 3;
/** Steepest ground a plane may be set down on, as rise over run: a field, not a hillside. */
export const PLANE_LANDING_GRADE = Math.tan(15 * (Math.PI / 180));

/**
 * The ring a craft leaves when it arrives or goes: a splash on the water, a puff
 * of dust on the ground. A unit annulus standing on `y = 0`, which
 * `player/splash.ts` scales out and flattens as it fades, so the wall is 18% of
 * the radius at every size.
 */
export function buildSplash(): THREE.Mesh {
  const ring = ctx.ringWall(0.82, 1, 1, P.white, 16);
  ring.name = 'splash';
  ring.castShadow = false;
  ring.receiveShadow = false;
  return ring;
}

/**
 * Published so `player/` can put the avatar's hip on the seat without either file
 * restating the other's numbers: `FIGURE.hipY` is where the body's own origin puts
 * the hip, and the seat has to cancel the shift the pose makes.
 */
export const AVATAR_HIP = FIGURE.hipY;
