import * as THREE from 'three';
import type { Avatar } from './avatar.ts';
import { AVATAR_HEIGHT, FIGURE, RUN_SPEED, WALK_SPEED, buildAvatar } from './avatar.ts';
import { BODY_SCALE } from './stature.ts';
import type { World } from './geo.ts';
import { LAND_HEIGHT, PLANET_RADIUS, groundRadius } from './globe.ts';
import { unitAt } from './sphere.ts';
import { MAX_SLOPE } from './terrain.ts';
import { slide } from './scenery/solids.ts';
import type { Body, Walls } from './scenery/solids.ts';
import type { TravelMode } from './controls.ts';
import type { CraftKind, CraftModel, PlayerState, Seat, WirePose } from './craft/contract.ts';
import {
  ALTITUDE_RATE,
  AVATAR_HIP,
  BALLOON_CEILING,
  BALLOON_CLIMB,
  BALLOON_SPEED,
  BALLOON_TURN,
  BOAT_ACCELERATION_TIME,
  BOAT_BOOST,
  BOAT_SPEED,
  BOAT_TURN,
  CAR_ACCELERATION_TIME,
  CAR_BOOST,
  CAR_BRAKE_TIME,
  CAR_COAST_TIME,
  CAR_GRIP_SPEED,
  CAR_REVERSE,
  CAR_SPEED,
  CAR_STEP,
  CAR_TURN,
  CLIMB_RATE,
  PLANE_ACCELERATION_TIME,
  PLANE_BOOST,
  PLANE_CEILING,
  PLANE_CIRCUIT,
  PLANE_CRUISE_HIGH,
  PLANE_CRUISE_LOW,
  PLANE_FLOOR,
  PLANE_LANDING_GRADE,
  PLANE_LANDING_TIME,
  PLANE_ROTATE,
  PLANE_SINK,
  PLANE_TAXI,
  PLANE_TURN,
  SHORE_REACH,
  WATERLINE,
  buildSplash,
  isWater,
} from './vehicles.ts';

/**
 * Time constant of the speed ramp. Speed approaches its target exponentially,
 * so full speed lands at about three of these: ~0.25 s. Stepping straight from
 * 0 to 45 was the single thing that made the old controller feel like a cursor
 * rather than a body.
 */
const ACCELERATION_TIME = 0.085;
/** Fraction of that authority you keep in the air. Momentum has to mean something. */
const AIR_CONTROL = 0.25;
/** How fast the avatar swings round to face where it is going. */
const TURN_SMOOTHING = 11;
/**
 * How fast height settles when the ground drops away under a step.
 *
 * Only drops: a rise is followed exactly, on the frame it happens. When the
 * only height change on the planet was the 20-unit step at a coastline, one
 * smoothing constant for both directions was fine. With terrain relief a slope
 * is the normal case, and running up a 1-in-2 one asks the ground to rise at
 * half the run — 65 units a second at the 130 it was when this was found, which
 * this lagged by roughly 7 units, so the avatar walked a mountainside buried to
 * the knees. At the 90 of 2026-09-13 it would still have been about 5, and at
 * today's 10 about half a unit. There is nothing to smooth there anyway:
 * ground that rose under your feet is ground you are already standing on.
 */
const HEIGHT_SMOOTHING = 8;

/**
 * Apex of a jump.
 *
 * Tied to the coastal cliff so it keeps clearing an ordinary step as that
 * number moves, and capped against the body so it stays a jump rather than a
 * pogo: 0.6 of a person, about a metre, which is a game's jump and not a
 * real one's half. The cap is what guarantees the second half of the rule: a
 * 40-unit cliff must not be climbable by jumping at it.
 */
const JUMP_HEIGHT = Math.min(LAND_HEIGHT * 0.45, AVATAR_HEIGHT * 0.6);
/** Seconds to the top. Gravity is derived from it, not chosen: the arc is the input. */
const JUMP_RISE = 0.34;
const GRAVITY = (2 * JUMP_HEIGHT) / (JUMP_RISE * JUMP_RISE);
const JUMP_SPEED = (2 * JUMP_HEIGHT) / JUMP_RISE;

/**
 * A drop larger than this is a cliff: you come off it and fall, instead of
 * gliding down as if the ground were a ramp. Rises are still absorbed by the
 * smoothing, which is what lets you walk up a hillside without it reading as a
 * wall. A little over the body's height: a drop you would step off rather
 * than jump from is the most a foot can glide down.
 */
const STEP_DOWN = AVATAR_HEIGHT * 1.2;

/**
 * The most a foot takes in one step without it being a wall, in units, and
 * the steepest ground it walks up at any pace, as rise over run.
 *
 * **A person is 3.77 units, and a terrace is four.** Following every rise on
 * the frame it happened was right while a person was 6.8 units and a terrace
 * came to his hip (until 2026-09-24, `stature.ts`); at his size now it is a
 * man stepping straight up a wall his own height. So a
 * rise of more than `STEP_UP` plus `CLIMB_SLOPE` times the ground covered is
 * a wall and stops him, in the air as on the ground — a jump does not clear it
 * either — and he takes the stairs, which `floor.ts` lays wherever a street
 * crosses a riser. `STEP_UP` passes a stair's riser with room to spare, and
 * `CLIMB_SLOPE` is 70 degrees, so every hillside the relief makes is still
 * walked up and only a made face is a wall.
 */
const STEP_UP = 0.6;
const CLIMB_SLOPE = 2.75;

/**
 * The body against a wall: a circle this wide, centred under the player.
 *
 * A circle because a body turns on the spot, and a shape that turned with it
 * would catch on the wall it was turning away from. This wide because a circle
 * has to hold the widest thing the figure has, and that is the shoulder mass —
 * `FIGURE.shoulderHalf`, 1.30, deliberately wider than the chest. The hanging
 * arms reach a little further, to 1.52 (`shoulderX` 1.24 plus the upper arm's
 * 0.28), and are left out on purpose: an elbow brushing a wall should not stop
 * a walk, and those 0.22 units a side would take 0.44 off every gap between two
 * houses. `camera.ts` reads it too, for how near a wall can bring the lens.
 */
export const BODY_RADIUS = FIGURE.shoulderHalf;

/** Radians of roll at a hard turn, and how much lateral acceleration earns it. */
const MAX_LEAN = 0.3;
const LEAN_GAIN = 0.0016;
const LEAN_SMOOTHING = 8;

/** Roll into a turn, per vehicle. A plane banks; a launch only heels. */
const PLANE_BANK = 0.6;
const BOAT_HEEL = 0.2;
/** How fast the launch's heel follows its rudder. */
const BANK_SMOOTHING = 4;
/**
 * How long the plane takes to roll into a bank, and therefore into a turn: the
 * time constant of the one ease between the stick and the heading, 95% of the
 * way in 0.6 s.
 *
 * **The bank turns the plane.** The turn used to be the key itself —
 * `-move.x * PLANE_TURN`, full rate on the first frame — with the bank eased
 * after it out of the turn rate, so the heading snapped and the wings followed a
 * quarter of a second late, and **the wrong way**: `bank` gave a left turn a
 * positive roll, which in this basis leans the plane right, outward, a skid. The
 * walk's lean had the minus sign and the craft's never did. Now the stick rolls
 * the plane, the turn rate is read off the roll, and the attitude *is* the turn,
 * the way the nose following `climbRate` is the climb.
 */
const PLANE_ROLL_TIME = 0.2;
/** Steepest the nose is allowed to point while climbing or diving. */
const MAX_NOSE = 0.5;

/**
 * Directions the boat tries when the shore is in the way, in radians off the
 * bow. Sliding along a coast rather than sticking to it is the difference
 * between a hull and a wall.
 */
const DEFLECTIONS = [0, 0.55, -0.55, 1.05, -1.05];
/**
 * Bow and shoulders, in radians either side of the direction of travel.
 *
 * Probing one point ahead is not enough, and the failure is specific: as soon
 * as the bow swings parallel to a coast, a single forward probe sees open water
 * and the hull glides along half a unit from a 20-unit cliff, through it. Three
 * points keep a beam's worth of clearance whatever the bow is doing.
 */
const HULL_PROBES = [0, 0.5, -0.5];
/**
 * Past half the hull, how far ahead land stops a boat, in units. It absorbs a
 * coast lying between the three bearings `HULL_PROBES` samples, which is a fact
 * about the sampling and not about the hull: the old launch's margin, at the
 * person's scale.
 */
const HULL_MARGIN = 3.6 * BODY_SCALE;
/** Directions tried when stepping out of a vehicle, the seat's own side first. */
const STEP_OFF_DIRECTIONS = 16;
/** A wheel's radius, near enough, for how fast the named wheels of a model turn. */
const WHEEL_RADIUS = 0.6;

/**
 * The ring that marks going into the water, taking off and landing: how long
 * it lives, and how wide it ends, as a share of what made it. It is sized to
 * the thing that disturbed the water or the dust — a swimmer's body, an
 * aircraft's span — so it reads as that and not as an effect of its own: a
 * fixed ring sized for a hull stood several bodies wide round a swimmer.
 */
const SPLASH_TIME = 0.45;
/** A swimmer's ring at its widest, in units: a body's length lying down, across. */
const SWIM_SPLASH = AVATAR_HEIGHT * 0.6;
/** A craft's, as a share of its longer side: a little past the wingtips. */
const CRAFT_SPLASH = 0.6;
/** Where it starts, as a share of its widest. */
const SPLASH_START = 1 / 3;
/** And how tall its wall is at the start, as a share of its widest, down to a line on the water. */
const SPLASH_RISE = 0.05;
const SPLASH_FLAT = 0.05;

const TAU = Math.PI * 2;

/**
 * Afloat: how fast a swimmer goes, and how fast with the run key — half a walk
 * and most of one. A person in the water is slow, and the sea is wide; the
 * launches off every coastal town are how it gets crossed.
 */
const SWIM_SPEED = WALK_SPEED * 0.5;
const SWIM_SPRINT = WALK_SPEED * 0.8;
/** The swimmer's time constant, slower than the walk's: water has to be pushed. */
const SWIM_ACCELERATION_TIME = 0.35;
/**
 * How far the soles hang under the water's surface: the chest is at the
 * surface, so it is the chest's own height. `position` rides the surface while
 * swimming and the body hangs this far under it (`Player.sink`).
 */
export const SWIM_DEPTH = FIGURE.chestY;
/** How fast the body settles to that depth going in, and back onto its feet coming out, per second. */
const SINK_RATE = 5;
/**
 * The ground a swimmer leaves the water on, over the sea's radius: over this
 * is land. Well over `isWater`'s half unit, and well under the four units the
 * lowest shore stands (`SHORE_LIP`), so neither a ripple on the shelf nor the
 * lip itself can leave a swimmer flickering between the two.
 */
const SWIM_OUT = 1.5;
/**
 * The highest bank a swimmer climbs out onto, over the water's surface. The
 * shore's lip is four; a town's quay is a wall of twenty, and a swimmer who
 * climbed that out of the sea would be climbing a wall no foot can.
 */
const SWIM_CLIMB_OUT = AVATAR_HEIGHT * 1.6;
/**
 * The swim is the walk cycle, slowed and laid forward: there is no swimming
 * clip in the cast, and a body pitched forward from the chest with its legs
 * working slowly under the surface reads as swimming from where the camera is.
 * Radians of pitch at rest (treading water) and at full speed, and the share
 * of the walk's cadence the legs keep.
 */
const SWIM_PITCH_REST = 0.18;
const SWIM_PITCH_MOVING = 1.0;
const SWIM_CADENCE = 0.55;

/** How fast a car's pitch follows the ground under its two axles. */
const TILT_SMOOTHING = 10;
/** How far the body of a car rolls in a hard turn, radians. */
const CAR_ROLL = 0.05;

/**
 * The plane's floor in the air, over the ground, in units: its wheels are on
 * its own `y = 0`, so anything above zero is flying, and half a unit keeps the
 * ink of the tyres off the grass.
 */
const PLANE_AIR_CLEARANCE = 0.5;
/** Where a refused landing climbs back to, over the ground. */
const PLANE_BOUNCE = 60;
/**
 * Seconds between two tellings of the same refusal: held down over the sea,
 * the plane goes round again every time it gets low, and a toast a second is
 * noise.
 */
const REFUSAL_QUIET = 4;
/** A balloon over water holds its basket this far over the surface: it cannot come down on it. */
const BALLOON_WATER_FLOOR = 3;

/**
 * What the player just did, or was refused, for whoever tells the player so.
 *
 * - `swim`, `ashore`: into the water on foot, and back out of it.
 * - `took-off`, `landed`: a plane or a balloon leaving the ground and coming back to it.
 * - `water-refused`, `steep-refused`: a plane let down onto the sea, or onto a
 *   hillside, which goes round again.
 */
export type PlayerEvent = 'swim' | 'ashore' | 'took-off' | 'landed' | 'water-refused' | 'steep-refused';

export interface PlayerInput {
  move: { x: number; y: number };
  run: boolean;
  jump: boolean;
  /** Tangent direction the camera faces. Movement on foot is relative to this. */
  heading: THREE.Vector3;
  /** Held, in the air: climb and descend. Optional; see `Player.controls`. */
  climb?: boolean;
  dive?: boolean;
}

/**
 * The vehicle you are in, handed over by `fleet.ts`: which one and which seat,
 * its model, and its own group, which rides in the player's frame while he
 * holds it and goes back to the fleet when he lets go.
 */
export interface Ride {
  vehicle: string;
  seat: number;
  model: CraftModel;
  group: THREE.Object3D;
}

export interface Player {
  object: THREE.Group;
  /**
   * World position; its length is the distance to the planet's centre. The
   * feet on foot, the water's surface while swimming (the body hangs `sink`
   * under it), and the vehicle's own origin while seated.
   */
  position: THREE.Vector3;
  /** Heading, always tangent to the surface. In a vehicle it is the bow. */
  forward: THREE.Vector3;
  up: THREE.Vector3;
  /** Current ground speed in units/s. Used by the HUD and the walk cycle. */
  velocity: number;
  /** True while off the ground: a jump, a fall, and the whole of a flight. */
  airborne: boolean;
  /** On foot, swimming, or in a seat: `PLAYER_STATES`, which is what the wire carries. */
  state: PlayerState;
  /** The same, as the keys and the HUD read it: which vehicle, and whether you are driving it. */
  mode: TravelMode;
  /** The vehicle and seat you are in, or null. */
  ride: Readonly<Pick<Ride, 'vehicle' | 'seat' | 'model'>> | null;
  /** A plane or a balloon standing on the ground, which is where it can be left. */
  grounded: boolean;
  /** How far the soles are under `position`, along `up`: 0 standing, `SWIM_DEPTH` afloat. */
  sink: number;
  /** Units above sea level. The camera reads it to open the view out. */
  altitude: number;
  /**
   * Held intent in the air, written by whoever reads the keyboard: +1 climb,
   * -1 descend.
   *
   * `PlayerInput` carries only what walking needs, and it is built in `main.ts`.
   * Rather than ask that loop to grow, the camera rig fills this in: `rig.aim`
   * is already the one call that receives both the raw input and the player,
   * and it is already where input becomes intent. The optional fields on
   * `PlayerInput` do the same job if the loop ever wants to pass them straight
   * through.
   */
  controls: { lift: number };
  update(dt: number, input: PlayerInput): void;
  /**
   * Show or hide the body, for first person.
   *
   * It lives here rather than in `camera.ts` because this file is the only one
   * that knows which object is the body: the camera used to find it by name,
   * which meant a rename in `avatar.ts` broke first person into a face drawn
   * across the whole screen with nothing to say where it came from. A method
   * cannot go quietly missing. A seat inside a closed cab keeps it hidden
   * whatever this says (`Seat.shown`).
   */
  setBodyVisible(visible: boolean): void;
  /** Teleport. Leaves the player in a fully consistent state in one call, on foot or swimming. */
  goTo(lat: number, lon: number): void;
  /** Into a seat, with the vehicle standing at `pose`. */
  board(ride: Ride, pose: WirePose): void;
  /**
   * Out of the seat, beside the vehicle: the pose it is left at, or null where
   * nobody can step out — a plane in flight, a balloon aloft. The vehicle's
   * group is taken off the player; whoever handed it over puts it back.
   */
  leave(): WirePose | null;
  /** Where the vehicle is while seated, or the body on foot: nine numbers, see `WirePose`. */
  pose(out: WirePose): WirePose;
  /** A passenger is carried: stand the vehicle, and him in it, at a pose somebody else drives. */
  carry(pose: WirePose): void;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
/** Frame-rate independent version of `x += (target - x) * rate`. */
const approach = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

/**
 * The movement keys as a vehicle reads them: two levers, not a direction.
 *
 * `input.ts` scales a diagonal to unit length, and on foot that is right — `W`
 * and `A` together are one direction, and a diagonal must not be faster than a
 * straight line. In a vehicle they are two separate controls, the stick (`A`/`D`)
 * and the throttle (`W`/`S`), and the normalisation coupled them: holding `W`
 * to go faster and `A` to turn gave each 0.707 of itself, so opening the
 * throttle took 29% off the turn and turning took 29% off the throttle. The
 * plane's 0.55 was a 0.39 for anyone flying with `W` held.
 *
 * This stretches the vector along its own direction until its longer component
 * is as long as the whole was: a key held alone is untouched, and two held
 * together come back as exactly 1 each. For anything but keys it is the usual
 * disc-to-square map.
 */
function levers(move: { x: number; y: number }, out: { x: number; y: number }): { x: number; y: number } {
  const longer = Math.max(Math.abs(move.x), Math.abs(move.y));
  const stretch = longer > 1e-9 ? Math.hypot(move.x, move.y) / longer : 0;
  out.x = move.x * stretch;
  out.y = move.y * stretch;
  return out;
}

const isAir = (kind: CraftKind): boolean => kind === 'plane' || kind === 'balloon';
const isRoad = (kind: CraftKind): boolean => kind === 'car' || kind === 'van';

export interface PlayerOptions {
  /**
   * How high the ground *people made* stands here, as a radius, or 0 where
   * there is none: a town's floor and a road's carriageway.
   *
   * **The player used to walk at `elevationAt` and nothing built does.** The
   * paving is a plinth `GROUND_LIFT` over the relief and the ribbon a
   * carriageway at `RIBBON_LIFT`, so a man walking through his own high street
   * was buried to the ankle in it and through a road to the shin — while the
   * town's own figures stood *on* the floor, because `spotAt` puts them there.
   * Both lifts were capped by exactly that, and this is what lets them stop
   * being capped by it. A car drives on the same surface.
   *
   * It is a callback and not an import for the reason `groundAt` is one in
   * `main.ts`: the two surfaces belong to `settlements.ts` and `roads.ts`, both
   * of which are streamers that know what is *standing*, and neither is
   * something a controller should be reaching into. Omit it and the player walks
   * the relief exactly as he did before, which is what `pnpm check` and any
   * headless caller get.
   */
  madeHeightAt?: (point: THREE.Vector3) => number;
  /**
   * Pushes a body of `radius` out of every building it overlaps at `point`:
   * the world-space displacement, tangent to the ground, into `push`, and
   * whether anything was hit. Only the point's direction is meaningful.
   *
   * **This is what makes a town something you walk round.** It answers for one
   * position and `slide` in `scenery/solids.ts` does the rest — the sub-steps,
   * and taking the into-wall part out of the motion — so `push` has to be the
   * *whole* clearing displacement and not a unit normal: its direction is the
   * wall's normal, and the slide is read off it. It is asked whether the player
   * is moving or not, and in the air too: the jump clears a small house and a
   * wall is a wall at any height. A car and a taxiing plane ask it with their
   * own width; a boat and anything in the air never ask. Omit it and nothing is
   * solid, which is what a headless caller gets.
   */
  collide?: (point: THREE.Vector3, radius: number, push: THREE.Vector3) => boolean;
  /**
   * The nearest point to `point` where a body of `radius` stands clear of every
   * building, into `out`; false when `point` already is. Only the direction of
   * either point is read.
   *
   * The pushes settle a body that walked into a wall. They cannot settle one
   * that was *put* inside a building — a teleport, stepping out of a car, a
   * town raised round somebody standing still — because from inside a terrace
   * there is no one wall to push off. So a frame that hit anything ends by
   * asking this, and `goTo` and `leave` ask it on arrival.
   */
  freeSpotNear?: (point: THREE.Vector3, radius: number, out: THREE.Vector3) => boolean;
  /**
   * Told what the player just did, or was refused: see `PlayerEvent`. The
   * state machine is here and the words are the HUD's, so this is the whole of
   * what passes between them. Never called by `goTo`: a teleport is not a
   * ride.
   */
  onEvent?: (event: PlayerEvent) => void;
  /**
   * A foot came down, on foot: once per half cycle of the gait, with `weight`
   * the speed as a multiple of a walk. For the footsteps; nothing else reads it.
   */
  onStep?: (weight: number) => void;
  /** Back on the ground after a jump or a fall, with the speed it landed at. */
  onTouchdown?: (speed: number) => void;
}

export function createPlayer(
  world: World,
  startLat: number,
  startLon: number,
  options: PlayerOptions = {},
): Player {
  const avatar: Avatar = buildAvatar();

  /**
   * Nested groups, and the nesting is what keeps the modes from fighting.
   * `object` carries the position and the surface frame — the part that is true
   * whatever you are doing. `craft` carries everything local to the ride: the
   * roll of a turn, the nose of a climb, a boat's swell. The body and the
   * vehicle you hold are siblings inside it, so a bank rolls the pilot with the
   * plane without anything being reparented mid-flight.
   */
  const object = new THREE.Group();
  const craft = new THREE.Group();
  object.add(craft);
  /**
   * One group between the craft and the body, carrying nothing but where the
   * body is *mounted*.
   *
   * It exists because a seat is the vehicle's number and a pose is the body's,
   * and neither file may restate the other's. A model publishes its seats with
   * the hip on the seat surface — the crowd kit's convention, and the one that
   * means no vehicle has to own a leg length — and `sit` shifts the whole body
   * by `avatar.group.position` for reasons of its own. `seatOn` cancels that
   * shift and puts the hip on the seat, so a change to either end cannot
   * silently bury the driver in his own cab, which is exactly what happened
   * when the old floatplane's fuselage was 4.4 across and the model was dropped
   * 0.9 into it. While swimming it is the pivot the body pitches forward on.
   */
  const seat = new THREE.Group();
  /** And one under it, carrying only how far the body hangs below the water. */
  const hang = new THREE.Group();
  craft.add(seat);
  seat.add(hang);
  hang.add(avatar.group);

  /** The ring left on the water or the ground; see `SPLASH_TIME`. */
  const splash = buildSplash();
  splash.visible = false;
  let splashAge = SPLASH_TIME;
  /** The ring's widest radius, set by whatever started it. */
  let splashReach = SWIM_SPLASH;

  const position = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const forward = new THREE.Vector3(0, 0, 1);

  let state: PlayerState = 'foot';
  interface Held extends Ride {
    /** The model's turning parts, found once: see `CraftModel.build`. */
    props: THREE.Object3D[];
    rotors: THREE.Object3D[];
    wheels: THREE.Object3D[];
  }
  let ride: Held | null = null;
  /** A plane or a balloon standing on the ground. */
  let grounded = false;
  let bodyWanted = true;

  // Tangent velocity on foot. Keeping it as a vector rather than a scalar is
  // what gives movement its weight: a change of direction has to bleed off the
  // old one. The vehicles use the scalar below instead, because a hull and a
  // car have a bow — they turn, they do not slide sideways.
  const motion = new THREE.Vector3();
  let speed = 0;
  let velocity = 0;

  let height = 0;
  let vertical = 0;
  let airborne = false;
  /** The gait's phase last frame, to see a heel strike go by. */
  let lastStep = 0;
  let lean = 0;
  /** How far the body hangs under `position`, and how far it is pitched forward, swimming. */
  let sink = 0;
  let swimPitch = SWIM_PITCH_REST;
  /** A car's or a taxiing plane's nose, following the ground under it. */
  let tilt = 0;

  /** Flight state. `altitude` is above sea level, not above the ground. */
  let altitude = 0;
  let targetAltitude = PLANE_CIRCUIT;
  let turnRate = 0;
  /** How far the plane is rolled into a turn, -1 to 1, positive to the left. */
  let roll = 0;
  let climbRate = 0;
  let swell = 0;
  /** Seconds since a landing was last refused out loud; see `REFUSAL_QUIET`. */
  let sinceRefusal = REFUSAL_QUIET;
  /** The movement keys as a vehicle reads them; see `levers`. */
  const stick = { x: 0, y: 0 };
  /** Where a passenger was last frame, for his speed. */
  const carried = new THREE.Vector3();
  let carriedFrom = false;

  const heading = new THREE.Vector3();
  const side = new THREE.Vector3();
  const wish = new THREE.Vector3();
  const target = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const axis = new THREE.Vector3();
  const cross = new THREE.Vector3();
  const probe = new THREE.Vector3();
  const bow = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  /** What one frame moves the body, as a tangent vector. */
  const moved = new THREE.Vector3();
  /** Where the frame's step started, to go back to when it meets a wall of made ground. */
  const stepFrom = new THREE.Vector3();
  const stepUp = new THREE.Vector3();
  const stepForward = new THREE.Vector3();
  const seatShift = new THREE.Vector3();
  const worldQuaternion = new THREE.Quaternion();
  const LOCAL_Y = new THREE.Vector3(0, 1, 0);
  const LOCAL_Z = new THREE.Vector3(0, 0, 1);

  /**
   * The walls, laid flat. `slide` works in a plane and the planet is not one, so
   * each frame puts a tangent plane at the player — `flatX` along the facing,
   * `flatZ` beside it — and this translates between the two. A frame covers 13
   * units at most on foot and over 13 units the plane misses the sphere by
   * 0.005, so the pushes are the settlements' own, only re-expressed.
   */
  const origin = new THREE.Vector3();
  const flatX = new THREE.Vector3();
  const flatZ = new THREE.Vector3();
  const query = new THREE.Vector3();
  const pushed = new THREE.Vector3();
  const spot = new THREE.Vector3();
  const body: Body = { x: 0, z: 0, vx: 0, vz: 0 };
  /** Where a splash goes, and the up it lies across. */
  const wakeUp = new THREE.Vector3();
  const LOCAL_UP = new THREE.Vector3(0, 1, 0);
  function onSphere(x: number, z: number, out: THREE.Vector3): THREE.Vector3 {
    return out.copy(origin).addScaledVector(flatX, x).addScaledVector(flatZ, z).setLength(origin.length());
  }
  const { collide, freeSpotNear } = options;
  const walls: Walls | null = collide === undefined ? null : {
    collide(x, z, radius, push) {
      const hit = collide(onSphere(x, z, query), radius, pushed);
      push.x = pushed.dot(flatX);
      push.z = pushed.dot(flatZ);
      return hit;
    },
    freeSpot: freeSpotNear === undefined ? undefined : (x, z, radius, out) => {
      if (!freeSpotNear(onSphere(x, z, query), radius, spot)) return false;
      spot.setLength(origin.length()).sub(origin);
      out.x = spot.dot(flatX);
      out.z = spot.dot(flatZ);
      return true;
    },
  };

  const controls: Player['controls'] = { lift: 0 };

  /**
   * The surface a foot or a wheel stands on: the relief, or whatever was built
   * on it.
   *
   * `terrain.ts`'s `reliefAt` is still the one definition of the relief and
   * `groundRadius` is still the one way to ask it — this is a *made* surface on
   * top, and the higher of the two wins because a plinth and a carriageway are
   * both things you stand on rather than sink into. A made surface only ever
   * exists over land, so the water test upstream of this is unaffected: the sea
   * has nothing built on it.
   */
  function standingRadius(at: THREE.Vector3): number {
    const relief = groundRadius(world, at);
    if (options.madeHeightAt === undefined) return relief;
    const made = options.madeHeightAt(at);
    return made > relief ? made : relief;
  }

  /** Signed angle from `from` to `to`, measured about `about`. */
  function angleAbout(from: THREE.Vector3, to: THREE.Vector3, about: THREE.Vector3): number {
    cross.crossVectors(from, to);
    return Math.atan2(cross.dot(about), from.dot(to));
  }

  /**
   * Moves `arc` radians along a tangent direction, carrying the frame with it.
   *
   * This is the same trick the walk uses and it is here for the same reason:
   * travelling is rotating about your own right axis, so nothing in this file
   * ever names a latitude and there is no singularity to cross at a pole.
   */
  function advance(along: THREE.Vector3, arc: number): void {
    if (arc === 0) return;
    axis.crossVectors(up, along).normalize();
    position.applyAxisAngle(axis, arc);
    forward.applyAxisAngle(axis, arc).normalize();
    up.copy(position).normalize();
  }

  /** The point `arc` radians from here along a tangent direction. */
  function pointAhead(along: THREE.Vector3, arc: number, out: THREE.Vector3): THREE.Vector3 {
    axis.crossVectors(up, along).normalize();
    return out.copy(position).applyAxisAngle(axis, arc);
  }

  /** Is there water for the whole width of the hull, `arc` radians ahead? */
  function clearAhead(along: THREE.Vector3, arc: number): boolean {
    for (const spread of HULL_PROBES) {
      bow.copy(along);
      if (spread !== 0) bow.applyAxisAngle(up, spread).normalize();
      pointAhead(bow, arc, probe);
      if (!isWater(groundRadius(world, probe))) return false;
    }
    return true;
  }

  /** The seat you are in, as the model publishes it. */
  const seatOf = (held: Held): Seat => held.model.seats[held.seat] ?? held.model.seats[0]!;

  /** Whether the body is drawn: wanted by the camera, and not shut in a cab. */
  function applyBody(): void {
    avatar.group.visible = bodyWanted && (ride === null || seatOf(ride).shown);
  }

  /**
   * Puts the body on a seat. A seat is a hip point for both poses
   * (`craft/body.ts`): seated, the hip goes on it; standing — a balloon's
   * basket — the soles go `AVATAR_HIP` under it, and the body keeps its own
   * offset, as it does on foot.
   */
  function seatOn(where: Seat): void {
    seat.rotation.set(0, where.yaw, 0);
    if (where.pose === 'stand') {
      seat.position.set(where.x, where.y - AVATAR_HIP, where.z);
      return;
    }
    seatShift.set(avatar.group.position.x, avatar.group.position.y + AVATAR_HIP, avatar.group.position.z)
      .applyAxisAngle(LOCAL_Y, where.yaw);
    seat.position.set(where.x - seatShift.x, where.y - seatShift.y, where.z - seatShift.z);
  }

  /** Into the water from the land, or from a fall. */
  function enterWater(): void {
    state = 'swim';
    height = PLANET_RADIUS + WATERLINE;
    position.setLength(height);
    vertical = 0;
    airborne = false;
    motion.clampLength(0, SWIM_SPRINT);
    spray(PLANET_RADIUS + WATERLINE, SWIM_SPLASH);
    options.onEvent?.('swim');
  }

  /**
   * The frame's move through whatever is standing: `moved` becomes the
   * displacement and `motion` what the walls left of it. True if a wall was
   * touched.
   */
  function throughWalls(dt: number, walls: Walls, radius: number): boolean {
    origin.copy(position);
    flatX.copy(forward);
    flatZ.crossVectors(up, flatX).normalize();
    body.x = 0;
    body.z = 0;
    body.vx = motion.dot(flatX);
    body.vz = motion.dot(flatZ);
    const outcome = slide(body, dt, radius, walls);
    moved.copy(flatX).multiplyScalar(body.x).addScaledVector(flatZ, body.z);
    motion.copy(flatX).multiplyScalar(body.vx).addScaledVector(flatZ, body.vz);
    return outcome !== 'clear';
  }

  /** Rotates the frame by `moved`, carrying `motion` and the facing with it. */
  function travel(): number {
    const distance = moved.length();
    stepFrom.copy(position);
    stepUp.copy(up);
    stepForward.copy(forward);
    if (distance > 1e-9) {
      const arc = distance / position.length();
      axis.crossVectors(up, moved).normalize();
      position.applyAxisAngle(axis, arc);
      motion.applyAxisAngle(axis, arc);
      forward.applyAxisAngle(axis, arc).normalize();
      up.copy(position).normalize();
    }
    return distance;
  }

  /** Back to where the frame's move started. */
  function undo(): void {
    position.copy(stepFrom);
    up.copy(stepUp);
    forward.copy(stepForward);
    motion.set(0, 0, 0);
  }

  /** Height after a move over the ground: follow a rise, glide down a slope, fall off a cliff. */
  function settle(dt: number, ground: number, drop: number): void {
    if (airborne) {
      vertical -= GRAVITY * dt;
      height += vertical * dt;
      if (height <= ground) {
        height = ground;
        if (!isWater(ground)) options.onTouchdown?.(-vertical);
        vertical = 0;
        airborne = false;
      }
    } else if (ground >= height) {
      // Uphill. Follow it exactly: see HEIGHT_SMOOTHING.
      height = ground;
    } else if (ground < height - drop) {
      // Off a cliff. Falling is the honest answer; sliding down the face of a
      // 20-unit coast is not.
      airborne = true;
      vertical = 0;
    } else {
      height += (ground - height) * approach(HEIGHT_SMOOTHING, dt);
    }
    position.setLength(height);
  }

  function walk(dt: number, input: PlayerInput): void {
    const swimming = state === 'swim';
    // Movement is relative to the camera, which is the whole difference
    // between this and tank controls: the stick points at the world, not at
    // the avatar.
    heading.copy(input.heading).projectOnPlane(up);
    if (heading.lengthSq() < 1e-8) heading.copy(forward);
    heading.normalize();
    // Screen right. `up x heading` is the other one, and it points left.
    side.crossVectors(heading, up).normalize();

    wish.set(0, 0, 0).addScaledVector(heading, input.move.y).addScaledVector(side, input.move.x);
    const amount = Math.min(1, wish.length());
    if (amount > 1e-4) wish.divideScalar(wish.length());
    else wish.set(0, 0, 0);

    const top = swimming ? (input.run ? SWIM_SPRINT : SWIM_SPEED) : input.run ? RUN_SPEED : WALK_SPEED;
    target.copy(wish).multiplyScalar(top * amount);
    motion.projectOnPlane(up);
    const time = swimming ? SWIM_ACCELERATION_TIME : ACCELERATION_TIME;
    motion.lerp(target, approach((airborne ? AIR_CONTROL : 1) / time, dt));
    velocity = motion.length();
    // Otherwise the exponential leaves a millimetre per second of drift for ever.
    if (velocity < 0.05 && amount === 0) {
      motion.set(0, 0, 0);
      velocity = 0;
    }

    // No jumping out of the water: there is nothing to push off.
    if (input.jump && !airborne && !swimming) {
      vertical = JUMP_SPEED;
      airborne = true;
    }

    // What the frame actually moves: the motion, or in a town what the walls
    // leave of it. `velocity` is read again afterwards, so a man pressed flat
    // against a wall reports standing still and his walk cycle stops with him.
    moved.copy(motion).multiplyScalar(dt);
    let walled = false;
    if (walls !== null) {
      walled = throughWalls(dt, walls, BODY_RADIUS);
      velocity = motion.length();
    }
    const distance = travel();
    if (velocity > 1e-4) direction.copy(motion).divideScalar(velocity);

    // The body turns towards where it is going rather than being turned by
    // the keys, so a change of direction is a curve and not a snap. Against a
    // wall there is no going, and it turns to face where the stick is pushing.
    let turn = 0;
    const facing = velocity > 1e-3 ? direction : walled ? wish : null;
    if (facing !== null && amount > 1e-4) {
      turn = angleAbout(forward, facing, up) * approach(TURN_SMOOTHING, dt);
      forward.applyAxisAngle(up, turn).normalize();
    }
    const leanTarget = dt > 0
      ? clamp((-turn / dt) * velocity * LEAN_GAIN, -MAX_LEAN, MAX_LEAN)
      : 0;
    lean += (leanTarget - lean) * approach(LEAN_SMOOTHING, dt);

    let ground = standingRadius(position);

    if (swimming) {
      // Out of the water where the bank is one a person can climb, and against
      // it where it is not: a quay is a wall from the sea as it is from the
      // street. Well over `isWater`'s line, so the two cannot flicker.
      if (ground > PLANET_RADIUS + SWIM_OUT) {
        if (ground - (PLANET_RADIUS + WATERLINE) > SWIM_CLIMB_OUT) {
          undo();
          velocity = 0;
        } else {
          state = 'foot';
          height = ground;
          position.setLength(height);
          options.onEvent?.('ashore');
          return;
        }
      }
      height = PLANET_RADIUS + WATERLINE;
      position.setLength(height);
      return;
    }

    // A rise no stair and no hillside makes is a wall: see `STEP_UP`.
    if (distance > 1e-9 && ground - height > STEP_UP + distance * CLIMB_SLOPE) {
      undo();
      velocity = 0;
      ground = standingRadius(position);
    }
    settle(dt, ground, STEP_DOWN);

    // Walk into the sea, or fall into a lake, and you swim. That is the whole
    // entry: no key and no jetty, and no way left to walk on water.
    if (!airborne && isWater(ground)) enterWater();
  }

  /**
   * A vehicle on wheels, moved one frame at `speed` along its bow: a car on the
   * road, a plane taxiing. Stopped by the water's edge, by a wall — the car's
   * own width against the buildings, and its bumper against them too — and by
   * a rise it cannot climb, which is a kerb's worth plus the angle of repose
   * over the distance covered: a terrace riser is a wall and a hillside is not.
   */
  function rollOn(dt: number, model: CraftModel, width: number): void {
    const half = model.size[0] / 2;
    motion.copy(forward).multiplyScalar(speed);
    moved.copy(motion).multiplyScalar(dt);
    if (walls !== null) {
      throughWalls(dt, walls, width);
      // Whatever the walls took off the motion is taken off the speed: a
      // car driven into a wall at an angle scrapes along it, and one driven
      // into it square stops.
      speed = motion.dot(forward);
    }
    const distance = travel();
    // The bumper, on the side the car is going.
    pointAhead(forward, (speed >= 0 ? half : -half) / position.length(), probe);
    let blocked = isWater(standingRadius(probe));
    if (!blocked && collide !== undefined) blocked = collide(probe, width * 0.8, pushed);
    let ground = standingRadius(position);
    if (!blocked) blocked = isWater(ground);
    if (!blocked && !airborne && distance > 1e-9) blocked = ground - height > CAR_STEP + distance * MAX_SLOPE;
    if (blocked) {
      undo();
      speed = 0;
      ground = standingRadius(position);
    }
    settle(dt, ground, AVATAR_HEIGHT);
    velocity = Math.abs(speed);

    // The nose follows the ground under the two axles.
    if (!airborne) {
      pointAhead(forward, half / position.length(), probe);
      const front = standingRadius(probe);
      pointAhead(forward, -half / position.length(), probe);
      const back = standingRadius(probe);
      const wanted = -clamp(Math.atan2(front - back, 2 * half), -MAX_NOSE, MAX_NOSE);
      tilt += (wanted - tilt) * approach(TILT_SMOOTHING, dt);
    }
  }

  /** Steering on wheels: no turn standing still, full lock from `CAR_GRIP_SPEED`, and reversed going backwards. */
  function steerWheels(dt: number): void {
    const grip = clamp(Math.abs(speed) / CAR_GRIP_SPEED, 0, 1);
    const turn = airborne ? 0 : -stick.x * CAR_TURN * grip * (speed < 0 ? -1 : 1) * dt;
    if (turn !== 0) forward.applyAxisAngle(up, turn).normalize();
    turnRate = dt > 0 ? turn / dt : 0;
  }

  function drive(dt: number, input: PlayerInput, model: CraftModel): void {
    levers(input.move, stick);
    steerWheels(dt);
    const top = input.run ? CAR_BOOST : CAR_SPEED;
    let wanted = 0;
    let time = CAR_COAST_TIME;
    if (stick.y > 0) {
      wanted = top * stick.y;
      time = speed < -0.5 ? CAR_BRAKE_TIME : CAR_ACCELERATION_TIME;
    } else if (stick.y < 0) {
      // `S` is the brake while the car is going forward, and reverse once it
      // has stopped, which is every arcade car's rule.
      wanted = speed > 0.5 ? 0 : CAR_REVERSE * stick.y;
      time = speed > 0.5 ? CAR_BRAKE_TIME : CAR_ACCELERATION_TIME;
    }
    if (!airborne) speed += (wanted - speed) * approach(1 / time, dt);
    if (stick.y === 0 && Math.abs(speed) < 0.05) speed = 0;
    rollOn(dt, model, model.size[1] / 2);
  }

  function sail(dt: number, input: PlayerInput, model: CraftModel): void {
    // Rudder and throttle are two levers, not a direction: see `levers`.
    levers(input.move, stick);
    const turn = -stick.x * BOAT_TURN * dt;
    if (turn !== 0) forward.applyAxisAngle(up, turn).normalize();
    turnRate = dt > 0 ? turn / dt : 0;

    const top = input.run ? BOAT_BOOST : BOAT_SPEED;
    // Astern is deliberately weak: it is for getting off a rock, not for
    // sailing backwards across an ocean.
    const wanted = stick.y >= 0 ? top * stick.y : BOAT_SPEED * stick.y * 0.35;
    speed += (wanted - speed) * approach(1 / BOAT_ACCELERATION_TIME, dt);
    if (Math.abs(speed) < 0.05) speed = 0;

    // Half the hull and a margin: how far ahead land stops the boat. The margin
    // absorbs a coast lying between the three bearings `HULL_PROBES` samples,
    // which is a fact about the sampling and not about the hull.
    const reach = model.size[0] / 2 + HULL_MARGIN;
    const radius = position.length();
    const travelled = speed * dt;
    if (travelled !== 0) {
      direction.copy(forward);
      let arc = 0;
      if (travelled < 0) {
        // Astern there is nothing to slide along, so it is stop or go.
        if (clearAhead(direction.copy(forward).negate(), -(travelled - reach) / radius)) {
          arc = travelled / radius;
          direction.copy(forward);
        } else speed = 0;
      } else {
        let deflected = 0;
        let clear = false;
        for (const deflection of DEFLECTIONS) {
          direction.copy(forward);
          if (deflection !== 0) direction.applyAxisAngle(up, deflection).normalize();
          if (!clearAhead(direction, (travelled + reach) / radius)) continue;
          arc = (travelled * Math.cos(deflection)) / radius;
          deflected = deflection;
          clear = true;
          break;
        }
        if (!clear) speed = 0;
        // Following the shore rather than crabbing along it: the bow swings
        // slowly towards the way the hull is actually going.
        else if (deflected !== 0) forward.applyAxisAngle(up, deflected * approach(1.5, dt)).normalize();
      }
      advance(direction, arc);
    }

    // The waterline rides at a fixed height, so the water is a floor with no
    // smoothing to settle: there is nothing under it that varies.
    height = PLANET_RADIUS + WATERLINE;
    position.setLength(height);
    velocity = Math.abs(speed);
  }

  /** A plane on the ground: taxi on `W`, and a take-off run with the climb key held. */
  function taxi(dt: number, input: PlayerInput, model: CraftModel): void {
    levers(input.move, stick);
    steerWheels(dt);
    const run = controls.lift > 0;
    let wanted = 0;
    let time = CAR_COAST_TIME;
    if (run) {
      wanted = PLANE_ROTATE * 1.25;
      time = PLANE_ACCELERATION_TIME;
    } else if (stick.y > 0) {
      wanted = PLANE_TAXI * stick.y;
      time = CAR_ACCELERATION_TIME;
    } else if (stick.y < 0) {
      wanted = speed > 0.5 ? 0 : CAR_REVERSE * 0.5 * stick.y;
      time = CAR_BRAKE_TIME;
    }
    speed += (wanted - speed) * approach(1 / time, dt);
    if (!run && stick.y === 0 && Math.abs(speed) < 0.05) speed = 0;
    // A fuselage's width against the buildings, not the span: a wingtip over
    // a garden wall is how a light aircraft is parked.
    rollOn(dt, model, Math.min(model.size[0], model.size[1]) * 0.25);
    if (run && speed >= PLANE_ROTATE && !airborne) {
      grounded = false;
      airborne = true;
      altitude = position.length() - PLANET_RADIUS;
      // A take-off climbs to the circuit on its own. Holding the climb key
      // from there is what turns the flight into the map.
      targetAltitude = Math.max(PLANE_CIRCUIT, altitude + PLANE_BOUNCE);
      roll = 0;
      spray(height, craftSplash());
      options.onEvent?.('took-off');
    }
  }

  /** Says a landing was refused, once in `REFUSAL_QUIET`. */
  function refuse(event: 'water-refused' | 'steep-refused'): void {
    if (sinceRefusal < REFUSAL_QUIET) return;
    sinceRefusal = 0;
    options.onEvent?.(event);
  }

  function fly(dt: number, input: PlayerInput, model: CraftModel): void {
    sinceRefusal += dt;
    if (grounded) {
      taxi(dt, input, model);
      return;
    }
    // Stick and throttle are two levers, not a direction: see `levers`.
    levers(input.move, stick);
    // The stick rolls the plane and the roll turns it: see `PLANE_ROLL_TIME`.
    // `A` is a negative `x` and a left turn, which about `up` is positive.
    roll += (-stick.x - roll) * approach(1 / PLANE_ROLL_TIME, dt);
    // Otherwise the ease leaves the wings a hair off level for ever.
    if (stick.x === 0 && Math.abs(roll) < 1e-4) roll = 0;
    const turn = roll * PLANE_TURN * dt;
    if (turn !== 0) forward.applyAxisAngle(up, turn).normalize();
    turnRate = dt > 0 ? turn / dt : 0;

    const descending = controls.lift < 0;
    const ground = groundRadius(world, position);
    const low = position.length() - ground < PLANE_BOUNCE * 2;
    // Speed rides altitude: see `PLANE_CRUISE_LOW` in `vehicles.ts`. Low is
    // scenic, high is how an ocean gets crossed; and coming down low the
    // throttle closes to an approach speed, so a landing is aimable.
    const fraction = clamp(altitude / PLANE_CEILING, 0, 1);
    const cruise = mix(PLANE_CRUISE_LOW, PLANE_CRUISE_HIGH, fraction);
    const approaching = descending && low;
    const wanted = approaching
      ? PLANE_CRUISE_LOW * 0.55
      : cruise * (1 + stick.y * 0.35) * (input.run ? PLANE_BOOST : 1);
    speed += (wanted - speed) * approach(1 / (approaching ? PLANE_LANDING_TIME : PLANE_ACCELERATION_TIME), dt);

    // Climbing multiplies the height asked for and descending divides it,
    // which reads as a zoom of the map; descending also takes a fixed rate off
    // it, because a division alone never reaches the ground and a landing has to.
    if (controls.lift > 0) {
      targetAltitude = clamp(Math.max(targetAltitude, PLANE_FLOOR) * Math.exp(CLIMB_RATE * dt), PLANE_FLOOR, PLANE_CEILING);
    } else if (descending) {
      targetAltitude = Math.max(0, targetAltitude * Math.exp(-CLIMB_RATE * dt) - PLANE_SINK * dt);
    }
    altitude += (targetAltitude - altitude) * approach(ALTITUDE_RATE, dt);

    const before = position.length();
    advance(forward, (speed * dt) / before);

    const under = groundRadius(world, position);
    const floor = under + PLANE_AIR_CLEARANCE;
    const radius = Math.max(floor, PLANET_RADIUS + altitude);
    climbRate = dt > 0 ? (radius - before) / dt : 0;
    position.setLength(radius);
    // The ground has the last word, and then the altitude is read back from it.
    // That is what makes flying into the planet impossible: a ridge rising under
    // the plane lifts it, and because the request is updated too, the far side
    // is a glide down instead of a fall off the edge.
    altitude = radius - PLANET_RADIUS;
    velocity = speed;

    // Down on the floor with the descend key held and the height asked for
    // under it: a touchdown, if the ground will take one.
    if (descending && radius <= floor + 0.5 && PLANET_RADIUS + targetAltitude < floor) {
      if (isWater(under)) {
        // A landplane on the sea is a wreck, and nothing in this world is.
        targetAltitude = under - PLANET_RADIUS + PLANE_BOUNCE;
        refuse('water-refused');
        return;
      }
      const half = model.size[0] / 2;
      pointAhead(forward, half / radius, probe);
      const front = groundRadius(world, probe);
      pointAhead(forward, -half / radius, probe);
      const back = groundRadius(world, probe);
      if (Math.abs(front - back) / (2 * half) > PLANE_LANDING_GRADE || isWater(front) || isWater(back)) {
        targetAltitude = under - PLANET_RADIUS + PLANE_BOUNCE;
        refuse('steep-refused');
        return;
      }
      grounded = true;
      airborne = false;
      vertical = 0;
      roll = 0;
      climbRate = 0;
      height = standingRadius(position);
      position.setLength(height);
      // The landing rolls out rather than stopping dead: `taxi` brakes it.
      speed = Math.min(speed, PLANE_ROTATE);
      spray(height, craftSplash());
      options.onEvent?.('landed');
    }
  }

  /**
   * The balloon: it rises and sinks on the two keys, drifts along the heading
   * you steer at a speed the throttle trims, and sets down wherever it touches
   * land. Over water it holds its basket clear of the surface and cannot come
   * down, which is also why it cannot be left there.
   */
  function drift(dt: number, input: PlayerInput): void {
    levers(input.move, stick);
    const lift = controls.lift;
    if (grounded) {
      speed = 0;
      velocity = 0;
      if (lift <= 0) {
        height = standingRadius(position);
        position.setLength(height);
        return;
      }
      grounded = false;
      airborne = true;
      vertical = 0;
      options.onEvent?.('took-off');
    }
    const turn = -stick.x * BALLOON_TURN * dt;
    if (turn !== 0) forward.applyAxisAngle(up, turn).normalize();
    turnRate = dt > 0 ? turn / dt : 0;
    speed += (Math.max(0, BALLOON_SPEED * (1 + stick.y * 0.6)) - speed) * approach(0.5, dt);
    vertical += (lift * BALLOON_CLIMB - vertical) * approach(0.8, dt);
    advance(forward, (speed * dt) / position.length());

    const ground = standingRadius(position);
    const water = isWater(ground);
    const floor = water ? PLANET_RADIUS + WATERLINE + BALLOON_WATER_FLOOR : ground;
    height = Math.min(PLANET_RADIUS + BALLOON_CEILING, height + vertical * dt);
    if (height <= floor) {
      height = floor;
      if (!water && vertical <= 0 && lift <= 0) {
        grounded = true;
        airborne = false;
        speed = 0;
        vertical = 0;
        spray(height, craftSplash());
        options.onEvent?.('landed');
      } else vertical = Math.max(0, vertical);
    }
    position.setLength(height);
    altitude = height - PLANET_RADIUS;
    velocity = speed;
  }

  /**
   * The launch's heel, eased after its rudder.
   *
   * A left turn is a positive `turnRate` and comes out here as a positive roll,
   * which in `pose`'s basis leans the hull right — *out* of the turn, as a
   * displacement hull heels. A plane rolls through `roll`, into the turn.
   */
  function bank(dt: number, limit: number, rate: number): void {
    const wanted = clamp(turnRate / rate, -1, 1) * limit;
    lean += (wanted - lean) * approach(BANK_SMOOTHING, dt);
  }

  /**
   * Starts the ring left behind, at `radius` under `at` — the sea's surface
   * for a swimmer, the ground for a plane — opening to `reach` units. It lies
   * in the world, not on the player, so a take-off climbs away from it.
   */
  function spray(radius: number, reach: number, at: THREE.Vector3 = position): void {
    const parent = object.parent;
    if (parent === null) return;
    if (splash.parent !== parent) parent.add(splash);
    wakeUp.copy(at).normalize();
    // A hair over the surface so the ring's foot is not coplanar with it.
    splash.position.copy(wakeUp).multiplyScalar(radius + 0.15);
    splash.quaternion.setFromUnitVectors(LOCAL_UP, wakeUp);
    splashReach = reach;
    splash.scale.set(reach * SPLASH_START, reach * SPLASH_RISE, reach * SPLASH_START);
    // A scale and a rotation, so this cannot be a reflection — and a
    // reflection is exactly the one thing the ink would draw as a solid blob.
    splash.updateMatrix();
    if (splash.matrix.determinant() <= 0) throw new Error('player: the splash ring would be mirrored');
    splash.visible = true;
    splashAge = 0;
  }

  /** How wide the ring a craft leaves opens: past its wingtips, or its hull. */
  function craftSplash(): number {
    return ride === null ? SWIM_SPLASH : Math.max(ride.model.size[0], ride.model.size[1]) * CRAFT_SPLASH;
  }

  function ripple(dt: number): void {
    if (splashAge >= SPLASH_TIME) return;
    splashAge += dt;
    if (splashAge >= SPLASH_TIME) {
      splash.visible = false;
      return;
    }
    const t = splashAge / SPLASH_TIME;
    const out = 1 - (1 - t) * (1 - t);
    const radius = mix(splashReach * SPLASH_START, splashReach, out);
    splash.scale.set(radius, mix(splashReach * SPLASH_RISE, SPLASH_FLAT, t), radius);
  }

  /** The vehicle's own moving parts: propellers, rotors and wheels, at the speed it is going. */
  function spin(held: Held, dt: number, speed_: number): void {
    const engine = isAir(held.model.kind) ? !grounded || speed_ > 0.5 : true;
    for (const prop of held.props) prop.rotation.z += engine ? dt * (8 + speed_ * 0.06) : 0;
    for (const rotor of held.rotors) rotor.rotation.y += engine ? dt * 6 : 0;
    const forwardSign = speed >= 0 ? 1 : -1;
    for (const wheel of held.wheels) wheel.rotation.x += (forwardSign * speed_ * dt) / WHEEL_RADIUS;
  }

  function poseRide(held: Held, dt: number, speed_: number): void {
    const where = seatOf(held);
    const kind = held.model.kind;
    swell += dt;
    if (where.pose === 'sit') avatar.sit(dt);
    else if (kind === 'boat') avatar.steer(dt, lean);
    else avatar.stride(dt, 0, false);
    seatOn(where);
    spin(held, dt, speed_);

    if (kind === 'boat') {
      bank(dt, BOAT_HEEL, BOAT_TURN);
      // A swell, so a moored boat is not a parked box. Two frequencies that do
      // not divide, or the roll and the pitch beat together and it reads as a
      // loop.
      const heel = lean + Math.sin(swell * 0.9) * 0.05;
      craft.position.y = Math.sin(swell * 1.3) * 0.18;
      craft.rotation.set(Math.sin(swell * 0.7) * 0.035, 0, heel);
      return;
    }
    if (kind === 'plane' && !grounded) {
      // The bank *is* the turn — `fly` reads the turn off `roll` — so it is
      // taken as it stands rather than eased a second time, and it goes into
      // the turn: a left roll is a positive `roll` and, per the basis, a
      // negative lean.
      lean = -roll * PLANE_BANK;
      // Nose follows the actual climb rate, so the attitude is the flight path
      // rather than a decoration: negative pitches it up.
      const nose = -clamp(Math.atan2(climbRate, Math.max(speed_, 1)), -MAX_NOSE, MAX_NOSE);
      craft.rotation.set(nose, 0, lean);
      return;
    }
    if (kind === 'balloon') {
      // A basket hangs: a slow pendulum, and nothing else.
      craft.rotation.set(Math.sin(swell * 0.6) * 0.02, 0, Math.sin(swell * 0.45) * 0.03);
      return;
    }
    // On wheels: the nose on the ground's slope and a little body roll out of
    // a hard turn.
    const rollTarget = clamp((turnRate * speed_) / (CAR_TURN * CAR_SPEED), -1, 1) * CAR_ROLL;
    lean += (rollTarget - lean) * approach(BANK_SMOOTHING, dt);
    craft.rotation.set(tilt, 0, lean);
  }

  function pose(dt: number, speed_: number): void {
    // The basis is right-handed with the avatar facing +Z, which puts local +X
    // on its left. Rolling about +Z therefore leans it right, and a left turn
    // (a positive rotation about `up`) needs a negative roll.
    side.crossVectors(up, forward).normalize();
    basis.makeBasis(side, up, forward);
    if (basis.determinant() <= 0) throw new Error('player: the frame would be mirrored');
    object.quaternion.setFromRotationMatrix(basis);
    object.position.copy(position);

    ripple(dt);
    craft.position.set(0, 0, 0);
    craft.rotation.set(0, 0, 0);
    // On foot the body stands on the origin and owns its own offset: only a
    // *seat* is the vehicle's to place.
    seat.position.set(0, 0, 0);
    seat.rotation.set(0, 0, 0);

    if (ride !== null) {
      sink = 0;
      hang.position.set(0, 0, 0);
      poseRide(ride, dt, speed_);
      return;
    }

    if (state === 'swim') {
      // The walk, slowed and laid forward from the chest, which is at the
      // surface: see `SWIM_PITCH_REST`.
      sink += (SWIM_DEPTH - sink) * approach(SINK_RATE, dt);
      avatar.stride(dt, speed_ * SWIM_CADENCE, false);
      const pace = clamp(speed_ / SWIM_SPEED, 0, 1);
      swimPitch += (mix(SWIM_PITCH_REST, SWIM_PITCH_MOVING, pace) - swimPitch) * approach(3, dt);
      swell += dt;
      seat.rotation.x = swimPitch;
      hang.position.y = -sink;
      craft.position.y = Math.sin(swell * 1.7) * 0.08;
      craft.rotation.z = lean * 0.5;
      return;
    }

    // Back on the feet coming out of the water, over a moment rather than a frame.
    sink += (0 - sink) * approach(SINK_RATE * 2, dt);
    if (sink < 1e-3) sink = 0;
    hang.position.y = -sink;
    // On foot the avatar owns its own vertical bob and lateral sway, so `craft`
    // carries only the roll of a turn.
    avatar.stride(dt, speed_, airborne);
    // A heel strike at each half of the cycle; see `Avatar.phase`.
    const stepPhase = avatar.phase;
    if (!airborne && speed_ > WALK_SPEED * 0.3 && (stepPhase < lastStep || (lastStep < 0.5 && stepPhase >= 0.5))) {
      options.onStep?.(speed_ / WALK_SPEED);
    }
    lastStep = stepPhase;
    craft.rotation.z = lean;
  }

  /** Back to a standing start: no speed, no turn, no flight. */
  function still(): void {
    motion.set(0, 0, 0);
    speed = 0;
    velocity = 0;
    vertical = 0;
    airborne = false;
    lean = 0;
    tilt = 0;
    turnRate = 0;
    roll = 0;
    climbRate = 0;
    controls.lift = 0;
  }

  /** Lets go of the vehicle's group, which the fleet takes back. */
  function dropRide(): void {
    if (ride === null) return;
    craft.remove(ride.group);
    ride = null;
    carriedFrom = false;
    grounded = false;
    avatar.reset();
    applyBody();
  }

  function modeOf(): TravelMode {
    if (ride === null) return state === 'swim' ? 'swim' : 'foot';
    if (ride.seat !== 0) return 'passenger';
    const kind = ride.model.kind;
    return kind === 'van' ? 'car' : kind;
  }

  /** The fields the rest of the game reads, after anything that changes them. */
  function publish(): void {
    const kind = ride?.model.kind ?? null;
    player.velocity = velocity;
    player.airborne = kind !== null && isAir(kind) ? !grounded : airborne;
    player.state = state;
    player.mode = modeOf();
    player.ride = ride;
    player.grounded = grounded;
    player.sink = sink;
    player.altitude = position.length() - PLANET_RADIUS;
  }

  const player: Player = {
    object,
    position,
    forward,
    up,
    velocity: 0,
    airborne: false,
    state,
    mode: 'foot',
    ride: null,
    grounded: false,
    sink: 0,
    altitude: 0,
    controls,
    update(dt, input) {
      if (input.climb !== undefined || input.dive !== undefined) {
        controls.lift = (input.climb === true ? 1 : 0) - (input.dive === true ? 1 : 0);
      }

      up.copy(position).normalize();
      // Reproject every tick: accumulated floating-point error would slowly
      // lift the heading off the surface.
      forward.projectOnPlane(up).normalize();

      if (ride !== null && ride.seat !== 0) {
        // A passenger does not steer: `carry` moves him, and his speed is what
        // it moved him by.
        velocity = carriedFrom && dt > 0 ? position.distanceTo(carried) / dt : 0;
        carried.copy(position);
        carriedFrom = true;
      } else if (ride !== null) {
        const model = ride.model;
        if (model.kind === 'boat') sail(dt, input, model);
        else if (model.kind === 'plane') fly(dt, input, model);
        else if (model.kind === 'balloon') drift(dt, input);
        else if (isRoad(model.kind)) drive(dt, input, model);
      } else walk(dt, input);

      publish();
      pose(dt, velocity);
    },
    setBodyVisible(visible) {
      bodyWanted = visible;
      applyBody();
    },
    board(next, at) {
      dropRide();
      const held: Held = { ...next, props: [], rotors: [], wheels: [] };
      next.group.traverse((part) => {
        if (part.name === 'prop') held.props.push(part);
        else if (part.name === 'rotor') held.rotors.push(part);
        else if (part.name === 'wheel') held.wheels.push(part);
      });
      ride = held;
      state = 'seated';
      still();
      position.set(at[0]!, at[1]!, at[2]!);
      up.copy(position).normalize();
      forward.set(at[3]!, at[4]!, at[5]!).projectOnPlane(up);
      if (forward.lengthSq() < 1e-8) forward.set(0, 1, 0).projectOnPlane(up);
      forward.normalize();
      const kind = next.model.kind;
      if (kind === 'boat') position.setLength(PLANET_RADIUS + WATERLINE);
      height = position.length();
      altitude = height - PLANET_RADIUS;
      targetAltitude = altitude;
      // A plane or a balloon is taken standing on the ground, which is the
      // only place one can be left.
      grounded = isAir(kind) && height - standingRadius(position) < 1.5;
      airborne = isAir(kind) && !grounded;
      next.group.position.set(0, 0, 0);
      next.group.quaternion.identity();
      next.group.scale.setScalar(1);
      craft.add(next.group);
      applyBody();
      publish();
      pose(0, 0);
    },
    leave() {
      if (ride === null) return null;
      const held = ride;
      const kind = held.model.kind;
      if (isAir(kind) && !grounded) return null;
      const out = player.pose(new Array<number>(9));
      // Out on the side the seat is on — a model's +X is its left — then
      // round the vehicle, nearest that side first; land if there is any
      // within a step, and for a boat within `SHORE_REACH`, else into the
      // water beside the hull.
      const where = seatOf(held);
      const first = where.x >= 0 ? Math.PI / 2 : -Math.PI / 2;
      const beside = held.model.size[1] / 2 + BODY_RADIUS + 0.8;
      const reaches = kind === 'boat' ? [beside, SHORE_REACH] : [beside, held.model.size[0] / 2 + BODY_RADIUS + 0.8];
      let landed = false;
      let wet = false;
      for (const reach of reaches) {
        for (let i = 0; i < STEP_OFF_DIRECTIONS && !landed; i++) {
          const angle = first + Math.ceil(i / 2) * (i % 2 === 0 ? 1 : -1) * (TAU / STEP_OFF_DIRECTIONS);
          direction.copy(forward).applyAxisAngle(up, angle).normalize();
          pointAhead(direction, reach / position.length(), probe);
          const ground = standingRadius(probe);
          if (isWater(ground)) continue;
          if (collide !== undefined && collide(probe, BODY_RADIUS, pushed)) continue;
          spot.copy(probe).setLength(ground);
          forward.copy(direction);
          landed = true;
        }
        if (landed) break;
      }
      if (!landed) {
        // No land in reach: over the side into the water, if that is where
        // the vehicle is, or beside it on whatever there is.
        direction.copy(forward).applyAxisAngle(up, first).normalize();
        pointAhead(direction, beside / position.length(), probe);
        wet = isWater(standingRadius(probe));
        spot.copy(probe).setLength(wet ? PLANET_RADIUS + WATERLINE : standingRadius(probe));
        forward.copy(direction);
      }
      dropRide();
      still();
      position.copy(spot);
      up.copy(position).normalize();
      forward.projectOnPlane(up).normalize();
      if (!wet && freeSpotNear !== undefined && freeSpotNear(query.copy(position), BODY_RADIUS, spot)) {
        position.copy(spot).normalize();
        up.copy(position);
        position.setLength(standingRadius(position));
      }
      height = position.length();
      if (wet) {
        state = 'swim';
        sink = SWIM_DEPTH;
        spray(PLANET_RADIUS + WATERLINE, SWIM_SPLASH);
      } else state = 'foot';
      publish();
      pose(0, 0);
      return out;
    },
    pose(out) {
      if (ride === null) {
        side.copy(up);
        return writePose(position, forward, side, out);
      }
      // The vehicle's own frame: the surface frame and the ride's roll, nose
      // and swell on top of it, read off the groups that carry them.
      worldQuaternion.copy(object.quaternion).multiply(craft.quaternion);
      direction.copy(LOCAL_Z).applyQuaternion(worldQuaternion);
      side.copy(LOCAL_Y).applyQuaternion(worldQuaternion);
      target.copy(craft.position).applyQuaternion(object.quaternion).add(position);
      return writePose(target, direction, side, out);
    },
    carry(at) {
      position.set(at[0]!, at[1]!, at[2]!);
      up.copy(position).normalize();
      forward.set(at[3]!, at[4]!, at[5]!).projectOnPlane(up);
      if (forward.lengthSq() < 1e-8) forward.set(0, 1, 0).projectOnPlane(up);
      forward.normalize();
      height = position.length();
      if (ride !== null && isAir(ride.model.kind)) grounded = height - standingRadius(position) < 1.5;
    },
    goTo(lat, lon) {
      dropRide();
      unitAt(lat, lon, position);
      up.copy(position).normalize();
      // Never arrive inside a building. The town at the far end is usually not
      // standing yet, and the first frame it is pushes you out of it — see
      // `freeSpotNear` — but a jump into one that is costs only this call.
      if (freeSpotNear !== undefined && freeSpotNear(query.copy(up).multiplyScalar(PLANET_RADIUS), BODY_RADIUS, spot)) {
        position.copy(spot).normalize();
        up.copy(position);
      }

      // Height comes from the ground under the new position, now. Reading it
      // from the old one is how teleporting from land to open ocean used to
      // leave you standing on air.
      height = standingRadius(position);
      position.copy(up).setLength(height);

      // And the heading is rebuilt from scratch: carrying the old one across
      // the planet can leave it parallel to the new `up`, and normalising that
      // is a NaN that then spreads to the whole transform.
      forward.set(0, 1, 0).projectOnPlane(up);
      if (forward.lengthSq() < 1e-6) forward.set(1, 0, 0).projectOnPlane(up);
      forward.normalize();

      still();
      // The walk cycle, the airborne blend and the breath all live in the
      // avatar now, and a teleport has to clear them or the first frame in
      // Tokyo is mid-stride from Paris.
      avatar.reset();
      altitude = 0;
      targetAltitude = PLANE_CIRCUIT;
      state = 'foot';
      sink = 0;
      // Teleporting into the water has you swimming, for the same reason
      // walking into it does: there is nothing there to stand on.
      if (isWater(height)) {
        state = 'swim';
        sink = SWIM_DEPTH;
        height = PLANET_RADIUS + WATERLINE;
        position.setLength(height);
      }
      splashAge = SPLASH_TIME;
      splash.visible = false;
      publish();
      pose(0, 0);
    },
  };

  player.goTo(startLat, startLon);
  return player;
}

/**
 * Nine numbers from a position, a forward and an up: `WirePose`, the one
 * writer of it — the player's own pose, and every site's in `fleet.ts`.
 */
export function writePose(position: THREE.Vector3, forward: THREE.Vector3, up: THREE.Vector3, out: WirePose): WirePose {
  out[0] = position.x;
  out[1] = position.y;
  out[2] = position.z;
  out[3] = forward.x;
  out[4] = forward.y;
  out[5] = forward.z;
  out[6] = up.x;
  out[7] = up.y;
  out[8] = up.z;
  return out;
}
