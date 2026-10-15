import * as THREE from 'three';
import { unitAt } from '../sphere.ts';

/**
 * The radius the world's geography is written at, world units. A length that
 * belongs to the map rather than to a body (how far apart towns are, how big
 * one is, how long a road may run) is written at this radius and multiplied by
 * `WORLD_SCALE`; a length that belongs to a person, a building or a budget in
 * units is not.
 */
export const NOMINAL_RADIUS = 16000;

/** How many times the nominal planet this one is. Towns grow with it, people and buildings do not. */
export const WORLD_SCALE = 2;

/**
 * Planet radius, world units. Most other sizes derive from it. At 32,000 the
 * highest ground (`LAND_HEIGHT` plus `MAX_RELIEF`, 32,700) stays under 2^15, so a
 * ground vertex is held to float32's step of 1/512 of a unit: twice the
 * nominal planet's, and half what a radius past 32,768 would allow.
 */
export const PLANET_RADIUS = NOMINAL_RADIUS * WORLD_SCALE;

/**
 * The radius the haze and the streamers' horizons are taken at. The nominal
 * one, so a bigger planet does not open the haze on foot and build more ground
 * than the frame was budgeted for; from orbit the haze still clears the globe.
 */
export const HAZE_RADIUS = NOMINAL_RADIUS;

/** World units per degree of arc. */
export const UNITS_PER_DEGREE = (PLANET_RADIUS * Math.PI) / 180;

/**
 * The angle whose chord sags by `sag` units below a sphere of `PLANET_RADIUS`.
 *
 * A flat triangle spanning an angle `t` dips below the surface by
 * `R * (1 - cos(t / 2))` at its centre, so every tessellation limit is this
 * question. The sag budget is in units and the angles follow the radius.
 */
export function angleForSag(sag: number): number {
  return 2 * Math.acos(1 - sag / PLANET_RADIUS);
}

/** A point on the unit sphere from `lon, lat` in degrees (the order outlines store a point in). */
export function onSphere(lon: number, lat: number, target: THREE.Vector3): THREE.Vector3 {
  return unitAt(lat, lon, target);
}
