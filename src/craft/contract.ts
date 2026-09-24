/**
 * What a vehicle you can take is, as three halves of the game read it.
 *
 * **Nobody owns a vehicle any more.** They stand about the world — cars at the
 * ends of a town's roads, boats off a coastal town, light aircraft beside the
 * big cities, the odd balloon — and you walk up to one and take it. Where you
 * leave it is where it stays, for everyone. Three files meet here and each
 * reads only this one of the others:
 *
 * - `src/craft/*.ts` build the models and say where their seats are.
 * - `src/fleet.ts` says where every vehicle stands by default (a pure
 *   function of the places, so every client agrees without a word on the
 *   wire), streams the near ones in, and lets the player board.
 * - A `FleetLink` says which vehicles have been moved and who sits in them:
 *   `fleet.ts`'s own local one for a world with no relay, the relay's
 *   (`fleet-sync.ts`) when there is one.
 *
 * **Frames.** A model is built facing +Z with +Y up, centred in X and Z, its
 * wheels or keel or skids on `y = 0` — or, for a water craft, its waterline on
 * `y = 0` with `draft` of hull below it. World units throughout, at the scale
 * the model is drawn: nothing downstream scales a model or a seat.
 *
 * **A pose on the wire** is nine numbers, `[x, y, z, fx, fy, fz, ux, uy, uz]`:
 * where the model's origin is, relative to the planet's centre, then its +Z
 * and its +Y as unit vectors. The up is sent because an aircraft banks and a
 * boat rolls; everything else can take it as the planet's normal.
 */
import type * as THREE from 'three';

/** What a vehicle moves over, which is what decides how it is driven. */
export type Medium = 'road' | 'water' | 'air';

export type CraftKind = 'car' | 'van' | 'boat' | 'plane' | 'balloon';

export interface Seat {
  /** The hip, in the model's frame. The seat surface is at `y`. */
  x: number;
  y: number;
  z: number;
  /** Which way the body faces, radians about +Y from +Z. Almost always 0. */
  yaw: number;
  pose: 'sit' | 'stand';
  /** False inside a closed cab, where a body would be drawn through the roof. */
  shown: boolean;
}

export interface CraftModel {
  /** Stable, used in vehicle ids and on the wire: `'light-plane'`, `'launch'`. */
  id: string;
  kind: CraftKind;
  medium: Medium;
  /** Length, width, height of the built model, world units. */
  size: readonly [number, number, number];
  /** `seats[0]` is the driver's and is the only one that steers. */
  seats: readonly Seat[];
  /** Hull below the waterline, for a water craft; 0 for anything else. */
  draft: number;
  /**
   * A balloon's burner: the heights, in the model's frame and on its axis,
   * where the flame leaves the coil and where it enters the envelope. What
   * `effects.ts` draws the flame between while it climbs.
   */
  burner?: readonly [number, number];
  /** How many looks the model has; `build` takes one of `0 .. variants - 1`. */
  variants: number;
  /**
   * A fresh copy, drawn with the world's own toon materials and ink, every
   * mesh carrying `outlineNormal`. Parts that turn are named children:
   * `'prop'` (spins about +Z), `'rotor'` (about +Y), `'wheel'` (about +X).
   */
  build(variant: number): THREE.Group;
}

/** Nine numbers: position from the planet's centre, forward (+Z), up (+Y). */
export type WirePose = number[];

export interface MovedVehicle {
  pose: WirePose;
  /** Who sits where, by player id; `null` an empty seat. Index 0 drives. */
  seats: readonly (string | null)[];
}

/**
 * Who has moved what, and who sits where. The fleet draws a vehicle at its
 * site unless this says otherwise.
 */
export interface FleetLink {
  /** This client's id, as it appears in `seats`. */
  readonly self: string;
  /** Every vehicle not at its site, or with anybody in it. */
  readonly moved: ReadonlyMap<string, MovedVehicle>;
  /**
   * Where a vehicle someone else is driving is drawn this frame, written into
   * `out` (nine numbers). False if nobody else is driving it.
   */
  sample(vehicle: string, out: WirePose): boolean;
  /**
   * Ask for a seat. Resolves true once it is yours. `site` is where the
   * claimer sees the vehicle when it has never been moved, so the relay
   * learns where it stands without knowing the sites itself.
   */
  claim(vehicle: string, seat: number, site?: WirePose): Promise<boolean>;
  /** Leave the seat, and where the vehicle stands if you were driving it. */
  release(vehicle: string, pose: WirePose | null): void;
  /** While holding seat 0, every frame; the link decides how often to send. */
  drive(vehicle: string, pose: WirePose, speed: number): void;
  /** Called with a vehicle's id whenever its entry in `moved` changes. */
  onChange(listener: (vehicle: string) => void): () => void;
}

/**
 * What the fleet offers the players' side: where a seat is, so a remote
 * player sitting in a vehicle can be drawn in it.
 */
export interface FleetSeats {
  /**
   * The seat's frame in the world, if that vehicle is drawn: a child of its
   * model at the hip, facing the way the body faces. Null when the vehicle is
   * out of reach and not built. Its `userData` carries the seat's `shown`
   * and `pose`, so a body put there knows whether to show and how to stand.
   */
  seatFrame(vehicle: string, seat: number): THREE.Object3D | null;
}

/**
 * What the player is doing, as the wire carries it: index 0, 1 or 2 of this
 * list, in the slot the relay has always called `vehicle`. `seated` is any
 * seat in any vehicle; which one is the relay's seat map, not the pose.
 */
export const PLAYER_STATES = ['foot', 'swim', 'seated'] as const;
export type PlayerState = (typeof PLAYER_STATES)[number];

/**
 * The cars parked in a town that can be taken, by the traffic kit's vehicle,
 * and the craft that stands in for each once taken: the kit's hatchback,
 * saloon and SUV become the hatchback, its panel van and minibus the van. The
 * rest — a bus, a lorry, a tractor, a bicycle — stay parked, and stay solid.
 *
 * The craft is a third larger than the car it replaces, because the kit's cars
 * are fitted to a lane and a craft to the person inside it (`cars.ts`).
 */
export const PARKED_CRAFT: Readonly<Record<string, string>> = {
  hatchback: 'hatchback',
  'saloon-car': 'hatchback',
  'boxy-suv': 'hatchback',
  'panel-van': 'van',
  minibus: 'van',
};

/**
 * Where a town's parked cars start counting in a vehicle id: the fleet's own
 * sites at a town use `0` to `2`, and the relay takes `n` of one or two digits.
 */
export const PARKED_SLOT = 10;
