import * as THREE from 'three';
import { PLANET_RADIUS } from '../globe.ts';
import { isShown, radiusOf } from '../places.ts';
import type { FleetSite } from '../fleet.ts';
import { unitAt } from '../sphere.ts';
import { REACH, flyerPose } from './flight.ts';
import type { AirSource, Flight, FlyerKind } from './flight.ts';
import { AIRLINER_SPEED, AIRPORT_OUT, HOP_MAX, createAirliners } from './airliners.ts';
import { CIRCUIT_SPEED, circuitFlight } from './circuits.ts';
import {
  AIRSHIP_POP,
  AIRSHIP_RUN,
  AIRSHIP_SLOT,
  AIRSHIP_SPEED,
  BALLOON_DRIFT_MAX,
  BALLOON_FLIGHT,
  BALLOON_SLOT,
  HELI_POP,
  HELI_SPEED,
  createCityFlights,
} from './city-flights.ts';

/**
 * The timetable: every flight as a pure function of the clock and the
 * places, so every client sees the same aircraft with nothing sent.
 */

export interface AirSchedule {
  /** The hubs, as indices into `places`, most populous first. */
  readonly hubs: readonly number[];
  /**
   * Every flight up at `seconds` within its kind's `REACH` of `direction`,
   * appended to `out`. Flights are kept by id while asked for, so the same
   * flight is the same object from one call to the next.
   *
   * With `ahead`, every flight up and within reach at any instant of
   * `[seconds, seconds + ahead]`: the reach widens by how far the kind flies
   * in that time. The caller filters by the live instant.
   */
  flightsNear(direction: THREE.Vector3, seconds: number, out: Flight[], ahead?: number): Flight[];
  /** A hub's destination for its `n`th departure, or -1. */
  destinationOf(hub: number, n: number): number;
  /** A strip's circuit, or null where it has none. */
  circuitOf(site: FleetSite): Flight | null;
  /** The airliners from one hub up at `seconds` (or at any instant up to `until`). */
  airlinersFrom(hub: number, seconds: number, out: Flight[], until?: number): Flight[];
  /** A balloon town's flight in a slot, or null. */
  balloonOf(place: number, slot: number): Flight | null;
}

/** How far each kind can get in a second, which widens a scan's reach by its window. */
export const SPEED_OF: Readonly<Record<FlyerKind, number>> = {
  airliner: AIRLINER_SPEED,
  plane: CIRCUIT_SPEED,
  helicopter: HELI_SPEED,
  balloon: BALLOON_DRIFT_MAX,
  airship: AIRSHIP_SPEED,
};

export function createAirSchedule(source: AirSource): AirSchedule {
  const { places } = source;
  const centres = places.map((place) => unitAt(place.lat, place.lon, new THREE.Vector3()));
  const shown = places.map((place) => isShown(place));

  const kept = new Map<string, { flight: Flight; seen: number }>();
  let scan = 0;
  const keep = (id: string, make: () => Flight | null): Flight | null => {
    const known = kept.get(id);
    if (known !== undefined) {
      known.seen = scan;
      return known.flight;
    }
    const flight = make();
    if (flight !== null) kept.set(id, { flight, seen: scan });
    return flight;
  };
  /** Flights that turned out not to fly, so they are not worked out again. */
  const grounded = new Set<string>();

  const { hubs, destinationOf, airlinersFrom } = createAirliners(places, centres, shown, keep, grounded);
  const city = createCityFlights(source, centres, shown);
  const heliCities = places.map((_, i) => i).filter((i) => shown[i] && places[i]!.pop >= HELI_POP);
  const airshipCities = places.map((_, i) => i).filter((i) => shown[i] && places[i]!.pop >= AIRSHIP_POP);
  const balloonTowns = source.keepsBalloon === undefined ? [] : places.map((_, i) => i).filter((i) => shown[i] && source.keepsBalloon!(i));

  const sites: FleetSite[] = [];
  const probe = flyerPose();
  // A flight not yet up is asked where it will start; the widened reach
  // covers wherever it gets to by the end of the window.
  const near = (flight: Flight, direction: THREE.Vector3, seconds: number, ahead: number): boolean => {
    flight.pose(Math.min(flight.to, Math.max(flight.from, seconds)), probe);
    return probe.position.angleTo(direction) * PLANET_RADIUS < REACH[flight.kind] + SPEED_OF[flight.kind] * ahead;
  };
  const within = (p: number, direction: THREE.Vector3, reach: number): boolean =>
    centres[p]!.dot(direction) >= Math.cos(Math.min(Math.PI, reach / PLANET_RADIUS));

  /** The slotted flights of one town between `seconds` and `until`. */
  function slotted(
    prefix: string,
    p: number,
    slotLength: number,
    make: (p: number, slot: number) => Flight | null,
    direction: THREE.Vector3,
    seconds: number,
    until: number,
    ahead: number,
    out: Flight[],
  ): void {
    for (let slot = Math.floor(seconds / slotLength); slot <= Math.floor(until / slotLength); slot++) {
      const id = `${prefix}:${p}:${slot}`;
      if (grounded.has(id)) continue;
      const flight = keep(id, () => make(p, slot));
      if (flight === null) {
        grounded.add(id);
        continue;
      }
      if (until >= flight.from && seconds < flight.to && near(flight, direction, seconds, ahead)) out.push(flight);
    }
  }

  function flightsNear(direction: THREE.Vector3, seconds: number, out: Flight[], ahead = 0): Flight[] {
    scan++;
    const until = seconds + ahead;
    const list: Flight[] = [];
    for (const hub of hubs) {
      if (!within(hub, direction, HOP_MAX + REACH.airliner + AIRPORT_OUT + 200)) continue;
      list.length = 0;
      for (const flight of airlinersFrom(hub, seconds, list, until)) if (near(flight, direction, seconds, ahead)) out.push(flight);
    }
    if (source.strips !== undefined) {
      sites.length = 0;
      for (const site of source.strips.planesNear(direction, REACH.plane, sites)) {
        const id = `circuit:${site.id}`;
        if (grounded.has(id)) continue;
        const flight = keep(id, () => circuitFlight(source, site));
        if (flight === null) grounded.add(id);
        else out.push(flight);
      }
    }
    for (const p of heliCities) {
      if (!within(p, direction, REACH.helicopter + radiusOf(places[p]!) + 500)) continue;
      const count = city.helicoptersOf(p);
      for (let n = 0; n < count; n++) {
        const flight = keep(`helicopter:${p}:${n}`, () => city.helicopter(p, n))!;
        out.push(flight);
      }
    }
    const reachBalloon = REACH.balloon + BALLOON_FLIGHT * BALLOON_DRIFT_MAX + 400;
    for (const p of balloonTowns) {
      if (!within(p, direction, reachBalloon)) continue;
      slotted('balloon', p, BALLOON_SLOT, city.balloon, direction, seconds, until, ahead, out);
    }
    for (const p of airshipCities) {
      if (!within(p, direction, REACH.airship + AIRSHIP_RUN + 400)) continue;
      slotted('airship', p, AIRSHIP_SLOT, city.airship, direction, seconds, until, ahead, out);
    }
    // Forget what has not been asked for in a while.
    if (scan % 16 === 0) {
      for (const [id, entry] of kept) if (scan - entry.seen > 32) kept.delete(id);
      if (grounded.size > 4096) grounded.clear();
    }
    return out;
  }

  return {
    hubs,
    destinationOf,
    airlinersFrom,
    circuitOf: (site) => keep(`circuit:${site.id}`, () => circuitFlight(source, site)),
    balloonOf: (p, slot) => city.balloon(p, slot),
    flightsNear,
  };
}
