import * as THREE from 'three';
import { PLANET_RADIUS } from '../globe.ts';
import { radiusOf } from '../places.ts';
import type { Place } from '../places.ts';
import { emptyCourse, joinCourse } from '../roads/course.ts';
import type { RoadCourse } from '../roads/course.ts';
import { placeDirection, townOf, townOffset } from '../roads/town.ts';
import { offsetDirection } from '../scenery/grid.ts';
import { RAIL_HANDLE, STATION_RUN, STATION_TURN } from './line.ts';
import type { RailLine } from './line.ts';

/** Where a line's end stands: the terminus, the way out along the line, and the platform's side. */
export interface StationFrame {
  /** The terminus (the buffer stop), a unit direction. */
  at: THREE.Vector3;
  /** Out along the line, a unit tangent at `at`. */
  out: THREE.Vector3;
  /** Toward the platform, a unit tangent at `at`. */
  side: THREE.Vector3;
  /** +1 or -1: the line's own `sideA` or `sideB`. */
  hand: number;
}

export function emptyStation(): StationFrame {
  return { at: new THREE.Vector3(), out: new THREE.Vector3(), side: new THREE.Vector3(), hand: 1 };
}

const stationProbe = new THREE.Vector3();
const stationOffset = { x: 0, z: 0 };

/**
 * A city's station on a line to `other`: the terminus on `bearing` (in
 * `STATION_TURN` steps from north, in the city's frame) `out` units past the
 * city's disc, the platform on `hand`'s side. The bearing only places the
 * terminus; the track always sets off toward the other city.
 */
export function stationFor(place: Place, other: Place, bearing: number, hand: number, out: number, into: StationFrame): StationFrame {
  const town = townOf(place);
  const angle = bearing * STATION_TURN;
  const reach = radiusOf(place) + out;
  offsetDirection(town.up, town.across, town.north, Math.sin(angle) * reach, Math.cos(angle) * reach, into.at);
  // Screen right is `forward x up`.
  placeDirection(other, into.out);
  into.out.addScaledVector(into.at, -into.out.dot(into.at)).normalize();
  into.side.crossVectors(into.out, into.at).normalize().multiplyScalar(hand);
  into.hand = hand;
  return into;
}

/** The bearing toward another place, in the city's frame, radians from north. */
export function bearingToward(place: Place, other: Place): number {
  townOffset(townOf(place), placeDirection(other, stationProbe), stationOffset);
  return Math.atan2(stationOffset.x, stationOffset.z);
}

export function lineStation(line: RailLine, end: 0 | 1, places: readonly Place[], into: StationFrame): StationFrame {
  return end === 0
    ? stationFor(places[line.a]!, places[line.b]!, line.bearingA, line.sideA, line.outA, into)
    : stationFor(places[line.b]!, places[line.a]!, line.bearingB, line.sideB, line.outB, into);
}

/** A point of a station's frame (`x` toward the platform, `z` out along the line) as a unit direction. */
export function stationPoint(station: StationFrame, x: number, z: number, out: THREE.Vector3): THREE.Vector3 {
  return out
    .copy(station.at)
    .addScaledVector(station.side, x / PLANET_RADIUS)
    .addScaledVector(station.out, z / PLANET_RADIUS)
    .normalize();
}

const stationA = emptyStation();
const stationB = emptyStation();

/**
 * A line's course as a road's: the stations are the gates, the stubs are
 * `STATION_RUN` out along each platform, and the middle is `joinCourse`'s, so
 * the road course functions walk a line as they walk a road.
 */
export function railCourse(line: RailLine, places: readonly Place[], into: RoadCourse = emptyCourse()): RoadCourse {
  lineStation(line, 0, places, stationA);
  lineStation(line, 1, places, stationB);
  into.gateA.copy(stationA.at);
  into.gateB.copy(stationB.at);
  stationPoint(stationA, 0, STATION_RUN, into.stubA);
  stationPoint(stationB, 0, STATION_RUN, into.stubB);
  return joinCourse(into, stationA.out, stationB.out, line.bend, STATION_RUN, RAIL_HANDLE);
}
