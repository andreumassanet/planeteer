import * as THREE from 'three';
import { AVATAR_HEIGHT, FIGURE } from '../avatar.ts';
import type { ClipName, Person } from '../cast.ts';
import { rngFrom } from '../scenery/random.ts';
import { createUmbrellas, type Umbrellas } from '../umbrella.ts';
import type { RigSource } from '../models.ts';
import { createDogs } from './dogs.ts';
import type { Dog, Dogs } from './dogs.ts';
import type { Folk } from './dressing.ts';

/** Where somebody stands, as the settlements publish it. */
export interface FolkAnchor {
  key: string;
  region: string;
  warmth: number;
  position: THREE.Vector3;
  /** The town's frame turned by this person's yaw: +Y is up, +Z is the way they face. */
  quaternion: THREE.Quaternion;
  /**
   * The two ends of the stretch of their own street this person may stroll
   * along, in world space: level, off the steps, clear of the parked car. Both
   * are `position` where there is no room to walk.
   */
  from: THREE.Vector3;
  to: THREE.Vector3;
  /** One of a pair standing talking, `quaternion` turned to face the other. */
  chatting: boolean;
  /**
   * Sitting, on a bench or a café chair: `position` is the sitter's root on
   * the paving and `quaternion` faces the way the seat does (`bench.ts`). A
   * chatting sitter talks with whoever sits across the table.
   */
  seated?: boolean;
  /**
   * Walking a city's middle crossing: its corners in world space, walked one
   * zebra at a time and back, each leg crossing the street whose traffic runs
   * along `axes[k]`, at the walk light of the town `signalTown` (`signals.ts`).
   */
  crossing?: { corners: THREE.Vector3[]; axes: (0 | 1)[]; signalTown: number };
  /** The town's own frame, with no yaw: what a person is turned in. */
  town: THREE.Quaternion;
  distance: number;
}

export interface FolkSource {
  /** Every standing person inside `radius` of `viewer`, appended to `out`. */
  folkNear(viewer: THREE.Vector3, radius: number, out: FolkAnchor[]): void;
}

/** Somebody the player could talk to: `Townsfolk.nearest`'s answer, one reused object. */
export interface Talker {
  key: string;
  /** Where their feet are now, in world space. Live while they stand. */
  position: THREE.Vector3;
  /** How tall they were dressed. */
  height: number;
  /** From the point asked about, along the ground. */
  distance: number;
}

/** How far from the player people are standing. Past this a person is a few pixels tall. */
export const TOWNSFOLK_RADIUS = 110;
/** How many at once. Each is one skinned draw, twice with the ink. */
export const TOWNSFOLK_CAP = 40;
/** How many are dressed in one frame, so walking into a square is not a hitch. */
export const DRESS_PER_FRAME = 3;
/** Past this, a person's clip is advanced every few frames rather than every one. */
export const NEAR_ANIMATION = 40;

/**
 * How wide a standing person is to a body that walks into them: the hero's
 * own shoulders, `FIGURE.shoulderHalf`, which is also the clearance the town
 * keeps them off its steps by.
 */
export const PERSON_RADIUS = FIGURE.shoulderHalf;
/** How many of the people who have a stretch of street to walk actually walk it. */
export const STROLL_SHARE = 0.6;
/** A stroll is slower than the hero's walk, and on the same stride: see `WALK_STRIDE`. */
export const STROLL_PACE: readonly [number, number] = [0.6, 0.85];
/** Seconds a stroller stands at each end before turning back. */
export const STROLL_PAUSE: readonly [number, number] = [2, 9];
/** Radians a second a person turns: a quarter turn in about a third of a second. */
export const TURN_RATE = 4.5;
/** Seconds a walk and a stand take to cross-fade. */
export const BLEND_TIME = 0.25;
/**
 * A stroller sets off and pulls up rather than starting and stopping dead:
 * the pace follows what is wanted at `STROLL_EASE` a second, and slows over
 * the last `STROLL_SLOWING` units of the stretch to `STROLL_ARRIVE` of itself.
 * The walk's weight follows the pace, and its cycle the distance, so the feet
 * keep time with the ground all the way down to a stop.
 */
export const STROLL_EASE = 3;
export const STROLL_SLOWING = AVATAR_HEIGHT * 0.8;
export const STROLL_ARRIVE = 0.35;
/**
 * Which idle a standing person breathes to: mostly the relaxed one, some the
 * ready stance, some with their weight on one leg (the library's second idle),
 * by these shares.
 */
export const STANCES: readonly [ClipName, number][] = [
  ['Idle_Neutral', 0.6],
  ['Idle', 0.2],
  ['Idle_Shift', 0.2],
];
/**
 * Talking is the library's talking idle, hands and all, faded in over
 * `TALK_BLEND` seconds: all the while somebody is held in conversation by the
 * player, and by turns in a pair talking to each other, each of the two
 * speaking for `TALK_TURN` seconds and listening for as long.
 */
export const TALK_BLEND = 0.6;
export const TALK_TURN: readonly [number, number] = [3, 7];
/**
 * Inside this a person not otherwise busy turns their head to the player,
 * as far as `GLANCE_LIMIT` either side of where their body faces.
 */
export const GLANCE_REACH = AVATAR_HEIGHT * 3;
export const GLANCE_LIMIT = 1.1;

export const AXIS_UP = new THREE.Vector3(0, 1, 0);

export type Mode = 'stand' | 'stroll' | 'chat' | 'sit' | 'cross';

/**
 * Bumped into, or honked at: a person steps `STEP_ASIDE` away from what
 * startled them, easing there at `ASIDE_EASE` a second, stays aside for
 * `ASIDE_HOLD` seconds and drifts back. `HONK_REACH` is how near a horn
 * startles anybody.
 */
export const STEP_ASIDE = AVATAR_HEIGHT * 0.35;
export const ASIDE_EASE = 5;
export const ASIDE_HOLD = 2.5;
export const HONK_REACH = AVATAR_HEIGHT * 4;

export interface Standing {
  anchor: FolkAnchor;
  holder: THREE.Group;
  person: Person;
  mode: Mode;
  base: THREE.AnimationAction;
  walk: THREE.AnimationAction;
  talk: THREE.AnimationAction;
  /** How much of the standing pose is the talking one, 0 to 1. */
  talking: number;
  gesture: THREE.AnimationAction | null;
  gestureAt: number;
  nextGesture: number;
  owed: number;
  /** Which of the far frames this person animates on, so they do not all land on one. */
  lane: number;
  /** Where the feet are now, in world space. */
  position: THREE.Vector3;
  /** The yaw the body has and the one it is turning to, in the town's frame. */
  yaw: number;
  targetYaw: number;
  /** The yaw a standing or talking person turns back to when nothing else asks. */
  restYaw: number;
  /** A stroll: how far along `from -> to` (0 to 1), which way, and the length. */
  along: number;
  heading: 1 | -1;
  length: number;
  speed: number;
  /** The pace now, eased towards `speed` setting off and away from it pulling up. */
  pace: number;
  /** The yaw of `from -> to` in the town's frame. */
  strollYaw: number;
  /** Seconds left standing at the end of a stretch. */
  pause: number;
  /** A pair's turn at speaking, in seconds, and where in the turns this one starts; drawn once. */
  turnLength: number;
  speaksAt: number;
  /** How far into the walk cycle, 0 to 1, driven by the distance walked. */
  phase: number;
  /** How much of the walk is showing, 0 to 1. */
  walking: number;
  /** The head, for a glance, and its pose before the glance was put on it. */
  head: THREE.Bone | null;
  headRest: THREE.Quaternion;
  glance: number;
  /** Held in conversation by the player: stands, and faces them. */
  held: boolean;
  turns: number;
  /** A sitter's talking, its upper body only (`seatedTalk`); null for anybody standing. */
  seatTalk: THREE.AnimationAction | null;
  /** On a crossing: the corner it is at or leaving, along `anchor.crossing.corners`. */
  leg: number;
  /** Stepped aside: the offset from where it would be, where it is easing to, and the seconds left there. */
  aside: THREE.Vector3;
  asideTarget: THREE.Vector3;
  asideFor: number;
  /** What startled it, for a stander to turn to. */
  startledBy: THREE.Vector3;
  /** The dog it walks on a lead, once the rig has loaded (`dogs.ts`). */
  dog: Dog | null;
}

export interface Townsfolk {
  group: THREE.Group;
  /** `worldClock` is the traffic lights' clock in seconds (`signalClock` in `signals.ts`). */
  update(viewer: THREE.Vector3, dt: number, clock: number, frame: number, worldClock?: number): void;
  /**
   * Startles whoever stands within `HONK_REACH` of `point` (a horn, `horn`
   * true) or just by it (a bump): they step aside from it and look.
   */
  startle(point: THREE.Vector3, horn: boolean): void;
  /**
   * Adds to `push` the displacement along the ground that takes a body of
   * `radius` at `point` out of every standing person it overlaps, and says
   * whether it touched anybody. Only the dressed are solid: nobody further
   * than `TOWNSFOLK_RADIUS` is standing at all.
   */
  collide(point: THREE.Vector3, radius: number, push: THREE.Vector3): boolean;
  /** The nearest standing person within `reach` of `point`, or null. One reused object. */
  nearest(point: THREE.Vector3, reach: number): Talker | null;
  /**
   * Holds `key` in conversation — they stop, wave, and turn to face `towards`
   * each frame — or lets whoever was held go, with null. False when `key` is
   * not standing.
   */
  engage(key: string | null, towards?: THREE.Vector3): boolean;
  /** The rigs a dog is drawn from: the fauna's library, once it exists. */
  setRigs(rigs: RigSource): void;
  /** Where a standing person's crown is, written into `out`; false if they are not standing. */
  crownOf(key: string, out: THREE.Vector3): boolean;
  /**
   * `nearestMoving` is how far from the viewer the nearest person in the
   * middle of a gesture, a stroll or a sentence stands, or Infinity: `main.ts` redraws
   * the shadow map every frame while it is inside the box. An idle stance is
   * not counted — breathing moves a shadow by less than one of the map's
   * 0.29-unit texels.
   */
  readonly stats: { standing: number; animated: number; strolling: number; nearestMoving: number };
}

/** The shortest signed turn from `from` to `to`, in (-PI, PI]. */
export function turnBetween(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  else if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/** A deterministic draw in [0, 1) from a person's key and a salt. */
export const hash = (key: string, salt: string): number => rngFrom(key, salt).unit();

export const byDistance = (a: FolkAnchor, b: FolkAnchor): number => a.distance - b.distance;

/** Everything the streamer of standing people shares between its frames. */
export interface TownsfolkState {
  readonly group: THREE.Group;
  readonly folk: Folk;
  readonly source: FolkSource;
  readonly standing: Map<string, Standing>;
  readonly anchors: FolkAnchor[];
  readonly keep: Set<string>;
  readonly stats: Townsfolk['stats'];
  heldKey: string | null;
  readonly holdTowards: THREE.Vector3;
  viewerAt: THREE.Vector3;
  /** The clock of the last update, for a gesture started between two. */
  now: number;
  /** The sky's clock at the last update, in seconds: the walk lights'. */
  worldClock: number;
  // Scratch, so nothing in the frame allocates.
  readonly inverse: THREE.Quaternion;
  readonly local: THREE.Vector3;
  readonly turn: THREE.Quaternion;
  readonly upAxis: THREE.Vector3;
  readonly parentTurn: THREE.Quaternion;
  readonly ahead: THREE.Vector3;
  readonly gap: THREE.Vector3;
  readonly talker: Talker;
  /** The umbrellas the standing people put up in the rain (`umbrella.ts`). */
  readonly umbrellas: Umbrellas;
  /** The dogs some strollers walk (`dogs.ts`). */
  readonly dogs: Dogs;
}

export function createState(folk: Folk, source: FolkSource): TownsfolkState {
  const group = new THREE.Group();
  group.name = 'townsfolk';
  const umbrellas = createUmbrellas(TOWNSFOLK_CAP);
  group.add(umbrellas.mesh);
  return {
    group,
    folk,
    source,
    standing: new Map<string, Standing>(),
    anchors: [],
    keep: new Set<string>(),
    stats: { standing: 0, animated: 0, strolling: 0, nearestMoving: Infinity },
    heldKey: null,
    holdTowards: new THREE.Vector3(),
    viewerAt: new THREE.Vector3(),
    now: 0,
    worldClock: 0,
    inverse: new THREE.Quaternion(),
    local: new THREE.Vector3(),
    turn: new THREE.Quaternion(),
    upAxis: new THREE.Vector3(),
    parentTurn: new THREE.Quaternion(),
    ahead: new THREE.Vector3(),
    gap: new THREE.Vector3(),
    talker: { key: '', position: new THREE.Vector3(), height: 0, distance: 0 },
    umbrellas,
    dogs: createDogs(),
  };
}
