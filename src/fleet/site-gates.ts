/** The vehicles at a town's gates: bicycles, a motorbike, a tuk-tuk, a jeep and a bus, out along its roads. */
import * as THREE from 'three';
import { PLANET_RADIUS } from '../globe.ts';
import { ROAD_CLASSES, courseOf, coursePoint, courseTangent, parameterAt } from '../roads.ts';
import { rngFrom } from '../scenery/random.ts';
import { keepsLeft, trafficFor } from '../traffic/regions.ts';
import { FLEET_MODELS, KIND_OF } from './models.ts';
import {
  BUS_ALONG,
  BUS_POP,
  CYCLING,
  GATE_ELSEWHERE,
  GATE_SHARES,
  JEEP_ALONG,
  JEEP_BIOMES,
  JEEP_SHARE,
  MOTORBIKE_ALONG,
  RACK_ALONG,
  RACK_PITCH,
  SCOOTERS,
  SITE_ROOM,
  TUKTUK_ALONG,
  VERGE,
} from './site-rules.ts';
import type { FleetSite } from './site-types.ts';
import type { SiteWorld } from './site-world.ts';

export function createGateSites(w: SiteWorld) {
  const { world, places, roads, byPlace, course, pathOf, wet, inSquare, nearMonument, site, biomeOf, crowded } = w;
  const { at, forward, side } = w;

  const continentOf = new Map<string, string>(world.countries.map((country) => [country.iso, country.continent]));
  const regions: (string | undefined)[] = new Array(places.length);
  /** A town's traffic region: `trafficFor`, the same answer its streets are parked by. */
  const regionOf = (p: number): string => {
    const place = places[p]!;
    return (regions[p] ??= trafficFor(place.iso, continentOf.get(place.iso) ?? '', place.lat).id);
  };

  /**
   * A spot on road `r` out of town `p`: `along` units from the gate and
   * `lateral` off the centre line, to the right of the way out; `at` and
   * `forward` written. False where the road is too short for it (past half its
   * length it is the next town's), or the spot is wet, in a square or on a landmark.
   */
  function roadSpot(p: number, r: number, along: number, lateral: number, room: number): boolean {
    const road = roads[r]!;
    const leaving = road.a === p;
    const path = pathOf(r);
    if (along + room > path.length * 0.45) return false;
    const t = parameterAt(path, leaving ? along : path.length - along);
    courseOf(road, places, course);
    coursePoint(course, t, at);
    courseTangent(course, t, forward);
    if (!leaving) forward.negate();
    side.crossVectors(forward, at).normalize();
    at.addScaledVector(side, lateral / PLANET_RADIUS).normalize();
    forward.projectOnPlane(at).normalize();
    return !wet(at) && !inSquare(at, room) && !nearMonument(at, 0);
  }

  /** The bicycles, the motorbike, the tuk-tuk, the jeep and the bus at a town's gates. */
  function gates(p: number, out: FleetSite[]): void {
    const own = byPlace.get(p);
    if (own === undefined) return;
    const place = places[p]!;
    const region = regionOf(p);
    const rng = rngFrom('fleet-gates', p);
    const order = [...own];
    for (let i = order.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
    const cycling = CYCLING.has(place.iso);
    const bikes = cycling ? 2 + rng.int(2) : rng.chance(GATE_SHARES.bicycle[region] ?? GATE_ELSEWHERE.bicycle) ? 1 + rng.int(2) : 0;
    const motorbike = rng.chance(GATE_SHARES.motorbike[region] ?? GATE_ELSEWHERE.motorbike);
    const scooter = rng.chance(SCOOTERS[region] ?? 0);
    const tuktuk = rng.chance(GATE_SHARES.tuktuk[region] ?? GATE_ELSEWHERE.tuktuk);
    const jeep = rng.chance(JEEP_SHARE) && JEEP_BIOMES.has(biomeOf(p));
    const bus = place.pop >= BUS_POP;
    // The far verge from the lane the town's car is parked on.
    const keep = keepsLeft(place.iso) ? -1 : 1;
    let next = 0;
    const put = (model: string, along: number, verge: boolean, count = 1): void => {
      const kind = KIND_OF[model]!;
      const room = SITE_ROOM[kind];
      for (let tries = 0; tries < order.length; tries++) {
        const r = order[(next + tries) % order.length]!;
        const width = ROAD_CLASSES[roads[r]!.cls]!.width;
        const lateral = verge ? -keep * (width / 2 + VERGE + room / 2) : (keep * width) / 4;
        const spots: [THREE.Vector3, THREE.Vector3][] = [];
        for (let i = 0; i < count; i++) {
          if (!roadSpot(p, r, along + i * RACK_PITCH, lateral, room)) break;
          // A rack's bicycles stand square to the road, their fronts to the verge.
          if (verge && kind === 'bicycle') forward.copy(side).multiplyScalar(-keep);
          if (crowded(p, at, room, out)) break;
          spots.push([at.clone(), forward.clone()]);
        }
        if (spots.length === 0) continue;
        spots.forEach(([spot, facing], i) => out.push(site(model, p, i, spot, facing, r)));
        next += tries + 1;
        return;
      }
    };
    if (bikes > 0) put(FLEET_MODELS.bicycle, RACK_ALONG, true, bikes);
    if (motorbike) put(scooter ? 'scooter' : FLEET_MODELS.motorbike, MOTORBIKE_ALONG, true);
    if (tuktuk) put(FLEET_MODELS.tuktuk, TUKTUK_ALONG, false);
    if (jeep) put(FLEET_MODELS.jeep, JEEP_ALONG, false);
    if (bus) put(FLEET_MODELS.bus, BUS_ALONG, false);
  }

  return { gates };
}
