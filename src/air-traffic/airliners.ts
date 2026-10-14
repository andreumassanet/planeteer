import * as THREE from 'three';
import { PLANET_RADIUS } from '../globe.ts';
import { radiusOf } from '../places.ts';
import type { Place } from '../places.ts';
import { AIRLINER_LIVERIES } from '../craft/airliner.ts';
import type { Flight } from './flight.ts';
import { S_AIRPORT, S_DEST, S_LIVERY, S_PHASE, TAU, hashUnit, offsetOnSphere, orient, smooth, tangentsAt } from './paths.ts';

/**
 * Airliners between the great cities. The hubs are the `HUB_COUNT` most
 * populous built places of at least `HUB_POP`; each sends a flight every
 * `AIRLINER_EVERY` seconds to another hub `HOP_MIN`..`HOP_MAX` away, leaving
 * and arriving at `DEPART` over an airport outside the city and cruising at
 * `CRUISE`. `AIRLINER_SPEED` is chosen for how fast it crosses the sky (about
 * two degrees a second at cruise), not for realism.
 */
export const HUB_COUNT = 160;
export const HUB_POP = 1_000_000;
export const AIRLINER_EVERY = 150;
export const AIRLINER_SPEED = 55;
export const CRUISE = 1700;
/** Over `MAX_RELIEF` (680) and the shelf, so a flight never needs the ground. */
export const DEPART = 800;
const CLIMB_RUN = 3000;
const DESCENT_RUN = 3600;
export const HOP_MIN = 2000;
export const HOP_MAX = 9500;
/** How far outside its city's disc a hub's airport is. */
export const AIRPORT_OUT = 300;
/** Seconds to appear over the airport, and to go. */
const APPEAR = 6;

/** Returns a kept flight by id, building it on first ask; null for one that does not fly. */
export type KeepFlight = (id: string, make: () => Flight | null) => Flight | null;

export interface Airliners {
  readonly hubs: readonly number[];
  destinationOf(hub: number, n: number): number;
  airlinersFrom(hub: number, seconds: number, out: Flight[], until?: number): Flight[];
}

/** The hubs, as indices into `places`, most populous first. */
function hubsOf(places: readonly Place[], shown: readonly boolean[]): number[] {
  return places
    .map((place, i) => ({ place, i }))
    .filter(({ place, i }) => shown[i] && place.pop >= HUB_POP)
    .sort((a, b) => b.place.pop - a.place.pop || a.i - b.i)
    .slice(0, HUB_COUNT)
    .map(({ i }) => i);
}

export function createAirliners(
  places: readonly Place[],
  centres: readonly THREE.Vector3[],
  shown: readonly boolean[],
  keep: KeepFlight,
  grounded: Set<string>,
): Airliners {
  const hubs = hubsOf(places, shown);
  const hopMin = Math.cos(HOP_MIN / PLANET_RADIUS);
  const hopMax = Math.cos(HOP_MAX / PLANET_RADIUS);
  const destinations = hubs.map((h) =>
    hubs.filter((g) => {
      if (g === h) return false;
      const dot = centres[h]!.dot(centres[g]!);
      return dot <= hopMin && dot >= hopMax;
    }),
  );
  const hubSlot = new Map(hubs.map((h, k) => [h, k]));

  // Each hub's airport: just outside its disc, on a hashed bearing.
  const airports = hubs.map((h) => {
    const bearing = hashUnit(h, S_AIRPORT, 0) * TAU;
    const out = radiusOf(places[h]!) + AIRPORT_OUT;
    const east = new THREE.Vector3();
    const north = new THREE.Vector3();
    tangentsAt(centres[h]!, east, north);
    return offsetOnSphere(centres[h]!, east, north, Math.sin(bearing) * out, Math.cos(bearing) * out, new THREE.Vector3());
  });

  const destinationOf = (hub: number, n: number): number => {
    const k = hubSlot.get(hub);
    if (k === undefined) return -1;
    const list = destinations[k]!;
    if (list.length === 0) return -1;
    return list[Math.min(list.length - 1, Math.floor(hashUnit(hub, n, S_DEST) * list.length))]!;
  };
  const phaseOf = (hub: number): number => hashUnit(hub, S_PHASE, 0) * AIRLINER_EVERY;
  const longest = HOP_MAX / AIRLINER_SPEED + 60;

  function airliner(hub: number, n: number): Flight | null {
    const to = destinationOf(hub, n);
    if (to < 0) return null;
    const a = airports[hubSlot.get(hub)!]!;
    const b = airports[hubSlot.get(to)!]!;
    const angle = a.angleTo(b);
    const distance = angle * PLANET_RADIUS;
    const axis = new THREE.Vector3().crossVectors(a, b).normalize();
    const side = new THREE.Vector3().crossVectors(axis, a);
    const from = n * AIRLINER_EVERY + phaseOf(hub);
    const duration = distance / AIRLINER_SPEED;
    const altitudeAt = (s: number): number => DEPART + (CRUISE - DEPART) * Math.min(smooth(0, CLIMB_RUN, s), smooth(0, DESCENT_RUN, distance - s));
    const at = (seconds: number, out: THREE.Vector3): THREE.Vector3 => {
      const s = Math.min(distance, Math.max(0, (seconds - from) * AIRLINER_SPEED));
      const phi = s / PLANET_RADIUS;
      return out.copy(a).multiplyScalar(Math.cos(phi)).addScaledVector(side, Math.sin(phi)).multiplyScalar(PLANET_RADIUS + altitudeAt(s));
    };
    return {
      id: `airliner:${hub}:${n}`,
      kind: 'airliner',
      variant: Math.floor(hashUnit(hub, n, S_LIVERY) * AIRLINER_LIVERIES),
      from,
      to: from + duration,
      pose(seconds, out) {
        orient(at, seconds, out, false);
        out.grounded = false;
        out.shown = Math.min(smooth(0, APPEAR, seconds - from), smooth(0, APPEAR, from + duration - seconds));
        return out;
      },
    };
  }

  function airlinersFrom(hub: number, seconds: number, out: Flight[], until = seconds): Flight[] {
    const phase = phaseOf(hub);
    const last = Math.floor((until - phase) / AIRLINER_EVERY);
    const first = Math.floor((seconds - phase - longest) / AIRLINER_EVERY);
    for (let n = first; n <= last; n++) {
      const id = `airliner:${hub}:${n}`;
      if (grounded.has(id)) continue;
      const flight = keep(id, () => airliner(hub, n));
      if (flight === null) {
        grounded.add(id);
        continue;
      }
      if (until >= flight.from && seconds < flight.to) out.push(flight);
    }
    return out;
  }

  return { hubs, destinationOf, airlinersFrom };
}
