/**
 * Whether a railway line can be laid: the walk `build-rails.ts` makes to
 * choose a line and `check-rails.ts` repeats over the shipped file.
 *
 * Every test is on what will be drawn, cheapest first:
 * - the stations stand on dry, level ground off every town, road, landmark,
 *   field and other line;
 * - the curve turns no tighter than `RAIL_MIN_RADIUS`;
 * - every `STEP` units the line is dry, `TOWN_CLEAR` out of every built town,
 *   off every landmark, field and other line, no steeper across than
 *   `MAX_SLOPE`, and crosses roads only at level crossings (square enough,
 *   clear of either end's ramp, never alongside);
 * - the crown climbs no steeper than `RAIL_GRADE` and is flush at every crossing.
 */
import { Vector3 } from 'three';
import { ROAD_CLASSES, roadClearance } from '../src/roads/classes.ts';
import { coursePoint } from '../src/roads/course.ts';
import type { RoadCourse } from '../src/roads/course.ts';
import { emptyRamp } from '../src/roads/crown.ts';
import type { RoadRamp } from '../src/roads/crown.ts';
import { rampOf } from '../src/roads/gates.ts';
import { coursePath, parameterAt, roadGeometryFor } from '../src/roads/path.ts';
import type { CoursePath } from '../src/roads/path.ts';
import { roadIndexFor } from '../src/roads/spatial-index.ts';
import { RAIL_CLEARANCE, STATION_BOX } from '../src/rails/line.ts';
import type { RailLine } from '../src/rails/line.ts';
import { nearestOnPath } from '../src/rails/network.ts';
import { emptyStation, railCourse, stationFor, stationPoint } from '../src/rails/stations.ts';
import { createLaidGrid, createTownGrid } from './rail-trial/grids.ts';
import { createStationTest } from './rail-trial/station.ts';
import { FOOT_HALF, FOOT_MIDDLE } from './rail-trial/types.ts';
import type { RailSource, RailTrial } from './rail-trial/types.ts';
import { createLineWalk } from './rail-trial/walk.ts';

export { LINE_GAP, STATION_EMBANK, STEP, TOWN_CLEAR } from './rail-trial/types.ts';
export type { Crossing, Laid, RailRefusal, RailSource, RailTrial, RailVerdict } from './rail-trial/types.ts';

export function createRailTrial(source: RailSource): RailTrial {
  const { world, places, roads } = source;
  const roadIndex = roadIndexFor(roads, places);
  const roadGeometry = roadGeometryFor(roads, places);
  const widestRoad = roadClearance(ROAD_CLASSES.length - 1);
  const inTown = createTownGrid(places);
  const laid = createLaidGrid();
  const roadHits: number[] = [];

  /** The nearest road's edge to a point, in units past its drawn half-width, or Infinity past `reach`. */
  function roadGapAt(point: Vector3, reach: number): number {
    let best = Infinity;
    for (const r of roadIndex.near(point, reach + widestRoad, roadHits)) {
      const hit = nearestOnPath(roadGeometry.path(r), point);
      best = Math.min(best, hit.off - roadClearance(roads[r]!.cls));
    }
    return best;
  }

  const station = createStationTest({ world, fields: source.fields, inTown, roadGapAt, laid });
  const ramps = new Map<number, RoadRamp>();
  const rampFor = (r: number): RoadRamp => {
    let ramp = ramps.get(r);
    if (ramp === undefined) ramps.set(r, (ramp = rampOf(roads[r]!, roadGeometry.course(r), places, world, emptyRamp())));
    return ramp;
  };
  const geometryOf = (line: RailLine): { course: RoadCourse; path: CoursePath } => {
    const course = railCourse(line, places);
    return { course, path: coursePath(course) };
  };
  const walkLine = createLineWalk({
    world, places, roads, roadIndex, roadGeometry, widestRoad, fields: source.fields, inTown, laid, station, rampFor, geometryOf,
  });

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
    accept(laidLine) {
      for (const point of laidLine.points) laid.add(point);
    },
  };
}
