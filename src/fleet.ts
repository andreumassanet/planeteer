/**
 * The vehicles you can take: where each one stands until somebody moves it,
 * which of them are built, and how you get in and out.
 *
 * **Where they stand is a pure function of the world.** Cars wait on the road
 * a few lengths out of a town's gates, launches lie off the shore nearest a
 * coastal town, light aircraft stand in a flat field beside the big cities and
 * the capitals, and a few towns have a balloon. Every one of those is decided
 * from `places.bin`, `roads.bin`, the outlines and the relief, seeded by the
 * place's index and never by `Math.random`, so every client puts the same car
 * on the same kerb without a word on the wire — and a vehicle's id,
 * `<model>:<placeIndex>:<n>`, names the same machine everywhere.
 *
 * **What has moved is the link's.** A `FleetLink` (`craft/contract.ts`) says
 * which vehicles are somewhere other than their site and who sits in them. With
 * no relay it is `createLocalLink` below, which remembers what you moved in
 * `localStorage` for a day; with one, it is the relay's, and this file cannot
 * tell the difference.
 *
 * **What is built is the near and the seen.** A site costs a few numbers until
 * the player is within `REACH` of it; then its model is built as one group of
 * its own — a vehicle is a thing that moves, and a merged mesh cannot
 * (`merge.ts`) — capped at `MAX_BUILT`, inside the frame's shared build
 * allowance (`view.ts`), and put back in a pool when the player leaves.
 *
 * **The sites are worked out a town at a time, on first need.** The whole
 * planet's are about nineteen thousand vehicles and the launches' search for
 * open water is most of their cost, so the world pays for the towns near the
 * player and `SiteIndex.all()` is there for the check and the console.
 */
import * as THREE from 'three';
import type { World } from './geo.ts';
import { PLANET_RADIUS, UNITS_PER_DEGREE, groundRadius } from './globe.ts';
import { isShown, radiusOf } from './places.ts';
import type { Place } from './places.ts';
import {
  ROAD_CLASSES,
  courseOf,
  coursePath,
  coursePoint,
  courseTangent,
  emptyCourse,
  parameterAt,
  roadClearance,
  roadIndexFor,
  townOf,
  townOffset,
} from './roads.ts';
import type { CoursePath, Road, RoadIndex } from './roads.ts';
import { gradeAt, shoreDistance } from './terrain.ts';
import type { Slope } from './terrain.ts';
import { rngFrom } from './scenery/random.ts';
import { keepsLeft } from './traffic/regions.ts';
import { latOf, lonOf, unitAt } from './sphere.ts';
import { AVATAR_HEIGHT } from './stature.ts';
import { MAX_FOOTPRINT } from './monuments/contract.ts';
import { NEAR_BUILD, createViewCone, mayBuild } from './view.ts';
import { WATERLINE, isWater } from './vehicles.ts';
import type { CraftKind, CraftModel, FleetLink, FleetSeats, MovedVehicle, WirePose } from './craft/contract.ts';
import { writePose } from './player.ts';
import type { Player } from './player.ts';
import type { ParkedCar } from './settlements.ts';

export { writePose };

const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------
// Which model stands where
// ---------------------------------------------------------------------------

/** The model ids the sites name; `craft/index.ts` builds them. */
export const FLEET_MODELS = {
  car: 'hatchback',
  van: 'van',
  boat: 'launch',
  plane: 'light-plane',
  balloon: 'balloon',
} as const satisfies Record<CraftKind, string>;

const KIND_OF: Readonly<Record<string, CraftKind>> = Object.fromEntries(
  (Object.entries(FLEET_MODELS) as [CraftKind, string][]).map(([kind, id]) => [id, kind]),
);

/** The kind of a model id, or null for one no site ever names. */
export const kindOfModel = (model: string): CraftKind | null => KIND_OF[model] ?? null;
/** The model a vehicle id names: the part before the first colon. */
export const modelOfVehicle = (vehicle: string): string => vehicle.slice(0, Math.max(0, vehicle.indexOf(':')));

/**
 * How far out of its gate a car waits, in units along the road: two car
 * lengths, inside the straight approach every road leaves a gate by
 * (`APPROACH`, 18), so it stands square to the kerb it has just left.
 */
const CAR_OUT = 13;
/** And the least a short approach may leave it; nearer the kerb it is not parked, it is in the gate. */
const CAR_MIN_OUT = 6;
/** Half a car's length, for keeping its bumpers out of a town's square: the hatchback is 8.8 long. */
const CAR_HALF = 4.5;
/** Two parked cars nearer than this are one too many: the later is not placed. */
const CAR_SPACING = 9;
/** How many cars a village, a town and a city keep at their gates. */
const carsFor = (radius: number): number => (radius < 13 ? 1 : radius < 30 ? 2 : 3);
/** The share of parked cars that are vans. */
const VAN_SHARE = 0.25;

/**
 * Open water a launch needs round it, in units: its own half-length (a launch
 * is about ten long) and a hull's width of sea beyond that, so it is not drawn
 * through a headland and a swimmer can reach it from the beach.
 */
const BOAT_ROOM = 12;
/** How far past its own square a town looks for water to moor in, in units. */
const BOAT_SEARCH = 170;
/** The step of that search, outward from the square. */
const BOAT_STEP = 6;
/** Bearings tried at each step. */
const BOAT_BEARINGS = 16;
/** Coastal cities over this many people have a seeded chance of a second launch. */
const BOAT_SECOND_POP = 1_000_000;
const BOAT_SECOND_SHARE = 0.5;
/** And two launches of one town nearer than this are one. */
const BOAT_SPACING = 30;

/** Towns this big, and every capital, keep a light aircraft. */
const PLANE_POP = 400_000;
/**
 * The field a plane stands in: a disc this wide (it spans about fifteen units)
 * of land no steeper than `PLANE_GRADE`, clear of every town, road and
 * landmark by `FIELD_CLEAR` beyond it.
 */
const PLANE_FIELD = 10;
const PLANE_GRADE = Math.tan(8 * DEG);
/** And a balloon's: its envelope is 14.6 across, and it comes down wherever the basket touches. */
const BALLOON_FIELD = 8;
const BALLOON_GRADE = Math.tan(14 * DEG);
/** The share of built towns that keep a balloon. */
const BALLOON_SHARE = 0.04;
/** Margin between a field and whatever it keeps clear of, in units. */
const FIELD_CLEAR = 6;
/** Rings and bearings a field is searched on, outward from the town. */
const FIELD_RINGS = 6;
const FIELD_STEP = 28;
const FIELD_BEARINGS = 12;

/**
 * The room each kind's site keeps, in units: half a car's length out of a
 * town's square, a launch's ring of open water, a plane's and a balloon's
 * field. **They are numbers here and not `model.size`**, because the sites are
 * a function of the world alone — a client whose kit failed to load, the
 * check, and the relay all have to agree on them — so `pnpm fleet` holds each
 * against the built model instead: a model that outgrows its room fails there.
 */
export const SITE_ROOM: Readonly<Record<'car' | 'boat' | 'plane' | 'balloon', number>> = {
  car: CAR_HALF,
  boat: BOAT_ROOM,
  plane: PLANE_FIELD,
  balloon: BALLOON_FIELD,
};

/** One vehicle's default place in the world. */
export interface FleetSite {
  /** `<model>:<placeIndex>:<n>`, the same on every client. */
  id: string;
  model: string;
  kind: CraftKind;
  /** Index into `places`. */
  place: number;
  /** Where the model's origin is, as a unit direction. */
  at: THREE.Vector3;
  /** The way it faces, a unit tangent at `at`. */
  forward: THREE.Vector3;
  /** The road a car is parked on; -1 for anything else. */
  road: number;
}

/** What the sites are a function of. */
export interface FleetSource {
  world: World;
  places: readonly Place[];
  roads: readonly Road[];
  /** The landmarks, which a field keeps clear of by their footprint. */
  monuments?: readonly { lat: number; lon: number; footprint?: number }[];
}

/**
 * Ground a standing plane or balloon keeps to itself: the centre of its field
 * and the field's radius, `SITE_ROOM` for its kind. A wood and a herd keep off
 * it (`vegetation.ts`, `life.ts`), each bringing its own spread, the way they
 * keep off a road.
 */
export interface FieldKeepout {
  at: THREE.Vector3;
  radius: number;
}

/** The fields alone, which is all the wood and the herds ask of the fleet. */
export interface FieldIndex {
  /**
   * Every plane's and balloon's field within `radius` units of `direction`,
   * appended to `out`. **Pure and complete**: the towns it needs are worked
   * out on the spot and kept, with no cap and nothing streamed, so a tile of
   * wood built in Node and one built in the browser, first or last, keep off
   * the same ground. Only a big city or a balloon town has a field to search
   * for, so a tile pays for a handful of searches the first time and a lookup
   * after that.
   */
  fieldsNear(direction: THREE.Vector3, radius: number, out: FieldKeepout[]): FieldKeepout[];
}

export interface SiteIndex extends FieldIndex {
  /** One town's vehicles, worked out on the first ask and kept. */
  sitesOf(place: number): readonly FleetSite[];
  /**
   * Every site whose town is within `radius` units plus the widest spread of a
   * site, appended to `out`. `fresh` caps how many towns not yet worked out
   * this call may work out — the rest are left for the next call — so arriving
   * somewhere new costs a few milliseconds a scan rather than one long frame.
   */
  near(direction: THREE.Vector3, radius: number, out: FleetSite[], fresh?: number): FleetSite[];
  /** Every site on the planet, in place order. Seconds, not milliseconds: for the check and the console. */
  all(): FleetSite[];
  /** A site by its id, or null if no town places one by that name. */
  byId(id: string): FleetSite | null;
  /** How many sites of each kind have been worked out so far, and in how many towns. */
  readonly counts: Readonly<Record<CraftKind, number>> & { towns: number };
}

/** The furthest a site stands from its town's centre: the biggest square, and the widest search past it. */
const SITE_SPREAD = 150 + Math.max(BOAT_SEARCH, FIELD_CLEAR + FIELD_RINGS * FIELD_STEP + 40);
/** And the furthest a field's edge reaches from it: the last ring `fieldSite` tries, and the field on it. */
const FIELD_SPREAD = 150 + 2 * Math.max(PLANE_FIELD, BALLOON_FIELD) + FIELD_CLEAR + 4 + (FIELD_RINGS - 1) * FIELD_STEP;
/** Degrees in one cell of the town index. */
const CELL = 2;
const COLS = 360 / CELL;
const ROWS = 180 / CELL;

export function createSiteIndex(source: FleetSource): SiteIndex {
  const { world, places, roads } = source;
  const monuments = (source.monuments ?? []).map((m) => ({
    at: unitAt(m.lat, m.lon, new THREE.Vector3()),
    reach: (m.footprint ?? MAX_FOOTPRINT) + FIELD_CLEAR,
  }));
  const roadIndex: RoadIndex = roadIndexFor(roads, places);

  // The built towns, bucketed. Hidden places stand for nothing — no square,
  // no gates — so they neither keep a vehicle nor keep one away.
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
  const corner = new THREE.Vector3();
  const across = new THREE.Vector3();
  const north = new THREE.Vector3();
  const offset = { x: 0, z: 0 };
  const slope: Slope = { grade: 0, across: 0, north: 0, lowest: 0, highest: 0 };
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
    for (const q of townsNear(direction, 150 + margin + 10, townList)) {
      const town = townOf(places[q]!);
      if (direction.dot(town.up) <= 0) continue;
      townOffset(town, direction, offset);
      const half = town.grid.half + margin;
      if (Math.abs(offset.x) < half && Math.abs(offset.z) < half) return true;
    }
    return false;
  }

  /** Within `clear` units of any built town's disc. */
  function nearTown(direction: THREE.Vector3, clear: number): boolean {
    for (const q of townsNear(direction, 150 + clear, townList)) {
      if (centres[q]!.angleTo(direction) * PLANET_RADIUS < radiusOf(places[q]!) + clear) return true;
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

  function nearMonument(direction: THREE.Vector3, clear: number): boolean {
    for (const m of monuments) if (m.at.angleTo(direction) * PLANET_RADIUS < m.reach + clear) return true;
    return false;
  }

  /** The point `distance` units from a town's centre on a bearing, in its own frame. */
  function around(place: number, bearing: number, distance: number, out: THREE.Vector3): THREE.Vector3 {
    const up = centres[place]!;
    north.set(0, 1, 0).projectOnPlane(up);
    if (north.lengthSq() < 1e-8) north.set(1, 0, 0).projectOnPlane(up);
    north.normalize();
    across.crossVectors(up, north).normalize();
    return out
      .copy(up)
      .addScaledVector(across, (Math.sin(bearing) * distance) / PLANET_RADIUS)
      .addScaledVector(north, (Math.cos(bearing) * distance) / PLANET_RADIUS)
      .normalize();
  }

  /** The tangent at `at` pointing away from a town's centre. */
  function outward(place: number, at: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    out.copy(at).sub(centres[place]!).projectOnPlane(at);
    if (out.lengthSq() < 1e-14) out.set(0, 1, 0).projectOnPlane(at);
    return out.normalize();
  }

  const site = (model: string, place: number, n: number, at: THREE.Vector3, forward: THREE.Vector3, road = -1): FleetSite => ({
    id: `${model}:${place}:${n}`,
    model,
    kind: KIND_OF[model]!,
    place,
    at: at.clone(),
    forward: forward.clone(),
    road,
  });

  const at = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const side = new THREE.Vector3();

  function cars(p: number, out: FleetSite[]): void {
    const own = byPlace.get(p);
    if (own === undefined) return;
    const place = places[p]!;
    const rng = rngFrom('fleet-cars', p);
    const order = [...own];
    for (let i = order.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
    const cap = carsFor(radiusOf(place));
    const parked: THREE.Vector3[] = [];
    // Right-hand traffic parks on the right of the way out, and the other
    // half of the world on the left: `keepsLeft`, asked of the town.
    const lane = (ROAD_CLASSES[0]!.width / 4) * (keepsLeft(place.iso) ? -1 : 1);
    for (const r of order) {
      if (parked.length >= cap) break;
      const road = roads[r]!;
      const leaving = road.a === p;
      courseOf(road, places, course);
      const out_ = Math.min(CAR_OUT, course.approach * 0.8);
      if (out_ < CAR_MIN_OUT) continue;
      const path = pathOf(r);
      const t = parameterAt(path, leaving ? out_ : path.length - out_);
      courseOf(road, places, course);
      coursePoint(course, t, at);
      courseTangent(course, t, forward);
      if (!leaving) forward.negate();
      // Screen right is `forward x up`; see `walk` in `player.ts`.
      side.crossVectors(forward, at).normalize();
      at.addScaledVector(side, lane / PLANET_RADIUS).normalize();
      forward.projectOnPlane(at).normalize();
      if (wet(at) || inSquare(at, CAR_HALF) || nearMonument(at, 0)) continue;
      if (parked.some((other) => other.angleTo(at) * PLANET_RADIUS < CAR_SPACING)) continue;
      const model = rng.chance(VAN_SHARE) ? FLEET_MODELS.van : FLEET_MODELS.car;
      out.push(site(model, p, parked.length, at, forward, r));
      parked.push(at.clone());
    }
  }

  /**
   * Open water for `BOAT_ROOM` all round a point: sixteen bearings at the
   * full room and eight at half of it, because a spit of land narrower than
   * the gap between two bearings is exactly what a hull gets drawn through.
   */
  function roomy(direction: THREE.Vector3): boolean {
    if (!wet(direction)) return false;
    for (let k = 0; k < 24; k++) {
      const bearing = k < 16 ? (k / 16) * Math.PI * 2 : ((k - 16) / 8) * Math.PI * 2 + Math.PI / 8;
      const room = k < 16 ? BOAT_ROOM : BOAT_ROOM / 2;
      north.set(0, 1, 0).projectOnPlane(direction);
      if (north.lengthSq() < 1e-8) north.set(1, 0, 0).projectOnPlane(direction);
      north.normalize();
      across.crossVectors(direction, north).normalize();
      corner
        .copy(direction)
        .addScaledVector(across, (Math.sin(bearing) * room) / PLANET_RADIUS)
        .addScaledVector(north, (Math.cos(bearing) * room) / PLANET_RADIUS)
        .normalize();
      if (!wet(corner)) return false;
    }
    return true;
  }

  function boats(p: number, out: FleetSite[]): void {
    const place = places[p]!;
    const radius = radiusOf(place);
    // Most towns are nowhere near the sea, and the coast field says so for
    // the price of one bilinear sample.
    if (shoreDistance(place.lat, place.lon) * UNITS_PER_DEGREE > radius + BOAT_SEARCH) return;
    const rng = rngFrom('fleet-boats', p);
    const count = place.pop >= BOAT_SECOND_POP && rng.chance(BOAT_SECOND_SHARE) ? 2 : 1;
    const start = rng.unit() * Math.PI * 2;
    const moored: THREE.Vector3[] = [];
    // Outward from the square in rings, every bearing on a ring before the
    // next: the first water with room is the nearest the town has.
    for (let d = radius / Math.SQRT2 + BOAT_ROOM; d <= radius + BOAT_SEARCH && moored.length < count; d += BOAT_STEP) {
      for (let k = 0; k < BOAT_BEARINGS && moored.length < count; k++) {
        around(p, start + (k / BOAT_BEARINGS) * Math.PI * 2, d, at);
        if (!roomy(at) || inSquare(at, BOAT_ROOM)) continue;
        if (moored.some((other) => other.angleTo(at) * PLANET_RADIUS < BOAT_SPACING)) continue;
        outward(p, at, forward);
        out.push(site(FLEET_MODELS.boat, p, moored.length, at, forward));
        moored.push(at.clone());
      }
    }
  }

  /** A field: land under the whole disc, flat enough, clear of towns, roads and landmarks. */
  function field(direction: THREE.Vector3, reach: number, grade: number): boolean {
    if (wet(direction)) return false;
    north.set(0, 1, 0).projectOnPlane(direction);
    if (north.lengthSq() < 1e-8) north.set(1, 0, 0).projectOnPlane(direction);
    north.normalize();
    across.crossVectors(direction, north).normalize();
    for (let k = 0; k < 4; k++) {
      const bearing = (k / 4) * Math.PI * 2;
      corner
        .copy(direction)
        .addScaledVector(across, (Math.sin(bearing) * reach) / PLANET_RADIUS)
        .addScaledVector(north, (Math.cos(bearing) * reach) / PLANET_RADIUS)
        .normalize();
      if (wet(corner)) return false;
    }
    if (gradeAt(direction, across, north, reach, slope).grade > grade) return false;
    return !nearTown(direction, reach + FIELD_CLEAR) && !nearRoad(direction, reach + FIELD_CLEAR) && !nearMonument(direction, reach);
  }

  function fieldSite(p: number, model: string, reach: number, grade: number, salt: string, out: FleetSite[]): void {
    const radius = radiusOf(places[p]!);
    const start = rngFrom(salt, p).unit() * Math.PI * 2;
    for (let j = 0; j < FIELD_RINGS; j++) {
      const d = radius + reach + FIELD_CLEAR + 4 + j * FIELD_STEP;
      for (let k = 0; k < FIELD_BEARINGS; k++) {
        around(p, start + (k / FIELD_BEARINGS) * Math.PI * 2, d, at);
        if (!field(at, reach, grade)) continue;
        // Facing away from the town, which is the way a take-off goes.
        outward(p, at, forward);
        out.push(site(model, p, 0, at, forward));
        return;
      }
    }
  }

  const perPlace: (readonly FleetSite[] | undefined)[] = new Array(places.length);
  const fieldsPer: (readonly FleetSite[] | undefined)[] = new Array(places.length);
  const counts = { car: 0, van: 0, boat: 0, plane: 0, balloon: 0, towns: 0 };
  const NONE: readonly FleetSite[] = [];

  /**
   * A town's plane and balloon, kept apart from its cars and launches because
   * the wood asks for these alone and the launches' search for water is the
   * dear half. Nothing in a field search reads a car or a launch, so the two
   * halves can be worked out in either order and come out the same.
   */
  function fieldsOf(p: number): readonly FleetSite[] {
    const known = fieldsPer[p];
    if (known !== undefined) return known;
    if (!shown[p]) return (fieldsPer[p] = NONE);
    const out: FleetSite[] = [];
    const place = places[p]!;
    if (place.pop >= PLANE_POP || place.capital === true) fieldSite(p, FLEET_MODELS.plane, PLANE_FIELD, PLANE_GRADE, 'fleet-plane', out);
    if (rngFrom('fleet-balloon', p).chance(BALLOON_SHARE)) fieldSite(p, FLEET_MODELS.balloon, BALLOON_FIELD, BALLOON_GRADE, 'fleet-balloon-site', out);
    fieldsPer[p] = out.length === 0 ? NONE : out;
    return fieldsPer[p]!;
  }

  function sitesOf(p: number): readonly FleetSite[] {
    const known = perPlace[p];
    if (known !== undefined) return known;
    if (!shown[p]) return (perPlace[p] = NONE);
    const out: FleetSite[] = [];
    cars(p, out);
    boats(p, out);
    out.push(...fieldsOf(p));
    for (const entry of out) counts[entry.kind]++;
    counts.towns++;
    perPlace[p] = out;
    return out;
  }

  const nearTowns: number[] = [];
  const fieldTowns: number[] = [];
  return {
    sitesOf,
    fieldsNear(direction, radius, out) {
      // Its own list of towns: a field search asks `townsNear` again inside.
      for (const p of townsNear(direction, radius + FIELD_SPREAD, fieldTowns)) {
        for (const entry of fieldsOf(p)) {
          const room = entry.kind === 'plane' ? SITE_ROOM.plane : SITE_ROOM.balloon;
          if (entry.at.angleTo(direction) * PLANET_RADIUS < radius + room) out.push({ at: entry.at, radius: room });
        }
      }
      return out;
    },
    near(direction, radius, out, fresh = Infinity) {
      for (const p of townsNear(direction, radius + SITE_SPREAD, nearTowns)) {
        if (perPlace[p] === undefined) {
          if (fresh <= 0) continue;
          fresh--;
        }
        out.push(...sitesOf(p));
      }
      return out;
    },
    all() {
      const out: FleetSite[] = [];
      for (let p = 0; p < places.length; p++) out.push(...sitesOf(p));
      return out;
    },
    byId(id) {
      const parts = id.split(':');
      const p = Number(parts[1]);
      if (parts.length !== 3 || !Number.isInteger(p) || p < 0 || p >= places.length) return null;
      return sitesOf(p).find((entry) => entry.id === id) ?? null;
    },
    counts,
  };
}

function cellOf(lat: number, lon: number): number {
  const row = Math.min(ROWS - 1, Math.max(0, Math.floor((90 - lat) / CELL)));
  const col = ((Math.floor((lon + 180) / CELL) % COLS) + COLS) % COLS;
  return row * COLS + col;
}

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

// ---------------------------------------------------------------------------
// Poses
// ---------------------------------------------------------------------------

const poseX = new THREE.Vector3();
const poseY = new THREE.Vector3();
const poseZ = new THREE.Vector3();
const poseBasis = new THREE.Matrix4();

/** A pose with all nine numbers finite and both directions of some length. */
export function isPose(pose: readonly number[] | undefined): pose is WirePose {
  if (pose === undefined || pose.length < 9) return false;
  for (let i = 0; i < 9; i++) if (!Number.isFinite(pose[i])) return false;
  return Math.hypot(pose[3]!, pose[4]!, pose[5]!) > 1e-6 && Math.hypot(pose[6]!, pose[7]!, pose[8]!) > 1e-6;
}

/**
 * Stands an object at a pose.
 *
 * The basis is built the one way this project builds every basis: `X = Y x Z`,
 * so its determinant is +1. `makeBasis(east, up, north)` is the other way, a
 * reflection, and a reflected vehicle is a solid ink blob (the handedness trap
 * in the project's own notes) — hence the assertion rather than a comment.
 */
export function applyPose(pose: WirePose, object: THREE.Object3D): void {
  poseZ.set(pose[3]!, pose[4]!, pose[5]!).normalize();
  poseY.set(pose[6]!, pose[7]!, pose[8]!);
  poseX.crossVectors(poseY, poseZ);
  if (poseX.lengthSq() < 1e-12) {
    // Forward along up: fall back on the planet's normal for the up.
    poseY.set(pose[0]!, pose[1]!, pose[2]!);
    poseX.crossVectors(poseY, poseZ);
  }
  poseX.normalize();
  poseY.crossVectors(poseZ, poseX).normalize();
  poseBasis.makeBasis(poseX, poseY, poseZ);
  if (poseBasis.determinant() <= 0) throw new Error('fleet: a vehicle pose would be mirrored');
  object.position.set(pose[0]!, pose[1]!, pose[2]!);
  object.quaternion.setFromRotationMatrix(poseBasis);
}

// ---------------------------------------------------------------------------
// The link with nobody else on it
// ---------------------------------------------------------------------------

/** Where the local link keeps what was moved, and for how long. */
const LOCAL_KEY = 'atlas.fleet.moved';
const LOCAL_EXPIRY_MS = 24 * 3600 * 1000;
/** How often a pose being driven is written down, at most. */
const LOCAL_SAVE_MS = 2000;

interface LocalEntry {
  pose: number[];
  seats: (string | null)[];
  /** When it was last let go of, `Date.now()`. */
  at: number;
}

/**
 * A `FleetLink` for a world with nobody else in it.
 *
 * Every seat is yours for the asking, nobody else ever drives, and what you
 * moved is written to `localStorage` — every read and write wrapped, because
 * storage can be missing, full or refused — and forgotten after a day, when
 * the vehicle is back at its site: a car left on a mountain road in March is
 * not worth keeping there for ever, and the site is where the next player on
 * this machine would look for it.
 */
export function createLocalLink(self = 'local'): FleetLink {
  const entries = new Map<string, LocalEntry>();
  const moved = new Map<string, MovedVehicle>();
  const listeners = new Set<(vehicle: string) => void>();
  let savedAt = 0;

  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(LOCAL_KEY);
    const parsed = raw === null ? null : (JSON.parse(raw) as unknown);
    if (parsed !== null && typeof parsed === 'object') {
      const now = Date.now();
      for (const [id, value] of Object.entries(parsed as Record<string, { pose?: unknown; at?: unknown }>)) {
        const pose = value?.pose;
        const at = value?.at;
        if (!Array.isArray(pose) || !isPose(pose as number[]) || typeof at !== 'number' || now - at > LOCAL_EXPIRY_MS) continue;
        entries.set(id, { pose: (pose as number[]).slice(0, 9), seats: [], at });
      }
    }
  } catch {
    // Unreadable storage is an empty one: every vehicle at its site.
  }
  for (const [id, entry] of entries) moved.set(id, { pose: entry.pose, seats: entry.seats });

  function save(): void {
    savedAt = Date.now();
    try {
      if (typeof localStorage === 'undefined') return;
      const out: Record<string, { pose: number[]; at: number }> = {};
      for (const [id, entry] of entries) if (isPose(entry.pose)) out[id] = { pose: entry.pose.map((v) => +v.toFixed(3)), at: entry.at };
      localStorage.setItem(LOCAL_KEY, JSON.stringify(out));
    } catch {
      // Full or refused: the vehicle is where it is for this session.
    }
  }

  const tell = (vehicle: string): void => {
    for (const listener of listeners) listener(vehicle);
  };

  return {
    self,
    moved,
    sample() {
      return false;
    },
    claim(vehicle, seat) {
      let entry = entries.get(vehicle);
      const holder = entry?.seats[seat] ?? null;
      if (holder !== null && holder !== self) return Promise.resolve(false);
      if (entry === undefined) {
        entry = { pose: [], seats: [], at: Date.now() };
        entries.set(vehicle, entry);
      }
      entry.seats[seat] = self;
      moved.set(vehicle, { pose: entry.pose, seats: entry.seats });
      tell(vehicle);
      return Promise.resolve(true);
    },
    release(vehicle, pose) {
      const entry = entries.get(vehicle);
      if (entry === undefined) return;
      entry.seats = entry.seats.map((holder) => (holder === self ? null : holder));
      if (pose !== null && isPose(pose)) {
        entry.pose = pose.slice(0, 9);
        entry.at = Date.now();
      }
      if (!isPose(entry.pose) && entry.seats.every((holder) => holder === null)) {
        entries.delete(vehicle);
        moved.delete(vehicle);
      } else moved.set(vehicle, { pose: entry.pose, seats: entry.seats });
      save();
      tell(vehicle);
    },
    drive(vehicle, pose) {
      const entry = entries.get(vehicle);
      if (entry === undefined || entry.seats[0] !== self) return;
      if (entry.pose.length !== 9) entry.pose.length = 9;
      for (let i = 0; i < 9; i++) entry.pose[i] = pose[i]!;
      entry.at = Date.now();
      if (Date.now() - savedAt > LOCAL_SAVE_MS) save();
    },
    onChange(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

// ---------------------------------------------------------------------------
// The fleet in the world
// ---------------------------------------------------------------------------

/** How near a vehicle has to be to be built, in units, and how far it may go before it is put away. */
const REACH = 700;
const KEEP = REACH * 1.15;
/** Inside this every vehicle in reach is built whatever the camera is pointed at. */
const ALWAYS_WITHIN = 220;
/** The most vehicles standing at once. */
const MAX_BUILT = 36;
/** Milliseconds of building a frame may give this streamer. */
const BUILD_MS = 2;
/** How far the player moves, or how long passes, before the candidates are worked out again. */
const RESCAN_MOVE = 40;
const RESCAN_SECONDS = 1;
/**
 * Towns whose sites one scan may work out for the first time: a coastal town's
 * search for open water is the dear part, about a third of a millisecond a
 * town on average and a few for a big coastal city, so a dozen is a few
 * milliseconds and a region fills in over a second or two of arriving.
 */
const FRESH_TOWNS = 12;
/** How often a parked vehicle is set down again on whatever ground has arrived under it. */
const RESEAT_SECONDS = 0.5;
/**
 * How near a vehicle you have to be to take it: two bodies from its side, as
 * the distance from you to its origin less half its longer dimension.
 */
const BOARD_REACH = AVATAR_HEIGHT * 2;
/** Spare models of each kind kept for the next time one comes into reach. */
const POOL_EACH = 6;
/**
 * The least time between two presses of `E` that are acted on, in
 * milliseconds: every one is a seat taken or given up on the relay, which
 * answers one of each a quarter of a second and drops the rest unanswered.
 */
const USE_INTERVAL_MS = 300;
/**
 * How long the link may say the seat in hand is somebody else's, or nobody's,
 * before the fleet asks for it again, in seconds; and how many times it asks
 * before a player on the ground is let out. A reconnection re-claims the seat
 * on its own, and a relay that refuses it (it saw the socket drop somewhere
 * else) would otherwise leave him driving a car nobody else sees move.
 */
const LOST_SEAT_SECONDS = 2;
const LOST_SEAT_TRIES = 3;
/** How far round the player the towns' parked cars are asked about, for the prompt. */
const PARKED_SEARCH = BOARD_REACH + 12;
/**
 * A standing balloon's footprint as a wall, as a share of its width: the
 * basket, not the envelope, which hangs a body's height and more over the
 * ground and is walked under.
 */
const BALLOON_WALL = 0.2;

export type FleetEvent = 'boarded' | 'left' | 'taken' | 'leave-refused';

export interface FleetOptions extends FleetSource {
  models: ReadonlyMap<string, CraftModel>;
  /**
   * The sites, if the caller already built them over the same source — the
   * world does, earlier, so the wood and the herds can keep off the fields.
   * One index rather than two means one road index and one set of searches.
   */
  sites?: SiteIndex;
  link: FleetLink;
  player: Player;
  /**
   * How high the made ground stands here, as a radius, or 0: the same
   * callback the player stands on, so a parked car is on the carriageway a
   * foot walks on and not on the relief under it.
   */
  madeHeightAt?: (point: THREE.Vector3) => number;
  /**
   * The cars parked in the towns, which are merged into them until somebody
   * takes one (`ParkedCar` in `settlements.ts`): where they are, and a way to
   * take one out of its town so the fleet's is the only one drawn.
   */
  parked?: {
    near(viewer: THREE.Vector3, radius: number, out: ParkedCar[]): void;
    hide(id: string): void;
  };
  onEvent?: (event: FleetEvent, model: CraftModel | null) => void;
}

export interface FleetStats {
  /** Sites worked out so far, by kind, and the towns they came from. */
  sites: Readonly<Record<CraftKind, number>> & { towns: number };
  built: number;
  pooled: number;
  moved: number;
  /** The vehicle and seat you are in, or null. */
  riding: string | null;
}

export interface Prompt {
  vehicle: string;
  seat: number;
  model: CraftModel;
  /** What `E` does: drive it, or take a passenger's seat. */
  label: 'Drive' | 'Get in';
  /** How far the player stands from its nearest side, for whoever else `E` might be meant for. */
  gap: number;
}

export interface Fleet extends FleetSeats {
  group: THREE.Group;
  sites: SiteIndex;
  readonly stats: FleetStats;
  /** The seat `E` would take now, or null. */
  readonly prompt: Prompt | null;
  /**
   * A passenger aloft with nobody at the controls, whose `E` takes them
   * (`takeControls`) rather than asking to get out.
   */
  readonly stranded: boolean;
  /**
   * Pushes a body of `radius` at `point` out of every vehicle standing here
   * that the player is not in: `settlements.collide`'s contract, for the
   * vehicles. A vehicle is a box of its own length and width.
   */
  collide(point: THREE.Vector3, radius: number, push: THREE.Vector3): boolean;
  /** Whether a town's parked car is somewhere else now, or has been taken: the town leaves it out. */
  claimsParked(id: string): boolean;
  /** Every vehicle the link says has moved or is sat in, parked cars among them. */
  claimedParked(): Iterable<string>;
  /** Every frame, after the player has moved. */
  update(dt: number, camera?: THREE.Camera): void;
  /** `E`: take the prompted seat, or leave the one you are in. */
  use(): void;
  /** The vehicle and seat you are in. */
  current(): { vehicle: string; seat: number } | null;
  /** Where a vehicle is now: moved, driven, or at its site. False if nothing knows. */
  poseOf(vehicle: string, out: WirePose): boolean;
  /** The nearest vehicle to the player, of a kind if given, among the sites near him and everything moved. */
  nearest(kind?: CraftKind): { id: string; lat: number; lon: number; distance: number } | null;
  /**
   * Straight into a vehicle, from anywhere: the player is put beside it and
   * takes its first free seat. For the console and for automated shots.
   */
  board(vehicle?: string): Promise<boolean>;
}

interface Drawn {
  id: string;
  model: CraftModel;
  variant: number;
  group: THREE.Group;
  seats: THREE.Object3D[];
  site: FleetSite | null;
  /** Seconds to the next re-seat, for a vehicle standing at its site. */
  reseat: number;
}

export function createFleet(options: FleetOptions): Fleet {
  const { world, models, link, player, madeHeightAt, parked, onEvent } = options;
  const sites = options.sites ?? createSiteIndex(options);
  const group = new THREE.Group();
  group.name = 'fleet';
  const drawn = new Map<string, Drawn>();
  const pool = new Map<string, Drawn[]>();
  const cone = createViewCone(ALWAYS_WITHIN);
  let held: Drawn | null = null;
  let heldSeat = 0;
  let pending = false;
  /** When `E` was last acted on; see `USE_INTERVAL_MS`. */
  let usedAt = -Infinity;
  /** Seconds the seat in hand has not been ours on the link, and the claims made for it since. */
  let lostFor = 0;
  let lostTries = 0;
  let prompt: Prompt | null = null;
  /** The parked car the prompt is for, when it is one of a town's. */
  let promptBay: ParkedCar | null = null;
  const lastScan = new THREE.Vector3(Infinity, 0, 0);
  let scanAge = Infinity;
  let wanted: { id: string; distance: number; site: FleetSite | null }[] = [];
  const found: FleetSite[] = [];
  const pose: WirePose = new Array(9).fill(0);
  /** The last pose driven, which is where the vehicle is left if the player is taken out of it. */
  const lastPose: WirePose = [];
  const point = new THREE.Vector3();
  const up = new THREE.Vector3();
  const centre = new THREE.Vector3();

  /**
   * The towns' parked cars the fleet has taken over, by id, and where each
   * stood: its site, for as long as this session lasts. See `adopt`.
   */
  const bayPose = new Map<string, WirePose>();
  const bays: ParkedCar[] = [];
  const localPoint = new THREE.Vector3();
  const inverse = new THREE.Quaternion();

  // Something moved, or somebody got in or out: the candidates are stale. And
  // a town's parked car somebody took is the fleet's to draw from now on.
  link.onChange((vehicle) => {
    scanAge = Infinity;
    if (link.moved.has(vehicle)) parked?.hide(vehicle);
  });

  /** Where a site's vehicle stands: its origin on the surface its kind stands on. */
  function sitePose(site: FleetSite, out: WirePose): WirePose {
    let radius: number;
    point.copy(site.at).multiplyScalar(PLANET_RADIUS);
    if (site.kind === 'boat') radius = PLANET_RADIUS + WATERLINE;
    else {
      radius = groundRadius(world, point);
      if (site.kind === 'car' || site.kind === 'van') {
        point.setLength(radius);
        radius = Math.max(radius, madeHeightAt?.(point) ?? 0);
      }
    }
    point.copy(site.at).multiplyScalar(radius);
    return writePose(point, site.forward, up.copy(site.at), out);
  }

  function poseOf(vehicle: string, out: WirePose): boolean {
    if (held !== null && held.id === vehicle) {
      player.pose(out);
      return true;
    }
    if (link.sample(vehicle, out)) return true;
    const moved = link.moved.get(vehicle);
    if (moved !== undefined && isPose(moved.pose)) {
      for (let i = 0; i < 9; i++) out[i] = moved.pose[i]!;
      return true;
    }
    const kerb = bayPose.get(vehicle);
    if (kerb !== undefined) {
      for (let i = 0; i < 9; i++) out[i] = kerb[i]!;
      return true;
    }
    const site = sites.byId(vehicle);
    if (site === null) return false;
    sitePose(site, out);
    return true;
  }

  function build(id: string, site: FleetSite | null): Drawn | null {
    const model = models.get(site?.model ?? modelOfVehicle(id));
    if (model === undefined) return null;
    const variant = model.variants > 1 ? rngFrom('fleet-variant', id).int(model.variants) : 0;
    const key = `${model.id}#${variant}`;
    const spare = pool.get(key)?.pop();
    if (spare !== undefined) {
      spare.id = id;
      spare.site = site;
      spare.reseat = 0;
      return spare;
    }
    const built = model.build(variant);
    built.name = `vehicle:${model.id}`;
    // The seats as frames of the model, so a body can be put in one without
    // knowing whose model it is: `FleetSeats.seatFrame`.
    const seats = model.seats.map((seat, i) => {
      const frame = new THREE.Object3D();
      frame.name = `seat:${i}`;
      frame.position.set(seat.x, seat.y, seat.z);
      frame.rotation.y = seat.yaw;
      // What a body put here has to know, and a remote body is put here by
      // somebody who holds only the frame: hidden in a cab, and sitting or
      // standing.
      frame.userData.shown = seat.shown;
      frame.userData.pose = seat.pose;
      built.add(frame);
      return frame;
    });
    built.traverse((object) => {
      if ((object as THREE.Mesh).isMesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    return { id, model, variant, group: built, seats, site, reseat: 0 };
  }

  function putAway(entry: Drawn): void {
    group.remove(entry.group);
    drawn.delete(entry.id);
    const key = `${entry.model.id}#${entry.variant}`;
    let spares = pool.get(key);
    if (spares === undefined) pool.set(key, (spares = []));
    if (spares.length < POOL_EACH) {
      spares.push(entry);
      return;
    }
    // Not kept: its geometry is its own (`CraftModel.build` makes a fresh
    // copy) and goes now, or every take-off from a city leaks what did not
    // fit in the pool. The materials are the world's shared ones and stay.
    entry.group.traverse((part) => {
      if ((part as THREE.Mesh).isMesh) (part as THREE.Mesh).geometry.dispose();
    });
  }

  function place(entry: Drawn): void {
    if (!poseOf(entry.id, pose)) return;
    applyPose(pose, entry.group);
  }

  /** The candidates: sites near the player, and anything moved near him, nearest first. */
  function scan(): void {
    wanted = [];
    const here = player.position;
    found.length = 0;
    up.copy(here).normalize();
    // From higher than the reach over the ground nothing on it is in reach,
    // and a plane crossing a continent would otherwise work out every town
    // under its track.
    if (here.length() - groundRadius(world, here) > REACH) return;
    sites.near(up, REACH, found, FRESH_TOWNS);
    const seen = new Set<string>();
    for (const site of found) {
      // Moved elsewhere, it is found by its pose below; taken but not yet
      // moved (`pose` empty), it is still standing here.
      if (isPose(link.moved.get(site.id)?.pose)) continue;
      centre.copy(site.at).multiplyScalar(here.length());
      const distance = centre.distanceTo(here);
      if (distance > KEEP) continue;
      wanted.push({ id: site.id, distance, site });
      seen.add(site.id);
    }
    for (const [id, moved] of link.moved) {
      if (seen.has(id) || !isPose(moved.pose)) continue;
      seen.add(id);
      centre.set(moved.pose[0]!, moved.pose[1]!, moved.pose[2]!);
      const distance = centre.distanceTo(here);
      if (distance > KEEP) continue;
      wanted.push({ id, distance, site: sites.byId(id) });
    }
    // A town's car taken over and not moved since, still at its kerb.
    for (const [id, kerb] of bayPose) {
      if (seen.has(id)) continue;
      centre.set(kerb[0]!, kerb[1]!, kerb[2]!);
      const distance = centre.distanceTo(here);
      if (distance <= KEEP) wanted.push({ id, distance, site: null });
    }
    wanted.sort((a, b) => a.distance - b.distance || (a.id < b.id ? -1 : 1));
  }

  /** The nearest free seat within reach, for the prompt. */
  function findPrompt(): Prompt | null {
    if (player.state === 'seated' || pending) return null;
    let best: Prompt | null = null;
    let bestGap = Infinity;
    for (const entry of drawn.values()) {
      const size = entry.model.size;
      const gap = entry.group.position.distanceTo(player.position) - Math.max(size[0], size[1]) / 2;
      if (gap > BOARD_REACH || gap >= bestGap) continue;
      const seats = link.moved.get(entry.id)?.seats ?? [];
      const free = entry.model.seats.findIndex((_, i) => (seats[i] ?? null) === null);
      if (free < 0) continue;
      bestGap = gap;
      best = { vehicle: entry.id, seat: free, model: entry.model, label: free === 0 ? 'Drive' : 'Get in', gap };
    }
    // And the cars parked in the towns, which are nobody's until one is taken.
    if (parked !== undefined) {
      bays.length = 0;
      parked.near(player.position, PARKED_SEARCH, bays);
      for (const bay of bays) {
        if (drawn.has(bay.id) || bayPose.has(bay.id) || link.moved.has(bay.id)) continue;
        const model = models.get(bay.model);
        if (model === undefined) continue;
        const gap = bay.position.distanceTo(player.position) - Math.max(model.size[0], model.size[1]) / 2;
        if (gap > BOARD_REACH || gap >= bestGap) continue;
        bestGap = gap;
        best = { vehicle: bay.id, seat: 0, model, label: 'Drive', gap };
        promptBay = bay;
      }
    }
    if (best === null || best.vehicle !== promptBay?.id) promptBay = null;
    return best;
  }

  /**
   * A town's parked car becomes the fleet's: built as a vehicle where the
   * town had it, and folded out of the town's buffer, so there is one car and
   * it is the one that can be driven off.
   */
  function adopt(bay: ParkedCar): Drawn | null {
    const kerb = writePose(bay.position, bay.forward, up.copy(bay.position).normalize(), new Array<number>(9));
    const entry = build(bay.id, null);
    if (entry === null) return null;
    bayPose.set(bay.id, kerb);
    drawn.set(entry.id, entry);
    group.add(entry.group);
    applyPose(kerb, entry.group);
    parked?.hide(bay.id);
    return entry;
  }

  function takeSeat(entry: Drawn, seat: number): void {
    drawn.delete(entry.id);
    group.remove(entry.group);
    poseOf(entry.id, pose);
    held = entry;
    heldSeat = seat;
    lostFor = 0;
    lostTries = 0;
    player.board({ vehicle: entry.id, seat, model: entry.model, group: entry.group }, pose);
    if (seat === 0) link.drive(entry.id, player.pose(pose), 0);
    onEvent?.('boarded', entry.model);
  }

  function claim(entry: Drawn, seat: number): Promise<boolean> {
    pending = true;
    prompt = null;
    // The pose goes with the claim: a relay that has never seen this vehicle
    // moved learns from it where the vehicle is.
    poseOf(entry.id, pose);
    return link.claim(entry.id, seat, pose.slice(0, 9)).then(
      (ok) => {
        pending = false;
        if (!ok) {
          onEvent?.('taken', entry.model);
          return false;
        }
        // Somebody may have walked off, or been taken elsewhere, while the
        // relay answered: the seat is released rather than sat in from afar.
        if (player.state === 'seated' || drawn.get(entry.id) !== entry) {
          link.release(entry.id, null);
          return false;
        }
        takeSeat(entry, seat);
        return true;
      },
      () => {
        pending = false;
        return false;
      },
    );
  }

  function leave(): void {
    if (held === null) return;
    const out = player.leave();
    if (out === null) {
      onEvent?.('leave-refused', held.model);
      return;
    }
    const entry = held;
    held = null;
    link.release(entry.id, heldSeat === 0 ? out : null);
    group.add(entry.group);
    applyPose(out, entry.group);
    drawn.set(entry.id, entry);
    entry.site = null;
    scanAge = Infinity;
    onEvent?.('left', entry.model);
  }

  /**
   * A passenger aloft with nobody at the controls — a driver whose connection
   * dropped mid-flight, which the relay answers by emptying his seat — could
   * not get out and would hang there for ever, so `E` takes the controls
   * instead of leaving. On the ground it leaves, like any passenger's.
   */
  function takeControls(entry: Drawn): void {
    pending = true;
    const at = player.pose([]);
    link.claim(entry.id, 0, at).then(
      (ok) => {
        pending = false;
        if (!ok) {
          onEvent?.('taken', entry.model);
          return;
        }
        if (held !== entry || player.ride === null) {
          link.release(entry.id, null);
          return;
        }
        heldSeat = 0;
        player.board({ vehicle: entry.id, seat: 0, model: entry.model, group: entry.group }, player.pose(pose));
        link.drive(entry.id, player.pose(pose), 0);
        onEvent?.('boarded', entry.model);
      },
      () => {
        pending = false;
      },
    );
  }

  /**
   * The seat in hand, as the link has it. Asked for again when the link says
   * it is not ours — see `LOST_SEAT_SECONDS` — and, refused every time, given
   * up as soon as the player is on the ground: in the air he flies on and is
   * let out where he lands.
   */
  function keepSeat(dt: number, entry: Drawn): void {
    const holder = link.moved.get(entry.id)?.seats[heldSeat] ?? null;
    if (holder === link.self || pending) {
      if (holder === link.self) {
        lostFor = 0;
        lostTries = 0;
      }
      return;
    }
    lostFor += dt;
    if (lostFor < LOST_SEAT_SECONDS) return;
    lostFor = 0;
    if (lostTries >= LOST_SEAT_TRIES) {
      if (!player.airborne) leave();
      return;
    }
    lostTries++;
    pending = true;
    link.claim(entry.id, heldSeat, player.pose([])).then(
      () => {
        pending = false;
      },
      () => {
        pending = false;
      },
    );
  }

  const stats: FleetStats = {
    sites: sites.counts,
    built: 0,
    pooled: 0,
    moved: 0,
    riding: null,
  };

  const fleet: Fleet = {
    group,
    sites,
    get stats() {
      stats.built = drawn.size + (held === null ? 0 : 1);
      stats.pooled = [...pool.values()].reduce((sum, spares) => sum + spares.length, 0);
      stats.moved = link.moved.size;
      stats.riding = held === null ? null : `${held.id} seat ${heldSeat}`;
      return stats;
    },
    get prompt() {
      return prompt;
    },
    get stranded() {
      if (held === null || heldSeat === 0 || !player.airborne) return false;
      return (link.moved.get(held.id)?.seats[0] ?? null) === null;
    },

    collide(point, radius, push) {
      push.set(0, 0, 0);
      let hit = false;
      for (const entry of drawn.values()) {
        const g = entry.group;
        const size = entry.model.size;
        const reach = Math.max(size[0], size[1]) / 2 + radius;
        localPoint.copy(point).sub(g.position);
        if (localPoint.lengthSq() > (reach + size[2]) * (reach + size[2])) continue;
        inverse.copy(g.quaternion).invert();
        localPoint.applyQuaternion(inverse);
        // Only at the vehicle's own height: a plane overhead is not a wall.
        if (localPoint.y < -AVATAR_HEIGHT || localPoint.y > size[2]) continue;
        const share = entry.model.kind === 'balloon' ? BALLOON_WALL : 0.5;
        const hx = size[1] * share;
        const hz = size[0] * share;
        const cx = Math.max(-hx, Math.min(hx, localPoint.x));
        const cz = Math.max(-hz, Math.min(hz, localPoint.z));
        let dx = localPoint.x - cx;
        let dz = localPoint.z - cz;
        const d = Math.hypot(dx, dz);
        if (d >= radius) continue;
        if (d > 1e-9) {
          dx *= (radius - d) / d;
          dz *= (radius - d) / d;
        } else {
          // Inside the box: out by the nearer side.
          const ox = hx - Math.abs(localPoint.x);
          const oz = hz - Math.abs(localPoint.z);
          if (ox < oz) {
            dx = Math.sign(localPoint.x || 1) * (ox + radius);
            dz = 0;
          } else {
            dx = 0;
            dz = Math.sign(localPoint.z || 1) * (oz + radius);
          }
        }
        localPoint.set(dx, 0, dz).applyQuaternion(g.quaternion);
        push.add(localPoint);
        hit = true;
      }
      // Along the ground: the part of the push that would lift a body is not a wall's.
      if (hit) push.projectOnPlane(up.copy(point).normalize());
      return hit;
    },

    claimsParked(id) {
      return bayPose.has(id) || link.moved.has(id);
    },
    claimedParked() {
      return [...link.moved.keys(), ...bayPose.keys()];
    },

    update(dt, camera) {
      // The vehicle in hand: the driver tells the link where it is, and a
      // passenger is carried wherever the driver has it.
      if (held !== null && player.ride !== null) keepSeat(dt, held);
      if (held !== null && player.ride !== null) {
        if (heldSeat === 0) {
          player.pose(lastPose);
          link.drive(held.id, lastPose, player.velocity);
        }
        else if (link.sample(held.id, pose)) player.carry(pose);
        else {
          // Nobody driving it now: the driver parked it, or dropped off the
          // relay. The passenger stays in his seat wherever the link last put
          // the vehicle — the driver's own parking place, once it arrives —
          // so the body and the drawn vehicle agree with everyone else's.
          const moved = link.moved.get(held.id);
          if (moved !== undefined && isPose(moved.pose)) player.carry(moved.pose);
        }
      } else if (held !== null) {
        // The player was put somewhere else — a teleport — and the vehicle
        // stays where it was left.
        const entry = held;
        held = null;
        link.release(entry.id, heldSeat === 0 && isPose(lastPose) ? lastPose : null);
        group.add(entry.group);
        if (poseOf(entry.id, pose)) applyPose(pose, entry.group);
        drawn.set(entry.id, entry);
        entry.site = null;
        scanAge = Infinity;
      }

      scanAge += dt;
      if (scanAge > RESCAN_SECONDS || lastScan.distanceTo(player.position) > RESCAN_MOVE) {
        scan();
        scanAge = 0;
        lastScan.copy(player.position);
        cone.aim(camera);
        const keep = new Set(wanted.map((entry) => entry.id));
        for (const entry of [...drawn.values()]) if (!keep.has(entry.id)) putAway(entry);
      }

      // Build what is wanted and not standing, nearest first, inside the frame's allowance.
      const began = performance.now();
      for (const want of wanted) {
        if (drawn.has(want.id) || (held !== null && held.id === want.id)) continue;
        if (drawn.size >= MAX_BUILT || want.distance > REACH) break;
        if (!mayBuild(began, BUILD_MS, want.distance < NEAR_BUILD)) break;
        if (want.distance > ALWAYS_WITHIN && cone.active) {
          if (!poseOf(want.id, pose)) continue;
          centre.set(pose[0]!, pose[1]!, pose[2]!);
          const model = models.get(want.site?.model ?? modelOfVehicle(want.id));
          if (model !== undefined && !cone.admits(centre, Math.max(...model.size))) continue;
        }
        const entry = build(want.id, want.site);
        if (entry === null) continue;
        drawn.set(entry.id, entry);
        group.add(entry.group);
        place(entry);
      }

      // Anything somebody else is driving moves every frame; a parked one
      // is set down again now and then, on whatever made ground has arrived.
      for (const entry of drawn.values()) {
        const moved = link.moved.get(entry.id);
        if (moved !== undefined) {
          const driven = link.sample(entry.id, pose);
          if (driven || isPose(moved.pose)) {
            applyPose(driven ? pose : moved.pose, entry.group);
            entry.site = null;
            continue;
          }
        }
        if (entry.site === null) {
          // Moved once and since expired or reset: back to its site.
          entry.site = sites.byId(entry.id);
          entry.reseat = 0;
        }
        entry.reseat -= dt;
        if (entry.reseat <= 0 && entry.site !== null) {
          entry.reseat = RESEAT_SECONDS;
          applyPose(sitePose(entry.site, pose), entry.group);
        }
      }

      prompt = findPrompt();
    },

    use() {
      if (pending) return;
      const now = performance.now();
      if (now - usedAt < USE_INTERVAL_MS) return;
      usedAt = now;
      if (held !== null) {
        const driver = link.moved.get(held.id)?.seats[0] ?? null;
        if (heldSeat > 0 && player.airborne && driver === null) takeControls(held);
        else leave();
        return;
      }
      if (prompt === null) return;
      const entry = drawn.get(prompt.vehicle) ?? (promptBay?.id === prompt.vehicle ? adopt(promptBay) : null);
      if (entry !== undefined && entry !== null) void claim(entry, prompt.seat);
    },

    current() {
      return held === null ? null : { vehicle: held.id, seat: heldSeat };
    },

    seatFrame(vehicle, seat) {
      const entry = held !== null && held.id === vehicle ? held : drawn.get(vehicle);
      return entry?.seats[seat] ?? null;
    },

    poseOf,

    nearest(kind) {
      const here = player.position;
      const from = here.clone().normalize();
      found.length = 0;
      let best: { id: string; lat: number; lon: number; distance: number } | null = null;
      const consider = (id: string, at: THREE.Vector3): void => {
        const distance = at.distanceTo(here);
        if (best !== null && distance >= best.distance) return;
        best = { id, lat: latOf(at.y / at.length()), lon: lonOf(at.x, at.z), distance };
      };
      // Widening rings, so a lone plane two hundred kilometres off is found
      // without working out every town on the planet.
      for (let radius = 1000; radius <= 64000 && best === null; radius *= 2) {
        found.length = 0;
        for (const site of sites.near(from, radius, found)) {
          if ((kind !== undefined && site.kind !== kind) || isPose(link.moved.get(site.id)?.pose)) continue;
          sitePose(site, pose);
          consider(site.id, centre.set(pose[0]!, pose[1]!, pose[2]!));
        }
      }
      for (const [id, moved] of link.moved) {
        if (!isPose(moved.pose) || (kind !== undefined && kindOfModel(modelOfVehicle(id)) !== kind)) continue;
        consider(id, centre.set(moved.pose[0]!, moved.pose[1]!, moved.pose[2]!));
      }
      return best;
    },

    async board(vehicle) {
      if (held !== null) leave();
      const id = vehicle ?? fleet.nearest()?.id;
      if (id === undefined || !poseOf(id, pose)) return false;
      const model = models.get(modelOfVehicle(id));
      if (model === undefined) return false;
      // Beside it, on the side of its first seat, and then the ordinary path in.
      centre.set(pose[0]!, pose[1]!, pose[2]!);
      up.copy(centre).normalize();
      point.set(pose[3]!, pose[4]!, pose[5]!);
      const beside = new THREE.Vector3().crossVectors(up, point).normalize();
      centre.normalize().addScaledVector(beside, (model.size[1] / 2 + AVATAR_HEIGHT * 0.6) / PLANET_RADIUS).normalize();
      player.goTo(latOf(centre.y), lonOf(centre.x, centre.z));
      scanAge = Infinity;
      fleet.update(0);
      let entry = drawn.get(id);
      if (entry === undefined) {
        entry = build(id, isPose(link.moved.get(id)?.pose) ? null : sites.byId(id)) ?? undefined;
        if (entry === undefined) return false;
        drawn.set(id, entry);
        group.add(entry.group);
        place(entry);
      }
      const seats = link.moved.get(id)?.seats ?? [];
      const free = model.seats.findIndex((_, i) => (seats[i] ?? null) === null);
      if (free < 0) return false;
      return claim(entry, free);
    },
  };
  return fleet;
}
