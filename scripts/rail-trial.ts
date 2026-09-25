/**
 * Whether a railway line can be laid: the one walk `build-rails.ts` makes to
 * choose a line and `check-rails.ts` makes again over the shipped file, so the
 * line that was tested is the line that is checked.
 *
 * Every test is on what will be drawn — the stations `rails.ts` stands off
 * each city and the course between them — and the cheapest first:
 *
 * - **the stations** stand on dry land, off every town, road, landmark and
 *   field, off every other line's track and stations, and on ground level
 *   enough that the floor held over its highest corner is no embankment;
 * - **the curve** turns no tighter than `RAIL_MIN_RADIUS`;
 * - **the walk**, every `STEP` units: dry, out of every built town's disc by
 *   `TOWN_CLEAR`, off every landmark's pad, every plane's and balloon's field
 *   and every other line, no steeper across than `MAX_SLOPE`, and across a road
 *   only at a level crossing — square enough (`CROSSING_ANGLE`), clear of
 *   either end's ramp by `CROSSING_CLEAR`, and nowhere alongside one;
 * - **the crown** climbs no steeper than `RAIL_GRADE`, and at every crossing
 *   it is the ground's own lift, so the ballast meets the carriageway flush.
 */
import { Vector3 } from 'three';
import type { World } from '../src/geo.ts';
import { PLANET_RADIUS } from '../src/globe.ts';
import { isShown, radiusOf } from '../src/places.ts';
import type { Place } from '../src/places.ts';
import { BRIDGE_LAND, ROAD_CLASSES, coursePath, coursePoint, courseTangent, emptyRamp, parameterAt, rampOf, rampReach, roadClearance, roadGeometryFor, roadIndexFor, tightestTurn } from '../src/roads.ts';
import type { CoursePath, Road, RoadCourse, RoadRamp } from '../src/roads.ts';
import { MAX_SLOPE, flattenWeightAt, gradeAt } from '../src/terrain.ts';
import type { Slope } from '../src/terrain.ts';
import type { FieldIndex, FieldKeepout } from '../src/fleet.ts';
import {
  BED_FOOT,
  CROSSING_ANGLE,
  CROSSING_CLEAR,
  RAIL_CLEARANCE,
  RAIL_GRADE,
  RAIL_LIFT,
  RAIL_MIN_RADIUS,
  STATION_BOX,
  crownAt,
  crownProfile,
  emptyStation,
  nearestOnPath,
  railCourse,
  stationFor,
  stationLevel,
  stationPoint,
  steepestGrade,
} from '../src/rails.ts';
import type { RailLine, StationFrame } from '../src/rails.ts';
import { latOf, lonOf, unitAt } from '../src/sphere.ts';

const DEG = Math.PI / 180;

/** The walk's stride along a line, in units. */
export const STEP = 3;
/** What a line keeps clear of a town's disc. */
export const TOWN_CLEAR = 14;
/** The most a station's floor may stand over the lowest ground under it: more is a platform on stilts. */
export const STATION_EMBANK = 9;
/** How near two lines, or a line and another's station, may come, centre to centre. */
export const LINE_GAP = RAIL_CLEARANCE * 2 + 2;
/** The station's footprint about its middle line, across the track. */
const FOOT_MIDDLE = (STATION_BOX.x0 + STATION_BOX.x1) / 2;
const FOOT_HALF = (STATION_BOX.x1 - STATION_BOX.x0) / 2;

export type RailRefusal =
  | 'station-wet'
  | 'station-town'
  | 'station-road'
  | 'station-field'
  | 'station-landmark'
  | 'station-rail'
  | 'station-steep'
  | 'turn'
  | 'wet'
  | 'town'
  | 'landmark'
  | 'field'
  | 'rail'
  | 'steep'
  | 'crossing'
  | 'alongside'
  | 'grade'
  | 'crest';

export interface Crossing {
  road: number;
  /** Units along the line from terminus A, and along the road from its gate A. */
  s: number;
  roadS: number;
  /** The angle between them, radians, 0 to pi/2. */
  angle: number;
}

export interface RailVerdict {
  refusal: RailRefusal | null;
  /** Where along the line, in units, when the walk refused it. */
  at: number;
  crossings: Crossing[];
}

/** What another line leaves on the ground for the next to keep off. */
export interface Laid {
  /** Points along its track and over its stations, unit directions, and the reach each keeps. */
  points: { at: Vector3; reach: number }[];
}

export interface RailTrial {
  /** Whether a station can stand here, and why not. */
  station(station: StationFrame, key?: string): RailRefusal | null;
  /** The whole walk of a line, stations included. */
  line(line: RailLine): RailVerdict;
  /** A line's track and stations, for the lines after it to keep off. */
  lay(line: RailLine): Laid;
  /** Registers a line as laid. */
  accept(laid: Laid): void;
  /** A line's course and path, as the walk laid them. */
  geometry(line: RailLine): { course: RoadCourse; path: CoursePath };
}

export interface RailSource {
  world: World;
  places: readonly Place[];
  roads: readonly Road[];
  fields: Pick<FieldIndex, 'fieldsNear'>;
}

export function createRailTrial(source: RailSource): RailTrial {
  const { world, places, roads } = source;
  const roadIndex = roadIndexFor(roads, places);
  const roadGeometry = roadGeometryFor(roads, places);
  const widestRoad = roadClearance(ROAD_CLASSES.length - 1);

  // The built towns in a two-degree grid, as `build-roads.ts` keeps them.
  const CELL = 2;
  const COLS = Math.round(360 / CELL);
  const ROWS = Math.round(180 / CELL);
  const cells: number[][] = Array.from({ length: COLS * ROWS }, () => []);
  const centres = places.map((place) => unitAt(place.lat, place.lon, new Vector3()));
  places.forEach((place, i) => {
    if (!isShown(place)) return;
    const row = Math.min(ROWS - 1, Math.max(0, Math.floor((90 - place.lat) / CELL)));
    const col = ((Math.floor((place.lon + 180) / CELL) % COLS) + COLS) % COLS;
    cells[row * COLS + col]!.push(i);
  });
  function inTown(point: Vector3, clear: number): boolean {
    const lat = latOf(point.y);
    const lon = lonOf(point.x, point.z);
    const row = Math.min(ROWS - 1, Math.max(0, Math.floor((90 - lat) / CELL)));
    const span = Math.ceil(1 / Math.max(0.02, Math.cos(lat * DEG)));
    const col = Math.floor((lon + 180) / CELL);
    for (let r = Math.max(0, row - 1); r <= Math.min(ROWS - 1, row + 1); r++) {
      for (let c = col - span; c <= col + span; c++) {
        for (const j of cells[r * COLS + (((c % COLS) + COLS) % COLS)]!) {
          if (point.angleTo(centres[j]!) * PLANET_RADIUS < radiusOf(places[j]!) + clear) return true;
        }
      }
    }
    return false;
  }

  // What the lines already laid keep, in a one-degree grid.
  const LAID_CELL = 1;
  const LAID_COLS = Math.round(360 / LAID_CELL);
  const laidCells = new Map<number, { at: Vector3; reach: number }[]>();
  const laidKey = (lat: number, lon: number): number =>
    Math.min(179, Math.max(0, Math.floor((90 - lat) / LAID_CELL))) * LAID_COLS + ((Math.floor((lon + 180) / LAID_CELL) % LAID_COLS) + LAID_COLS) % LAID_COLS;
  function nearLaid(point: Vector3, reach: number): boolean {
    const lat = latOf(point.y);
    const lon = lonOf(point.x, point.z);
    const cos = Math.max(0.05, Math.cos(lat * DEG));
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -Math.ceil(1 / cos); dc <= Math.ceil(1 / cos); dc++) {
        const list = laidCells.get(laidKey(lat + dr * LAID_CELL, lon + dc * LAID_CELL));
        if (list === undefined) continue;
        for (const other of list) if (point.angleTo(other.at) * PLANET_RADIUS < reach + other.reach) return true;
      }
    }
    return false;
  }

  const roadHits: number[] = [];
  const fieldHits: FieldKeepout[] = [];
  const probe = new Vector3();
  const tangent = new Vector3();
  const side = new Vector3();
  const ahead = new Vector3();
  const slope: Slope = { grade: 0, across: 0, north: 0, lowest: 0, highest: 0 };

  /** The nearest road's edge to a point, in units past its drawn half-width, or Infinity past `reach`. */
  function roadGapAt(point: Vector3, reach: number): number {
    let best = Infinity;
    for (const r of roadIndex.near(point, reach + widestRoad, roadHits)) {
      const hit = nearestOnPath(roadGeometry.path(r), point);
      best = Math.min(best, hit.off - roadClearance(roads[r]!.cls));
    }
    return best;
  }

  const stationProbe = new Vector3();
  /** What a station's own ground says, which no line laid later can change: kept by the station's key. */
  const grounds = new Map<string, RailRefusal | null>();
  function stationGround(frame: StationFrame): RailRefusal | null {
    // Down its middle first: a road, a town or a field is what refuses most
    // stations, and each is one question a probe.
    for (let z = STATION_BOX.z0; z <= STATION_BOX.z1 + 1e-6; z += 8) {
      stationPoint(frame, FOOT_MIDDLE, z, stationProbe);
      if (inTown(stationProbe, FOOT_HALF + 2)) return 'station-town';
      if (roadGapAt(stationProbe, FOOT_HALF + 4) < FOOT_HALF + 1.5) return 'station-road';
      fieldHits.length = 0;
      if (source.fields.fieldsNear(stationProbe, FOOT_HALF + 3, fieldHits).length > 0) return 'station-field';
    }
    // Then the ground over the whole footprint.
    let lowest = Infinity;
    for (let z = STATION_BOX.z0; z <= STATION_BOX.z1 + 1e-6; z += 8) {
      for (let x = STATION_BOX.x0; x <= STATION_BOX.x1 + 1e-6; x += 6) {
        stationPoint(frame, x, z, stationProbe);
        if (world.countryAt(latOf(stationProbe.y), lonOf(stationProbe.x, stationProbe.z)) === 0) return 'station-wet';
        lowest = Math.min(lowest, world.elevationAt(stationProbe));
        if (flattenWeightAt(stationProbe.x, stationProbe.y, stationProbe.z) > 0) return 'station-landmark';
      }
    }
    const floor = stationLevel(world, frame) - PLANET_RADIUS - RAIL_LIFT;
    if (floor - lowest > STATION_EMBANK) return 'station-steep';
    return null;
  }
  function station(frame: StationFrame, key?: string): RailRefusal | null {
    let ground: RailRefusal | null;
    if (key !== undefined && grounds.has(key)) ground = grounds.get(key)!;
    else {
      ground = stationGround(frame);
      if (key !== undefined) grounds.set(key, ground);
    }
    if (ground !== null) return ground;
    for (let z = STATION_BOX.z0; z <= STATION_BOX.z1 + 1e-6; z += 8) {
      if (nearLaid(stationPoint(frame, FOOT_MIDDLE, z, stationProbe), FOOT_HALF + 2)) return 'station-rail';
    }
    return null;
  }
  const ramps = new Map<number, RoadRamp>();
  const rampFor = (r: number): RoadRamp => {
    let ramp = ramps.get(r);
    if (ramp === undefined) ramps.set(r, (ramp = rampOf(roads[r]!, roadGeometry.course(r), places, world, emptyRamp())));
    return ramp;
  };
  const stationA = emptyStation();
  const stationB = emptyStation();
  const geometryOf = (line: RailLine): { course: RoadCourse; path: CoursePath } => {
    const course = railCourse(line, places);
    return { course, path: coursePath(course) };
  };

  function walkLine(line: RailLine): RailVerdict {
    const crossings: Crossing[] = [];
    const refuse = (refusal: RailRefusal, at: number): RailVerdict => ({ refusal, at, crossings });
    stationFor(places[line.a]!, places[line.b]!, line.bearingA, line.sideA, line.outA, stationA);
    stationFor(places[line.b]!, places[line.a]!, line.bearingB, line.sideB, line.outB, stationB);
    const refusedA = station(stationA, `${line.a}:${line.b}:${line.bearingA}:${line.sideA}:${line.outA}`);
    if (refusedA !== null) return refuse(refusedA, 0);
    const refusedB = station(stationB, `${line.b}:${line.a}:${line.bearingB}:${line.sideB}:${line.outB}`);
    if (refusedB !== null) return refuse(refusedB, Infinity);
    const { course, path } = geometryOf(line);
    if (tightestTurn(path) < RAIL_MIN_RADIUS) return refuse('turn', 0);

    // Runs of probes within a road's reach, road by road, to tell a crossing from a stretch alongside.
    interface Run {
      from: number;
      to: number;
      best: number;
      s: number;
      roadS: number;
    }
    const runs = new Map<number, Run>();
    const settle = (r: number, run: Run): RailRefusal | null => {
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
      // Clear of each end's levelling, pavement and ramp, where the carriageway is not the ground's own lift.
      const ramp = rampFor(r);
      const clearA = ramp.levelA + ramp.walkA + rampReach(ramp.riseA) + CROSSING_CLEAR;
      const clearB = ramp.levelB + ramp.walkB + rampReach(ramp.riseB) + CROSSING_CLEAR;
      if (run.roadS < clearA || run.roadS > roadPath.length - clearB) return 'crossing';
      // Nor on a bridge's ramps, where the carriageway stands on its embankment.
      if (road.bridgeTo > road.bridgeFrom && run.roadS > road.bridgeFrom - BRIDGE_LAND - CROSSING_CLEAR && run.roadS < road.bridgeTo + BRIDGE_LAND + CROSSING_CLEAR) return 'crossing';
      if (run.to - run.from > (2 * reach) / Math.sin(angle) + 2 * STEP) return 'alongside';
      crossings.push({ road: r, s: run.s, roadS: run.roadS, angle });
      return null;
    };

    const steps = Math.max(2, Math.ceil(path.length / STEP));
    const live = new Set<number>();
    for (let k = 0; k <= steps; k++) {
      const s = (path.length * k) / steps;
      const t = parameterAt(path, s);
      coursePoint(course, t, probe);
      const lat = latOf(probe.y);
      const lon = lonOf(probe.x, probe.z);
      if (world.countryAt(lat, lon) === 0) return refuse('wet', s);
      if (inTown(probe, TOWN_CLEAR)) return refuse('town', s);
      if (flattenWeightAt(probe.x, probe.y, probe.z) > 0) return refuse('landmark', s);
      // Off the other lines and their stations, but not near its own two
      // stations' platforms, where it is the stations' own test that counts.
      if (s > 20 && s < path.length - 20 && nearLaid(probe, RAIL_CLEARANCE + 2)) return refuse('rail', s);
      if (k % 4 === 0) {
        fieldHits.length = 0;
        if (source.fields.fieldsNear(probe, RAIL_CLEARANCE, fieldHits).length > 0) return refuse('field', s);
        courseTangent(course, t, tangent);
        side.crossVectors(tangent, probe).normalize();
        ahead.crossVectors(side, probe).normalize();
        if (gradeAt(probe, side, ahead, BED_FOOT, slope).grade > MAX_SLOPE) return refuse('steep', s);
      }
      // The roads it is within reach of here.
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
      for (const [r, run] of runs) {
        if (live.has(r)) continue;
        runs.delete(r);
        const refused = settle(r, run);
        if (refused !== null) return refuse(refused, s);
      }
    }
    for (const [r, run] of runs) {
      const refused = settle(r, run);
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
  }

  return {
    station,
    line: walkLine,
    geometry: geometryOf,
    lay(line) {
      const points: { at: Vector3; reach: number }[] = [];
      const { course, path } = geometryOf(line);
      const count = Math.max(1, Math.ceil(path.length / 6));
      for (let k = 0; k <= count; k++) points.push({ at: coursePoint(course, parameterAt(path, (path.length * k) / count), new Vector3()), reach: RAIL_CLEARANCE });
      for (const [place, other, bearing, hand, out] of [[line.a, line.b, line.bearingA, line.sideA, line.outA], [line.b, line.a, line.bearingB, line.sideB, line.outB]] as const) {
        const frame = stationFor(places[place]!, places[other]!, bearing, hand, out, emptyStation());
        for (let z = STATION_BOX.z0; z <= STATION_BOX.z1 + 1e-6; z += 8) points.push({ at: stationPoint(frame, FOOT_MIDDLE, z, new Vector3()), reach: FOOT_HALF });
      }
      return { points };
    },
    accept(laid) {
      for (const point of laid.points) {
        const key = laidKey(latOf(point.at.y), lonOf(point.at.x, point.at.z));
        let list = laidCells.get(key);
        if (list === undefined) laidCells.set(key, (list = []));
        list.push(point);
      }
    },
  };
}
