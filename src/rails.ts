import * as THREE from 'three';
import type { FieldIndex } from './fleet.ts';
import type { World } from './geo.ts';
import { PLANET_RADIUS, UNITS_PER_DEGREE } from './globe.ts';
import { radiusOf } from './places.ts';
import type { Place } from './places.ts';
import { RIBBON_LIFT, coursePath, coursePoint, courseTangent, emptyCourse, joinCourse, parameterAt, placeDirection, townOf, townOffset } from './roads.ts';
import type { CoursePath, RoadCourse } from './roads.ts';
import { offsetDirection } from './scenery/grid.ts';
import { DATA_URL, decodeRails, inflate } from './pack.ts';
import type { RailData } from './pack.ts';
import { latOf, lonOf } from './sphere.ts';
import { SCENERY_SCALE } from './stature.ts';
import { PLACED_SECTION } from './traffic/contract.ts';

/**
 * The railway: which cities are joined by a line, where each line's stations
 * stand, and the shape and the height of the track between them.
 *
 * **Baked, like the roads** (`scripts/build-rails.ts` -> `rails.bin`), and for
 * the roads' reasons: which pairs are joined is a pure function of
 * `places.bin`, `roads.bin` and the outlines, it costs a few hundred thousand
 * ground queries to work out, and the answer is the same on every load. What is
 * baked is the least that decides the shape — the two cities, which way each
 * station stands off its city, which side of the track its platform is on, and
 * the bow — and everything else is worked out here from those, the same way
 * for the bake that tested it, the check that re-walks it, the streamer that
 * lays it and the trains that run on it.
 *
 * **A line runs station to station, and a station stands outside its city.** A
 * town is a square of streets and a railway would have to cut it in two, so a
 * line ends at a terminus `STATION_OUT` past the city's disc, on the side
 * facing the other end as near as one of `STATION_BEARINGS` bearings round
 * the city lets it (`bearingA`, `bearingB`), where that side is free, and runs out of it straight for `STATION_RUN`
 * along its platform before it may bend. The middle is a road's middle —
 * `joinCourse` in `roads.ts`, the Bezier and the `sin^2` bow — so a train runs
 * on the curve a car does, made the one way.
 *
 * **The track rides the ground the way a road does**, `RAIL_LIFT` over it —
 * the road's own `RIBBON_LIFT`, so where a line crosses a road the ballast and
 * the carriageway are one level and the crossing is flush — and never under
 * it: the crown is the ground's lift or a moving average of it, whichever is
 * higher (`crownProfile`), so the track rides over a dip on an embankment and
 * never into a hill. Along its station's platform it is held level at the
 * station's own floor.
 *
 * **Everything that keeps off a plane's field keeps off a railway**, through
 * the same question: `railFields` answers `fieldsNear` with discs strung along
 * every line and over every station, so the wood, the countryside's plans and
 * the herds stand off the ballast without a line of their own. The bake, for
 * its part, keeps every line off the fields, the towns, the landmarks and the
 * water, and lets it cross a road only square enough and far enough from
 * either end (`CROSSING_ANGLE`, `CROSSING_CLEAR`): a level crossing.
 */

const DEG = Math.PI / 180;

/** One line, as `rails.bin` stores it; see `src/pack.ts`. */
export interface RailLine {
  /** Indices into `places`: the two cities. */
  a: number;
  b: number;
  /** Which way each station stands off its city: a compass bearing in the city's own frame, in steps of `STATION_TURN` from north. */
  bearingA: number;
  bearingB: number;
  /** Which side of the track each platform is on, looking out along the line: +1 right, -1 left. */
  sideA: number;
  sideB: number;
  /** How far past its city's disc each terminus stands, in whole units: `STATION_OUT` or more. */
  outA: number;
  outB: number;
  /** The bow, as a share of the chord: `Road.bend`'s meaning, packed the same way. */
  bend: number;
}

/** A metre of railway, in world units: the traffic's scale, so a train is a vehicle among the cars. */
export const RAIL_METRE = SCENERY_SCALE * PLACED_SECTION;

/** The cities that have a station: built, and at least this many people. */
export const RAIL_POP = 150_000;
/** The longest line the bake will lay, in world units. */
export const RAIL_MAX_LENGTH = 2600;
/** How far past its city's disc a terminus stands, at the nearest; the bake may stand one further out (`RailLine.outA`). */
export const STATION_OUT = 36;
/** The straight run out of a terminus, along the platform, before the line may bend. */
export const STATION_RUN = 76;
/** The bearings a station may stand on round its city: every `STATION_TURN`, `STATION_BEARINGS` of them. */
export const STATION_BEARINGS = 24;
export const STATION_TURN = (2 * Math.PI) / STATION_BEARINGS;
/** How high the ballast's crown rides over the ground: the road's, so a crossing is flush. */
export const RAIL_LIFT = RIBBON_LIFT;
/** Standard gauge, between the rails' centres. */
export const GAUGE = 1.435 * RAIL_METRE;
/** Half the ballast's crown, and half its foot, which is `SHOULDER_DROP` under the crown. */
export const BED_HALF = 3.2;
export const BED_FOOT = 6.4;
export const SHOULDER_DROP = RAIL_LIFT + 1.5;
/** What a line keeps clear of on each side of its centre: the wood, a herd, a farm. The keeper adds its own spread. */
export const RAIL_CLEARANCE = 7;
/** The longest a course's handle may reach out of its station's run: a railway turns wide. */
const RAIL_HANDLE = 500;
/** The tightest a line may turn, in world units of radius. */
export const RAIL_MIN_RADIUS = 110;
/** The steepest the crown may climb, rise over run, over `GRADE_RUN`. */
export const RAIL_GRADE = 0.1;
export const GRADE_RUN = 24;
/** How far apart the crown is sampled, and how far either side it is averaged. */
export const CROWN_STEP = 6;
const CROWN_SMOOTH = 6;
/** The ramp from a station's level floor back to the ground's lift. */
const STATION_RAMP = 60;

/**
 * A level crossing: no flatter than this to the road, and this much further
 * from either end of the road than its levelling, its pavement and its ramp
 * reach — where the carriageway is the ground's own lift, as the crown is.
 */
export const CROSSING_ANGLE = 35 * DEG;
export const CROSSING_CLEAR = 30;

/**
 * **A station**, in its own frame — the terminus at the origin, +Z out along
 * the line, +X to the platform's side — sized to the train: a platform
 * `PLATFORM_LENGTH` long a train's half-width and a step off the track, and a
 * building behind it.
 */
export const PLATFORM_FROM = 4;
export const PLATFORM_LENGTH = 60;
export const PLATFORM_INNER = 3.1;
export const PLATFORM_WIDTH = 4.5;
/** The platform's top over the crown: a step up into a carriage. */
export const PLATFORM_RISE = 1.3;
export const HALL_FROM = 18;
export const HALL_LENGTH = 22;
export const HALL_DEPTH = 8;
/** The station's whole footprint, in its frame, for the keepouts and the bake. */
export const STATION_BOX = { x0: -BED_FOOT - 1, x1: PLATFORM_INNER + PLATFORM_WIDTH + 1 + HALL_DEPTH + 2, z0: -8, z1: PLATFORM_FROM + PLATFORM_LENGTH + 4 } as const;

// ---------------------------------------------------------------------------
// Stations
// ---------------------------------------------------------------------------

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
 * A city's station on a line to `other`: the terminus on bearing `bearing`
 * (a step of `STATION_TURN` from north, in the city's own frame) `out` units
 * past the city's disc, its track running out toward the other city, and the
 * platform on `hand`'s side. The bearing only places the terminus round the
 * city; the track always sets off toward where it is going, so two stations
 * a line joins face each other and the curve between them has nothing to
 * undo but the bow.
 */
export function stationFor(place: Place, other: Place, bearing: number, hand: number, out: number, into: StationFrame): StationFrame {
  const town = townOf(place);
  const angle = bearing * STATION_TURN;
  const reach = radiusOf(place) + out;
  offsetDirection(town.up, town.across, town.north, Math.sin(angle) * reach, Math.cos(angle) * reach, into.at);
  // Out along the ground at the terminus toward the other city, and the
  // platform's side square to it: screen right is `forward x up`.
  placeDirection(other, into.out);
  into.out.addScaledVector(into.at, -into.out.dot(into.at)).normalize();
  into.side.crossVectors(into.out, into.at).normalize().multiplyScalar(hand);
  into.hand = hand;
  return into;
}

/** The bearing, in the city's own frame and radians from north, toward another place. */
export function bearingToward(place: Place, other: Place): number {
  townOffset(townOf(place), placeDirection(other, stationProbe), stationOffset);
  return Math.atan2(stationOffset.x, stationOffset.z);
}

export function lineStation(line: RailLine, end: 0 | 1, places: readonly Place[], into: StationFrame): StationFrame {
  return end === 0
    ? stationFor(places[line.a]!, places[line.b]!, line.bearingA, line.sideA, line.outA, into)
    : stationFor(places[line.b]!, places[line.a]!, line.bearingB, line.sideB, line.outB, into);
}

/** A point of a station's frame — `x` toward the platform, `z` out along the line — as a unit direction. */
export function stationPoint(station: StationFrame, x: number, z: number, out: THREE.Vector3): THREE.Vector3 {
  return out
    .copy(station.at)
    .addScaledVector(station.side, x / PLANET_RADIUS)
    .addScaledVector(station.out, z / PLANET_RADIUS)
    .normalize();
}

// ---------------------------------------------------------------------------
// The course
// ---------------------------------------------------------------------------

const stationA = emptyStation();
const stationB = emptyStation();

/**
 * A line's course, terminus to terminus, as a road's: the two stations are the
 * gates, the stubs are `STATION_RUN` out along each platform, and the middle
 * is `joinCourse`'s. So `coursePoint`, `courseTangent`, `coursePath` and
 * `parameterAt` all walk a line as they walk a road.
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

// ---------------------------------------------------------------------------
// The crown
// ---------------------------------------------------------------------------

/**
 * The height of a line's ballast crown along it, over the planet's centre,
 * every `CROWN_STEP` units from terminus A: the ground plus `RAIL_LIFT`, or its
 * moving average over `CROWN_SMOOTH` samples either side where that is
 * higher — a train rides over a dip rather than down into it — and along each
 * platform the station's own level, which is the highest the ground's lift
 * reaches under the station's footprint, ramped back to the ground over
 * `STATION_RAMP`.
 */
export interface CrownProfile {
  /** Radius of the crown at `s = k * CROWN_STEP`. */
  radius: Float64Array;
  /** Each station's floor, as a radius: where the platforms and halls stand. */
  levelA: number;
  levelB: number;
  length: number;
}

const crownPoint = new THREE.Vector3();

/** The radius a station stands at: the ground's lift at its highest under the station's footprint. */
export function stationLevel(world: World, station: StationFrame): number {
  let top = -Infinity;
  for (let z = STATION_BOX.z0; z <= STATION_BOX.z1 + 1e-6; z += (STATION_BOX.z1 - STATION_BOX.z0) / 6) {
    for (let x = STATION_BOX.x0; x <= STATION_BOX.x1 + 1e-6; x += (STATION_BOX.x1 - STATION_BOX.x0) / 4) {
      top = Math.max(top, world.elevationAt(stationPoint(station, x, z, crownPoint)));
    }
  }
  return PLANET_RADIUS + top + RAIL_LIFT;
}

export function crownProfile(line: RailLine, places: readonly Place[], world: World, course: RoadCourse, path: CoursePath): CrownProfile {
  const count = Math.max(2, Math.ceil(path.length / CROWN_STEP) + 1);
  const ground = new Float64Array(count);
  for (let k = 0; k < count; k++) {
    coursePoint(course, parameterAt(path, Math.min(path.length, k * CROWN_STEP)), crownPoint);
    ground[k] = PLANET_RADIUS + world.elevationAt(crownPoint) + RAIL_LIFT;
  }
  const radius = new Float64Array(count);
  for (let k = 0; k < count; k++) {
    let sum = 0;
    let n = 0;
    for (let j = Math.max(0, k - CROWN_SMOOTH); j <= Math.min(count - 1, k + CROWN_SMOOTH); j++) {
      sum += ground[j]!;
      n++;
    }
    radius[k] = Math.max(ground[k]!, sum / n);
  }
  const levelA = stationLevel(world, lineStation(line, 0, places, stationA));
  const levelB = stationLevel(world, lineStation(line, 1, places, stationB));
  for (let k = 0; k < count; k++) {
    const s = Math.min(path.length, k * CROWN_STEP);
    for (const [level, from] of [[levelA, s], [levelB, path.length - s]] as const) {
      if (from > STATION_RUN + STATION_RAMP) continue;
      const hold = from <= STATION_RUN ? 1 : 1 - smoothstep((from - STATION_RUN) / STATION_RAMP);
      radius[k] = Math.max(radius[k]!, radius[k]! + (level - radius[k]!) * hold);
    }
  }
  return { radius, levelA, levelB, length: path.length };
}

const smoothstep = (t: number): number => {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
};

/** The crown's radius at `s` units from terminus A. */
export function crownAt(profile: CrownProfile, s: number): number {
  const u = Math.min(profile.radius.length - 1, Math.max(0, s / CROWN_STEP));
  const k = Math.min(profile.radius.length - 2, Math.floor(u));
  const f = u - k;
  return profile.radius[k]! * (1 - f) + profile.radius[k + 1]! * f;
}

/** The steepest the crown climbs anywhere, rise over run, over `GRADE_RUN`. */
export function steepestGrade(profile: CrownProfile): number {
  const span = Math.max(1, Math.round(GRADE_RUN / CROWN_STEP));
  let worst = 0;
  for (let k = 0; k + span < profile.radius.length; k++) {
    worst = Math.max(worst, Math.abs(profile.radius[k + span]! - profile.radius[k]!) / (span * CROWN_STEP));
  }
  return worst;
}

// ---------------------------------------------------------------------------
// The network: its geometry cached, and a grid to ask it what is near
// ---------------------------------------------------------------------------

export interface RailNetwork {
  readonly lines: readonly RailLine[];
  readonly places: readonly Place[];
  course(line: number): RoadCourse;
  path(line: number): CoursePath;
  crown(line: number): CrownProfile;
  /** Every line whose track could come within `radius` of `direction`, into `out`, which is cleared. */
  near(direction: THREE.Vector3, radius: number, out: number[]): number[];
  /** Where a line is nearest a point: the line, `s` along it, and how far off its centre, or null past `radius`. */
  nearest(direction: THREE.Vector3, radius: number, out: RailHit): RailHit | null;
}

export interface RailHit {
  line: number;
  s: number;
  /** Units off the centre line, along the ground. */
  off: number;
}

const INDEX_CELL = 4;

export function createRailNetwork(lines: readonly RailLine[], places: readonly Place[], world: World): RailNetwork {
  const courses: (RoadCourse | undefined)[] = new Array(lines.length);
  const paths: (CoursePath | undefined)[] = new Array(lines.length);
  const crowns: (CrownProfile | undefined)[] = new Array(lines.length);
  const COLS = Math.round(360 / INDEX_CELL);
  const ROWS = Math.round(180 / INDEX_CELL);
  const grid: number[][] = Array.from({ length: COLS * ROWS }, () => []);
  const middle = new Float64Array(lines.length * 3);
  const half = new Float64Array(lines.length);
  let widest = 0;
  const mid = new THREE.Vector3();
  const at = new THREE.Vector3();

  const network: RailNetwork = {
    lines,
    places,
    course(i) {
      return (courses[i] ??= railCourse(lines[i]!, places));
    },
    path(i) {
      return (paths[i] ??= coursePath(network.course(i)));
    },
    crown(i) {
      return (crowns[i] ??= crownProfile(lines[i]!, places, world, network.course(i), network.path(i)));
    },
    near(direction, radius, out) {
      out.length = 0;
      const lat = latOf(direction.y);
      const lon = lonOf(direction.x, direction.z);
      const span = (radius + widest * PLANET_RADIUS) / UNITS_PER_DEGREE;
      const rowSpan = Math.ceil(span / INDEX_CELL);
      const colSpan = Math.min(COLS >> 1, Math.ceil(span / Math.max(0.02, Math.cos(lat * DEG)) / INDEX_CELL));
      const row = Math.floor((90 - lat) / INDEX_CELL);
      const col = Math.floor((lon + 180) / INDEX_CELL);
      const angle = radius / PLANET_RADIUS;
      for (let r = Math.max(0, row - rowSpan); r <= Math.min(ROWS - 1, row + rowSpan); r++) {
        for (let c = col - colSpan; c <= col + colSpan; c++) {
          if (colSpan * 2 + 1 >= COLS && c > col - colSpan + COLS - 1) break;
          for (const i of grid[r * COLS + (((c % COLS) + COLS) % COLS)]!) {
            const dot = direction.x * middle[i * 3]! + direction.y * middle[i * 3 + 1]! + direction.z * middle[i * 3 + 2]!;
            if (Math.acos(Math.min(1, Math.max(-1, dot))) - half[i]! <= angle) out.push(i);
          }
        }
      }
      return out;
    },
    nearest(direction, radius, out) {
      let best: RailHit | null = null;
      for (const i of network.near(direction, radius, nearList)) {
        const path = network.path(i);
        const hit = nearestOnPath(path, direction);
        if (hit.off <= radius && (best === null || hit.off < best.off)) {
          out.line = i;
          out.s = hit.s;
          out.off = hit.off;
          best = out;
        }
      }
      return best;
    },
  };
  const nearList: number[] = [];

  lines.forEach((line, i) => {
    const course = railCourse(line, places);
    coursePoint(course, 0.5, mid);
    middle[i * 3] = mid.x;
    middle[i * 3 + 1] = mid.y;
    middle[i * 3 + 2] = mid.z;
    let reach = 0;
    for (let k = 0; k <= 8; k++) reach = Math.max(reach, mid.angleTo(coursePoint(course, k / 8, at)));
    // The bow and the stations stand off the chord a little further than eight samples see.
    reach += (course.length / 16 + STATION_BOX.x1 + STATION_BOX.z1) / PLANET_RADIUS;
    half[i] = reach;
    widest = Math.max(widest, reach);
    const lat = latOf(mid.y);
    const lon = lonOf(mid.x, mid.z);
    const row = Math.min(ROWS - 1, Math.max(0, Math.floor((90 - lat) / INDEX_CELL)));
    const col = ((Math.floor((lon + 180) / INDEX_CELL) % COLS) + COLS) % COLS;
    grid[row * COLS + col]!.push(i);
  });
  return network;
}

const pathHere = new THREE.Vector3();
const pathLast = new THREE.Vector3();
const pathLeg = new THREE.Vector3();
const pathFoot = new THREE.Vector3();
const pathHit = { s: 0, off: Infinity };

/** The nearest point of a path to a direction: `s` along it and how far off, in units, on the sphere's surface. */
export function nearestOnPath(path: CoursePath, direction: THREE.Vector3): { s: number; off: number } {
  pathHit.off = Infinity;
  pathHit.s = 0;
  const xyz = path.xyz;
  for (let k = 0; k < path.count; k++) {
    pathHere.set(xyz[k * 3]!, xyz[k * 3 + 1]!, xyz[k * 3 + 2]!);
    if (k > 0) {
      pathLeg.subVectors(pathHere, pathLast);
      const lengthSq = pathLeg.lengthSq();
      let t = lengthSq > 1e-18 ? pathFoot.subVectors(direction, pathLast).dot(pathLeg) / lengthSq : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      pathFoot.copy(pathLast).addScaledVector(pathLeg, t);
      const off = pathFoot.distanceTo(direction) * PLANET_RADIUS;
      if (off < pathHit.off) {
        pathHit.off = off;
        pathHit.s = path.s[k - 1]! + (path.s[k]! - path.s[k - 1]!) * t;
      }
    }
    pathLast.copy(pathHere);
  }
  return pathHit;
}

/** The point and the tangent at `s` units along a line, from terminus A. */
export function railPointAt(network: RailNetwork, line: number, s: number, point: THREE.Vector3, tangent?: THREE.Vector3): THREE.Vector3 {
  const course = network.course(line);
  const t = parameterAt(network.path(line), s);
  coursePoint(course, t, point);
  if (tangent !== undefined) courseTangent(course, t, tangent);
  return point;
}

// ---------------------------------------------------------------------------
// What keeps off it
// ---------------------------------------------------------------------------

/** How far apart the keepout discs are strung along a line, and how wide each is. */
const DISC_STEP = 6;
const DISC_RADIUS = Math.hypot(RAIL_CLEARANCE, DISC_STEP / 2);
/** And over a station: discs down its middle, wide enough for the whole footprint. */
const STATION_DISC_STEP = 10;

/**
 * The railway as a `FieldIndex`: every line's track as discs `DISC_STEP`
 * apart whose union is `RAIL_CLEARANCE` wide each side, and every station as
 * a row of discs over its footprint. What `vegetation.ts`, `countryside.ts`
 * and the herds in `life.ts` already ask of a plane's field — each bringing its
 * own spread — so they keep off the ballast by the same test.
 */
export function railFields(network: RailNetwork): Pick<FieldIndex, 'fieldsNear'> {
  const hits: number[] = [];
  const point = new THREE.Vector3();
  const station = emptyStation();
  /** Each line's discs, strung once and kept. */
  const strung = new Map<number, { at: THREE.Vector3; radius: number }[]>();
  const stationWidth = (STATION_BOX.x1 - STATION_BOX.x0) / 2;
  const stationMiddle = (STATION_BOX.x1 + STATION_BOX.x0) / 2;
  const stationRadius = Math.hypot(stationWidth, STATION_DISC_STEP / 2);
  const discsOf = (i: number): { at: THREE.Vector3; radius: number }[] => {
    let discs = strung.get(i);
    if (discs !== undefined) return discs;
    discs = [];
    const path = network.path(i);
    const count = Math.max(1, Math.ceil(path.length / DISC_STEP));
    for (let k = 0; k <= count; k++) {
      railPointAt(network, i, (path.length * k) / count, point);
      discs.push({ at: point.clone(), radius: DISC_RADIUS });
    }
    for (const end of [0, 1] as const) {
      lineStation(network.lines[i]!, end, network.places, station);
      for (let z = STATION_BOX.z0; z <= STATION_BOX.z1 + 1e-6; z += STATION_DISC_STEP) {
        discs.push({ at: stationPoint(station, stationMiddle, z, new THREE.Vector3()), radius: stationRadius });
      }
    }
    if (strung.size > 256) strung.delete(strung.keys().next().value!);
    strung.set(i, discs);
    return discs;
  };
  return {
    fieldsNear(direction, radius, out) {
      for (const i of network.near(direction, radius + stationRadius, hits)) {
        for (const disc of discsOf(i)) {
          if (disc.at.angleTo(direction) * PLANET_RADIUS < radius + disc.radius) out.push(disc);
        }
      }
      return out;
    },
  };
}

/**
 * The fleet's fields and the railway's as one `FieldIndex`, for the files
 * that ask what ground is taken: `fieldsNear` answers both, `planesNear` is
 * the fleet's alone.
 */
export function joinFields(fleet: FieldIndex, rails: Pick<FieldIndex, 'fieldsNear'> | null): FieldIndex {
  if (rails === null) return fleet;
  return {
    fieldsNear(direction, radius, out) {
      fleet.fieldsNear(direction, radius, out);
      return rails.fieldsNear(direction, radius, out);
    },
    planesNear: (direction, radius, out) => fleet.planesNear(direction, radius, out),
  };
}

// ---------------------------------------------------------------------------
// The trains: a timetable, as a pure function of the clock
// ---------------------------------------------------------------------------

/**
 * **One train a line, shuttling.** A line is single track, so it carries one
 * train: it waits `DWELL` seconds at a platform, runs to the other end —
 * accelerating at `TRAIN_ACCELERATION` to `TRAIN_SPEED` and braking the same
 * into the far platform — waits, and comes back. Where it is is a function of
 * the sky's clock and the line's own phase, like every other mover: every
 * client sees the same train at the same platform, and one that leaves range
 * and comes back is where it should be.
 *
 * `TRAIN_SPEED` is 42 units a second, 25 m/s at the traffic's scale: a
 * regional train's 90 km/h, and twice a car's cruise on the road beside it.
 */
export const TRAIN_SPEED = 42;
export const TRAIN_ACCELERATION = 3;
export const DWELL = 24;
/** A car's pitch along the train, coupler to coupler, and the gap between two bodies. */
export const CAR_PITCH = 14.5;
export const CAR_GAP = 0.9;
/** A car's width over its body, and its height over the rail: the traffic's section. */
export const CAR_WIDTH = 3 * RAIL_METRE;
/** Where the train's nose stops short of the buffer stop. */
export const STOP_SHORT = PLATFORM_FROM + 1;
/** The rail head over the crown, where the wheels stand. */
export const RAIL_TOP = 0.55;

/**
 * The trains a line may run, by the kit's model ids: the ends are the cab
 * cars, drawn nose outward at both ends so a train that reverses at a
 * terminus has a cab leading either way, and the middles are what is between.
 */
export const CONSISTS = {
  highSpeed: { ends: 'bullet-front', middle: ['bullet-car'] },
  electric: { ends: 'city-front', middle: ['city-car'] },
  regional: { ends: 'diesel', middle: ['coach', 'coach-b'] },
  heritage: { ends: 'steam', middle: ['coach-b'] },
  freight: { ends: 'diesel-hood', middle: ['wagon-box', 'wagon-container-red', 'wagon-container-blue', 'wagon-container-green', 'wagon-tank', 'wagon-lumber', 'wagon-coal'] },
} as const;
export type ConsistKind = keyof typeof CONSISTS;

/** A small integer hash, for the choices a line makes once. */
function lineHash(a: number, b: number, salt: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(salt | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Which train a line runs and its cars, front to back, by kit id: pure in the line. */
export function consistOf(line: RailLine, places: readonly Place[], length: number): { kind: ConsistKind; cars: string[] } {
  const big = Math.min(places[line.a]!.pop, places[line.b]!.pop);
  const roll = lineHash(line.a, line.b, 1);
  const kind: ConsistKind =
    big >= 500_000 && length > 400 && roll < 0.5 ? 'highSpeed'
      : roll < 0.12 ? 'heritage'
        : roll < 0.4 ? 'freight'
          : big >= 400_000 && roll < 0.7 ? 'electric'
            : 'regional';
  const consist = CONSISTS[kind];
  const count = kind === 'freight' ? 6 : kind === 'heritage' ? 3 : 4;
  const cars: string[] = [consist.ends];
  for (let k = 1; k < count - 1; k++) cars.push(consist.middle[Math.floor(lineHash(line.a, line.b, 10 + k) * consist.middle.length)]!);
  cars.push(consist.ends);
  return { kind, cars };
}

/** Where a line's train is: its head's distance from terminus A, which way it runs, and how fast. */
export interface TrainState {
  /** The leading end's `s`, in units from terminus A. */
  head: number;
  /** +1 running toward B, -1 toward A. */
  direction: 1 | -1;
  /** Units a second, never negative. */
  speed: number;
  /** Standing at a platform. */
  standing: boolean;
}

/**
 * The train of a line of `length` units, `cars` long, at `seconds` of the
 * sky's clock: `phase` spreads the lines' timetables apart.
 */
export function trainAt(length: number, cars: number, phase: number, seconds: number, out: TrainState): TrainState {
  const trainLength = cars * CAR_PITCH;
  const run = Math.max(0, length - 2 * STOP_SHORT - trainLength);
  // The run's time, braking as hard as it accelerates: a short line never reaches full speed.
  const reach = (TRAIN_SPEED * TRAIN_SPEED) / TRAIN_ACCELERATION;
  const peak = run >= reach ? TRAIN_SPEED : Math.sqrt(run * TRAIN_ACCELERATION);
  const ramp = peak / TRAIN_ACCELERATION;
  const cruise = run >= reach ? (run - reach) / TRAIN_SPEED : 0;
  const travel = 2 * ramp + cruise;
  const period = 2 * (DWELL + travel);
  let t = (seconds + phase * period) % period;
  if (t < 0) t += period;
  const leg = t < DWELL + travel ? 0 : 1;
  const within = leg === 0 ? t : t - DWELL - travel;
  let u = 0;
  let speed = 0;
  if (within >= DWELL) {
    const m = within - DWELL;
    if (m < ramp) {
      u = 0.5 * TRAIN_ACCELERATION * m * m;
      speed = TRAIN_ACCELERATION * m;
    } else if (m < ramp + cruise) {
      u = 0.5 * TRAIN_ACCELERATION * ramp * ramp + peak * (m - ramp);
      speed = peak;
    } else {
      const left = Math.max(0, travel - m);
      u = run - 0.5 * TRAIN_ACCELERATION * left * left;
      speed = TRAIN_ACCELERATION * left;
    }
  }
  if (leg === 0) {
    out.direction = 1;
    out.head = STOP_SHORT + trainLength + u;
  } else {
    out.direction = -1;
    out.head = length - STOP_SHORT - trainLength - u;
  }
  out.speed = speed;
  out.standing = within < DWELL;
  return out;
}

/** A line's timetable phase, 0 to 1: pure in the line. */
export const phaseOf = (line: RailLine): number => lineHash(line.a, line.b, 2);

/** Fetches and decodes `rails.bin`. */
export async function loadRails(url = `${DATA_URL}rails.bin`): Promise<RailData> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url}: ${response.status}`);
  return decodeRails(await inflate(await response.arrayBuffer()));
}
