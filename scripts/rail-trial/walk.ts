import { Vector3 } from 'three';
import type { World } from '../../src/geo.ts';
import { PLANET_RADIUS } from '../../src/globe.ts';
import type { Place } from '../../src/places.ts';
import type { FieldIndex, FieldKeepout } from '../../src/fleet.ts';
import { roadClearance } from '../../src/roads/classes.ts';
import { coursePoint, courseTangent } from '../../src/roads/course.ts';
import type { RoadCourse } from '../../src/roads/course.ts';
import { BRIDGE_LAND, rampReach } from '../../src/roads/crown.ts';
import type { RoadRamp } from '../../src/roads/crown.ts';
import { parameterAt, tightestTurn } from '../../src/roads/path.ts';
import type { CoursePath, RoadGeometry } from '../../src/roads/path.ts';
import type { RoadIndex } from '../../src/roads/spatial-index.ts';
import type { Road } from '../../src/roads/types.ts';
import { BED_FOOT, CROSSING_ANGLE, CROSSING_CLEAR, RAIL_CLEARANCE, RAIL_GRADE, RAIL_LIFT, RAIL_MIN_RADIUS } from '../../src/rails/line.ts';
import type { RailLine } from '../../src/rails/line.ts';
import { crownAt, crownProfile, steepestGrade } from '../../src/rails/crown.ts';
import { nearestOnPath } from '../../src/rails/network.ts';
import { emptyStation, stationFor } from '../../src/rails/stations.ts';
import type { StationFrame } from '../../src/rails/stations.ts';
import { MAX_SLOPE, flattenWeightAt, gradeAt } from '../../src/terrain.ts';
import type { Slope } from '../../src/terrain.ts';
import { latOf, lonOf } from '../../src/sphere.ts';
import type { LaidGrid } from './grids.ts';
import { STEP, TOWN_CLEAR } from './types.ts';
import type { Crossing, RailRefusal, RailVerdict } from './types.ts';

export interface LineWalkSource {
  world: World;
  places: readonly Place[];
  roads: readonly Road[];
  roadIndex: RoadIndex;
  roadGeometry: RoadGeometry;
  widestRoad: number;
  fields: Pick<FieldIndex, 'fieldsNear'>;
  inTown(point: Vector3, clear: number): boolean;
  laid: LaidGrid;
  station(frame: StationFrame, key?: string): RailRefusal | null;
  rampFor(road: number): RoadRamp;
  geometryOf(line: RailLine): { course: RoadCourse; path: CoursePath };
}

/** A run of probes within one road's reach, to tell a crossing from a stretch alongside. */
interface Run {
  from: number;
  to: number;
  best: number;
  s: number;
  roadS: number;
}

/**
 * The whole walk of a line: both stations, the turn, then every `STEP` units
 * the water, the towns, the landmarks, the other lines, the fields, the slope
 * and the roads it meets, and last the crown's grade and its flushness at
 * every level crossing.
 */
export function createLineWalk(source: LineWalkSource): (line: RailLine) => RailVerdict {
  const { world, places, roads, roadIndex, roadGeometry, widestRoad } = source;
  const roadHits: number[] = [];
  const fieldHits: FieldKeepout[] = [];
  const probe = new Vector3();
  const tangent = new Vector3();
  const side = new Vector3();
  const ahead = new Vector3();
  const slope: Slope = { grade: 0, across: 0, north: 0, lowest: 0, highest: 0 };
  const stationA = emptyStation();
  const stationB = emptyStation();

  /** Judges a finished run of probes near road `r`: a level crossing (recorded) or a refusal. */
  function settle(r: number, run: Run, course: RoadCourse, path: CoursePath, crossings: Crossing[]): RailRefusal | null {
    const road = roads[r]!;
    const reach = roadClearance(road.cls) + BED_FOOT;
    // A true crossing passes over the road's centre line between two probes.
    if (run.best > STEP) return 'alongside';
    const roadPath = roadGeometry.path(r);
    const roadCourse = roadGeometry.course(r);
    courseTangent(roadCourse, parameterAt(roadPath, run.roadS), ahead);
    coursePoint(course, parameterAt(path, run.s), probe);
    courseTangent(course, parameterAt(path, run.s), tangent);
    const angle = Math.acos(Math.min(1, Math.abs(ahead.dot(tangent))));
    if (angle < CROSSING_ANGLE) return 'crossing';
    // Clear of each end's levelling, pavement and ramp, where the carriageway is off the ground's own lift.
    const ramp = source.rampFor(r);
    const clearA = ramp.levelA + ramp.walkA + rampReach(ramp.riseA) + CROSSING_CLEAR;
    const clearB = ramp.levelB + ramp.walkB + rampReach(ramp.riseB) + CROSSING_CLEAR;
    if (run.roadS < clearA || run.roadS > roadPath.length - clearB) return 'crossing';
    // Nor on a bridge's ramps.
    if (road.bridgeTo > road.bridgeFrom && run.roadS > road.bridgeFrom - BRIDGE_LAND - CROSSING_CLEAR && run.roadS < road.bridgeTo + BRIDGE_LAND + CROSSING_CLEAR) return 'crossing';
    if (run.to - run.from > (2 * reach) / Math.sin(angle) + 2 * STEP) return 'alongside';
    crossings.push({ road: r, s: run.s, roadS: run.roadS, angle });
    return null;
  }

  /** The ground at one probe of the walk, or null where it passes. */
  function groundAt(course: RoadCourse, t: number, s: number, k: number, length: number): RailRefusal | null {
    coursePoint(course, t, probe);
    const lat = latOf(probe.y);
    const lon = lonOf(probe.x, probe.z);
    if (world.countryAt(lat, lon) === 0) return 'wet';
    if (source.inTown(probe, TOWN_CLEAR)) return 'town';
    if (flattenWeightAt(probe.x, probe.y, probe.z) > 0) return 'landmark';
    // Off the other lines, except by its own stations' platforms, which the station test covers.
    if (s > 20 && s < length - 20 && source.laid.near(probe, RAIL_CLEARANCE + 2)) return 'rail';
    if (k % 4 === 0) {
      fieldHits.length = 0;
      if (source.fields.fieldsNear(probe, RAIL_CLEARANCE, fieldHits).length > 0) return 'field';
      courseTangent(course, t, tangent);
      side.crossVectors(tangent, probe).normalize();
      ahead.crossVectors(side, probe).normalize();
      if (gradeAt(probe, side, ahead, BED_FOOT, slope).grade > MAX_SLOPE) return 'steep';
    }
    return null;
  }

  /** Adds this probe to the runs of the roads within reach of it (`probe` holds the point). */
  function trackRoads(s: number, runs: Map<number, Run>, live: Set<number>): void {
    live.clear();
    for (const r of roadIndex.near(probe, widestRoad + BED_FOOT, roadHits)) {
      const hit = nearestOnPath(roadGeometry.path(r), probe);
      if (hit.off >= roadClearance(roads[r]!.cls) + BED_FOOT) continue;
      live.add(r);
      const run = runs.get(r);
      if (run === undefined) runs.set(r, { from: s, to: s, best: hit.off, s, roadS: hit.s });
      else {
        run.to = s;
        if (hit.off < run.best) {
          run.best = hit.off;
          run.s = s;
          run.roadS = hit.s;
        }
      }
    }
  }

  return (line) => {
    const crossings: Crossing[] = [];
    const refuse = (refusal: RailRefusal, at: number): RailVerdict => ({ refusal, at, crossings });
    stationFor(places[line.a]!, places[line.b]!, line.bearingA, line.sideA, line.outA, stationA);
    stationFor(places[line.b]!, places[line.a]!, line.bearingB, line.sideB, line.outB, stationB);
    const refusedA = source.station(stationA, `${line.a}:${line.b}:${line.bearingA}:${line.sideA}:${line.outA}`);
    if (refusedA !== null) return refuse(refusedA, 0);
    const refusedB = source.station(stationB, `${line.b}:${line.a}:${line.bearingB}:${line.sideB}:${line.outB}`);
    if (refusedB !== null) return refuse(refusedB, Infinity);
    const { course, path } = source.geometryOf(line);
    if (tightestTurn(path) < RAIL_MIN_RADIUS) return refuse('turn', 0);

    const runs = new Map<number, Run>();
    const steps = Math.max(2, Math.ceil(path.length / STEP));
    const live = new Set<number>();
    for (let k = 0; k <= steps; k++) {
      const s = (path.length * k) / steps;
      const t = parameterAt(path, s);
      const ground = groundAt(course, t, s, k, path.length);
      if (ground !== null) return refuse(ground, s);
      trackRoads(s, runs, live);
      for (const [r, run] of runs) {
        if (live.has(r)) continue;
        runs.delete(r);
        const refused = settle(r, run, course, path, crossings);
        if (refused !== null) return refuse(refused, s);
      }
    }
    for (const [r, run] of runs) {
      const refused = settle(r, run, course, path, crossings);
      if (refused !== null) return refuse(refused, run.s);
    }

    const crown = crownProfile(line, places, world, course, path);
    if (steepestGrade(crown) > RAIL_GRADE) return refuse('grade', 0);
    // Flush at every crossing: the crown is the ground's own lift there.
    for (const crossing of crossings) {
      coursePoint(course, parameterAt(path, crossing.s), probe);
      const ground = PLANET_RADIUS + world.elevationAt(probe) + RAIL_LIFT;
      if (Math.abs(crownAt(crown, crossing.s) - ground) > 0.5) return refuse('crest', crossing.s);
    }
    return { refusal: null, at: Infinity, crossings };
  };
}
