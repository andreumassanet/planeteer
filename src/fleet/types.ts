import type * as THREE from 'three';
import type { CraftKind, CraftModel, FleetLink, FleetSeats, WirePose } from '../craft/contract.ts';
import type { Player } from '../player/types.ts';
import type { ParkedCar } from '../settlements.ts';
import type { FleetSource, SiteIndex } from './site-types.ts';

/**
 * What happened, for whoever tells the player: `bailed` is getting out of a
 * vehicle under way or aloft, which goes on without the player; `wrecked` is
 * one of those coming down hard, or into a wall, with where it happened;
 * `foundered` is one meeting the water, and `sank` any vehicle going under it,
 * with where.
 */
export type FleetEvent = 'boarded' | 'left' | 'taken' | 'leave-refused' | 'bailed' | 'wrecked' | 'foundered' | 'sank';

export interface FleetOptions extends FleetSource {
  models: ReadonlyMap<string, CraftModel>;
  /**
   * The sites, if the caller already built them over the same source (so the
   * wood and the herds can keep off the fields). One index means one road
   * index and one set of searches.
   */
  sites?: SiteIndex;
  link: FleetLink;
  player: Player;
  /**
   * How high the made ground stands here, as a radius, or 0: the same
   * callback the player stands on, so a parked car is on the carriageway a
   * foot walks on and not on the relief under it.
   */
  madeHeightAt?: (point: THREE.Vector3) => number;
  /**
   * The cars parked in the towns, which are merged into them until somebody
   * takes one (`ParkedCar` in `settlements.ts`): where they are, and a way to
   * take one out of its town so the fleet's is the only one drawn.
   */
  parked?: {
    near(viewer: THREE.Vector3, radius: number, out: ParkedCar[]): void;
    hide(id: string): void;
    /** Puts one back in its town, nobody having it any more. */
    show?(id: string): void;
    /**
     * The colour a parked vehicle was parked in, by its id alone, so the
     * vehicle that takes its place is painted the same. Null for the craft's
     * own look.
     */
    paintOf?(id: string): number | null;
  };
  onEvent?: (event: FleetEvent, model: CraftModel | null, at?: THREE.Vector3) => void;
  /**
   * The walls a vehicle nobody is driving meets as it goes on
   * (`settlements.collide`'s contract). Without it only the water stops one.
   */
  collide?: (point: THREE.Vector3, radius: number, push: THREE.Vector3) => boolean;
  /** The land mesh, for laying an airstrip on what is drawn rather than on the relief (`land-probe.ts`). */
  land?: THREE.Mesh;
}

export interface FleetStats {
  /** Sites worked out so far, by kind, and the towns they came from. */
  sites: Readonly<Record<CraftKind, number>> & { towns: number };
  built: number;
  pooled: number;
  moved: number;
  /** The vehicle and seat you are in, or null. */
  riding: string | null;
  /** Airstrips drawn, and waiting to be. */
  strips: number;
  stripsPending: number;
}

export interface Prompt {
  vehicle: string;
  seat: number;
  model: CraftModel;
  /** What `E` does: drive it, ride it, fly it, sail it, or take a passenger's seat. */
  label: 'Drive' | 'Ride' | 'Fly' | 'Sail' | 'Get in';
  /** How far the player stands from its nearest side, for whoever else `E` might be meant for. */
  gap: number;
  /** Where the vehicle stands, its origin on the ground; live, so read it, never keep it. */
  at: THREE.Vector3;
}

export interface Fleet extends FleetSeats {
  group: THREE.Group;
  sites: SiteIndex;
  readonly stats: FleetStats;
  /** The seat `E` would take now, or null. */
  readonly prompt: Prompt | null;
  /**
   * A passenger aloft with nobody at the controls, whose `E` takes them
   * (`takeControls`) rather than asking to get out.
   */
  readonly stranded: boolean;
  /**
   * Pushes a body of `radius` at `point` out of every vehicle standing here
   * that the player is not in: `settlements.collide`'s contract, for the
   * vehicles. A vehicle is a box of its own length and width.
   */
  collide(point: THREE.Vector3, radius: number, push: THREE.Vector3): boolean;
  /**
   * The nearest spot clear of every vehicle standing here, at the same
   * radius, into `out`; false if `point` already is. `settlements.freeSpotNear`'s
   * contract.
   */
  freeSpotNear(point: THREE.Vector3, radius: number, out: THREE.Vector3): boolean;
  /**
   * Every vehicle standing here that the player is not in, as its centre and
   * a radius along the ground, for the traffic to stop for (`InTheWay` in
   * `life.ts`). Nothing is allocated.
   */
  eachStanding(visit: (at: THREE.Vector3, radius: number, player: boolean) => void): void;
  /**
   * Whether any vehicle a player has moved, drawn here or not, stands with its
   * footprint within `radius` of the ground under `direction`: for a herd,
   * which keeps off a plane left in its field.
   */
  movedNear(direction: THREE.Vector3, radius: number): boolean;
  /** Whether a town's parked car is somewhere else now, or has been taken: the town leaves it out. */
  claimsParked(id: string): boolean;
  /** Every vehicle the link says has moved or is sat in, parked cars among them. */
  claimedParked(): Iterable<string>;
  /** Every frame, after the player has moved. */
  update(dt: number, camera?: THREE.Camera): void;
  /**
   * Every vehicle somebody else drove this frame and that is drawn here: its
   * group, posed, and its model. For what a moving vehicle leaves behind it,
   * which is `effects.ts`'s and not the fleet's.
   */
  eachDriven(visit: (group: THREE.Object3D, model: CraftModel) => void): void;
  /** `E`: take the prompted seat, or leave the one you are in. */
  use(): void;
  /** The vehicle and seat you are in. */
  current(): { vehicle: string; seat: number } | null;
  /** Where a vehicle is now: moved, driven, or at its site. False if nothing knows. */
  poseOf(vehicle: string, out: WirePose): boolean;
  /** The nearest vehicle to the player, of a kind if given, among the sites near him and everything moved. */
  nearest(kind?: CraftKind): { id: string; lat: number; lon: number; distance: number } | null;
  /**
   * Straight into a vehicle, from anywhere: the player is put beside it and
   * takes its first free seat. For the console and for automated shots.
   */
  board(vehicle?: string): Promise<boolean>;
}
