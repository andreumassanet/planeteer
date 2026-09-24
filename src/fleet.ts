/**
 * The vehicles you can take: where each one stands until somebody moves it,
 * which of them are built, and how you get in and out.
 *
 * **Where they stand is a pure function of the world.** Cars wait on the road
 * a few lengths out of a town's gates, launches lie off the shore nearest a
 * coastal town, light aircraft stand at the end of an airstrip beside the big
 * cities and the capitals, and a few towns have a balloon. Every one of those is decided
 * from `places.bin`, `roads.bin`, the outlines and the relief, seeded by the
 * place's index and never by `Math.random`, so every client puts the same car
 * on the same kerb without a word on the wire — and a vehicle's id,
 * `<model>:<placeIndex>:<n>`, names the same machine everywhere. A plane's
 * field is an airstrip, laid on a heading the search chooses and drawn with a
 * windsock beside it (`craft/airstrip.ts`).
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
import { PLANET_RADIUS, UNITS_PER_DEGREE, groundColorAt, groundRadius } from './globe.ts';
import { BIOMES, biomeAt, biomeSample } from './biome.ts';
import { createLandProbe } from './land-probe.ts';
import type { LandProbe } from './land-probe.ts';
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
import { CAR_BOOST, CAR_FAST_LOCK, CAR_GRIP_SPEED, CAR_TURN, WATERLINE, isWater } from './vehicles.ts';
import { AT_REST, discMaterial, motionOf } from './craft/motion.ts';
import type { CraftMotion, MotionInput } from './craft/motion.ts';
import type { CraftKind, CraftModel, FleetLink, FleetSeats, MovedVehicle, WirePose } from './craft/contract.ts';
import { writePose } from './player.ts';
import type { Player } from './player.ts';
import type { ParkedCar } from './settlements.ts';
import {
  STRIP_APPROACH,
  STRIP_BACK,
  STRIP_DRAWN,
  STRIP_HALF,
  STRIP_LENGTH,
  buildStrip,
  buildWindsock,
  stripColor,
  stripMaterial,
  stripPoint,
} from './craft/airstrip.ts';

export { writePose };

/**
 * The two materials the fleet draws with that the craft's own does not cover:
 * the airstrips' and the propeller discs'. For the shader warm-up (`warm.ts`),
 * which compiles them while the menu is up.
 */
export const fleetMaterials = (): THREE.Material[] => [stripMaterial(), discMaterial()];
export { STRIP_APPROACH, STRIP_BACK, STRIP_DRAWN, STRIP_HALF, STRIP_LENGTH, stripPoint };

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
/**
 * Past this many degrees of the coast field's own distance to water, plus the
 * whole reach of a town's field search, the search does not ask the outlines
 * whether its ground is dry: see `inlandFor`.
 */
const COAST_MARGIN = 1.5;
/** Rings and bearings a field is searched on, outward from the town. */
const FIELD_RINGS = 6;
const FIELD_STEP = 28;
const FIELD_BEARINGS = 12;

/** How much further than `STRIP_HALF` a town's disc or a road's edge is kept from the centre line. */
const STRIP_CLEAR = 2;
/** How far apart the strip is walked for water near a coast, once it has passed everything else. */
const STRIP_WATER_STEP = 5;
/** How far apart the strip is sampled for the search, and the discs the wood keeps off. */
const STRIP_STEP = 20;
/**
 * The keepout discs along the strip: one every `STRIP_STEP` or a little less,
 * each wide enough that the union of two neighbours is `STRIP_HALF` wide where
 * they meet.
 */
const STRIP_DISC = Math.hypot(STRIP_HALF, STRIP_STEP / 2);
/**
 * Headings tried from each stand: straight out of the town first, then either
 * side of it a sixteenth of a turn at a time to square across it. A strip
 * aimed back at its own town crosses it.
 */
const STRIP_HEADINGS = 9;
/**
 * A plane's stand is searched on more rings than a balloon's, because a strip
 * is harder to fit than a disc: for a 200-unit strip, eight rings and
 * sixteen headings found one for 800 of the 1,186 towns, twenty rings and
 * nine headings for 1,016 (2026-09-24).
 */
const PLANE_RINGS = 20;

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
 * Ground a standing plane or balloon keeps to itself: a disc of it. A
 * balloon's field is one, `SITE_ROOM.balloon` round the site; a plane's
 * airstrip is a row of them down its length (`STRIP_DISC` each, every
 * `STRIP_STEP`). A wood and a herd keep off it (`vegetation.ts`, `life.ts`),
 * each bringing its own spread, the way they keep off a road.
 */
export interface FieldKeepout {
  at: THREE.Vector3;
  radius: number;
}

/** The fields alone, which is all the wood and the herds ask of the fleet. */
export interface FieldIndex {
  /**
   * Every disc of every airstrip and balloon field within `radius` units of
   * `direction`, appended to `out`. **Pure and complete**: the towns it needs are worked
   * out on the spot and kept, with no cap and nothing streamed, so a tile of
   * wood built in Node and one built in the browser, first or last, keep off
   * the same ground. Only a big city or a balloon town has a field to search
   * for, so a tile pays for a handful of searches the first time and a lookup
   * after that: an airstrip's is the dear one, a median town's search well
   * under a millisecond, one in a hundred 7 ms and the worst 26 (every built
   * town, headless, 2026-09-24).
   */
  fieldsNear(direction: THREE.Vector3, radius: number, out: FieldKeepout[]): FieldKeepout[];
  /**
   * Every plane site whose town is within `radius` units plus the widest
   * reach of a strip, appended to `out`: what the strips are drawn from. Pure
   * and complete, like `fieldsNear`.
   */
  planesNear(direction: THREE.Vector3, radius: number, out: FleetSite[]): FleetSite[];
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

/**
 * The furthest a car, a launch or a balloon stands from its town's centre: the
 * biggest square, and the widest search past it. A plane can stand further
 * out, and is found through `planesNear` and its own spread.
 */
const SITE_SPREAD = 150 + Math.max(BOAT_SEARCH, FIELD_CLEAR + FIELD_RINGS * FIELD_STEP + 40);
/**
 * And the furthest a field's edge reaches from it: the last ring a search
 * tries, the stand on it, and for a plane the strip run out from there.
 */
const FIELD_SPREAD =
  150 + PLANE_FIELD + FIELD_CLEAR + 4 + (PLANE_RINGS - 1) * FIELD_STEP + STRIP_LENGTH + STRIP_APPROACH + STRIP_DISC;


/**
 * The discs a strip keeps: `STRIP_DISC` wide, every `STRIP_STEP` or a little
 * less from its back end to `STRIP_APPROACH` past its far one.
 */
export function stripKeepouts(site: Pick<FleetSite, 'at' | 'forward'>): FieldKeepout[] {
  const out: FieldKeepout[] = [];
  const span = STRIP_BACK + STRIP_LENGTH + STRIP_APPROACH;
  const count = Math.ceil(span / STRIP_STEP);
  for (let i = 0; i <= count; i++) {
    const along = -STRIP_BACK + (span * i) / count;
    out.push({ at: stripPoint(site, along, 0, new THREE.Vector3()), radius: STRIP_DISC });
  }
  return out;
}

/**
 * The order a strip's samples are tested in: its far end, its near end, then
 * halving the gaps. A strip that fails fails mostly far out — a road, a
 * coast, a hillside a few hundred units off — and this finds it in the first
 * few samples rather than the last.
 */
const STRIP_ORDER: readonly number[] = (() => {
  const count = Math.ceil((STRIP_LENGTH + STRIP_BACK) / STRIP_STEP) + 1;
  const order = [count - 1, 0];
  const seen = new Set(order);
  for (let stride = 1 << Math.ceil(Math.log2(count)); stride >= 1; stride >>= 1) {
    for (let i = 0; i < count; i += stride) {
      if (seen.has(i)) continue;
      seen.add(i);
      order.push(i);
    }
  }
  return order;
})();
const STRIP_SAMPLES = STRIP_ORDER.length;
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

  /**
   * Land for `reach` all round, by the coast field alone: `terrain.ts`'s
   * distance to any water, a bilinear sample on half-degree cells. It is
   * trusted only for a whole town's search at once, and with a margin: near a
   * coast it is out by most of a degree in places (off Port of Spain it puts
   * the Gulf of Paria 0.8 degrees further than it is), so a coastal town asks
   * the outlines and an inland one does not.
   */
  const inlandFor = (p: number): boolean =>
    shoreDistance(places[p]!.lat, places[p]!.lon) > FIELD_SPREAD / UNITS_PER_DEGREE + COAST_MARGIN;

  /**
   * A field: land under the whole disc, flat enough, clear of towns, roads
   * and landmarks. The dearest test, the outlines under five points, goes
   * last, and not at all for a town far inland.
   */
  function field(direction: THREE.Vector3, reach: number, grade: number, inland: boolean): boolean {
    north.set(0, 1, 0).projectOnPlane(direction);
    if (north.lengthSq() < 1e-8) north.set(1, 0, 0).projectOnPlane(direction);
    north.normalize();
    across.crossVectors(direction, north).normalize();
    if (nearMonument(direction, reach) || nearTown(direction, reach + FIELD_CLEAR)) return false;
    if (gradeAt(direction, across, north, reach, slope).grade > grade) return false;
    if (nearRoad(direction, reach + FIELD_CLEAR)) return false;
    if (inland) return true;
    if (wet(direction)) return false;
    for (let k = 0; k < 4; k++) {
      const bearing = (k / 4) * Math.PI * 2;
      corner
        .copy(direction)
        .addScaledVector(across, (Math.sin(bearing) * reach) / PLANET_RADIUS)
        .addScaledVector(north, (Math.cos(bearing) * reach) / PLANET_RADIUS)
        .normalize();
      if (wet(corner)) return false;
    }
    return true;
  }

  const strip = { at: new THREE.Vector3(), forward: new THREE.Vector3() };
  const stripAt = new THREE.Vector3();
  const stripAcross = new THREE.Vector3();

  /**
   * The strip from a stand at `strip.at` down `strip.forward`: flat enough
   * over its own width, clear of the towns, the roads and the landmarks, and
   * — unless the town is `inland` — on land from edge to edge. The samples go
   * in `STRIP_ORDER` and the cheap tests first, so a strip that fails usually
   * fails in a few probes; the water is walked again at `STRIP_WATER_STEP`
   * once everything else has passed, because a creek or a fjord is narrower
   * than the gap between two samples.
   */
  function stripClear(inland: boolean): boolean {
    stripAcross.crossVectors(strip.forward, strip.at).normalize();
    const clear = STRIP_HALF + STRIP_CLEAR;
    for (let n = 0; n < STRIP_SAMPLES; n++) {
      const along = -STRIP_BACK + ((STRIP_LENGTH + STRIP_BACK) * STRIP_ORDER[n]!) / (STRIP_SAMPLES - 1);
      stripPoint(strip, along, 0, stripAt);
      if (nearMonument(stripAt, STRIP_HALF) || nearTown(stripAt, clear)) return false;
      if (gradeAt(stripAt, stripAcross, strip.forward, STRIP_HALF, slope).grade > PLANE_GRADE) return false;
      if (nearRoad(stripAt, clear)) return false;
      if (!inland && (wet(stripAt) || wet(stripPoint(strip, along, STRIP_HALF, corner)) || wet(stripPoint(strip, along, -STRIP_HALF, corner)))) return false;
    }
    if (inland) return true;
    for (let along = -STRIP_BACK; along <= STRIP_LENGTH; along += STRIP_WATER_STEP) {
      for (let edge = -1; edge <= 1; edge++) if (wet(stripPoint(strip, along, edge * STRIP_HALF, corner))) return false;
    }
    return true;
  }

  function fieldSite(p: number, model: string, reach: number, grade: number, salt: string, out: FleetSite[]): void {
    const radius = radiusOf(places[p]!);
    const start = rngFrom(salt, p).unit() * Math.PI * 2;
    const plane = model === FLEET_MODELS.plane;
    const rings = plane ? PLANE_RINGS : FIELD_RINGS;
    const inland = inlandFor(p);
    for (let j = 0; j < rings; j++) {
      const d = radius + reach + FIELD_CLEAR + 4 + j * FIELD_STEP;
      for (let k = 0; k < FIELD_BEARINGS; k++) {
        around(p, start + (k / FIELD_BEARINGS) * Math.PI * 2, d, at);
        if (!field(at, reach, grade, inland)) continue;
        // Facing away from the town, which is the way a take-off goes.
        outward(p, at, forward);
        if (!plane) {
          out.push(site(model, p, 0, at, forward));
          return;
        }
        // A plane's stand is only as good as the strip it can take off down:
        // straight out of the town first, then swinging either side of that
        // by a sixteenth of a turn at a time, to straight back past it.
        strip.at.copy(at);
        for (let h = 0; h < STRIP_HEADINGS; h++) {
          const turn = Math.ceil(h / 2) * (h % 2 === 1 ? 1 : -1) * ((Math.PI * 2) / STRIP_HEADINGS);
          strip.forward.copy(forward).applyAxisAngle(at, turn).projectOnPlane(at).normalize();
          if (!stripClear(inland)) continue;
          out.push(site(model, p, 0, at, strip.forward));
          return;
        }
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
  /** Each airstrip's discs, worked out once. */
  const strips = new Map<FleetSite, readonly FieldKeepout[]>();
  const discsOf = (entry: FleetSite): readonly FieldKeepout[] => {
    let discs = strips.get(entry);
    if (discs === undefined) strips.set(entry, (discs = stripKeepouts(entry)));
    return discs;
  };
  return {
    sitesOf,
    fieldsNear(direction, radius, out) {
      // Its own list of towns: a field search asks `townsNear` again inside.
      for (const p of townsNear(direction, radius + FIELD_SPREAD, fieldTowns)) {
        for (const entry of fieldsOf(p)) {
          if (entry.kind === 'plane') {
            // The whole strip, if any of it is near: the stand is inside it.
            if (entry.at.angleTo(direction) * PLANET_RADIUS > radius + STRIP_LENGTH + STRIP_APPROACH + STRIP_DISC) continue;
            for (const disc of discsOf(entry)) {
              if (disc.at.angleTo(direction) * PLANET_RADIUS < radius + disc.radius) out.push(disc);
            }
            continue;
          }
          const room = SITE_ROOM.balloon;
          if (entry.at.angleTo(direction) * PLANET_RADIUS < radius + room) out.push({ at: entry.at, radius: room });
        }
      }
      return out;
    },
    planesNear(direction, radius, out) {
      for (const p of townsNear(direction, radius + FIELD_SPREAD, fieldTowns)) {
        for (const entry of fieldsOf(p)) if (entry.kind === 'plane') out.push(entry);
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
/**
 * How near an airstrip's middle has to be to be drawn, and how far it may go
 * before it is put away, in units from the player: further than a vehicle,
 * because it is a mark on a landscape seen from a climbing plane and costs a
 * draw call and a few hundred triangles.
 */
const STRIP_REACH = 1400;
const STRIP_KEEP = STRIP_REACH * 1.15;
/** Inside this the windsocks swing; further out they hang still, a few pixels tall. */
const SOCK_REACH = 500;
/** Inside this a moored launch rides the swell; further out it lies still. */
const MOOR_REACH = 400;
/** What a moored launch's motion is handed: nobody aboard, afloat. */
const MOORED: Readonly<MotionInput> = { ...AT_REST, moored: true };
/** Where the windsock stands: down the strip from the plane's stand, and off its left edge. */
const SOCK_ALONG = 24;
const SOCK_OFF = STRIP_DRAWN + 5;

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
  /**
   * The land mesh, for laying an airstrip on what is drawn rather than on the
   * relief under it (`land-probe.ts`). Without it a strip lies on the relief.
   */
  land?: THREE.Mesh;
}

export interface FleetStats {
  /** Sites worked out so far, by kind, and the towns they came from. */
  sites: Readonly<Record<CraftKind, number>> & { towns: number };
  built: number;
  pooled: number;
  moved: number;
  /** The vehicle and seat you are in, or null. */
  riding: string | null;
  /** Airstrips drawn, and waiting to be. */
  strips: number;
  stripsPending: number;
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
  /**
   * Every vehicle somebody else drove this frame and that is drawn here: its
   * group, posed, and its model. For what a moving vehicle leaves behind it —
   * a wake, a trail of smoke — which is `effects.ts`'s and not the fleet's.
   */
  eachDriven(visit: (group: THREE.Object3D, model: CraftModel) => void): void;
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
  /** Its springs, wheels and propeller: `craft/motion.ts`. */
  motion: CraftMotion;
  /**
   * Somebody else's vehicle, as its poses imply it is going: where it was and
   * which way it faced last frame, and the speed and turn read off the two,
   * smoothed. `tracked` is false until there is a last frame to read.
   */
  last: THREE.Vector3;
  lastForward: THREE.Vector3;
  tracked: boolean;
  speed: number;
  turn: number;
}

/** An airstrip standing: its mesh, its windsock and the windsock's pivot, and the site it is for. */
interface DrawnStrip {
  site: FleetSite;
  group: THREE.Group;
  strip: THREE.Mesh;
  sock: THREE.Object3D | null;
  /** Where the middle of the strip is, as a point at the ground, for its distance. */
  middle: THREE.Vector3;
  /** The wind's own bearing here, off straight down the strip, and a phase for its gusts. */
  wind: number;
  phase: number;
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
  /** What `eachDriven` walks: rewritten by every `update`, never reallocated. */
  const drivenNow: Drawn[] = [];
  const bays: ParkedCar[] = [];
  const localPoint = new THREE.Vector3();
  const inverse = new THREE.Quaternion();
  const heading = new THREE.Vector3();
  const turned = new THREE.Vector3();
  /** What another player's vehicle's motion is handed, rewritten every frame. */
  const remote: MotionInput = { ...AT_REST };

  // ---- the airstrips -------------------------------------------------------

  const strips = new Map<string, DrawnStrip>();
  /** The plane sites near enough to have their strip drawn, nearest first; rewritten by every scan. */
  let stripsWanted: { site: FleetSite; distance: number }[] = [];
  const planeSites: FleetSite[] = [];
  /** The drawn land, indexed round the player on the first strip that needs it. */
  let probe: LandProbe | null = null;
  const stripColour = new THREE.Color();
  const stripGround = new THREE.Color();
  const stripBiome = biomeSample();
  const stripPose: WirePose = new Array(9).fill(0);
  let clock = 0;

  /** The drawn land's radius along a direction, or the relief's where the index has no answer. */
  const surface = (direction: THREE.Vector3): number =>
    probe?.radiusAt(direction) ?? groundRadius(world, point.copy(direction).multiplyScalar(PLANET_RADIUS));

  function middleOf(site: FleetSite, out: THREE.Vector3): THREE.Vector3 {
    stripPoint(site, STRIP_LENGTH / 2, 0, out);
    return out.multiplyScalar(groundRadius(world, point.copy(out).multiplyScalar(PLANET_RADIUS)));
  }

  function scanStrips(): void {
    planeSites.length = 0;
    up.copy(player.position).normalize();
    sites.planesNear(up, STRIP_KEEP, planeSites);
    stripsWanted = [];
    for (const site of planeSites) {
      const distance = middleOf(site, centre).distanceTo(player.position);
      if (distance <= (strips.has(site.id) ? STRIP_KEEP : STRIP_REACH)) stripsWanted.push({ site, distance });
    }
    stripsWanted.sort((a, b) => a.distance - b.distance || (a.site.id < b.site.id ? -1 : 1));
    const keep = new Set(stripsWanted.map((want) => want.site.id));
    for (const [id, drawnStrip] of strips) {
      if (keep.has(id)) continue;
      group.remove(drawnStrip.group);
      // The windsock shares its template's geometry; only the strip's own goes.
      drawnStrip.strip.geometry.dispose();
      strips.delete(id);
    }
  }

  function buildStripFor(site: FleetSite): DrawnStrip {
    // The land's own colour under the middle, and whether it has a sward to mow.
    stripPoint(site, STRIP_LENGTH / 2, 0, centre);
    point.copy(centre).multiplyScalar(PLANET_RADIUS);
    groundColorAt(world, point, stripGround);
    const lat = latOf(centre.y);
    const lon = lonOf(centre.x, centre.z);
    biomeAt(centre.x, centre.y, centre.z, lat, lon, world.elevationAt(point), stripBiome);
    stripColor(stripGround, BIOMES[stripBiome.id].sward, stripColour);

    const holder = new THREE.Group();
    holder.name = `airstrip:${site.id}`;
    const strip = buildStrip(site, surface, stripColour);
    holder.add(strip);

    // The windsock, stood upright off the strip's left edge and facing down it.
    const sock = buildWindsock();
    stripPoint(site, SOCK_ALONG, -SOCK_OFF, centre);
    point.copy(centre).multiplyScalar(surface(centre));
    applyPose(writePose(point, site.forward, centre, stripPose), sock);
    holder.add(sock);
    group.add(holder);
    const rng = rngFrom('fleet-windsock', site.place);
    return {
      site,
      group: holder,
      strip,
      sock: sock.getObjectByName('rotor') ?? null,
      middle: middleOf(site, new THREE.Vector3()),
      // A strip is laid into the prevailing wind, so the sock points back
      // down it, give or take a seeded quarter of a right angle.
      wind: Math.PI + (rng.unit() - 0.5) * 0.8,
      phase: rng.unit() * Math.PI * 2,
    };
  }

  /** Builds what is wanted and not standing, inside the frame's allowance, and swings the near windsocks. */
  function updateStrips(dt: number, began: number): void {
    clock += dt;
    for (const want of stripsWanted) {
      if (strips.has(want.site.id)) continue;
      if (!mayBuild(began, BUILD_MS, want.distance < NEAR_BUILD)) break;
      if (options.land !== undefined) {
        probe ??= createLandProbe(options.land);
        // Gathered a slice a frame; the strips wait for it rather than lie on the relief.
        if (!probe.prepare(player.position)) break;
      }
      strips.set(want.site.id, buildStripFor(want.site));
    }
    for (const drawnStrip of strips.values()) {
      if (drawnStrip.sock === null || drawnStrip.middle.distanceTo(player.position) > SOCK_REACH + STRIP_LENGTH / 2) continue;
      // A slow swing and a quicker gust over it, never the same twice, and the
      // tail lifting as the gust fills it.
      const t = clock + drawnStrip.phase;
      const gust = 0.5 + 0.5 * Math.sin(t * 0.9) * Math.sin(t * 0.37 + 1.3);
      drawnStrip.sock.rotation.y = drawnStrip.wind + 0.3 * Math.sin(t * 0.45) + 0.1 * Math.sin(t * 1.7);
      drawnStrip.sock.rotation.x = 0.55 - 0.45 * gust;
    }
  }

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
      spare.tracked = false;
      spare.speed = spare.turn = 0;
      spare.motion.rest();
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
    // After the seats, so the springs carry them too.
    const motion = motionOf(built, model);
    return {
      id,
      model,
      variant,
      group: built,
      seats,
      site,
      reseat: 0,
      motion,
      last: new THREE.Vector3(),
      lastForward: new THREE.Vector3(),
      tracked: false,
      speed: 0,
      turn: 0,
    };
  }

  /**
   * Somebody else's vehicle, moving: its springs, wheels and propeller handed
   * what its poses say it is doing — the speed along its nose and the turn
   * between this frame's heading and the last, smoothed over an eighth of a
   * second, because a sampled pose steps by whatever the frame did. The wheel
   * is read back off the turn through the steering law (`steerWheels` in
   * `player.ts`), so a car turning on the spot does not show full lock.
   */
  function animate(entry: Drawn, dt: number, at: WirePose): void {
    point.set(at[0]!, at[1]!, at[2]!);
    heading.set(at[3]!, at[4]!, at[5]!).normalize();
    if (entry.tracked && dt > 0) {
      up.copy(point).normalize();
      const along = localPoint.copy(point).sub(entry.last).dot(heading) / dt;
      const turn = Math.asin(Math.max(-1, Math.min(1, turned.crossVectors(entry.lastForward, heading).dot(up)))) / dt;
      const ease = 1 - Math.exp(-8 * dt);
      entry.speed += (along - entry.speed) * ease;
      entry.turn += (turn - entry.turn) * ease;
    }
    entry.last.copy(point);
    entry.lastForward.copy(heading);
    entry.tracked = true;
    const kind = entry.model.kind;
    const pace = Math.abs(entry.speed);
    remote.speed = entry.speed;
    remote.turnRate = entry.turn;
    remote.steering = 0;
    if (kind === 'car' || kind === 'van') {
      const grip = Math.min(1, pace / CAR_GRIP_SPEED);
      const lock = 1 + (CAR_FAST_LOCK - 1) * Math.min(1, pace / CAR_BOOST);
      const reach = CAR_TURN * grip * lock;
      if (reach > 1e-3) remote.steering = Math.max(-1, Math.min(1, (-entry.turn / reach) * (entry.speed < 0 ? -1 : 1)));
    }
    remote.grounded = kind === 'plane' || kind === 'balloon' ? point.length() - groundRadius(world, point) < 1.5 : true;
    remote.engine = true;
    remote.moored = false;
    entry.motion.update(dt, remote);
  }

  /** A vehicle nobody is driving: a launch near enough to see rides its mooring, anything else eases to rest. */
  function settle(entry: Drawn, dt: number): void {
    entry.tracked = false;
    entry.speed = entry.turn = 0;
    if (entry.model.kind === 'boat' && entry.group.position.distanceTo(player.position) < MOOR_REACH) entry.motion.update(dt, MOORED);
    else if (entry.motion.settling) entry.motion.update(dt, AT_REST);
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
    // fit in the pool. The materials are the world's shared ones and stay,
    // and so does a propeller's swept disc, whose one circle every plane
    // shares (`craft/motion.ts`).
    entry.group.traverse((part) => {
      if ((part as THREE.Mesh).isMesh && part.name !== 'prop-disc') (part as THREE.Mesh).geometry.dispose();
    });
  }

  function place(entry: Drawn): void {
    if (!poseOf(entry.id, pose)) return;
    applyPose(pose, entry.group);
  }

  /** The candidates: sites near the player, and anything moved near him, nearest first. */
  function scan(): void {
    scanStrips();
    wanted = [];
    const here = player.position;
    found.length = 0;
    up.copy(here).normalize();
    // From higher than the reach over the ground nothing on it is in reach,
    // and a plane crossing a continent would otherwise work out every town
    // under its track.
    if (here.length() - groundRadius(world, here) > REACH) return;
    sites.near(up, REACH, found, FRESH_TOWNS);
    // A plane stands further out of its town than `near` looks for a town;
    // its strip search is already worked out, so this is a lookup.
    for (const plane of planeSites) if (!found.includes(plane)) found.push(plane);
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
    strips: 0,
    stripsPending: 0,
  };

  const fleet: Fleet = {
    group,
    sites,
    get stats() {
      stats.built = drawn.size + (held === null ? 0 : 1);
      stats.pooled = [...pool.values()].reduce((sum, spares) => sum + spares.length, 0);
      stats.moved = link.moved.size;
      stats.riding = held === null ? null : `${held.id} seat ${heldSeat}`;
      stats.strips = strips.size;
      stats.stripsPending = stripsWanted.filter((want) => !strips.has(want.site.id)).length;
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
      updateStrips(dt, began);

      // Anything somebody else is driving moves every frame; a parked one
      // is set down again now and then, on whatever made ground has arrived.
      drivenNow.length = 0;
      for (const entry of drawn.values()) {
        const moved = link.moved.get(entry.id);
        if (moved !== undefined) {
          const driven = link.sample(entry.id, pose);
          if (driven || isPose(moved.pose)) {
            applyPose(driven ? pose : moved.pose, entry.group);
            if (driven) {
              drivenNow.push(entry);
              animate(entry, dt, pose);
            } else settle(entry, dt);
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
        settle(entry, dt);
      }

      prompt = findPrompt();
    },

    eachDriven(visit) {
      for (const entry of drivenNow) visit(entry.group, entry.model);
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
