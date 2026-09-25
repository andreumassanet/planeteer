/**
 * How every vehicle is driven, and the two that came before them.
 *
 * **Nobody owns a vehicle any more.** The cars, launches, light aircraft and
 * balloons you find about the world are `src/craft/`'s models, placed by
 * `fleet.ts` and driven by `player.ts` on the numbers below — the medium's
 * speeds, turns and limits, and `isWater`, which is still what the sea is.
 * The launch and the floatplane that follow were everybody's own boat and
 * plane until then: summoned by walking into the sea and by a key, grown in
 * round the player, and shrunk away when he left them. They stay built for the
 * avatar's review sheet, which frames the body against them, and the history
 * of their sizing is below because every seat since was argued the same way.
 *
 * They exist for different reasons. The boat is what makes the sea a surface —
 * until it existed, walking into the ocean dropped you to sea level and you
 * carried on as if the water were a floor. The plane is the map: `rig.view`
 * already frames the player and the fog already opens with altitude, so
 * climbing until the globe fits the lens is a flight, not a screen.
 *
 * This file owns their shape and their numbers. `player.ts` owns the state
 * machine that rides them, because it owns `position`.
 *
 * ## Both of them are sized against the body, and neither used to be
 *
 * They are two of the three things the player looks at all session and the
 * third — `src/avatar.ts` — was rebuilt to the monument contract first. What
 * the rebuild made visible is that these two were built to numbers that had
 * never been checked against a person: the launch's console topped out at 1.30
 * units, which is **below the knee** of a 6.80 body (`FIGURE.kneeY` 1.66), so
 * the helmsman could not reach his own wheel; and the fuselage was a capsule
 * 4.40 across, so there was no height at which a 6.80 pilot could sit in it and
 * the model was simply dropped 0.9 into the hull.
 *
 * Every dimension below is now derived from one of two published records and
 * the derivation is written next to it:
 *
 * - **`FIGURE` in `src/avatar.ts`** — every height above the sole and every
 *   segment length of the body that rides these.
 * - **`SEATED` in `src/traffic/contract.ts`** — the same body sitting down,
 *   measured off built geometry by the crowd kit: origin at the seat surface,
 *   hip at y = 0, sole −1.75, crown +3.84, knee z +1.34, toe z +1.97,
 *   shoulder joint y +1.42, and **4.30 of clear width, which is the envelope
 *   and not the 2.60 across the shoulders**.
 *
 * Where the two disagree the player's own body wins, because it is the one that
 * is actually in the seat, and it is measured here rather than assumed: in the
 * `sit` pose it is 1.85 from hip to sole, 3.81 to the crown, 2.38 to the toe and
 * **1.21 behind the hip, because of the rucksack** — half a unit deeper than the
 * crowd's 0.72, which is the number a seat back would have been built to.
 *
 * ## They are built through the monument contract now
 *
 * They used to carry their own `craftMaterial`, their own 3-band ramp and their
 * own 0.006 pen, and their masses were a sphere, two capsules and a cone —
 * **smooth-shaded, which is the one thing this world's style cannot use.** It is
 * the same fault `avatar.ts` found and wrote down: `MeshToonMaterial` steps a
 * four-band ramp across a normal, and a smooth normal sweeps it continuously
 * instead. `createContext()` facets everything through `toNonIndexed`, hands out
 * the world's 24 colours and the world's 0.005 pen, and it made the plane
 * *cheaper* rather than dearer — a `CapsuleGeometry(2.2, 9, 4, 16)` is 512
 * triangles of subdivision the ramp cannot use.
 */
import * as THREE from 'three';
import { FIGURE } from './avatar.ts';
import { BODY_SCALE } from './stature.ts';
import { PLANET_RADIUS } from './globe.ts';
import { MAX_SLOPE } from './terrain.ts';
import { createContext } from './monuments/contract.ts';
import type { CraftKind } from './craft/contract.ts';

/**
 * One context, made at import, exactly as `avatar.ts` does it. `createContext`
 * registers its ramp with `theme.ts` so the moods repaint it, so it must be
 * made once and not once per craft.
 */
const ctx = createContext();
const P = ctx.palette;
const V = THREE.Vector3;

/**
 * Anything within this of sea level is water.
 *
 * Not zero: `elevationAt` returns land heights that terrain relief will start
 * varying, and a comparison against an exact radius would flicker between land
 * and sea on the shoreline. The lowest ground on the planet is `SHORE_LIP`,
 * four units, which is eight times this.
 */
const SEA_LEVEL_EPSILON = 0.5;

export function isWater(ground: number): boolean {
  return ground <= PLANET_RADIUS + SEA_LEVEL_EPSILON;
}

/**
 * Where the water's surface is taken to be, over the sea's own radius: what a
 * hull's waterline and a swimmer's chest ride on.
 *
 * Not zero, because the sea is not drawn at zero. The water sphere is exact at
 * its vertices and sags 0.39 between them, and the shallows along every coast
 * are lifted 0.35 to 0.75 over it (`LIFT_SHELF`, `LIFT_COAST` in `ocean.ts`),
 * so the surface anyone sees near a shore is about half a unit up. A hull
 * floated at zero sat visibly low in the surf; half a unit reads as afloat in
 * both places, and the half-unit either way is under the width of the pen.
 */
export const WATERLINE = 0.5;

// ---------------------------------------------------------------------------
// The numbers every craft is driven by
// ---------------------------------------------------------------------------
//
// The models are `src/craft/`'s. What stays here is how each medium is driven,
// because `player.ts` drives them and the camera, the audio and the fleet read
// the same numbers.

/**
 * A car on the road: cruise and flat out, in units a second — 45 is 128 km/h
 * at this scale's 1.267 units a metre and 75 a sprint no road here is long
 * enough to hold, which is the arcade point of it — and backwards, slowly.
 */
export const CAR_SPEED = 45;
export const CAR_BOOST = 75;
export const CAR_REVERSE = 12;
/** Time constants of the throttle, the brake and the coast, in seconds. */
export const CAR_ACCELERATION_TIME = 1.3;
export const CAR_BRAKE_TIME = 0.45;
export const CAR_COAST_TIME = 2.2;
/**
 * Full lock, radians a second, reached from `CAR_GRIP_SPEED` up: a car does not
 * turn standing still, and a car that turned at full rate from a crawl spun on
 * the spot.
 */
export const CAR_TURN = 1.25;
export const CAR_GRIP_SPEED = 10;
/**
 * How long the wheel takes to go over to a lock, in seconds, and how much of
 * the lock is left at `CAR_BOOST`. The key used to be the lock, on the frame
 * it went down, which is a car that twitches; and full lock at 75 units a
 * second is a 60-unit circle, which at that speed is a spin.
 */
export const CAR_STEER_TIME = 0.15;
export const CAR_FAST_LOCK = 0.6;
/**
 * A car driven into a wall: the share of its speed it comes back off it at,
 * and the speed lost at a stroke that counts as a crash rather than a nudge,
 * in units a second (about a third of the cruise). A crash is told
 * (`PlayerEvent`), so whatever wants to shake, spark or bang can.
 */
export const CAR_BOUNCE = 0.25;
export const CRASH_SPEED = 14;
/**
 * The most a wheel climbs in one go without it being a wall, in units: a kerb
 * is 0.4, a terrace riser four, and a car climbs the first and not the second.
 */
export const CAR_STEP = 1.1;

/**
 * The balloon: it drifts, it does not fly. Its speed along the heading you
 * steer, the most it rises or sinks a second, how fast it turns, and the
 * highest it goes above the sea.
 */
export const BALLOON_SPEED = 10;
export const BALLOON_CLIMB = 9;
/**
 * How the burner and the vent take hold, in seconds: a balloon is slow to
 * start rising and slow to stop. And near the ground it settles rather than
 * drops: the sink is held under this share of the basket's height a second,
 * and never under `BALLOON_TOUCHDOWN`.
 */
export const BALLOON_LIFT_TIME = 1.25;
export const BALLOON_SETTLE = 0.5;
export const BALLOON_TOUCHDOWN = 1.5;
export const BALLOON_TURN = 0.45;
export const BALLOON_CEILING = 2400;

// ---------------------------------------------------------------------------
// Handling, a kind at a time
// ---------------------------------------------------------------------------

const DEG_ = Math.PI / 180;

/**
 * How a vehicle on wheels — or hooves — is driven: `player.ts`'s `drive`
 * reads one of these for whatever it is in, so a bus and a bicycle are the
 * same code with different numbers, and the car's row is the car constants
 * above, unchanged.
 *
 * - `speed`, `boost`, `reverse`: units a second at `W`, with `Shift`, and
 *   backwards.
 * - `accelerationTime`, `brakeTime`, `coastTime`: the ease's time constants.
 * - `turn`, `gripSpeed`, `fastLock`, `steerTime`: the steering law of
 *   `steerWheels` — full lock in radians a second from `gripSpeed` up, what
 *   is left of it at `boost`, and how long the bars go over in.
 * - `pivot`: the share of the turn left standing still. A car has none; a
 *   horse turns on its haunches.
 * - `step`, `slope`: the most it climbs in one go without it being a wall, and
 *   the steepest ground it climbs, as a gradient.
 * - `rough`: the share of its speed it keeps off anything made — off the
 *   carriageway and the paving, on grass, sand or scree.
 * - `lean`: how far a two-wheeler or a rider banks into a turn at full
 *   lateral pull, radians; 0 for a car, whose body rolls out of the turn on
 *   its springs instead (`craft/motion.ts`).
 * - `wheelie`: radians of nose-up a unit a second squared of acceleration
 *   gives a motorbike, and the most of it; 0 for anything else.
 * - `bounce`: the share of its speed it comes back off a wall at.
 */
export interface RoadHandling {
  speed: number;
  boost: number;
  reverse: number;
  accelerationTime: number;
  brakeTime: number;
  coastTime: number;
  turn: number;
  gripSpeed: number;
  fastLock: number;
  steerTime: number;
  pivot: number;
  step: number;
  slope: number;
  rough: number;
  lean: number;
  wheelie: number;
  bounce: number;
}

const CAR: RoadHandling = {
  speed: CAR_SPEED,
  boost: CAR_BOOST,
  reverse: CAR_REVERSE,
  accelerationTime: CAR_ACCELERATION_TIME,
  brakeTime: CAR_BRAKE_TIME,
  coastTime: CAR_COAST_TIME,
  turn: CAR_TURN,
  gripSpeed: CAR_GRIP_SPEED,
  fastLock: CAR_FAST_LOCK,
  steerTime: CAR_STEER_TIME,
  pivot: 0,
  step: CAR_STEP,
  slope: MAX_SLOPE,
  rough: 1,
  lean: 0,
  wheelie: 0,
  bounce: CAR_BOUNCE,
};

/**
 * Every road kind's handling. Speeds against the body's own: a walk is 6.5
 * units a second and a run 20 (`avatar.ts`), a car 45.
 *
 * - **Bicycle**: between a run and a car, 26 pedalled and 36 out of the
 *   saddle, slow to wind up and long to coast; it keeps three quarters of it
 *   on grass and a track, climbs a little less than a car, turns tighter and
 *   leans hard into it.
 * - **Motorbike**: as fast as a car and quicker off the mark, leaning further
 *   than anything, the front coming up under a hard throttle.
 * - **Tuk-tuk**: a three-wheeler's thirty, quick to turn, nervous off the road.
 * - **Bus**: slow to go and slower to stop, a wide turn and a long wheelbase's
 *   reluctance to follow it, and a road vehicle off one.
 * - **Tractor**: a walking pace and a half, all of it anywhere, and up a
 *   bank no car takes.
 * - **Jeep**: short of a car on the road and as fast off it, over a kerb and
 *   up a hillside of forty-two degrees.
 * - **Horse**: a canter at `W` and a gallop with `Shift`; it turns standing
 *   still, keeps its pace anywhere and climbs what a hill path climbs.
 */
export const ROAD_HANDLING: Partial<Record<CraftKind, RoadHandling>> = {
  car: CAR,
  van: CAR,
  bicycle: {
    ...CAR,
    speed: 26, boost: 36, reverse: 3,
    accelerationTime: 1.6, brakeTime: 0.6, coastTime: 5,
    turn: 1.9, gripSpeed: 4, fastLock: 0.55, steerTime: 0.18,
    step: 0.9, slope: Math.tan(26 * DEG_), rough: 0.75, lean: 0.5, bounce: 0.2,
  },
  motorbike: {
    ...CAR,
    speed: 48, boost: 82, reverse: 4,
    accelerationTime: 0.9, brakeTime: 0.4, coastTime: 2.6,
    turn: 1.7, gripSpeed: 6, fastLock: 0.5, steerTime: 0.14,
    rough: 0.8, lean: 0.62, wheelie: 0.006, bounce: 0.2,
  },
  tuktuk: {
    ...CAR,
    speed: 30, boost: 40, reverse: 8,
    accelerationTime: 1.5, brakeTime: 0.5, coastTime: 2,
    turn: 1.6, gripSpeed: 6, fastLock: 0.7, steerTime: 0.15,
    step: 1, rough: 0.7,
  },
  bus: {
    ...CAR,
    speed: 32, boost: 44, reverse: 8,
    accelerationTime: 2.6, brakeTime: 0.8, coastTime: 3.5,
    turn: 0.8, gripSpeed: 10, steerTime: 0.3,
    slope: Math.tan(24 * DEG_), rough: 0.6,
  },
  tractor: {
    ...CAR,
    speed: 16, boost: 22, reverse: 8,
    accelerationTime: 1.2, brakeTime: 0.5, coastTime: 1.5,
    turn: 1, gripSpeed: 4, fastLock: 0.8, steerTime: 0.25,
    step: 1.6, slope: Math.tan(40 * DEG_), rough: 1, bounce: 0.1,
  },
  jeep: {
    ...CAR,
    speed: 40, boost: 62, reverse: 12,
    accelerationTime: 1.4, brakeTime: 0.5, coastTime: 2.4,
    turn: 1.2, gripSpeed: 8, steerTime: 0.16,
    step: 1.6, slope: Math.tan(42 * DEG_), rough: 1,
  },
  horse: {
    ...CAR,
    speed: 15, boost: 34, reverse: 3,
    accelerationTime: 1, brakeTime: 0.6, coastTime: 0.9,
    turn: 2.2, gripSpeed: 3, fastLock: 0.55, steerTime: 0.2, pivot: 0.5,
    step: 1.4, slope: Math.tan(38 * DEG_), rough: 1, lean: 0.12, bounce: 0.3,
  },
};

/**
 * How a hull is driven: `sail` in `player.ts`. The launch's row is the boat
 * constants below; the rest, besides their speeds and their turn:
 *
 * - `accelerationTime`, `rudderTime`: the throttle's and the helm's eases.
 * - `astern`: the share of `speed` it backs at.
 * - `heel`: how far it rolls in a turn, radians; `bank` in `player.ts` heels a
 *   displacement hull out of a turn and a planing one into it.
 * - `bow`: how far the bow comes up onto the plane, radians.
 * - `hop`: how far it leaps off the chop at speed, units — a jet ski's; 0
 *   for a hull that sits in the water.
 * - `list`: a constant heel, radians, the wind's in a sail.
 */
export interface WaterHandling {
  speed: number;
  boost: number;
  turn: number;
  accelerationTime: number;
  rudderTime: number;
  astern: number;
  heel: number;
  bow: number;
  hop: number;
  list: number;
}

/**
 * - **Jet ski**: nearly the launch's speed, twice its turn, a quarter of its
 *   wind-up, banked hard into every turn and skipping off the chop.
 * - **Sailboat**: the wind's pace, eighteen and twenty-four with the sheet
 *   hauled in (`Shift`); slow to come round and slow to gather way, heeled
 *   over whatever it does. The wind is constant here: a sail that trims to a
 *   wind needs a wind the world does not have yet.
 */
export const WATER_HANDLING: Partial<Record<CraftKind, WaterHandling>> = {
  jetski: { speed: 40, boost: 76, turn: 2.3, accelerationTime: 0.55, rudderTime: 0.1, astern: 0.3, heel: 0.45, bow: 0.1, hop: 0.35, list: 0 },
  sailboat: { speed: 18, boost: 24, turn: 0.75, accelerationTime: 3.5, rudderTime: 0.45, astern: 0.15, heel: 0.12, bow: 0.02, hop: 0, list: 0.16 },
};

/**
 * The helicopter: its cruise and how far backwards, units a second; its climb
 * and descent; its yaw on the pedals, radians a second; the eases of the
 * cyclic (the speed) and the collective (the climb); how far the nose goes
 * down at full cruise and the bank at a full-rate turn; and the highest it
 * goes over the sea. It comes down anywhere flatter than `HELI_LANDING_GRADE`
 * and hovers over water.
 */
export const HELI_SPEED = 70;
export const HELI_REVERSE = 14;
export const HELI_CLIMB = 22;
export const HELI_SINK = 16;
export const HELI_TOUCHDOWN = 3;
export const HELI_TURN = 1.3;
export const HELI_ACCELERATION_TIME = 1.4;
export const HELI_VERTICAL_TIME = 0.6;
export const HELI_NOSE = 0.2;
export const HELI_BANK = 0.3;
export const HELI_CEILING = 2600;
export const HELI_LANDING_GRADE = Math.tan(16 * DEG_);
/** How long the rotor takes to wind up before it lifts, in seconds. */
export const HELI_SPOOL = 1.2;

/**
 * The fastest a kind goes, units a second, with room: what `effects.ts` takes
 * a move for travel rather than a jump by, and the audio's throttle's top.
 */
export function topSpeedOf(kind: CraftKind): number {
  const road = ROAD_HANDLING[kind];
  if (road !== undefined) return road.boost;
  const water = WATER_HANDLING[kind];
  if (water !== undefined) return water.boost;
  switch (kind) {
    case 'boat':
      return BOAT_BOOST;
    case 'plane':
      return PLANE_CRUISE_HIGH;
    case 'balloon':
      return BALLOON_SPEED + BALLOON_CLIMB;
    case 'helicopter':
      return HELI_SPEED + HELI_CLIMB;
    default:
      return CAR_BOOST;
  }
}

// ---------------------------------------------------------------------------
// A lofted shell
// ---------------------------------------------------------------------------

/**
 * One section of a lofted shell, in the shell's own frame.
 *
 * `z` runs aft to forward and must strictly increase; the section is a
 * rectangle `[x - half, x + half]` by `[bottom, top]`. A hull, a float, a
 * fuselage and a wing panel are all this shape and nothing else in the monument
 * contract makes it: `box` cannot taper, `taper` is square in section, and
 * `column` is a prism about Y.
 */
interface Station {
  z: number;
  /** Centre of the section in x. Non-zero draws one side of something. */
  x?: number;
  /** Half-width. Small rather than zero at a stem, or the end cap is degenerate. */
  half: number;
  bottom: number;
  top: number;
}

/**
 * A closed box-section loft: four runs of quads between the stations and a cap
 * at each end.
 *
 * **The winding is the whole of it**, and it is a trap this project has met
 * twice over: a shell wound inside out has every face pointing into itself, so
 * `OutlineEffect`'s `BackSide` hull becomes front-facing and the mesh renders
 * as a solid ink blob. Nothing about the geometry says which way round it is,
 * so the check is arithmetic — the signed volume of the closed shell, by the
 * divergence theorem, must come out **positive**. `assertOutward` below is that
 * check and it runs on every shell this file builds.
 *
 * Written non-indexed on purpose, which is what `computeVertexNormals` needs to
 * give one normal per face — the same reason the land mesh is non-indexed and
 * the same reason `createContext` calls `toNonIndexed` on everything.
 */
function shell(stations: readonly Station[], color: number): THREE.Mesh {
  const p: number[] = [];
  const corners = (s: Station): number[][] => {
    const x = s.x ?? 0;
    return [
      [x - s.half, s.bottom, s.z],
      [x + s.half, s.bottom, s.z],
      [x + s.half, s.top, s.z],
      [x - s.half, s.top, s.z],
    ];
  };
  // Counter-clockwise seen from outside, so the normal points away.
  const quad = (a: number[], b: number[], c: number[], d: number[]) => {
    p.push(...a, ...b, ...c, ...a, ...c, ...d);
  };

  for (let i = 0; i + 1 < stations.length; i++) {
    const A = corners(stations[i]!);
    const B = corners(stations[i + 1]!);
    quad(A[1]!, A[2]!, B[2]!, B[1]!); // starboard, +x
    quad(A[3]!, A[0]!, B[0]!, B[3]!); // port, -x
    quad(A[0]!, A[1]!, B[1]!, B[0]!); // bottom, -y
    quad(A[2]!, A[3]!, B[3]!, B[2]!); // top, +y
  }
  const first = corners(stations[0]!);
  quad(first[3]!, first[2]!, first[1]!, first[0]!); // aft cap, -z
  const last = corners(stations[stations.length - 1]!);
  quad(last[0]!, last[1]!, last[2]!, last[3]!); // forward cap, +z

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  geometry.computeVertexNormals();
  assertOutward(p, stations);
  return new THREE.Mesh(geometry, ctx.toon(color));
}

/**
 * Six times the signed volume of a closed triangle soup. Positive is outward.
 *
 * Thrown rather than warned, because a reversed shell is not a subtle fault:
 * the whole mesh draws in the outline colour, and the last time this project
 * met it, it cost a full round of accusing `src/outline.ts` of a bug it did not
 * have.
 */
function assertOutward(p: readonly number[], stations: readonly Station[]): void {
  let volume = 0;
  for (let i = 0; i < p.length; i += 9) {
    const ax = p[i]!, ay = p[i + 1]!, az = p[i + 2]!;
    const bx = p[i + 3]!, by = p[i + 4]!, bz = p[i + 5]!;
    const cx = p[i + 6]!, cy = p[i + 7]!, cz = p[i + 8]!;
    volume +=
      ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  if (volume <= 0) {
    throw new Error(
      `shell is wound inside out (6V = ${volume.toFixed(2)}): stations must run aft to forward ` +
        `with strictly increasing z. First station z = ${stations[0]!.z}, last = ${stations[stations.length - 1]!.z}.`,
    );
  }
}

/** Linear interpolation along a table keyed on `z`. */
function alongZ<K extends string>(
  table: readonly ({ z: number } & Record<K, number>)[],
  key: K,
  z: number,
): number {
  if (z <= table[0]!.z) return table[0]![key];
  for (let i = 0; i + 1 < table.length; i++) {
    const a = table[i]!;
    const b = table[i + 1]!;
    if (z <= b.z) return a[key] + ((b[key] - a[key]) * (z - a.z)) / (b.z - a.z);
  }
  return table[table.length - 1]![key];
}

// ---------------------------------------------------------------------------
// The launch
// ---------------------------------------------------------------------------

/**
 * Where the player stands in the boat: the deck, above the waterline.
 *
 * It is also the launch's own datum — `y = 0` in `buildBoat` is the cockpit
 * sole, so the waterline is at `-BOAT_DECK` and a review sheet has to put its
 * water disc there. That is what the boat cell in `/sheets/avatar.html` does.
 */
export const BOAT_DECK = 2 * BODY_SCALE;
/**
 * Cruise and full ahead, in the launch's own lengths: five and a bit a second
 * at cruise, twelve flat out — 24 and 55 m/s, a fast launch and a racing one.
 * They were 115 and 250 while the launch was built three times the world's
 * scale (`atCraftScale`), which at its size now would be twenty lengths a
 * second. Oceans are the plane's; the launch is for a coast, a lake and the
 * crossing to the next island, which at these speeds is seconds.
 */
export const BOAT_SPEED = 30;
export const BOAT_BOOST = 70;
/** Rudder, radians per second. A half turn in 2.7 s. */
export const BOAT_TURN = 1.15;
export const BOAT_ACCELERATION_TIME = 1.1;

/**
 * The launch's plan, aft to forward: half-beam at the sheer and the keel under
 * it. Everything else about the hull is interpolated off this one table, so the
 * topsides, the rubbing strake, the sole and the foredeck cannot disagree with
 * the underbody about where the side of the boat is.
 *
 * **The beam is the pilot's, not a boat's.** The hull it replaced was **4.80
 * wide overall** against a pilot who measured **4.84 across** with his hands
 * out: his knuckles hung over both gunwales. 7.00 of beam less 0.34 of topside
 * each side is 6.32 of clear cockpit.
 *
 * **The 4.84 is a pose that no longer exists and the beam is right anyway**,
 * which is worth stating rather than quietly restating the new number. That
 * measurement was `brace`, arms out against nothing, because the launch had
 * nothing to hold; `avatar.ts` gives this craft `steer` now and a man with both
 * hands on a wheel measures **3.82**. Re-derived from 3.82 the hull would want
 * about 5.5, and it stays at 7.00 for the reason the paragraph below already
 * gives — the length follows from the beam, and 17.80 by 5.50 is L/B 3.24,
 * outside what an open launch is. The beam is now the *hull's* number, checked
 * against the pilot rather than derived from him, and the pilot clears it by
 * 1.25 either side instead of 0.74.
 *
 * Length follows from the beam and not from taste: 17.80 by 7.00 is L/B 2.54,
 * where a real open launch runs 2.5 to 3.0. Against the avatar it is 2.6 body
 * heights, which is a 1.75 m man in a 4.6 m boat — the old hull was 11.26, or
 * **1.66 body heights, a man in a 2.9 m dinghy**.
 */
const HULL = [
  { z: -8.9, half: 3.05, keel: -2.55 },
  { z: -5.2, half: 3.46, keel: -3.14 },
  { z: -0.6, half: 3.5, keel: -3.2 },
  { z: 3.2, half: 3.16, keel: -2.92 },
  { z: 6.4, half: 2.1, keel: -2.1 },
  { z: 8.9, half: 0.34, keel: -0.85 },
] as const;

const TRANSOM = HULL[0].z;
const STEM = HULL[HULL.length - 1]!.z;
/** Thickness of the topsides, and how far the sole is inset from the skin. */
const TOPSIDE = 0.34;
/** Sole to sheer. 2.10 is 31% of `FIGURE.height` — a gunwale under `hipY` (3.00). */
const SHEER = 2.1;
/** Where the foredeck begins, which is the forward face of the console. */
const FOREDECK = 2.2;

const halfAt = (z: number) => alongZ(HULL, 'half', z);

/**
 * Half the hull plus a margin: how far ahead of the origin land stops the boat.
 *
 * **Re-derived, not nudged.** The helm is amidships, so one constant serves
 * both ends, and the end it has to serve is the *longer* one — which is the
 * stern, because the outboard hangs 1.0 off a transom at 8.90. The old 9 was
 * `5.51 + 3.49` on a hull 11.26 long; this is `9.90 + 3.60` on one that measures
 * 18.79 from skeg to stem. **The margin is what did not change**, and it should not:
 * what it absorbs is a coast lying between the three bearings `HULL_PROBES`
 * samples, which is a fact about the sampling and not about the hull.
 *
 * What it spends is `SHORE_REACH`: see there.
 */
export const BOAT_BOW = 13.5 * BODY_SCALE;

/**
 * How far inland stepping ashore puts you.
 *
 * **It has to exceed `BOAT_BOW`**, because the hull is stopped by land found at
 * `BOAT_BOW` ahead — step short of that and you disembark into the water you
 * were floating on. It used to also have to clear a 20-unit coastal cliff, and
 * that job is gone: the shore ramps now, so there is no lip to land on.
 *
 * 22 against a `BOAT_BOW` of 13.5 lands you 8.5 units past the first land the
 * probe found. **Measured in the live world rather than derived**: driving at
 * fifteen real coasts until the hull stopped, land was 14.5 ahead — `BOAT_BOW`
 * plus a frame of travel — and `E` put the player on ground **4.0 to 14.2 units
 * above sea level**, every one of them over `SHORE_LIP` and an order of
 * magnitude over `SEA_LEVEL_EPSILON`, which is the test that decides whether
 * you are back in the boat. No case stranded.
 */
export const SHORE_REACH = 22 * BODY_SCALE;

/**
 * Every mesh in a craft casts the sun's shadow and stands in everything
 * else's. Three reads the flags per mesh and not per group, hence the walk;
 * called once per build, after the last part is added.
 */
function castShadows(group: THREE.Object3D): void {
  group.traverse((object) => {
    if ((object as THREE.Mesh).isMesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
}

/**
 * A small open launch, facing +Z, with the cockpit sole at `y = 0` so the
 * avatar stands on it with no offset, and the helm amidships at `z = 0`.
 *
 * **The console is the point of this model, and it is two boxes because the
 * pose has two heights in it.** It used to be one box 1.30 tall — knee height
 * on a body whose knee is at 1.66 — and `avatar.ts` says so in `brace`'s own
 * comment: *he cannot reach the wheel without kneeling on it*. Measured off the
 * braced pose, the two heights are:
 *
 * - **The hands are at y 2.14 to 2.67, z 0.56 to 0.97, x 1.92 to 2.41.** So the
 *   console's after ledge is 5.0 wide with its top at 2.19 and it runs from
 *   z 0.50 to 1.35: both palms come down on it, 0.05 in, which is a hand
 *   resting on something rather than hovering over it.
 * - **The wheel is what he has to be able to take**, and its hub is at
 *   (0, 3.72, 1.15) on a binnacle whose top is at 3.10. Each hand's own side of
 *   the rim is **1.48 from that shoulder joint against an arm of 2.48 — 60% of
 *   full reach**, and the furthest point of the rim, which is the far side he
 *   would never use, is 93%. The old console's top edge was 155%.
 *
 * What is still owed is a pose: `brace` puts the hands on the ledge and not on
 * the wheel, because it was written for a boat that had nothing to hold. That
 * is `avatar.ts`, and the geometry it would need is now there.
 */
/**
 * **Both craft are built on the 6.8-unit body they were designed round and
 * shown at the person's scale.** Every number in this file — the hull, the
 * bench, the helm, the seat, the floats — is in that body's units and argued
 * from its knees and hips; since a person came down to 3.77 units
 * (2026-09-24, `stature.ts`) each model is built as it always was and wrapped
 * in a group scaled by `BODY_SCALE`, and the few numbers `player.ts` reads —
 * the deck, the bow, the reach ashore, the seat and the floats' clearance — are
 * exported at the same scale. A scale of one positive number is no mirror.
 */
function atCraftScale(model: THREE.Group): THREE.Group {
  const scaled = new THREE.Group();
  scaled.name = model.name;
  scaled.add(model);
  scaled.scale.setScalar(BODY_SCALE);
  return scaled;
}

export function buildBoat(): THREE.Group {
  const group = new THREE.Group();

  // The underbody, keel to just under the sole. Its top is at -0.16 rather than
  // at 0 so the sole plate can sit in the recess instead of standing on it: two
  // coplanar faces get no ink between them, and a 0.16 step gets one.
  group.add(
    shell(
      HULL.map((s) => ({ z: s.z, half: s.half, bottom: s.keel, top: -0.16 })),
      P.cream,
    ),
  );

  // The cockpit sole, inset by the topsides so it meets them rather than
  // crossing them.
  const soleStations = [TRANSOM, -5.2, -0.6, FOREDECK].map((z) => ({
    z,
    half: halfAt(z) - TOPSIDE,
    bottom: -0.16,
    top: 0,
  }));
  group.add(shell(soleStations, P.bark));

  // Topsides and rubbing strake, one loft a side. They start at -0.20, below
  // the underbody's top, so there is no gap in the skin at the sole line.
  for (const side of [-1, 1]) {
    group.add(
      shell(
        HULL.map((s) => ({
          z: s.z,
          x: side * (s.half - TOPSIDE / 2),
          half: TOPSIDE / 2,
          bottom: -0.2,
          top: SHEER,
        })),
        P.cream,
      ),
    );
    // Proud of the skin by 0.16, so it is a strake and not a stripe painted on
    // one: a flush band would be coplanar and would draw no ink of its own.
    group.add(
      shell(
        HULL.map((s) => ({ z: s.z, x: side * s.half, half: 0.16, bottom: 1.46, top: 1.86 })),
        P.red,
      ),
    );
  }

  // The foredeck: a plate at the sheer, from the console forward to the stem.
  group.add(
    shell(
      [FOREDECK, 3.2, 6.4, STEM].map((z) => ({
        z,
        half: halfAt(z) - 0.02,
        bottom: 1.76,
        top: SHEER,
      })),
      P.cream,
    ),
  );

  const transom = ctx.box(halfAt(TRANSOM) * 2 - TOPSIDE * 2, SHEER, 0.36, P.cream);
  transom.position.set(0, -0.2, TRANSOM + 0.18);
  group.add(transom);

  // A hatch, proud by 0.1. The foredeck is 6.7 units of unbroken pale plate and
  // the largest flat area on the boat; the same argument as Niagara's curtain.
  const hatch = ctx.box(2.2, 0.1, 2.4, P.tan);
  hatch.position.set(0, SHEER, 5.1);
  group.add(hatch);

  // ---- the helm -----------------------------------------------------------

  // The after ledge, at the height of the braced hands. 5.0 wide because the
  // hands are 4.82 apart; the pose splays the arms and that is what sets it.
  const ledge = ctx.box(5.0, 2.19, 0.85, P.tan);
  ledge.position.set(0, 0, 0.925);
  group.add(ledge);

  // The binnacle, stepped 0.06 forward of the ledge's own face so the two do
  // not share a plane, and narrow enough that the hands pass outside it.
  const binnacle = ctx.box(3.4, 3.1, FOREDECK - 1.41, P.tan);
  binnacle.position.set(0, 0, (1.41 + FOREDECK) / 2);
  group.add(binnacle);

  // Instruments, standing 0.18 proud of the binnacle's aft face rather than
  // flush with it, and above the ledge so they are not hidden by it.
  const instruments = ctx.box(2.8, 0.62, 0.18, P.steel);
  instruments.position.set(0, 2.32, 1.32);
  group.add(instruments);

  const H = BOAT_HELM;
  const hub = new V(H.hub[0], H.hub[1], H.hub[2]);
  const column = ctx.strut(new V(0, 2.95, 1.72), hub.clone(), 0.17, P.steel);
  group.add(column);

  // The wheel. Ten sides rather than eight: at the boat framing, 46 units back,
  // the rim is about 20 px across, and this is the one feature on the craft
  // that says the player is steering it.
  const rim = ctx.ringWall(H.inner, H.outer, H.thickness, P.ink, 10);
  rim.position.copy(hub);
  // The wheel's axis is the column's: raked back 25 degrees off horizontal, so
  // the face is turned towards the helmsman and not laid flat like a bus.
  rim.rotation.x = H.rake;
  group.add(rim);
  group.add(ctx.strut(new V(-0.5, H.hub[1], H.hub[2]), new V(0.5, H.hub[1], H.hub[2]), H.thickness, P.ink));
  const boss = ctx.column(0.19, 0.2, P.gold, 6);
  boss.position.set(0, H.hub[1] - 0.04, H.hub[2] + 0.09);
  boss.rotation.x = H.rake;
  group.add(boss);

  // The screen rakes back off the binnacle to a top edge at 5.11 — **above the
  // helmsman's shoulders at 4.78**, and that is a visibility measurement rather
  // than a boat one. Raycast from the player's own camera at 784x388: the wheel,
  // its column, its spoke and its boss are **0 px** and the binnacle is 18,
  // because from dead astern the man is standing in front of his own helm, which
  // is what a helmsman does. The screen is the one part of it that can be seen
  // past him, and only because it clears his shoulders — at 4.72 it was 20 px
  // and at 5.11 it is 124.
  const screen = ctx.box(3.4, 2.1, 0.16, P.skyBlue);
  screen.position.set(0, 3.1, 2.24);
  screen.rotation.x = -0.3;
  group.add(screen);

  // ---- the after cockpit --------------------------------------------------

  // A bench whose top is at 1.66, which is `FIGURE.shin + FIGURE.ankleY` — the
  // height that puts a seated hip on the seat surface rather than above it.
  const bench = ctx.box(4.8, 0.36, 1.5, P.bark);
  bench.position.set(0, 1.3, -4.2);
  group.add(bench);
  const back = ctx.box(4.8, 0.95, 0.28, P.bark);
  back.position.set(0, 1.66, -4.95);
  group.add(back);

  // The outboard is what makes the stern the longer end: it reaches 9.90, one
  // unit past the transom, and `BOAT_BOW` is measured off *it* and not off the
  // stem.
  const cowling = ctx.box(1.4, 1.75, 1.05, P.steel);
  cowling.position.set(0, 1.1, -9.37);
  group.add(cowling);
  const leg = ctx.box(0.58, 2.3, 0.72, P.ink);
  leg.position.set(0, -1.2, -9.37);
  group.add(leg);

  group.name = 'boat';
  castShadows(group);
  return atCraftScale(group);
}

// ---------------------------------------------------------------------------
// The floatplane
// ---------------------------------------------------------------------------

/**
 * How far the floats hang below the plane's datum.
 *
 * The old model's floats hung **4.45** — a 3.4 strut plus a 1.05 pontoon radius
 * — against a `PLANE_CLEARANCE` of 4 whose own comment said *enough for the
 * floats, which hang 3.4 down*. So the floats went 0.45 into the ground on
 * every approach. `PLANE_CLEARANCE` is derived from this now rather than
 * asserted beside it.
 */
const FLOAT_KEEL = 3.4;

/**
 * Highest the plane will hold.
 *
 * The ceiling is what makes the plane the map, and it is a lens calculation
 * rather than a taste: from 1.45 radii up the camera sits 2.47 radii from the
 * centre, the globe subtends 47.8 degrees, and the chase camera looks at it 2
 * degrees off its centre — 25.9 of the 27.5 the 55 degree lens has. Lower and
 * the planet does not fit; much higher and it is a marble in an empty frame.
 */
export const PLANE_CEILING = PLANET_RADIUS * 1.45;
/** Clearance kept above the ground: the floats, and 0.6 under them. */
export const PLANE_CLEARANCE = (FLOAT_KEEL + 0.6) * BODY_SCALE;
/**
 * Cruise at the floor and at the ceiling.
 *
 * Speed rides altitude, and that is the whole travel design. Low, 140 crosses
 * Spain in twenty seconds and you can see what you are crossing — it was 380
 * while the plane was three times the world's scale, and at its size now that
 * was a streak rather than a flight. High, 3400 at
 * 2.25 radii is 0.094 rad/s: the Pacific in half a minute. Flying low is
 * scenic, climbing is how you cover an ocean, and the loss of precision that
 * comes with the speed is exactly the loss of precision that comes with zooming
 * a map out.
 */
export const PLANE_CRUISE_LOW = 140;
export const PLANE_CRUISE_HIGH = 3400;
/**
 * The throttle, `W` and `S`, as a share of the cruise it opens up or closes
 * down: 1.6 times flat out and two thirds of it held back. Flat out used to
 * be the run key's, and the run key climbs now.
 */
export const PLANE_THROTTLE_UP = 0.6;
export const PLANE_THROTTLE_DOWN = 0.35;
/**
 * Rate of turn at full stick once the plane is banked into it, in radians a
 * second: 57 degrees a second, a 360 in 6.5 s with the roll-in, a half turn in
 * 3.3.
 *
 * **It was 0.55, and the plane was not even getting that.** 31.5 degrees a
 * second is a 360 in 11.4 s, and the diagonal normalisation meant for walking
 * took 29% off it whenever `W` was held with `A` — 22 degrees a second, a 360
 * in 16 s and a 1,300-unit circle at the circuit, which is `levers` in
 * `player.ts`. On top of that the chase camera trailed the turn at
 * `RECENTRE_RATE` and took 0.7 s to show two thirds of it, so the first second
 * of full stick turned the view **15 degrees, and 10 with the throttle open**:
 * it barely turned. At 1.0, rolled in by `PLANE_ROLL_TIME` and followed by
 * `TURN_TRAIL`, the first second turns the view 33 degrees either way. (All of
 * these are the update laws stepped at 60 Hz, 2026-09-13, not a browser.)
 *
 * **A rate and not a radius, and that is deliberate** — the opposite of what
 * `camera.ts` holds for the walk, and for the same reason: what the eye reads is
 * the curve against the view, and here the view grows with the speed. At 320
 * units up, 185 units a second at 1.0 is a ground track of 181 units radius under
 * a camera 61 units off the tail (420 and 413 before `PLANE_CRUISE_LOW` came
 * down to 140, 2026-09-24); at the ceiling it is 1,390 units (5 degrees of
 * arc) under a camera that holds the whole globe. Held as a radius it would
 * either spin at the ceiling or be unable to turn over a town.
 */
export const PLANE_TURN = 1.0;
export const PLANE_ACCELERATION_TIME = 2.6;
/** And the throttle closes faster than it opens, so a landing is aimable. */
export const PLANE_LANDING_TIME = 1.2;

/**
 * The climb, as a vertical speed the keys ask for and the plane eases into.
 *
 * **It used to be an altitude the keys multiplied**, 1.15 of itself a second,
 * with the plane chasing it — and a take-off set that altitude to the circuit,
 * 320 units, on its own. So the wheels left the ground and the plane shot up
 * three hundred units with nobody asking, and a tap of the climb key a few
 * hundred up was another hundred. Now the key asks for a rate, the rate is
 * reached over `PLANE_VERTICAL_TIME`, and letting go levels the plane off
 * where it is.
 *
 * The rate is `PLANE_CLIMB_RATE` times the height over the ground, and never
 * under `PLANE_CLIMB_MIN`: near the ground 18 units a second, about seven
 * degrees at the low cruise, and higher up a share of the height a second so
 * the climb still reads as a zoom out of the map — twenty-five over a field
 * to the ceiling in about eleven seconds of the key held, where the old law
 * took five from the circuit and so read as a lurch. Descending is the same law
 * the other way, and it flares: under `PLANE_FLARE` times the height, and no
 * less than `PLANE_TOUCHDOWN`, so a plane let down onto a field arrives at a
 * few units a second rather than at the rate it came down from the clouds.
 */
export const PLANE_CLIMB_MIN = 18;
export const PLANE_CLIMB_RATE = 0.7;
/** Time constant of the vertical speed, in seconds: a pull on the stick builds, and so does letting go. */
export const PLANE_VERTICAL_TIME = 0.7;
export const PLANE_FLARE = 0.6;
export const PLANE_TOUCHDOWN = 4;

/**
 * The light aircraft on the ground: the speed it lifts off at — a take-off run
 * has to reach it with the climb key held — and the most it taxis at without
 * it. The run opens the throttle for a quarter past it, over `PLANE_RUN_TIME`,
 * so from standing to rotation is 2.6 seconds and 136 units of strip; the
 * wheels then leave it at no climb at all, and the climb builds from there
 * (`PLANE_VERTICAL_TIME`).
 *
 * **The run has its own time constant because it has to fit its strip.** Over
 * `PLANE_ACCELERATION_TIME` it was 4.2 s and 220 units, and a strip long
 * enough for that, 260 units, fitted beside 874 of the 1,186 towns that keep
 * a plane (`STRIP_LENGTH` in `craft/airstrip.ts`); in the air the throttle
 * keeps its slower ease.
 */
export const PLANE_ROTATE = PLANE_CRUISE_LOW * 0.6;
export const PLANE_RUN_TIME = 1.6;
export const PLANE_TAXI = 30;
/** Steepest ground a plane may be set down on, as rise over run: a field, not a hillside. */
export const PLANE_LANDING_GRADE = Math.tan(12 * (Math.PI / 180));

/**
 * Where the pilot's hip goes, in the plane's own frame — the seat surface, in
 * the crowd kit's convention, and the number `player.ts` puts the body on. The
 * table below is in that frame, the 6.8-unit body's units; `PLANE_SEAT` is it
 * times `BODY_SCALE` (see `atCraftScale`).
 *
 * **1.90 is the footwell, not a taste.** The player's own seated figure is 1.85
 * from hip to sole, measured off the built mesh in the `sit` pose; 1.90 leaves
 * the boot 0.05 clear of the cockpit floor at `y = 0`. The crowd's published
 * `SEATED.sole` is 1.75 and would have buried it.
 *
 * Everything else in the cockpit falls out of this one number:
 *
 * ```
 *   cockpit floor      0.00     the plane's own datum
 *   seat surface       1.90     hip
 *   coaming            2.95     seat + 1.05, between the seated waist (+0.78)
 *                               and chest (+1.44): head and shoulders proud
 *   shoulder joint     3.32     seat + FIGURE.shoulderJointY - FIGURE.hipY
 *   eyes               4.78     and the windscreen's top edge is 4.79
 *   crown              5.71     seat + 3.81 measured; the fin clears it at 5.90
 * ```
 */
/**
 * The launch's wheel, in the boat's own frame.
 *
 * **Published for the same reason `PLANE_SEAT` is**: the code-built helmsman's
 * hands were put on this rim from `avatar.ts`, which restated the hub, the
 * radii, the thickness and the rake out of the comments in this file until
 * this existed. The CC0 hero stands at the helm in the pack's idle and no
 * longer reaches for it, so today the one reader is the wheel's own build in
 * this file; it stays exported and in one place for the hands that come back
 * the day the helmsman grips it again.
 *
 * The rake is the column's: 25 degrees off horizontal, so the face turns towards
 * the helmsman instead of lying flat like a bus.
 */
export const BOAT_HELM = {
  hub: [0, 3.72, 1.15] as const,
  /** The rim is an annulus and a hand wraps the middle of it. */
  inner: 0.42,
  outer: 0.62,
  thickness: 0.14,
  rake: -1.14,
} as const;

/** The seat surface in the plane's own frame, where the model is built. */
const SEAT = { y: 1.9, z: 0 } as const;
/** And in the world's, where the body is put on it: see `atCraftScale`. */
export const PLANE_SEAT = { y: SEAT.y * BODY_SCALE, z: SEAT.z * BODY_SCALE } as const;

/**
 * Clear width across the cockpit.
 *
 * **4.30 is the crowd's seated envelope over 400 bodies, and it is the number
 * to build to** — not the 2.60 across the shoulders, which is what a cab sized
 * off the wrong measurement gets, and not the player's own 3.30, which would
 * fit him and nobody else. It costs a fuselage 5.10 wide against a 24.0 span:
 * fatter in proportion than a real light floatplane, and exactly as much fatter
 * as this model is shorter than one.
 */
const CABIN = 4.3;
/** Fuselage skin either side of the cabin. */
const SKIN = 0.4;
const FUSELAGE_HALF = CABIN / 2 + SKIN;
/** The cockpit opening, fore and aft of the seat. */
const COAMING = 2.95;
const COCKPIT_AFT = -1.55;
const COCKPIT_FWD = 2.6;

/** The fuselage's plan and profile, aft to forward. */
const BODY = [
  { z: -7.0, half: 0.45, belly: -0.1, deck: 0.9 },
  { z: -4.0, half: 1.3, belly: -0.65, deck: 1.9 },
  { z: COCKPIT_AFT, half: FUSELAGE_HALF, belly: -1.05, deck: COAMING },
  { z: COCKPIT_FWD, half: FUSELAGE_HALF, belly: -1.05, deck: COAMING },
  { z: 4.6, half: 2.25, belly: -0.8, deck: 2.6 },
  { z: 6.2, half: 1.55, belly: -0.2, deck: 1.9 },
] as const;

/**
 * A floatplane, facing +Z, with the **cockpit floor** at `y = 0` and the pilot's
 * hip on `PLANE_SEAT`.
 *
 * Floats rather than wheels, and not for decoration: the plane has to be able
 * to come down over water without leaving the player standing on the sea, and a
 * plane that lands on floats hands them straight to the boat. The wing is low
 * so it does not sit between the camera and the pilot — from the map altitude
 * you are looking straight down at him, and a high wing would hide the one part
 * of this model that has a face on it.
 *
 * **The cockpit is a well now, not an offset.** The fuselage used to be a
 * capsule 4.40 across and there was no height at which a 6.80 body could sit in
 * it: at the seat's own height his head was inside the hull, at standing height
 * he rode on its back, and the model was dropped 0.9 in as a compromise between
 * the two. It is a floor at 0, sides 4.30 apart, a seat at 1.90 and a coaming at
 * 2.95, and the pilot sits in it at his own height.
 */
export function buildPlane(): { group: THREE.Group; propeller: THREE.Object3D } {
  const group = new THREE.Group();

  // Lower body: keel to just under the cockpit floor, the whole length.
  group.add(
    shell(
      BODY.map((s) => ({ z: s.z, half: s.half, bottom: s.belly, top: -0.14 })),
      P.red,
    ),
  );
  // The cockpit floor, inset the way the launch's sole is.
  group.add(
    shell(
      [
        { z: COCKPIT_AFT, half: CABIN / 2, bottom: -0.14, top: 0 },
        { z: COCKPIT_FWD, half: CABIN / 2, bottom: -0.14, top: 0 },
      ],
      P.bark,
    ),
  );
  // Turtledeck aft of the cockpit, and the cowl forward of it.
  group.add(
    shell(
      BODY.slice(0, 3).map((s) => ({ z: s.z, half: s.half, bottom: -0.2, top: s.deck })),
      P.red,
    ),
  );
  group.add(
    shell(
      BODY.slice(3).map((s) => ({ z: s.z, half: s.half, bottom: -0.2, top: s.deck })),
      P.red,
    ),
  );
  // The cockpit sides: what makes it a well rather than a hole in a capsule.
  for (const side of [-1, 1]) {
    group.add(
      shell(
        [COCKPIT_AFT, COCKPIT_FWD].map((z) => ({
          z,
          x: side * (CABIN / 2 + SKIN / 2),
          half: SKIN / 2,
          bottom: -0.2,
          top: COAMING,
        })),
        P.red,
      ),
    );
  }

  // ---- the cockpit --------------------------------------------------------

  const pan = ctx.box(2.6, 0.3, 1.5, P.bark);
  pan.position.set(0, SEAT.y - 0.3, SEAT.z - 0.1);
  group.add(pan);
  // 1.45 behind the hip, not the crowd's 0.72: the player wears a rucksack and
  // it reaches 1.21 back. A seat back at the published figure goes through it.
  const backrest = ctx.box(2.6, 1.5, 0.28, P.bark);
  backrest.position.set(0, SEAT.y, SEAT.z - 1.45);
  group.add(backrest);

  // The instrument panel stands forward of the toes, which reach 2.38 ahead of
  // the hip. Anything nearer is a shin through a dashboard.
  const panel = ctx.box(CABIN - 0.1, COAMING - 1.55, 0.3, P.tan);
  panel.position.set(0, 1.55, 2.6);
  group.add(panel);

  // A yoke rather than a stick, and it is the pose that decides it: `sit` puts
  // the hands at x ±1.34, y hip + 0.3, z hip + 1.9, which is two hands a metre
  // apart and not one on a centreline. The old cockpit had them closed on
  // nothing at all — the file's own comment called it *a stick that is out of
  // sight below the coaming*.
  group.add(ctx.strut(new V(0, 2.15, 1.95), new V(0, 2.15, 2.55), 0.2, P.ink));
  group.add(ctx.strut(new V(-1.5, 2.15, 1.95), new V(1.5, 2.15, 1.95), 0.16, P.ink));

  // The screen's top edge lands at 4.79 against eyes at 4.78: he looks through
  // it, and his head and shoulders are still out in the air above it.
  const screen = ctx.box(CABIN, 1.95, 0.16, P.skyBlue);
  screen.position.set(0, COAMING, 2.45);
  screen.rotation.x = -0.34;
  group.add(screen);

  // ---- flying surfaces ----------------------------------------------------

  // Wing panels are lofted along their own +Z and yawed onto the span, which is
  // a rotation and not a scale: `T * R * S` puts the scale in the *local* axes,
  // and that is what buried Charles Bridge's piers inside their own wall.
  for (const side of [-1, 1]) {
    const wing = shell(
      [
        { z: 0, half: 2.2, bottom: -0.325, top: 0.325 },
        { z: 6, half: 1.9, bottom: -0.26, top: 0.26 },
        { z: 12, half: 1.25, bottom: -0.16, top: 0.16 },
      ],
      P.cream,
    );
    wing.rotation.y = (side * Math.PI) / 2;
    wing.position.set(0, -0.625, 0.7);
    group.add(wing);

    const tail = shell(
      [
        { z: 0, half: 1.3, bottom: -0.16, top: 0.16 },
        { z: 4.5, half: 0.85, bottom: -0.11, top: 0.11 },
      ],
      P.cream,
    );
    tail.rotation.y = (side * Math.PI) / 2;
    tail.position.set(0, 1.43, -5.9);
    group.add(tail);
  }

  // The fin in two courses rather than one, so the taper draws an ink line
  // across it. It tops out at 5.90, over the pilot's crown at 5.71.
  const fin = ctx.box(0.34, 3.9, 2.6, P.red);
  fin.position.set(0, 1.2, -5.9);
  group.add(fin);
  const finTip = ctx.box(0.34, 0.8, 1.7, P.red);
  finTip.position.set(0, 5.1, -6.25);
  group.add(finTip);

  // ---- floats -------------------------------------------------------------

  for (const side of [-1, 1]) {
    const x = side * 4.6;
    group.add(
      shell(
        [
          { z: -3.4, x, half: 0.55, bottom: -3.3, top: -2.05 },
          { z: -1.5, x, half: 0.75, bottom: -FLOAT_KEEL, top: -2.05 },
          { z: 2.6, x, half: 0.75, bottom: -FLOAT_KEEL, top: -2.05 },
          { z: 4.4, x, half: 0.62, bottom: -3.1, top: -2.0 },
          { z: 5.6, x, half: 0.22, bottom: -2.55, top: -1.95 },
        ],
        P.bone,
      ),
    );
    // The struts run up to the wing's underside, which is where a low-wing
    // floatplane actually carries them.
    for (const z of [-0.9, 2.2]) {
      const strut = ctx.box(0.28, 1.1, 0.55, P.bone);
      strut.position.set(x, -2.05, z);
      group.add(strut);
      group.add(ctx.strut(new V(x, -2.05, z), new V(side * 1.6, -1.0, z * 0.4), 0.16, P.bone));
    }
  }

  // ---- the propeller ------------------------------------------------------

  // Its own object so the throttle can spin it: at these speeds it is the only
  // moving part, and without it the plane reads as parked. The blade is 6.6
  // across so its tip stops at -2.00, just clear of the float decks at -2.05.
  const propeller = new THREE.Group();
  propeller.position.set(0, 1.3, 6.55);
  const blade = ctx.box(0.42, 6.6, 0.2, P.ink);
  blade.position.y = -3.3;
  propeller.add(blade);
  const spinner = ctx.taper(0.55, 0.1, 0.9, P.gold, 8);
  spinner.rotation.x = Math.PI / 2;
  propeller.add(spinner);
  group.add(propeller);

  group.name = 'plane';
  castShadows(group);
  return { group: atCraftScale(group), propeller };
}

/**
 * The ring a craft leaves when it arrives or goes: a splash on the water, a
 * puff of dust on the ground. A unit annulus standing on `y = 0`, one unit
 * across and one tall, which `player.ts` scales out and flattens as it fades —
 * so the wall is 18% of the radius at every size, and the ink draws it as the
 * comic's own mark for a splash rather than as a solid disc.
 *
 * Built through the same context as the hulls, so it is the world's cream and
 * the world's pen. Sixteen sides, because the ink is what reads here and the
 * pen draws a line at every one of them.
 */
export function buildSplash(): THREE.Mesh {
  const ring = ctx.ringWall(0.82, 1, 1, P.white, 16);
  ring.name = 'splash';
  ring.castShadow = false;
  ring.receiveShadow = false;
  return ring;
}

/**
 * Published so `player.ts` can put the avatar's hip on the seat without either
 * file restating the other's numbers. `FIGURE.hipY` is where the body's own
 * origin puts the hip; the pose then shifts the whole body, and the seat has to
 * cancel that shift rather than guess it.
 */
export const AVATAR_HIP = FIGURE.hipY;
