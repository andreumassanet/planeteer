/**
 * Where the towns that keep a harbour are, as a pure function of the places,
 * for what wants to know without planning one: the gulls over a waterfront.
 */
import * as THREE from 'three';
import { PLANET_RADIUS } from '../globe.ts';
import { radiusOf } from '../places.ts';
import type { Place } from '../places.ts';
import { rngFrom } from '../scenery/random.ts';
import { latOf, lonOf, unitAt } from '../sphere.ts';
import { keepsHarbour } from './plan.ts';

/** How far past a town's own radius its harbour's sky reaches, units. */
const SKY = 150;

export interface HarbourTowns {
  /** Whether a unit direction is over a harbour town or its water. */
  near(direction: THREE.Vector3): boolean;
}

export function harbourTowns(places: readonly Place[]): HarbourTowns {
  const cells = new Map<number, { up: THREE.Vector3; reach: number }[]>();
  const key = (lat: number, lon: number): number => (Math.floor(lat) + 90) * 1000 + ((Math.floor(lon) % 360) + 360) % 360;
  places.forEach((place, p) => {
    if (!keepsHarbour(place, rngFrom('harbour', p))) return;
    const entry = { up: unitAt(place.lat, place.lon, new THREE.Vector3()), reach: (radiusOf(place) + SKY) / PLANET_RADIUS };
    const k = key(place.lat, place.lon);
    const list = cells.get(k);
    if (list === undefined) cells.set(k, [entry]);
    else list.push(entry);
  });
  return {
    near(direction) {
      const lat = latOf(direction.y);
      const lon = lonOf(direction.x, direction.z);
      for (let dl = -1; dl <= 1; dl++) {
        for (let dn = -1; dn <= 1; dn++) {
          for (const town of cells.get(key(lat + dl, lon + dn)) ?? []) if (town.up.angleTo(direction) < town.reach) return true;
        }
      }
      return false;
    },
  };
}
