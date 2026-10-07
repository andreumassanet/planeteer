/**
 * How every vehicle is driven, and the two that came before them.
 *
 * **Nobody owns a vehicle any more.** The cars, launches, light aircraft and
 * balloons you find about the world are `src/craft/`'s models, placed by
 * `fleet.ts` and driven by `player.ts` on the numbers below — the medium's
 * speeds, turns and limits, and `isWater`, which is still what the sea is.
 * The launch and the floatplane that follow were everybody's own boat and
 * plane until then: summoned by walking into the sea and by a key, grown in
 * round the player, and shrunk away when he left them. They are no longer
 * built; the history of their sizing is below because every seat since was
 * argued the same way.
 *
 * They exist for different reasons. The boat is what makes the sea a surface —
 * until it existed, walking into the ocean dropped you to sea level and you
 * carried on as if the water were a floor. The plane is the map: `rig.view`
 * already frames the player and the fog already opens with altitude, so
 * climbing until the globe fits the lens is a flight, not a screen.
 *
 * This file owns their shape and their numbers. `player.ts` owns the state
 * machine that rides them, because it owns `position`.
 *
 * ## Both of them are sized against the body, and neither used to be
 *
 * They are two of the three things the player looks at all session and the
 * third — `src/avatar.ts` — was rebuilt to the monument contract first. What
 * the rebuild made visible is that these two were built to numbers that had
 * never been checked against a person: the launch's console topped out at 1.30
 * units, which is **below the knee** of a 6.80 body (`FIGURE.kneeY` 1.66), so
 * the helmsman could not reach his own wheel; and the fuselage was a capsule
 * 4.40 across, so there was no height at which a 6.80 pilot could sit in it and
 * the model was simply dropped 0.9 into the hull.
 *
 * Every dimension below is now derived from one of two published records and
 * the derivation is written next to it:
 *
 * - **`FIGURE` in `src/avatar.ts`** — every height above the sole and every
 *   segment length of the body that rides these.
 * - **`SEATED` in `src/traffic/contract.ts`** — the same body sitting down,
 *   measured off built geometry by the crowd kit: origin at the seat surface,
 *   hip at y = 0, sole −1.75, crown +3.84, knee z +1.34, toe z +1.97,
 *   shoulder joint y +1.42, and **4.30 of clear width, which is the envelope
 *   and not the 2.60 across the shoulders**.
 *
 * Where the two disagree the player's own body wins, because it is the one that
 * is actually in the seat, and it is measured here rather than assumed: in the
 * `sit` pose it is 1.85 from hip to sole, 3.81 to the crown, 2.38 to the toe and
 * **1.21 behind the hip, because of the rucksack** — half a unit deeper than the
 * crowd's 0.72, which is the number a seat back would have been built to.
 *
 * ## They were built through the monument contract
 *
 * They used to carry their own `craftMaterial`, their own 3-band ramp and their
 * own 0.006 pen, and their masses were a sphere, two capsules and a cone —
 * **smooth-shaded, which is the one thing this world's style cannot use.** It is
 * the same fault `avatar.ts` found and wrote down: `MeshToonMaterial` steps a
 * four-band ramp across a normal, and a smooth normal sweeps it continuously
 * instead. `createContext()` facets everything through `toNonIndexed`, hands out
 * the world's 24 colours and the world's 0.005 pen, and it made the plane
 * *cheaper* rather than dearer — a `CapsuleGeometry(2.2, 9, 4, 16)` is 512
 * triangles of subdivision the ramp cannot use.
 */
import * as THREE from 'three';
import { FIGURE } from './avatar.ts';
import { BODY_SCALE } from './stature.ts';
import { PLANET_RADIUS } from './globe.ts';
import { MAX_SLOPE } from './terrain.ts';
import { createContext } from './monuments/contract.ts';
import type { CraftKind } from './craft/contract.ts';

/**
 * One context, made at import, exactly as `avatar.ts` does it. `createContext`
 * registers its ramp with `theme.ts` so the moods repaint it, so it must be
 * made once and not once per craft.
 */
const ctx = createContext();
const P = ctx.palette;
/**
 * Anything within this of sea level is water.
 *
 * Not zero: `elevationAt` returns land heights that terrain relief will start
 * varying, and a comparison against an exact radius would flicker between land
 * and sea on the shoreline. The lowest ground on the planet is `SHORE_LIP`,
 * four units, which is eight times this.
 */
const SEA_LEVEL_EPSILON = 0.5;

export function isWater(ground: number): boolean {
  return ground <= PLANET_RADIUS + SEA_LEVEL_EPSILON;
}

/**
 * Where the water's surface is taken to be, over the sea's own radius: what a
 * hull's waterline and a swimmer's chest ride on.
 *
 * Not zero, because the sea is not drawn at zero. The water sphere is exact at
 * its vertices and sags 0.39 between them, and the shallows along every coast
 * are lifted 0.35 to 0.75 over it (`LIFT_SHELF`, `LIFT_COAST` in `ocean.ts`),
 * so the surface anyone sees near a shore is about half a unit up. A hull
 * floated at zero sat visibly low in the surf; half a unit reads as afloat in
 * both places, and the half-unit either way is under the width of the pen.
 */
export const WATERLINE = 0.5;

/**
 * **What is not a boat sinks.** A car, a bicycle, a bus or a tractor driven
 * off a quay or down a beach — or one left rolling on alone, or an aircraft
 * come down on the sea — floats for `FOUNDER_FLOAT` seconds at the
 * waterline, then goes down at `FOUNDER_SINK` units a second with its nose
 * dropping to `FOUNDER_NOSE` radians, and at `FOUNDER_TIME` it is gone:
 * whoever was in it is put out swimming at the surface and the vehicle goes
 * back to its site (`FleetLink.sink`). Its way through the water dies over
 * `FOUNDER_DRAG` seconds. A horse is the exception: it stops at the water's
 * edge, as it always did. `player.ts` founders a vehicle with somebody at the
 * controls and `fleet.ts` one going on alone; both read these.
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

// ---------------------------------------------------------------------------
// The numbers every craft is driven by
// ---------------------------------------------------------------------------
//
// The models are `src/craft/`'s. What stays here is how each medium is driven,
// because `player.ts` drives them and the camera, the audio and the fleet read
// the same numbers.

/**
 * A car on the road: cruise and flat out, in units a second — 45 is 128 km/h
 * at this scale's 1.267 units a metre and 75 a sprint no road here is long
 * enough to hold, which is the arcade point of it — and backwards, slowly.
 */
export const CAR_SPEED = 45;
export const CAR_BOOST = 75;
export const CAR_REVERSE = 12;
/** Time constants of the throttle, the brake and the coast, in seconds. */
export const CAR_ACCELERATION_TIME = 1.3;
export const CAR_BRAKE_TIME = 0.45;
export const CAR_COAST_TIME = 2.2;
/**
 * Full lock, radians a second, reached from `CAR_GRIP_SPEED` up: a car does not
 * turn standing still, and a car that turned at full rate from a crawl spun on
 * the spot.
 */
export const CAR_TURN = 1.25;
export const CAR_GRIP_SPEED = 10;
/**
 * How long the wheel takes to go over to a lock, in seconds, and how much of
 * the lock is left at `CAR_BOOST`. The key used to be the lock, on the frame
 * it went down, which is a car that twitches; and full lock at 75 units a
 * second is a 60-unit circle, which at that speed is a spin.
 */
export const CAR_STEER_TIME = 0.15;
export const CAR_FAST_LOCK = 0.6;
/**
 * A car driven into a wall: the share of its speed it comes back off it at,
 * and the speed lost at a stroke that counts as a crash rather than a nudge,
 * in units a second (about a third of the cruise). A crash is told
 * (`PlayerEvent`), so whatever wants to shake, spark or bang can.
 */
export const CAR_BOUNCE = 0.25;
export const CRASH_SPEED = 14;
/**
 * The most a wheel climbs in one go without it being a wall, in units: a kerb
 * is 0.4, a terrace riser four, and a car climbs the first and not the second.
 */
export const CAR_STEP = 1.1;

/**
 * The balloon: it drifts, it does not fly. Its speed along the heading you
 * steer, the most it rises or sinks a second, how fast it turns, and the
 * highest it goes above the sea.
 */
export const BALLOON_SPEED = 10;
export const BALLOON_CLIMB = 9;
/**
 * How the burner and the vent take hold, in seconds: a balloon is slow to
 * start rising and slow to stop. And near the ground it settles rather than
 * drops: the sink is held under this share of the basket's height a second,
 * and never under `BALLOON_TOUCHDOWN`.
 */
export const BALLOON_LIFT_TIME = 1.25;
export const BALLOON_SETTLE = 0.5;
export const BALLOON_TOUCHDOWN = 1.5;
export const BALLOON_TURN = 0.45;
export const BALLOON_CEILING = 2400;

// ---------------------------------------------------------------------------
// Handling, a kind at a time
// ---------------------------------------------------------------------------

const DEG_ = Math.PI / 180;

/**
 * How a vehicle on wheels — or hooves — is driven: `player.ts`'s `drive`
 * reads one of these for whatever it is in, so a bus and a bicycle are the
 * same code with different numbers, and the car's row is the car constants
 * above, unchanged.
 *
 * - `speed`, `boost`, `reverse`: units a second at `W`, with `Shift`, and
 *   backwards.
 * - `accelerationTime`, `brakeTime`, `coastTime`: the ease's time constants.
 * - `turn`, `gripSpeed`, `fastLock`, `steerTime`: the steering law of
 *   `steerWheels` — full lock in radians a second from `gripSpeed` up, what
 *   is left of it at `boost`, and how long the bars go over in.
 * - `pivot`: the share of the turn left standing still. A car has none; a
 *   horse turns on its haunches.
 * - `step`, `slope`: the most it climbs in one go without it being a wall, and
 *   the steepest ground it climbs, as a gradient.
 * - `rough`: the share of its speed it keeps off anything made — off the
 *   carriageway and the paving, on grass, sand or scree.
 * - `lean`: how far a two-wheeler or a rider banks into a turn at full
 *   lateral pull, radians; 0 for a car, whose body rolls out of the turn on
 *   its springs instead (`craft/motion.ts`).
 * - `wheelie`: radians of nose-up a unit a second squared of acceleration
 *   gives a motorbike, and the most of it; 0 for anything else.
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

/**
 * Every road kind's handling. Speeds against the body's own: a walk is 6.5
 * units a second and a run 20 (`avatar.ts`), a car 45.
 *
 * - **Bicycle**: between a run and a car, 26 pedalled and 36 out of the
 *   saddle, slow to wind up and long to coast; it keeps three quarters of it
 *   on grass and a track, climbs a little less than a car, turns tighter and
 *   leans hard into it.
 * - **Motorbike**: as fast as a car and quicker off the mark, leaning further
 *   than anything, the front coming up under a hard throttle.
 * - **Tuk-tuk**: a three-wheeler's thirty, quick to turn, nervous off the road.
 * - **Bus**: slow to go and slower to stop, a wide turn and a long wheelbase's
 *   reluctance to follow it, and a road vehicle off one.
 * - **Tractor**: a walking pace and a half, all of it anywhere, and up a
 *   bank no car takes.
 * - **Jeep**: short of a car on the road and as fast off it, over a kerb and
 *   up a hillside of forty-two degrees.
 * - **Horse**: a canter at `W` and a gallop with `Shift`; it turns standing
 *   still, keeps its pace anywhere and climbs what a hill path climbs.
 */
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
 * How a hull is driven: `sail` in `player.ts`. The launch's row is the boat
 * constants below; the rest, besides their speeds and their turn:
 *
 * - `accelerationTime`, `rudderTime`: the throttle's and the helm's eases.
 * - `astern`: the share of `speed` it backs at.
 * - `heel`: how far it rolls in a turn, radians; `bank` in `player.ts` heels a
 *   displacement hull out of a turn and a planing one into it.
 * - `bow`: how far the bow comes up onto the plane, radians.
 * - `hop`: how far it leaps off the chop at speed, units — a jet ski's; 0
 *   for a hull that sits in the water.
 * - `list`: a constant heel, radians, the wind's in a sail.
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

/**
 * - **Jet ski**: nearly the launch's speed, twice its turn, a quarter of its
 *   wind-up, banked hard into every turn and skipping off the chop.
 * - **Sailboat**: the wind's pace, eighteen and twenty-four with the sheet
 *   hauled in (`Shift`); slow to come round and slow to gather way, heeled
 *   over whatever it does. The wind is constant here: a sail that trims to a
 *   wind needs a wind the world does not have yet.
 */
export const WATER_HANDLING: Partial<Record<CraftKind, WaterHandling>> = {
  jetski: { speed: 40, boost: 76, turn: 2.3, accelerationTime: 0.55, rudderTime: 0.1, astern: 0.3, heel: 0.45, bow: 0.1, hop: 0.35, list: 0 },
  sailboat: { speed: 18, boost: 24, turn: 0.75, accelerationTime: 3.5, rudderTime: 0.45, astern: 0.15, heel: 0.12, bow: 0.02, hop: 0, list: 0.16 },
  submarine: { speed: 16, boost: 26, turn: 0.9, accelerationTime: 2.2, rudderTime: 0.35, astern: 0.3, heel: 0.05, bow: 0.02, hop: 0, list: 0 },
};

/**
 * The submarine under the surface: how fast it dives and rises on the two
 * keys, units a second; how its vertical speed eases; the most it ever goes
 * down, units, which is a tourist boat's and not a warship's; how far it
 * keeps off the floor, over its draft; and how far down it counts as under,
 * for the camera, the wake and getting out — a submarine is left only at the
 * surface.
 *
 * - **Surface**: a slow boat, low in the water, the tower out of it.
 * - **Under**: the climb key (`Space`, or `Shift` with it) brings it up and
 *   the descend key (`C`, `Ctrl`) takes it down, and it holds its depth with
 *   neither; it cannot go through the floor and a rising floor lifts it.
 */
export const SUB_DIVE = 6;
export const SUB_RISE = 7;
export const SUB_VERTICAL_TIME = 0.9;
export const SUB_MAX_DEPTH = 60;
export const SUB_FLOOR_CLEAR = 1.5;
export const SUB_UNDER = 1.2;

/**
 * The helicopter: its cruise and how far backwards, units a second; its climb
 * and descent; its yaw on the pedals, radians a second; the eases of the
 * cyclic (the speed) and the collective (the climb); how far the nose goes
 * down at full cruise and the bank at a full-rate turn; and the highest it
 * goes over the sea. It comes down anywhere flatter than `HELI_LANDING_GRADE`
 * and hovers over water.
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
 * The fastest a kind goes, units a second, with room: what `effects.ts` takes
 * a move for travel rather than a jump by, and the audio's throttle's top.
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

// ---------------------------------------------------------------------------
// A lofted shell
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// The launch
// ---------------------------------------------------------------------------

/**
 * Cruise and full ahead, in the launch's own lengths: five and a bit a second
 * at cruise, twelve flat out — 24 and 55 m/s, a fast launch and a racing one.
 * They were 115 and 250 while the launch was built three times the world's
 * scale, which at its size now would be twenty lengths a
 * second. Oceans are the plane's; the launch is for a coast, a lake and the
 * crossing to the next island, which at these speeds is seconds.
 */
export const BOAT_SPEED = 30;
export const BOAT_BOOST = 70;
/** Rudder, radians per second. A half turn in 2.7 s. */
export const BOAT_TURN = 1.15;
export const BOAT_ACCELERATION_TIME = 1.1;

/**
 * How far inland stepping ashore puts you.
 *
 * **It has to exceed the bow's reach**, because the hull is stopped by land
 * found that far ahead (`HULL_PROBES` in `player.ts`) — step short of that and you disembark into the water you
 * were floating on. It used to also have to clear a 20-unit coastal cliff, and
 * that job is gone: the shore ramps now, so there is no lip to land on.
 *
 * 22 against a bow's reach of 13.5 lands you 8.5 units past the first land the
 * probe found. **Measured in the live world rather than derived**: driving at
 * fifteen real coasts until the hull stopped, land was 14.5 ahead — the bow's
 * reach plus a frame of travel — and `E` put the player on ground **4.0 to 14.2 units
 * above sea level**, every one of them over `SHORE_LIP` and an order of
 * magnitude over `SEA_LEVEL_EPSILON`, which is the test that decides whether
 * you are back in the boat. No case stranded.
 */
export const SHORE_REACH = 22 * BODY_SCALE;

/**
 * The launch as it was built: a small open boat, facing +Z, with the cockpit
 * sole at `y = 0` so the avatar stood on it with no offset, and the helm
 * amidships at `z = 0`.
 *
 * **The console is the point of this model, and it is two boxes because the
 * pose has two heights in it.** It used to be one box 1.30 tall — knee height
 * on a body whose knee is at 1.66 — and `avatar.ts` says so in `brace`'s own
 * comment: *he cannot reach the wheel without kneeling on it*. Measured off the
 * braced pose, the two heights are:
 *
 * - **The hands are at y 2.14 to 2.67, z 0.56 to 0.97, x 1.92 to 2.41.** So the
 *   console's after ledge is 5.0 wide with its top at 2.19 and it runs from
 *   z 0.50 to 1.35: both palms come down on it, 0.05 in, which is a hand
 *   resting on something rather than hovering over it.
 * - **The wheel is what he has to be able to take**, and its hub is at
 *   (0, 3.72, 1.15) on a binnacle whose top is at 3.10. Each hand's own side of
 *   the rim is **1.48 from that shoulder joint against an arm of 2.48 — 60% of
 *   full reach**, and the furthest point of the rim, which is the far side he
 *   would never use, is 93%. The old console's top edge was 155%.
 */
// ---------------------------------------------------------------------------
// The floatplane
// ---------------------------------------------------------------------------

/**
 * Highest the plane will hold: **a little over the clouds**, the deck's base
 * (`CLOUD_BASE`, 1,000) and its tallest banks under it, so the top of the
 * climb is flying over the weather with the land still there below — on the
 * owner's word, 2026-10-02. It was 1.45 radii, a lens calculation that put the
 * whole globe in the frame, and a light aircraft that climbed out of the
 * planet; the whole planet is `M`'s.
 */
export const PLANE_CEILING = 3000;
/**
 * Cruise at the floor and at the ceiling.
 *
 * Speed rides altitude, and that is the whole travel design. Low, 140 crosses
 * Spain in twenty seconds and you can see what you are crossing — it was 380
 * while the plane was three times the world's scale, and at its size now that
 * was a streak rather than a flight. High, over the clouds at the ceiling,
 * 1,500 is the Atlantic in about a minute; it was 3,400 at 2.25 radii, which
 * over the clouds would be a smear. Flying low is scenic, climbing is how you
 * cover an ocean.
 */
export const PLANE_CRUISE_LOW = 140;
export const PLANE_CRUISE_HIGH = 1500;
/**
 * The throttle, `W` and `S`, as a share of the cruise it opens up or closes
 * down: 1.6 times flat out and two thirds of it held back. Flat out used to
 * be the run key's, and the run key climbs now.
 */
export const PLANE_THROTTLE_UP = 0.6;
export const PLANE_THROTTLE_DOWN = 0.35;
/**
 * Rate of turn at full stick once the plane is banked into it, in radians a
 * second: 57 degrees a second, a 360 in 6.5 s with the roll-in, a half turn in
 * 3.3.
 *
 * **It was 0.55, and the plane was not even getting that.** 31.5 degrees a
 * second is a 360 in 11.4 s, and the diagonal normalisation meant for walking
 * took 29% off it whenever `W` was held with `A` — 22 degrees a second, a 360
 * in 16 s and a 1,300-unit circle at the circuit, which is `levers` in
 * `player.ts`. On top of that the chase camera trailed the turn at
 * `RECENTRE_RATE` and took 0.7 s to show two thirds of it, so the first second
 * of full stick turned the view **15 degrees, and 10 with the throttle open**:
 * it barely turned. At 1.0, rolled in by `PLANE_ROLL_TIME` and followed by
 * `TURN_TRAIL`, the first second turns the view 33 degrees either way. (All of
 * these are the update laws stepped at 60 Hz, 2026-09-13, not a browser.)
 *
 * **A rate and not a radius, and that is deliberate** — the opposite of what
 * `camera.ts` holds for the walk, and for the same reason: what the eye reads is
 * the curve against the view, and here the view grows with the speed. At 320
 * units up, 185 units a second at 1.0 is a ground track of 181 units radius under
 * a camera 61 units off the tail (420 and 413 before `PLANE_CRUISE_LOW` came
 * down to 140, 2026-09-24); at the ceiling it is 1,390 units (5 degrees of
 * arc) under a camera that holds the whole globe. Held as a radius it would
 * either spin at the ceiling or be unable to turn over a town.
 */
export const PLANE_TURN = 1.0;
export const PLANE_ACCELERATION_TIME = 2.6;
/** And the throttle closes faster than it opens, so a landing is aimable. */
export const PLANE_LANDING_TIME = 1.2;

/**
 * The climb, as a vertical speed the keys ask for and the plane eases into.
 *
 * **It used to be an altitude the keys multiplied**, 1.15 of itself a second,
 * with the plane chasing it — and a take-off set that altitude to the circuit,
 * 320 units, on its own. So the wheels left the ground and the plane shot up
 * three hundred units with nobody asking, and a tap of the climb key a few
 * hundred up was another hundred. Now the key asks for a rate, the rate is
 * reached over `PLANE_VERTICAL_TIME`, and letting go levels the plane off
 * where it is.
 *
 * The rate is `PLANE_CLIMB_RATE` times the height over the ground, and never
 * under `PLANE_CLIMB_MIN`: near the ground 18 units a second, about seven
 * degrees at the low cruise, and higher up a share of the height a second so
 * the climb still reads as a zoom out of the map — twenty-five over a field
 * to the ceiling in about eleven seconds of the key held, where the old law
 * took five from the circuit and so read as a lurch. Descending is the same law
 * the other way, and it flares: under `PLANE_FLARE` times the height, and no
 * less than `PLANE_TOUCHDOWN`, so a plane let down onto a field arrives at a
 * few units a second rather than at the rate it came down from the clouds.
 */
export const PLANE_CLIMB_MIN = 18;
export const PLANE_CLIMB_RATE = 0.7;
/** Time constant of the vertical speed, in seconds: a pull on the stick builds, and so does letting go. */
export const PLANE_VERTICAL_TIME = 0.7;
export const PLANE_FLARE = 0.6;
export const PLANE_TOUCHDOWN = 4;

/**
 * The light aircraft on the ground: the speed it lifts off at — a take-off run
 * reaches it with the throttle (`W`) or the climb key held, and lifts off by
 * itself there — and the most it taxis at rolling out of a landing. The run
 * opens the throttle for a quarter past it, over `PLANE_RUN_TIME`, so from
 * standing to rotation is 2.6 seconds and 136 units of strip; the wheels then
 * leave it at no climb at all, and it climbs out at `PLANE_CLIMB_MIN` for
 * `PLANE_CLIMB_OUT` seconds whatever the keys say, about forty units, before
 * they have it. Until 2026-10-01 the run needed the climb key held all the
 * way and the plane levelled off a wing's height over the strip when it was
 * let go.
 *
 * **The run has its own time constant because it has to fit its strip.** Over
 * `PLANE_ACCELERATION_TIME` it was 4.2 s and 220 units, and a strip long
 * enough for that, 260 units, fitted beside 874 of the 1,186 towns that keep
 * a plane (`STRIP_LENGTH` in `craft/airstrip.ts`); in the air the throttle
 * keeps its slower ease.
 */
export const PLANE_ROTATE = PLANE_CRUISE_LOW * 0.6;
export const PLANE_RUN_TIME = 1.6;
export const PLANE_TAXI = 30;
export const PLANE_CLIMB_OUT = 3;
/**
 * Steepest ground a plane may be set down on, as rise over run: a field, not
 * a hillside. 12 degrees until 2026-10-01, which refused a good share of the
 * rolling country a landing was aimed at.
 */
export const PLANE_LANDING_GRADE = Math.tan(15 * (Math.PI / 180));

/**
 * Where the floatplane's pilot sat, in the plane's own frame — the seat
 * surface, in the crowd kit's convention. The table below is in that frame,
 * the 6.8-unit body's units, and was scaled by `BODY_SCALE` into the world's.
 *
 * **1.90 is the footwell, not a taste.** The player's own seated figure is 1.85
 * from hip to sole, measured off the built mesh in the `sit` pose; 1.90 leaves
 * the boot 0.05 clear of the cockpit floor at `y = 0`. The crowd's published
 * `SEATED.sole` is 1.75 and would have buried it.
 *
 * Everything else in the cockpit falls out of this one number:
 *
 * ```
 *   cockpit floor      0.00     the plane's own datum
 *   seat surface       1.90     hip
 *   coaming            2.95     seat + 1.05, between the seated waist (+0.78)
 *                               and chest (+1.44): head and shoulders proud
 *   shoulder joint     3.32     seat + FIGURE.shoulderJointY - FIGURE.hipY
 *   eyes               4.78     and the windscreen's top edge is 4.79
 *   crown              5.71     seat + 3.81 measured; the fin clears it at 5.90
 * ```
 */
/**
 * The ring a craft leaves when it arrives or goes: a splash on the water, a
 * puff of dust on the ground. A unit annulus standing on `y = 0`, one unit
 * across and one tall, which `player.ts` scales out and flattens as it fades —
 * so the wall is 18% of the radius at every size, and the ink draws it as the
 * comic's own mark for a splash rather than as a solid disc.
 *
 * Built through the same context as the hulls, so it is the world's cream and
 * the world's pen. Sixteen sides, because the ink is what reads here and the
 * pen draws a line at every one of them.
 */
export function buildSplash(): THREE.Mesh {
  const ring = ctx.ringWall(0.82, 1, 1, P.white, 16);
  ring.name = 'splash';
  ring.castShadow = false;
  ring.receiveShadow = false;
  return ring;
}

/**
 * Published so `player.ts` can put the avatar's hip on the seat without either
 * file restating the other's numbers. `FIGURE.hipY` is where the body's own
 * origin puts the hip; the pose then shifts the whole body, and the seat has to
 * cancel that shift rather than guess it.
 */
export const AVATAR_HIP = FIGURE.hipY;
