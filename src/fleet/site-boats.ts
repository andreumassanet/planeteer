/** The launches on a town's nearest open water, and the jet skis, sailboats and submarines moored near them. */
import * as THREE from 'three';
import { PLANET_RADIUS, UNITS_PER_DEGREE } from '../globe.ts';
import { radiusOf } from '../places.ts';
import { shoreDistance } from '../terrain.ts';
import { rngFrom } from '../scenery/random.ts';
import { latOf } from '../sphere.ts';
import { SEA_REACH, coastAt, coastSample, prepareSeaFloor, seaDepthAt, seaZoneAt } from '../sea-floor.ts';
import { FLEET_MODELS, KIND_OF } from './models.ts';
import {
  BOAT_BEARINGS,
  BOAT_ROOM,
  BOAT_SEARCH,
  BOAT_SECOND_POP,
  BOAT_SECOND_SHARE,
  BOAT_SPACING,
  BOAT_STEP,
  JETSKI_LAT,
  JETSKI_SHARE,
  MOORING_BEARINGS,
  MOORING_GAP,
  MOORING_REACH,
  SAILBOAT_POP,
  SAILBOAT_SHARE,
  SITE_ROOM,
  SUBMARINE_POP,
  SUBMARINE_REACH,
  SUBMARINE_SHARE,
  SUBMARINE_SITE_DEPTH,
} from './site-rules.ts';
import type { FleetSite } from './site-types.ts';
import type { SiteWorld } from './site-world.ts';

const coastNear = coastSample();

export function createBoatSites(w: SiteWorld) {
  const { world, places, wet, inSquare, nearRoad, around, aroundPoint, outward, site, crowded } = w;
  const { at, forward, north, across, corner } = w;

  /**
   * Open water for `need` all round a point: sixteen bearings at the full room
   * and eight at half of it, because a spit of land narrower than the gap
   * between two bearings is what a hull gets drawn through; and no road's
   * bridge within the room either.
   */
  function roomy(direction: THREE.Vector3, need = BOAT_ROOM): boolean {
    if (!wet(direction)) return false;
    // And out from under a bridge: a hull moored under a deck is a hull through it.
    if (nearRoad(direction, need)) return false;
    for (let k = 0; k < 24; k++) {
      const bearing = k < 16 ? (k / 16) * Math.PI * 2 : ((k - 16) / 8) * Math.PI * 2 + Math.PI / 8;
      const room = k < 16 ? need : need / 2;
      north.set(0, 1, 0).projectOnPlane(direction);
      if (north.lengthSq() < 1e-8) north.set(1, 0, 0).projectOnPlane(direction);
      north.normalize();
      across.crossVectors(direction, north).normalize();
      corner
        .copy(direction)
        .addScaledVector(across, (Math.sin(bearing) * room) / PLANET_RADIUS)
        .addScaledVector(north, (Math.cos(bearing) * room) / PLANET_RADIUS)
        .normalize();
      if (!wet(corner)) return false;
    }
    return true;
  }

  function boats(p: number, out: FleetSite[]): void {
    const place = places[p]!;
    const radius = radiusOf(place);
    // Most towns are nowhere near the sea, and the coast field says so for
    // the price of one bilinear sample.
    if (shoreDistance(place.lat, place.lon) * UNITS_PER_DEGREE > radius + BOAT_SEARCH) return;
    const rng = rngFrom('fleet-boats', p);
    const count = place.pop >= BOAT_SECOND_POP && rng.chance(BOAT_SECOND_SHARE) ? 2 : 1;
    const start = rng.unit() * Math.PI * 2;
    const moored: THREE.Vector3[] = [];
    // Outward from the square in rings, every bearing on a ring before the
    // next: the first water with room is the nearest the town has.
    for (let d = radius / Math.SQRT2 + BOAT_ROOM; d <= radius + BOAT_SEARCH && moored.length < count; d += BOAT_STEP) {
      for (let k = 0; k < BOAT_BEARINGS && moored.length < count; k++) {
        around(p, start + (k / BOAT_BEARINGS) * Math.PI * 2, d, at);
        if (!roomy(at) || inSquare(at, BOAT_ROOM)) continue;
        if (moored.some((other) => other.angleTo(at) * PLANET_RADIUS < BOAT_SPACING)) continue;
        outward(p, at, forward);
        out.push(site(FLEET_MODELS.boat, p, moored.length, at, forward));
        moored.push(at.clone());
      }
    }
  }

  /**
   * A jet ski off a warm coast's town and a sailboat off a harbour's (and a
   * submarine off a big one's), moored near the town's launch: the launch's
   * search has already found the nearest open water, so each looks for room of
   * its own in rings round it. A town with no launch has none.
   */
  function moorings(p: number, out: FleetSite[]): void {
    const place = places[p]!;
    const launch = out.find((entry) => entry.place === p && entry.kind === 'boat');
    if (launch === undefined) return;
    const rng = rngFrom('fleet-moorings', p);
    const wants: string[] = [];
    if (Math.abs(place.lat) < JETSKI_LAT && rng.chance(JETSKI_SHARE)) wants.push(FLEET_MODELS.jetski);
    if (place.pop >= SAILBOAT_POP && rng.chance(SAILBOAT_SHARE)) wants.push(FLEET_MODELS.sailboat);
    const start = rng.unit() * Math.PI * 2;
    if (place.pop >= SUBMARINE_POP && rngFrom('fleet-submarine', p).chance(SUBMARINE_SHARE)) {
      prepareSeaFloor(world);
      const zone = seaZoneAt(latOf(launch.at.y), coastAt(launch.at.x, launch.at.y, launch.at.z, SEA_REACH, coastNear).lake);
      if (zone === 'reef' || zone === 'kelp') wants.push(FLEET_MODELS.submarine);
    }
    for (const model of wants) {
      const room = SITE_ROOM[KIND_OF[model]!];
      let found = false;
      const reach = model === FLEET_MODELS.submarine ? SUBMARINE_REACH : MOORING_REACH;
      for (let d = BOAT_ROOM + room + MOORING_GAP; d <= reach && !found; d += BOAT_STEP) {
        for (let k = 0; k < MOORING_BEARINGS && !found; k++) {
          aroundPoint(launch.at, start + (k / MOORING_BEARINGS) * Math.PI * 2, d, at);
          if (crowded(p, at, room + MOORING_GAP, out) || !roomy(at, room) || inSquare(at, room)) continue;
          if (model === FLEET_MODELS.submarine && seaDepthAt(at) < SUBMARINE_SITE_DEPTH) continue;
          outward(p, at, forward);
          out.push(site(model, p, 0, at, forward));
          found = true;
        }
      }
    }
  }

  return { boats, moorings };
}
