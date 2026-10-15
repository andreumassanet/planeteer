/**
 * What every site search shares: the built towns in a grid, the road index and
 * the landmarks, and the tests for "is this spot taken".
 */
import * as THREE from 'three';
import type { World } from '../geo.ts';
import { PLANET_RADIUS, UNITS_PER_DEGREE, groundRadius } from '../globe.ts';
import { BUILT_CEILING, isShown } from '../places.ts';
import type { Place } from '../places.ts';
import {
  courseOf,
  coursePath,
  emptyCourse,
  roadClearance,
  roadIndexFor,
  townOf,
  townOffset,
} from '../roads.ts';
import type { CoursePath, Road, RoadIndex } from '../roads.ts';
import { latOf, lonOf, unitAt } from '../sphere.ts';
import { plannedSite, siteGap } from '../landmark-ground.ts';
import { isWater } from '../vehicles.ts';
import { CELL, COLS, DEG, FIELD_CLEAR, ROWS } from './site-rules.ts';
import type { FleetSource } from './site-types.ts';

/** Great-circle distance from a unit direction to a road's polyline, in units. */
export function distanceToPath(path: CoursePath, direction: THREE.Vector3): number {
  const xyz = path.xyz;
  let best = Infinity;
  for (let k = 0; k + 1 < path.count; k++) {
    const ax = xyz[k * 3]!, ay = xyz[k * 3 + 1]!, az = xyz[k * 3 + 2]!;
    const bx = xyz[k * 3 + 3]!, by = xyz[k * 3 + 4]!, bz = xyz[k * 3 + 5]!;
    // The chord is the arc to a part in a hundred million over a path's
    // pieces, so the nearest point on it is the nearest point on the road.
    const ex = bx - ax, ey = by - ay, ez = bz - az;
    const length = ex * ex + ey * ey + ez * ez;
    let t = length > 0 ? ((direction.x - ax) * ex + (direction.y - ay) * ey + (direction.z - az) * ez) / length : 0;
    t = Math.min(1, Math.max(0, t));
    const dx = direction.x - (ax + ex * t);
    const dy = direction.y - (ay + ey * t);
    const dz = direction.z - (az + ez * t);
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < best) best = d;
  }
  return best * PLANET_RADIUS;
}

export interface SiteTowns {
  readonly world: World;
  readonly places: readonly Place[];
  readonly roads: readonly Road[];
  readonly roadIndex: RoadIndex;
  readonly monuments: ReturnType<typeof plannedSite>[];
  /** Each place's centre as a unit direction, and whether it is built. */
  readonly centres: THREE.Vector3[];
  readonly shown: boolean[];
  /** The roads that end at each place. */
  readonly byPlace: Map<number, number[]>;
  readonly course: ReturnType<typeof emptyCourse>;
  pathOf(road: number): CoursePath;
  /** Scratch for the ground tests. */
  readonly probe: THREE.Vector3;
  wet(direction: THREE.Vector3): boolean;
  /** Every built town whose centre is within `radius` units of `direction`, into `out`. */
  townsNear(direction: THREE.Vector3, radius: number, out: number[]): number[];
  /** Inside any built town's square, grown by `margin` units. */
  inSquare(direction: THREE.Vector3, margin: number): boolean;
  /** Within `clear` units of the drawn edge of any road. */
  nearRoad(direction: THREE.Vector3, clear: number): boolean;
  nearMonument(direction: THREE.Vector3, clear: number): boolean;
}

export function createSiteTowns(source: FleetSource): SiteTowns {
  const { world, places, roads } = source;

  // The landmarks by the ground their model takes, as the towns and the wood keep off it.
  const monuments = (source.monuments ?? []).map(plannedSite);
  const roadIndex: RoadIndex = roadIndexFor(roads, places);

  // The built towns, bucketed. Hidden places stand for nothing: no square, no gates.
  const cells: number[][] = Array.from({ length: COLS * ROWS }, () => []);
  const centres: THREE.Vector3[] = [];
  const shown: boolean[] = [];
  places.forEach((place, i) => {
    centres.push(unitAt(place.lat, place.lon, new THREE.Vector3()));
    shown.push(isShown(place));
    if (!shown[i]) return;
    cells[cellOf(place.lat, place.lon)]!.push(i);
  });

  const byPlace = new Map<number, number[]>();
  roads.forEach((road, i) => {
    for (const end of [road.a, road.b]) {
      let list = byPlace.get(end);
      if (list === undefined) byPlace.set(end, (list = []));
      list.push(i);
    }
  });

  const paths = new Map<number, CoursePath>();
  const course = emptyCourse();
  const pathOf = (road: number): CoursePath => {
    let path = paths.get(road);
    if (path === undefined) {
      path = coursePath(courseOf(roads[road]!, places, course));
      paths.set(road, path);
    }
    return path;
  };

  const probe = new THREE.Vector3();
  const offset = { x: 0, z: 0 };
  const list: number[] = [];
  const townList: number[] = [];

  const wet = (direction: THREE.Vector3): boolean =>
    isWater(groundRadius(world, probe.copy(direction).multiplyScalar(PLANET_RADIUS)));

  /** Every built town whose centre is within `radius` units of `direction`, into `out`. */
  function townsNear(direction: THREE.Vector3, radius: number, out: number[]): number[] {
    out.length = 0;
    const lat = latOf(direction.y);
    const lon = lonOf(direction.x, direction.z);
    const span = radius / UNITS_PER_DEGREE;
    const rows = Math.ceil(span / CELL);
    const cols = Math.ceil(span / Math.max(0.02, Math.cos(lat * DEG)) / CELL);
    const row = Math.floor((90 - lat) / CELL);
    const col = Math.floor((lon + 180) / CELL);
    const limit = Math.cos(Math.min(Math.PI, radius / PLANET_RADIUS));
    for (let r = Math.max(0, row - rows); r <= Math.min(ROWS - 1, row + rows); r++) {
      for (let c = col - Math.min(cols, COLS / 2); c <= col + Math.min(cols, COLS / 2 - 1); c++) {
        for (const i of cells[r * COLS + (((c % COLS) + COLS) % COLS)]!) {
          if (centres[i]!.dot(direction) >= limit) out.push(i);
        }
      }
    }
    return out;
  }

  /** Inside any built town's square, grown by `margin` units. */
  function inSquare(direction: THREE.Vector3, margin: number): boolean {
    for (const q of townsNear(direction, BUILT_CEILING + margin + 10, townList)) {
      const town = townOf(places[q]!);
      if (direction.dot(town.up) <= 0) continue;
      townOffset(town, direction, offset);
      const half = town.grid.half + margin;
      if (Math.abs(offset.x) < half && Math.abs(offset.z) < half) return true;
    }
    return false;
  }

  /** Within `clear` units of the drawn edge of any road. */
  function nearRoad(direction: THREE.Vector3, clear: number): boolean {
    for (const r of roadIndex.near(direction, clear + 12, list)) {
      if (distanceToPath(pathOf(r), direction) < roadClearance(roads[r]!.cls) + clear) return true;
    }
    return false;
  }

  const monumentProbe = new THREE.Vector3();
  function nearMonument(direction: THREE.Vector3, clear: number): boolean {
    const keep = FIELD_CLEAR + clear;
    const p = monumentProbe.copy(direction).normalize();
    for (const m of monuments) {
      const dot = p.x * m.up.x + p.y * m.up.y + p.z * m.up.z;
      if (dot < Math.cos((m.reach + keep) / PLANET_RADIUS)) continue;
      if (siteGap(m, p, PLANET_RADIUS) < keep) return true;
    }
    return false;
  }

  return {
    world,
    places,
    roads,
    roadIndex,
    monuments,
    centres,
    shown,
    byPlace,
    course,
    pathOf,
    probe,
    wet,
    townsNear,
    inSquare,
    nearRoad,
    nearMonument,
  };
}

function cellOf(lat: number, lon: number): number {
  const row = Math.min(ROWS - 1, Math.max(0, Math.floor((90 - lat) / CELL)));
  const col = ((Math.floor((lon + 180) / CELL) % COLS) + COLS) % COLS;
  return row * COLS + col;
}
