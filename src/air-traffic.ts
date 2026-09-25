import * as THREE from 'three';
import { LAND_HEIGHT } from './geo.ts';
import { PLANET_RADIUS } from './globe.ts';
import { reliefAt } from './terrain.ts';
import { isShown, radiusOf } from './places.ts';
import type { Place } from './places.ts';
import { applyPose, stripPoint } from './fleet.ts';
import type { FleetSite } from './fleet.ts';
import { latOf, lonOf, unitAt } from './sphere.ts';
import { SCENERY_SCALE } from './stature.ts';
import { weatherHazeAt } from './view.ts';
import type { CraftKind, CraftModel } from './craft/contract.ts';
import { AT_REST, motionOf } from './craft/motion.ts';
import type { MotionInput } from './craft/motion.ts';
import {
  AIRLINER_ENGINE_X,
  AIRLINER_ENGINE_Y,
  AIRLINER_LENGTH,
  AIRLINER_LIVERIES,
  AIRSHIP_LENGTH,
  AIRSHIP_PAINTS_COUNT,
  buildAirliner,
  buildAirship,
} from './craft/airliner.ts';

/**
 * What flies that nobody is flying: airliners crossing between the great
 * cities with their contrails behind them, light aircraft flying circuits at
 * the airstrips, helicopters over the big cities, balloons drifting off the
 * towns that keep one, and now and then an airship.
 *
 * ## A timetable, not a simulation
 *
 * **Every one of them is a pure function of the clock and the places**, like
 * the road traffic (`life.ts`): an airliner is the `n`th departure from a hub,
 * where it goes is a hash of the hub and `n`, and where it is now is how long
 * ago it left; a light plane's circuit is a closed loop laid off its strip
 * and it is somewhere round it by the time of day; a balloon goes up in a
 * slot of the clock if the hash says so and the weather lets it. Nothing
 * integrates and nothing is sent: every client sees the same aeroplane in the
 * same place, a flight that leaves range and comes back is where it should
 * be, and `atlas.sky.setRate` runs them with the sun.
 *
 * The one thing a flight asks of the world is the ground's radius under a
 * point (`AirSource.ground`), which is itself pure: a circuit and a helicopter
 * keep a clearance over the hills, a balloon rides at its height over the
 * land. The airliners ask nothing — they depart at `DEPART`, over the highest
 * relief there is, and cruise at `CRUISE`, over the cloud deck's tops.
 *
 * ## Near, and capped
 *
 * The timetable is read round the player every `RESCAN_S` (`flightsNear`),
 * and of what it offers the nearest `CAPS[kind]` are drawn, each as its own
 * group — a moving thing is its own mesh, and a flyer costs its draw calls.
 * The airliners are drawn at their own haze (`airlinerFar`), measured the way
 * the cloud deck's is, over the horizon of the sphere they fly on, because
 * the land's fog closes a thousand units out and an airliner is higher than
 * that. The rest are in the land's fog like everything else.
 *
 * ## Contrails
 *
 * **An airliner's trail is its own past**: the flight is a function of time,
 * so where it was a minute ago is `pose(t - 60)`, and the trail is drawn
 * through those points — a camera-facing ribbon a wing's engine, widening and
 * fading with age, one mesh for all of them rewritten each frame. It is not
 * `effects.ts`'s smoke, which is a pool of puffs kept within 700 units of the
 * eye; a contrail is three thousand units long and two thousand up.
 */

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

export type FlyerKind = 'airliner' | 'plane' | 'helicopter' | 'balloon' | 'airship';
export const FLYER_KINDS: readonly FlyerKind[] = ['airliner', 'plane', 'helicopter', 'balloon', 'airship'];

/** Where a flyer is and how it is held, at one instant. */
export interface FlyerPose {
  /** From the planet's centre. */
  position: THREE.Vector3;
  /** The way it faces, a unit vector: along its travel, climb included. */
  forward: THREE.Vector3;
  /** Its up, a unit vector square to `forward`: banked into a turn. */
  up: THREE.Vector3;
  /** Units a second through the air. */
  speed: number;
  /** Units a second up, negative going down. */
  climb: number;
  /** Wheels or basket on the ground. */
  grounded: boolean;
  /** 0 to 1: how much of it is there, as it appears and as it goes. */
  shown: number;
}

export function flyerPose(): FlyerPose {
  return {
    position: new THREE.Vector3(),
    forward: new THREE.Vector3(0, 0, 1),
    up: new THREE.Vector3(0, 1, 0),
    speed: 0,
    climb: 0,
    grounded: false,
    shown: 1,
  };
}

/** One flight on the timetable. */
export interface Flight {
  /** Stable across clients: `<kind>:<what it hangs off>:<n>`. */
  id: string;
  kind: FlyerKind;
  variant: number;
  /** When it appears and when it is gone, in seconds of the sky's clock; a circuit is always up. */
  from: number;
  to: number;
  /** Where it is at `seconds`. Pure. */
  pose(seconds: number, out: FlyerPose): FlyerPose;
}

/** What the timetable is a function of. */
export interface AirSource {
  places: readonly Place[];
  /** The ground's radius along a unit direction: the land, or the sea's `PLANET_RADIUS`. */
  ground(direction: THREE.Vector3): number;
  /** The airstrips, by their planes' sites (`fleet.ts`'s `planesNear`). */
  strips?: { planesNear(direction: THREE.Vector3, radius: number, out: FleetSite[]): FleetSite[] };
  /** Whether a town keeps a balloon (`keepsBalloon` in `fleet.ts`). */
  keepsBalloon?(place: number): boolean;
  /**
   * The wind at a place and an instant, where it blows *to*, and whether it
   * is weather a balloon goes up in. Without it a balloon drifts on a hashed
   * heading and flies in any weather.
   */
  wind?(lat: number, lon: number, timeMs: number): { east: number; north: number; speed: number; calm: boolean };
}

// ---------------------------------------------------------------------------
// The numbers
// ---------------------------------------------------------------------------

/** How far round the player each kind is looked for, in units over the ground. */
export const REACH: Readonly<Record<FlyerKind, number>> = {
  airliner: 7000,
  plane: 2000,
  helicopter: 2200,
  balloon: 2600,
  airship: 3600,
};
/** How many of each are drawn at once: the nearest. A draw-call budget, not a triangle one. */
export const CAPS: Readonly<Record<FlyerKind, number>> = { airliner: 5, plane: 3, helicopter: 3, balloon: 4, airship: 1 };

/**
 * **The airliners.** The hubs are the `HUB_COUNT` most populous built places
 * of at least `HUB_POP`; each sends one flight every `AIRLINER_EVERY` seconds
 * to another hub between `HOP_MIN` and `HOP_MAX` units away. They leave and
 * arrive at `DEPART` over the sea's radius, over an airport a little outside
 * the city, and cruise at `CRUISE`, climbing over the first `CLIMB_RUN` of the
 * way and coming down over the last `DESCENT_RUN`.
 *
 * `AIRLINER_SPEED` is set by the eye, not the Earth: a real one at ten
 * kilometres crosses the sky at a degree and a half a second, and 55 units a
 * second at 1,700 up is about two. A hop of 9,500 units takes three minutes.
 */
export const HUB_COUNT = 160;
export const HUB_POP = 1_000_000;
export const AIRLINER_EVERY = 150;
export const AIRLINER_SPEED = 55;
export const CRUISE = 1700;
/** Over `MAX_RELIEF` (680) and the shelf, so a flight never needs the ground. */
export const DEPART = 800;
const CLIMB_RUN = 3000;
const DESCENT_RUN = 3600;
export const HOP_MIN = 2000;
export const HOP_MAX = 9500;
/** How far outside its city's disc a hub's airport is. */
const AIRPORT_OUT = 300;
/** Seconds to appear over the airport, and to go. */
const APPEAR = 6;

/**
 * **The circuits.** A light plane flies a rectangle with round ends off its
 * strip: `CIRCUIT_SHARE` of the strips have one. It lands along the strip the
 * way the parked plane faces, touching down at `TOUCHDOWN` units along it,
 * rolls, lifts off at `LIFT_OFF` and climbs away at `CLIMB_GRADE`, turns
 * through half a circle of `CIRCUIT_TURN` onto the downwind at
 * `PATTERN_HEIGHT`, and turns back onto a final that comes down at
 * `GLIDE_GRADE` over the parked plane — at 1:6, which clears it by 14 units
 * and the first trees past the strip's keepout by 20.
 */
const CIRCUIT_SHARE = 0.6;
const CIRCUIT_SPEED = 38;
const TOUCHDOWN = 85;
const LIFT_OFF = 150;
const UPWIND_END = 700;
const FINAL_START = -520;
const CIRCUIT_TURN = 200;
const PATTERN_HEIGHT = 110;
const CLIMB_GRADE = 0.16;
const GLIDE_GRADE = 0.17;
/** What a circuit keeps over the ground under it once it is off the strip: its own height over the strip, up to this. */
const CIRCUIT_CLEAR = 40;
/**
 * How far the land under a circuit may rise over the pattern's own height
 * before the circuit is flown on the other side, or not at all: sampled at
 * `CIRCUIT_PROBES` points round it.
 */
const CIRCUIT_RISE = 25;
const CIRCUIT_PROBES = 48;
/** How far the wheels ride over the relief on the strip: the strip's own lift. */
const WHEEL_LIFT = 0.3;

/**
 * **The helicopters**: one over `HELI_SHARE` of the cities of `HELI_POP`, two
 * over those of `HELI_TWO`, flying a looping figure round the centre at
 * `HELI_HEIGHT` over its ground, never under `HELI_CLEAR` over the ground
 * beneath.
 */
const HELI_POP = 1_000_000;
const HELI_TWO = 5_000_000;
const HELI_SHARE = 0.75;
const HELI_SPEED = 26;
const HELI_HEIGHT = 170;
const HELI_CLEAR = 110;

/**
 * **The balloons.** Each town that keeps a balloon (`keepsBalloon`) may send
 * one up in each `BALLOON_SLOT` of the clock, with the odds `BALLOON_ODDS`,
 * if the wind is calm enough. It inflates where it stands just upwind of the
 * town, climbs over `BALLOON_CLIMB` seconds to its height, drifts with the
 * wind over the town and beyond, and comes down over `BALLOON_DESCENT` to
 * land and fold away. A flight whose landing would be in the water or in a
 * town is not flown.
 */
const BALLOON_SLOT = 1500;
const BALLOON_ODDS = 0.5;
const BALLOON_FLIGHT = 900;
const BALLOON_CLIMB = 120;
const BALLOON_DESCENT = 150;
/** Seconds on the ground at each end: inflating, and folding away. */
const BALLOON_GROUND = 15;
const BALLOON_DRIFT_MIN = 2.5;
const BALLOON_DRIFT_MAX = 5;

/**
 * **The airship**: over a city of `AIRSHIP_POP`, in `AIRSHIP_ODDS` of the
 * slots of `AIRSHIP_SLOT`, one slow pass straight across it at
 * `AIRSHIP_HEIGHT`, from `AIRSHIP_RUN` units out to as far out the other side.
 */
const AIRSHIP_POP = 3_000_000;
const AIRSHIP_SLOT = 2400;
const AIRSHIP_ODDS = 0.4;
const AIRSHIP_SPEED = 8;
const AIRSHIP_RUN = 3200;
const AIRSHIP_HEIGHT = 260;
const AIRSHIP_CLEAR = 180;

/** Gravity in units, for the bank a turn wants: 9.8 m/s^2 at the world's scale. */
const GRAVITY = 9.81 * SCENERY_SCALE;
/** The steepest a flyer is drawn banked. */
const MAX_BANK = 40 * DEG;

// ---------------------------------------------------------------------------
// Hashes: numbers, never `Math.random`
// ---------------------------------------------------------------------------

/** A number in [0, 1) from three integers. */
export function hashUnit(a: number, b: number, c: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** A string's own integer, for the hashes keyed on a site's id. */
function codeOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h | 0;
}

// Salts, one a question.
const S_PHASE = 11;
const S_DEST = 12;
const S_AIRPORT = 13;
const S_LIVERY = 14;
const S_CIRCUIT = 21;
const S_HELI = 31;
const S_BALLOON = 41;
const S_AIRSHIP = 51;

const smooth = (edge0: number, edge1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/** East and north at a unit direction; north is the pole's direction taken off it. */
function tangentsAt(direction: THREE.Vector3, east: THREE.Vector3, north: THREE.Vector3): void {
  north.set(0, 1, 0).addScaledVector(direction, -direction.y);
  if (north.lengthSq() < 1e-10) north.set(1, 0, 0).addScaledVector(direction, -direction.x);
  north.normalize();
  // Right-handed: east is north x up, the way `sphere.ts` lays the planet out.
  east.crossVectors(north, direction).normalize();
}

/** A direction moved from `from` by `x` units east and `y` north (a tangent-plane step). */
function offsetOnSphere(from: THREE.Vector3, east: THREE.Vector3, north: THREE.Vector3, x: number, y: number, out: THREE.Vector3): THREE.Vector3 {
  return out
    .copy(from)
    .addScaledVector(east, x / PLANET_RADIUS)
    .addScaledVector(north, y / PLANET_RADIUS)
    .normalize();
}

/**
 * **What a flyer keeps clear of**: the shelf and the relief, as if every
 * coast were land, sampled on a grid of `HULL_STEP` degrees and laid between
 * its nodes bilinearly. The ground itself (`AirSource.ground`) steps at every
 * shore, every small island's lower shelf and every pad a town or a landmark
 * is levelled on — a plateau's edge is thirteen units in no distance at all
 * — and a helicopter that followed it would jump. This is continuous
 * everywhere, because it is an interpolation of fixed numbers, and each node
 * is the highest of five samples round it, so a clearance measured over it is
 * a clearance over the land to within what a hill does between two nodes.
 */
const HULL_STEP = 0.2;
const hullNodes = new Map<number, number>();
const hullProbe = new THREE.Vector3();

function hullNode(row: number, col: number): number {
  const key = row * 4096 + col;
  const known = hullNodes.get(key);
  if (known !== undefined) return known;
  if (hullNodes.size > 60000) hullNodes.clear();
  const lat = Math.max(-90, Math.min(90, row * HULL_STEP - 90));
  const lon = col * HULL_STEP - 180;
  let top = 0;
  for (const [dlat, dlon] of [[0, 0], [0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]] as const) {
    unitAt(Math.max(-90, Math.min(90, lat + dlat * HULL_STEP)), lon + dlon * HULL_STEP, hullProbe);
    top = Math.max(top, reliefAt(hullProbe.x, hullProbe.y, hullProbe.z));
  }
  hullNodes.set(key, top);
  return top;
}

export function hullAt(direction: THREE.Vector3): number {
  const length = direction.length() || 1;
  const u = (latOf(direction.y / length) + 90) / HULL_STEP;
  const v = (lonOf(direction.x, direction.z) + 180) / HULL_STEP;
  const row = Math.floor(u);
  const col = Math.floor(v);
  const fu = u - row;
  const fv = v - col;
  const cols = Math.round(360 / HULL_STEP);
  const c0 = ((col % cols) + cols) % cols;
  const c1 = (c0 + 1) % cols;
  const a = hullNode(row, c0) * (1 - fv) + hullNode(row, c1) * fv;
  const b = hullNode(row + 1, c0) * (1 - fv) + hullNode(row + 1, c1) * fv;
  return PLANET_RADIUS + LAND_HEIGHT + a * (1 - fu) + b * fu;
}

// ---------------------------------------------------------------------------
// Poses from a path: the forward from the travel, the bank from the turn
// ---------------------------------------------------------------------------

/** Half the step a path is differentiated over, in seconds. */
const DIFF = 0.25;
const pBefore = new THREE.Vector3();
const pAfter = new THREE.Vector3();
const radial = new THREE.Vector3();
const across = new THREE.Vector3();
const bend = new THREE.Vector3();

/**
 * Fills a pose's forward, up, speed and climb from where its path is a
 * moment before and after: the forward along the travel, and the up tipped
 * into the turn by the bank a coordinated turn at that speed and radius takes.
 * `at` is `out.position`'s path, which it leaves where it was at `seconds`.
 */
function orient(at: (seconds: number, out: THREE.Vector3) => THREE.Vector3, seconds: number, out: FlyerPose, bank = true): FlyerPose {
  at(seconds - DIFF, pBefore);
  at(seconds + DIFF, pAfter);
  at(seconds, out.position);
  radial.copy(out.position).normalize();
  out.forward.subVectors(pAfter, pBefore);
  const run = out.forward.length();
  out.speed = run / (2 * DIFF);
  out.climb = (pAfter.length() - pBefore.length()) / (2 * DIFF);
  if (run < 1e-6) {
    // Standing: keep whatever forward it had, square to the ground.
    out.forward.addScaledVector(radial, -out.forward.dot(radial));
    if (out.forward.lengthSq() < 1e-10) tangentsAt(radial, out.forward, across);
  }
  out.forward.normalize();
  // The turn: the path's second difference across the travel.
  let roll = 0;
  if (bank && out.speed > 1) {
    bend.copy(pAfter).add(pBefore).addScaledVector(out.position, -2).multiplyScalar(1 / (DIFF * DIFF));
    across.crossVectors(radial, out.forward).normalize();
    const pull = bend.dot(across);
    roll = Math.max(-MAX_BANK, Math.min(MAX_BANK, Math.atan2(pull, GRAVITY)));
  }
  out.up.copy(radial).addScaledVector(out.forward, -radial.dot(out.forward)).normalize();
  if (roll !== 0) {
    // Tip the up toward the inside of the turn: about the forward, by the roll.
    across.crossVectors(out.forward, out.up);
    out.up.multiplyScalar(Math.cos(roll)).addScaledVector(across, -Math.sin(roll)).normalize();
  }
  return out;
}

// ---------------------------------------------------------------------------
// The timetable
// ---------------------------------------------------------------------------

export interface AirSchedule {
  /** The hubs, as indices into `places`, most populous first. */
  readonly hubs: readonly number[];
  /**
   * Every flight up at `seconds` within its kind's `REACH` of `direction`,
   * appended to `out`. The flights are kept by id while they are asked for,
   * so the same flight is the same object from one call to the next.
   */
  flightsNear(direction: THREE.Vector3, seconds: number, out: Flight[]): Flight[];
  /** Every hub's destination for its `n`th departure, or -1: for the check. */
  destinationOf(hub: number, n: number): number;
  /** A strip's circuit, or null where the strip has none: for the check. */
  circuitOf(site: FleetSite): Flight | null;
  /** The flights of the airliners from one hub up at `seconds`: for the check. */
  airlinersFrom(hub: number, seconds: number, out: Flight[]): Flight[];
  /** A balloon town's flight in a slot, or null: for the check. */
  balloonOf(place: number, slot: number): Flight | null;
}

export function createAirSchedule(source: AirSource): AirSchedule {
  const { places } = source;
  const centres = places.map((place) => unitAt(place.lat, place.lon, new THREE.Vector3()));
  const shown = places.map((place) => isShown(place));

  // The hubs, and each one's destinations.
  const hubs = places
    .map((place, i) => ({ place, i }))
    .filter(({ place, i }) => shown[i] && place.pop >= HUB_POP)
    .sort((a, b) => b.place.pop - a.place.pop || a.i - b.i)
    .slice(0, HUB_COUNT)
    .map(({ i }) => i);
  const hopMin = Math.cos(HOP_MIN / PLANET_RADIUS);
  const hopMax = Math.cos(HOP_MAX / PLANET_RADIUS);
  const destinations = hubs.map((h) =>
    hubs.filter((g) => {
      if (g === h) return false;
      const dot = centres[h]!.dot(centres[g]!);
      return dot <= hopMin && dot >= hopMax;
    }),
  );
  const hubSlot = new Map(hubs.map((h, k) => [h, k]));

  // Each hub's airport: a little outside its disc, on a hashed bearing.
  const airports = hubs.map((h) => {
    const bearing = hashUnit(h, S_AIRPORT, 0) * TAU;
    const out = radiusOf(places[h]!) + AIRPORT_OUT;
    const east = new THREE.Vector3();
    const north = new THREE.Vector3();
    tangentsAt(centres[h]!, east, north);
    return offsetOnSphere(centres[h]!, east, north, Math.sin(bearing) * out, Math.cos(bearing) * out, new THREE.Vector3());
  });

  const heliCities = places.map((_, i) => i).filter((i) => shown[i] && places[i]!.pop >= HELI_POP);
  const airshipCities = places.map((_, i) => i).filter((i) => shown[i] && places[i]!.pop >= AIRSHIP_POP);
  const balloonTowns = source.keepsBalloon === undefined ? [] : places.map((_, i) => i).filter((i) => shown[i] && source.keepsBalloon!(i));

  const kept = new Map<string, { flight: Flight; seen: number }>();
  let scan = 0;
  const keep = (id: string, make: () => Flight | null): Flight | null => {
    const known = kept.get(id);
    if (known !== undefined) {
      known.seen = scan;
      return known.flight;
    }
    const flight = make();
    if (flight !== null) kept.set(id, { flight, seen: scan });
    return flight;
  };
  /** Flights that turned out not to fly, so they are not worked out again. */
  const grounded = new Set<string>();

  // --- airliners -----------------------------------------------------------

  const destinationOf = (hub: number, n: number): number => {
    const k = hubSlot.get(hub);
    if (k === undefined) return -1;
    const list = destinations[k]!;
    if (list.length === 0) return -1;
    return list[Math.min(list.length - 1, Math.floor(hashUnit(hub, n, S_DEST) * list.length))]!;
  };
  const phaseOf = (hub: number): number => hashUnit(hub, S_PHASE, 0) * AIRLINER_EVERY;
  const longest = HOP_MAX / AIRLINER_SPEED + 60;

  function airliner(hub: number, n: number): Flight | null {
    const to = destinationOf(hub, n);
    if (to < 0) return null;
    const a = airports[hubSlot.get(hub)!]!;
    const b = airports[hubSlot.get(to)!]!;
    const angle = a.angleTo(b);
    const distance = angle * PLANET_RADIUS;
    const axis = new THREE.Vector3().crossVectors(a, b).normalize();
    const side = new THREE.Vector3().crossVectors(axis, a);
    const from = n * AIRLINER_EVERY + phaseOf(hub);
    const duration = distance / AIRLINER_SPEED;
    const altitudeAt = (s: number): number => DEPART + (CRUISE - DEPART) * Math.min(smooth(0, CLIMB_RUN, s), smooth(0, DESCENT_RUN, distance - s));
    const at = (seconds: number, out: THREE.Vector3): THREE.Vector3 => {
      const s = Math.min(distance, Math.max(0, (seconds - from) * AIRLINER_SPEED));
      const phi = s / PLANET_RADIUS;
      return out.copy(a).multiplyScalar(Math.cos(phi)).addScaledVector(side, Math.sin(phi)).multiplyScalar(PLANET_RADIUS + altitudeAt(s));
    };
    return {
      id: `airliner:${hub}:${n}`,
      kind: 'airliner',
      variant: Math.floor(hashUnit(hub, n, S_LIVERY) * AIRLINER_LIVERIES),
      from,
      to: from + duration,
      pose(seconds, out) {
        orient(at, seconds, out, false);
        out.grounded = false;
        out.shown = Math.min(smooth(0, APPEAR, seconds - from), smooth(0, APPEAR, from + duration - seconds));
        return out;
      },
    };
  }

  function airlinersFrom(hub: number, seconds: number, out: Flight[]): Flight[] {
    const phase = phaseOf(hub);
    const last = Math.floor((seconds - phase) / AIRLINER_EVERY);
    const first = Math.floor((seconds - phase - longest) / AIRLINER_EVERY);
    for (let n = first; n <= last; n++) {
      const id = `airliner:${hub}:${n}`;
      if (grounded.has(id)) continue;
      const flight = keep(id, () => airliner(hub, n));
      if (flight === null) {
        grounded.add(id);
        continue;
      }
      if (seconds >= flight.from && seconds < flight.to) out.push(flight);
    }
    return out;
  }

  // --- circuits --------------------------------------------------------------

  const upwind = UPWIND_END - FINAL_START;
  const turnLength = Math.PI * CIRCUIT_TURN;
  const circuitLength = 2 * upwind + 2 * turnLength;

  /**
   * A circuit's point `u` units round it from the start of the final turn's
   * end, as (along, across, height) in the strip's frame; `hand` +1 turns
   * right, -1 left.
   */
  function circuitPoint(u: number, hand: number, out: { along: number; across: number; height: number }): void {
    u = ((u % circuitLength) + circuitLength) % circuitLength;
    if (u < upwind) {
      const along = FINAL_START + u;
      out.along = along;
      out.across = 0;
      out.height =
        along < TOUCHDOWN ? GLIDE_GRADE * (TOUCHDOWN - along) : along < LIFT_OFF ? 0 : CLIMB_GRADE * (along - LIFT_OFF);
      return;
    }
    u -= upwind;
    const top = CLIMB_GRADE * (UPWIND_END - LIFT_OFF);
    if (u < turnLength) {
      const beta = u / CIRCUIT_TURN;
      out.along = UPWIND_END + CIRCUIT_TURN * Math.sin(beta);
      out.across = hand * CIRCUIT_TURN * (1 - Math.cos(beta));
      out.height = top + (PATTERN_HEIGHT - top) * (beta / Math.PI);
      return;
    }
    u -= turnLength;
    if (u < upwind) {
      out.along = UPWIND_END - u;
      out.across = hand * 2 * CIRCUIT_TURN;
      out.height = PATTERN_HEIGHT;
      return;
    }
    u -= upwind;
    const beta = u / CIRCUIT_TURN;
    const final = GLIDE_GRADE * (TOUCHDOWN - FINAL_START);
    out.along = FINAL_START - CIRCUIT_TURN * Math.sin(beta);
    out.across = hand * CIRCUIT_TURN * (1 + Math.cos(beta));
    out.height = PATTERN_HEIGHT + (final - PATTERN_HEIGHT) * (beta / Math.PI);
  }

  const circuitScratch = { along: 0, across: 0, height: 0 };
  const middle = new THREE.Vector3();
  const under = new THREE.Vector3();

  function circuit(site: FleetSite): Flight | null {
    const code = codeOf(site.id);
    if (hashUnit(code, S_CIRCUIT, 0) >= CIRCUIT_SHARE) return null;
    const stand = { at: site.at.clone(), forward: site.forward.clone() };
    // The strip's own ground where the wheels touch: what the circuit's heights are over.
    const strip = source.ground(stripPoint(stand, TOUCHDOWN, 0, middle));
    // The side the pattern is flown on: the hashed one if the land under it
    // lets it be flown level, else the other; a strip among hills on both
    // sides flies no circuit, rather than one that climbs every ridge.
    const rises = (hand: number): number => {
      let worst = 0;
      for (let k = 0; k < CIRCUIT_PROBES; k++) {
        circuitPoint((k / CIRCUIT_PROBES) * circuitLength, hand, circuitScratch);
        if (circuitScratch.height < 1) continue;
        stripPoint(stand, circuitScratch.along, circuitScratch.across, under);
        worst = Math.max(worst, hullAt(under) + Math.min(circuitScratch.height, CIRCUIT_CLEAR) - (strip + circuitScratch.height));
      }
      return worst;
    };
    const preferred = hashUnit(code, S_CIRCUIT, 1) < 0.5 ? -1 : 1;
    const hand = rises(preferred) <= CIRCUIT_RISE ? preferred : rises(-preferred) <= CIRCUIT_RISE ? -preferred : 0;
    if (hand === 0) return null;
    const phase = hashUnit(code, S_CIRCUIT, 2) * circuitLength;
    const at = (seconds: number, out: THREE.Vector3): THREE.Vector3 => {
      circuitPoint(seconds * CIRCUIT_SPEED + phase, hand, circuitScratch);
      const { along, across: side, height } = circuitScratch;
      stripPoint(stand, along, side, under);
      const land = source.ground(under) + WHEEL_LIFT;
      // On the strip it rolls on the ground; off it, over the strip's height
      // or a clearance over the land under it, whichever is higher, the two
      // blended in over the first units of height so nothing jumps.
      const flying = Math.max(strip + height, hullAt(under) + Math.min(height, CIRCUIT_CLEAR));
      const r = land + (Math.max(land, flying) - land) * smooth(0, 8, height);
      return out.copy(under).multiplyScalar(r);
    };
    return {
      id: `circuit:${site.id}`,
      kind: 'plane',
      variant: Math.floor(hashUnit(code, S_CIRCUIT, 3) * 6),
      from: -Infinity,
      to: Infinity,
      pose(seconds, out) {
        orient(at, seconds, out);
        circuitPoint(seconds * CIRCUIT_SPEED + phase, hand, circuitScratch);
        out.grounded = circuitScratch.height < 0.5;
        out.shown = 1;
        return out;
      },
    };
  }

  // --- helicopters -----------------------------------------------------------

  function helicopter(p: number, n: number): Flight {
    const place = places[p]!;
    const centre = centres[p]!;
    const east = new THREE.Vector3();
    const north = new THREE.Vector3();
    tangentsAt(centre, east, north);
    const r1 = radiusOf(place) * 0.9 + 80 + n * 120;
    const r2 = r1 * (0.25 + 0.15 * hashUnit(p, n, S_HELI));
    const turn = hashUnit(p, n, S_HELI + 1) < 0.5 ? -1 : 1;
    const omega = (turn * HELI_SPEED) / (r1 + 1.5 * r2);
    const phase = hashUnit(p, n, S_HELI + 2) * TAU;
    const lobe = hashUnit(p, n, S_HELI + 3) * TAU;
    const base = hullAt(centre) + HELI_HEIGHT + n * 40;
    const at = (seconds: number, out: THREE.Vector3): THREE.Vector3 => {
      const theta = ((seconds * omega) % TAU) + phase;
      const x = r1 * Math.cos(theta) + r2 * Math.cos(-2 * theta + lobe);
      const y = r1 * Math.sin(theta) + r2 * Math.sin(-2 * theta + lobe);
      offsetOnSphere(centre, east, north, x, y, under);
      const r = Math.max(base + 25 * Math.sin((seconds % 600) * 0.21 + phase), hullAt(under) + HELI_CLEAR);
      return out.copy(under).multiplyScalar(r);
    };
    return {
      id: `helicopter:${p}:${n}`,
      kind: 'helicopter',
      variant: Math.floor(hashUnit(p, n, S_HELI + 4) * 6),
      from: -Infinity,
      to: Infinity,
      pose(seconds, out) {
        orient(at, seconds, out);
        out.grounded = false;
        out.shown = 1;
        return out;
      },
    };
  }
  const helicoptersOf = (p: number): number => (hashUnit(p, 0, S_HELI + 5) >= HELI_SHARE ? 0 : places[p]!.pop >= HELI_TWO ? 2 : 1);

  // --- balloons --------------------------------------------------------------

  const landing = new THREE.Vector3();
  function inTown(direction: THREE.Vector3): boolean {
    for (let i = 0; i < places.length; i++) {
      if (!shown[i]) continue;
      if (centres[i]!.dot(direction) < 0.999) continue;
      if (centres[i]!.angleTo(direction) * PLANET_RADIUS < radiusOf(places[i]!) + 20) return true;
    }
    return false;
  }

  function balloon(p: number, slot: number): Flight | null {
    if (hashUnit(p, slot, S_BALLOON) >= BALLOON_ODDS) return null;
    const place = places[p]!;
    const from = slot * BALLOON_SLOT + hashUnit(p, slot, S_BALLOON + 1) * (BALLOON_SLOT - BALLOON_FLIGHT);
    const centre = centres[p]!;
    const east = new THREE.Vector3();
    const north = new THREE.Vector3();
    tangentsAt(centre, east, north);
    let we = 0;
    let wn = 0;
    let drift = BALLOON_DRIFT_MIN + (BALLOON_DRIFT_MAX - BALLOON_DRIFT_MIN) * hashUnit(p, slot, S_BALLOON + 2);
    const wind = source.wind?.(place.lat, place.lon, from * 1000);
    if (wind !== undefined) {
      if (!wind.calm) return null;
      we = wind.east;
      wn = wind.north;
      drift = Math.min(BALLOON_DRIFT_MAX, Math.max(BALLOON_DRIFT_MIN, wind.speed * SCENERY_SCALE * 0.6));
    } else {
      const heading = hashUnit(p, slot, S_BALLOON + 3) * TAU;
      we = Math.sin(heading);
      wn = Math.cos(heading);
    }
    const norm = Math.hypot(we, wn) || 1;
    we /= norm;
    wn /= norm;
    // It goes up just upwind of the town, so it drifts over it.
    const back = radiusOf(place) + 45;
    const start = offsetOnSphere(centre, east, north, -we * back, -wn * back, new THREE.Vector3());
    const travel = (BALLOON_FLIGHT - 2 * BALLOON_GROUND) * drift;
    offsetOnSphere(start, east, north, we * travel, wn * travel, landing);
    if (source.ground(landing) <= PLANET_RADIUS + 0.5 || inTown(landing)) return null;
    offsetOnSphere(start, east, north, we * travel * 0.5, wn * travel * 0.5, landing);
    if (source.ground(landing) <= PLANET_RADIUS + 0.5 && source.ground(start) <= PLANET_RADIUS + 0.5) return null;
    const height = 150 + 150 * hashUnit(p, slot, S_BALLOON + 4);
    const to = from + BALLOON_FLIGHT;
    const at = (seconds: number, out: THREE.Vector3): THREE.Vector3 => {
      const t = Math.min(BALLOON_FLIGHT, Math.max(0, seconds - from));
      const moving = Math.min(BALLOON_FLIGHT - 2 * BALLOON_GROUND, Math.max(0, t - BALLOON_GROUND));
      const run = moving * drift;
      offsetOnSphere(start, east, north, we * run, wn * run, under);
      const up = height * smooth(BALLOON_GROUND, BALLOON_GROUND + BALLOON_CLIMB, t) * smooth(BALLOON_GROUND, BALLOON_GROUND + BALLOON_DESCENT, BALLOON_FLIGHT - t);
      // On the ground at either end; aloft, over the hull, which does not step.
      const floor = up < 0.01 ? source.ground(under) : source.ground(under) + (hullAt(under) - source.ground(under)) * smooth(0, 12, up);
      return out.copy(under).multiplyScalar(floor + up);
    };
    const facing = new THREE.Vector3().copy(east).multiplyScalar(we).addScaledVector(north, wn);
    return {
      id: `balloon:${p}:${slot}`,
      kind: 'balloon',
      variant: Math.floor(hashUnit(p, slot, S_BALLOON + 5) * 6),
      from,
      to,
      pose(seconds, out) {
        orient(at, seconds, out, false);
        const t = seconds - from;
        // A balloon turns slowly on its rope, whichever way it drifts.
        out.forward.copy(facing).applyAxisAngle(out.up, 0.6 * Math.sin(t * 0.013) + ((p % 7) * TAU) / 7);
        out.forward.addScaledVector(out.up, -out.forward.dot(out.up)).normalize();
        out.grounded = t < BALLOON_GROUND + 1 || t > BALLOON_FLIGHT - BALLOON_GROUND - 1;
        out.shown = Math.min(smooth(0, BALLOON_GROUND * 0.8, t), smooth(0, BALLOON_GROUND * 0.8, BALLOON_FLIGHT - t));
        return out;
      },
    };
  }

  // --- airships --------------------------------------------------------------

  function airship(p: number, slot: number): Flight | null {
    if (hashUnit(p, slot, S_AIRSHIP) >= AIRSHIP_ODDS) return null;
    const centre = centres[p]!;
    const east = new THREE.Vector3();
    const north = new THREE.Vector3();
    tangentsAt(centre, east, north);
    const bearing = hashUnit(p, slot, S_AIRSHIP + 1) * TAU;
    const be = Math.sin(bearing);
    const bn = Math.cos(bearing);
    const off = (hashUnit(p, slot, S_AIRSHIP + 2) - 0.5) * 600;
    const duration = (2 * AIRSHIP_RUN) / AIRSHIP_SPEED;
    const from = slot * AIRSHIP_SLOT + hashUnit(p, slot, S_AIRSHIP + 3) * (AIRSHIP_SLOT - duration);
    const base = hullAt(centre) + AIRSHIP_HEIGHT;
    const at = (seconds: number, out: THREE.Vector3): THREE.Vector3 => {
      const s = -AIRSHIP_RUN + Math.min(2 * AIRSHIP_RUN, Math.max(0, (seconds - from) * AIRSHIP_SPEED));
      offsetOnSphere(centre, east, north, be * s + bn * off, bn * s - be * off, under);
      return out.copy(under).multiplyScalar(Math.max(base, hullAt(under) + AIRSHIP_CLEAR));
    };
    return {
      id: `airship:${p}:${slot}`,
      kind: 'airship',
      variant: Math.floor(hashUnit(p, slot, S_AIRSHIP + 4) * AIRSHIP_PAINTS_COUNT),
      from,
      to: from + duration,
      pose(seconds, out) {
        orient(at, seconds, out, false);
        out.grounded = false;
        out.shown = Math.min(smooth(0, 20, seconds - from), smooth(0, 20, from + duration - seconds));
        return out;
      },
    };
  }

  // --- the scan --------------------------------------------------------------

  const sites: FleetSite[] = [];
  const probe = flyerPose();
  const near = (flight: Flight, direction: THREE.Vector3, seconds: number): boolean => {
    flight.pose(seconds, probe);
    return probe.position.angleTo(direction) * PLANET_RADIUS < REACH[flight.kind];
  };
  const within = (p: number, direction: THREE.Vector3, reach: number): boolean =>
    centres[p]!.dot(direction) >= Math.cos(Math.min(Math.PI, reach / PLANET_RADIUS));

  return {
    hubs,
    destinationOf,
    airlinersFrom,
    circuitOf: (site) => keep(`circuit:${site.id}`, () => circuit(site)),
    balloonOf: (p, slot) => balloon(p, slot),
    flightsNear(direction, seconds, out) {
      scan++;
      const list: Flight[] = [];
      for (const hub of hubs) {
        if (!within(hub, direction, HOP_MAX + REACH.airliner + AIRPORT_OUT + 200)) continue;
        list.length = 0;
        for (const flight of airlinersFrom(hub, seconds, list)) if (near(flight, direction, seconds)) out.push(flight);
      }
      if (source.strips !== undefined) {
        sites.length = 0;
        for (const site of source.strips.planesNear(direction, REACH.plane, sites)) {
          const id = `circuit:${site.id}`;
          if (grounded.has(id)) continue;
          const flight = keep(id, () => circuit(site));
          if (flight === null) grounded.add(id);
          else out.push(flight);
        }
      }
      for (const p of heliCities) {
        if (!within(p, direction, REACH.helicopter + radiusOf(places[p]!) + 500)) continue;
        const count = helicoptersOf(p);
        for (let n = 0; n < count; n++) {
          const flight = keep(`helicopter:${p}:${n}`, () => helicopter(p, n))!;
          out.push(flight);
        }
      }
      const reachBalloon = REACH.balloon + BALLOON_FLIGHT * BALLOON_DRIFT_MAX + 400;
      const balloonSlot = Math.floor(seconds / BALLOON_SLOT);
      for (const p of balloonTowns) {
        if (!within(p, direction, reachBalloon)) continue;
        const id = `balloon:${p}:${balloonSlot}`;
        if (grounded.has(id)) continue;
        const flight = keep(id, () => balloon(p, balloonSlot));
        if (flight === null) {
          grounded.add(id);
          continue;
        }
        if (seconds >= flight.from && seconds < flight.to && near(flight, direction, seconds)) out.push(flight);
      }
      const airshipSlot = Math.floor(seconds / AIRSHIP_SLOT);
      for (const p of airshipCities) {
        if (!within(p, direction, REACH.airship + AIRSHIP_RUN + 400)) continue;
        const id = `airship:${p}:${airshipSlot}`;
        if (grounded.has(id)) continue;
        const flight = keep(id, () => airship(p, airshipSlot));
        if (flight === null) {
          grounded.add(id);
          continue;
        }
        if (seconds >= flight.from && seconds < flight.to && near(flight, direction, seconds)) out.push(flight);
      }
      // Forget what has not been asked for in a while.
      if (scan % 16 === 0) {
        for (const [id, entry] of kept) if (scan - entry.seen > 32) kept.delete(id);
        if (grounded.size > 4096) grounded.clear();
      }
      return out;
    },
  };
}

// ---------------------------------------------------------------------------
// Drawing them
// ---------------------------------------------------------------------------

/**
 * The airliners' haze, which is **not** the land's: measured over the horizon
 * of the sphere they fly on, as the cloud deck's is (`hazeAt` in `clouds.ts`),
 * so from the ground an airliner at cruise is seen seven thousand units off
 * while the hills close at one.
 */
export function airlinerFar(altitude: number): number {
  const above = Math.max(0, altitude);
  const horizon = Math.sqrt(2 * PLANET_RADIUS * (above + CRUISE));
  return horizon * (1.05 + (above / PLANET_RADIUS) * 6) * weatherHazeAt(altitude);
}

/** Samples a contrail, and seconds between them: a trail a minute long. */
const TRAIL_POINTS = 40;
const TRAIL_STEP = 1.5;
/** Its width at the engine and a minute later, in units. */
const TRAIL_NEAR = 1.6;
const TRAIL_FAR = 15;
/** Seconds behind the engines before it shows: a real one condenses a few lengths back. */
const TRAIL_GAP = 2.5;
/** It forms only this high, and in full above the second. */
const TRAIL_ALTITUDE: readonly [number, number] = [1250, 1550];
const TRAILS = CAPS.airliner * 2;

/** What `main.ts` hands a frame. */
export interface AirFrame {
  dt: number;
  /** The sky's clock, seconds. */
  seconds: number;
  camera: THREE.Camera;
  /** The player, from the planet's centre. */
  player: THREE.Vector3;
  /** The altitude every streamer is handed. */
  altitude: number;
  /** The land's fog's far distance. */
  fogFar: number;
  /** `sky.state.daylight`, 0 night to 1 day. */
  daylight: number;
}

/** The nearest flyer of a voice, for the ear: how far, and how fast it closes. */
export interface Passing {
  distance: number;
  /** Units a second toward the listener; negative going away. */
  closing: number;
}

export interface AirTraffic {
  readonly group: THREE.Group;
  readonly schedule: AirSchedule;
  update(frame: AirFrame): void;
  /** Every drawn flyer the effects follow — the light planes, the helicopters, the balloons — as `effects.ts`'s visitor takes them. */
  eachFlyer(visit: (object: THREE.Object3D, kind: CraftKind, model: CraftModel | null) => void): void;
  /** The nearest of each voice this frame, or null. */
  readonly passing: Record<'prop' | 'rotor' | 'jet', Passing | null>;
  enabled: boolean;
  readonly stats: {
    flights: number;
    drawn: Record<FlyerKind, number>;
    ms: number;
  };
}

export interface AirOptions {
  source: AirSource;
  /** The takeable craft: the light plane, the helicopter and the balloon are drawn from these. */
  craft: ReadonlyMap<string, CraftModel>;
}

const CRAFT_OF: Partial<Record<FlyerKind, string>> = { plane: 'light-plane', helicopter: 'helicopter', balloon: 'balloon' };
const KIND_OF: Partial<Record<FlyerKind, CraftKind>> = { plane: 'plane', helicopter: 'helicopter', balloon: 'balloon' };
const RESCAN_S = 0.5;
const RESCAN_MOVE = 250;

interface Drawn {
  flight: Flight;
  object: THREE.Group;
  key: string;
  model: CraftModel | null;
  pose: FlyerPose;
  distance: number;
  frame: number;
}

export function createAirTraffic(options: AirOptions): AirTraffic {
  const { source, craft } = options;
  const schedule = createAirSchedule(source);
  const group = new THREE.Group();
  group.name = 'air-traffic';

  // The airliners and the airship are nobody's craft; give the airship's
  // propellers the motion's discs by handing it a stand-in model.
  const airshipModel: CraftModel = {
    id: 'airship',
    kind: 'plane',
    medium: 'air',
    size: [AIRSHIP_LENGTH, AIRSHIP_LENGTH * 0.25, AIRSHIP_LENGTH * 0.3],
    seats: [],
    draft: 0,
    variants: AIRSHIP_PAINTS_COUNT,
    build: buildAirship,
  };
  // The airliner is drawn in its own haze, not the land's fog.
  let airlinerMaterial: THREE.Material | null = null;

  const pools = new Map<string, THREE.Group[]>();
  function take(kind: FlyerKind, variant: number): { object: THREE.Group; model: CraftModel | null; key: string } | null {
    const key = `${kind}:${variant}`;
    const free = pools.get(key);
    const model = kind === 'airship' ? airshipModel : CRAFT_OF[kind] !== undefined ? (craft.get(CRAFT_OF[kind]!) ?? null) : null;
    if (kind !== 'airliner' && kind !== 'airship' && model === null) return null;
    let object = free?.pop();
    if (object === undefined) {
      object = kind === 'airliner' ? buildAirliner(variant) : model!.build(variant % Math.max(1, model!.variants));
      object.traverse((part) => {
        part.castShadow = false;
        part.receiveShadow = false;
        if (kind === 'airliner' && (part as THREE.Mesh).isMesh) {
          const mesh = part as THREE.Mesh;
          if (airlinerMaterial === null) {
            const hazed = (mesh.material as THREE.MeshToonMaterial).clone();
            hazed.fog = false;
            airlinerMaterial = hazed;
            airlinerMaterial.userData = { ...(mesh.material as THREE.Material).userData };
          }
          mesh.material = airlinerMaterial;
        }
      });
      object.matrixAutoUpdate = true;
      group.add(object);
    }
    object.visible = true;
    return { object, model: kind === 'airliner' ? null : model, key };
  }
  function give(entry: Drawn): void {
    entry.object.visible = false;
    let free = pools.get(entry.key);
    if (free === undefined) pools.set(entry.key, (free = []));
    free.push(entry.object);
  }

  // --- the contrails -----------------------------------------------------------

  const trailVertices = TRAILS * TRAIL_POINTS * 2;
  const trailPosition = new Float32Array(trailVertices * 3);
  const trailColor = new Float32Array(trailVertices * 4);
  const trailIndex: number[] = [];
  for (let t = 0; t < TRAILS; t++) {
    for (let k = 0; k + 1 < TRAIL_POINTS; k++) {
      const a = (t * TRAIL_POINTS + k) * 2;
      trailIndex.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const trailGeometry = new THREE.BufferGeometry();
  trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPosition, 3).setUsage(THREE.DynamicDrawUsage));
  trailGeometry.setAttribute('color', new THREE.BufferAttribute(trailColor, 4).setUsage(THREE.DynamicDrawUsage));
  trailGeometry.setIndex(trailIndex);
  trailGeometry.setDrawRange(0, 0);
  // See-through and writing no depth, so no ink: a see-through fill shows its
  // whole hull through itself.
  const trailMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide,
  });
  trailMaterial.userData.outlineParameters = { visible: false };
  trailMaterial.name = 'contrail';
  const trails = new THREE.Mesh(trailGeometry, trailMaterial);
  trails.name = 'contrails';
  trails.frustumCulled = false;
  trails.renderOrder = 1;
  group.add(trails);

  // --- the lights: wingtips and strobes, after dark ------------------------------

  const LIGHTS = CAPS.airliner * 3 + (CAPS.plane + CAPS.helicopter + CAPS.airship) * 1;
  const lightPosition = new Float32Array(LIGHTS * 3);
  const lightColor = new Float32Array(LIGHTS * 4);
  const lightGeometry = new THREE.BufferGeometry();
  lightGeometry.setAttribute('position', new THREE.BufferAttribute(lightPosition, 3).setUsage(THREE.DynamicDrawUsage));
  lightGeometry.setAttribute('color', new THREE.BufferAttribute(lightColor, 4).setUsage(THREE.DynamicDrawUsage));
  lightGeometry.setDrawRange(0, 0);
  const lightMaterial = new THREE.PointsMaterial({
    size: 3.5,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  lightMaterial.userData.outlineParameters = { visible: false };
  lightMaterial.name = 'nav-lights';
  const lights = new THREE.Points(lightGeometry, lightMaterial);
  lights.name = 'nav-lights';
  lights.frustumCulled = false;
  lights.renderOrder = 2;
  group.add(lights);

  // --- the frame -------------------------------------------------------------------

  let candidates: Flight[] = [];
  let scanAt = -Infinity;
  const scanFrom = new THREE.Vector3(Infinity, 0, 0);
  const drawn = new Map<string, Drawn>();
  const eye = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const pose = flyerPose();
  const wire: number[] = new Array(9).fill(0);
  const ranked: { flight: Flight; distance: number }[] = [];
  const counts: Record<FlyerKind, number> = { airliner: 0, plane: 0, helicopter: 0, balloon: 0, airship: 0 };
  const motionInput: MotionInput = { ...AT_REST };
  const trailPose = flyerPose();
  const side = new THREE.Vector3();
  const toEye = new THREE.Vector3();
  const point = new THREE.Vector3();
  const lastPoint = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const velocity = new THREE.Vector3();
  let frameCount = 0;

  const passing: AirTraffic['passing'] = { prop: null, rotor: null, jet: null };
  const passings: Record<'prop' | 'rotor' | 'jet', Passing> = {
    prop: { distance: 0, closing: 0 },
    rotor: { distance: 0, closing: 0 },
    jet: { distance: 0, closing: 0 },
  };
  const voiceOf: Record<FlyerKind, 'prop' | 'rotor' | 'jet' | null> = {
    airliner: 'jet',
    plane: 'prop',
    airship: 'prop',
    helicopter: 'rotor',
    balloon: null,
  };

  const stats: AirTraffic['stats'] = {
    flights: 0,
    drawn: { airliner: 0, plane: 0, helicopter: 0, balloon: 0, airship: 0 },
    ms: 0,
  };

  function hideAll(): void {
    for (const entry of drawn.values()) give(entry);
    drawn.clear();
    trailGeometry.setDrawRange(0, 0);
    lightGeometry.setDrawRange(0, 0);
    passing.prop = passing.rotor = passing.jet = null;
  }

  const traffic: AirTraffic = {
    group,
    schedule,
    passing,
    enabled: true,
    stats,
    eachFlyer(visit) {
      for (const entry of drawn.values()) {
        const kind = KIND_OF[entry.flight.kind];
        if (kind !== undefined && entry.object.visible) visit(entry.object, kind, entry.model);
      }
    },
    update(frame) {
      const began = performance.now();
      if (!traffic.enabled) {
        if (drawn.size > 0) hideAll();
        group.visible = false;
        return;
      }
      group.visible = true;
      frameCount++;
      const { seconds } = frame;
      frame.camera.getWorldPosition(eye);
      direction.copy(frame.player).normalize();
      if (Math.abs(seconds - scanAt) > RESCAN_S || scanFrom.distanceTo(frame.player) > RESCAN_MOVE) {
        candidates = schedule.flightsNear(direction, seconds, []);
        scanAt = seconds;
        scanFrom.copy(frame.player);
        stats.flights = candidates.length;
      }

      // Which to draw: the nearest of each kind within its reach and the haze.
      const skyFar = airlinerFar(frame.altitude);
      ranked.length = 0;
      for (const flight of candidates) {
        if (seconds < flight.from || seconds >= flight.to) continue;
        flight.pose(seconds, pose);
        if (pose.shown <= 0.001) continue;
        const distance = pose.position.distanceTo(eye);
        const far = flight.kind === 'airliner' ? skyFar : Math.min(frame.fogFar * 1.05, REACH[flight.kind] + frame.altitude);
        if (distance > far) continue;
        ranked.push({ flight, distance });
      }
      ranked.sort((a, b) => a.distance - b.distance);
      for (const kind of FLYER_KINDS) counts[kind] = 0;
      for (const { flight, distance } of ranked) {
        if (counts[flight.kind] >= CAPS[flight.kind]) continue;
        counts[flight.kind]++;
        let entry = drawn.get(flight.id);
        if (entry === undefined) {
          const got = take(flight.kind, flight.variant);
          if (got === null) continue;
          entry = { flight, object: got.object, model: got.model, key: got.key, pose: flyerPose(), distance, frame: frameCount };
          drawn.set(flight.id, entry);
        }
        entry.distance = distance;
        entry.frame = frameCount;
      }
      for (const [id, entry] of drawn) {
        if (entry.frame === frameCount) continue;
        give(entry);
        drawn.delete(id);
      }

      // Stand them, turn their parts, and gather the trails, the lights and the voices.
      let trailCount = 0;
      let lightCount = 0;
      passing.prop = passing.rotor = passing.jet = null;
      const night = 1 - smooth(0.25, 0.6, frame.daylight);
      const white = 0.35 + 0.65 * frame.daylight;
      for (const entry of drawn.values()) {
        const { flight, object } = entry;
        const p = flight.pose(seconds, entry.pose);
        wire[0] = p.position.x;
        wire[1] = p.position.y;
        wire[2] = p.position.z;
        wire[3] = p.forward.x;
        wire[4] = p.forward.y;
        wire[5] = p.forward.z;
        wire[6] = p.up.x;
        wire[7] = p.up.y;
        wire[8] = p.up.z;
        applyPose(wire, object);
        object.scale.setScalar(Math.max(0.001, p.shown));
        if (entry.model !== null && flight.kind !== 'balloon') {
          motionInput.speed = p.speed;
          motionInput.grounded = p.grounded;
          motionInput.engine = true;
          motionInput.throttle = p.climb > 0 || p.grounded ? 1 : 0.6;
          motionOf(object, entry.model).update(frame.dt, motionInput);
        }

        // The voice: the nearest of each, and how fast it closes on the eye.
        const voice = voiceOf[flight.kind];
        if (voice !== null && (passing[voice] === null || entry.distance < passing[voice]!.distance)) {
          velocity.copy(p.forward).multiplyScalar(p.speed);
          toEye.subVectors(eye, p.position);
          const out = passings[voice];
          out.distance = entry.distance;
          out.closing = entry.distance > 1e-3 ? velocity.dot(toEye) / entry.distance : 0;
          passing[voice] = out;
        }

        // A beacon on everything with an engine, after dark; an airliner's
        // wingtips and a strobe on its tail.
        if (night > 0.01 && flight.kind !== 'balloon') {
          const flash = ((seconds * 1.1 + (flight.id.length % 5) * 0.23) % 1) < 0.12 ? 1 : 0;
          const put = (x: number, y: number, z: number, r: number, g: number, b: number, a: number): void => {
            if (lightCount >= LIGHTS) return;
            point.set(x, y, z).applyMatrix4(object.matrixWorld);
            lightPosition[lightCount * 3] = point.x;
            lightPosition[lightCount * 3 + 1] = point.y;
            lightPosition[lightCount * 3 + 2] = point.z;
            lightColor[lightCount * 4] = r;
            lightColor[lightCount * 4 + 1] = g;
            lightColor[lightCount * 4 + 2] = b;
            lightColor[lightCount * 4 + 3] = a * night * p.shown;
            lightCount++;
          };
          object.updateMatrixWorld();
          if (flight.kind === 'airliner') {
            const s = 17 * (AIRLINER_ENGINE_X / 5.7);
            put(s, AIRLINER_ENGINE_Y + 2.5, -5, 1, 0.2, 0.15, 1);
            put(-s, AIRLINER_ENGINE_Y + 2.5, -5, 0.2, 1, 0.35, 1);
            put(0, 2, -AIRLINER_LENGTH / 2, 1, 1, 1, flash);
          } else {
            put(0, flight.kind === 'airship' ? -12 : 0.2, 0, 1, 0.25, 0.15, flash);
          }
        }

        // The contrails: the flight's own past, through the air it flew.
        if (flight.kind === 'airliner' && trailCount + 2 <= TRAILS) {
          const far = skyFar;
          for (const hand of [1, -1]) {
            const base = trailCount * TRAIL_POINTS * 2;
            let have = false;
            for (let k = 0; k < TRAIL_POINTS; k++) {
              const at = seconds - k * TRAIL_STEP;
              const q = flight.pose(Math.max(flight.from, at), trailPose);
              side.crossVectors(q.up, q.forward).normalize();
              point.copy(q.position).addScaledVector(side, hand * AIRLINER_ENGINE_X).addScaledVector(q.up, AIRLINER_ENGINE_Y);
              if (k === 0) {
                tangent.copy(q.forward);
              } else {
                tangent.subVectors(lastPoint, point);
                if (tangent.lengthSq() < 1e-8) tangent.copy(q.forward);
                tangent.normalize();
              }
              lastPoint.copy(point);
              toEye.subVectors(eye, point);
              const distance = toEye.length();
              side.crossVectors(tangent, toEye).normalize();
              const age = k * TRAIL_STEP;
              const width = (TRAIL_NEAR + (TRAIL_FAR - TRAIL_NEAR) * (age / (TRAIL_POINTS * TRAIL_STEP))) / 2;
              const v = base + k * 2;
              trailPosition[v * 3] = point.x + side.x * width;
              trailPosition[v * 3 + 1] = point.y + side.y * width;
              trailPosition[v * 3 + 2] = point.z + side.z * width;
              trailPosition[v * 3 + 3] = point.x - side.x * width;
              trailPosition[v * 3 + 4] = point.y - side.y * width;
              trailPosition[v * 3 + 5] = point.z - side.z * width;
              const height = q.position.length() - PLANET_RADIUS;
              const alive = at >= flight.from ? 1 : 0;
              const alpha =
                alive *
                0.8 *
                smooth(0, TRAIL_GAP, age) *
                (1 - age / (TRAIL_POINTS * TRAIL_STEP)) ** 1.3 *
                smooth(TRAIL_ALTITUDE[0], TRAIL_ALTITUDE[1], height) *
                (1 - smooth(far * 0.6, far, distance)) *
                q.shown;
              if (alpha > 0.01) have = true;
              for (const c of [v, v + 1]) {
                trailColor[c * 4] = white;
                trailColor[c * 4 + 1] = white;
                trailColor[c * 4 + 2] = white * 1.02;
                trailColor[c * 4 + 3] = alpha;
              }
            }
            if (have) trailCount++;
          }
        }
      }
      trailGeometry.setDrawRange(0, trailCount * (TRAIL_POINTS - 1) * 6);
      (trailGeometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      (trailGeometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
      lightGeometry.setDrawRange(0, lightCount);
      (lightGeometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      (lightGeometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;

      for (const kind of FLYER_KINDS) stats.drawn[kind] = 0;
      for (const entry of drawn.values()) stats.drawn[entry.flight.kind]++;
      stats.ms = stats.ms * 0.9 + (performance.now() - began) * 0.1;
    },
  };
  return traffic;
}
