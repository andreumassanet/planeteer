/**
 * The numbers that decide how much moves, how far away and how fast.
 *
 * Counts scale with the detail knob through `detailCount`, reaches through
 * `detailReach`; `MAX_MOVERS` and `KEEP_ALL_WITHIN` do not, because they are
 * budgets rather than answers about reach.
 */
import * as THREE from 'three';
import { RUN_SPEED, SEAT_SHIN, SEAT_THIGH, WALK_SPEED } from '../avatar.ts';
import { FAUNA_RESCALE } from '../fauna/contract.ts';
import { HAZE_RADIUS } from '../globe.ts';
import { BODY_SCALE } from '../stature.ts';
import { detailReach, fogFar } from '../view.ts';

export const DEG = Math.PI / 180;
export const TAU = Math.PI * 2;

/**
 * Movers of each family at detail 1, before the cap. A mover is a draw-call
 * budget, not a triangle one. The road count, not `OCCUPANCY`, decides how busy
 * the roads look: the scan spends this cap nearest-first.
 */
export const ROAD_MOVERS = 12;
export const WATER_MOVERS = 10;
export const FOOT_MOVERS = 10;
/** Herds at detail 1. A merged herd is one draw call for all its animals. */
export const HERD_MOVERS = 8;

/** Movers of all families at once, whatever the knob says: a draw-call ceiling. */
export const MAX_MOVERS = 90;

/**
 * Pool-key suffixes for a road vehicle's glazed, driven near build, with the
 * driver on the left or (for a road whose country keeps left) on the right.
 */
export const INSIDE = 'in';
export const INSIDE_RIGHT = 'ir';

/** Ground reach of each family at detail 1, in units. */
export const ROAD_REACH = 1100;
export const WATER_REACH = 1700;
export const FOOT_REACH = 130;
export const BIRD_REACH = 620;
/** Priced on one animal rather than the herd: a cow is about 13 px long at this distance. */
export const HERD_REACH = 380;

/**
 * How near a herd stands up as animated rigs. Each animal is a skinned mesh
 * and a skinning pass, so near and few move and the rest are merged stills.
 */
export const HERD_ANIMATED_REACH = 70;

/**
 * Past `HERD_HOME_REACH` a near herd's animals walk back to the spots the
 * merged herd shows them at, and the swap back happens once all are home.
 * Past `HERD_HOLD_REACH` it swaps back wherever they are (`stats.snapped`).
 */
export const HERD_HOME_REACH = HERD_ANIMATED_REACH * 0.85;
export const HERD_HOLD_REACH = HERD_ANIMATED_REACH * 1.8;
/** Ground queries the near herds' decisions may make per frame, across all herds. */
export const GRAZE_PROBES = 8;
/**
 * How near you are before an animal moves off, on top of its own length, by
 * your speed band: standing, walking, running, vehicle. `FLEE_PACE` holds the
 * band edges.
 */
export const FLEE_REACH = [4, 9, 18, 28] as const;
export const FLEE_PACE = [1.5, (WALK_SPEED + RUN_SPEED) / 2, RUN_SPEED * 1.4] as const;
/** A trot as a multiple of the walk; also how an animal runs from anything faster than a walk. */
export const TROT = 2.4;
/** Seconds an animal bolts for after being run into. */
export const BOLT_SECONDS = 1.6;
/** Headings an animal tries, turned from straight away from you, in radians. */
export const FLEE_TURNS = [0, 0.7, -0.7, 1.4, -1.4] as const;

/**
 * A cast rider's legs in the rider's own frame: a bench's thigh, a saddle's
 * thigh dropped towards the pedals, and a hanging shin. The bench pair is
 * `avatar.ts`'s seat.
 */
export const RIDER_THIGH_SIT = SEAT_THIGH;
export const RIDER_THIGH_ASTRIDE = new THREE.Vector3(0, -0.8, 1).normalize();
export const RIDER_SHIN = SEAT_SHIN;
/** Animated animals at once, across every near herd. */
export const HERD_ANIMATED_CAP = 36;

/**
 * Viewer altitude above which a family is not drawn at all. `slantRange` would
 * otherwise admit the whole disc under an aircraft, where a car is under two
 * pixels. Water is highest because a boat reads on an empty sea.
 */
export const CEILING = { road: 1800, foot: 300, water: 4000, air: 1500, herd: 400 } as const;

const BASE_REACH = { road: ROAD_REACH, foot: FOOT_REACH, water: WATER_REACH, air: BIRD_REACH, herd: HERD_REACH } as const;

/**
 * Ground reach of a family at a given altitude: its reach scaled by the knob,
 * never past the haze, and zero above its ceiling. `pnpm reach` holds it to
 * the knob.
 */
export function moverReach(family: keyof typeof CEILING, altitude: number): number {
  return altitude > CEILING[family] ? 0 : Math.min(fogFar(altitude, HAZE_RADIUS) * 1.1, detailReach(BASE_REACH[family]));
}

/**
 * Vehicle speed by road class, units a second. Judged against the car's own
 * length and the street you can see rather than real km/h: the planet is
 * about 1:400 on distance and 1:1 on people. Every class outruns a running player.
 */
export const ROAD_SPEED = [28, 39, 50];

/**
 * Chance a road of each class has a vehicle in a slot. Lanes are low because
 * the road graph is far denser than a real one; at 0.1 a village lane is
 * usually empty and the budget goes to roads and trunks.
 */
export const OCCUPANCY = [0.1, 0.4, 0.8];
/** Vehicles per road at most. A road is up to about 1,100 units long. */
export const ROAD_SLOTS = 3;

/**
 * Giving way (`give-way.ts`). A vehicle that waits falls behind its route: it
 * carries a `delay` and is drawn at `clock - delay`, braking grows it and
 * driving at `1 + CATCH_UP` pays it back, so the route itself never changes.
 * It looks down its lane as far as it needs to stop from its speed at `BRAKE`
 * plus `LOOK_MARGIN`, and stops `STOP_GAP` short (`FOLLOW_GAP` behind traffic).
 * Held `PASS_AFTER` by something still on the open road, it pulls out if the
 * other lane is clear for `PASS_CLEAR`; held `GRIDLOCK` by traffic it stops
 * looking at traffic; held `HORN_AFTER` by the player it sounds its horn,
 * again every `HORN_AGAIN`.
 */
export const YIELD_REACH = 450;
export const BRAKE = 22;
export const ACCELERATE = 9;
export const LOOK_MARGIN = 20;
export const STOP_GAP = 2.5;
export const FOLLOW_GAP = 2.2;
/** How much wider than the two bodies the corridor ahead is. */
export const LANE_MARGIN = 0.35;
export const CATCH_UP = 0.15;
export const PASS_AFTER = 3;
export const PASS_CLEAR = 70;
export const LANE_CHANGE = 2;
export const HORN_AFTER = 2;
export const HORN_AGAIN = 6;
export const GRIDLOCK = 9;
/** A clock step longer than this, or backwards, is a jump (`setTime`, `setRate`): every delay is dropped. */
export const CLOCK_JUMP = 0.5;
/** Outside bodies a frame's traffic looks at, at most. */
export const WAY_OBSTACLES = 96;

/**
 * A route is a chain of roads, walked out of the seeded road's far end until
 * it is longer than anything is drawn at, so the turn-round happens out of
 * sight. Most baked roads are short. `MIN_SECONDS` caps the speed on chains
 * that cannot reach the length (islands, dead ends).
 */
export const MIN_ROUTE = 1600;
export const MAX_HOPS = 14;
export const MIN_SECONDS = 8;
/** Roads a scan examines closely, nearest first; the rest would only be sorted away. */
export const ROAD_SCAN_CAP = 120;

/** A boat's speed under way, units a second. */
export const CRAFT_SPEED = 17;
/** The cell a boat is seeded in, in degrees, and how many may share one. */
export const WATER_CELL = 1.5;
export const WATER_SLOTS = 3;

/**
 * Cell size for herds, in degrees: one herd a cell, so about 117 units apart
 * at least. Sparser than the birds: a herd is a thing, a flock a texture.
 */
export const HERD_CELL = 0.42;
/** The cheap seeded draw a herd cell takes before any ground query. */
export const HERD_CHANCE = 0.30;
/** How far across a herd stands before its count widens it. */
export const HERD_SPREAD = 13 * FAUNA_RESCALE;

/**
 * Cell size for flocks, in degrees, and the chance one holds a flock before
 * the biome is asked. Small enough that a bird count is a distribution rather
 * than a coin toss on two cells.
 */
export const BIRD_CELL = 0.35;
export const FLOCK_CHANCE = 0.14;

/** A bird's span and length, exaggerated so it reads at a few hundred units. */
export const BIRD_SPAN = 4.2 * BODY_SCALE;
export const BIRD_LENGTH = 2.4 * BODY_SCALE;
export const FLOCK_MIN = 3;
export const FLOCK_MAX = 8;
/** A flock's ring radius range. The sky scan also lifts the flock clear of the ground across the outer radius. */
export const FLOCK_RADIUS: readonly [number, number] = [38, 120];
/** Birds drawn at once, across every flock. The one mesh is sized for it. */
export const MAX_BIRDS = 64;

/**
 * Poses a code-built walking body is baked at, and bodies per region. Ten
 * phases at `WALK_STRIDE` is about 11 poses a second; each body costs memory
 * for the session, which is what keeps the count small.
 */
export const WALK_PHASES = 10;
export const WALK_BODIES = 6;

/**
 * How far under the true sphere a boat floats: the ocean icosphere sags up to
 * 1.5 under `PLANET_RADIUS`, about 0.75 on average.
 */
export const SEA_SINK = 0.75;

/** Movement thresholds that trigger a rescan. */
export const RESCAN_MOVE = 90;
export const RESCAN_TURN = 8 * DEG;
/**
 * Real milliseconds between rescans even when the viewer is still: unlike a
 * town, a car leaves the frame by itself. Real time, so `setRate` does not
 * make it rescan every frame.
 */
export const RESCAN_MS = 700;
/** Milliseconds of pool building allowed in one frame. */
export const BUILD_BUDGET_MS = 2;
/** Walkers dressed and herds stood up per frame: each is a skinned clone. */
export const DRESS_PER_FRAME = 3;
export const HERDS_PER_FRAME = 1;
/** Movers inside this of the camera are admitted whatever it is pointed at. */
export const KEEP_ALL_WITHIN = 340;
/**
 * Share of its reach a vehicle must be beyond before a rescan may add it while
 * visible: it drives in out of the haze rather than appearing mid-street.
 */
export const EMERGE_BEYOND = 0.7;
/** A viewer who has moved this far since the last scan has jumped, and the cast is laid out afresh. */
export const FRESH_JUMP = 1500;
/**
 * No vehicle or boat comes into being within this of the viewer: one placed
 * on the player's spot would wait behind him forever.
 */
export const ARRIVE_CLEAR = 40;
