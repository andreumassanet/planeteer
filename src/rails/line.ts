import { WORLD_SCALE } from '../globe/planet.ts';
import { RIBBON_LIFT } from '../roads/crown.ts';
import { SCENERY_SCALE } from '../stature.ts';
import { PLACED_SECTION } from '../traffic/contract.ts';

const DEG = Math.PI / 180;

/** One line, as `rails.bin` stores it; see `src/pack.ts`. */
export interface RailLine {
  /** Indices into `places`: the two cities. */
  a: number;
  b: number;
  /** Which way each station stands off its city: a bearing in the city's frame, in `STATION_TURN` steps from north. */
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

/** A metre of railway in world units: the traffic's scale, so a train is a vehicle among the cars. */
export const RAIL_METRE = SCENERY_SCALE * PLACED_SECTION;

/** The cities that have a station: built, and at least this many people. */
export const RAIL_POP = 150_000;
/** The longest line the bake lays, in world units: 2,600 nominal units, about 1,000 km. */
export const RAIL_MAX_LENGTH = 2600 * WORLD_SCALE;
/** How far past its city's disc a terminus stands at the nearest. */
export const STATION_OUT = 36;
/** The straight run out of a terminus, along the platform, before the line may bend. */
export const STATION_RUN = 76;
/** The bearings a station may stand on round its city: `STATION_BEARINGS` of them, `STATION_TURN` apart. */
export const STATION_BEARINGS = 24;
export const STATION_TURN = (2 * Math.PI) / STATION_BEARINGS;
/** Ballast crown height over the ground: the road's, so a level crossing is flush. */
export const RAIL_LIFT = RIBBON_LIFT;
/** Standard gauge, between the rails' centres. */
export const GAUGE = 1.435 * RAIL_METRE;
/** Half the ballast's crown, and half its foot, which is `SHOULDER_DROP` under the crown. */
export const BED_HALF = 3.2;
export const BED_FOOT = 6.4;
export const SHOULDER_DROP = RAIL_LIFT + 1.5;
/** What a line keeps clear of on each side of its centre; the keeper adds its own spread. */
export const RAIL_CLEARANCE = 7;
/** The longest a course's handle may reach out of its station's run: a railway turns wide. */
export const RAIL_HANDLE = 500;
/** The tightest a line may turn, as a radius in world units. */
export const RAIL_MIN_RADIUS = 110;
/** The steepest the crown may climb, rise over run, measured over `GRADE_RUN`. */
export const RAIL_GRADE = 0.1;
export const GRADE_RUN = 24;
/** How far apart the crown is sampled, and how many samples either side it is averaged over. */
export const CROWN_STEP = 6;
export const CROWN_SMOOTH = 6;
/** The ramp from a station's level floor back to the ground's lift. */
export const STATION_RAMP = 60;

/**
 * A level crossing: no flatter than `CROSSING_ANGLE` to the road, and
 * `CROSSING_CLEAR` beyond where either end's levelling, pavement and ramp reach.
 */
export const CROSSING_ANGLE = 35 * DEG;
export const CROSSING_CLEAR = 30;

/**
 * A station in its own frame: the terminus at the origin, +Z out along the
 * line, +X to the platform's side. The platform is a train's half-width and a
 * step off the track, with the hall behind it.
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
/** The station's whole footprint in its frame, for the keepouts and the bake. */
export const STATION_BOX = { x0: -BED_FOOT - 1, x1: PLATFORM_INNER + PLATFORM_WIDTH + 1 + HALL_DEPTH + 2, z0: -8, z1: PLATFORM_FROM + PLATFORM_LENGTH + 4 } as const;
