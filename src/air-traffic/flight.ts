import * as THREE from 'three';
import type { Place } from '../places.ts';
import type { FleetSite } from '../fleet.ts';

/** The shared shapes of the air timetable: a flight, its pose, what it reads. */

export type FlyerKind = 'airliner' | 'plane' | 'helicopter' | 'balloon' | 'airship';
export const FLYER_KINDS: readonly FlyerKind[] = ['airliner', 'plane', 'helicopter', 'balloon', 'airship'];

/** Where a flyer is and how it is held, at one instant. */
export interface FlyerPose {
  /** From the planet's centre. */
  position: THREE.Vector3;
  /** Unit vector along its travel, climb included. */
  forward: THREE.Vector3;
  /** Unit vector square to `forward`, banked into a turn. */
  up: THREE.Vector3;
  /** Airspeed, units a second. */
  speed: number;
  /** Vertical speed, units a second; negative going down. */
  climb: number;
  /** Wheels or basket on the ground. */
  grounded: boolean;
  /** 0 to 1: how far it has appeared (or not yet gone). */
  shown: number;
}

export function flyerPose(): FlyerPose {
  return {
    position: new THREE.Vector3(),
    forward: new THREE.Vector3(0, 0, 1),
    up: new THREE.Vector3(0, 1, 0),
    speed: 0,
    climb: 0,
    grounded: false,
    shown: 1,
  };
}

/** One flight on the timetable. */
export interface Flight {
  /** Stable across clients: `<kind>:<what it hangs off>:<n>`. */
  id: string;
  kind: FlyerKind;
  variant: number;
  /** When it appears and is gone, in sky-clock seconds; a circuit is always up. */
  from: number;
  to: number;
  /** Where it is at `seconds`. Pure. */
  pose(seconds: number, out: FlyerPose): FlyerPose;
}

/** What the timetable is a function of. */
export interface AirSource {
  places: readonly Place[];
  /** The ground's radius along a unit direction: the land, or the sea's `PLANET_RADIUS`. */
  ground(direction: THREE.Vector3): number;
  /** The airstrips, by their planes' sites (`fleet.ts`'s `planesNear`). */
  strips?: { planesNear(direction: THREE.Vector3, radius: number, out: FleetSite[]): FleetSite[] };
  /** Whether a town keeps a balloon (`keepsBalloon` in `fleet.ts`). */
  keepsBalloon?(place: number): boolean;
  /**
   * The wind at a place and instant (the way it blows to) and whether a
   * balloon may go up in it. Without it a balloon drifts on a hashed heading
   * in any weather.
   */
  wind?(lat: number, lon: number, timeMs: number): { east: number; north: number; speed: number; calm: boolean };
}

/** How far round the player each kind is looked for, in units over the ground. */
export const REACH: Readonly<Record<FlyerKind, number>> = {
  airliner: 7000,
  plane: 2000,
  helicopter: 2200,
  balloon: 2600,
  airship: 3600,
};
/** How many of each are drawn at once, nearest first. A draw-call budget. */
export const CAPS: Readonly<Record<FlyerKind, number>> = { airliner: 5, plane: 3, helicopter: 3, balloon: 4, airship: 1 };
