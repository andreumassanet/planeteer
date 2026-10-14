import * as THREE from 'three';
import { unitAt } from '../sphere.ts';

/** Planet radius, world units. Most other sizes derive from it. */
export const PLANET_RADIUS = 16000;

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
