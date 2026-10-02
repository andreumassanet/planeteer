/**
 * The vehicles you can take: where each one stands until somebody moves it,
 * which of them are built, and how you get in and out.
 *
 * **Where they stand is a pure function of the world.** Cars wait on the road
 * a few lengths out of a town's gates, launches lie off the shore nearest a
 * coastal town, light aircraft stand at the end of an airstrip beside the big
 * cities and the capitals, and a few towns have a balloon. The rest of the
 * fleet stands where it makes sense (`GATE_SHARES` and what follows it): a
 * rack of bicycles and a motorbike on a gate's verge, a tuk-tuk, a jeep or a
 * bus further out on its road, a jet ski and a sailboat near the launch, and a
 * horse, a tractor or a helicopter in a field of its own. And every bicycle,
 * scooter, rickshaw, pickup, bus and tractor a town parks can be taken
 * (`PARKED_CRAFT`). Every one of those is decided
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
 * (`merge.ts`) — the nearest `MAX_BUILT` of them, inside the frame's shared
 * build allowance (`view.ts`), dissolving in and out as a town does
 * (`fade.ts`), and put back in a pool when the player leaves.
 *
 * **The sites are worked out a town at a time, on first need.** The whole
 * planet's are about forty thousand vehicles (39,786 on 2026-09-25) and the
 * launches' search for open water is most of their cost, so the world pays
 * for the towns near the player and `SiteIndex.all()` is there for the check
 * and the console.
 */
import * as THREE from 'three';
import type { World } from './geo.ts';
import { PLANET_RADIUS, UNITS_PER_DEGREE, groundColorAt, groundRadius } from './globe.ts';
import { BIOMES, biomeAt, biomeSample } from './biome.ts';
import { drawnRadius, landProbeOf } from './land-probe.ts';
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
import { keepsLeft, trafficFor } from './traffic/regions.ts';
import { latOf, lonOf, unitAt } from './sphere.ts';
import { AVATAR_HEIGHT } from './stature.ts';
import { plannedSite, siteGap } from './landmark-ground.ts';
import type { LandmarkSite } from './landmark-ground.ts';
import { NEAR_BUILD, createViewCone, mayBuild } from './view.ts';
import { FOUNDER_DRAG, FOUNDER_TIME, ROAD_HANDLING, WATERLINE, founderDepth, founderNose, founders, isWater } from './vehicles.ts';
import { SEA_REACH, coastAt, coastSample, prepareSeaFloor, seaDepthAt, seaZoneAt } from './sea-floor.ts';
import { AT_REST, discMaterial, motionOf } from './craft/motion.ts';
import { craftMaterial } from './craft/build.ts';
import { FADES, createFader, fadeTwin } from './fade.ts';
import type { CraftMotion, MotionInput } from './craft/motion.ts';
import { CRAFT_KINDS, isAirKind } from './craft/contract.ts';
import { fleetVariant } from './craft/parked.ts';
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
  stripCorners,
  stripsMeet,
} from './craft/airstrip.ts';

export { writePose };

/**
 * The materials the fleet draws with — the airstrips', the propeller discs'
 * and the craft's own, and the craft's dissolving twin, which every vehicle
 * wears for the `FADE_MS` it takes to arrive or go (`fade.ts`). For the shader
 * warm-up (`warm.ts`), which compiles them while the menu is up.
 */
export const fleetMaterials = (): THREE.Material[] => [stripMaterial(), discMaterial(), craftMaterial(), fadeTwin(craftMaterial())];
export { STRIP_APPROACH, STRIP_BACK, STRIP_DRAWN, STRIP_HALF, STRIP_LENGTH, stripPoint };

const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------
// Which model stands where
// ---------------------------------------------------------------------------

/** The model ids the sites name, a kind's first; `craft/index.ts` builds them. */
export const FLEET_MODELS = {
  car: 'hatchback',
  van: 'van',
  boat: 'launch',
  plane: 'light-plane',
  balloon: 'balloon',
  bicycle: 'bicycle',
  motorbike: 'motorbike',
  tuktuk: 'tuk-tuk',
  bus: 'bus',
  tractor: 'tractor',
  jeep: 'jeep',
  horse: 'horse',
  jetski: 'jet-ski',
  sailboat: 'sailboat',
  helicopter: 'helicopter',
  submarine: 'submarine',
} as const satisfies Record<CraftKind, string>;

/**
 * Every model's kind, the second looks of a kind among them: a scooter is
 * driven as a motorbike, a pickup as a jeep. A kind can be told from a vehicle
 * id alone this way, which is how the relay's vehicles and a town's parked
 * ones are known.
 */
const KIND_OF: Readonly<Record<string, CraftKind>> = {
  ...Object.fromEntries((Object.entries(FLEET_MODELS) as [CraftKind, string][]).map(([kind, id]) => [id, kind])),
  scooter: 'motorbike',
  pickup: 'jeep',
};
/** The kinds that stand in the water rather than on the ground. */
const AFLOAT: ReadonlySet<CraftKind> = new Set<CraftKind>(['boat', 'jetski', 'sailboat', 'submarine']);

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
/**
 * Whether a town keeps a balloon: the one answer, which the fleet's field
 * search and the balloons that fly from those towns (`air-traffic.ts`) both
 * ask. Seeded by the place's index, so every client agrees.
 */
export const keepsBalloon = (place: number): boolean => rngFrom('fleet-balloon', place).chance(BALLOON_SHARE);
/** Margin between a field and whatever it keeps clear of, in units. */
const FIELD_CLEAR = 6;

/**
 * **The rest of the fleet, by where it makes sense.** At a town's gates, on
 * the verge across the road from its car: a rack of bicycles where people
 * cycle — every town in the countries that do (`CYCLING`) and a share of the
 * rest by region — and a motorbike or a scooter where the street is full of
 * them. Further out on the carriageway: a tuk-tuk in South and Southeast
 * Asia, a jeep where the town stands in desert, rock, steppe, savanna or
 * tundra, and a bus at a city's. Off the shore: a jet ski at a warm coast's
 * towns and a sailboat at a harbour's. In a field of its own: a horse by a
 * town in open grass country, a tractor by a farming village, and a
 * helicopter by a city of a million. Every share is seeded by the town.
 */
const GATE_SHARES = {
  bicycle: { 'east-asia': 0.8, nordic: 0.6, 'atlantic-europe': 0.5, 'southeast-asia': 0.5, 'south-asia': 0.4, 'east-europe': 0.3, mediterranean: 0.25 } as Record<string, number>,
  motorbike: {
    'southeast-asia': 0.9, 'south-asia': 0.7, mediterranean: 0.6, 'east-asia': 0.5, 'latin-america': 0.45, maghreb: 0.35, 'sub-saharan': 0.35, 'middle-east': 0.3,
  } as Record<string, number>,
  tuktuk: { 'south-asia': 0.7, 'southeast-asia': 0.5, 'sub-saharan': 0.12 } as Record<string, number>,
};
/** Where nothing above names a region, the share of towns that have one all the same. */
const GATE_ELSEWHERE = { bicycle: 0.15, motorbike: 0.12, tuktuk: 0 };
/** The countries that cycle, whose every town keeps a rack of two or three. */
const CYCLING: ReadonlySet<string> = new Set(['NLD', 'DNK', 'BEL', 'DEU', 'SWE', 'FIN', 'JPN', 'CHN', 'TWN']);
/** Where a scooter rather than a motorbike stands, by region, as a share. */
const SCOOTERS: Readonly<Record<string, number>> = { 'southeast-asia': 0.8, 'south-asia': 0.6, 'east-asia': 0.7, mediterranean: 0.6 };
/** The biomes a jeep is kept in, and the share of their towns that keep one. */
const JEEP_BIOMES: ReadonlySet<string> = new Set(['desert', 'rock', 'steppe', 'savanna', 'tundra']);
const JEEP_SHARE = 0.6;
/** Towns this big keep a bus. */
const BUS_POP = 150_000;
/**
 * How far out of the gate each stands along its road, in units, and off the
 * carriageway's centre line: the bicycles and the motorbike on the far verge,
 * a body's width past the drawn edge; the rest on the lane the car parks on,
 * beyond it.
 */
const RACK_ALONG = 5;
const RACK_PITCH = 1.8;
const VERGE = 1.6;
const MOTORBIKE_ALONG = 12;
const TUKTUK_ALONG = 24;
const JEEP_ALONG = 32;
const BUS_ALONG = 44;
/** A jet ski where the sea is warm, a sailboat at a harbour: the latitude, the population and the shares. */
const JETSKI_LAT = 40;
const JETSKI_SHARE = 0.5;
const SAILBOAT_POP = 30_000;
const SAILBOAT_SHARE = 0.6;
/**
 * A submarine off a big harbour, a tourist boat's kind: the cities of a
 * million and more on a sea with a reef or a kelp forest to see
 * (`seaZoneAt`), a share of them, and its own stream of the town's numbers,
 * so the jet skis and the sailboats stand where they always stood.
 */
const SUBMARINE_POP = 1_000_000;
const SUBMARINE_SHARE = 0.35;
/**
 * The least water a submarine is moored over, units of the floor under the
 * sea's radius (`seaDepthAt`): past the sandy shelf, so the first dive goes
 * somewhere; and how far from the town's launch that water is looked for.
 */
export const SUBMARINE_SITE_DEPTH = 9;
const SUBMARINE_REACH = 320;
const coastNear = coastSample();
/** Two moorings of one town nearer than this, on top of their rooms, are one. */
const MOORING_GAP = 6;
/** How far from the town's launch a jet ski or a sailboat is looked for, and on how many bearings. */
const MOORING_REACH = 90;
const MOORING_BEARINGS = 12;
/** A horse's paddock, a tractor's field and a helicopter's pad: how steep, and who keeps one. */
const HORSE_GRADE = Math.tan(20 * DEG);
const HORSE_BIOMES: Readonly<Record<string, number>> = { steppe: 0.5, grassland: 0.4, savanna: 0.2, temperate: 0.2 };
const HORSE_POP = 200_000;
/** The share of horse towns with a second horse in the same paddock country. */
const HORSE_SECOND = 0.4;
const TRACTOR_GRADE = Math.tan(14 * DEG);
const TRACTOR_BIOMES: Readonly<Record<string, number>> = { temperate: 0.2, grassland: 0.25, steppe: 0.15 };
const TRACTOR_POP = 100_000;
const HELI_GRADE = Math.tan(8 * DEG);
const HELI_POP = 1_000_000;
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
export const SITE_ROOM: Readonly<Record<CraftKind, number>> = {
  car: CAR_HALF,
  van: CAR_HALF,
  boat: BOAT_ROOM,
  plane: PLANE_FIELD,
  balloon: BALLOON_FIELD,
  bicycle: 1.6,
  motorbike: 2.4,
  tuktuk: 3,
  jeep: 4.8,
  bus: 6.6,
  jetski: 6,
  sailboat: 10,
  horse: 5,
  tractor: 5,
  helicopter: 10,
  submarine: 11,
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
  /** The landmarks, which a field keeps clear of by their plan (`landmark-ground.ts`). */
  monuments?: readonly LandmarkSite[];
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
  /**
   * Work out ahead of time what `fieldsNear` and `planesNear` would work out
   * on their first ask round `direction`: the plane towns within `radius`
   * units, nearest first — each one's free strip, then its fields — one town
   * at a time while `more()` says so. True once nothing within `radius` is
   * left. Only fills the caches the lookups fill, so it changes when the work
   * is done and never what it finds.
   */
  warm(direction: THREE.Vector3, radius: number, more: () => boolean): boolean;
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


/** How far apart two strips' stands may be and their grounds still meet: each its drawn length and `STRIP_HALF` across. */
const STRIP_MEET = 2 * Math.hypot(STRIP_LENGTH + STRIP_BACK + 8, STRIP_HALF);
/**
 * How far a strip's corners reach from its middle (`STRIP_LENGTH / 2` down it,
 * where `freeStrip` measures from), with a unit to spare: its drawn back end
 * is the further, `STRIP_BACK` and four more behind the stand.
 */
const STRIP_HALF_DIAGONAL = Math.hypot(STRIP_LENGTH / 2 + STRIP_BACK + 4, STRIP_HALF) + 1;

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
/** How far down the strip each sample is, in `STRIP_ORDER`. */
/** Every candidate a plane's search can try: a stand on each ring and bearing, and each heading from it. */
const PLANE_CANDIDATES = PLANE_RINGS * FIELD_BEARINGS * STRIP_HEADINGS;
const STRIP_ALONG: readonly number[] = STRIP_ORDER.map((i) => -STRIP_BACK + ((STRIP_LENGTH + STRIP_BACK) * i) / (STRIP_SAMPLES - 1));
/** Degrees in one cell of the town index. */
const CELL = 2;
const COLS = 360 / CELL;
const ROWS = 180 / CELL;

export function createSiteIndex(source: FleetSource): SiteIndex {
  const { world, places, roads } = source;
  // By the ground each one's model takes, the plan, as the towns and the wood
  // keep off it: the footprint's disc walled off a whole circle round a bridge.
  const monuments = (source.monuments ?? []).map(plannedSite);
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

  // ---- a field search's own neighbourhood ------------------------------------
  //
  // A field search asks whether hundreds of points near one town are near a
  // town, a road or a landmark, and each of those questions was a grid walk
  // over the planet's index. So `fieldSite` asks the indices once, for
  // everything within reach of any point it can test (`localise`), and the
  // three tests below ask only those — the same predicate over a superset of
  // what the grid walk would have handed back, so the same answer.

  /** What is near a patch of ground: the towns (and their centres and built radii, flat), the roads, the landmarks. */
  interface Neighbourhood {
    towns: number[];
    xyzr: Float64Array;
    roads: number[];
    monuments: (typeof monuments)[number][];
  }
  const emptyNeighbourhood = (): Neighbourhood => ({ towns: [], xyzr: new Float64Array(64), roads: [], monuments: [] });
  /** Round the town a search is for (`localise`), and round the stand whose strips it is trying (`narrow`). */
  const local = emptyNeighbourhood();
  const standing = emptyNeighbourhood();
  /** Which of the two the tests below ask. */
  let active = local;

  /** The widest clearance any of the tests asks for: a field's, or a strip's from a town, a road or a landmark. */
  const clearFor = (reach: number): number => Math.max(reach + FIELD_CLEAR, STRIP_HALF + STRIP_CLEAR, FIELD_CLEAR + STRIP_HALF);

  function keepTown(into: Neighbourhood, q: number, x: number, y: number, z: number, radius: number): void {
    const i = into.towns.length;
    into.towns.push(q);
    if (into.xyzr.length < (i + 1) * 4) {
      const grown = new Float64Array(into.xyzr.length * 2);
      grown.set(into.xyzr);
      into.xyzr = grown;
    }
    into.xyzr[i * 4] = x;
    into.xyzr[i * 4 + 1] = y;
    into.xyzr[i * 4 + 2] = z;
    into.xyzr[i * 4 + 3] = radius;
  }

  /** Every town, road and landmark any point within `span` units of town `p`'s centre could be within `clear` of. */
  function localise(p: number, span: number, clear: number): void {
    const centre = centres[p]!;
    local.towns.length = 0;
    // A town's disc is at most 150 units round its centre (`nearTown`).
    for (const q of townsNear(centre, span + 150 + clear + 1, townList)) {
      const c = centres[q]!;
      keepTown(local, q, c.x, c.y, c.z, radiusOf(places[q]!));
    }
    // `nearRoad` asks `near` for `clear + 12`; the road's own bound is
    // re-tested at each point (`reaches`), so this only has to hold them all.
    roadIndex.near(centre, span + clear + 12 + 1, local.roads);
    local.monuments.length = 0;
    for (const m of monuments) {
      const dot = centre.x * m.up.x + centre.y * m.up.y + centre.z * m.up.z;
      if (Math.acos(Math.min(1, Math.max(-1, dot))) * PLANET_RADIUS <= span + m.reach + FIELD_CLEAR + clear + 1) local.monuments.push(m);
    }
    active = local;
  }

  /**
   * Of `local`, what any point within `span` units of `point` could be
   * within `clear` of, into `standing`: by the triangle inequality on each
   * one's own bound, with a unit to spare, so a superset of what matters.
   */
  function narrow(point: THREE.Vector3, span: number, clear: number): void {
    standing.towns.length = 0;
    const t = local.xyzr;
    for (let i = 0; i < local.towns.length; i++) {
      const x = t[i * 4]!, y = t[i * 4 + 1]!, z = t[i * 4 + 2]!, radius = t[i * 4 + 3]!;
      if (point.x * x + point.y * y + point.z * z < Math.cos(Math.min(Math.PI, (span + radius + clear + 1) / PLANET_RADIUS))) continue;
      keepTown(standing, local.towns[i]!, x, y, z, radius);
    }
    standing.roads.length = 0;
    for (const r of local.roads) if (roadIndex.reaches(r, point, span + clear + 12 + 1)) standing.roads.push(r);
    standing.monuments.length = 0;
    for (const m of local.monuments) {
      const dot = point.x * m.up.x + point.y * m.up.y + point.z * m.up.z;
      if (Math.acos(Math.min(1, Math.max(-1, dot))) * PLANET_RADIUS <= span + m.reach + FIELD_CLEAR + clear + 1) standing.monuments.push(m);
    }
    active = standing;
  }

  /** Within `clear` units of any built town's disc, of those `active` holds. */
  function nearTownLocal(direction: THREE.Vector3, clear: number): boolean {
    const { towns, xyzr: t } = active;
    for (let i = 0; i < towns.length; i++) {
      const limit = t[i * 4 + 3]! + clear;
      // Far past the disc by the dot product alone, with a margin, and the
      // exact test the grid walk's caller made for the rest.
      if (direction.x * t[i * 4]! + direction.y * t[i * 4 + 1]! + direction.z * t[i * 4 + 2]! < Math.cos(limit / PLANET_RADIUS + 1e-6)) continue;
      if (centres[towns[i]!]!.angleTo(direction) * PLANET_RADIUS < limit) return true;
    }
    return false;
  }

  /** `nearRoad`, over the roads `active` holds. */
  function nearRoadLocal(direction: THREE.Vector3, clear: number): boolean {
    for (const r of active.roads) {
      if (!roadIndex.reaches(r, direction, clear + 12)) continue;
      if (distanceToPath(pathOf(r), direction) < roadClearance(roads[r]!.cls) + clear) return true;
    }
    return false;
  }

  /** `nearMonument`, over the landmarks `active` holds. */
  function nearMonumentLocal(direction: THREE.Vector3, clear: number): boolean {
    const keep = FIELD_CLEAR + clear;
    const p = monumentProbe.copy(direction).normalize();
    for (const m of active.monuments) {
      const dot = p.x * m.up.x + p.y * m.up.y + p.z * m.up.z;
      if (dot < Math.cos((m.reach + keep) / PLANET_RADIUS)) continue;
      if (siteGap(m, p, PLANET_RADIUS) < keep) return true;
    }
    return false;
  }

  /** The point `distance` units from a town's centre on a bearing, in its own frame. */
  function around(place: number, bearing: number, distance: number, out: THREE.Vector3): THREE.Vector3 {
    return aroundPoint(centres[place]!, bearing, distance, out);
  }

  /** The point `distance` units from `up` on a bearing from its north. */
  function aroundPoint(up: THREE.Vector3, bearing: number, distance: number, out: THREE.Vector3): THREE.Vector3 {
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
   * the gap between two bearings is exactly what a hull gets drawn through;
   * and no road's bridge within the room either.
   */
  function roomy(direction: THREE.Vector3, need = BOAT_ROOM): boolean {
    if (!wet(direction)) return false;
    // And out from under a bridge: a hull moored under a deck is a hull through it.
    if (nearRoad(direction, need)) return false;
    for (let k = 0; k < 24; k++) {
      const bearing = k < 16 ? (k / 16) * Math.PI * 2 : ((k - 16) / 8) * Math.PI * 2 + Math.PI / 8;
      const room = k < 16 ? need : need / 2;
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

  // ---- the rest of the fleet ------------------------------------------------

  const continentOf = new Map<string, string>(world.countries.map((country) => [country.iso, country.continent]));
  const regions: (string | undefined)[] = new Array(places.length);
  /** A town's traffic region: `trafficFor`, the same answer its streets are parked by. */
  const regionOf = (p: number): string => {
    const place = places[p]!;
    return (regions[p] ??= trafficFor(place.iso, continentOf.get(place.iso) ?? '', place.lat).id);
  };
  const townBiome = biomeSample();
  /** The biome at a town's centre. */
  const biomeOf = (p: number): string => {
    const at = centres[p]!;
    const place = places[p]!;
    biomeAt(at.x, at.y, at.z, place.lat, place.lon, world.elevationAt(probe.copy(at).multiplyScalar(PLANET_RADIUS)), townBiome);
    return townBiome.id;
  };
  /** Whether a spot is within its room and another's of anything this town already keeps. */
  const crowded = (p: number, spot: THREE.Vector3, room: number, out: readonly FleetSite[]): boolean =>
    out.some((other) => other.place === p && other.at.angleTo(spot) * PLANET_RADIUS < room + SITE_ROOM[other.kind]);

  /**
   * A spot on road `r` out of town `p`: `along` units from the gate and
   * `lateral` off the centre line, to the right of the way out; `at` and
   * `forward` written, and false where the road is too short for it — past
   * half its length it is the next town's — or the spot is wet, in a square
   * or on a landmark.
   */
  function roadSpot(p: number, r: number, along: number, lateral: number, room: number): boolean {
    const road = roads[r]!;
    const leaving = road.a === p;
    const path = pathOf(r);
    if (along + room > path.length * 0.45) return false;
    const t = parameterAt(path, leaving ? along : path.length - along);
    courseOf(road, places, course);
    coursePoint(course, t, at);
    courseTangent(course, t, forward);
    if (!leaving) forward.negate();
    side.crossVectors(forward, at).normalize();
    at.addScaledVector(side, lateral / PLANET_RADIUS).normalize();
    forward.projectOnPlane(at).normalize();
    return !wet(at) && !inSquare(at, room) && !nearMonument(at, 0);
  }

  /** The bicycles, the motorbike, the tuk-tuk, the jeep and the bus at a town's gates. */
  function gates(p: number, out: FleetSite[]): void {
    const own = byPlace.get(p);
    if (own === undefined) return;
    const place = places[p]!;
    const region = regionOf(p);
    const rng = rngFrom('fleet-gates', p);
    const order = [...own];
    for (let i = order.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
    const cycling = CYCLING.has(place.iso);
    const bikes = cycling ? 2 + rng.int(2) : rng.chance(GATE_SHARES.bicycle[region] ?? GATE_ELSEWHERE.bicycle) ? 1 + rng.int(2) : 0;
    const motorbike = rng.chance(GATE_SHARES.motorbike[region] ?? GATE_ELSEWHERE.motorbike);
    const scooter = rng.chance(SCOOTERS[region] ?? 0);
    const tuktuk = rng.chance(GATE_SHARES.tuktuk[region] ?? GATE_ELSEWHERE.tuktuk);
    const jeep = rng.chance(JEEP_SHARE) && JEEP_BIOMES.has(biomeOf(p));
    const bus = place.pop >= BUS_POP;
    // The far verge from the lane the town's car is parked on.
    const keep = keepsLeft(place.iso) ? -1 : 1;
    let next = 0;
    const put = (model: string, along: number, verge: boolean, count = 1): void => {
      const kind = KIND_OF[model]!;
      const room = SITE_ROOM[kind];
      for (let tries = 0; tries < order.length; tries++) {
        const r = order[(next + tries) % order.length]!;
        const width = ROAD_CLASSES[roads[r]!.cls]!.width;
        const lateral = verge ? -keep * (width / 2 + VERGE + room / 2) : (keep * width) / 4;
        const spots: [THREE.Vector3, THREE.Vector3][] = [];
        for (let i = 0; i < count; i++) {
          if (!roadSpot(p, r, along + i * RACK_PITCH, lateral, room)) break;
          // A rack's bicycles stand square to the road, their fronts to the verge.
          if (verge && kind === 'bicycle') forward.copy(side).multiplyScalar(-keep);
          if (crowded(p, at, room, out)) break;
          spots.push([at.clone(), forward.clone()]);
        }
        if (spots.length === 0) continue;
        spots.forEach(([spot, facing], i) => out.push(site(model, p, i, spot, facing, r)));
        next += tries + 1;
        return;
      }
    };
    if (bikes > 0) put(FLEET_MODELS.bicycle, RACK_ALONG, true, bikes);
    if (motorbike) put(scooter ? 'scooter' : FLEET_MODELS.motorbike, MOTORBIKE_ALONG, true);
    if (tuktuk) put(FLEET_MODELS.tuktuk, TUKTUK_ALONG, false);
    if (jeep) put(FLEET_MODELS.jeep, JEEP_ALONG, false);
    if (bus) put(FLEET_MODELS.bus, BUS_ALONG, false);
  }

  /**
   * A jet ski off a warm coast's town and a sailboat off a harbour's, moored
   * near the town's launch: the launch's search has already found the nearest
   * open water, so each looks for room of its own in rings round it rather
   * than searching the coast again. A town with no launch has no water near
   * enough to moor in.
   */
  function moorings(p: number, out: FleetSite[]): void {
    const place = places[p]!;
    const launch = out.find((entry) => entry.place === p && entry.kind === 'boat');
    if (launch === undefined) return;
    const rng = rngFrom('fleet-moorings', p);
    const wants: string[] = [];
    if (Math.abs(place.lat) < JETSKI_LAT && rng.chance(JETSKI_SHARE)) wants.push(FLEET_MODELS.jetski);
    if (place.pop >= SAILBOAT_POP && rng.chance(SAILBOAT_SHARE)) wants.push(FLEET_MODELS.sailboat);
    const start = rng.unit() * Math.PI * 2;
    if (place.pop >= SUBMARINE_POP && rngFrom('fleet-submarine', p).chance(SUBMARINE_SHARE)) {
      prepareSeaFloor(world);
      const zone = seaZoneAt(latOf(launch.at.y), coastAt(launch.at.x, launch.at.y, launch.at.z, SEA_REACH, coastNear).lake);
      if (zone === 'reef' || zone === 'kelp') wants.push(FLEET_MODELS.submarine);
    }
    for (const model of wants) {
      const room = SITE_ROOM[KIND_OF[model]!];
      let found = false;
      const reach = model === FLEET_MODELS.submarine ? SUBMARINE_REACH : MOORING_REACH;
      for (let d = BOAT_ROOM + room + MOORING_GAP; d <= reach && !found; d += BOAT_STEP) {
        for (let k = 0; k < MOORING_BEARINGS && !found; k++) {
          aroundPoint(launch.at, start + (k / MOORING_BEARINGS) * Math.PI * 2, d, at);
          if (crowded(p, at, room + MOORING_GAP, out) || !roomy(at, room) || inSquare(at, room)) continue;
          if (model === FLEET_MODELS.submarine && seaDepthAt(at) < SUBMARINE_SITE_DEPTH) continue;
          outward(p, at, forward);
          out.push(site(model, p, 0, at, forward));
          found = true;
        }
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
   * and landmarks. The cheap tests go first — the neighbourhood `localise`
   * gathered — then the relief, and the dearest, the outlines under five
   * points, last and not at all for a town far inland.
   */
  function field(direction: THREE.Vector3, reach: number, grade: number, inland: boolean): boolean {
    return fieldClear(direction, reach) && fieldGround(direction, reach, grade, inland);
  }

  /** `field`'s cheap half: clear of the landmarks, towns and roads `active` holds. */
  function fieldClear(direction: THREE.Vector3, reach: number): boolean {
    if (nearMonumentLocal(direction, reach) || nearTownLocal(direction, reach + FIELD_CLEAR)) return false;
    return !nearRoadLocal(direction, reach + FIELD_CLEAR);
  }

  /** `field`'s dear half: the relief, then the outlines. */
  function fieldGround(direction: THREE.Vector3, reach: number, grade: number, inland: boolean): boolean {
    north.set(0, 1, 0).projectOnPlane(direction);
    if (north.lengthSq() < 1e-8) north.set(1, 0, 0).projectOnPlane(direction);
    north.normalize();
    across.crossVectors(direction, north).normalize();
    if (gradeAt(direction, across, north, reach, slope).grade > grade) return false;
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
  const stripAcross = new THREE.Vector3();
  /** A stand's headings, worked out once for both passes over them. */
  const headings = Array.from({ length: STRIP_HEADINGS }, () => new THREE.Vector3());
  /** A strip's samples, in `STRIP_ORDER`, laid again by each half of its tests. */
  const stripSamples = Array.from({ length: STRIP_SAMPLES }, () => new THREE.Vector3());

  /**
   * The strip from a stand at `strip.at` down `strip.forward` has to be flat
   * enough over its own width, clear of the towns, the roads and the
   * landmarks, and — unless the town is `inland` — on land from edge to edge.
   * The samples go in `STRIP_ORDER`, and each test over all of them before
   * the next, the cheap ones first: the towns, roads and landmarks
   * `localise` and `narrow` gathered (`stripNear`), then the relief, four
   * samples of it a point, then the outlines (`stripGround`). A strip passes
   * only if every test passes at every sample, so the order changes what a
   * strip costs and never whether it passes. The water is walked again at
   * `STRIP_WATER_STEP` once everything else has passed, because a creek or a
   * fjord is narrower than the gap between two samples.
   *
   * A strip's cheap half: every sample clear of the landmarks, towns and roads `active` holds.
   */
  function stripNear(): boolean {
    const clear = STRIP_HALF + STRIP_CLEAR;
    for (let n = 0; n < STRIP_SAMPLES; n++) {
      const point = stripPoint(strip, STRIP_ALONG[n]!, 0, stripSamples[n]!);
      if (nearMonumentLocal(point, STRIP_HALF) || nearTownLocal(point, clear) || nearRoadLocal(point, clear)) return false;
    }
    return true;
  }

  /** A strip's dear half: the relief under every sample, then the outlines. */
  function stripGround(inland: boolean): boolean {
    stripAcross.crossVectors(strip.forward, strip.at).normalize();
    for (let n = 0; n < STRIP_SAMPLES; n++) stripPoint(strip, STRIP_ALONG[n]!, 0, stripSamples[n]!);
    for (let n = 0; n < STRIP_SAMPLES; n++) {
      if (gradeAt(stripSamples[n]!, stripAcross, strip.forward, STRIP_HALF, slope).grade > PLANE_GRADE) return false;
    }
    if (inland) return true;
    for (let n = 0; n < STRIP_SAMPLES; n++) {
      const along = STRIP_ALONG[n]!;
      if (wet(stripSamples[n]!) || wet(stripPoint(strip, along, STRIP_HALF, corner)) || wet(stripPoint(strip, along, -STRIP_HALF, corner))) return false;
    }
    for (let along = -STRIP_BACK; along <= STRIP_LENGTH; along += STRIP_WATER_STEP) {
      for (let edge = -1; edge <= 1; edge++) if (wet(stripPoint(strip, along, edge * STRIP_HALF, corner))) return false;
    }
    return true;
  }

  /** Whether a field at `spot` of `reach` crosses one this town already has: a strip's discs, or another field's room. */
  function fieldTaken(spot: THREE.Vector3, reach: number, taken: readonly FleetSite[]): boolean {
    for (const other of taken) {
      if (other.kind === 'plane') {
        for (const disc of discsOf(other)) if (disc.at.angleTo(spot) * PLANET_RADIUS < disc.radius + reach) return true;
      } else if (other.at.angleTo(spot) * PLANET_RADIUS < SITE_ROOM[other.kind] + reach + FIELD_CLEAR) return true;
    }
    return false;
  }

  const corners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  /** What a strip that has to search again keeps off: see `planeOf`. */
  interface StripRivals {
    /** The middle of the town's own free strip. */
    own: THREE.Vector3;
    /** Its neighbours' free strips, and their middles. */
    strips: readonly FleetSite[];
    middles: readonly THREE.Vector3[];
  }
  /**
   * Whether the strip being tried (`strip`) crosses into what `rivals` keep:
   * whether it meets any of their free strips, `STRIP_HALF` of ground either
   * side of each, or any corner of it is nearer one of their middles than its
   * own town's — outside its cell of the Voronoi diagram of those middles,
   * which is convex on the sphere, so a strip whose four corners are in it is
   * in it whole.
   */
  function stripTaken(rivals: StripRivals | null): boolean {
    if (rivals === null) return false;
    stripCorners(strip, STRIP_HALF, corners);
    for (const corner of corners) {
      const mine = corner.dot(rivals.own);
      for (const other of rivals.middles) if (corner.dot(other) > mine) return true;
    }
    for (const other of rivals.strips) {
      if (other.at.angleTo(strip.at) * PLANET_RADIUS < STRIP_MEET && stripsMeet(strip, other, STRIP_HALF)) return true;
    }
    return false;
  }

  /**
   * Which candidate the last plane search found, counted in the order it
   * tries them: ring, bearing, heading. -1 if none.
   */
  let foundAt = -1;

  /**
   * `from` skips every plane candidate before it, and `more`, when given, is
   * asked before every stand after the first whether to go on: the search
   * returns the candidate it stopped before, to be taken up there later
   * (`advanceFree`, `advanceFinal`), or `PLANE_CANDIDATES` once it has
   * tried them all or found one (`foundAt`). A candidate's tests are its own,
   * so a search in pieces finds what a search at once does. And a search
   * again (`advanceFinal`) starts where the town's free search stopped,
   * because every candidate before that failed a test that has nothing to
   * do with the other towns' strips, and would fail it again.
   */
  function fieldSite(
    p: number,
    model: string,
    reach: number,
    grade: number,
    salt: string,
    out: FleetSite[],
    n = 0,
    rivals: StripRivals | null = null,
    from = 0,
    more?: () => boolean,
  ): number {
    const radius = radiusOf(places[p]!);
    const start = rngFrom(salt, p).unit() * Math.PI * 2;
    const plane = model === FLEET_MODELS.plane;
    const rings = plane ? PLANE_RINGS : FIELD_RINGS;
    const inland = inlandFor(p);
    // The furthest point any test below asks about: the last ring's stand, and
    // for a plane the strip's far end down any heading from it.
    const clear = clearFor(reach);
    localise(p, radius + reach + FIELD_CLEAR + 4 + (rings - 1) * FIELD_STEP + (plane ? STRIP_LENGTH : 0) + 1, clear);
    foundAt = -1;
    let stands = 0;
    for (let j = 0; j < rings; j++) {
      const d = radius + reach + FIELD_CLEAR + 4 + j * FIELD_STEP;
      for (let k = 0; k < FIELD_BEARINGS; k++) {
        const first = (j * FIELD_BEARINGS + k) * STRIP_HEADINGS;
        if (plane && first + STRIP_HEADINGS <= from) continue;
        if (stands++ > 0 && more !== undefined && !more()) return Math.max(first, from);
        around(p, start + (k / FIELD_BEARINGS) * Math.PI * 2, d, at);
        // The kinds that came after the plane and the balloon keep off their ground.
        if (!plane && model !== FLEET_MODELS.balloon && fieldTaken(at, reach, out)) continue;
        active = local;
        if (!plane) {
          if (!field(at, reach, grade, inland)) continue;
          // Facing away from the town, which is the way a take-off goes.
          outward(p, at, forward);
          out.push(site(model, p, n, at, forward));
          return PLANE_CANDIDATES;
        }
        // A plane's stand is only as good as the strip it can take off down:
        // straight out of the town first, then swinging either side of that
        // by a sixteenth of a turn at a time, to straight back past it.
        //
        // A candidate is the stand's field and one heading's strip, and it
        // passes only if every test does, so the tests go cheapest first
        // across all of the stand's headings: the towns, roads and landmarks
        // under the field and every strip, then the relief and the outlines
        // under the field, then under each strip still standing, in order.
        // The first candidate to pass is the one the tests in any order find.
        if (!fieldClear(at, reach)) continue;
        outward(p, at, forward);
        strip.at.copy(at);
        // Every sample of every heading is within a strip's length of the stand.
        narrow(at, STRIP_LENGTH + 1, clear);
        let open = 0;
        for (let h = 0; h < STRIP_HEADINGS; h++) {
          if (first + h < from) continue;
          const turn = Math.ceil(h / 2) * (h % 2 === 1 ? 1 : -1) * ((Math.PI * 2) / STRIP_HEADINGS);
          const heading = headings[h]!.copy(forward).applyAxisAngle(at, turn).projectOnPlane(at).normalize();
          strip.forward.copy(heading);
          if (stripTaken(rivals) || !stripNear()) continue;
          open |= 1 << h;
        }
        if (open === 0 || !fieldGround(at, reach, grade, inland)) continue;
        for (let h = 0; h < STRIP_HEADINGS; h++) {
          if ((open & (1 << h)) === 0) continue;
          strip.forward.copy(headings[h]!);
          if (!stripGround(inland)) continue;
          out.push(site(model, p, 0, at, strip.forward));
          foundAt = first + h;
          return PLANE_CANDIDATES;
        }
      }
    }
    return PLANE_CANDIDATES;
  }

  const keepsPlane = (p: number): boolean => shown[p]! && (places[p]!.pop >= PLANE_POP || places[p]!.capital === true);
  /** The middle of each plane town's free strip, or null where it has none; worked out once. */
  const freeMiddles: (THREE.Vector3 | null | undefined)[] = new Array(places.length);
  const freeSites: (FleetSite | null | undefined)[] = new Array(places.length);
  /** Which candidate each free search found (`foundAt`). */
  const freeFound: number[] = new Array(places.length).fill(-1);
  /** Where each free search not yet finished is to be taken up. */
  const freeNext: number[] = new Array(places.length).fill(0);

  /**
   * Take town `p`'s free search on, to its end or until `more()` says stop:
   * true once it has ended, with `freeSites[p]` its strip or null.
   */
  function advanceFree(p: number, more?: () => boolean): boolean {
    if (freeSites[p] !== undefined) return true;
    const out: FleetSite[] = [];
    const next = fieldSite(p, FLEET_MODELS.plane, PLANE_FIELD, PLANE_GRADE, 'fleet-plane', out, 0, null, freeNext[p]!, more);
    if (out.length === 0 && next < PLANE_CANDIDATES) {
      freeNext[p] = next;
      return false;
    }
    const found = out[0] ?? null;
    freeFound[p] = foundAt;
    freeMiddles[p] = found === null ? null : stripPoint(found, STRIP_LENGTH / 2, 0, new THREE.Vector3());
    freeSites[p] = found;
    return true;
  }

  /** The strip a town would lay with no other town's to keep off: the search alone. */
  function freeStrip(p: number): FleetSite | null {
    advanceFree(p);
    return freeSites[p]!;
  }

  /** The plane towns whose strips could meet town `p`'s, and a little more: each use tests its own bound. */
  const neighbours: (number[] | undefined)[] = new Array(places.length);
  function neighboursOf(p: number): readonly number[] {
    let list = neighbours[p];
    if (list === undefined) {
      const reach = stripReach(p);
      list = townsNear(centres[p]!, reach + stripReach(-1) + 1, []).filter(
        (q) => q !== p && keepsPlane(q) && centres[q]!.angleTo(centres[p]!) * PLANET_RADIUS <= reach + stripReach(q) + 1,
      );
      neighbours[p] = list;
    }
    return list;
  }

  /**
   * The furthest any corner of town `p`'s strip can stand from its centre:
   * its square, the last ring a stand is searched on and the strip run out
   * from there. -1 is the widest square's, for a search round a town.
   */
  const stripReach = (p: number): number =>
    (p < 0 ? 150 : radiusOf(places[p]!)) + PLANE_FIELD + FIELD_CLEAR + 4 + (PLANE_RINGS - 1) * FIELD_STEP + Math.hypot(STRIP_LENGTH + 4, STRIP_HALF) + 1;

  /**
   * Whether town `q` outranks town `p`: the bigger, and between two of a size
   * the one earlier in `places`. A strict order of the places alone.
   */
  const outranks = (q: number, p: number): boolean => places[q]!.pop > places[p]!.pop || (places[q]!.pop === places[p]!.pop && q < p);

  /**
   * A town's plane and its strip, or nothing where none fits. **No two strips
   * meet**: two drawn over each other are two surfaces at one depth, and they
   * flickered where they crossed — 575 pairs of the 1,004 strips on
   * 2026-09-28, mostly where the flat ground round a delta drew a dozen
   * cities' strips to one field. Every plane town first finds the strip it
   * would lay alone (`freeStrip`), and then, against its neighbours' — every
   * plane town near enough for two strips to meet:
   *
   * - **it keeps its free strip if that meets no bigger town's free strip**.
   *   Two kept strips never meet, because of any two that did the smaller
   *   would not have been kept.
   * - **Otherwise it searches again**, off every neighbour's free strip — so
   *   off every kept one — and inside its own cell of the Voronoi diagram of
   *   the free strips' middles, which no other town that searches again can
   *   enter (`stripTaken`); and it goes without a plane where nothing fits.
   *
   * A rule of the places alone, and a local one: a town asks only its
   * neighbours' free strips, never their final ones. It keeps 744 of the
   * 1,004 strips. Yielding to the bigger towns' final strips, the obvious
   * rule, kept 895 but had to work out a whole region's of them for one cold
   * tile — 0.3 s at the median and 2.6 s at worst — and a cell round each
   * town's centre kept 555, because a strip stands up to 700 units out of its
   * town. This one still works out the free strips of every plane town within
   * two strips' reach of a cold ask, which is why the fleet warms them up
   * ahead of the player (`warm`, `WARM_REACH`).
   */
  function planeOf(p: number, out: FleetSite[]): void {
    advanceFinal(p);
    const plane = finals[p];
    if (plane !== null && plane !== undefined) out.push(plane);
  }

  /** Each plane town's strip as it stands, or null; worked out once. */
  const finals: (FleetSite | null | undefined)[] = new Array(places.length);
  /** A beaten town's rivals and where its search again is to be taken up, while it is unfinished. */
  const again: (StripRivals | undefined)[] = new Array(places.length);
  const againNext: number[] = new Array(places.length).fill(0);

  /**
   * Take town `p`'s strip on to its end or until `more()` says stop, as
   * `advanceFree` does its free one: true once `finals[p]` is settled. The
   * neighbours' free strips it asks are worked out on the spot, whole.
   */
  function advanceFinal(p: number, more?: () => boolean): boolean {
    if (finals[p] !== undefined) return true;
    const free = keepsPlane(p) ? freeStrip(p) : null;
    if (free === null) {
      finals[p] = null;
      return true;
    }
    let rivals = again[p];
    if (rivals === undefined) {
      if (!beaten(p, free)) {
        finals[p] = free;
        return true;
      }
      // Beaten: every neighbour's free strip, and every one's middle.
      const strips: FleetSite[] = [];
      const middles: THREE.Vector3[] = [];
      for (const q of neighboursOf(p)) {
        if (centres[q]!.angleTo(centres[p]!) * PLANET_RADIUS > stripReach(p) + stripReach(q)) continue;
        const theirs = freeStrip(q);
        if (theirs === null) continue;
        strips.push(theirs);
        middles.push(freeMiddles[q]!);
      }
      again[p] = rivals = { own: freeMiddles[p]!, strips, middles };
      againNext[p] = freeFound[p]!;
    }
    const out: FleetSite[] = [];
    const next = fieldSite(p, FLEET_MODELS.plane, PLANE_FIELD, PLANE_GRADE, 'fleet-plane', out, 0, rivals, againNext[p]!, more);
    if (out.length === 0 && next < PLANE_CANDIDATES) {
      againNext[p] = next;
      return false;
    }
    finals[p] = out[0] ?? null;
    again[p] = undefined;
    return true;
  }

  /**
   * Whether town `p`'s free strip meets a bigger town's. Only the bigger
   * towns decide, and only those whose strip's corners reach as far as its
   * own do (`stripReach` of theirs, and this strip's middle plus its
   * half-diagonal): so a town works out no smaller neighbour's strip unless
   * it has to search again.
   */
  function beaten(p: number, free: FleetSite): boolean {
    const centre = centres[p]!;
    const spread = freeMiddles[p]!.angleTo(centre) * PLANET_RADIUS + STRIP_HALF_DIAGONAL;
    for (const q of townsNear(centre, spread + stripReach(-1), [])) {
      if (q === p || !keepsPlane(q) || !outranks(q, p) || centres[q]!.angleTo(centre) * PLANET_RADIUS > spread + stripReach(q)) continue;
      const theirs = freeStrip(q);
      if (theirs !== null && theirs.at.angleTo(free.at) * PLANET_RADIUS < STRIP_MEET && stripsMeet(free, theirs, STRIP_HALF)) return true;
    }
    return false;
  }

  const perPlace: (readonly FleetSite[] | undefined)[] = new Array(places.length);
  const fieldsPer: (readonly FleetSite[] | undefined)[] = new Array(places.length);
  const counts = { ...(Object.fromEntries(CRAFT_KINDS.map((kind) => [kind, 0])) as Record<CraftKind, number>), towns: 0 };
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
    planeOf(p, out);
    if (keepsBalloon(p)) fieldSite(p, FLEET_MODELS.balloon, BALLOON_FIELD, BALLOON_GRADE, 'fleet-balloon-site', out);
    // The rest of the fields, after those two so neither moves for them.
    if (place.pop >= HELI_POP) fieldSite(p, FLEET_MODELS.helicopter, SITE_ROOM.helicopter, HELI_GRADE, 'fleet-heli-site', out);
    if (place.pop < HORSE_POP || place.pop < TRACTOR_POP) {
      const biome = biomeOf(p);
      const rng = rngFrom('fleet-farm', p);
      if (place.pop < HORSE_POP && rng.chance(HORSE_BIOMES[biome] ?? 0)) {
        fieldSite(p, FLEET_MODELS.horse, SITE_ROOM.horse, HORSE_GRADE, 'fleet-horse-site', out);
        if (rng.chance(HORSE_SECOND)) fieldSite(p, FLEET_MODELS.horse, SITE_ROOM.horse, HORSE_GRADE, 'fleet-horse-second', out, 1);
      }
      if (place.pop < TRACTOR_POP && rng.chance(TRACTOR_BIOMES[biome] ?? 0)) fieldSite(p, FLEET_MODELS.tractor, SITE_ROOM.tractor, TRACTOR_GRADE, 'fleet-tractor-site', out);
    }
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
    gates(p, out);
    moorings(p, out);
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
          const room = SITE_ROOM[entry.kind];
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
      townsNear(direction, radius + SITE_SPREAD, nearTowns);
      // With a limit on the towns worked out for the first time, the nearest
      // first: in the grid's order a region arrived in filled from its
      // north-west corner, and the town under the player could wait a few
      // scans behind a dozen further off.
      if (fresh !== Infinity) nearTowns.sort((a, b) => centres[b]!.dot(direction) - centres[a]!.dot(direction) || a - b);
      for (const p of nearTowns) {
        if (perPlace[p] === undefined) {
          if (fresh <= 0) continue;
          fresh--;
        }
        out.push(...sitesOf(p));
      }
      return out;
    },
    warm(direction, radius, more) {
      const towns = townsNear(direction, radius, []).filter((q) => keepsPlane(q) && fieldsPer[q] === undefined);
      if (towns.length === 0) return true;
      const distance = towns.map((q) => centres[q]!.dot(direction));
      const order = towns.map((_, i) => i).sort((a, b) => distance[b]! - distance[a]! || towns[a]! - towns[b]!);
      // Nearest first, each in pieces a stand long: its own free strip and its
      // neighbours', which its own strip asks, then its own strip, then the
      // rest of its fields.
      for (const i of order) {
        const q = towns[i]!;
        if (!advanceFree(q, more)) return false;
        for (const r of neighboursOf(q)) if (!advanceFree(r, more)) return false;
        if (!advanceFinal(q, more)) return false;
        if (!more()) return false;
        fieldsOf(q);
      }
      return true;
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

/**
 * Where a vehicle's wheels are, as a fraction of its half length and half
 * width: a model's size is its bumpers and mirrors, and its tyres stand a
 * little inside them.
 */
const WHEEL_INSET = 0.8;
/** The steepest a vehicle is set down at, as rise over run: past it, it sits at this and a corner floats. */
const SEAT_GRADE = 0.6;
/** What stands on two points along its length, and so takes the ground's pitch and never its roll. */
const IN_LINE: ReadonlySet<CraftKind> = new Set<CraftKind>(['bicycle', 'motorbike', 'horse']);

const seatDir = new THREE.Vector3();
const seatForward = new THREE.Vector3();
const seatSide = new THREE.Vector3();
const seatUp = new THREE.Vector3();
const seatCorner = new THREE.Vector3();
const seatHeights = [0, 0, 0, 0];

/**
 * **A vehicle set down on the ground under its wheels**, not on the ground
 * under its middle: `pose`'s point and forward in, its seated pose into `out`
 * (which may be `pose`).
 *
 * The ground is asked under four wheels — `WHEEL_INSET` of the half length and
 * half width out — and the plane through them tilts the vehicle: its pitch
 * from the axles, its roll from the sides. The four do not have to be one
 * plane, and the one they are fitted to is raised by the most any wheel is
 * under it, so every wheel is on the ground or over it and one is on it. Set
 * down level on its middle, a car on a hillside had its uphill wheels buried
 * and its downhill ones in the air, and on a crest all four.
 *
 * A two-wheeler and a horse take the pitch only, on two points; a balloon's
 * basket stands upright on the highest of the four; a hull is left on the water.
 * `groundAt` is the surface the kind stands on, as a radius. The basis is
 * `X = Y x Z` as `applyPose` builds it, whatever the slope, so it is never
 * a reflection.
 */
export function seatPose(
  pose: WirePose,
  size: readonly [number, number, number],
  kind: CraftKind,
  groundAt: (point: THREE.Vector3) => number,
  out: WirePose,
): WirePose {
  for (let i = 0; i < 9; i++) out[i] = pose[i]!;
  if (AFLOAT.has(kind)) return out;
  seatDir.set(pose[0]!, pose[1]!, pose[2]!).normalize();
  seatForward.set(pose[3]!, pose[4]!, pose[5]!).projectOnPlane(seatDir);
  if (seatForward.lengthSq() < 1e-12) return out;
  seatForward.normalize();
  // Screen right: forward x up.
  seatSide.crossVectors(seatForward, seatDir).normalize();
  const length = (size[0] / 2) * WHEEL_INSET;
  const width = IN_LINE.has(kind) ? 0 : (size[1] / 2) * WHEEL_INSET;
  let radius = 0;
  let pitch = 0;
  let roll = 0;
  // Twice: a wheel `length` out along a pitched body stands nearer than that
  // over the ground, so the second pass asks the ground where the first
  // pass's wheels are.
  for (let pass = 0; pass < 2; pass++) {
    const along = length / Math.sqrt(1 + pitch * pitch);
    const across = width / Math.sqrt(1 + roll * roll);
    // Front right, front left, back right, back left.
    let k = 0;
    for (const f of [1, -1]) {
      for (const r of [1, -1]) {
        seatCorner
          .copy(seatDir)
          .addScaledVector(seatForward, (f * along) / PLANET_RADIUS)
          .addScaledVector(seatSide, (r * across) / PLANET_RADIUS)
          .normalize()
          .multiplyScalar(PLANET_RADIUS);
        seatHeights[k++] = groundAt(seatCorner);
      }
    }
    const [fr, fl, br, bl] = seatHeights as [number, number, number, number];
    if (kind === 'balloon') {
      radius = Math.max(fr, fl, br, bl);
      break;
    }
    const mean = (fr + fl + br + bl) / 4;
    pitch = along > 0 ? Math.max(-SEAT_GRADE, Math.min(SEAT_GRADE, (fr + fl - br - bl) / (4 * along))) : 0;
    roll = across > 0 ? Math.max(-SEAT_GRADE, Math.min(SEAT_GRADE, (fr + br - fl - bl) / (4 * across))) : 0;
    // The plane through the middle, raised until no wheel is under the ground.
    let lift = -Infinity;
    k = 0;
    for (const f of [1, -1]) {
      for (const r of [1, -1]) {
        const plane = mean + pitch * f * along + roll * r * across;
        lift = Math.max(lift, seatHeights[k++]! - plane);
      }
    }
    radius = mean + lift;
  }
  // The ground's plane rises `pitch` a unit forward and `roll` a unit right,
  // so its normal leans back and left of the radius by as much.
  seatUp.copy(seatDir).addScaledVector(seatForward, -pitch).addScaledVector(seatSide, -roll).normalize();
  seatForward.addScaledVector(seatDir, pitch).projectOnPlane(seatUp).normalize();
  seatDir.multiplyScalar(radius);
  return writePose(seatDir, seatForward, seatUp, out);
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
    sink(vehicle) {
      if (!entries.delete(vehicle)) return;
      moved.delete(vehicle);
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
/**
 * The most vehicles standing at once, and how much nearer than the furthest
 * of them one has to be to take its place.
 *
 * **The cap used to be a wall rather than a rank.** The build loop stopped at
 * `MAX_BUILT` and a vehicle stood until it left `KEEP`, so in a crowded region
 * the 36 built on arrival held their places while the player went past them
 * and a vehicle ahead waited for one behind to fall 805 units away. Round
 * Utrecht, the Ruhr or Zhengzhou, with 200 to 250 sites inside `REACH`, a
 * vehicle at a gate came into being 7 units off the player, or never, and was
 * driven into: run straight at 72 sites in nine regions at a motorbike's
 * boost, 14 stood under 100 units off and the nearest arrival of anything was
 * 7 (headless, 2026-09-29). Now the furthest standing gives its place to one
 * nearer by `ROOM_MARGIN` — the scan's own staleness, `RESCAN_MOVE`, so two
 * never trade places back and forth — and the same runs stood every one at
 * 176 units or more, nothing arriving nearer than 114. It builds about twice
 * as many vehicles a minute on such a run; `pnpm fleet` holds it.
 */
const MAX_BUILT = 36;
const ROOM_MARGIN = 40;
/** Milliseconds of building a frame may give this streamer. */
const BUILD_MS = 2;
/**
 * The airstrips round the player, worked out ahead of the first ask
 * (`SiteIndex.warm`): how far, how much of a frame's far allowance, and how
 * far the player moves before a finished warm-up looks again. A cold ask in
 * eastern China, where the plane towns are thickest, works out the strips of
 * about 170 of them — 130 ms at worst headless on 2026-09-28 — and one after
 * the warm-up 3.3 ms at worst, while no piece of the warm-up took more than
 * 7 ms: it goes a stand of one town's search at a time, nearest town first.
 */
const WARM_REACH = 3000;
const WARM_MS = 1;
const WARM_MOVE = 250;
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
 * ground and is walked under. A helicopter's is its cabin and boom, a share of
 * its width and its length: the rotor over them is walked under too.
 */
const BALLOON_WALL = 0.2;
const HELI_WALL: readonly [number, number] = [0.08, 0.36];

/** A vehicle standing as a wall: the half-width and half-length of the box a body is pushed out of. */
function wallOf(model: CraftModel): [number, number] {
  const [length, width] = model.size;
  if (model.kind === 'balloon') return [width * BALLOON_WALL, length * BALLOON_WALL];
  if (model.kind === 'helicopter') return [width * HELI_WALL[0], length * HELI_WALL[1]];
  return [width / 2, length / 2];
}

/** What `E` is offered as at the driver's seat of each kind. */
function takeLabel(kind: CraftKind): Prompt['label'] {
  if (kind === 'bicycle' || kind === 'motorbike' || kind === 'horse' || kind === 'jetski') return 'Ride';
  if (kind === 'plane' || kind === 'helicopter' || kind === 'balloon') return 'Fly';
  if (kind === 'sailboat') return 'Sail';
  return 'Drive';
}
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

/**
 * What happened, for whoever tells the player: `bailed` is getting out of a
 * vehicle under way or aloft, which goes on without him; `wrecked` is one of
 * those coming down hard, or into a wall, with where it happened;
 * `foundered` is one of them meeting the water, and `sank` any vehicle going
 * under it (`FOUNDER_TIME`), with where — the one driven in too, whose body
 * is put out swimming.
 */
export type FleetEvent = 'boarded' | 'left' | 'taken' | 'leave-refused' | 'bailed' | 'wrecked' | 'foundered' | 'sank';

/**
 * A vehicle somebody jumped out of, going on without anybody. A car, a boat
 * or a horse runs on and slows — its handling's own coast, and `COAST_DRAG`
 * units a second squared of friction under it, so it stops rather than
 * creeping for ever — until under `COAST_STOP` it parks where it is; a road
 * vehicle stops at the water's edge and a hull at the land's, and a wall turns
 * it back at `COAST_BOUNCE` of its speed. An aircraft glides on: a plane down
 * at a slope of one in `GLIDE_RATIO`, a helicopter at `HELI_FALL` and a
 * balloon at `BALLOON_FALL`, slowing; down, it rolls to a stop, and down
 * faster than `WRECK_SPEED` it comes down in a puff (`wrecked`). The one
 * who got out keeps its driver's seat on the link until it parks, and tells
 * the link where it is every frame, so every client sees it go on.
 */
const COAST_DRAG = 3;
const COAST_STOP = 0.4;
const COAST_BOUNCE = 0.3;
/** Seconds a vehicle may go on alone before it is parked where it has got to. */
const COAST_MAX = 60;
/** The pull on a vehicle off the ground, units a second squared. */
const COAST_GRAVITY = 30;
const GLIDE_RATIO = 7;
const HELI_FALL = 14;
const BALLOON_FALL = 3;
const WRECK_SPEED = 12;
/** A wall met faster than this is a knock worth a puff. */
const KNOCK_SPEED = 15;

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
    /**
     * The colour a parked vehicle was parked in, by its id alone: the vehicle
     * that takes its place, here or on another client, is painted the same
     * rather than in a colour of its own. Null for the craft's own look.
     */
    paintOf?(id: string): number | null;
  };
  onEvent?: (event: FleetEvent, model: CraftModel | null, at?: THREE.Vector3) => void;
  /**
   * The walls a vehicle nobody is driving meets as it goes on (`settlements.collide`'s
   * contract, as the player's own). Omit it and nothing stops one but the water.
   */
  collide?: (point: THREE.Vector3, radius: number, push: THREE.Vector3) => boolean;
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
  /** What `E` does: drive it, ride it, fly it, sail it, or take a passenger's seat. */
  label: 'Drive' | 'Ride' | 'Fly' | 'Sail' | 'Get in';
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
  /**
   * The nearest spot clear of every vehicle standing here, at the same
   * radius, into `out`; false if `point` already is. `settlements.freeSpotNear`'s
   * contract, so a body put down by a jump, a spawn or another source's free
   * spot is not left inside a car.
   */
  freeSpotNear(point: THREE.Vector3, radius: number, out: THREE.Vector3): boolean;
  /**
   * Every vehicle standing here that the player is not in, as its centre and
   * a radius along the ground — half its length and width averaged, a
   * balloon's basket — for the traffic to stop for (`InTheWay` in `life.ts`).
   * Nothing is allocated.
   */
  eachStanding(visit: (at: THREE.Vector3, radius: number, player: boolean) => void): void;
  /**
   * Whether any vehicle a player has moved — drawn here or not — stands with
   * its footprint within `radius` of the ground under `direction`: for a herd,
   * which keeps off a plane left in its field.
   */
  movedNear(direction: THREE.Vector3, radius: number): boolean;
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
  /** Its model, variant and paint, which is what a spare is kept and found by. */
  key: string;
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
  /**
   * What streams in and out dissolves (`fade.ts`), as a town or a wood tile
   * does; a vehicle put away is no longer a wall the moment it goes, and is
   * drawn until its fade ends.
   */
  const fader = createFader();
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
  /** Where the warm-up last finished everything in its reach; it rests until the player moves on. */
  const warmed = new THREE.Vector3(Infinity, 0, 0);
  const warmAt = new THREE.Vector3();
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
  /**
   * The colour each vehicle a town parks was parked in, by id: a function of
   * the id alone (`ParkedCar.paint`), so a car taken in another session, by
   * somebody else, or from a town not standing here comes back in it. Null,
   * kept as such, for the craft's own look.
   */
  const paints = new Map<string, number | null>();
  function paintOf(id: string): number | undefined {
    let known = paints.get(id);
    if (known === undefined) {
      known = parked?.paintOf?.(id) ?? null;
      paints.set(id, known);
    }
    return known ?? undefined;
  }
  /** What `eachDriven` walks: rewritten by every `update`, never reallocated. */
  const drivenNow: Drawn[] = [];
  const bays: ParkedCar[] = [];
  const localPoint = new THREE.Vector3();
  const free = new THREE.Vector3();
  const freePush = new THREE.Vector3();
  const inverse = new THREE.Quaternion();
  const heading = new THREE.Vector3();
  const turned = new THREE.Vector3();
  /** What another player's vehicle's motion is handed, rewritten every frame. */
  const remote: MotionInput = { ...AT_REST };

  /** The vehicle going on without anybody, if one is: see `COAST_DRAG`. */
  interface Coast {
    entry: Drawn;
    position: THREE.Vector3;
    forward: THREE.Vector3;
    speed: number;
    /** Units a second away from the planet's centre. */
    vertical: number;
    age: number;
    /** Aloft when it was let go of, and not yet down. */
    flying: boolean;
    /** Seconds since it met the water, if it is not a boat (`founders`); -1 until then. */
    sinking: number;
  }
  let coast: Coast | null = null;
  const sunkAt = new THREE.Vector3();
  const sinkSide = new THREE.Vector3();
  const coasting: MotionInput = { ...AT_REST };
  const coastFrom = new THREE.Vector3();
  const coastAxis = new THREE.Vector3();
  const coastPush = new THREE.Vector3();
  const coastPose: WirePose = new Array(9).fill(0);

  // ---- the airstrips -------------------------------------------------------

  const strips = new Map<string, DrawnStrip>();
  /** The plane sites near enough to have their strip drawn, nearest first; rewritten by every scan. */
  let stripsWanted: { site: FleetSite; distance: number }[] = [];
  const planeSites: FleetSite[] = [];
  /**
   * The drawn land round the player: the one probe of the mesh, which the loop
   * keeps gathered while the player is near the ground (`land-probe.ts`).
   */
  const probe = options.land === undefined ? null : landProbeOf(options.land);
  const stripColour = new THREE.Color();
  const stripGround = new THREE.Color();
  const stripBiome = biomeSample();
  const stripPose: WirePose = new Array(9).fill(0);
  let clock = 0;

  /** The drawn land's radius under a point, or the relief's where the index does not reach. */
  const landAt = (at: THREE.Vector3): number => drawnRadius(world, probe, at);
  /** The same along a direction. */
  const surface = (direction: THREE.Vector3): number => landAt(point.copy(direction).multiplyScalar(PLANET_RADIUS));
  /** What a wheel stands on: the land, or a road or a town's floor over it. */
  const standingAt = (at: THREE.Vector3): number => {
    const land = landAt(at);
    const made = madeHeightAt?.(at) ?? 0;
    return made > land ? made : land;
  };

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
      // Gathered a slice a frame; the strips wait for it rather than lie on the relief.
      if (probe !== null && !probe.prepare(player.position)) break;
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
    // Gone home from under a passenger — its driver drove it into the water
    // and it sank (`FleetLink.sink`): the seat is gone and so is where it
    // was, and the passenger is put out where the link last had it, which is
    // in the water.
    if (held !== null && held.id === vehicle && heldSeat !== 0 && player.ride !== null) {
      const now = link.moved.get(vehicle);
      if ((now?.seats[heldSeat] ?? null) !== link.self && !isPose(now?.pose)) {
        leave();
        const gone = drawn.get(vehicle);
        if (gone !== undefined) {
          drawn.delete(vehicle);
          retire(gone);
        }
      }
    }
  });

  /**
   * A vehicle set down where it stands (`seatPose`): on the land for a craft
   * that flies, on whatever is made over it for anything on wheels or legs.
   */
  function seat(model: CraftModel, from: WirePose, out: WirePose): WirePose {
    return seatPose(from, model.size, model.kind, isAirKind(model.kind) ? landAt : standingAt, out);
  }

  /**
   * Where a site's vehicle stands: its origin on the surface its kind stands
   * on, seated on it by its wheels unless `level` — for `nearest`, which wants
   * only where it is and asks it of every site for thousands of units round.
   */
  function sitePose(site: FleetSite, out: WirePose, level = false): WirePose {
    let radius: number;
    point.copy(site.at).multiplyScalar(PLANET_RADIUS);
    if (AFLOAT.has(site.kind)) radius = PLANET_RADIUS + WATERLINE;
    else {
      radius = landAt(point);
      if (!isAirKind(site.kind)) {
        point.setLength(radius);
        radius = Math.max(radius, madeHeightAt?.(point) ?? 0);
      }
    }
    point.copy(site.at).multiplyScalar(radius);
    writePose(point, site.forward, up.copy(site.at), out);
    const model = level || AFLOAT.has(site.kind) ? undefined : models.get(site.model);
    return model === undefined ? out : seat(model, out, out);
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
    const variant = fleetVariant(id, model.variants);
    const paint = site === null ? paintOf(id) : undefined;
    const key = paint === undefined ? `${model.id}#${variant}` : `${model.id}#${variant}@${paint}`;
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
    const built = model.build(variant, paint);
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
      // Astride, the grip and the footrests too, and the crank a body's feet go round.
      frame.userData.seat = seat;
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
    for (const frame of seats) frame.userData.motion = motion;
    return {
      id,
      model,
      variant,
      key,
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
    const handling = ROAD_HANDLING[kind];
    if (handling !== undefined) {
      const grip = Math.max(handling.pivot, Math.min(1, pace / handling.gripSpeed));
      const lock = 1 + (handling.fastLock - 1) * Math.min(1, pace / handling.boost);
      const reach = handling.turn * grip * lock;
      if (reach > 1e-3) remote.steering = Math.max(-1, Math.min(1, (-entry.turn / reach) * (entry.speed < 0 ? -1 : 1)));
    }
    // On the ground unless it flies, or its rider's own state is off it: a
    // horse's leap is the driver's jump, which the pose alone cannot tell
    // from a step off a terrace.
    remote.grounded = isAirKind(kind) ? point.length() - landAt(point) < 1.5 : !(link.leaping?.(entry.id) ?? false);
    remote.engine = true;
    remote.moored = false;
    remote.throttle = entry.speed > 0.5 ? 1 : 0;
    entry.motion.update(dt, remote);
  }

  /**
   * A vehicle nobody is driving: a hull near enough to see rides its mooring
   * and a horse idles, anything else eases to rest.
   */
  function settle(entry: Drawn, dt: number): void {
    entry.tracked = false;
    entry.speed = entry.turn = 0;
    const alive = entry.model.medium === 'water' || entry.model.kind === 'horse';
    if (alive && entry.group.position.distanceTo(player.position) < MOOR_REACH) entry.motion.update(dt, MOORED);
    else if (entry.motion.settling) entry.motion.update(dt, AT_REST);
  }

  /** Whether a part of a vehicle dissolves: a solid mesh of one material, not the propeller's see-through disc. */
  function fades(part: THREE.Object3D): part is THREE.Mesh {
    const mesh = part as THREE.Mesh;
    return mesh.isMesh === true && !Array.isArray(mesh.material) && !(mesh.material as THREE.Material).transparent;
  }

  /** A vehicle just built or taken from the pool, placed: in, dissolving. */
  function arrive(entry: Drawn): void {
    drawn.set(entry.id, entry);
    group.add(entry.group);
    place(entry);
    if (!FADES) return;
    entry.group.traverse((part) => {
      if (fades(part)) fader.in(part);
    });
  }

  /** Its own materials back at once, for a vehicle somebody gets into mid-fade. */
  function endFades(entry: Drawn): void {
    entry.group.traverse((part) => {
      if (fades(part)) fader.cancel(part);
    });
  }

  /** Out of the walls now, and out of sight when its fade is done. */
  function putAway(entry: Drawn): void {
    drawn.delete(entry.id);
    let left = 0;
    if (FADES) {
      entry.group.traverse((part) => {
        if (fades(part)) left++;
      });
    }
    if (left === 0) {
      retire(entry);
      return;
    }
    entry.group.traverse((part) => {
      if (!fades(part)) return;
      fader.out(part, () => {
        if (--left === 0) retire(entry);
      });
    });
  }

  function retire(entry: Drawn): void {
    group.remove(entry.group);
    const key = entry.key;
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
    // shares (`craft/motion.ts`), and a horse's body, whose buffers are its
    // rig's and every other horse's (`makeRigged`).
    entry.group.traverse((part) => {
      if ((part as THREE.Mesh).isMesh && part.name !== 'prop-disc' && !(part as THREE.SkinnedMesh).isSkinnedMesh) (part as THREE.Mesh).geometry.dispose();
    });
  }

  /**
   * Puts away the furthest vehicle standing, if it is further than `distance`
   * by `ROOM_MARGIN`, to make room under `MAX_BUILT` for one that near. Never
   * the one going on alone, which the player just jumped out of.
   */
  function makeRoom(distance: number): boolean {
    let furthest: Drawn | null = null;
    let far = distance + ROOM_MARGIN;
    for (const entry of drawn.values()) {
      if (coast !== null && coast.entry === entry) continue;
      const gap = entry.group.position.distanceTo(player.position);
      if (gap <= far) continue;
      far = gap;
      furthest = entry;
    }
    if (furthest === null) return false;
    putAway(furthest);
    return true;
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
      // A vehicle jumped out of and still rolling is the jumper's to take
      // again: its driver's seat is still his on the link (`coastOn`). One
      // gliding down aloft is not.
      const rolling = coast !== null && coast.entry === entry;
      if (rolling && coast!.flying) continue;
      const size = entry.model.size;
      const gap = entry.group.position.distanceTo(player.position) - Math.max(size[0], size[1]) / 2;
      if (gap > BOARD_REACH || gap >= bestGap) continue;
      const seats = link.moved.get(entry.id)?.seats ?? [];
      const free = entry.model.seats.findIndex((_, i) => (seats[i] ?? null) === null || (rolling && i === 0 && seats[i] === link.self));
      if (free < 0) continue;
      bestGap = gap;
      best = { vehicle: entry.id, seat: free, model: entry.model, label: free === 0 ? takeLabel(entry.model.kind) : 'Get in', gap };
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
        best = { vehicle: bay.id, seat: 0, model, label: takeLabel(model.kind), gap };
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
    paints.set(bay.id, bay.paint);
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
    endFades(entry);
    drawn.delete(entry.id);
    group.remove(entry.group);
    poseOf(entry.id, pose);
    // Back into one still rolling: where it has got to, and going as it was.
    let going = 0;
    if (coast !== null && coast.entry === entry) {
      for (let i = 0; i < 9; i++) pose[i] = coastPose[i]!;
      going = seat === 0 ? coast.speed : 0;
      coast = null;
    }
    held = entry;
    heldSeat = seat;
    lostFor = 0;
    lostTries = 0;
    player.board({ vehicle: entry.id, seat, model: entry.model, group: entry.group }, pose, going);
    if (seat === 0) link.drive(entry.id, player.pose(pose), 0);
    onEvent?.('boarded', entry.model);
  }

  function claim(entry: Drawn, seat: number): Promise<boolean> {
    // The one rolling on is claimed as it goes, its driver's seat already
    // ours; anything else is somewhere else, and that one parks.
    if (coast === null || coast.entry !== entry) finishCoast();
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
    // How it was going, read before the player lets go of it.
    const speed = player.speed;
    const climb = player.climb;
    const flying = isAirKind(held.model.kind) && player.airborne;
    const out = player.leave();
    if (out === null) {
      onEvent?.('leave-refused', held.model);
      return;
    }
    const entry = held;
    held = null;
    group.add(entry.group);
    applyPose(out, entry.group);
    drawn.set(entry.id, entry);
    entry.site = null;
    entry.reseat = 0;
    scanAge = Infinity;
    const under = flying || Math.abs(speed) > COAST_STOP * 4;
    // A passenger leaves the driver to it; the driver of a vehicle under way
    // leaves it going.
    if (heldSeat === 0 && under) {
      finishCoast();
      coast = {
        entry,
        position: new THREE.Vector3(out[0]!, out[1]!, out[2]!),
        forward: new THREE.Vector3(out[3]!, out[4]!, out[5]!),
        speed,
        vertical: flying ? climb : 0,
        age: 0,
        flying,
        sinking: -1,
      };
    } else link.release(entry.id, heldSeat === 0 ? out : null);
    onEvent?.(under || flying ? 'bailed' : 'left', entry.model);
  }

  /**
   * The vehicle going on alone has gone under: it is gone from here and back
   * at its site, for everyone (`FleetLink.sink`).
   */
  function sinkCoast(): void {
    const c = coast;
    if (c === null) return;
    coast = null;
    sunkAt.copy(c.position);
    link.sink(c.entry.id);
    if (drawn.get(c.entry.id) === c.entry) {
      drawn.delete(c.entry.id);
      retire(c.entry);
    }
    scanAge = Infinity;
    onEvent?.('sank', c.entry.model, sunkAt);
  }

  /**
   * The vehicle at the controls has gone under (`Player.sunk`): the body is
   * put out swimming at the surface, the vehicle is gone from under the
   * water and back at its site, for everyone (`FleetLink.sink`).
   */
  function sinkHeld(): void {
    if (held === null) return;
    const entry = held;
    sunkAt.copy(player.position);
    if (player.leave() === null) return;
    held = null;
    entry.site = null;
    retire(entry);
    link.sink(entry.id);
    scanAge = Infinity;
    onEvent?.('sank', entry.model, sunkAt);
  }

  /** The vehicle going on alone, parked where it is now. */
  function finishCoast(): void {
    const c = coast;
    if (c === null) return;
    coast = null;
    up.copy(c.position).normalize();
    c.forward.projectOnPlane(up).normalize();
    writePose(c.position, c.forward, up, coastPose);
    // Parked as a parked one stands, on its wheels, so the reseat that
    // follows (`RESEAT_SECONDS`) finds it already there.
    if (!c.flying) seat(c.entry.model, coastPose, coastPose);
    link.release(c.entry.id, coastPose.slice(0, 9));
    if (drawn.get(c.entry.id) === c.entry) applyPose(coastPose, c.entry.group);
    scanAge = Infinity;
  }

  /** One frame of the vehicle going on alone: see `COAST_DRAG`. */
  function coastOn(dt: number): void {
    const c = coast;
    if (c === null || dt <= 0) return;
    const model = c.entry.model;
    const kind = model.kind;
    c.age += dt;
    const ease = (rate: number): number => 1 - Math.exp(-rate * dt);
    if (c.flying) {
      if (kind === 'plane') c.vertical += (-Math.max(4, Math.abs(c.speed) / GLIDE_RATIO) - c.vertical) * ease(1.5);
      else {
        c.speed *= Math.exp(-dt / 3);
        c.vertical += (-(kind === 'balloon' ? BALLOON_FALL : HELI_FALL) - c.vertical) * ease(1);
      }
    } else {
      // On the ground an aircraft brakes hard; everything else runs on its own coast.
      const tau = isAirKind(kind) ? 1.5 : ROAD_HANDLING[kind]?.coastTime ?? 3;
      const sign = Math.sign(c.speed);
      c.speed = c.speed * Math.exp(-dt / tau) - sign * COAST_DRAG * dt;
      if (Math.sign(c.speed) !== sign) c.speed = 0;
    }
    // Along its bow, round the planet.
    coastFrom.copy(c.position);
    up.copy(c.position).normalize();
    const arc = (c.speed * dt) / c.position.length();
    if (Math.abs(arc) > 1e-12) {
      coastAxis.crossVectors(up, c.forward).normalize();
      c.position.applyAxisAngle(coastAxis, arc);
      c.forward.applyAxisAngle(coastAxis, arc);
      up.copy(c.position).normalize();
    }
    c.forward.projectOnPlane(up).normalize();
    // What is under it: a hull stops at the land and a horse at the water;
    // anything else rolls on into it and founders (`founders`).
    point.copy(up).multiplyScalar(PLANET_RADIUS);
    const relief = groundRadius(world, point);
    const wet = isWater(relief);
    const afloat = model.medium === 'water';
    const swamps = founders(kind, model.medium);
    if (!c.flying && (afloat ? !wet : wet && !swamps)) {
      c.position.copy(coastFrom);
      c.speed = 0;
      up.copy(c.position).normalize();
    }
    // A wall turns it back.
    if (!c.flying && options.collide !== undefined && Math.abs(c.speed) > 0) {
      point.copy(c.position).addScaledVector(c.forward, (Math.sign(c.speed) * model.size[0]) / 2);
      if (options.collide(point, model.size[1] / 2, coastPush)) {
        c.position.copy(coastFrom);
        up.copy(c.position).normalize();
        if (Math.abs(c.speed) > KNOCK_SPEED) onEvent?.('wrecked', model, c.position);
        c.speed = -c.speed * COAST_BOUNCE;
      }
    }
    // Its floor: the sea's line, or the ground its kind is parked on
    // (`seat`) — the drawn land, and what is made over it for anything on
    // wheels or legs. The relief here put a car rolling on alone up to a few
    // units under the drawn hill, and up out of it again the moment it parked.
    let floor: number;
    point.copy(up).multiplyScalar(PLANET_RADIUS);
    if (afloat || isWater(groundRadius(world, point))) floor = PLANET_RADIUS + WATERLINE;
    else floor = isAirKind(kind) ? landAt(point) : standingAt(point);
    let radius = c.position.length();
    // In the water: it floats a moment, then goes down nose first.
    if (!c.flying && swamps && isWater(groundRadius(world, point)) && radius <= floor + 0.05) {
      if (c.sinking < 0) {
        c.sinking = 0;
        onEvent?.('foundered', model, c.position);
      } else c.sinking += dt;
      c.speed *= Math.exp(-dt / FOUNDER_DRAG);
      c.vertical = 0;
      c.position.setLength(floor - founderDepth(c.sinking));
      up.copy(c.position).normalize();
      // The nose down about its own side: forward towards down, up towards forward.
      const nose = founderNose(c.sinking);
      sinkSide.copy(c.forward).multiplyScalar(Math.cos(nose)).addScaledVector(up, -Math.sin(nose));
      const tiltedUp = point.copy(up).multiplyScalar(Math.cos(nose)).addScaledVector(c.forward, Math.sin(nose));
      writePose(c.position, sinkSide, tiltedUp, coastPose);
      applyPose(coastPose, c.entry.group);
      link.drive(c.entry.id, coastPose, c.speed);
      coasting.speed = 0;
      coasting.grounded = true;
      c.entry.motion.update(dt, coasting);
      if (c.sinking >= FOUNDER_TIME) sinkCoast();
      return;
    }
    c.sinking = -1;
    if (!c.flying && radius > floor + 0.05) c.vertical -= COAST_GRAVITY * dt;
    radius += c.vertical * dt;
    if (radius <= floor) {
      if (c.flying || c.vertical < -WRECK_SPEED) {
        if (-c.vertical > WRECK_SPEED || kind === 'plane') onEvent?.('wrecked', model, c.position);
        c.speed *= kind === 'balloon' ? 0.2 : 0.5;
        c.flying = false;
      }
      radius = floor;
      c.vertical = 0;
    }
    c.position.setLength(radius);
    writePose(c.position, c.forward, up.copy(c.position).normalize(), coastPose);
    // On the ground, on its wheels as it will stand parked.
    if (!c.flying && radius <= floor + 0.05) seat(model, coastPose, coastPose);
    applyPose(coastPose, c.entry.group);
    link.drive(c.entry.id, coastPose, c.speed);
    coasting.speed = c.speed;
    coasting.grounded = !c.flying;
    c.entry.motion.update(dt, coasting);
    if ((!c.flying && Math.abs(c.speed) < COAST_STOP && c.vertical === 0) || c.age > COAST_MAX) finishCoast();
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
        const [hx, hz] = wallOf(entry.model);
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

    freeSpotNear(point, radius, out) {
      free.copy(point);
      let moved = false;
      // A push takes a body out of one box; a second box beside it takes another.
      for (let round = 0; round < 4; round++) {
        if (!fleet.collide(free, radius, freePush)) break;
        // A hair past the side, or rounding leaves it touching and asked again.
        free.add(freePush.setLength(freePush.length() + 0.01)).setLength(point.length());
        moved = true;
      }
      if (moved) out.copy(free);
      return moved;
    },

    eachStanding(visit) {
      for (const entry of drawn.values()) {
        const [hx, hz] = wallOf(entry.model);
        visit(entry.group.position, (hx + hz) / 2, false);
      }
    },

    movedNear(direction, radius) {
      localPoint.copy(direction).normalize();
      for (const [id, entry] of link.moved) {
        const pose = entry.pose;
        if (!isPose(pose)) continue;
        const model = models.get(modelOfVehicle(id));
        if (model === undefined) continue;
        const [hx, hz] = wallOf(model);
        const reach = radius + Math.max(hx, hz);
        const length = Math.hypot(pose[0]!, pose[1]!, pose[2]!);
        const dot = (localPoint.x * pose[0]! + localPoint.y * pose[1]! + localPoint.z * pose[2]!) / length;
        if (Math.acos(Math.min(1, dot)) * PLANET_RADIUS < reach) return true;
      }
      return false;
    },

    claimsParked(id) {
      return bayPose.has(id) || link.moved.has(id);
    },
    claimedParked() {
      return [...link.moved.keys(), ...bayPose.keys()];
    },

    update(dt, camera) {
      fader.update();
      // The vehicle in hand: the driver tells the link where it is, and a
      // passenger is carried wherever the driver has it.
      if (held !== null && player.ride !== null) keepSeat(dt, held);
      if (held !== null && player.ride !== null) {
        if (heldSeat === 0) {
          player.pose(lastPose);
          link.drive(held.id, lastPose, player.velocity);
          if (player.sunk) sinkHeld();
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
        entry.reseat = 0;
        scanAge = Infinity;
      }

      coastOn(dt);

      // Far work, so only inside what is left of the frame's allowance.
      if (warmed.distanceTo(player.position) > WARM_MOVE) {
        const began = performance.now();
        const more = (): boolean => mayBuild(began, WARM_MS, false);
        if (more() && sites.warm(warmAt.copy(player.position).normalize(), WARM_REACH, more)) warmed.copy(player.position);
      }

      scanAge += dt;
      if (scanAge > RESCAN_SECONDS || lastScan.distanceTo(player.position) > RESCAN_MOVE) {
        scan();
        scanAge = 0;
        lastScan.copy(player.position);
        const keep = new Set(wanted.map((entry) => entry.id));
        if (coast !== null) keep.add(coast.entry.id);
        for (const entry of [...drawn.values()]) if (!keep.has(entry.id)) putAway(entry);
      }

      // Build what is wanted and not standing, nearest first, inside the
      // frame's allowance; at the cap, in the place of the furthest standing.
      // The cone is aimed every frame, not only at a scan, so a vehicle
      // turned towards is admitted now rather than up to a second later.
      if (camera !== undefined) cone.aim(camera);
      const began = performance.now();
      for (const want of wanted) {
        if (drawn.has(want.id) || (held !== null && held.id === want.id)) continue;
        if (want.distance > REACH) break;
        if (!mayBuild(began, BUILD_MS, want.distance < NEAR_BUILD)) break;
        if (want.distance > ALWAYS_WITHIN && cone.active) {
          if (!poseOf(want.id, pose)) continue;
          centre.set(pose[0]!, pose[1]!, pose[2]!);
          const model = models.get(want.site?.model ?? modelOfVehicle(want.id));
          if (model !== undefined && !cone.admits(centre, Math.max(...model.size))) continue;
        }
        if (drawn.size >= MAX_BUILT && !makeRoom(want.distance)) break;
        const entry = build(want.id, want.site);
        if (entry === null) continue;
        arrive(entry);
      }
      updateStrips(dt, began);

      // Anything somebody else is driving moves every frame; a parked one
      // is set down again now and then, on whatever made ground has arrived.
      drivenNow.length = 0;
      for (const entry of drawn.values()) {
        if (coast !== null && coast.entry === entry) {
          drivenNow.push(entry);
          continue;
        }
        const moved = link.moved.get(entry.id);
        if (moved !== undefined) {
          const driven = link.sample(entry.id, pose);
          if (driven || isPose(moved.pose)) {
            if (driven) {
              applyPose(pose, entry.group);
              drivenNow.push(entry);
              animate(entry, dt, pose);
              entry.reseat = 0;
            } else {
              // Where it was left, set down on its wheels there — on the
              // ground as it is drawn here, which every client agrees on —
              // and again now and then as the ground under it arrives.
              entry.reseat -= dt;
              if (entry.reseat <= 0) {
                entry.reseat = RESEAT_SECONDS;
                applyPose(seat(entry.model, moved.pose, pose), entry.group);
              }
              settle(entry, dt);
            }
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
          sitePose(site, pose, true);
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
