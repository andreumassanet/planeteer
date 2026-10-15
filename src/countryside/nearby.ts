/** What is built round the cell being planned: towns, landmarks, planes' fields and carriageways, in its frame. */
import * as THREE from 'three';
import { PLANET_RADIUS, UNITS_PER_DEGREE, WORLD_SCALE } from '../globe.ts';
import { isShown, radiusOf } from '../places.ts';
import { countryReach } from '../scenery/grid.ts';
import { roadClearance, roadGeometryFor, roadIndexFor } from '../roads.ts';
import type { FieldKeepout } from '../fleet.ts';
import { latOf, lonOf, unitAt } from '../sphere.ts';
import { planReach, planShape } from '../landmark-ground.ts';
import type { PlanShape } from '../landmark-ground.ts';
import { FIELD_CLEARANCE, MONUMENT_CLEARANCE } from '../tile-grid.ts';
import { DEG, localX, localZ } from './frame.ts';
import type { CellFrame } from './frame.ts';
import type { CountrysideOptions } from './types.ts';

/**
 * How far from a town counts as near it, and from a road: what `find` and the
 * density both mean by far. The town's is 800 nominal units, since towns stand
 * as far apart as the planet puts them; the road's is a walk off the verge.
 */
export const NEAR_TOWN = 800 * WORLD_SCALE;
export const NEAR_ROAD = 220;

export interface Disc {
  x: number;
  z: number;
  radius: number;
}

/** A landmark's plan in the cell's frame: its point there, and the plan kept `MONUMENT_CLEARANCE` off. */
export interface PlanAt {
  x: number;
  z: number;
  shape: PlanShape;
}

export interface Segment {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  clearance: number;
}

/** The lists `gather` fills for one cell. */
export interface Nearby {
  townDiscs: Disc[];
  builtDiscs: Disc[];
  builtPlans: PlanAt[];
  roadSegments: Segment[];
}

export interface Gatherer {
  nearby: Nearby;
  /** Fills `nearby` for the cell the frame is oriented on, within `radius` of its centre. */
  gather(radius: number): void;
  /** Re-reads which towns are shown (the prominence knob moved). */
  indexTowns(): void;
}

const BUCKET = 2;
const bucketKey = (a: number, b: number): number => a * 1000 + b;

export function createGatherer(frame: CellFrame, options: CountrysideOptions): Gatherer {
  const nearby: Nearby = { townDiscs: [], builtDiscs: [], builtPlans: [], roadSegments: [] };
  // The towns, bucketed by degree.
  let towns = new Map<number, { x: number; y: number; z: number; reach: number }[]>();
  let widestTown = 0;
  const indexTowns = (): void => {
    towns = new Map();
    widestTown = 0;
    for (const place of options.places ?? []) {
      if (!isShown(place)) continue;
      const reach = countryReach(radiusOf(place));
      widestTown = Math.max(widestTown, reach);
      const u = unitAt(place.lat, place.lon, new THREE.Vector3());
      const key = bucketKey(Math.floor((place.lat + 90) / BUCKET), Math.floor((place.lon + 180) / BUCKET));
      let list = towns.get(key);
      if (list === undefined) towns.set(key, (list = []));
      list.push({ x: u.x, y: u.y, z: u.z, reach });
    }
  };
  indexTowns();

  // A landmark is kept off by the ground its model stands on (its plan); a
  // site with none is its footprint's disc.
  const monuments = (options.monuments ?? []).map((site) => {
    const shape = planShape(site);
    return { unit: unitAt(site.lat, site.lon, new THREE.Vector3()), shape, reach: planReach(shape) + MONUMENT_CLEARANCE };
  });

  const roads = options.roads;
  const roadIndex = roads !== undefined && options.places !== undefined && roads.length > 0 ? roadIndexFor(roads, options.places) : null;
  const roadGeometry = roadIndex !== null ? roadGeometryFor(roads!, options.places!) : null;
  const roadHits: number[] = [];
  const fieldHits: FieldKeepout[] = [];
  const scratch = new THREE.Vector3();

  function gatherTowns(radius: number): void {
    const { up } = frame;
    const lat = latOf(up.y);
    const lon = lonOf(up.x, up.z);
    const reachDeg = (radius + NEAR_TOWN + widestTown) / UNITS_PER_DEGREE;
    const rows = Math.ceil(reachDeg / BUCKET) + 1;
    const spread = Math.min(180, reachDeg / Math.max(Math.cos(lat * DEG), 0.05));
    const cols = Math.min(Math.ceil(360 / BUCKET), Math.ceil(spread / BUCKET) + 1);
    const a0 = Math.floor((lat + 90) / BUCKET);
    const b0 = Math.floor((lon + 180) / BUCKET);
    const wrap = Math.round(360 / BUCKET);
    const cos = Math.cos((radius + NEAR_TOWN + widestTown) / PLANET_RADIUS);
    for (let a = a0 - rows; a <= a0 + rows; a++) {
      for (let b = b0 - cols; b <= b0 + cols; b++) {
        const list = towns.get(bucketKey(a, ((b % wrap) + wrap) % wrap));
        if (list === undefined) continue;
        for (const town of list) {
          const dot = town.x * up.x + town.y * up.y + town.z * up.z;
          if (dot < cos) continue;
          scratch.set(town.x, town.y, town.z);
          nearby.townDiscs.push({ x: localX(frame, scratch), z: localZ(frame, scratch), radius: town.reach });
        }
      }
    }
  }

  function gatherRoads(radius: number): void {
    if (roadIndex === null || roadGeometry === null) return;
    roadIndex.near(frame.up, radius + NEAR_ROAD + 40, roadHits);
    for (const hit of roadHits) {
      const path = roadGeometry.path(hit);
      const clearance = roadClearance(roads![hit]!.cls);
      let x0 = 0;
      let z0 = 0;
      for (let step = 0; step < path.count; step++) {
        scratch.set(path.xyz[step * 3]!, path.xyz[step * 3 + 1]!, path.xyz[step * 3 + 2]!);
        const x = localX(frame, scratch);
        const z = localZ(frame, scratch);
        if (step > 0) {
          const mx = (x0 + x) / 2;
          const mz = (z0 + z) / 2;
          const limit = radius + NEAR_ROAD + 100;
          if (mx * mx + mz * mz < limit * limit) nearby.roadSegments.push({ x0, z0, x1: x, z1: z, clearance });
        }
        x0 = x;
        z0 = z;
      }
    }
  }

  function gather(radius: number): void {
    nearby.townDiscs.length = 0;
    nearby.builtDiscs.length = 0;
    nearby.builtPlans.length = 0;
    nearby.roadSegments.length = 0;
    gatherTowns(radius);
    for (const site of monuments) {
      if (site.unit.dot(frame.up) < Math.cos((radius + site.reach + 60) / PLANET_RADIUS)) continue;
      nearby.builtPlans.push({ x: localX(frame, site.unit), z: localZ(frame, site.unit), shape: site.shape });
    }
    if (options.fields !== undefined) {
      fieldHits.length = 0;
      for (const field of options.fields.fieldsNear(frame.up, radius + FIELD_CLEARANCE + 40, fieldHits)) {
        nearby.builtDiscs.push({ x: localX(frame, field.at), z: localZ(frame, field.at), radius: field.radius + FIELD_CLEARANCE });
      }
    }
    gatherRoads(radius);
  }

  return { nearby, gather, indexTowns };
}

/** How far a point is from the nearest town's country, negative inside it. */
export function townGap(nearby: Nearby, x: number, z: number): number {
  let best = Infinity;
  for (const town of nearby.townDiscs) best = Math.min(best, Math.hypot(x - town.x, z - town.z) - town.radius);
  return best;
}

/** The nearest carriageway to a point: its gap to the edge, which way it runs there, and the nearest point on it. */
export interface RoadNearest {
  gap: number;
  dx: number;
  dz: number;
  x: number;
  z: number;
}

const roadNearest: RoadNearest = { gap: Infinity, dx: 0, dz: 1, x: 0, z: 0 };

/** How far a point is from the nearest carriageway's edge, and which way that road runs there. The result is reused. */
export function roadGap(nearby: Nearby, x: number, z: number): RoadNearest {
  roadNearest.gap = Infinity;
  for (const road of nearby.roadSegments) {
    const dx = road.x1 - road.x0;
    const dz = road.z1 - road.z0;
    const lengthSq = dx * dx + dz * dz;
    let t = lengthSq > 1e-9 ? ((x - road.x0) * dx + (z - road.z0) * dz) / lengthSq : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = road.x0 + t * dx;
    const pz = road.z0 + t * dz;
    const gap = Math.hypot(x - px, z - pz) - road.clearance;
    if (gap < roadNearest.gap) {
      const length = Math.sqrt(lengthSq) || 1;
      roadNearest.gap = gap;
      roadNearest.dx = dx / length;
      roadNearest.dz = dz / length;
      roadNearest.x = px;
      roadNearest.z = pz;
    }
  }
  return roadNearest;
}
