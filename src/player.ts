import * as THREE from 'three';
import type { Avatar } from './avatar.ts';
import { AVATAR_HEIGHT, FIGURE, RUN_SPEED, WALK_SPEED, buildAvatar } from './avatar.ts';
import type { World } from './geo.ts';
import { LAND_HEIGHT, PLANET_RADIUS, groundRadius } from './globe.ts';
import { slide } from './scenery/solids.ts';
import type { Body, Walls } from './scenery/solids.ts';
import {
  ALTITUDE_RATE,
  AVATAR_HIP,
  BOAT_ACCELERATION_TIME,
  BOAT_BOOST,
  BOAT_BOW,
  BOAT_DECK,
  BOAT_SPEED,
  BOAT_TURN,
  CLIMB_RATE,
  PLANE_ACCELERATION_TIME,
  PLANE_BOOST,
  PLANE_CEILING,
  PLANE_CIRCUIT,
  PLANE_CLEARANCE,
  PLANE_CRUISE_HIGH,
  PLANE_CRUISE_LOW,
  PLANE_FLOOR,
  PLANE_LANDING_TIME,
  PLANE_SEAT,
  PLANE_TURN,
  SHORE_REACH,
  buildBoat,
  buildPlane,
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
 * the knees. At today's 90 it would still be about 5. There is nothing to smooth there anyway:
 * ground that rose under your feet is ground you are already standing on.
 */
const HEIGHT_SMOOTHING = 8;

/**
 * Apex of a jump.
 *
 * Tied to the coastal cliff so it keeps clearing an ordinary step as that
 * number moves, and capped against the avatar so it stays a jump rather than a
 * pogo. The cap is what guarantees the second half of the rule: a 40-unit cliff
 * must not be climbable by jumping at it.
 */
const JUMP_HEIGHT = Math.min(LAND_HEIGHT * 0.45, AVATAR_HEIGHT * 1.25);
/** Seconds to the top. Gravity is derived from it, not chosen: the arc is the input. */
const JUMP_RISE = 0.34;
const GRAVITY = (2 * JUMP_HEIGHT) / (JUMP_RISE * JUMP_RISE);
const JUMP_SPEED = (2 * JUMP_HEIGHT) / JUMP_RISE;

/**
 * A drop larger than this is a cliff: you come off it and fall, instead of
 * gliding down as if the ground were a ramp. Rises are still absorbed by the
 * smoothing, which is what lets you walk up a hillside without it reading as a
 * wall.
 */
const STEP_DOWN = LAND_HEIGHT * 0.5;

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
/** Directions tried when stepping ashore, nearest the bow first. */
const ASHORE_DIRECTIONS = 16;

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

export type Vehicle = 'foot' | 'boat' | 'plane';

export interface PlayerInput {
  move: { x: number; y: number };
  run: boolean;
  jump: boolean;
  /** Tangent direction the camera faces. Movement on foot is relative to this. */
  heading: THREE.Vector3;
  /** Held, in the plane: climb and descend. Optional; see `Player.controls`. */
  climb?: boolean;
  dive?: boolean;
  /** Edges: `fly` takes off or lands, `exit` steps ashore. Optional, same reason. */
  fly?: boolean;
  exit?: boolean;
}

export interface Player {
  object: THREE.Group;
  /** World position; its length is the distance to the planet's centre. */
  position: THREE.Vector3;
  /** Heading, always tangent to the surface. In a vehicle it is the bow. */
  forward: THREE.Vector3;
  up: THREE.Vector3;
  /** Current ground speed in units/s. Used by the HUD and the walk cycle. */
  velocity: number;
  /** True while airborne — which includes the whole of a flight. */
  airborne: boolean;
  /** What you are riding. The camera frames each one differently. */
  vehicle: Vehicle;
  /** Units above sea level. The camera reads it to open the view out. */
  altitude: number;
  /**
   * Vehicle intent, written by whoever reads the keyboard.
   *
   * `PlayerInput` carries only what walking needs, and it is built in `main.ts`.
   * Rather than ask that loop to grow, the camera rig fills this in: `rig.aim`
   * is already the one call that receives both the raw input and the player,
   * and it is already where input becomes intent. The optional fields on
   * `PlayerInput` do the same job if the loop ever wants to pass them straight
   * through — the command is a slot rather than an event, so setting it twice
   * in one frame still performs it once.
   */
  controls: { lift: number; command: 'fly' | 'exit' | null };
  update(dt: number, input: PlayerInput): void;
  /**
   * Show or hide the body, for first person.
   *
   * It lives here rather than in `camera.ts` because this file is the only one
   * that knows which object is the body: the camera used to find it by name,
   * which meant a rename in `avatar.ts` broke first person into a face drawn
   * across the whole screen with nothing to say where it came from. A method
   * cannot go quietly missing.
   */
  setBodyVisible(visible: boolean): void;
  /** Teleport. Leaves the player in a fully consistent state in one call. */
  goTo(lat: number, lon: number): void;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
/** Frame-rate independent version of `x += (target - x) * rate`. */
const approach = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

/**
 * The movement keys as a craft reads them: two levers, not a direction.
 *
 * `input.ts` scales a diagonal to unit length, and on foot that is right — `W`
 * and `A` together are one direction, and a diagonal must not be faster than a
 * straight line. In a craft they are two separate controls, the stick (`A`/`D`)
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
   * being capped by it.
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
   * wall is a wall at any height. The boat and the plane never ask. Omit it and
   * nothing is solid, which is what a headless caller gets.
   */
  collide?: (point: THREE.Vector3, radius: number, push: THREE.Vector3) => boolean;
  /**
   * The nearest point to `point` where a body of `radius` stands clear of every
   * building, into `out`; false when `point` already is. Only the direction of
   * either point is read.
   *
   * The pushes settle a body that walked into a wall. They cannot settle one
   * that was *put* inside a building — a teleport, a landing, a town raised
   * round somebody standing still — because from inside a terrace there is no
   * one wall to push off. So a frame that hit anything ends by asking this, and
   * `goTo` asks it on arrival.
   */
  freeSpotNear?: (point: THREE.Vector3, radius: number, out: THREE.Vector3) => boolean;
}

export function createPlayer(
  world: World,
  startLat: number,
  startLon: number,
  options: PlayerOptions = {},
): Player {
  const avatar: Avatar = buildAvatar();
  const boat = buildBoat();
  const plane = buildPlane();

  /**
   * Three nested groups, and the nesting is what keeps the modes from fighting.
   * `object` carries the position and the surface frame — the part that is true
   * whatever you are riding. `craft` carries everything local to the ride: the
   * walk bob, the roll of a turn, the nose of a climb. The avatar and the two
   * hulls are siblings inside it, so a bank rolls the pilot with the plane
   * without anything being reparented mid-flight.
   */
  const object = new THREE.Group();
  const craft = new THREE.Group();
  object.add(craft);
  /**
   * One group between the craft and the body, carrying nothing but where the
   * body is *mounted*.
   *
   * It exists because a seat is the vehicle's number and a pose is the body's,
   * and neither file may restate the other's. `vehicles.ts` publishes
   * `PLANE_SEAT` as the seat *surface* — hip at that point, which is the crowd
   * kit's convention and the one that means no craft has to own a leg length —
   * and `sit` shifts the whole body by `avatar.group.position` for reasons of
   * its own. `seatOn` cancels that shift and puts the hip on the seat, so a
   * change to either end cannot silently bury the pilot in his own cockpit,
   * which is exactly what happened when the fuselage was 4.4 across and the
   * model was dropped 0.9 into it.
   */
  const seat = new THREE.Group();
  craft.add(seat, boat, plane.group);
  seat.add(avatar.group);
  boat.visible = false;
  plane.group.visible = false;

  /** Put the avatar's hip on a craft's published seat. */
  function seatOn(mount: { y: number; z: number }): void {
    seat.position.set(
      -avatar.group.position.x,
      mount.y - AVATAR_HIP - avatar.group.position.y,
      mount.z - avatar.group.position.z,
    );
  }

  const position = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const forward = new THREE.Vector3(0, 0, 1);

  let vehicle: Vehicle = 'foot';

  // Tangent velocity on foot. Keeping it as a vector rather than a scalar is
  // what gives movement its weight: a change of direction has to bleed off the
  // old one. The vehicles use the scalar below instead, because a hull and a
  // fuselage have a bow — they turn, they do not slide sideways.
  const motion = new THREE.Vector3();
  let speed = 0;
  let velocity = 0;

  let height = 0;
  let vertical = 0;
  let airborne = false;
  let lean = 0;

  /** Flight state. `altitude` is above sea level, not above the ground. */
  let altitude = 0;
  let targetAltitude = PLANE_CIRCUIT;
  let landing = false;
  let turnRate = 0;
  /** How far the plane is rolled into a turn, -1 to 1, positive to the left. */
  let roll = 0;
  let climbRate = 0;
  let swell = 0;
  /** The movement keys as a craft reads them; see `levers`. */
  const stick = { x: 0, y: 0 };

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
  /** What one frame on foot moves the body, as a tangent vector. */
  const moved = new THREE.Vector3();

  /**
   * The walls, laid flat. `slide` works in a plane and the planet is not one, so
   * each frame puts a tangent plane at the player — `flatX` along the facing,
   * `flatZ` beside it — and this translates between the two. A frame covers 13
   * units at most and over 13 units the plane misses the sphere by 0.005, so the
   * pushes are the settlements' own, only re-expressed.
   */
  const origin = new THREE.Vector3();
  const flatX = new THREE.Vector3();
  const flatZ = new THREE.Vector3();
  const query = new THREE.Vector3();
  const pushed = new THREE.Vector3();
  const spot = new THREE.Vector3();
  const body: Body = { x: 0, z: 0, vx: 0, vz: 0 };
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

  const controls: Player['controls'] = { lift: 0, command: null };

  /**
   * The surface a foot stands on: the relief, or whatever was built on it.
   *
   * `terrain.ts`'s `reliefAt` is still the one definition of the relief and
   * `groundRadius` is still the one way to ask it — this is a *made* surface on
   * top, and the higher of the two wins because a plinth and a carriageway are
   * both things you stand on rather than sink into. A made surface only ever
   * exists over land, so the water test upstream of this is unaffected: the boat
   * is entered by the relief being the sea, and the sea has nothing built on it.
   *
   * The craft are deliberately left alone. A hull rides at `BOAT_DECK` on the
   * water and a fuselage clears the ground by `PLANE_CLEARANCE`, and neither of
   * those is a foot on a pavement; the plane's own landing floor is the relief,
   * so it cannot touch down on a kerb.
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

  function board(): void {
    vehicle = 'boat';
    speed = clamp(Math.max(speed, motion.length()), 0, BOAT_SPEED);
    motion.set(0, 0, 0);
    vertical = 0;
    airborne = false;
    landing = false;
    height = PLANET_RADIUS + BOAT_DECK;
    position.setLength(height);
  }

  function takeOff(): void {
    vehicle = 'plane';
    landing = false;
    altitude = position.length() - PLANET_RADIUS;
    // A take-off climbs to the circuit on its own. Holding the climb key from
    // there is what turns the flight into the map.
    targetAltitude = Math.max(PLANE_CIRCUIT, altitude);
    speed = Math.max(speed, motion.length(), PLANE_CRUISE_LOW * 0.5);
    motion.set(0, 0, 0);
    vertical = 0;
    airborne = true;
    // Wings level: whatever the last flight ended on is not this one's turn.
    roll = 0;
  }

  function touchDown(ground: number): void {
    landing = false;
    // Coming down over water is not a failed landing: it is the boat. Which is
    // also the promise that a landing can never strand you on the sea.
    if (isWater(ground)) {
      board();
      return;
    }
    vehicle = 'foot';
    height = ground;
    position.setLength(height);
    // The landing rolls out rather than stopping dead, capped at a run so the
    // walk controller inherits a speed it knows what to do with.
    motion.copy(forward).multiplyScalar(Math.min(speed, RUN_SPEED));
    speed = 0;
    vertical = 0;
    airborne = false;
  }

  /**
   * Steps out of the boat onto the nearest land, or refuses.
   *
   * Refusing is the point: in open ocean there is nowhere to stand, and putting
   * the player there is the one way this design could strand anyone. The reach
   * has to clear the coastal cliff by more than the hull, or you disembark onto
   * the lip and the next frame drops you straight back in.
   */
  function goAshore(): boolean {
    const arc = SHORE_REACH / position.length();
    for (let i = 0; i < ASHORE_DIRECTIONS; i++) {
      // Nearest the bow first, alternating sides, so you climb out over the
      // side you were pointing at.
      const angle = Math.ceil(i / 2) * (i % 2 === 0 ? 1 : -1) * (TAU / ASHORE_DIRECTIONS);
      direction.copy(forward);
      if (angle !== 0) direction.applyAxisAngle(up, angle).normalize();
      pointAhead(direction, arc, probe);
      const ground = groundRadius(world, probe);
      if (isWater(ground)) continue;

      position.copy(probe);
      up.copy(position).normalize();
      forward.copy(direction).projectOnPlane(up).normalize();
      height = ground;
      position.setLength(height);
      vehicle = 'foot';
      speed = 0;
      motion.set(0, 0, 0);
      vertical = 0;
      airborne = false;
      return true;
    }
    return false;
  }

  /**
   * The frame's move through whatever is standing: `moved` becomes the
   * displacement and `motion` what the walls left of it. True if a wall was
   * touched.
   */
  function throughWalls(dt: number, walls: Walls): boolean {
    origin.copy(position);
    flatX.copy(forward);
    flatZ.crossVectors(up, flatX).normalize();
    body.x = 0;
    body.z = 0;
    body.vx = motion.dot(flatX);
    body.vz = motion.dot(flatZ);
    const outcome = slide(body, dt, BODY_RADIUS, walls);
    moved.copy(flatX).multiplyScalar(body.x).addScaledVector(flatZ, body.z);
    motion.copy(flatX).multiplyScalar(body.vx).addScaledVector(flatZ, body.vz);
    return outcome !== 'clear';
  }

  function walk(dt: number, input: PlayerInput): void {
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

    target.copy(wish).multiplyScalar((input.run ? RUN_SPEED : WALK_SPEED) * amount);
    motion.projectOnPlane(up);
    motion.lerp(target, approach((airborne ? AIR_CONTROL : 1) / ACCELERATION_TIME, dt));
    velocity = motion.length();
    // Otherwise the exponential leaves a millimetre per second of drift for ever.
    if (velocity < 0.05 && amount === 0) {
      motion.set(0, 0, 0);
      velocity = 0;
    }

    if (input.jump && !airborne) {
      vertical = JUMP_SPEED;
      airborne = true;
    }

    // What the frame actually moves: the motion, or in a town what the walls
    // leave of it. `velocity` is read again afterwards, so a man pressed flat
    // against a wall reports standing still and his walk cycle stops with him.
    moved.copy(motion).multiplyScalar(dt);
    let walled = false;
    if (walls !== null) {
      walled = throughWalls(dt, walls);
      velocity = motion.length();
    }
    const distance = moved.length();
    if (distance > 1e-9) {
      const arc = distance / position.length();
      axis.crossVectors(up, moved).normalize();
      position.applyAxisAngle(axis, arc);
      motion.applyAxisAngle(axis, arc);
      forward.applyAxisAngle(axis, arc).normalize();
      up.copy(position).normalize();
    }
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

    const ground = standingRadius(position);
    if (airborne) {
      vertical -= GRAVITY * dt;
      height += vertical * dt;
      if (height <= ground) {
        height = ground;
        vertical = 0;
        airborne = false;
      }
    } else if (ground >= height) {
      // Uphill. Follow it exactly: see HEIGHT_SMOOTHING.
      height = ground;
    } else if (ground < height - STEP_DOWN) {
      // Walked off a cliff. Falling is the honest answer; sliding down the
      // face of a 20-unit coast is not.
      airborne = true;
      vertical = 0;
    } else {
      height += (ground - height) * approach(HEIGHT_SMOOTHING, dt);
    }
    position.setLength(height);

    // Walk into the sea and you are in the boat. That is the whole entry: no
    // key, no jetty, and no way left to walk on water — which is what the sea
    // did until this existed.
    if (!airborne && isWater(ground)) board();
  }

  function sail(dt: number, input: PlayerInput): void {
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

    const radius = position.length();
    const travel = speed * dt;
    if (travel !== 0) {
      direction.copy(forward);
      let arc = 0;
      if (travel < 0) {
        // Astern there is nothing to slide along, so it is stop or go.
        if (clearAhead(direction.copy(forward).negate(), -(travel - BOAT_BOW) / radius)) {
          arc = travel / radius;
          direction.copy(forward);
        } else speed = 0;
      } else {
        let deflected = 0;
        let clear = false;
        for (const deflection of DEFLECTIONS) {
          direction.copy(forward);
          if (deflection !== 0) direction.applyAxisAngle(up, deflection).normalize();
          if (!clearAhead(direction, (travel + BOAT_BOW) / radius)) continue;
          arc = (travel * Math.cos(deflection)) / radius;
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

    // The deck rides at a fixed height, so the water is a floor with no
    // smoothing to settle: there is nothing under it that varies.
    position.setLength(PLANET_RADIUS + BOAT_DECK);
    velocity = Math.abs(speed);
  }

  function fly(dt: number, input: PlayerInput): void {
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

    // Speed rides altitude: see `PLANE_CRUISE_LOW` in `vehicles.ts`. Low is
    // scenic, high is how an ocean gets crossed.
    const fraction = clamp(altitude / PLANE_CEILING, 0, 1);
    const cruise = mix(PLANE_CRUISE_LOW, PLANE_CRUISE_HIGH, fraction);
    const wanted = landing
      ? PLANE_CRUISE_LOW * 0.55
      : cruise * (1 + stick.y * 0.35) * (input.run ? PLANE_BOOST : 1);
    speed += (wanted - speed) * approach(1 / (landing ? PLANE_LANDING_TIME : PLANE_ACCELERATION_TIME), dt);

    if (landing) targetAltitude = 0;
    else if (controls.lift !== 0) {
      targetAltitude = clamp(
        targetAltitude * Math.exp(controls.lift * CLIMB_RATE * dt),
        PLANE_FLOOR,
        PLANE_CEILING,
      );
    }
    altitude += (targetAltitude - altitude) * approach(ALTITUDE_RATE, dt);

    const before = position.length();
    advance(forward, (speed * dt) / before);

    const ground = groundRadius(world, position);
    const floor = ground + PLANE_CLEARANCE;
    const radius = Math.max(floor, PLANET_RADIUS + altitude);
    climbRate = dt > 0 ? (radius - before) / dt : 0;
    position.setLength(radius);
    // The ground has the last word, and then the altitude is read back from it.
    // That is what makes flying into the planet impossible: a ridge rising under
    // the plane lifts it, and because the request is updated too, the far side
    // is a glide down instead of a fall off the edge.
    altitude = radius - PLANET_RADIUS;

    velocity = speed;
    if (landing && radius <= floor + 0.5) touchDown(ground);
  }

  /**
   * The launch's heel, eased after its rudder.
   *
   * A left turn is a positive `turnRate` and comes out here as a positive roll,
   * which in `pose`'s basis leans the hull right — *out* of the turn, as a
   * displacement hull heels. The plane used to come through here too and banked
   * outward with it, which for a wing is simply wrong; it rolls through `roll`
   * now, into the turn.
   */
  function bank(dt: number, limit: number, rate: number): void {
    const wanted = clamp(turnRate / rate, -1, 1) * limit;
    lean += (wanted - lean) * approach(BANK_SMOOTHING, dt);
  }

  function pose(dt: number, speed_: number): void {
    // The basis is right-handed with the avatar facing +Z, which puts local +X
    // on its left. Rolling about +Z therefore leans it right, and a left turn
    // (a positive rotation about `up`) needs a negative roll.
    side.crossVectors(up, forward).normalize();
    basis.makeBasis(side, up, forward);
    object.quaternion.setFromRotationMatrix(basis);
    object.position.copy(position);

    boat.visible = vehicle === 'boat';
    plane.group.visible = vehicle === 'plane';
    craft.position.set(0, 0, 0);
    craft.rotation.set(0, 0, 0);
    // On foot and in the boat the body stands on the origin and owns its own
    // offset: `steer` drops it 0.08 to put the soles back on the deck after the
    // soft knees have shortened it, and cancelling that would float him. Only a
    // *seat* is the vehicle's to place — and it is also why the launch's frame
    // and the body's are the same frame, which is what lets `steer` write the
    // wheel's grip points in the boat's own numbers.
    seat.position.set(0, 0, 0);

    if (vehicle === 'plane') {
      avatar.sit(dt);
      seatOn(PLANE_SEAT);
      // The bank *is* the turn — `fly` reads the turn off `roll` — so it is
      // taken as it stands rather than eased a second time, and it goes into
      // the turn: a left roll is a positive `roll` and, per the basis above, a
      // negative lean.
      lean = -roll * PLANE_BANK;
      // Nose follows the actual climb rate, so the attitude is the flight path
      // rather than a decoration: negative pitches it up.
      const nose = -clamp(Math.atan2(climbRate, Math.max(speed_, 1)), -MAX_NOSE, MAX_NOSE);
      craft.rotation.set(nose, 0, lean);
      plane.propeller.rotation.z += dt * (8 + speed_ * 0.03);
      return;
    }

    if (vehicle === 'boat') {
      bank(dt, BOAT_HEEL, BOAT_TURN);
      // A swell, so a moored boat is not a parked box. Two frequencies that do
      // not divide, or the roll and the pitch beat together and it reads as a
      // loop.
      swell += dt;
      const heel = lean + Math.sin(swell * 0.9) * 0.05;
      // The hull rolls by `heel` and the body is handed the same number, so it
      // can give some of it back: standing on a moving deck is a thing you do
      // with your spine, and it is the only cue that the sea is moving at all
      // when the boat is stopped. `steer` keeps the hands on the wheel while it
      // happens, so what rolls is the man and not his grip.
      avatar.steer(dt, heel);
      craft.position.y = Math.sin(swell * 1.3) * 0.32;
      craft.rotation.set(Math.sin(swell * 0.7) * 0.035, 0, heel);
      return;
    }

    // On foot the avatar owns its own vertical bob and lateral sway, so `craft`
    // carries only the roll of a turn. Putting the bob on `craft` would move
    // the boat and the plane with it.
    avatar.stride(dt, speed_, airborne);
    craft.rotation.z = lean;
  }

  const player: Player = {
    object,
    position,
    forward,
    up,
    velocity: 0,
    airborne: false,
    vehicle,
    altitude: 0,
    controls,
    update(dt, input) {
      if (input.fly === true) controls.command = 'fly';
      if (input.exit === true) controls.command = 'exit';
      if (input.climb !== undefined || input.dive !== undefined) {
        controls.lift = (input.climb === true ? 1 : 0) - (input.dive === true ? 1 : 0);
      }

      up.copy(position).normalize();
      // Reproject every tick: accumulated floating-point error would slowly
      // lift the heading off the surface.
      forward.projectOnPlane(up).normalize();

      const command = controls.command;
      controls.command = null;
      if (command !== null) {
        // In the air both keys mean the same thing — come down — and pressing
        // again on the way down is a go-around rather than a second landing.
        if (vehicle === 'plane') {
          landing = !landing;
          if (!landing) targetAltitude = Math.max(PLANE_CIRCUIT, altitude);
        } else if (command === 'fly') takeOff();
        else if (vehicle === 'boat') goAshore();
      }

      if (vehicle === 'plane') fly(dt, input);
      else if (vehicle === 'boat') sail(dt, input);
      else walk(dt, input);

      player.velocity = velocity;
      player.airborne = airborne || vehicle === 'plane';
      player.vehicle = vehicle;
      player.altitude = position.length() - PLANET_RADIUS;
      pose(dt, velocity);
    },
    setBodyVisible(visible) {
      avatar.group.visible = visible;
    },
    goTo(lat, lon) {
      const phi = (90 - lat) * DEG;
      const theta = lon * DEG;
      position.set(Math.sin(phi) * Math.cos(theta), Math.cos(phi), -Math.sin(phi) * Math.sin(theta));
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

      motion.set(0, 0, 0);
      speed = 0;
      velocity = 0;
      vertical = 0;
      airborne = false;
      lean = 0;
      // The walk cycle, the airborne blend and the breath all live in the
      // avatar now, and a teleport has to clear them or the first frame in
      // Tokyo is mid-stride from Paris.
      avatar.reset();
      turnRate = 0;
      roll = 0;
      climbRate = 0;
      altitude = 0;
      targetAltitude = PLANE_CIRCUIT;
      landing = false;
      controls.lift = 0;
      controls.command = null;
      vehicle = 'foot';
      // Teleporting into the ocean lands you in the boat, for the same reason
      // walking into it does: there is nothing there to stand on.
      if (isWater(height)) board();

      player.velocity = 0;
      player.airborne = false;
      player.vehicle = vehicle;
      player.altitude = position.length() - PLANET_RADIUS;
      pose(0, 0);
    },
  };

  player.goTo(startLat, startLon);
  return player;
}
