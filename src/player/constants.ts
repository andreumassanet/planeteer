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
  PLANE_CRUISE_HIGH,
  PLANE_VERTICAL_TIME,
  PLANE_ROTATE,
  ROAD_HANDLING,
  WATER_HANDLING,
} from '../vehicles.ts';
import type { RoadHandling, WaterHandling } from '../vehicles.ts';

// ---- on foot ---------------------------------------------------------------

/** Time constant of the speed ramp, seconds: full speed lands at about three of these. */
export const ACCELERATION_TIME = 0.085;
/** Share of that authority a push keeps in the air; let go, the body keeps the way it jumped. */
export const AIR_CONTROL = 0.6;
/** How fast the avatar swings round to face where it is going, per second, and the least turn rate, radians a second, it ever swings at. */
export const TURN_SMOOTHING = 20;
export const TURN_MIN_RATE = 7;
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
/**
 * The longest step, seconds, the body on foot and a vehicle on the road are
 * moved in: a longer frame is cut into equal steps no longer than this, so the
 * riser test and the fall see the same travel at 10 frames a second as at 60.
 * The riser test also measures its run as at least this step's travel, so a
 * faster frame is no stricter than this one.
 */
export const MOVE_STEP = 1 / 60;
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
/** The plane's control surfaces' time constant, seconds. */
export const PLANE_ROLL_TIME = 0.2;
/**
 * The plane's roll in travel, a critically damped spring at this rate a
 * second (`spring`): into a turn and out of it the bank eases, with no snap as
 * a key goes down or comes up, about two thirds of the way in 0.3 s. The stick
 * rolls the plane and the roll turns it.
 */
export const PLANE_ROLL_SPRING = 7;
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
/**
 * Wading: a body walks on the sea floor until the water is `SWIM_DEPTH` deep,
 * where a swimmer's soles hang, so it swims without moving; it stands again
 * where the floor comes back within `WADE_RISE` of that. Wading it slows, to
 * `WADE_SLOW` of its pace at the deepest, and it jumps only in water shallower
 * than `WADE_JUMP`.
 */
export const WADE_RISE = 0.45;
export const WADE_SLOW = 0.45;
export const WADE_JUMP = AVATAR_HEIGHT * 0.25;
/** A landing that comes down at `LANDING_HARD` jumps' speed more than an ordinary jump is the hardest (1). */
export const LANDING_HARD = 1.5;

// ---- wheels, hulls and aircraft -------------------------------------------

/** How fast a car's pitch follows the ground under its two axles. */
export const TILT_SMOOTHING = 10;

/**
 * The launch under way: how far its bow comes up onto the plane at its
 * cruise, radians, and how much of that it gives back flat out; how fast the
 * bow follows; how much higher the hull rides on the plane, in units; and the
 * share of the full heel it leans out of a turn when slow.
 */
export const BOW_LIFT = 0.09;
export const BOW_SETTLE = 0.035;
export const BOW_SMOOTHING = 1.5;
export const BOW_RISE = 0.25;
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
/**
 * An aircraft wrecked rather than knocked: into a wall faster than
 * `WRECK_INTO` units a second along the wall's normal, or into the ground
 * faster than that downwards, it explodes (`exploded`) and the body is thrown
 * out (`EJECT_RISE` up, `EJECT_BACK` back from the impact). In travel the
 * ground `WRECK_PROBE` ahead or more is asked: a face steeper than
 * `WRECK_SLOPE` (rise over run) that the climb will not clear is the ground.
 */
export const WRECK_INTO = 25;
export const WRECK_PROBE = 4;
export const WRECK_SLOPE = 1;
export const EJECT_RISE = JUMP_SPEED * 3;
export const EJECT_BACK = JUMP_SPEED;
/**
 * An aircraft meeting the water harder than a ditching (sinking faster than
 * `PLUNGE_SINK` units a second, or going faster than `PLUNGE_SPEED`, or at any
 * attitude a ditching would not take) goes in nose first (`plunged`) and
 * founders at once, its way gone over `FOUNDER_DRAG`.
 */
export const PLUNGE_SINK = 10;
export const PLUNGE_SPEED = 120;
/**
 * Seconds of its flight ahead a plane in travel looks at the ground, so a
 * ridge is climbed for before it arrives rather than snapped over.
 */
export const PLANE_LOOK_AHEAD = [0.4, 0.9, 1.6] as const;
/**
 * The vertical speed's critically damped spring in travel (`spring`), a
 * second: two thirds of the way in `PLANE_VERTICAL_TIME`, with no kink in the
 * nose as a key goes down. And the climb rate the nose is drawn from, eased
 * by the same law, so the ground lifting the plane never jerks the nose.
 */
export const PLANE_VERTICAL_SPRING = 2.15 / PLANE_VERTICAL_TIME;
export const PLANE_NOSE_SPRING = 9;

// ---- full control (`aerobatics.ts`) ------------------------------------------
//
// Speeds are given at the low air; aloft each one is scaled by `airAt`, which
// rises by `AERO_THIN` at the ceiling, by the square of the share of it: the
// plane is a little faster high up, never travel's ocean-crossing speed.

export const AERO_THIN = 0.5;
/** The physics' fixed step, seconds: a frame is cut into as many as it needs, all of this length or shorter. */
export const AERO_STEP = 1 / 120;
/** How fast the stick turns the plane at full authority, radians a second: pitch, roll, and the rudder's yaw. */
export const AERO_PITCH_RATE = 1.5;
export const AERO_ROLL_RATE = 2.4;
export const AERO_YAW_RATE = 0.4;
/** How fast the control surfaces follow the keys, per second: a key eases the rate in and out. */
export const AERO_CONTROL_EASE = 6;
/** The pull of gravity on a plane in full control, units a second squared: about one and a half the true one at this scale. */
export const AERO_GRAVITY = 26;
/**
 * The thrust at full throttle, units a second squared, in the low air. The
 * drag is the square of the airspeed, sized so that full throttle in level
 * flight tops out at `PLANE_CRUISE_LOW * (1 + PLANE_THROTTLE_UP)`; no throttle
 * key holds `AERO_NEUTRAL` of it, which settles at the cruise; `S` closes it
 * to `AERO_IDLE`, a glide.
 */
export const AERO_THRUST = 60;
export const AERO_NEUTRAL = 1 / 2.56;
export const AERO_IDLE = 0.04;
/** How fast the throttle follows `W` and `S`, per second. */
export const AERO_THROTTLE_EASE = 1.5;
/** Pulling hard bleeds speed: this much of the airspeed a second at full elevator. */
export const AERO_PULL_DRAG = 0.15;
/** No step changes the airspeed by more than this, units a second squared, whatever the forces say. */
export const AERO_MAX_ACCEL = 160;
/** The hard ceiling on the airspeed, units a second: the relay's own figure for the fastest plane. */
export const AERO_MAX_SPEED = PLANE_CRUISE_HIGH * 2.2;
/**
 * The airspeed the wings carry the plane's whole weight at, in the low air
 * (the take-off speed, `PLANE_ROTATE`); slower, the lift falls with the square
 * of the speed. Under `AERO_STALL` of it the wing stalls, keeps only
 * `AERO_STALL_LIFT` of what it had, and the nose drops at up to `AERO_STALL_DROP`
 * radians a second.
 */
export const AERO_LIFT_SPEED = PLANE_ROTATE;
export const AERO_STALL = 0.75;
export const AERO_STALL_LIFT = 0.35;
export const AERO_STALL_DROP = 1.1;
/** The fastest gravity or the lift may turn the flight path, radians a second, and the least airspeed that turn is divided by. */
export const AERO_PATH_RATE = 1.2;
export const AERO_PATH_FLOOR = 30;
/** A banked wing turns the plane about the vertical: this many radians a second on a knife edge with full lift. */
export const AERO_BANK_TURN = 0.55;
/** With the stick let go in a gentle bank (under `AERO_ASSIST_BANK`), the wings come back level at this rate per radian of bank. */
export const AERO_LEVEL_ASSIST = 0.9;
export const AERO_ASSIST_BANK = 0.9;
/** The least share of the stick's authority left at no airspeed. */
export const AERO_MIN_AUTHORITY = 0.3;
/** Levelling off (`level`): how hard the wings and the nose are pulled back, and how near level counts as done, radians. */
export const AERO_RECOVER_GAIN = 2.5;
export const AERO_RECOVERED = 0.06;
/** A touchdown in full control: the most bank and the most nose up or down the gear takes, radians. */
export const AERO_LAND_BANK = 0.35;
export const AERO_LAND_PITCH = 0.25;
/** Where the plane turns about in full control, as a share of its height over its wheels. */
export const AERO_PIVOT = 0.45;
/** Knocked off the ground or a wall in full control: the nose this far up, wings level, radians. */
export const AERO_KNOCK_NOSE = 0.2;
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
  list: 0,
  coastTime: 3.2,
  brakeTime: 1,
  grip: 6.5,
  carve: 0.5,
  still: 0.3,
  slide: 0,
  kick: 0.7,
  jump: 0,
  punch: 0.5,
  bySail: false,
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
/**
 * Off a crest: over `CREST_FROM` of its cruise and climbing at least
 * `CREST_CLIMB` units a second, a vehicle on wheels leaves the ground when the
 * ground under it falls away `CREST_DROP` units a second faster than its nose
 * was climbing, taking that climb with it, no more than `CREST_RISE`. The
 * least climb keeps the mesh's small kinks from bouncing it. In the air its
 * nose follows its arc at `AIR_TILT_EASE` a second, up to `AIR_TILT` of `MAX_NOSE`.
 */
export const CREST_FROM = 0.4;
export const CREST_CLIMB = 4;
export const CREST_DROP = 6;
export const CREST_RISE = 16;
export const AIR_TILT_EASE = 3;
export const AIR_TILT = 0.6;
/** A helicopter's floor over water, in units: its skids are kept this clear of the waves. */
export const HELI_WATER_FLOOR = 2;
/** How fast a helicopter's nose and bank follow its speed and turn, per second. */
export const HELI_ATTITUDE_EASE = 2.5;

// ---- the course's pull (`PlayerInput.assist`) --------------------------------
//
// In travel an aircraft handed a target is eased onto it while the keys leave
// the heading or the height alone; a key held takes that axis back at once.

/** Nearer than this to the target, units, the pull lets go: the ring is being flown through. */
export const ASSIST_NEAR = 60;
/**
 * The turn onto the target, per radian of bearing error, per second: the arc
 * that passes through it turns at `2 v / d`, held between these two so a far
 * ring is lined up on well before it is reached (the floor settles the bearing
 * in about a second, a third of the way to a course's next ring) and a near
 * one does not snatch the bank. Against the roll's `PLANE_ROLL_SPRING` the
 * ceiling is still short of overshooting.
 */
export const ASSIST_GAIN_MIN = 2;
export const ASSIST_GAIN_MAX = 3;
/** The most of the plane's full bank the pull may take, so a player's touch always reads over it. */
export const ASSIST_BANK = 0.6;
/**
 * The climb onto the target's height, per unit of height, per second: the
 * line that arrives level with it climbs at `v / d`, taken `ASSIST_LEAD` times
 * early and held between these two.
 */
export const ASSIST_LEAD = 1.5;
export const ASSIST_RISE_MIN = 0.5;
export const ASSIST_RISE_MAX = 1.2;
/** The most of a helicopter's full yaw rate the pull may take. */
export const HELI_ASSIST_TURN = 0.7;
