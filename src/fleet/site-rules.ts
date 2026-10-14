/**
 * The numbers the fleet's sites are decided by: how much room each kind keeps,
 * which towns keep which vehicles, and how far each search looks. Sites are a
 * function of the world alone, so every client, the relay and the checks must
 * read these same values.
 */
import { rngFrom } from '../scenery/random.ts';
import type { CraftKind } from '../craft/contract.ts';

export const DEG = Math.PI / 180;

/** How far out of its gate a car waits, in units along the road: two car lengths, inside the straight approach every road leaves a gate by. */
export const CAR_OUT = 13;
/** The least a short approach may leave it; nearer the kerb it is in the gate, not parked. */
export const CAR_MIN_OUT = 6;
/** Half a car's length, for keeping its bumpers out of a town's square. */
export const CAR_HALF = 4.5;
/** Two parked cars nearer than this are one too many: the later is not placed. */
export const CAR_SPACING = 9;
/** How many cars a village, a town and a city keep at their gates. */
export const carsFor = (radius: number): number => (radius < 13 ? 1 : radius < 30 ? 2 : 3);
/** The share of parked cars that are vans. */
export const VAN_SHARE = 0.25;

/** Open water a launch needs round it, in units: its own half-length and a hull's width beyond. */
export const BOAT_ROOM = 12;
/** How far past its own square a town looks for water to moor in, in units. */
export const BOAT_SEARCH = 170;
/** The step of that search, outward from the square. */
export const BOAT_STEP = 6;
/** Bearings tried at each step. */
export const BOAT_BEARINGS = 16;
/** Coastal cities over this many people have a seeded chance of a second launch. */
export const BOAT_SECOND_POP = 1_000_000;
export const BOAT_SECOND_SHARE = 0.5;
/** Two launches of one town nearer than this are one. */
export const BOAT_SPACING = 30;

/** Towns this big, and every capital, keep a light aircraft. */
export const PLANE_POP = 400_000;
/** The field a plane stands in: a disc this wide of land no steeper than `PLANE_GRADE`. */
export const PLANE_FIELD = 10;
export const PLANE_GRADE = Math.tan(8 * DEG);
/** A balloon's field: its envelope is 14.6 across, and it comes down wherever the basket touches. */
export const BALLOON_FIELD = 8;
export const BALLOON_GRADE = Math.tan(14 * DEG);
/** The share of built towns that keep a balloon. */
export const BALLOON_SHARE = 0.04;
/**
 * Whether a town keeps a balloon: the one answer, which the fleet's field
 * search and the balloons that fly from those towns (`air-traffic.ts`) both
 * ask. Seeded by the place's index, so every client agrees.
 */
export const keepsBalloon = (place: number): boolean => rngFrom('fleet-balloon', place).chance(BALLOON_SHARE);
/** Margin between a field and whatever it keeps clear of, in units. */
export const FIELD_CLEAR = 6;

// The rest of the fleet, by where it makes sense. At a town's gates, on the
// verge across the road from its car: bicycles and motorbikes by region. Further
// out on the carriageway: a tuk-tuk, a jeep, a bus. Off the shore: a jet ski and
// a sailboat. In a field of its own: a horse, a tractor, a helicopter.

/** Share of towns, by traffic region, that keep each gate vehicle. */
export const GATE_SHARES = {
  bicycle: { 'east-asia': 0.8, nordic: 0.6, 'atlantic-europe': 0.5, 'southeast-asia': 0.5, 'south-asia': 0.4, 'east-europe': 0.3, mediterranean: 0.25 } as Record<string, number>,
  motorbike: {
    'southeast-asia': 0.9, 'south-asia': 0.7, mediterranean: 0.6, 'east-asia': 0.5, 'latin-america': 0.45, maghreb: 0.35, 'sub-saharan': 0.35, 'middle-east': 0.3,
  } as Record<string, number>,
  tuktuk: { 'south-asia': 0.7, 'southeast-asia': 0.5, 'sub-saharan': 0.12 } as Record<string, number>,
};
/** Where no region above is named, the share of towns that have one all the same. */
export const GATE_ELSEWHERE = { bicycle: 0.15, motorbike: 0.12, tuktuk: 0 };
/** The countries that cycle, whose every town keeps a rack of two or three. */
export const CYCLING: ReadonlySet<string> = new Set(['NLD', 'DNK', 'BEL', 'DEU', 'SWE', 'FIN', 'JPN', 'CHN', 'TWN']);
/** Where a scooter rather than a motorbike stands, by region, as a share. */
export const SCOOTERS: Readonly<Record<string, number>> = { 'southeast-asia': 0.8, 'south-asia': 0.6, 'east-asia': 0.7, mediterranean: 0.6 };
/** The biomes a jeep is kept in, and the share of their towns that keep one. */
export const JEEP_BIOMES: ReadonlySet<string> = new Set(['desert', 'rock', 'steppe', 'savanna', 'tundra']);
export const JEEP_SHARE = 0.6;
/** Towns this big keep a bus. */
export const BUS_POP = 150_000;
/**
 * How far out of the gate each stands along its road, in units, and how far a
 * rack's bicycles are spaced and the verge sits off the carriageway.
 */
export const RACK_ALONG = 5;
export const RACK_PITCH = 1.8;
export const VERGE = 1.6;
export const MOTORBIKE_ALONG = 12;
export const TUKTUK_ALONG = 24;
export const JEEP_ALONG = 32;
export const BUS_ALONG = 44;
/** A jet ski where the sea is warm, a sailboat at a harbour: the latitude, the population and the shares. */
export const JETSKI_LAT = 40;
export const JETSKI_SHARE = 0.5;
export const SAILBOAT_POP = 30_000;
export const SAILBOAT_SHARE = 0.6;
/**
 * A submarine off a big harbour: the cities of a million and more on a sea with
 * a reef or a kelp forest to see (`seaZoneAt`), a share of them. It has its own
 * random stream so the other moorings do not move.
 */
export const SUBMARINE_POP = 1_000_000;
export const SUBMARINE_SHARE = 0.35;
/**
 * The least water a submarine is moored over, in units of floor under the
 * sea's radius (`seaDepthAt`): past the sandy shelf, so the first dive goes somewhere.
 */
export const SUBMARINE_SITE_DEPTH = 9;
/** How far from the town's launch a submarine's water is looked for. */
export const SUBMARINE_REACH = 320;
/** Two moorings of one town nearer than this, on top of their rooms, are one. */
export const MOORING_GAP = 6;
/** How far from the town's launch a jet ski or a sailboat is looked for, and on how many bearings. */
export const MOORING_REACH = 90;
export const MOORING_BEARINGS = 12;
/** A horse's paddock, a tractor's field and a helicopter's pad: how steep, and who keeps one. */
export const HORSE_GRADE = Math.tan(20 * DEG);
export const HORSE_BIOMES: Readonly<Record<string, number>> = { steppe: 0.5, grassland: 0.4, savanna: 0.2, temperate: 0.2 };
export const HORSE_POP = 200_000;
/** The share of horse towns with a second horse. */
export const HORSE_SECOND = 0.4;
export const TRACTOR_GRADE = Math.tan(14 * DEG);
export const TRACTOR_BIOMES: Readonly<Record<string, number>> = { temperate: 0.2, grassland: 0.25, steppe: 0.15 };
export const TRACTOR_POP = 100_000;
export const HELI_GRADE = Math.tan(8 * DEG);
export const HELI_POP = 1_000_000;
/**
 * Past this many degrees of the coast field's distance to water, plus the whole
 * reach of a town's field search, the search does not ask the outlines whether
 * its ground is dry (see `inlandFor` in `site-fields.ts`).
 */
export const COAST_MARGIN = 1.5;
/** Rings and bearings a field is searched on, outward from the town. */
export const FIELD_RINGS = 6;
export const FIELD_STEP = 28;
export const FIELD_BEARINGS = 12;
/**
 * A plane's stand is searched on more rings than a balloon's, because a strip
 * is harder to fit than a disc.
 */
export const PLANE_RINGS = 20;

/**
 * The room each kind's site keeps, in units. They are numbers here rather than
 * `model.size`, because the sites are a function of the world alone (a client
 * whose kit failed to load, the check and the relay all have to agree);
 * `pnpm fleet` holds each against the built model instead.
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

/**
 * The furthest a car, a launch or a balloon stands from its town's centre: the
 * biggest square, and the widest search past it.
 */
export const SITE_SPREAD = 150 + Math.max(BOAT_SEARCH, FIELD_CLEAR + FIELD_RINGS * FIELD_STEP + 40);

/** Degrees in one cell of the town index. */
export const CELL = 2;
export const COLS = 360 / CELL;
export const ROWS = 180 / CELL;
