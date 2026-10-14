/**
 * The controller's shared state. Every mode (walk, swim, road, water, air...)
 * is built over one `PlayerCore`: the scene groups the body and the ridden
 * vehicle hang from, the vectors the modes write their answers into in turn, and
 * the mutable fields (`fields`) that make up what the player is doing.
 */
import * as THREE from 'three';
import type { Avatar } from '../avatar.ts';
import { buildAvatar } from '../avatar.ts';
import type { World } from '../geo.ts';
import { groundRadius } from '../globe.ts';
import type { PlayerState } from '../craft/contract.ts';
import type { CraftMotion } from '../craft/motion.ts';
import { newChuteSwing } from '../craft/parachute.ts';
import { buildSplash } from '../vehicles.ts';
import { CRASH_QUIET, REFUSAL_QUIET, SPLASH_TIME, SWIM_SPLASH } from './constants.ts';
import type { Player, PlayerOptions, Ride } from './types.ts';

/** The vehicle held: the ride handed over by the fleet, and its springs, wheels and propeller (`craft/motion.ts`). */
export interface Held extends Ride {
  motion: CraftMotion;
}

/** What the player is doing, field by field. Only the modes write these. */
export interface PlayerFields {
  state: PlayerState;
  /** On a bench: nothing moves the root until a key does (`sitOn`). */
  sitting: boolean;
  ride: Held | null;
  /** A plane or a balloon standing on the ground. */
  grounded: boolean;
  bodyWanted: boolean;
  /** First person in a seat: see `setCockpit`. */
  cockpit: boolean;
  /** Out of an aircraft: falling (`chute` true, `canopy` 0) and under the canopy (`canopy` its age, seconds). */
  chute: boolean;
  canopy: number;
  /** How much of the body's pose is the canopy's rather than the fall's, eased. */
  spread: number;
  parachute: THREE.Group | null;
  /** The climb, measured over the frame. */
  climb: number;
  /** Out of a moving vehicle and not yet down: the landing is a roll. */
  tumbling: boolean;
  speed: number;
  velocity: number;
  height: number;
  vertical: number;
  airborne: boolean;
  /** The gait's phase last frame, to see a heel strike go by. */
  lastStep: number;
  lean: number;
  /** How far the body hangs under `position`, swimming. */
  sink: number;
  /** How far under the surface, diving, and how fast it is going down (positive) or up. */
  dive: number;
  diveRate: number;
  /** How much of the body's pose is the diver's, eased, 0 at the surface. */
  under: number;
  /** Seconds since the vehicle at the controls met the water, -1 on dry ground, and the way it had on then. */
  founder: number;
  founderWay: number;
  /** A car's or a taxiing plane's nose, following the ground under it. */
  tilt: number;
  /** The launch's bow up onto the plane; the balloon's swing out of a turn, and how far it hangs free. */
  bowLift: number;
  swing: number;
  aloft: number;
  /** Altitude above sea level, not above the ground. */
  altitude: number;
  /** The plane's vertical speed, eased towards what the keys ask. */
  climbing: number;
  /** Seconds of a go-around left after a refused landing, or of the climb-out. */
  goAround: number;
  /** A plane down from a landing, its take-off run shut until the throttle is let go. */
  rolling: boolean;
  /** The wheel, the rudder or the balloon's swing, eased after the key: -1 to 1, positive to the right. */
  steering: number;
  /** Seconds since a crash was last told. */
  sinceCrash: number;
  turnRate: number;
  /** How far the plane is rolled into a turn, -1 to 1, positive to the left. */
  roll: number;
  climbRate: number;
  swell: number;
  /** How hard a vehicle on wheels is pulling away, eased; and a motorbike's front wheel off the road for it. */
  surge: number;
  wheelie: number;
  /** A helicopter's rotor winding up on the ground, seconds of it, and its nose down into its speed. */
  spool: number;
  nose: number;
  /** A helicopter's height over what is under it, and whether that is water. */
  clearance: number;
  overWater: boolean;
  /** Seconds since a landing was last refused out loud. */
  sinceRefusal: number;
  /** A passenger's position was recorded last frame (`carried`). */
  carriedFrom: boolean;
  /** The air walls' query: the height asked at, whether it is low enough for `collide`, and the balloon's or helicopter's envelope. */
  airHeight: number;
  airLow: boolean;
  airEnvelope: number;
  airEnvelopeHeight: number;
  /** The splash ring's age and its widest radius. */
  splashAge: number;
  splashReach: number;
}

export interface PlayerCore {
  readonly world: World;
  readonly options: PlayerOptions;
  readonly fields: PlayerFields;
  /** The player object itself, set by `createPlayer` once built. */
  player: Player;
  readonly avatar: Avatar;
  /** Carries the position and the surface frame. */
  readonly object: THREE.Group;
  /** Carries everything local to the ride: the roll of a turn, the nose of a climb, a boat's swell. */
  readonly craft: THREE.Group;
  /** Where the body is mounted on a seat; while swimming, the pivot the body pitches forward on. */
  readonly seat: THREE.Group;
  /** Carries only how far the body hangs below the water. */
  readonly hang: THREE.Group;
  /** The ring left on the water or the ground. */
  readonly splash: ReturnType<typeof buildSplash>;
  readonly position: THREE.Vector3;
  readonly up: THREE.Vector3;
  readonly forward: THREE.Vector3;
  /** Tangent velocity on foot, a vector so that a change of direction bleeds off the old one. */
  readonly motion: THREE.Vector3;
  readonly controls: Player['controls'];
  /** The movement keys as a vehicle reads them: see `levers`. */
  readonly stick: { x: number; y: number };
  /** What the walk tells the body besides its speed: how fast it turned, and how far the camera looks off its facing. */
  readonly cues: { turn: number; look: number };
  readonly chuteSwing: ReturnType<typeof newChuteSwing>;
  readonly chuteTrail: [number, number];
  /** Where a passenger was last frame, for his speed. */
  readonly carried: THREE.Vector3;
  // Scratch vectors, set before they are read.
  readonly heading: THREE.Vector3;
  readonly side: THREE.Vector3;
  readonly wish: THREE.Vector3;
  readonly target: THREE.Vector3;
  readonly direction: THREE.Vector3;
  readonly axis: THREE.Vector3;
  readonly probe: THREE.Vector3;
  readonly bow: THREE.Vector3;
  /** What one frame moves the body, as a tangent vector. */
  readonly moved: THREE.Vector3;
  readonly query: THREE.Vector3;
  readonly pushed: THREE.Vector3;
  readonly spot: THREE.Vector3;
  readonly airPushed: THREE.Vector3;
  readonly worldQuaternion: THREE.Quaternion;
  readonly LOCAL_Y: THREE.Vector3;
  readonly LOCAL_Z: THREE.Vector3;
  readonly collide: PlayerOptions['collide'];
  readonly freeSpotNear: PlayerOptions['freeSpotNear'];
  readonly collideAloft: PlayerOptions['collideAloft'];
  /** The land under a point: see `PlayerOptions.groundAt`. */
  landAt(at: THREE.Vector3): number;
  /**
   * The surface a foot or a wheel stands on: the relief, or whatever was built
   * on it, whichever is higher (a plinth and a carriageway are both things you
   * stand on rather than sink into).
   */
  standingRadius(at: THREE.Vector3): number;
}

export function createPlayerCore(world: World, options: PlayerOptions): PlayerCore {
  const avatar: Avatar = buildAvatar();
  const object = new THREE.Group();
  const craft = new THREE.Group();
  object.add(craft);
  // A model publishes its seats with the hip on the seat surface, and `sit`
  // shifts the whole body by `avatar.group.position`; `seatOn` cancels that
  // shift, so neither end restates the other's numbers.
  const seat = new THREE.Group();
  const hang = new THREE.Group();
  craft.add(seat);
  seat.add(hang);
  hang.add(avatar.group);

  const splash = buildSplash();
  splash.visible = false;

  const fields: PlayerFields = {
    state: 'foot',
    sitting: false,
    ride: null,
    grounded: false,
    bodyWanted: true,
    cockpit: false,
    chute: false,
    canopy: 0,
    spread: 0,
    parachute: null,
    climb: 0,
    tumbling: false,
    speed: 0,
    velocity: 0,
    height: 0,
    vertical: 0,
    airborne: false,
    lastStep: 0,
    lean: 0,
    sink: 0,
    dive: 0,
    diveRate: 0,
    under: 0,
    founder: -1,
    founderWay: 0,
    tilt: 0,
    bowLift: 0,
    swing: 0,
    aloft: 0,
    altitude: 0,
    climbing: 0,
    goAround: 0,
    rolling: false,
    steering: 0,
    sinceCrash: CRASH_QUIET,
    turnRate: 0,
    roll: 0,
    climbRate: 0,
    swell: 0,
    surge: 0,
    wheelie: 0,
    spool: 0,
    nose: 0,
    clearance: Infinity,
    overWater: false,
    sinceRefusal: REFUSAL_QUIET,
    carriedFrom: false,
    airHeight: 0,
    airLow: false,
    airEnvelope: 0,
    airEnvelopeHeight: 0,
    splashAge: SPLASH_TIME,
    splashReach: SWIM_SPLASH,
  };

  const landAt = options.groundAt ?? ((at: THREE.Vector3): number => groundRadius(world, at));

  function standingRadius(at: THREE.Vector3): number {
    const relief = landAt(at);
    if (options.madeHeightAt === undefined) return relief;
    const made = options.madeHeightAt(at);
    return made > relief ? made : relief;
  }

  return {
    world,
    options,
    fields,
    player: undefined as unknown as Player,
    avatar,
    object,
    craft,
    seat,
    hang,
    splash,
    position: new THREE.Vector3(),
    up: new THREE.Vector3(0, 1, 0),
    forward: new THREE.Vector3(0, 0, 1),
    motion: new THREE.Vector3(),
    controls: { lift: 0 },
    stick: { x: 0, y: 0 },
    cues: { turn: 0, look: 0 },
    chuteSwing: newChuteSwing(),
    chuteTrail: [0, 0],
    carried: new THREE.Vector3(),
    heading: new THREE.Vector3(),
    side: new THREE.Vector3(),
    wish: new THREE.Vector3(),
    target: new THREE.Vector3(),
    direction: new THREE.Vector3(),
    axis: new THREE.Vector3(),
    probe: new THREE.Vector3(),
    bow: new THREE.Vector3(),
    moved: new THREE.Vector3(),
    query: new THREE.Vector3(),
    pushed: new THREE.Vector3(),
    spot: new THREE.Vector3(),
    airPushed: new THREE.Vector3(),
    worldQuaternion: new THREE.Quaternion(),
    LOCAL_Y: new THREE.Vector3(0, 1, 0),
    LOCAL_Z: new THREE.Vector3(0, 0, 1),
    collide: options.collide,
    freeSpotNear: options.freeSpotNear,
    collideAloft: options.collideAloft,
    landAt,
    standingRadius,
  };
}
