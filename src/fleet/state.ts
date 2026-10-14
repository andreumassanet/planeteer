/** What the fleet's parts share: the vehicles built, the seat in hand, and the scratch the parts write into in turn. */
import * as THREE from 'three';
import type { CraftModel, FleetLink, WirePose } from '../craft/contract.ts';
import type { CraftMotion } from '../craft/motion.ts';
import type { ParkedCar } from '../settlements.ts';
import type { FleetSite, SiteIndex } from './site-types.ts';
import type { FleetOptions, Prompt } from './types.ts';

/** A vehicle built (or pooled), with the frames of its seats and its motion. */
export interface Drawn {
  id: string;
  model: CraftModel;
  variant: number;
  /** Its model, variant and paint, which is what a spare is kept and found by. */
  key: string;
  group: THREE.Group;
  seats: THREE.Object3D[];
  site: FleetSite | null;
  /**
   * `sites.byId` asked and found none: a town's car taken from its kerb, whose
   * id no site has. Pure, so asked once and not every frame.
   */
  siteless: boolean;
  /** Seconds to the next re-seat, for a vehicle standing at its site. */
  reseat: number;
  /** Its springs, wheels and propeller: `craft/motion.ts`. */
  motion: CraftMotion;
  /**
   * Somebody else's vehicle, as its poses imply it is going: where it was and
   * which way it faced last frame, and the speed and turn read off the two,
   * smoothed. `tracked` is false until there is a last frame to read.
   */
  last: THREE.Vector3;
  lastForward: THREE.Vector3;
  tracked: boolean;
  speed: number;
  turn: number;
}

/** An airstrip standing: its mesh, its windsock and the windsock's pivot, and the site it is for. */
export interface DrawnStrip {
  site: FleetSite;
  group: THREE.Group;
  strip: THREE.Mesh;
  sock: THREE.Object3D | null;
  /** Where the middle of the strip is, as a point at the ground, for its distance. */
  middle: THREE.Vector3;
  /** The wind's own bearing here, off straight down the strip, and a phase for its gusts. */
  wind: number;
  phase: number;
}

/** A vehicle somebody jumped out of, going on without anybody until it parks. */
export interface Coast {
  entry: Drawn;
  position: THREE.Vector3;
  forward: THREE.Vector3;
  speed: number;
  /** Units a second away from the planet's centre. */
  vertical: number;
  age: number;
  /** Aloft when it was let go of, and not yet down. */
  flying: boolean;
  /** Seconds since it met the water, if it is not a boat (`founders`); -1 until then. */
  sinking: number;
}

/** The fleet's mutable state, one object so that its parts can change it. */
export interface FleetState {
  /** The vehicle the player is in, and the seat. */
  held: Drawn | null;
  heldSeat: number;
  /** A claim is out on the link. */
  pending: boolean;
  /** When `E` was last acted on. */
  usedAt: number;
  /** Seconds the seat in hand has not been ours on the link, and the claims made for it since. */
  lostFor: number;
  lostTries: number;
  prompt: Prompt | null;
  /** The parked car the prompt is for, when it is one of a town's. */
  promptBay: ParkedCar | null;
  /** Seconds since the candidates were worked out; Infinity forces a rescan. */
  scanAge: number;
  coast: Coast | null;
}

export interface FleetContext {
  readonly options: FleetOptions;
  readonly models: ReadonlyMap<string, CraftModel>;
  readonly link: FleetLink;
  readonly sites: SiteIndex;
  readonly group: THREE.Group;
  readonly drawn: Map<string, Drawn>;
  readonly pool: Map<string, Drawn[]>;
  /** The towns' parked cars the fleet has taken over, by id, and where each stood. */
  readonly bayPose: Map<string, WirePose>;
  /**
   * The colour each vehicle a town parks was parked in, by id: a function of
   * the id alone, so a car taken in another session or by somebody else comes
   * back in it. Null, kept as such, for the craft's own look.
   */
  readonly paints: Map<string, number | null>;
  readonly state: FleetState;
  /** Scratch shared by every part; each sets it before it reads it. */
  readonly point: THREE.Vector3;
  readonly up: THREE.Vector3;
  readonly centre: THREE.Vector3;
  readonly pose: WirePose;
}

export function createFleetContext(options: FleetOptions, sites: SiteIndex): FleetContext {
  const group = new THREE.Group();
  group.name = 'fleet';
  return {
    options,
    models: options.models,
    link: options.link,
    sites,
    group,
    drawn: new Map(),
    pool: new Map(),
    bayPose: new Map(),
    paints: new Map(),
    state: {
      held: null,
      heldSeat: 0,
      pending: false,
      usedAt: -Infinity,
      lostFor: 0,
      lostTries: 0,
      prompt: null,
      promptBay: null,
      scanAge: Infinity,
      coast: null,
    },
    point: new THREE.Vector3(),
    up: new THREE.Vector3(),
    centre: new THREE.Vector3(),
    pose: new Array(9).fill(0),
  };
}
