import * as THREE from 'three';
import { PLANET_RADIUS } from '../globe.ts';
import { radiusOf } from '../places.ts';
import { SCENERY_SCALE } from '../stature.ts';
import { AIRSHIP_PAINTS_COUNT } from '../craft/airliner.ts';
import type { AirSource, Flight } from './flight.ts';
import { S_AIRSHIP, S_BALLOON, S_HELI, TAU, hashUnit, hullAt, offsetOnSphere, orient, smooth, tangentsAt } from './paths.ts';

/** Flights that hang off one town: helicopters, balloons and airships. */

/**
 * Helicopters: one over `HELI_SHARE` of the cities of `HELI_POP`, two over
 * those of `HELI_TWO`, flying a looping figure round the centre at
 * `HELI_HEIGHT` over its ground and never under `HELI_CLEAR` over the hull.
 */
export const HELI_POP = 1_000_000;
const HELI_TWO = 5_000_000;
const HELI_SHARE = 0.75;
export const HELI_SPEED = 26;
const HELI_HEIGHT = 170;
const HELI_CLEAR = 110;

/**
 * Balloons: a town that keeps one may send it up in each `BALLOON_SLOT` of the
 * clock with odds `BALLOON_ODDS`, if the wind is calm. It inflates just upwind
 * of the town, climbs over `BALLOON_CLIMB` seconds, drifts over the town and
 * comes down over `BALLOON_DESCENT`. A flight that would land in water or in a
 * town is not flown.
 */
export const BALLOON_SLOT = 1500;
const BALLOON_ODDS = 0.5;
export const BALLOON_FLIGHT = 900;
const BALLOON_CLIMB = 120;
const BALLOON_DESCENT = 150;
/** Seconds on the ground at each end: inflating, and folding away. */
const BALLOON_GROUND = 15;
const BALLOON_DRIFT_MIN = 2.5;
export const BALLOON_DRIFT_MAX = 5;

/**
 * Airships: over a city of `AIRSHIP_POP`, in `AIRSHIP_ODDS` of the slots of
 * `AIRSHIP_SLOT`, one slow straight pass at `AIRSHIP_HEIGHT` from
 * `AIRSHIP_RUN` units out on one side to as far out on the other.
 */
export const AIRSHIP_POP = 3_000_000;
export const AIRSHIP_SLOT = 2400;
const AIRSHIP_ODDS = 0.4;
export const AIRSHIP_SPEED = 8;
export const AIRSHIP_RUN = 3200;
const AIRSHIP_HEIGHT = 260;
const AIRSHIP_CLEAR = 180;

const under = new THREE.Vector3();
const landing = new THREE.Vector3();

export interface CityFlights {
  helicopter(p: number, n: number): Flight;
  /** How many helicopters a city flies: 0, 1 or 2. */
  helicoptersOf(p: number): number;
  balloon(p: number, slot: number): Flight | null;
  airship(p: number, slot: number): Flight | null;
}

function frameAt(centre: THREE.Vector3): { east: THREE.Vector3; north: THREE.Vector3 } {
  const east = new THREE.Vector3();
  const north = new THREE.Vector3();
  tangentsAt(centre, east, north);
  return { east, north };
}

export function createCityFlights(source: AirSource, centres: readonly THREE.Vector3[], shown: readonly boolean[]): CityFlights {
  const { places } = source;

  function helicopter(p: number, n: number): Flight {
    const place = places[p]!;
    const centre = centres[p]!;
    const { east, north } = frameAt(centre);
    const r1 = radiusOf(place) * 0.9 + 80 + n * 120;
    const r2 = r1 * (0.25 + 0.15 * hashUnit(p, n, S_HELI));
    const turn = hashUnit(p, n, S_HELI + 1) < 0.5 ? -1 : 1;
    const omega = (turn * HELI_SPEED) / (r1 + 1.5 * r2);
    const phase = hashUnit(p, n, S_HELI + 2) * TAU;
    const lobe = hashUnit(p, n, S_HELI + 3) * TAU;
    const base = hullAt(centre) + HELI_HEIGHT + n * 40;
    const at = (seconds: number, out: THREE.Vector3): THREE.Vector3 => {
      const theta = ((seconds * omega) % TAU) + phase;
      const x = r1 * Math.cos(theta) + r2 * Math.cos(-2 * theta + lobe);
      const y = r1 * Math.sin(theta) + r2 * Math.sin(-2 * theta + lobe);
      offsetOnSphere(centre, east, north, x, y, under);
      const r = Math.max(base + 25 * Math.sin((seconds % 600) * 0.21 + phase), hullAt(under) + HELI_CLEAR);
      return out.copy(under).multiplyScalar(r);
    };
    return {
      id: `helicopter:${p}:${n}`,
      kind: 'helicopter',
      variant: Math.floor(hashUnit(p, n, S_HELI + 4) * 6),
      from: -Infinity,
      to: Infinity,
      pose(seconds, out) {
        orient(at, seconds, out);
        out.grounded = false;
        out.shown = 1;
        return out;
      },
    };
  }
  const helicoptersOf = (p: number): number => (hashUnit(p, 0, S_HELI + 5) >= HELI_SHARE ? 0 : places[p]!.pop >= HELI_TWO ? 2 : 1);

  function inTown(direction: THREE.Vector3): boolean {
    for (let i = 0; i < places.length; i++) {
      if (!shown[i]) continue;
      if (centres[i]!.dot(direction) < 0.999) continue;
      if (centres[i]!.angleTo(direction) * PLANET_RADIUS < radiusOf(places[i]!) + 20) return true;
    }
    return false;
  }

  function balloon(p: number, slot: number): Flight | null {
    if (hashUnit(p, slot, S_BALLOON) >= BALLOON_ODDS) return null;
    const place = places[p]!;
    const from = slot * BALLOON_SLOT + hashUnit(p, slot, S_BALLOON + 1) * (BALLOON_SLOT - BALLOON_FLIGHT);
    const centre = centres[p]!;
    const { east, north } = frameAt(centre);
    let we = 0;
    let wn = 0;
    let drift = BALLOON_DRIFT_MIN + (BALLOON_DRIFT_MAX - BALLOON_DRIFT_MIN) * hashUnit(p, slot, S_BALLOON + 2);
    const wind = source.wind?.(place.lat, place.lon, from * 1000);
    if (wind !== undefined) {
      if (!wind.calm) return null;
      we = wind.east;
      wn = wind.north;
      drift = Math.min(BALLOON_DRIFT_MAX, Math.max(BALLOON_DRIFT_MIN, wind.speed * SCENERY_SCALE * 0.6));
    } else {
      const heading = hashUnit(p, slot, S_BALLOON + 3) * TAU;
      we = Math.sin(heading);
      wn = Math.cos(heading);
    }
    const norm = Math.hypot(we, wn) || 1;
    we /= norm;
    wn /= norm;
    // Launch just upwind of the town, so it drifts over it.
    const back = radiusOf(place) + 45;
    const start = offsetOnSphere(centre, east, north, -we * back, -wn * back, new THREE.Vector3());
    const travel = (BALLOON_FLIGHT - 2 * BALLOON_GROUND) * drift;
    offsetOnSphere(start, east, north, we * travel, wn * travel, landing);
    if (source.ground(landing) <= PLANET_RADIUS + 0.5 || inTown(landing)) return null;
    offsetOnSphere(start, east, north, we * travel * 0.5, wn * travel * 0.5, landing);
    if (source.ground(landing) <= PLANET_RADIUS + 0.5 && source.ground(start) <= PLANET_RADIUS + 0.5) return null;
    const height = 150 + 150 * hashUnit(p, slot, S_BALLOON + 4);
    const to = from + BALLOON_FLIGHT;
    const at = (seconds: number, out: THREE.Vector3): THREE.Vector3 => {
      const t = Math.min(BALLOON_FLIGHT, Math.max(0, seconds - from));
      const moving = Math.min(BALLOON_FLIGHT - 2 * BALLOON_GROUND, Math.max(0, t - BALLOON_GROUND));
      const run = moving * drift;
      offsetOnSphere(start, east, north, we * run, wn * run, under);
      const up = height * smooth(BALLOON_GROUND, BALLOON_GROUND + BALLOON_CLIMB, t) * smooth(BALLOON_GROUND, BALLOON_GROUND + BALLOON_DESCENT, BALLOON_FLIGHT - t);
      // On the ground at either end; aloft, over the hull, which does not step.
      const floor = up < 0.01 ? source.ground(under) : source.ground(under) + (hullAt(under) - source.ground(under)) * smooth(0, 12, up);
      return out.copy(under).multiplyScalar(floor + up);
    };
    const facing = new THREE.Vector3().copy(east).multiplyScalar(we).addScaledVector(north, wn);
    return {
      id: `balloon:${p}:${slot}`,
      kind: 'balloon',
      variant: Math.floor(hashUnit(p, slot, S_BALLOON + 5) * 6),
      from,
      to,
      pose(seconds, out) {
        orient(at, seconds, out, false);
        const t = seconds - from;
        // Turns slowly on its rope, whichever way it drifts.
        out.forward.copy(facing).applyAxisAngle(out.up, 0.6 * Math.sin(t * 0.013) + ((p % 7) * TAU) / 7);
        out.forward.addScaledVector(out.up, -out.forward.dot(out.up)).normalize();
        out.grounded = t < BALLOON_GROUND + 1 || t > BALLOON_FLIGHT - BALLOON_GROUND - 1;
        out.shown = Math.min(smooth(0, BALLOON_GROUND * 0.8, t), smooth(0, BALLOON_GROUND * 0.8, BALLOON_FLIGHT - t));
        return out;
      },
    };
  }

  function airship(p: number, slot: number): Flight | null {
    if (hashUnit(p, slot, S_AIRSHIP) >= AIRSHIP_ODDS) return null;
    const centre = centres[p]!;
    const { east, north } = frameAt(centre);
    const bearing = hashUnit(p, slot, S_AIRSHIP + 1) * TAU;
    const be = Math.sin(bearing);
    const bn = Math.cos(bearing);
    const off = (hashUnit(p, slot, S_AIRSHIP + 2) - 0.5) * 600;
    const duration = (2 * AIRSHIP_RUN) / AIRSHIP_SPEED;
    const from = slot * AIRSHIP_SLOT + hashUnit(p, slot, S_AIRSHIP + 3) * (AIRSHIP_SLOT - duration);
    const base = hullAt(centre) + AIRSHIP_HEIGHT;
    const at = (seconds: number, out: THREE.Vector3): THREE.Vector3 => {
      const s = -AIRSHIP_RUN + Math.min(2 * AIRSHIP_RUN, Math.max(0, (seconds - from) * AIRSHIP_SPEED));
      offsetOnSphere(centre, east, north, be * s + bn * off, bn * s - be * off, under);
      return out.copy(under).multiplyScalar(Math.max(base, hullAt(under) + AIRSHIP_CLEAR));
    };
    return {
      id: `airship:${p}:${slot}`,
      kind: 'airship',
      variant: Math.floor(hashUnit(p, slot, S_AIRSHIP + 4) * AIRSHIP_PAINTS_COUNT),
      from,
      to: from + duration,
      pose(seconds, out) {
        orient(at, seconds, out, false);
        out.grounded = false;
        out.shown = Math.min(smooth(0, 20, seconds - from), smooth(0, 20, from + duration - seconds));
        return out;
      },
    };
  }

  return { helicopter, helicoptersOf, balloon, airship };
}
