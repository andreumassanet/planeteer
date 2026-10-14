import type { Vector3 } from 'three';
import type { World } from '../../src/geo.ts';
import type { Place } from '../../src/places.ts';
import type { Road } from '../../src/roads/types.ts';
import type { RoadCourse } from '../../src/roads/course.ts';
import type { CoursePath } from '../../src/roads/path.ts';
import type { FieldIndex } from '../../src/fleet.ts';
import { RAIL_CLEARANCE, STATION_BOX } from '../../src/rails/line.ts';
import type { RailLine } from '../../src/rails/line.ts';
import type { StationFrame } from '../../src/rails/stations.ts';

/** The walk's stride along a line, in units. */
export const STEP = 3;
/** What a line keeps clear of a town's disc. */
export const TOWN_CLEAR = 14;
/** The most a station's floor may stand over the lowest ground under it. */
export const STATION_EMBANK = 9;
/** How near two lines, or a line and another's station, may come, centre to centre. */
export const LINE_GAP = RAIL_CLEARANCE * 2 + 2;
/** The station's footprint about its middle line, across the track. */
export const FOOT_MIDDLE = (STATION_BOX.x0 + STATION_BOX.x1) / 2;
export const FOOT_HALF = (STATION_BOX.x1 - STATION_BOX.x0) / 2;

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

/** What a laid line leaves on the ground for the next to keep off. */
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
