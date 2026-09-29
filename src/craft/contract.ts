/**
 * What a vehicle you can take is, as three halves of the game read it.
 *
 * **Nobody owns a vehicle any more.** They stand about the world — cars at the
 * ends of a town's roads, boats off a coastal town, light aircraft beside the
 * big cities, the odd balloon, and bicycles, motorbikes, tuk-tuks, jeeps,
 * buses, jet skis, sailboats, horses, tractors and helicopters where each
 * makes sense, and a yellow submarine off a few big harbours — and you walk
 * up to one and take it. Where you
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
import type { Honk } from '../../server/src/limits.ts';
import { AVATAR_HEIGHT } from '../stature.ts';
import { RIDER_HEIGHT } from '../traffic/contract.ts';

/** What a vehicle moves over, which is what decides how it is driven. */
export type Medium = 'road' | 'water' | 'air';

/**
 * How a vehicle is driven, which is what its model says it is. Every kind has
 * its own handling (`craft/handling.ts`), its own sound and its own marks on
 * the world; a model is one look of a kind — the scooter and the motorbike are
 * both `motorbike`, the jeep and the pickup both `jeep`.
 */
export type CraftKind =
  | 'car'
  | 'van'
  | 'boat'
  | 'plane'
  | 'balloon'
  | 'bicycle'
  | 'motorbike'
  | 'tuktuk'
  | 'bus'
  | 'tractor'
  | 'jeep'
  | 'horse'
  | 'jetski'
  | 'sailboat'
  | 'helicopter'
  | 'submarine';

/** Every kind, in the order the checks and the console list them. */
export const CRAFT_KINDS: readonly CraftKind[] = [
  'car', 'van', 'boat', 'plane', 'balloon', 'bicycle', 'motorbike', 'tuktuk', 'bus', 'tractor', 'jeep', 'horse', 'jetski', 'sailboat', 'helicopter',
  'submarine',
];

/** The kinds that fly. */
export const isAirKind = (kind: CraftKind): boolean => kind === 'plane' || kind === 'balloon' || kind === 'helicopter';

/**
 * The horn each kind sounds when its driver presses the horn key (`horn` in
 * `controls.ts`), as `audio.ts` synthesises it and the relay passes it on
 * (`HONKS`); null where there is none, which is everything that flies. A
 * bicycle rings a bell and a horse whinnies, and a hull of any size has the
 * one horn a boat has.
 */
export const HORN_OF: Readonly<Record<CraftKind, Honk | null>> = {
  car: 'car',
  van: 'car',
  jeep: 'car',
  tractor: 'car',
  bus: 'bus',
  motorbike: 'beep',
  bicycle: 'bell',
  tuktuk: 'squeak',
  boat: 'ship',
  sailboat: 'ship',
  jetski: 'ship',
  submarine: 'ship',
  horse: 'whinny',
  plane: null,
  helicopter: null,
  balloon: null,
};

/**
 * How each kind lights the road ahead after dark: how many headlamps it
 * carries and how bright each is, a car's being 1. Where the lamps are is
 * the model's own (`CraftModel.lamps`, found on the model it is built from),
 * so a lamp is always on the thing that carries it; this says only whether
 * they are lit and how much. A car, a van, a jeep, a bus and a tractor have
 * two at their front corners; a motorbike or a scooter one on its headset, a
 * tuk-tuk the one on its apron, and a bicycle one small dim lamp on its head
 * tube. A horse, a boat, anything that flies, and a submarine have none.
 */
export const HEADLIGHTS_OF: Readonly<Record<CraftKind, { count: number; strength: number }>> = {
  car: { count: 2, strength: 1 },
  van: { count: 2, strength: 1 },
  jeep: { count: 2, strength: 1 },
  bus: { count: 2, strength: 1.1 },
  tractor: { count: 2, strength: 0.9 },
  tuktuk: { count: 1, strength: 0.8 },
  motorbike: { count: 1, strength: 0.85 },
  bicycle: { count: 1, strength: 0.35 },
  horse: { count: 0, strength: 0 },
  boat: { count: 0, strength: 0 },
  sailboat: { count: 0, strength: 0 },
  jetski: { count: 0, strength: 0 },
  submarine: { count: 0, strength: 0 },
  plane: { count: 0, strength: 0 },
  helicopter: { count: 0, strength: 0 },
  balloon: { count: 0, strength: 0 },
};

/** A headlamp's glass, in the model's frame: its middle across and up, and the front of it. */
export type Lamp = readonly [number, number, number];

export interface Seat {
  /** The hip, in the model's frame. The seat surface is at `y`. */
  x: number;
  y: number;
  z: number;
  /** Which way the body faces, radians about +Y from +Z. Almost always 0. */
  yaw: number;
  /**
   * `sit` on a seat with the feet on a floor, `stand` at a helm or in a
   * basket, `ride` astride — a saddle, a bicycle, a jet ski — with the legs
   * down either side to `feet` and the hands on `grip`.
   */
  pose: 'sit' | 'stand' | 'ride';
  /** False inside a closed cab, where a body would be drawn through the roof. */
  shown: boolean;
  /**
   * Astride: where the hands hold — the bars, the reins — about the hip, in
   * the seat's own frame (+X the rider's left, +Z ahead).
   */
  grip?: readonly [number, number, number];
  /**
   * Astride: where the soles rest about the hip, the left foot's; the right is
   * the same mirrored across the seat. For a seat that pedals it is the
   * crank's axle, on the centreline.
   */
  feet?: readonly [number, number, number];
  /** A seat that pedals: the crank's radius, and the feet go round it. */
  crank?: number;
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
  /**
   * A bicycle's crank: how far the bicycle goes for one turn of the pedals, in
   * units. The motion turns the crank by it and the rider's feet follow the
   * motion's phase (`CraftMotion.phase`).
   */
  gearing?: number;
  /**
   * The headlamps, in the model's frame, where the model itself has them:
   * read off its lamp-coloured faces (`cars.ts`), its lit meshes
   * (`traffic-craft.ts`) or the lamp it is built with (`cycles.ts`). As many
   * as `HEADLIGHTS_OF` says the kind lights; absent where it has none.
   */
  lamps?: readonly Lamp[];
  /** How many looks the model has; `build` takes one of `0 .. variants - 1`. */
  variants: number;
  /**
   * A fresh copy, drawn with the world's own toon materials and ink, every
   * mesh carrying `outlineNormal`. Parts that turn are named children:
   * `'prop'` (spins about +Z), `'rotor'` (about +Y), `'wheel'` (about +X),
   * `'tail'` (a tail rotor, about +X), `'crank'` (a bicycle's, about +X).
   * An animal's body is a child named `'rig'` carrying its skinned mesh
   * (`craft/horse.ts`), which the motion plays.
   *
   * `paint`, where a model has a body to paint, is that body's colour in
   * place of the variant's: a town's parked car taken over keeps the colour
   * it was parked in (`ParkedCar.paint`). Every other colour is the variant's.
   */
  build(variant: number, paint?: number): THREE.Group;
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
  /**
   * Whether whoever else drives a vehicle is off the ground, by their own
   * state: a horse under a rider who jumped leaps. Absent, or false, for a
   * link that cannot say.
   */
  leaping?(vehicle: string): boolean;
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
 * The vehicles parked in a town that can be taken, by the traffic kit's
 * vehicle, and the craft that stands in for each once taken: the kit's
 * hatchback and saloon become the hatchback, its SUV the jeep, its panel van
 * and minibus the van, its pickups the pickup, and the bus, the tractor, the
 * bicycle, the scooter and the rickshaw their own. What is left — a lorry, a
 * hand-cart — stays parked, and stays solid.
 *
 * The craft is larger than the vehicle it replaces, a car by a third, because
 * the kit's are fitted to a lane and a craft to the person inside it
 * (`cars.ts`); the bus is the one drawn at the traffic's own size.
 */
export const PARKED_CRAFT: Readonly<Record<string, string>> = {
  hatchback: 'hatchback',
  'saloon-car': 'hatchback',
  'boxy-suv': 'jeep',
  'panel-van': 'van',
  minibus: 'van',
  'pickup-truck': 'pickup',
  'city-bus': 'bus',
  'farm-tractor': 'tractor',
  bicycle: 'bicycle',
  scooter: 'scooter',
  'auto-rickshaw': 'tuk-tuk',
};

/**
 * How much larger the hero is than the rider the traffic's parts are built
 * round (`RIDER_HEIGHT`): the scale the scooter and the tuk-tuk are taken at
 * (`craft/traffic-craft.ts`).
 */
export const RIDE_SCALE = AVATAR_HEIGHT / RIDER_HEIGHT;

/**
 * The traffic's vehicles that no craft stands in for, and the craft whose
 * lamps each borrows, scaled to it: a lorry has a van's, a kei truck a
 * pickup's. A hand-cart has none.
 */
export const LAMPS_LIKE: Readonly<Record<string, string>> = {
  ...PARKED_CRAFT,
  'box-truck': 'van',
  'kei-truck': 'pickup',
};

/**
 * The traffic kit's vehicles a town parks at `RIDE_SCALE` rather than at the
 * traffic's own section, so the one somebody gets on is the size it stood at:
 * the scooter and the auto-rickshaw, whose craft are those same parts at that
 * scale. A car is not grown to its craft, which is a third larger by design
 * (`cars.ts`): at that size two would not pass in a town's street, and it
 * stands at a kerb among the traffic's cars.
 */
export const PARKED_AT_RIDE_SCALE: ReadonlySet<string> = new Set(['scooter', 'auto-rickshaw']);

/**
 * Where a town's parked cars start counting in a vehicle id: the fleet's own
 * sites at a town use `0` to `2`, and the relay takes `n` of one or two digits.
 */
export const PARKED_SLOT = 10;
