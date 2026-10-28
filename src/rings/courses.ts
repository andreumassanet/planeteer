/**
 * Every course there is, of three kinds, each a pure function of the world:
 *
 * - **air**: one a country of `COURSE_MIN_AREA` or more, a loop of rings
 *   round its capital (`rings/anchors.ts`, `courseOf` in `rings/layout.ts`),
 *   flown with any aircraft;
 * - **land**: one a country with a course, a rally of arches along the
 *   longest road out of its capital that is long enough to be worth driving,
 *   from the capital's gate to the next town's, driven with anything on wheels
 *   or hooves;
 * - **sea**: one a sea, a loop of buoyed arches offshore of a port on it,
 *   wherever a loop that size fits in open water, sailed with anything that
 *   floats.
 *
 * A site is cheap and known up front (the map draws them all); its rings are
 * laid only when somebody comes near (`buildCourse`).
 */
import * as THREE from 'three';
import { PLANET_RADIUS } from '../globe/planet.ts';
import { radiusOf } from '../places.ts';
import type { Place } from '../places.ts';
import { coursePath, courseOf as roadCourseOf } from '../roads.ts';
import type { Road } from '../roads/types.ts';
import { unitAt } from '../sphere.ts';
import { COURSE_GAP, courseOf, hashUnit, tangentsAt } from './layout.ts';
import type { Ring } from './layout.ts';

export type CourseKind = 'air' | 'sea' | 'land';

export interface CourseSite {
  /** `a:<place>`, `l:<place>` or `s:<sea id>`: the key the record keeps a best time under. */
  key: string;
  kind: CourseKind;
  title: string;
  /** Where it is, a unit direction: the town an air or land course starts from, the port a sea course lies off. */
  at: THREE.Vector3;
  /** How near `at`, units, a craft of its kind is shown the course. */
  reach: number;
  /** Round and back to its first ring (air, sea) or from one end to the other (land). */
  loop: boolean;
  /** The place it belongs to, for an air or land course; -1 for a sea's. */
  place: number;
}

/** What laying a course's rings needs from the world. */
export interface CourseWorld {
  places: readonly Place[];
  roads: readonly Road[];
  planetRadius: number;
  sea: number;
  groundAt: (direction: THREE.Vector3) => number;
  isWater: (ground: number) => boolean;
}

/** How far past an air course's loop it is still shown from an aircraft, units. */
export const AIR_SHOW = 2600;

/**
 * A rally runs road after road out of its capital until it is
 * `LAND_TARGET` long (about 2.4 km) or `LAND_LEGS` roads; under `LAND_MIN`
 * (1.2 km) it is no rally. A road between two towns is a few hundred units,
 * so a rally passes through the villages on its way.
 */
export const LAND_MIN = 1500;
export const LAND_TARGET = 3000;
export const LAND_LEGS = 8;
/** Units between two arches along a road, about: eight to ten seconds of driving between them. */
export const LAND_SPACING = 380;
/** The fewest arches a rally has. */
export const LAND_GATES_MIN = 5;
/** An arch's radius, units: the carriageway and both verges under it with room to drift. */
export const LAND_GATE_RADIUS = 13;
/** Units of road kept clear of a town's gate at either end of a road, so no arch stands in a town's mouth. */
export const LAND_CLEAR = 60;
/** Shown to a driver within this of the capital, units: the rally's start is at one of its gates. */
export const LAND_SHOW = 1800;

/** The seas, each by the port its course lies off. Coordinates are the ports'. */
export const SEAS: readonly { id: string; name: string; lat: number; lon: number }[] = [
  { id: 'mediterranean', name: 'Mediterranean Sea', lat: 41.38, lon: 2.18 },
  { id: 'caribbean', name: 'Caribbean Sea', lat: 18.47, lon: -66.11 },
  { id: 'north-sea', name: 'North Sea', lat: 57.15, lon: -2.09 },
  { id: 'baltic', name: 'Baltic Sea', lat: 54.35, lon: 18.65 },
  { id: 'black-sea', name: 'Black Sea', lat: 46.48, lon: 30.73 },
  { id: 'red-sea', name: 'Red Sea', lat: 21.54, lon: 39.17 },
  { id: 'gulf-of-mexico', name: 'Gulf of Mexico', lat: 19.17, lon: -96.13 },
  { id: 'south-china-sea', name: 'South China Sea', lat: 16.05, lon: 108.2 },
  { id: 'sea-of-japan', name: 'Sea of Japan', lat: 37.92, lon: 139.04 },
  { id: 'arabian-sea', name: 'Arabian Sea', lat: 18.94, lon: 72.82 },
  { id: 'persian-gulf', name: 'Persian Gulf', lat: 25.27, lon: 55.3 },
  { id: 'bay-of-bengal', name: 'Bay of Bengal', lat: 13.08, lon: 80.29 },
  { id: 'tasman-sea', name: 'Tasman Sea', lat: -33.86, lon: 151.21 },
  { id: 'atlantic', name: 'Atlantic Ocean', lat: -22.91, lon: -43.17 },
  { id: 'pacific', name: 'Pacific Ocean', lat: 33.74, lon: -118.27 },
  { id: 'indian', name: 'Indian Ocean', lat: -29.86, lon: 31.03 },
];
/** A sea course's loop radius and how many buoyed arches it has. */
export const SEA_LOOP = 520;
export const SEA_GATES = 8;
/** An arch on the water's radius, units: a launch and its wake under it. */
export const SEA_GATE_RADIUS = 20;
/** How far off its port a sea course's centre is tried, units, nearest first. */
export const SEA_OFFSETS = [800, 1200, 1700, 2300] as const;
/** Bearings tried round the port. */
export const SEA_BEARINGS = 12;
/** Sea room round the loop, units: every arch and the water this far inside and outside it must be open sea. */
export const SEA_ROOM = 90;
/** Shown to a skipper within this of the port, units. */
export const SEA_SHOW = 4500;

/** Every site, of every kind: the air and land ones by their anchors, the seas by `SEAS`. */
export function courseSites(
  places: readonly Place[],
  anchors: readonly number[],
  roads: readonly Road[],
  countryName: (iso: string) => string,
): CourseSite[] {
  const sites: CourseSite[] = [];
  for (const index of anchors) {
    const place = places[index]!;
    const at = unitAt(place.lat, place.lon, new THREE.Vector3());
    const country = countryName(place.iso);
    sites.push({
      key: `a:${index}`, kind: 'air', title: `${country} sky course`, at, place: index, loop: true,
      reach: radiusOf(place) + COURSE_GAP * 1.2 + AIR_SHOW,
    });
    const route = rallyRoute(index, places, roads);
    if (route !== null) {
      const end = places[route.end]!;
      sites.push({ key: `l:${index}`, kind: 'land', title: `${country} road rally · ${place.name} to ${end.name}`, at: at.clone(), place: index, loop: false, reach: LAND_SHOW });
    }
  }
  for (const sea of SEAS) {
    sites.push({ key: `s:${sea.id}`, kind: 'sea', title: `${sea.name} race`, at: unitAt(sea.lat, sea.lon, new THREE.Vector3()), place: -1, loop: true, reach: SEA_SHOW });
  }
  return sites;
}

/** A rally's route: the roads it runs, each with the town it leaves from, and the town it ends at. */
export interface RallyRoute {
  legs: { road: Road; from: number }[];
  end: number;
  /** As the crow flies, town to town, units. */
  length: number;
}

const unitOf = (place: Place, out = new THREE.Vector3()): THREE.Vector3 => unitAt(place.lat, place.lon, out);

/** Roads by the towns they join, built once a road list. */
const joined = new WeakMap<readonly Road[], Map<number, Road[]>>();
function roadsAt(roads: readonly Road[], town: number): readonly Road[] {
  let byTown = joined.get(roads);
  if (byTown === undefined) {
    byTown = new Map();
    for (const road of roads) {
      for (const end of [road.a, road.b]) {
        let list = byTown.get(end);
        if (list === undefined) byTown.set(end, (list = []));
        list.push(road);
      }
    }
    joined.set(roads, byTown);
  }
  return byTown.get(town) ?? [];
}

/**
 * A rally out of a town: from it, road after road, always on to the town that
 * lies furthest from the start, never back through one already passed and
 * never over a frontier,
 * until the route is `LAND_TARGET` long or `LAND_LEGS` roads; null when it
 * comes to less than `LAND_MIN`, which is no rally.
 */
export function rallyRoute(index: number, places: readonly Place[], roads: readonly Road[], planetRadius = PLANET_RADIUS): RallyRoute | null {
  const start = unitOf(places[index]!);
  const there = new THREE.Vector3();
  const passed = new Set([index]);
  const legs: RallyRoute['legs'] = [];
  let town = index;
  let length = 0;
  while (length < LAND_TARGET && legs.length < LAND_LEGS) {
    let best: Road | null = null;
    let bestOut = -1;
    for (const road of roadsAt(roads, town)) {
      const other = road.a === town ? road.b : road.a;
      if (passed.has(other) || places[other]!.iso !== places[index]!.iso) continue;
      const out = start.angleTo(unitOf(places[other]!, there));
      if (out > bestOut) {
        bestOut = out;
        best = road;
      }
    }
    if (best === null) break;
    const other = best.a === town ? best.b : best.a;
    length += unitOf(places[town]!).angleTo(unitOf(places[other]!, there)) * planetRadius;
    legs.push({ road: best, from: town });
    passed.add(other);
    town = other;
  }
  return length >= LAND_MIN ? { legs, end: town, length } : null;
}

const point = new THREE.Vector3();
const ahead = new THREE.Vector3();

/**
 * The arches of a rally: along each road of its route as drawn, about
 * `LAND_SPACING` apart and `LAND_CLEAR` out of the towns at both ends of it,
 * the towns between driven through by their own streets.
 */
export function landCourse(site: CourseSite, world: CourseWorld): Ring[] | null {
  const route = rallyRoute(site.place, world.places, world.roads, world.planetRadius);
  if (route === null) return null;
  const rings: Ring[] = [];
  for (const { road, from } of route.legs) {
    const path = coursePath(roadCourseOf(road, world.places));
    const forward = road.a === from;
    const usable = path.length - 2 * LAND_CLEAR;
    if (usable <= 0) continue;
    const count = Math.max(1, Math.round(usable / LAND_SPACING));
    for (let i = 0; i < count; i++) {
      const along = LAND_CLEAR + (usable * (i + 0.5)) / count;
      const s = forward ? along : path.length - along;
      pointAlong(path, s, point);
      pointAlong(path, s + (forward ? 6 : -6), ahead);
      const up = point.clone();
      const axis = ahead.clone().sub(point);
      axis.addScaledVector(up, -axis.dot(up)).normalize();
      const ground = Math.max(world.groundAt(up), world.sea);
      const n = rings.length;
      rings.push({ key: `${site.key}:${n}`, kind: 'course', index: n, centre: up.multiplyScalar(ground), axis, radius: LAND_GATE_RADIUS });
    }
  }
  return rings.length >= LAND_GATES_MIN ? rings : null;
}

/** The unit direction `s` units along a road's path from gate A. */
function pointAlong(path: ReturnType<typeof coursePath>, s: number, out: THREE.Vector3): THREE.Vector3 {
  const clamped = Math.min(Math.max(s, 0), path.length);
  let i = 1;
  while (i < path.count - 1 && path.s[i]! < clamped) i++;
  const s0 = path.s[i - 1]!;
  const s1 = path.s[i]!;
  const t = s1 > s0 ? (clamped - s0) / (s1 - s0) : 0;
  const x = path.xyz;
  out.set(
    x[(i - 1) * 3]! + (x[i * 3]! - x[(i - 1) * 3]!) * t,
    x[(i - 1) * 3 + 1]! + (x[i * 3 + 1]! - x[(i - 1) * 3 + 1]!) * t,
    x[(i - 1) * 3 + 2]! + (x[i * 3 + 2]! - x[(i - 1) * 3 + 2]!) * t,
  );
  return out.normalize();
}

/**
 * A sea's loop: the first centre off its port, by `SEA_OFFSETS` then
 * `SEA_BEARINGS` from a seeded start, round which every arch and the sea
 * `SEA_ROOM` either side of the loop is open water. Null where none fits.
 */
export function seaCourse(site: CourseSite, world: CourseWorld): Ring[] | null {
  const { planetRadius, groundAt, isWater } = world;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  tangentsAt(site.at, a, b);
  const start = hashUnit(site.key) * Math.PI * 2;
  const centre = new THREE.Vector3();
  const ca = new THREE.Vector3();
  const cb = new THREE.Vector3();
  const probe = new THREE.Vector3();
  const wet = (angle: number, reach: number): boolean => {
    probe.copy(centre).addScaledVector(ca, Math.cos(angle) * Math.tan(reach / planetRadius)).addScaledVector(cb, Math.sin(angle) * Math.tan(reach / planetRadius)).normalize();
    return isWater(groundAt(probe));
  };
  for (const offset of SEA_OFFSETS) {
    for (let k = 0; k < SEA_BEARINGS; k++) {
      const bearing = start + (k * Math.PI * 2) / SEA_BEARINGS;
      const out = a.clone().multiplyScalar(Math.cos(bearing)).addScaledVector(b, Math.sin(bearing));
      centre.copy(site.at).addScaledVector(out, Math.tan(offset / planetRadius)).normalize();
      tangentsAt(centre, ca, cb);
      let open = isWater(groundAt(centre));
      for (let j = 0; open && j < SEA_GATES * 2; j++) {
        const angle = (j * Math.PI) / SEA_GATES;
        open = wet(angle, SEA_LOOP) && wet(angle, SEA_LOOP - SEA_ROOM) && wet(angle, SEA_LOOP + SEA_ROOM);
      }
      if (!open) continue;
      const way = hashUnit(`${site.key}:way`) < 0.5 ? 1 : -1;
      const rings: Ring[] = [];
      for (let i = 0; i < SEA_GATES; i++) {
        const angle = (way * i * Math.PI * 2) / SEA_GATES;
        const at = centre.clone()
          .addScaledVector(ca, Math.cos(angle) * Math.tan(SEA_LOOP / planetRadius))
          .addScaledVector(cb, Math.sin(angle) * Math.tan(SEA_LOOP / planetRadius))
          .normalize();
        const axis = ca.clone().multiplyScalar(-Math.sin(angle)).addScaledVector(cb, Math.cos(angle)).multiplyScalar(way);
        axis.addScaledVector(at, -axis.dot(at)).normalize();
        rings.push({ key: `${site.key}:${i}`, kind: 'course', index: i, centre: at.multiplyScalar(world.sea), axis, radius: SEA_GATE_RADIUS });
      }
      return rings;
    }
  }
  return null;
}

/** A site's rings, or null where it cannot be laid (no road in bounds, no open sea). */
export function buildCourse(site: CourseSite, world: CourseWorld): Ring[] | null {
  if (site.kind === 'land') return landCourse(site, world);
  if (site.kind === 'sea') return seaCourse(site, world);
  const place = world.places[site.place]!;
  return courseOf(place, site.place, radiusOf(place), world.planetRadius, world.groundAt, world.sea);
}
