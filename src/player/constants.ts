/** The player's tuning numbers: how the body walks, swims, jumps and leans, and how each vehicle is handled. */
import { AVATAR_HEIGHT, FIGURE, RUN_SPEED, WALK_SPEED } from '../avatar.ts';
import { BODY_SCALE } from '../stature.ts';
import { LAND_HEIGHT } from '../globe.ts';
import type { TravelMode } from '../controls.ts';
import { SEAT_EYE } from '../craft/body.ts';
import { isAirKind } from '../craft/contract.ts';
import type { CraftKind } from '../craft/contract.ts';
import {
  BOAT_ACCELERATION_TIME,
  BOAT_BOOST,
  BOAT_SPEED,
  BOAT_TURN,
  ROAD_HANDLING,
  WATER_HANDLING,
} from '../vehicles.ts';
import type { RoadHandling, WaterHandling } from '../vehicles.ts';

// ---- on foot ---------------------------------------------------------------

/** Time constant of the speed ramp, seconds: full speed lands at about three of these. */
export const ACCELERATION_TIME = 0.085;
/** Share of that authority kept in the air. */
export const AIR_CONTROL = 0.25;
/** How fast the avatar swings round to face where it is going, per second. */
export const TURN_SMOOTHING = 11;
/** How fast height settles when the ground drops away under a step. A rise is followed exactly. */
export const HEIGHT_SMOOTHING = 8;

/** Apex of a jump: tied to the coastal cliff and capped against the body, so a 40-unit cliff cannot be jumped. */
export const JUMP_HEIGHT = Math.min(LAND_HEIGHT * 0.45, AVATAR_HEIGHT * 0.6);
/** Seconds to the top. Gravity is derived from it: the arc is the input. */
export const JUMP_RISE = 0.34;
export const GRAVITY = (2 * JUMP_HEIGHT) / (JUMP_RISE * JUMP_RISE);
export const JUMP_SPEED = (2 * JUMP_HEIGHT) / JUMP_RISE;
/** A ridden horse's jump, as the speed it leaves the ground at: about 0.6 of a body at the top. */
export const HORSE_JUMP_SPEED = GRAVITY * 0.35;

/**
 * Out of a vehicle under way. Faster than `BAIL_SPEED` along its bow, getting
 * out is jumping out: the body goes over the side with a share of the
 * vehicle's speed (`BAIL_CARRY`), pushed clear of it (`BAIL_SHOVE`) and lifted
 * a hop (`BAIL_HOP` of a jump), and lands in a roll.
 */
export const BAIL_SPEED = 3;
export const BAIL_CARRY = 0.45;
export const BAIL_SHOVE = 5;
export const BAIL_HOP = 0.45;
/** How hard the landing out of a moving vehicle is read, for the body's roll. */
export const BAIL_LANDING = 1.2;

/** The eye in a seat, over the hip (`SEAT_EYE` in `craft/body.ts`), and standing, over the soles. */
export const SEAT_EYE_UP = SEAT_EYE.up;
export const SEAT_EYE_AHEAD = SEAT_EYE.ahead;
export const RIDE_EYE_AHEAD = SEAT_EYE.rideAhead;
export const STAND_EYE = AVATAR_HEIGHT * 0.93;

/** A drop larger than this is a cliff: the body falls off it instead of gliding down as if it were a ramp. */
export const STEP_DOWN = AVATAR_HEIGHT * 1.2;

/**
 * The most a foot takes in one step without it being a wall, in units, and the
 * steepest ground it walks up at any pace, as rise over run (70 degrees). A
 * rise of more than `STEP_UP` plus `CLIMB_SLOPE` times the ground covered stops
 * the body, in the air as on the ground; stairs are how a terrace is climbed.
 */
export const STEP_UP = 0.6;
export const CLIMB_SLOPE = 2.75;
/** A fall no steeper than this over the ground covered is followed exactly, as a rise is; a steeper one is smoothed. */
export const FOLLOW_SLOPE = CLIMB_SLOPE;

/**
 * The body against a wall: a circle this wide, centred under the player. It is
 * a circle because a body turns on the spot, and as wide as the shoulders (the
 * hanging arms are left out). `camera.ts` reads it for how near a wall can
 * bring the lens.
 */
export const BODY_RADIUS = FIGURE.shoulderHalf;
/** How far forward getting up off a bench steps. */
export const STAND_STEP = BODY_RADIUS + 0.35;

/** Radians of roll at a hard turn, and how much lateral acceleration earns it. */
export const MAX_LEAN = 0.3;
export const LEAN_GAIN = 0.005;
export const LEAN_SMOOTHING = 8;

// ---- vehicles --------------------------------------------------------------

/** Roll into a turn, per vehicle. A plane banks; a launch only heels. */
export const PLANE_BANK = 0.6;
export const BOAT_HEEL = 0.2;
/** How fast the launch's heel follows its rudder. */
export const BANK_SMOOTHING = 4;
/** The plane's roll time constant, seconds: the stick rolls the plane and the roll turns it. */
export const PLANE_ROLL_TIME = 0.2;
/** Steepest the nose is allowed to point while climbing or diving. */
export const MAX_NOSE = 0.5;

/** Directions the boat tries when the shore is in the way, in radians off the bow: sliding along a coast rather than sticking to it. */
export const DEFLECTIONS = [0, 0.55, -0.55, 1.05, -1.05];
/** Bow and shoulders, in radians either side of the direction of travel: three points keep a beam's clearance whatever the bow is doing. */
export const HULL_PROBES = [0, 0.5, -0.5];
/** Past half the hull, how far ahead land stops a boat, in units; it covers a coast lying between the three probe bearings. */
export const HULL_MARGIN = 3.6 * BODY_SCALE;
/** Directions tried when stepping out of a vehicle, the seat's own side first. */
export const STEP_OFF_DIRECTIONS = 16;

/**
 * The ring that marks going into the water, taking off and landing: how long
 * it lives, and how wide it ends, as a share of what made it.
 */
export const SPLASH_TIME = 0.45;
/** A swimmer's ring at its widest, in units. */
export const SWIM_SPLASH = AVATAR_HEIGHT * 0.6;
/** A craft's, as a share of its longer side: a little past the wingtips. */
export const CRAFT_SPLASH = 0.6;
/** Where it starts, as a share of its widest. */
export const SPLASH_START = 1 / 3;
/** How tall its wall is at the start, as a share of its widest, down to a line on the water. */
export const SPLASH_RISE = 0.05;
export const SPLASH_FLAT = 0.05;

export const TAU = Math.PI * 2;

// ---- swimming and diving ---------------------------------------------------

/** How fast a swimmer goes, and how fast with the run key. */
export const SWIM_SPEED = WALK_SPEED * 1.15;
export const SWIM_SPRINT = RUN_SPEED * 0.72;
/** The swimmer's time constant, slower than the walk's: water has to be pushed. */
export const SWIM_ACCELERATION_TIME = 0.45;
/**
 * Diving: how fast the descend key takes a swimmer down and the climb key
 * brings him up, units a second; how fast he drifts back up with neither; and
 * how the vertical speed eases.
 */
export const DIVE_SPEED = 5.5;
export const RISE_SPEED = 6.5;
export const DIVE_BUOYANCY = 0.7;
export const DIVE_EASE = 0.35;
/** How far over the sea floor a diver's surface point stays, units. */
export const DIVE_FLOOR_CLEAR = 1.2;
/** Deeper than this and the swimmer is under the surface, for leaving the water and for the body. */
export const UNDER_FROM = 0.6;
/** The most a diver's body pitches towards where he is going, radians, and a submarine's bow. */
export const DIVE_PITCH = 0.9;
export const SUB_PITCH = 0.3;
/** How far the soles hang under the water's surface: the chest is at the surface. */
export const SWIM_DEPTH = FIGURE.chestY;
/** How fast the body settles to that depth going in, and back onto its feet coming out, per second. */
export const SINK_RATE = 5;
/**
 * The ground a swimmer leaves the water on, over the sea's radius: well over
 * `isWater`'s half unit and well under the four units the lowest shore stands.
 */
export const SWIM_OUT = 1.5;
/** The highest bank a swimmer climbs out onto, over the water's surface. */
export const SWIM_CLIMB_OUT = AVATAR_HEIGHT * 1.6;
/** A landing that comes down at `LANDING_HARD` jumps' speed more than an ordinary jump is the hardest (1). */
export const LANDING_HARD = 1.5;

// ---- wheels, hulls and aircraft -------------------------------------------

/** How fast a car's pitch follows the ground under its two axles. */
export const TILT_SMOOTHING = 10;

/**
 * The launch under way: how far its bow comes up onto the plane at its
 * cruise, radians, and how much of that it gives back flat out; how fast the
 * bow follows; how much higher the hull rides on the plane, in units; the
 * chop's pitch at speed; and the share of the full heel it leans out of a turn
 * when slow.
 */
export const BOW_LIFT = 0.09;
export const BOW_SETTLE = 0.035;
export const BOW_SMOOTHING = 1.5;
export const BOW_RISE = 0.25;
export const CHOP = 0.012;
export const HEEL_OUT = 0.3;

/** The balloon's basket on its pendulum: the pivot as a share of the balloon's height, and how far a turn swings it out. */
export const BALLOON_PIVOT = 0.62;
export const BALLOON_SWING = 0.01;
export const BALLOON_SWING_MAX = 0.05;

/** The plane's floor in the air, over the ground, in units: half a unit keeps the ink of the tyres off the grass. */
export const PLANE_AIR_CLEARANCE = 0.5;
/** Under this height over the ground, descending closes the throttle to an approach speed. */
export const PLANE_APPROACH = 120;
/** A refused landing goes round again: this long climbing at the minimum rate whatever the keys say, seconds. */
export const PLANE_GO_AROUND = 2.5;
/** Seconds between two crashes told, so a car ground along a wall is one bang. */
export const CRASH_QUIET = 0.6;
/** Seconds between two tellings of the same refusal. */
export const REFUSAL_QUIET = 4;
/** A balloon over water holds its basket this far over the surface. */
export const BALLOON_WATER_FLOOR = 3;
/** The balloon's two bodies against a wall: the basket, and the envelope, as shares of the envelope's width. */
export const BALLOON_BASKET = 1 / 9;
export const BALLOON_ENVELOPE = 0.45;
/**
 * Under this over the ground a craft in the air meets everything a car does
 * through `collide`; over it only the roofs still over it, through `collideAloft`.
 */
export const AIR_LOW = AVATAR_HEIGHT;
/**
 * A plane flown into a wall keeps this share of its speed and is turned off it,
 * and climbs away as a refused landing does. `PLANE_WALL` is how wide it meets
 * the wall, as a share of its larger side.
 */
export const PLANE_BOUNCE = 0.35;
export const PLANE_WALL = 0.3;
/** How long a balloon takes to come round to the heading asked for, seconds: it has no rudder, only the wind. */
export const BALLOON_TURN_TIME = 0.8;
/** And a launch's rudder, over to its stop. */
export const RUDDER_TIME = 0.25;

/** The launch as `sail` drives any hull (`WaterHandling` in `vehicles.ts`); the other hulls' rows are in `WATER_HANDLING`. */
export const LAUNCH: WaterHandling = {
  speed: BOAT_SPEED,
  boost: BOAT_BOOST,
  turn: BOAT_TURN,
  accelerationTime: BOAT_ACCELERATION_TIME,
  rudderTime: RUDDER_TIME,
  astern: 0.35,
  heel: BOAT_HEEL,
  bow: BOW_LIFT,
  hop: 0,
  list: 0,
};
export const waterOf = (kind: CraftKind): WaterHandling => (kind === 'boat' ? LAUNCH : WATER_HANDLING[kind] ?? LAUNCH);

export const isAir = isAirKind;
/** The handling a vehicle on wheels or hooves is driven by, or undefined for anything else. */
export const roadOf = (kind: CraftKind): RoadHandling | undefined => ROAD_HANDLING[kind];
/** The keys and the HUD's name for driving each kind: every four-wheeler is driven as a car is. */
export const MODE_OF: Readonly<Record<CraftKind, TravelMode>> = {
  car: 'car',
  van: 'car',
  bus: 'car',
  tractor: 'car',
  jeep: 'car',
  tuktuk: 'car',
  boat: 'boat',
  plane: 'plane',
  balloon: 'balloon',
  bicycle: 'bicycle',
  motorbike: 'motorbike',
  horse: 'horse',
  jetski: 'jetski',
  sailboat: 'sailboat',
  helicopter: 'helicopter',
  submarine: 'submarine',
};
/** The car's handling, which a plane taxis by. */
export const TAXI = ROAD_HANDLING.car!;

/** The pull, speed times turn, that leans a two-wheeler or a rider the whole of its handling's `lean`. */
export const LEAN_PULL = 40;
/** How fast the lean and a wheelie follow the pull and the throttle, per second. */
export const LEAN_EASE = 7;
/** A wheelie's most, radians, and how much of the length behind the middle the rear axle is. */
export const WHEELIE_MAX = 0.3;
export const REAR_AXLE = 0.34;
/** A helicopter's floor over water, in units: its skids are kept this clear of the waves. */
export const HELI_WATER_FLOOR = 2;
/** How fast a helicopter's nose and bank follow its speed and turn, per second. */
export const HELI_ATTITUDE_EASE = 2.5;
