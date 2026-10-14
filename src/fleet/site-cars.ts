/** The cars parked on the lane a town's roads leave by. */
import * as THREE from 'three';
import { PLANET_RADIUS } from '../globe.ts';
import { radiusOf } from '../places.ts';
import { ROAD_CLASSES, courseOf, coursePoint, courseTangent, parameterAt } from '../roads.ts';
import { rngFrom } from '../scenery/random.ts';
import { keepsLeft } from '../traffic/regions.ts';
import { FLEET_MODELS } from './models.ts';
import { CAR_HALF, CAR_MIN_OUT, CAR_OUT, CAR_SPACING, VAN_SHARE, carsFor } from './site-rules.ts';
import type { FleetSite } from './site-types.ts';
import type { SiteWorld } from './site-world.ts';

export function createCarSites(w: SiteWorld) {
  const { places, roads, byPlace, course, pathOf, wet, inSquare, nearMonument, site } = w;
  const { at, forward, side } = w;

  /** A town's parked cars, one or more on the lane its roads leave by. */
  function cars(p: number, out: FleetSite[]): void {
    const own = byPlace.get(p);
    if (own === undefined) return;
    const place = places[p]!;
    const rng = rngFrom('fleet-cars', p);
    const order = [...own];
    for (let i = order.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
    const cap = carsFor(radiusOf(place));
    const parked: THREE.Vector3[] = [];
    // Right-hand traffic parks on the right of the way out, and the other
    // half of the world on the left: `keepsLeft`, asked of the town.
    const lane = (ROAD_CLASSES[0]!.width / 4) * (keepsLeft(place.iso) ? -1 : 1);
    for (const r of order) {
      if (parked.length >= cap) break;
      const road = roads[r]!;
      const leaving = road.a === p;
      courseOf(road, places, course);
      const out_ = Math.min(CAR_OUT, course.approach * 0.8);
      if (out_ < CAR_MIN_OUT) continue;
      const path = pathOf(r);
      const t = parameterAt(path, leaving ? out_ : path.length - out_);
      courseOf(road, places, course);
      coursePoint(course, t, at);
      courseTangent(course, t, forward);
      if (!leaving) forward.negate();
      // Screen right is `forward x up`; see `walk` in `player.ts`.
      side.crossVectors(forward, at).normalize();
      at.addScaledVector(side, lane / PLANET_RADIUS).normalize();
      forward.projectOnPlane(at).normalize();
      if (wet(at) || inSquare(at, CAR_HALF) || nearMonument(at, 0)) continue;
      if (parked.some((other) => other.angleTo(at) * PLANET_RADIUS < CAR_SPACING)) continue;
      const model = rng.chance(VAN_SHARE) ? FLEET_MODELS.van : FLEET_MODELS.car;
      out.push(site(model, p, parked.length, at, forward, r));
      parked.push(at.clone());
    }
  }

  return { cars };
}
