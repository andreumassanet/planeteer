/** Whether a disc of ground is clear of what is built or taken: pads, farms, fields and carriageways. */
import * as THREE from 'three';
import type { FieldIndex, FieldKeepout } from '../fleet.ts';
import { PLANET_RADIUS } from '../globe.ts';
import type { Place } from '../places.ts';
import { ROAD_CLASSES, roadClearance, roadIndexFor } from '../roads.ts';
import type { Road } from '../roads.ts';
import { flattenWeightAt } from '../terrain.ts';
import type { LifeShared } from './api.ts';
import type { Routes } from './routes.ts';

/**
 * True if a herd of `spread` centred at `centre` stands off every landmark's
 * pad (`flattenWeightAt` over zero is inside one), the countryside's farms, a
 * standing aircraft's field, and every carriageway: the clearance from a road
 * is its `roadClearance` plus the herd's spread, measured to the road's drawn
 * course.
 */
export type ClearOfMade = (centre: THREE.Vector3, spread: number) => boolean;

export function createMadeGround(
  roads: readonly Road[], places: readonly Place[], routes: Routes, fields: FieldIndex | undefined, shared: LifeShared,
): ClearOfMade {
  const madeHere = new THREE.Vector3();
  const madeLast = new THREE.Vector3();
  const madeLeg = new THREE.Vector3();
  const madeFoot = new THREE.Vector3();
  const madeToward = new THREE.Vector3();
  const roadHits: number[] = [];
  const roadIndex = roads.length > 0 && places.length > 0 ? roadIndexFor(roads, places) : null;
  const fieldHits: FieldKeepout[] = [];

  return function clearOfMade(centre: THREE.Vector3, spread: number): boolean {
    if (flattenWeightAt(centre.x, centre.y, centre.z) > 0) return false;
    const country = shared.country;
    if (country !== null && country.occupied(centre, spread)) return false;
    // `fieldsNear` answers the fields whose own radius reaches within `spread`.
    fieldHits.length = 0;
    if (fields !== undefined && fields.fieldsNear(centre, spread, fieldHits).length > 0) return false;
    if (roadIndex === null) return true;
    const widest = spread + roadClearance(ROAD_CLASSES.length - 1);
    madeToward.copy(centre).multiplyScalar(PLANET_RADIUS);
    for (const hit of roadIndex.near(centre, widest, roadHits)) {
      const road = roads[hit]!;
      const clear = spread + roadClearance(road.cls);
      const path = routes.geometry.path(hit);
      for (let step = 0; step < path.count; step++) {
        madeHere
          .set(path.xyz[step * 3]!, path.xyz[step * 3 + 1]!, path.xyz[step * 3 + 2]!)
          .multiplyScalar(PLANET_RADIUS);
        if (step > 0) {
          // Point to segment in world space: a few dozen chords per herd.
          madeLeg.subVectors(madeHere, madeLast);
          const lengthSq = madeLeg.lengthSq();
          let t = 0;
          if (lengthSq > 1e-6) {
            t = madeFoot.subVectors(madeToward, madeLast).dot(madeLeg) / lengthSq;
            t = t < 0 ? 0 : t > 1 ? 1 : t;
          }
          madeFoot.copy(madeLast).addScaledVector(madeLeg, t);
          if (madeFoot.distanceTo(madeToward) < clear) return false;
        }
        madeLast.copy(madeHere);
      }
    }
    return true;
  };
}
