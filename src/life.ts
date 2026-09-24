import * as THREE from 'three';
import type { Person } from './cast.ts';
import type { Folk } from './folk.ts';
import type { FieldIndex, FieldKeepout } from './fleet.ts';
import type { World } from './geo.ts';
import { PLANET_RADIUS } from './globe.ts';
import { mergeMeshes } from './merge.ts';
import { proxyOf } from './warm.ts';
import type { Merged } from './merge.ts';
import { MAX_SLOPE, flattenWeightAt, gradeAt, reliefAt } from './terrain.ts';
import type { Slope } from './terrain.ts';
import { PALETTE, createToonRamp } from './theme.ts';
import {
  ROAD_CLASSES,
  courseOf,
  coursePoint,
  courseTangent,
  emptyCourse,
  needsCentre,
  parameterAt,
  placeDirection,
  rampOf,
  roadClearance,
  roadGeometryFor,
  roadIndexFor,
  surfaceLift,
  townOf,
} from './roads.ts';
import type { CoursePath, Road, RoadCourse, RoadRamp } from './roads.ts';
import { isShown, prominenceVersion, radiusOf } from './places.ts';
import type { Place } from './places.ts';
import { BIOMES, biomeAt, biomeSample } from './biome.ts';
import {
  createViewCone,
  detailBuild,
  frameOpenFor,
  mayBuild,
  detailCount,
  detailReach,
  detailVersion,
  fogFar,
  slantRange,
} from './view.ts';
import { createSceneryContext } from './scenery/contract.ts';
import type { RegionStyle, SceneryContext } from './scenery/contract.ts';
import { rngFrom } from './scenery/random.ts';
import type { Weighted } from './scenery/random.ts';
import { regionFor } from './scenery/regions.ts';
import { POSES, buildPerson } from './scenery/people.ts';
import type { Look } from './scenery/people.ts';
import { lookFor } from './scenery/dress.ts';
import { AVATAR_HEIGHT, SEAT_SHIN, SEAT_THIGH, WALK_SPEED, WALK_STRIDE, swingLift } from './avatar.ts';
import {
  RIDER_HEIGHT,
  VARIANTS,
  createTrafficContext,
  placedScale,
  variantRng,
} from './traffic/contract.ts';
import type { Mount, TrafficContext, TrafficStyle, Vehicle } from './traffic/contract.ts';
import { keepsLeft, trafficFor } from './traffic/regions.ts';
import { KINDS as FAUNA_KINDS, VARIANTS as FAUNA_VARIANTS, createFaunaContext } from './fauna/contract.ts';
import { FAUNA_RESCALE, rigPaint } from './fauna/contract.ts';
import { BODY_SCALE } from './stature.ts';
import type { Animal, AnimalShape, FaunaContext, RigChoice } from './fauna/contract.ts';
import { makeRigged, paintColors, paintModel, posedGeometry } from './models.ts';
import type { Model, Rig as ModelRig, RigSource, Rigged } from './models.ts';
import { buildAnimal } from './fauna/body.ts';
import type { Pose as AnimalPose } from './fauna/body.ts';
import { BY_BIOME, FAUNA_STYLES, nativeHere } from './fauna/regions.ts';
import type { RegionId } from './fauna/regions.ts';
import type { MonumentContext } from './monuments/contract.ts';
import { latOf, lonOf, unitAt } from './sphere.ts';

/**
 * Ambient life: the things that move.
 *
 * Two finished kits — `src/traffic/` and the crowd in `src/scenery/people.ts` —
 * had never been in the world, and nothing in the world had ever moved except
 * the player. This file is the join, and what it has to get right is not the
 * models, which exist, but **the line between what moves and what merges.**
 *
 * ## The tension, and where the line falls
 *
 * `settlements.ts` measured that merging a town into one vertex-coloured buffer
 * beats instancing it by **two hundred times on draw calls**, and a merged mesh
 * cannot move: its vertices are baked in the town's tangent frame. So the whole
 * of this file is one trade, made twice:
 *
 * - **Anything still goes in the town's own buffer and costs nothing.** The
 *   static crowd standing in the streets and the vehicles parked at the kerb are
 *   merged into the settlement mesh by `settlements.ts` and are **zero extra
 *   draw calls**. That is where the volume is: a peopled town carries four to
 *   fourteen figures and one or two parked vehicles.
 * - **Anything moving is its own `Mesh` and costs two draw calls**, the second
 *   being `OutlineEffect`. So the moving cast is small, near, and capped:
 *   `MAX_MOVERS` is a draw-call budget and it is the one number here that does
 *   not scale with the detail knob.
 *
 * The **birds are the exception and prove where the line is**: a bird is 20
 * triangles, so forty of them as forty meshes would be eighty draw calls for
 * 800 triangles. They are one mesh whose vertices are rewritten every frame —
 * merged *and* moving, paid for in CPU rather than in draw calls, which is only
 * affordable because the object is tiny. A vehicle is 200 triangles and twenty
 * of them would be 10,800 vertices of position and normal through JavaScript
 * every frame, which is the same order as the twenty draw calls it saves and
 * gives up per-mover frustum culling to do it.
 *
 * ## Nothing here integrates
 *
 * **Every mover's position is a pure function of the clock**, and the clock is
 * `sky.state.time` rather than the machine's. Three things fall out of it:
 *
 * - `atlas.sky.setRate(600)` runs the traffic with the sun, so a day of movement
 *   can be watched in a minute, and `setTime` scrubs it.
 * - A mover that leaves range and comes back is **where it should be**, not
 *   where it was when you looked away. There is no state to lose, so streaming
 *   cannot introduce a discontinuity, and a dropped frame cannot accumulate.
 * - It is deterministic for the same reason the rest of the world is: identity,
 *   a seed, and a time. No `Math.random()`, no `Date`.
 *
 * ## What is here
 *
 * `road`, `water`, `air`, `foot` and `herd`. The herd arrived last and it
 * arrived as a **merged** thing rather than as a mover, which is the split
 * above read the other way: grazing is the one activity in this world that is
 * honestly motionless, so five animals cost one draw call. The kit it is built
 * from is `src/fauna/`, whose gait this file never touches — a herd is frozen —
 * and whose sizes it reads only through `Animal.size`.
 *
 * ## Importable in Node, on purpose
 *
 * Nothing here reaches for `src/traffic/index.ts` or `src/scenery/index.ts`,
 * because both are registries built on `import.meta.glob`, which is a Vite
 * transform that does not exist in Node — and importing either would put this
 * file out of reach of a headless check. The vehicle registry is **handed in**
 * (`LifeOptions.vehicles`) the way `settlements.ts` is handed the road network.
 * `scripts/check-life.ts` is what that buys: routes, determinism and the walk
 * cycle asserted as numbers rather than looked at in a screenshot, which is
 * where a route bug is visible and a screenshot is not.
 */

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// How many, how far, how fast
// ---------------------------------------------------------------------------

/**
 * How many of each family at `detail` 1, before the cap.
 *
 * These scale on `detailCount` (`d^1.5`) with every other resident count in the
 * project, because a mover is a **draw-call** budget and not a triangle one: the
 * whole moving cast at detail 1 is about 5,000 triangles, a twentieth of one
 * resident town.
 *
 * **`ROAD_MOVERS` is what decides how busy the world looks, and `OCCUPANCY` is
 * not — that was worth finding out before tuning the wrong one.** The scan
 * gathers candidates and then spends this cap nearest-first, so on any street
 * dense enough to offer more cars than the cap there are always exactly
 * `detailCount(ROAD_MOVERS)` of them and lowering the occupancy only changes
 * *which* roads they come from. Measured standing in Ulm at the shipped detail
 * of 0.5: 18 * 0.5^1.5 = 6.4, and the world held **6 movers, all six on the
 * screen at once** — which reads as a country road thick with cars.
 *
 * It is 12 now, four at the shipped detail, and the occupancy change beside it
 * is what makes those four be on a road rather than on a village lane.
 */
const ROAD_MOVERS = 12;
const WATER_MOVERS = 10;
const FOOT_MOVERS = 10;
/**
 * Herds, and the number is small because **a herd is one draw call for five
 * animals** rather than one for one.
 *
 * That is the whole reason the animals arrived as a merged group and not as a
 * cast of movers. `settlements.ts` measured merging a town at one draw call
 * against 218 and this file is built on the consequence — *anything still is
 * merged, anything moving is its own mesh* — and a **grazing herd is genuinely
 * still**, which is the rare case where the cheap answer is also the right
 * picture. `people.ts` had already done the work that makes it safe: its
 * standing poses are measured into double support with both feet down precisely
 * so a frozen figure does not float, and `pnpm fauna` runs the quadruped
 * version of that assertion over all four.
 *
 * Eight at detail 1 is about forty animals for eight draw calls. As movers they
 * would be eighty.
 */
const HERD_MOVERS = 8;

/**
 * And the ceiling, whatever the knob says.
 *
 * `detailCount` at 6 is 14.7, which would ask for 560 movers and 1,120 draw
 * calls on top of the 245 the rest of the world spends at that setting. This is
 * the only number in the file that does not scale, for the same reason
 * `KEEP_ALL_WITHIN` does not in `settlements.ts`: it is not answering a question
 * about reach.
 */
const MAX_MOVERS = 90;

/** How far along the ground each family is worth placing, at detail 1. */
const ROAD_REACH = 1100;
const WATER_REACH = 1700;
const FOOT_REACH = 130;
const BIRD_REACH = 620;
/**
 * How far a herd is worth building, and it is priced on **one animal** rather
 * than on the herd.
 *
 * A herd is a cluster about thirteen units across, so pricing the cluster would
 * keep it legible to a thousand units — at which point it is a smudge of six
 * animals four pixels each, which is the outer-ring trap word for word. The mark
 * that has to read is the animal: a cattle beast is 6.8 units long since the
 * animals came down to the person's stature (2026-09-24, `FAUNA_SCALE`), so
 * `937 * 6.8 / 380` is **17 pixels at the reach**, against the 8-pixel floor
 * `settlements.ts` admits a whole town at. (It was 11.97 units long and 950 of
 * reach before, 12 px; and 4.0 long, 10 px, at the world's scale earlier on
 * 2026-09-24.)
 */
const HERD_REACH = 380;

/**
 * How near a herd has to be to stand up as animated rigs, and how many animals
 * may be animated at once. A skinned animal is a draw call and a skinning pass
 * of its own (two draws with the ink), so this is the townsfolk's trade again
 * (`TOWNSFOLK_RADIUS` and `TOWNSFOLK_CAP` in `folk.ts`): near and few move,
 * everything else is a still frame of the same clip in the merged herd.
 */
const HERD_ANIMATED_REACH = 70;

/**
 * How a cast rider's legs fold, in the rider's own frame: a bench's thigh level
 * and forward, a saddle's dropped towards the pedals, and a shin that hangs.
 * The first two are `avatar.ts`'s seat, the one the plane uses.
 */
const RIDER_THIGH_SIT = SEAT_THIGH;
const RIDER_THIGH_ASTRIDE = new THREE.Vector3(0, -0.8, 1).normalize();
const RIDER_SHIN = SEAT_SHIN;
const HERD_ANIMATED_CAP = 36;

/**
 * How high the viewer can be before a family stops being worth anything.
 *
 * A mover is a **near-field** feature and every streamer in this project has
 * learned the same lesson about admitting by radius from the air: at 3,000 units
 * up, `slantRange` admits the whole disc under the aircraft, and a 5-unit car
 * at 3,000 units is **under 2 pixels**. So there is a hard ceiling per family
 * rather than a reach that quietly grows. Water is the highest because a boat
 * leaves a visible mark on an empty sea where a car does not on a continent.
 * (The foot and herd ceilings came down with the body and the animals on
 * 2026-09-24, from 700 and 900.)
 */
const CEILING = { road: 1800, foot: 300, water: 4000, air: 1500, herd: 400 } as const;

/**
 * How fast a vehicle goes, by road class.
 *
 * This planet is about 1:400 against Earth on distance and 1:1 on the size of a
 * person, so **no speed is right in both units** and this number is a judgement
 * about what reads. It was [110, 150, 190] and it was halved, because the
 * reference it had been sized against was the wrong one.
 *
 * **The old rule was "a car has to visibly overtake a running player (130)",
 * and the player is the thing at the wrong scale.** A run here was 130 units a
 * second on a 6.8-unit body — **19 body-lengths a second, where a real runner
 * does about 2.5 and a sprinter 5.5**. Sizing the traffic against that sizes it
 * against a cartoon, and it did not even hold: `ROAD_SPEED[0]` was 110, so a
 * running player already outran every car on a lane. (The run is 90 since
 * 2026-09-13, which changes one line below: see the last paragraph.)
 *
 * The reference that does hold is the car against **itself**, and against the
 * length of street you can actually see. A placed vehicle was 10.3 units long
 * then:
 *
 * ```
 *                 own lengths / s      to cross 300 units of visible street
 *   real traffic at 100 km/h   6.0      —
 *   lane   110 -> 55          10.7 -> 5.3      2.7 s -> 5.5 s
 *   road   150 -> 78          14.6 -> 7.6      2.0 s -> 3.8 s
 *   trunk  190 -> 100         18.4 -> 9.7      1.6 s -> 3.0 s
 * ```
 *
 * A car crossing a village street in two seconds is a chase; in five it is
 * traffic. **What this gave up is that a running player overtook everything**,
 * which was the honest consequence of the reversal above rather than an
 * oversight: the player is the exaggeration, not the car. When the run came
 * down to 90 (2026-09-13) a trunk's 100 passed him again.
 *
 * **And on 2026-09-24 the speeds were halved again**, to [28, 39, 50], when the
 * vehicles came down from twice their authored scale and a placed car went
 * from about 10 units long to about 5 (6.6 since the section settled at 1.35
 * the same day): in its own lengths a second the traffic is where the table
 * leaves it. The run came down from 90 to 13.5, so every class passes a
 * running player now.
 */
const ROAD_SPEED = [28, 39, 50];

/**
 * How likely a road of each class is to have a vehicle in a given slot.
 *
 * **The lane share is a third of what it was, and the reason is the density of
 * the graph rather than the traffic.** `roads.ts` already records that inside
 * the lane reach about 12% of the ground is carriageway against 1 to 2% in a
 * real country — the graph was mean degree 4.13 at a 106-unit spacing — so every
 * village stands in a lattice of lanes, and a lane that is *usually occupied*
 * puts a car on every one of them. Measured standing in a street in Ulm at the
 * shipped detail of 0.5: **six movers within 550 units, all six on the screen
 * at once**, in a town whose whole built core is a couple of hundred units.
 *
 * At 0.10 a village lane is usually empty and the budget spends itself on the
 * roads and trunks, which is where traffic belongs and which is also where it
 * survives the class reach when you climb.
 */
const OCCUPANCY = [0.1, 0.4, 0.8];
/** Vehicles per road at most. A road is up to about 1,100 units long. */
const ROAD_SLOTS = 3;

/**
 * How far a mover's route runs before it wraps, and how many roads it may take
 * to get there.
 *
 * **A mover does not drive one road, and the measurement that says so is the
 * shape of the network.** Over the 36,212 baked roads the **median is 98 units
 * long** — because `places.bin` holds 23,866 towns thinned only so that their
 * built radii do not overlap, so an edge between neighbours is short. A car
 * crosses the median road in **1.3 seconds** at the 78 of the time (2.5 at
 * today's 39), and then wraps back to the start of it: measured before this,
 * a one-second sample of thirteen road movers had them travelling between 6.6
 * and 79 units, which is not traffic, it is a set of objects flickering.
 *
 * So a route is a **chain**: the seeded road, then a seeded walk of the graph
 * out of its far end, until the chain is longer than the reach anything is
 * admitted at. The wrap then happens about 1,600 units away, which is past
 * where any of it is drawn, and the car is doing what the road network was
 * baked for — going somewhere.
 *
 * `MIN_SECONDS` is the safety net for the chains that cannot reach the length:
 * an island with two towns on it, or a dead end. Rather than refuse those a
 * mover, the speed is capped so the route still takes eight seconds, which
 * reads as town traffic rather than as a flicker.
 */
const MIN_ROUTE = 1600;
const MAX_HOPS = 14;
const MIN_SECONDS = 8;
/**
 * How many roads a scan looks at closely, nearest first.
 *
 * Five seeded draws a road against a cast of at most 28 road-and-foot movers,
 * so anything past the first hundred or so is work whose only outcome is being
 * sorted out again. See the note in `scan`.
 */
const ROAD_SCAN_CAP = 120;

/** A craft under way. A boat is slow, and that is what makes it read as a boat. */
const CRAFT_SPEED = 17;
/** The cell a boat is seeded in, and how many may share one. */
const WATER_CELL = 1.5;
const WATER_SLOTS = 3;

/**
 * The cell one flock is seeded in, and the chance it holds one before the biome
 * has its say.
 *
 * **A degree was too coarse and the measurement is the reason it is not.** A
 * cell of one degree is 279 units against a bird reach that is capped by the
 * on-foot fog at 326, so there were about two cells in range and whether a town
 * had any birds at all was a coin toss on a seed: Ulm had **none** at detail 1
 * and Tokyo had thirty-two, out of the same table. At 0.35 degrees the cell is
 * 98 units, there are about thirty-five in range, and the count is a
 * distribution rather than a draw.
 */
/**
 * How coarsely the ground is diced for herds, in degrees.
 *
 * One herd to a cell, so this is the closest two herds can ever be: 0.42 degrees
 * is 117 units, which at the shipped scale is about 46 km of real ground between
 * one flock and the next. Sparser than the birds on purpose — a herd is a
 * *thing* where a flock is a texture, and two of them inside one field would
 * read as one badly-spaced herd rather than as two.
 */
const HERD_CELL = 0.42;
/** The cheap draw, taken before any ground query. See the trap. */
const HERD_CHANCE = 0.30;
/** How far across a herd stands, before the count widens it. */
const HERD_SPREAD = 13 * FAUNA_RESCALE;

const BIRD_CELL = 0.35;
const FLOCK_CHANCE = 0.14;

/**
 * A bird's own numbers, and every one of them is sized to be **seen** rather
 * than to be right.
 *
 * A herring gull is 1.4 m across, which at `SCENERY_SCALE` is 1.8 units and at
 * 300 units of distance is **5 pixels including both wings** — a bird that is
 * not there. So while a person was 6.8 units (until 2026-09-24) the same
 * exaggeration every monument in this project makes was applied to the smallest
 * thing in it: at a 4.2-unit span a bird was 13 px at 300 units and 33 px at
 * 120. The span is written in the 6.8-unit figure's units and scaled with the
 * body since, so it is 2.33 units now — 7 px at 300 units, 18 at 120 — which
 * is a little smaller than a real gull at the animals' scale (`FAUNA_SCALE`).
 */
const BIRD_SPAN = 4.2 * BODY_SCALE;
const BIRD_LENGTH = 2.4 * BODY_SCALE;
const FLOCK_MIN = 3;
const FLOCK_MAX = 8;
/**
 * How wide a flock's ring is, and it is named because two lines read it.
 *
 * One draws the radius. The other lifts the whole flock clear of the highest
 * ground inside it — see the scan — and a second copy of 120 there would be the
 * failure this project has shipped most, sitting on a number nothing would ever
 * disagree about until somebody widened the ring.
 */
const FLOCK_RADIUS: readonly [number, number] = [38, 120];
/** Birds drawn at once, across every flock. The one mesh is sized for it. */
const MAX_BIRDS = 64;

/**
 * How many poses one walking body is baked at, and how many bodies a region
 * gets.
 *
 * Ten phases at a 22-unit stride and 45 units a second was **20 poses a
 * second**, which is above the rate at which a walk stops reading as one; since
 * the gait came down with the body (2026-09-24) a stride is `WALK_STRIDE`, 5.45
 * units at 6 a second, and the same ten phases are 11 poses a second. Six
 * bodies is what `PEOPLE_VARIANTS` would call a thin crowd — right here, because
 * a walker is only ever admitted inside `FOOT_REACH` and there are at most ten
 * of them. The cost is memory and it is the whole reason the number is not larger:
 * six bodies at ten phases is about 1.9 MB a region, held for the session.
 */
const WALK_PHASES = 10;
const WALK_BODIES = 6;

/**
 * How far under the true sphere a craft floats.
 *
 * The ocean is an icosphere at `PLANET_RADIUS` with `OCEAN_SAG` 1.5, so the
 * *visible* water lies between `R - 1.5` and `R` depending on where in a face it
 * is sampled, averaging about `R - 0.75`. A hull at exactly `R` floats clear of
 * the sea over half the ocean; at `R - 0.75` the error is under a unit either
 * way, which is a fifth of the hull's own draft.
 */
const SEA_SINK = 0.75;

/** Movement thresholds, the same law as every other streamer here. */
const RESCAN_MOVE = 90;
const RESCAN_TURN = 8 * DEG;
/**
 * And a clock, which no other streamer in this project needs.
 *
 * **A town cannot leave the frame on its own and a car can**, and that one
 * difference breaks the movement-threshold rescan every streamer here is built
 * on. Measured, standing still at a roadside in Ulm at detail 0.5 and driving
 * the streamers by hand for two and a half seconds: the first scan admitted six
 * vehicles and three walkers that were **on the screen**, all of them drove out
 * of the frame at 110 to 190 units a second, and because the viewer had not
 * moved or turned there was never a second scan. `atlas.life.stats` read
 * **road 0, foot 0** with nine movers still resident and hidden. A road that
 * empties while you stand at it is the exact opposite of what this file is for.
 *
 * So the cast is re-derived on a timer as well, and it is **real** time and not
 * the world's: at `setRate(600)` a car crosses the frame in a tenth of a
 * second, and a world-clock cadence would rescan every two milliseconds to
 * chase it. Scrubbing shows a thinner road, which is honest — you are watching
 * a day in two minutes.
 */
const RESCAN_MS = 700;
/** Milliseconds of pool building allowed in one frame. */
const BUILD_BUDGET_MS = 2;
/**
 * Walkers dressed and herds stood up as their animals in one frame. Each is
 * a skinned clone — a person one, a herd one a head — and they had no cap at
 * all: every walker that came into view was dressed in the frame it did.
 * `folk.ts` caps the townsfolk at three for the same reason.
 */
const DRESS_PER_FRAME = 3;
const HERDS_PER_FRAME = 1;
/** Movers inside this of the camera are admitted whatever it is pointed at. */
const KEEP_ALL_WITHIN = 340;

// ---------------------------------------------------------------------------
// The walk, taken from the two files that already own it
// ---------------------------------------------------------------------------

/**
 * The amplitudes of a walking crowd figure, **read off `POSES.walk` rather than
 * written down a second time.**
 *
 * `people.ts` publishes one frozen frame of a walk and this file needs the whole
 * cycle, which looks like it needs its own table of swing angles and does not: a
 * still walk *is* the cycle sampled at one phase, so the pose's own numbers are
 * its amplitudes. Change the crowd's walk and the animated one follows, which is
 * the property that matters — a crowd whose stills and whose walkers disagreed
 * about how far a leg swings would be two kinds of person in one street.
 *
 * **One thing is deliberately not taken from it, and it is a fault worth
 * recording.** `POSES.walk` swings the left arm and the left leg *both forward*
 * — `shoulderX[0]` is -0.44 and `hipX[0]` is -0.36, and negative is forward for
 * both — which is an **ipsilateral** gait, and people do not walk that way. In a
 * still at 40 units nothing can tell, which is why it has survived; in motion it
 * is the single most visible thing a walk can get wrong. So the amplitudes come
 * from the pose and the **signs come from `avatar.ts`**, whose `stride` gives the
 * hips `[swing, -swing]` and the shoulders `-swing`. `people.ts` is not this
 * file's to change, and it is a two-character fix when somebody owns it.
 */
const WALK = {
  hip: (Math.abs(POSES.walk.hipX[0]) + Math.abs(POSES.walk.hipX[1])) / 2,
  knee: Math.max(POSES.walk.kneeX[0], POSES.walk.kneeX[1]),
  shoulder: (Math.abs(POSES.walk.shoulderX[0]) + Math.abs(POSES.walk.shoulderX[1])) / 2,
  elbow: (POSES.walk.elbow[0] + POSES.walk.elbow[1]) / 2,
} as const;



// ---------------------------------------------------------------------------
// The rig: finding the joints of a body somebody else built
// ---------------------------------------------------------------------------

/**
 * The four pairs of joints in a `buildPerson` group, found by where they are.
 *
 * `people.ts` returns a properly hinged body — hip and knee pivots under the
 * root, shoulder and elbow pivots under the trunk — and names none of them,
 * because until now nothing had ever needed to move one. Rather than reach into
 * a file this one does not own for a name, the pivots are identified by
 * **geometry**, which that file's own construction fixes: the hips are the two
 * `Group`s under the root with a lateral offset, the trunk is the one without,
 * the shoulders are the two `Group`s under the trunk with a lateral offset, and
 * each of those four has exactly one `Group` child, which is its second joint.
 *
 * The second test is safe because **every carried load is a `Mesh`**: a pack, a
 * jug, a parasol and a staff are all added to the trunk directly, so a `Group`
 * under the trunk can only be a shoulder or the head.
 *
 * It **throws** rather than warns. A misidentified pivot is a person whose elbow
 * is where his hip should be, and that is not a degraded walker.
 */
export interface Rig {
  root: THREE.Object3D;
  hips: [THREE.Object3D, THREE.Object3D];
  knees: [THREE.Object3D, THREE.Object3D];
  shoulders: [THREE.Object3D, THREE.Object3D];
  elbows: [THREE.Object3D, THREE.Object3D];
}

const groupsUnder = (node: THREE.Object3D): THREE.Object3D[] =>
  node.children.filter((child) => (child as THREE.Mesh).isMesh !== true);

export function rigOf(person: THREE.Object3D): Rig {
  const root = person.children[0];
  if (root === undefined) throw new Error('life: a person with no root');
  const under = groupsUnder(root);
  const hips = under.filter((node) => Math.abs(node.position.x) > 1e-6);
  const trunk = under.find((node) => Math.abs(node.position.x) <= 1e-6);
  if (hips.length !== 2 || trunk === undefined) {
    throw new Error(`life: expected two hips and a trunk under the root, found ${under.length} groups`);
  }
  const arms = groupsUnder(trunk).filter((node) => Math.abs(node.position.x) > 1e-6);
  if (arms.length !== 2) throw new Error(`life: expected two shoulders under the trunk, found ${arms.length}`);
  // Left first, so the sign convention matches `POSES`, whose pairs are
  // `[left, right]` and whose left is the positive x offset in `buildPerson`.
  hips.sort((a, b) => b.position.x - a.position.x);
  arms.sort((a, b) => b.position.x - a.position.x);
  const second = (node: THREE.Object3D, what: string): THREE.Object3D => {
    const found = groupsUnder(node);
    if (found.length !== 1) throw new Error(`life: expected one ${what}, found ${found.length}`);
    return found[0]!;
  };
  return {
    root,
    hips: [hips[0]!, hips[1]!],
    knees: [second(hips[0]!, 'knee'), second(hips[1]!, 'knee')],
    shoulders: [arms[0]!, arms[1]!],
    elbows: [second(arms[0]!, 'elbow'), second(arms[1]!, 'elbow')],
  };
}

const poseBounds = new THREE.Box3();

/**
 * Poses a rig at one phase of the cycle and re-seats it on the floor.
 *
 * The re-seat is not tidying. `buildPerson` drops the body onto its own lowest
 * point once, at build time, and every phase moves that point — so recomputing
 * it per phase is also **where the bob comes from**: the hips rise and fall by
 * exactly the amount that keeps the planted foot on the ground, with no separate
 * bob term that could get out of step with the legs.
 *
 * Returns how far the lowest point of the rig ended up below the floor. It is
 * zero by construction and it is checked rather than assumed.
 */
export function poseAt(rig: Rig, phase: number, lean: number): number {
  const swing = Math.sin(phase) * WALK.hip;
  const lifts = [swingLift(phase), swingLift(phase + Math.PI)];
  for (let i = 0; i < 2; i++) {
    const sign = i === 0 ? 1 : -1;
    rig.hips[i]!.rotation.x = swing * sign;
    rig.knees[i]!.rotation.x = lifts[i]! * WALK.knee;
    // Opposite the leg of the same side, and 0.85 of it: `avatar.ts`'s
    // `ARM_SWING`, which is the only place an arm's amplitude is stated.
    rig.shoulders[i]!.rotation.x = -swing * sign * (WALK.shoulder / WALK.hip) * 0.85;
    // More fold on the forward swing than on the back, which is what an arm
    // does. The base is the pose's own resting elbow.
    rig.elbows[i]!.rotation.x = WALK.elbow * (1 - swing * sign * 0.5);
  }
  rig.root.position.y = 0;
  rig.root.rotation.x = lean;
  // `precise`: a person is lathes and ellipsoids now, and the loose box of a
  // rotated ellipsoid reaches well below its surface, which floats the body.
  poseBounds.setFromObject(rig.root, true);
  rig.root.position.y = -poseBounds.min.y;
  poseBounds.setFromObject(rig.root, true);
  return poseBounds.min.y;
}

// ---------------------------------------------------------------------------
// Merging
// ---------------------------------------------------------------------------

export type { Merged } from './merge.ts';

/**
 * A built group reduced to flat arrays in the group's own space, its root's
 * transform included: the vehicles' `placedScale` is baked into the vertices
 * rather than applied at draw time. The one merge in the project (`merge.ts`),
 * under the name `scripts/check-life.ts` has always asserted on.
 */
export const mergeGroup = mergeMeshes;

// ---------------------------------------------------------------------------
// The bird
// ---------------------------------------------------------------------------

/**
 * One bird, as three rigid pieces and nothing else.
 *
 * Hand-written rather than built through `ctx`, because the flock is one mesh
 * whose vertices are rewritten every frame and the writer has to know which
 * vertex belongs to which wing. Twenty triangles: a body box and two wings, and
 * a wing is two coincident triangles facing opposite ways rather than a solid,
 * because a wing has no thickness worth a triangle and a single-sided one
 * disappears from below — which is the half of the sky it is seen from.
 */
interface BirdPart {
  position: Float32Array;
  normal: Float32Array;
  /** 0 body, 1 left wing, 2 right wing. */
  bone: Uint8Array;
  color: Float32Array;
}

function birdGeometry(): BirdPart {
  const position: number[] = [];
  const normal: number[] = [];
  const bone: number[] = [];
  const color: number[] = [];
  const dark = new THREE.Color(PALETTE.bark);
  const pale = new THREE.Color(PALETTE.bone);
  type P = [number, number, number];

  const tri = (a: P, b: P, c: P, id: number, tint: THREE.Color): void => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz) || 1;
    nx /= length; ny /= length; nz /= length;
    for (const p of [a, b, c]) {
      position.push(p[0], p[1], p[2]);
      normal.push(nx, ny, nz);
      bone.push(id);
      color.push(tint.r, tint.g, tint.b);
    }
  };

  // Body: a faceted box, nose at +Z.
  const hw = 0.17, hh = 0.21, hl = BIRD_LENGTH / 2;
  const c = (sx: number, sy: number, sz: number): P => [sx * hw, sy * hh, sz * hl];
  const face = (a: P, b: P, d: P, e: P): void => { tri(a, b, d, 0, dark); tri(a, d, e, 0, dark); };
  face(c(-1, -1, 1), c(1, -1, 1), c(1, 1, 1), c(-1, 1, 1));
  face(c(1, -1, -1), c(-1, -1, -1), c(-1, 1, -1), c(1, 1, -1));
  face(c(1, -1, 1), c(1, -1, -1), c(1, 1, -1), c(1, 1, 1));
  face(c(-1, -1, -1), c(-1, -1, 1), c(-1, 1, 1), c(-1, 1, -1));
  face(c(-1, 1, 1), c(1, 1, 1), c(1, 1, -1), c(-1, 1, -1));
  face(c(-1, -1, -1), c(1, -1, -1), c(1, -1, 1), c(-1, -1, 1));

  // Wings: rooted at the flank, swept back to a tip, drawn from both sides.
  const span = BIRD_SPAN / 2;
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? 1 : -1;
    const rootFore: P = [s * hw, 0.06, hl * 0.4];
    const rootAft: P = [s * hw, 0.06, -hl * 0.5];
    const tip: P = [s * span, 0.06, -hl * 0.85];
    const mid: P = [s * span * 0.55, 0.06, hl * 0.1];
    tri(rootFore, mid, tip, i + 1, dark);
    tri(rootFore, tip, rootAft, i + 1, dark);
    tri(tip, mid, rootFore, i + 1, pale);
    tri(rootAft, tip, rootFore, i + 1, pale);
  }

  return {
    position: new Float32Array(position),
    normal: new Float32Array(normal),
    bone: new Uint8Array(bone),
    color: new Float32Array(color),
  };
}

// ---------------------------------------------------------------------------
// Movers
// ---------------------------------------------------------------------------

/** Where a mover is and which way it is going, this instant. */
export interface Frame {
  /** Unit vector at the mover. */
  dir: THREE.Vector3;
  /** Distance from the planet's centre. */
  height: number;
  /** Unit tangent: the way it faces. */
  forward: THREE.Vector3;
  /** Roll about `forward`: a boat leaning into its turn. */
  roll: number;
  /** False when it has ended up somewhere it may not be — over water, say. */
  live: boolean;
}

export function emptyFrame(): Frame {
  return {
    dir: new THREE.Vector3(1, 0, 0),
    height: PLANET_RADIUS,
    forward: new THREE.Vector3(0, 0, 1),
    roll: 0,
    live: true,
  };
}

type Family = 'road' | 'water' | 'foot' | 'herd';

interface Mover {
  family: Family;
  /** Stable identity: two scans that admit the same thing produce the same key. */
  key: string;
  /** Which pooled geometry. A walker's phase is appended at draw time. */
  pool: string;
  /** Units a second along its own route, which is also the walker's leg cadence. */
  speed: number;
  /** `ground` false skips the point-in-polygon and answers at the shelf. */
  route: (clock: number, out: Frame, ground: boolean) => void;
  at: THREE.Vector3;
  mesh: THREE.Mesh | null;
  distance: number;
  /** How many animals are in this one mesh. Herds only. */
  heads?: number;
  /** A walker drawn from the cast, when there is one: its own skinned body. */
  person?: { holder: THREE.Group; person: Person } | null;
  /** A herd near enough to be its animals rather than its merged buffer. */
  animated?: { holder: THREE.Group; heads: { rigged: Rigged; rig: string }[] } | null;
}

interface Flock {
  centre: THREE.Vector3;
  radius: number;
  altitude: number;
  rate: number;
  count: number;
  seed: number;
}

export interface LifeStats {
  road: number;
  water: number;
  foot: number;
  /** Herds standing, which is also the draw calls they cost. */
  herd: number;
  /** Animals in them, which is not: a herd is one mesh however many head it has. */
  animals: number;
  /** Of those, how many are standing up as animated rigs near the player. */
  animated: number;
  birds: number;
  /** Draw calls this file adds, before `OutlineEffect` doubles them. */
  meshes: number;
  triangles: number;
  /** Pooled geometries held, and the megabytes in them. */
  pooled: number;
  megabytes: number;
  lastBuildMs: number;
  /** What the last re-derivation of the cast cost. See `RESCAN_MS`. */
  lastScanMs: number;
  /** Ground reach of the road family, which is the widest that matters on foot. */
  reach: number;
  /**
   * How far from the viewer the nearest thing that moves and casts a shadow was
   * drawn this frame — a vehicle, a craft, a walker, an animated herd — or
   * Infinity. `main.ts` redraws the shadow map every frame while this is inside
   * the shadow box (`SHADOW_COVER` in `sun.ts`); a still merged herd does not
   * count, because nothing in it moves.
   */
  nearestMoving: number;
}

/**
 * Why the herd scan admitted what it did, gate by gate.
 *
 * **Every other streamer in this project can be interrogated and this one could
 * not**, which is the whole reason a herd that never appeared cost an evening:
 * `stats.herd` reads 0 whether the registry is empty, the range is zero, the
 * ground is wet, the biome is bare or the budget is full, and those are five
 * different bugs with one symptom. This is a *counter per gate*, in the order
 * the scan applies them, so the console says which line returned instead of
 * leaving it to be reasoned about from a millisecond timing.
 */
export interface HerdProbe {
  /**
   * Frames `update` has run. **Read this first.**
   *
   * Every number below is a snapshot of the last scan, and a snapshot is
   * worthless if nothing has scanned. In an automated browser
   * `requestAnimationFrame` is frozen while the tab is hidden, so `atlas.goTo`
   * moves the player and the streamers never run, and four `goTo` calls with no
   * screenshot between them return **the same stale reading four times**. That
   * is what a herd that "never appears" looked like for an evening: a constant
   * bird count at four different biomes, which is impossible for a working scan
   * and is the tell. If this number does not advance between two reads, the
   * loop is frozen and nothing else here means anything.
   */
  frame: number;
  /** Animals handed to `createLife`. Zero means the option never arrived. */
  registry: number;
  /** The altitude the last scan was given, and the ceiling it is tested against. */
  altitude: number;
  ceiling: number;
  /** Slant range the last scan used. Zero means the family is switched off. */
  range: number;
  /** Cells `forEachCell` visited. */
  cells: number;
  /** ...that passed the cheap seeded draw. */
  chanced: number;
  /** ...that were inside the reach. */
  inRange: number;
  /** ...that were on land. */
  land: number;
  /** ...whose biome and region left at least one animal standing. */
  stocked: number;
  /** ...that passed the `cover` density draw. */
  dense: number;
  /** ...that were not inside a settlement's keep-out. */
  clearOfTown: number;
  /**
   * ...whose ground is gentle enough to graze, over the herd's own spread.
   *
   * Its own gate and not a line folded into the one below, for the reason the
   * whole record exists: `stats.herd` reading 0 in the Alps has to say *the
   * ground is a mountain face* rather than *something refused it*. It is the
   * one gate that empties a whole region: of the cells that reach it at detail 1
   * it drops 38% in the Alps, 29% over a Norwegian fjord and 23% around Ulm,
   * and **none at all** in the Sahara, in Mongolia, in Finnmark or in Cornwall
   * (2026-09-08).
   */
  clearOfSlope: number;
  /** ...that were not standing in a carriageway or inside a monument. */
  clearOfMade: number;
  /** ...that reached `consider`, and what it kept. */
  offered: number;
  admitted: number;
}

export interface Life {
  group: THREE.Group;
  stats: LifeStats;
  /** See `HerdProbe`. Rewritten by every scan. */
  herds: HerdProbe;
  /**
   * Call each frame, after the streamers. `clock` is seconds of the **world's**
   * time (`sky.state.time`) and not of the machine's, so the traffic runs with
   * `setRate` and scrubs with `setTime`.
   */
  update(viewer: THREE.Vector3, altitude: number, camera: THREE.Camera | undefined, clock: number): void;
  /**
   * Sweeps the walk cycle over every body of three regions and reports the worst
   * distance any part of a rig ends up below the floor.
   *
   * `swingLift` is imported from `avatar.ts` now rather than copied, so this
   * sweep checks the hero's own driver against a body that is not his: the
   * failure a wrong one produces is a foot through the ground, it is invisible
   * in a still frame, and it is one number.
   */
  verify(): { bodies: number; phases: number; worstDip: number };
  /** One mesh per program this draws with, for `warm.ts` to compile while the menu is up. */
  proxies(): THREE.Object3D[];
  /**
   * Adds to `push` the displacement along the ground that takes a body of
   * `radius` at `point` out of every walker drawn this frame, a walker being
   * `personRadius` wide, and says whether it touched one. A walker keeps to
   * its route, which is a function of the clock: it is the body walking into
   * it that gives way.
   */
  collide(point: THREE.Vector3, radius: number, personRadius: number, push: THREE.Vector3): boolean;
  /**
   * Every boat under way and drawn, as the last `update` posed it: for the
   * wake `effects.ts` lays behind it. Nothing is allocated.
   */
  eachBoat(visit: (mesh: THREE.Object3D) => void): void;
}

export interface LifeOptions {
  /** Share the monument context, so one material cache serves the whole world. */
  context?: MonumentContext;
  /** The baked network. Without it there is no road traffic and no walker. */
  roads?: readonly Road[];
  /**
   * The vehicle registry, handed in rather than imported: `traffic/index.ts` is
   * built on `import.meta.glob` and importing it would put this file out of
   * reach of `scripts/check-life.ts`.
   */
  vehicles?: readonly Vehicle[];
  /**
   * The animal registry, handed in for the same reason the vehicles are:
   * `fauna/index.ts` is built on `import.meta.glob`, which is a Vite transform,
   * and importing it would put this file out of reach of the headless checks.
   */
  animals?: readonly Animal[];
  /**
   * The cast, for the people walking the verges (`folk.ts`). Handed in for the
   * reason the vehicles are: it loads glTF, which the headless checks cannot.
   * Without it a walker is the code-built crowd body baked at `WALK_PHASES`,
   * which is what `pnpm life` still sweeps.
   */
  folk?: Folk;
  /**
   * Where the animals' baked rigs come from (`src/kit.ts` in the world, the
   * files on disk in `pnpm fauna`). A herd whose rig has not arrived waits for
   * it rather than being refused. Without one, every animal is the code-built
   * quadruped of `fauna/body.ts`.
   */
  rigs?: RigSource;
  /**
   * The fields a light plane or a balloon stands in (`fleet.ts`), which a herd
   * keeps off the way it keeps off a road. Answered from the world alone, so
   * a herd's cell stays one answer for ever.
   */
  fields?: FieldIndex;
}

/**
 * One material for everything that moves, and it is the town's.
 *
 * Vertex colours on the shared four-band ramp, so a moving car steps through the
 * same cel bands as the house it is passing and follows the sun into
 * `NIGHT_MOOD` with it.
 */
/** Marks a mesh whose colours are its vertices', for `mergeGroup`; never drawn. */
const PAINTED_MERGE = new THREE.MeshBasicMaterial();
PAINTED_MERGE.userData.atlasPainted = true;

function moverMaterial(outlineNormal = true): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: createToonRamp(4) });
  // The hull rides each mover's own `outlineNormal` (see `Merged.outline`). The
  // birds opt out: their buffer is rewritten every frame and a second normal
  // would be a second array through JavaScript for twenty triangles a bird.
  material.userData.outlineParameters = { thickness: 0.005, color: [0.11, 0.02, 0.01], outlineNormal };
  return material;
}

/**
 * A point on a road, `s` units along it from its first gate, offset `lateral`
 * from its centre line.
 *
 * Exported and free-standing so that `scripts/check-life.ts` can assert on the
 * curve a vehicle actually drives rather than on a second copy of it — which is
 * the same reason `courseOf` itself lives in `roads.ts` and is shared with the
 * bake. The **position has to come from the course**: the ribbon under the
 * wheels was drawn from it, and a car on its own arc would drive beside its
 * road, or into the kerb beside its gate.
 *
 * `s` is distance and not the course's `t`, read through the road's own
 * `coursePath`, so a mover at a constant speed covers ground at a constant
 * speed. That closed what `arcParameter` used to half-close: the old half-sine
 * bow ran `sqrt(1 + (bend * pi * cos(pi t))^2)` times too fast at a road's ends,
 * a first-order correction took the worst of it to 3% at the bake's cap, and a
 * measured length has no ripple left to correct. The tangent is
 * `courseTangent`, differentiated rather than differenced, so there is no step
 * to clamp at a road's far end and no zero tangent to put a car on the centre
 * line there.
 */
export function roadFrameOf(
  course: RoadCourse, path: CoursePath, s: number, lateral: number, out: Frame,
): Frame {
  const t = parameterAt(path, s);
  coursePoint(course, t, frameHere);
  courseTangent(course, t, out.forward);
  // Sideways is `up x forward`: the same hand every basis in this project is
  // built with. `makeBasis(east, up, north)` is the reflection, because
  // `east x up` is `-north`.
  frameSide.crossVectors(frameHere, out.forward).normalize();
  out.dir.copy(frameHere).addScaledVector(frameSide, lateral / PLANET_RADIUS).normalize();
  out.height = PLANET_RADIUS;
  out.roll = 0;
  out.live = true;
  return out;
}

const frameHere = new THREE.Vector3();
const frameSide = new THREE.Vector3();

export function createLife(world: World, places: readonly Place[], options: LifeOptions = {}): Life {
  const group = new THREE.Group();
  group.name = 'life';

  const ctx: SceneryContext = createSceneryContext(options.context);
  const traffic: TrafficContext = createTrafficContext(ctx);
  const material = moverMaterial();
  const roads = options.roads ?? [];
  const folk = options.folk;
  const registry = new Map<string, Vehicle>((options.vehicles ?? []).map((entry) => [entry.id, entry]));
  const fauna: FaunaContext = createFaunaContext(ctx);
  const bestiary = new Map<string, Animal>((options.animals ?? []).map((entry) => [entry.id, entry]));

  const herds: HerdProbe = {
    frame: 0, registry: 0, altitude: 0, ceiling: CEILING.herd, range: 0,
    cells: 0, chanced: 0, inRange: 0, land: 0, stocked: 0, dense: 0,
    clearOfTown: 0, clearOfSlope: 0, clearOfMade: 0, offered: 0, admitted: 0,
  };

  const stats: LifeStats = {
    road: 0, water: 0, foot: 0, herd: 0, animals: 0, animated: 0, birds: 0,
    meshes: 0, triangles: 0, pooled: 0, megabytes: 0, lastBuildMs: 0, lastScanMs: 0, reach: 0,
    nearestMoving: Infinity,
  };

  // ------------------------------------------------------------------
  // Scratch. Nothing in the frame loop allocates.
  // ------------------------------------------------------------------

  const here = new THREE.Vector3();
  const upAxis = new THREE.Vector3();
  const northward = new THREE.Vector3();
  const eastward = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  const spin = new THREE.Quaternion();
  const unit = new THREE.Vector3(1, 1, 1);
  const point = new THREE.Vector3();
  const frame = emptyFrame();
  const probeFrame = emptyFrame();

  /** Unit vector per place, once. The scan never converts a coordinate again. */
  const direction = new Float64Array(places.length * 3);
  places.forEach((place, i) => {
    placeDirection(place, here);
    direction[i * 3] = here.x;
    direction[i * 3 + 1] = here.y;
    direction[i * 3 + 2] = here.z;
  });

  /**
   * Every road's midpoint and its own half-length, once.
   *
   * `roads.ts` buckets the same roads into 4-degree tiles; this file scans them
   * flat, which is 12,789 dot products — about 60 microseconds — against a scan
   * that runs every 90 units of movement. A second tile index would be a second
   * thing to keep in step for no measurable saving.
   */
  const roadMid = new Float64Array(roads.length * 3);
  const roadSpan = new Float64Array(roads.length);
  {
    // The course's middle and half its estimated length: a road runs gate to
    // gate now, and its middle is where its course is at `t = 0.5`.
    const course = emptyCourse();
    roads.forEach((road, i) => {
      courseOf(road, places, course);
      coursePoint(course, 0.5, here);
      roadMid[i * 3] = here.x;
      roadMid[i * 3 + 1] = here.y;
      roadMid[i * 3 + 2] = here.z;
      roadSpan[i] = course.length * 0.5;
    });
  }

  /**
   * Which side of each road its traffic keeps, as the sign of a lateral offset:
   * `roadFrameOf` steps along `up x forward`, which is the mover's **left**
   * (screen right is `forward x up`, never `up x forward`), so +1 keeps left
   * and -1 keeps right. Every car on the planet kept left until 2026-09-21.
   *
   * Decided by the country of the road's first town, `road.a` — the town whose
   * region already chose the vehicles on it (`trafficAt(road.a)`), so a road's
   * mix and its side of the road come from one place and cannot disagree. A
   * midpoint would be a point-in-polygon a road and can land in the sea or in a
   * third country's sliver; a town is always in its own country. The cost is a
   * road across a frontier between the two laws, which is driven on its first
   * town's side for one road's length — where the real ones switch at a
   * crossover on the bridge.
   */
  const keepSide = new Int8Array(roads.length);
  const sideOf = (index: number): number => {
    let side = keepSide[index]!;
    if (side === 0) {
      side = keepsLeft(places[roads[index]!.a]!.iso ?? '') ? 1 : -1;
      keepSide[index] = side;
    }
    return side;
  };

  /** Every road's course and path, cached; the same cache the ribbon and the wood read. */
  const geometry = roadGeometryFor(roads, places);
  /**
   * And its ramp, for the wheels: two `gateLevel`s a road, asked once and kept
   * until the prominence knob turns, because a ramp only climbs into a town
   * that is built.
   */
  const ramps = new Map<number, RoadRamp>();
  const rampFor = (index: number): RoadRamp => {
    let found = ramps.get(index);
    if (found === undefined) {
      found = rampOf(roads[index]!, geometry.course(index), places, world);
      if (ramps.size > 4096) ramps.clear();
      ramps.set(index, found);
    }
    return found;
  };
  const onCentre = new THREE.Vector3();

  /**
   * Which roads meet at each place, as a compressed index.
   *
   * Two flat arrays rather than 23,867 little ones: one offset per place and one
   * run of road indices, which is 0.4 MB of `Int32Array` against about 4 MB of
   * `number[][]` and no per-place allocation at load.
   */
  const edgeStart = new Int32Array(places.length + 1);
  const edgeOf = new Int32Array(roads.length * 2);
  for (const road of roads) {
    edgeStart[road.a + 1]!++;
    edgeStart[road.b + 1]!++;
  }
  for (let i = 0; i < places.length; i++) edgeStart[i + 1]! += edgeStart[i]!;
  {
    const cursor = Int32Array.from(edgeStart.subarray(0, places.length));
    roads.forEach((road, i) => {
      edgeOf[cursor[road.a]!++] = i;
      edgeOf[cursor[road.b]!++] = i;
    });
  }

  /**
   * One leg of a route: a road, which way along it, how long that is, and how
   * far across the town at its far end the next leg begins.
   *
   * The length is the road's own `coursePath`, gate to gate — measured, where
   * it used to be the chord with a first-order correction for the old
   * half-sine bow, `1 + (bend * pi)^2 / 4`, which took the mean right and left
   * a ripple along the road.
   *
   * **The transit is the town.** A road stops at a gate now, and the route's
   * next road leaves the same town by another one, so between the two the
   * mover crosses the square along its streets — axis-aligned, so the gates'
   * offsets apart in x plus in z. It is not *driven*: this file cannot see a
   * town's terraces (`settlements.ts` is not importable in Node, and a town on
   * a hill is a staircase of level cells), and a car driven across at its gate's
   * level would sink into one terrace and float over the next. The old route did
   * exactly that, from centre to centre at the ribbon's lift over the relief,
   * straight through every platform on the way. So a mover is hidden for as
   * long as the crossing takes and comes out of the next gate, which from the
   * road is what a car turning into the streets looks like. Two roads through
   * one gate have no transit at all.
   */
  interface Hop {
    road: number;
    forward: boolean;
    length: number;
    transit: number;
  }
  interface Chain {
    hops: Hop[];
    total: number;
  }

  const chains = new Map<string, Chain>();
  const lengthOf = (i: number): number => Math.max(1, geometry.path(i).length);
  /** The gate a road uses at one of its two towns. */
  const gateAt = (road: Road, town: number): number => (town === road.a ? road.gateA : road.gateB);
  /** How far across a town from one of its gates to another, along its streets. */
  const transitOf = (town: number, from: number, to: number): number => {
    if (from === to) return 0;
    const gates = townOf(places[town]!).gates;
    return Math.abs(gates[from]!.x - gates[to]!.x) + Math.abs(gates[from]!.z - gates[to]!.z);
  };

  function chainFor(first: number, key: string): Chain {
    const known = chains.get(key);
    if (known !== undefined) return known;
    // A route that never revisits a road immediately: without it a dead end
    // turns into a mover shuttling over one road, which is the failure this
    // whole arrangement exists to delete.
    const hops: Hop[] = [{ road: first, forward: true, length: lengthOf(first), transit: 0 }];
    let total = hops[0]!.length;
    let at = roads[first]!.b;
    let previous = first;
    for (let hop = 1; hop < MAX_HOPS && total < MIN_ROUTE; hop++) {
      const from = edgeStart[at]!;
      const to = edgeStart[at + 1]!;
      if (to - from < 2) break;
      const rng = rngFrom(key, 'hop', hop);
      // Seeded, and it retries rather than filtering into a new array: the
      // Degree is 3.03 on average since the lanes were thinned — it was 4.13 —
      // so a couple of draws still finds one, which is the only thing this
      // number has to be true enough for.
      let next = -1;
      for (let tries = 0; tries < 6 && next < 0; tries++) {
        const candidate = edgeOf[from + rng.int(to - from)]!;
        if (candidate !== previous) next = candidate;
      }
      if (next < 0) break;
      const road = roads[next]!;
      const forward = road.a === at;
      const arrived = hops.at(-1)!;
      arrived.transit = transitOf(at, gateAt(roads[previous]!, at), gateAt(road, at));
      total += arrived.transit;
      hops.push({ road: next, forward, length: lengthOf(next), transit: 0 });
      total += hops.at(-1)!.length;
      at = forward ? road.b : road.a;
      previous = next;
    }
    const made = { hops, total };
    // Bounded: a session that crosses a continent would otherwise hold a chain
    // for every road it has ever passed.
    if (chains.size > 4000) chains.clear();
    chains.set(key, made);
    return made;
  }

  /**
   * Where a route puts a mover at one instant, out and back.
   *
   * **The route is travelled in both directions, and that is a fix for a
   * measured pop rather than a flourish.** With the distance wrapping at the end
   * of the chain, a mover reaching it is teleported to the start: measured in
   * the browser at Palma over a tenth of a second, seventeen road movers had
   * moved 100 to 165 units a second and one had moved **901**, which is that
   * jump. A car on a 1,600-unit chain at 130 units a second wraps every twelve
   * seconds and about two in five of the cast are on the screen, so that is a
   * visible pop every couple of seconds.
   *
   * Out and back has no teleport in it at all. What it has instead is a
   * **heading that reverses at each end of the route**, and the mover crossing
   * to the other side of the carriageway as it does — 4.3 units on a lane. Those
   * two points are fixed on a 1,600-unit route and a mover is only ever drawn
   * within 1,100 units of the viewer, so it is rarely the end you are standing
   * at; and a vehicle turning round at the end of its round is a thing that
   * happens, where a vehicle teleporting a kilometre is not.
   */
  /**
   * Where a chain puts a mover `distance` units along it: on one of its roads,
   * `s` units from that road's first gate, or in a town between two of them.
   *
   * In a town the mover is parked at the gate it went in by and not live — see
   * `Hop.transit` — so it is hidden and its heading is still the road's.
   */
  function chainFrame(
    chain: Chain, distance: number, lateral: number, out: Frame, ground: boolean, back: boolean,
  ): void {
    let along = distance;
    let index = 0;
    let crossing = false;
    while (index < chain.hops.length - 1 && along >= chain.hops[index]!.length) {
      const passed = chain.hops[index]!;
      if (along - passed.length < passed.transit) {
        along = passed.length;
        crossing = true;
        break;
      }
      along -= passed.length + passed.transit;
      index++;
    }
    const hop = chain.hops[index]!;
    const local = Math.max(0, Math.min(hop.length, along));
    // The position is where along the *road* this is and knows nothing about
    // which way the mover is going; the heading and which side of the road it
    // keeps are the two things that do — and the side is the country's law,
    // road by road, so a route that crosses a frontier changes side with it.
    const sign = (hop.forward ? 1 : -1) * (back ? -1 : 1);
    roadFrame(hop.road, hop.forward ? local : hop.length - local, lateral * sign * sideOf(hop.road), out, ground);
    if (sign < 0) out.forward.negate();
    if (crossing) out.live = false;
  }

  /** The out-and-back parameter: 0 at the start, `total` at the far end, back again. */
  function alongAt(chain: Chain, phase: number, speed: number, clock: number): { at: number; back: boolean } {
    const cycle = wrap(phase + (clock * speed) / (2 * chain.total));
    const back = cycle >= 0.5;
    return { at: (back ? 1 - cycle : cycle) * 2 * chain.total, back };
  }

  // ------------------------------------------------------------------
  // Region tables, cached per place
  // ------------------------------------------------------------------

  const continentOf = new Map<string, string>(
    world.countries.map((country) => [country.iso, country.continent]),
  );
  const regionCache = new Array<RegionStyle | undefined>(places.length);
  const regionAt = (index: number): RegionStyle => {
    let found = regionCache[index];
    if (found === undefined) {
      const place = places[index]!;
      found = regionFor(place.iso ?? '', continentOf.get(place.iso ?? '') ?? '', place.lat);
      regionCache[index] = found;
    }
    return found;
  };
  const trafficCache = new Map<string, TrafficStyle>();
  const trafficAt = (index: number): TrafficStyle => {
    const region = regionAt(index).id;
    let found = trafficCache.get(region);
    if (found === undefined) {
      const place = places[index]!;
      found = trafficFor(place.iso ?? '', continentOf.get(place.iso ?? '') ?? '', place.lat);
      trafficCache.set(region, found);
    }
    return found;
  };

  // ------------------------------------------------------------------
  // The pool: one merged buffer per (vehicle, region, variant), and per
  // (region, body, phase) for a walker
  // ------------------------------------------------------------------

  interface Pooled {
    geometry: THREE.BufferGeometry;
    triangles: number;
    bytes: number;
    /**
     * How many animals this buffer ended up holding. Herds only, and it is not
     * the count the scan asked for: an animal whose own patch is too steep is
     * dropped at build time, so `stats.animals` reads this rather than the
     * request or it reports cattle that are not on the screen.
     */
    heads?: number;
    /**
     * Where each animal of a herd stands and what it is, in the herd's frame,
     * so the herd can be stood up again as animated rigs when the player comes
     * near (`animateHerd`). Herds drawn from rigs only.
     */
    animals?: HerdHead[];
  }

  interface HerdHead {
    species: string;
    region: string;
    variant: number;
    pose: AnimalPose['kind'];
    matrix: THREE.Matrix4;
  }

  const pool = new Map<string, Pooled>();
  /** Keys asked for and not yet built. Served under `BUILD_BUDGET_MS`. */
  const wanted = new Set<string>();
  /** Keys that were asked for and cannot be built, so they are not asked twice. */
  const refused = new Set<string>();

  /**
   * How many merged buffers the pool may hold before the oldest are let go.
   *
   * The pool is keyed on region as well as on vehicle, so a session that flies
   * round the planet touches all fourteen: 18 vehicles x 14 regions x 4 variants
   * is 1,008 buffers at about 22 KB, and six walking bodies x ten phases x
   * fourteen regions is another 840 at 32 KB — **49 MB of geometry for a world
   * that never has more than ninety movers standing in it.** A cap and a
   * least-recently-used eviction cost one integer a lookup and hold it near 12.
   *
   * It is a *count* and not a byte budget, and there were two kinds of entry
   * when that was decided: they were within 50% of each other in size and a
   * byte budget would have needed a second number kept in step with the merge.
   * **There are three now and the third is the odd one out.** A herd is 140 to
   * 157 KB — measured at Ulm, Mongolia and the Serengeti at detail 3
   * (2026-09-08) — which is four to seven times a vehicle, and since a herd's
   * key became its site it shares nothing: 42 buffers for 42 standing herds at
   * those three places, exactly one each. So the honest worst case is a session
   * flown over pasture at a high detail filling all 420 slots with herds, which
   * is about 60 MB against the 49 above. It has not been seen — the cap binds
   * on travel and the herds are evicted first because they are the entries a
   * moving viewer stops asking for — but a byte budget is the fix if it ever
   * is, and it is written here rather than found later.
   */
  const POOL_CAP = 420;
  /** The frame each key was last drawn on. Cheaper than a linked list. */
  const usedAt = new Map<string, number>();
  let frameCount = 0;

  /**
   * How recently a key was drawn, taking a walker's ten phases together.
   *
   * **A walker refreshes one phase a frame and holds ten**, so ordering on the
   * raw timestamp puts nine of a live body's buffers at the front of the queue
   * — and because the phases are evicted as a set, the tenth goes with them
   * while it is on the screen. It self-heals on the next frame, at the price of
   * rebuilding a body, which is exactly the cost the pool exists to avoid.
   */
  const freshness = (key: string): number => {
    if (!key.startsWith('w|')) return usedAt.get(key) ?? 0;
    const stem = key.slice(0, key.lastIndexOf('|'));
    let best = 0;
    for (let phase = 0; phase < WALK_PHASES; phase++) {
      best = Math.max(best, usedAt.get(`${stem}|${phase}`) ?? 0);
    }
    return best;
  };

  function evict(): void {
    if (pool.size <= POOL_CAP) return;
    const order = [...pool.keys()].sort((a, b) => freshness(a) - freshness(b));
    for (const key of order) {
      if (pool.size <= POOL_CAP * 0.85) break;
      // A walker's ten phases go together or a body loses a limb of its cycle.
      const stem = key.startsWith('w|') ? key.slice(0, key.lastIndexOf('|')) : key;
      for (let phase = 0; phase < WALK_PHASES; phase++) {
        const member = key.startsWith('w|') ? `${stem}|${phase}` : key;
        const entry = pool.get(member);
        if (entry === undefined) continue;
        entry.geometry.dispose();
        pool.delete(member);
        usedAt.delete(member);
        if (!key.startsWith('w|')) break;
      }
    }
  }

  const geometryOf = (merged: Merged): THREE.BufferGeometry => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(merged.position, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(merged.normal, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(merged.color, 3));
    geometry.setAttribute('outlineNormal', new THREE.BufferAttribute(merged.outline, 3));
    geometry.computeBoundingSphere();
    return geometry;
  };

  const dispose = (built: THREE.Object3D): void => {
    built.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
  };

  /**
   * A vehicle, its rider if it has one, merged and scaled, in one buffer.
   *
   * **`placedScale` is baked into the vertices rather than applied to the mesh**,
   * and that is not an optimisation. A non-uniform z scale on a `Mesh` needs the
   * inverse transpose for its normals, and `OutlineEffect` builds its hull from
   * those normals — so a bus scaled at draw time would carry a pen that is
   * subtly wrong along its length. Baking it means the geometry the GPU sees is
   * the geometry that was measured.
   *
   * **The rider is built at `RIDER_HEIGHT` and scaled with the vehicle.** While
   * vehicles were placed at twice their authored scale (until 2026-09-24) that
   * made him 4.6 units against a 6.8-unit pedestrian rather than 2.3, where a
   * cyclist had been a third the size of the person he rode past. Placed at
   * `PLACED_SECTION`, 1.35, he is 3.11 against a 3.77-unit pedestrian: a little
   * smaller, because the vehicles take less of `STATURE` than the people do.
   */
  function buildVehicle(key: string, id: string, style: TrafficStyle, region: string, variant: number): Pooled | null | 'pending' {
    const entry = registry.get(id);
    if (entry === undefined) return null;
    // A rider is a cast character when there is a cast, and the cast arrives
    // after the traffic can: a ridden vehicle waits for it rather than being
    // pooled with the code-built body for the rest of the session.
    if (entry.mounts.length > 0 && folk !== undefined && !folk.ready) return 'pending';
    const built = entry.build(traffic, variantRng(entry, style, variant), style);

    for (const mount of entry.mounts) {
      const rider = folk !== undefined ? castRider(key, region, mount) : codeRider(key, region, mount);
      if (rider === null) continue;
      rider.position.set(mount.x, mount.y, mount.z);
      rider.rotation.y = mount.yaw;
      built.add(rider);
    }

    const scale = placedScale(entry);
    built.scale.set(scale[0], scale[1], scale[2]);
    const merged = mergeGroup(built);
    const geometry = geometryOf(merged);
    dispose(built);
    return { geometry, triangles: merged.triangles, bytes: merged.position.byteLength * 4 };
  }

  /**
   * A rider from the cast, held seated (`Folk.seated`): hips on the mount, thighs
   * forward, shins down, hands on the grip. `astride` is a bicycle's or a
   * scooter's, with the thigh dropped towards the pedals; `sit` is a bench's.
   */
  function castRider(key: string, region: string, mount: Mount): THREE.Object3D | null {
    const astride = mount.pose === 'astride';
    return folk!.seated(`${key}|rider|${mount.x}|${mount.z}`, region, RIDER_HEIGHT, {
      thigh: astride ? RIDER_THIGH_ASTRIDE : RIDER_THIGH_SIT,
      shin: RIDER_SHIN,
      grip: mount.grip === undefined ? undefined : new THREE.Vector3(mount.grip[0] - mount.x, mount.grip[1] - mount.y, mount.grip[2] - mount.z),
    });
  }

  /** The code-built rider, for `pnpm life`, which has no cast. */
  function codeRider(key: string, region: string, mount: Mount): THREE.Object3D {
    // `Mount.footrest` and `Mount.grip` solve the four joints by IK inside
    // `buildPerson`, so a rider fits a saddle by construction.
    const rng = rngFrom(key, 'rider', mount.x, mount.z);
    const look: Look = {
      ...lookFor(rng, region, { pose: mount.pose }),
      height: RIDER_HEIGHT,
      footrest: mount.footrest,
      grip: mount.grip,
    };
    return buildPerson(ctx, look);
  }

  /**
   * One walking body, as `WALK_PHASES` merged buffers.
   *
   * This is the answer to the tension at the top of the file for the one thing
   * that has to both move *and* articulate. A walker cannot be a merged rigid
   * body, because a rigid body sliding along the ground is exactly the moonwalk
   * the crowd's own report warned about; and it cannot be its own eighteen-mesh
   * hinged group, because eighteen meshes is **thirty-six draw calls a person**.
   *
   * So the cycle is **baked**: the rig is posed at ten phases and each phase is
   * merged into its own buffer, and a walker is one `Mesh` whose `geometry` is
   * swapped for the phase it is at. One draw call, no per-vertex work in the
   * frame loop at all, and the cost is memory rather than time.
   */
  function buildWalker(key: string, region: string, body: number): Pooled[] | null {
    const rng = rngFrom(key, 'walker', body);
    const person = buildPerson(ctx, lookFor(rng, region, { pose: 'walk' }));
    let rig: Rig;
    try {
      rig = rigOf(person);
    } catch (error) {
      console.warn(`life: could not find the joints of a crowd body — ${String(error)}`);
      dispose(person);
      return null;
    }
    // A seeded forward lean, so six bodies are six walks rather than one.
    const lean = rng.range(-0.02, 0.06);
    const out: Pooled[] = [];
    for (let phase = 0; phase < WALK_PHASES; phase++) {
      poseAt(rig, (phase / WALK_PHASES) * TAU, lean);
      const merged = mergeGroup(person);
      out.push({
        geometry: geometryOf(merged),
        triangles: merged.triangles,
        bytes: merged.position.byteLength * 3,
      });
    }
    dispose(person);
    return out;
  }

  /**
   * One herd, as **one merged buffer**, which is the whole reason the animals
   * are here rather than in the mover cast.
   *
   * `settlements.ts` measured merging a town at one draw call against 218 and
   * this file is built on the split that follows — anything still is merged,
   * anything moving is its own mesh. A **grazing herd is genuinely still**, so
   * it is the one case where the cheap answer and the right picture are the same
   * one: five animals for one draw call, built once, and never touched again.
   *
   * What makes that safe is `pnpm fauna`'s static-pose assertion, which is the
   * quadruped spelling of the crowd's own: `people.ts` measured its `walk` and
   * `stride` poses into double support with both feet down precisely so a frozen
   * figure does not float, and a frozen quadruped has four feet to get wrong.
   * All four are on the ground in `stand`, `alert` and `graze`.
   *
   * **The bodies are cached and the herd is not.** A herd is a site and there
   * are as many of them as there is ground, but a *body* is a (species, region,
   * variant, pose) and there are about a hundred of those in any one region — so
   * the first herd in a region pays six builds at 0.35 ms and every herd after
   * it is three array copies. Without the cache a herd is 2 ms, which is the
   * whole frame budget.
   *
   * **And the herd's own buffer is keyed on the site now, where it used to be
   * keyed on (species, region, heads, spread).** That is the price of seating
   * each animal on the ground it actually stands over — see `buildHerd` — and
   * it was not much of a price, because the old key was already nearly unique:
   * measured over ten places at detail 1 (2026-09-08) the pool held 2 to 78
   * herd buffers for 5 to 8 resident herds, so the sharing it bought was
   * between neighbours that had drawn the same species *and* the same count.
   * What it bought instead is worth more than the sharing: two herds that
   * shared a buffer were the same five animals in the same arrangement, and
   * `contract.ts` calls six identical cows a bug you can see from the road.
   */
  const bodyCache = new Map<string, Merged>();
  const BODY_CACHE_CAP = 120;

  function animalBuffer(species: string, region: string, variant: number, pose: AnimalPose): Merged | null | 'pending' {
    const key = `${species}|${region}|${variant}|${pose.kind}`;
    let found = bodyCache.get(key);
    if (found !== undefined) return found;
    const entry = bestiary.get(species);
    const style = FAUNA_STYLES[region as RegionId];
    if (entry === undefined || style === undefined) return null;
    const shape = entry.shape(rngFrom(entry.id, style.id, variant), style);
    if (entry.rigs !== undefined && entry.rigs.length > 0 && options.rigs !== undefined) {
      const choice = rngFrom(entry.id, style.id, variant, 'rig').weighted(entry.rigs.map((rig) => ({ item: rig, weight: rig.weight })));
      const rig = options.rigs.get(choice.id);
      if (rig === null) return 'pending';
      found = mergeGroup(rigAnimal(entry, shape, choice, rig, farFrameOf(rig, pose.kind, key)));
    } else {
      const built = buildAnimal(fauna, shape, pose);
      found = mergeGroup(built.group);
      dispose(built.group);
    }
    if (bodyCache.size >= BODY_CACHE_CAP) bodyCache.clear();
    bodyCache.set(key, found);
    return found;
  }

  /**
   * One head of a merged herd from its baked rig: one of the rig's far frames
   * (`Rig.far` — a still of the pack's `Eating` for a grazer, of its `Idle` for
   * one standing or alert, coarsened at bake time), painted with the coat
   * `shape` drew and fitted to the animal's declared length, feet on y = 0,
   * facing +Z. A rig baked without far frames is skinned here at full detail.
   */
  function rigAnimal(entry: Animal, shape: AnimalShape, choice: RigChoice, rig: ModelRig, frame: number): THREE.Group {
    const still = rig.far[frame];
    const paint = rigPaint(shape, choice);
    let geometry: THREE.BufferGeometry;
    if (still !== undefined) {
      geometry = paintModel(still.model, paint);
    } else {
      geometry = posedGeometry(rig, clipFor(rig, 'stand'), 0);
      geometry.setAttribute('color', new THREE.BufferAttribute(paintColors(rig as unknown as Model, paint), 3));
    }
    const size = rig.box.getSize(herdScratch);
    const k = entry.size[0] / size.z;
    const mesh = new THREE.Mesh(geometry, PAINTED_MERGE);
    mesh.scale.setScalar(k);
    mesh.position.set(-((rig.box.min.x + rig.box.max.x) / 2) * k, -rig.box.min.y * k, -((rig.box.min.z + rig.box.max.z) / 2) * k);
    const group = new THREE.Group();
    group.add(mesh);
    return group;
  }

  /**
   * Which far frame a head is held in: one of its clip's, chosen by the head's
   * own seed, so the merged herd and the animated one agree on it.
   */
  function farFrameOf(rig: ModelRig, pose: AnimalPose['kind'], key: string): number {
    const clip = clipFor(rig, pose);
    const frames = rig.far.map((frame, index) => ({ frame, index })).filter((entry) => entry.frame.clip === clip);
    if (frames.length === 0) return -1;
    return frames[Math.floor(rngFrom(key, 'frame').unit() * frames.length)]!.index;
  }
  const herdScratch = new THREE.Vector3();

  /**
   * The clip a pose is a frame of: `Eating` for a grazer where the rig has one,
   * `Idle` otherwise. Never no clip: the Farm Animal Pack's FBX rigs rest with
   * their armature turned a quarter over, and it is the clip that stands them
   * up — a sheep held in its bind pose stands on its tail.
   */
  function clipFor(rig: ModelRig, pose: AnimalPose['kind']): string {
    if (pose === 'graze' && rig.clips.some((clip) => clip.name === 'Eating')) return 'Eating';
    return rig.clips.some((clip) => clip.name === 'Idle') ? 'Idle' : (rig.clips[0]?.name ?? 'Idle');
  }

  const herdNormal = new THREE.Matrix3();
  const herdPoint = new THREE.Vector3();
  const herdQuat = new THREE.Quaternion();
  const herdUp = new THREE.Vector3(0, 1, 0);
  const herdScale = new THREE.Vector3();
  const herdSeat = new THREE.Vector3();
  /** What `gradeAt` fills for one animal's own patch. Reused: it is asked per head. */
  const headSlope: Slope = { grade: 0, across: 0, north: 0, lowest: 0, highest: 0 };

  /**
   * Where one herd stands, and the frame it will be drawn in.
   *
   * **The scan works all of this out and `buildHerd` reads it**, rather than
   * the key carrying it and the builder re-deriving it. The centre comes out of
   * two seeded draws inside `forEachCell` and the frame out of a third, so a
   * builder that re-derived them would be a second copy of a draw *order* — the
   * exact shape of the fault this project has shipped most, and one that would
   * fail silently by seating every animal on ground a few units from the ground
   * it is standing on.
   */
  interface HerdSite {
    species: string;
    region: RegionId;
    heads: number;
    spread: number;
    /** Unit vector at the herd's origin, which is where its mesh is placed. */
    centre: THREE.Vector3;
    /** The mesh's own local X and Z, as `update` will build them from `route`. */
    right: THREE.Vector3;
    forward: THREE.Vector3;
    /** `reliefAt` at the centre: every animal's seat is measured against it. */
    relief: number;
  }
  /** Bounded the way `chains` is, and emptied at the top of a scan for the same reason. */
  const herdSites = new Map<string, HerdSite>();

  /**
   * What a member of a herd is doing.
   *
   * Weighted toward grazing, because a field of animals with their heads up
   * reads as a field of statues and a field with their heads down reads as a
   * field of animals. `alert` is the one in six that has noticed you.
   */
  const HERD_POSES: Weighted<AnimalPose['kind']>[] = [
    { item: 'graze', weight: 6 },
    { item: 'stand', weight: 3 },
    { item: 'alert', weight: 1 },
  ];

  /**
   * The animals of one herd, each on the ground it is standing over.
   *
   * **A herd is a flat slab and the ground under it is not**, and that is the
   * whole of what this function had wrong. Every animal sat at `y = 0` in the
   * herd's own tangent plane, so on any tilt at all the uphill half floated and
   * the downhill half sank. Measured over 12,000 head on admitted sites, cattle
   * at their own spread (2026-09-08): an animal was off its own ground by
   * **0.39 units at the median, 1.71 at the p90 and 9.57 at the worst** —
   * against a sheep that was 2.2 to 7.5 units tall at the scale of the time,
   * so the tail of that distribution is a whole animal in the air. The site gate below cannot fix
   * it, because it is a *mean* over the spread and the mean of a hillside is a
   * hillside.
   *
   * So each animal is bedded to the lowest of four probes at its own stance,
   * exactly the way `vegetation.ts` beds a plant, and for the same reason: the
   * lowest is what keeps no part of the footprint above the base. `reliefAt` is
   * the right field to ask rather than `elevationAt` — the shelf is a property
   * of the *ring* and a herd is 26 units across, so inside one herd the two
   * differ by a constant that cancels, and `reliefAt` is what `gradeAt` reads,
   * so the seat and the gate cannot disagree.
   *
   * **And an animal whose own patch is too steep is dropped rather than laid on
   * it.** `vegetation.ts`'s `TILT_OF` is the other answer and this kit does not
   * want it: `solveLeg` puts all four hooves exactly on `y = 0` and `pnpm
   * fauna` asserts the highest of them never leaves the floor by more than
   * 0.153 units, so rotating a body onto the surface normal lifts the two
   * uphill hooves by about its width times the grade — 2.3 units on a cow at
   * `MAX_SLOPE`, fifteen times the tolerance that assertion holds. A boulder
   * gets `tilt: 1` because it has no legs; an animal has four and stands plumb
   * on the hill, which is what an animal does.
   *
   * **What it costs is written down rather than hidden.** Bedding to the lowest
   * probe buries the uphill hooves by the relief's own range across the stance:
   * over 12,000 head a species, that is **0.46 to 0.86 units at the median,
   * 1.5 to 2.7 at the p90 and 3.9 to 7.4 at the worst** (sheep to horse,
   * 2026-09-08). Nothing floats, which is the half of the trade this project
   * has already made twice — `people.ts` measured its standing poses into
   * double support for it and `vegetation.ts` beds a plant to `slope.lowest`
   * for it — and a hoof in the grass is invisible where a hoof in the air is
   * not. The drop refuses **0.6 to 0.9% of animals** by species over the same
   * sample. At three head minimum a herd that loses every one of them is a
   * refusal of the whole site, which is the right answer and is why it is not
   * guarded against.
   */
  function buildHerd(key: string, site: HerdSite): Pooled | null | 'pending' {
    const members: { merged: Merged; matrix: THREE.Matrix4 }[] = [];
    const heads: HerdHead[] = [];
    const shape = bestiary.get(site.species);
    if (shape === undefined) return null;
    // The animal's own stance: `gradeAt` puts its four probes at `reach` on the
    // diagonals, so half the diagonal of the box the animal stands in puts a
    // probe under each hoof. `size` is [length, width, height] and it is why
    // `Animal.size` is three numbers rather than a radius.
    const stance = Math.max(1.2 * FAUNA_RESCALE, Math.hypot(shape.size[0], shape.size[1]) * 0.5);
    let vertices = 0;
    for (let i = 0; i < site.heads; i++) {
      const each = rngFrom(key, 'head', i);
      const variant = each.int(FAUNA_VARIANTS);
      const poseKind = each.weighted(HERD_POSES);
      const merged = animalBuffer(site.species, site.region, variant, { kind: poseKind } as AnimalPose);
      if (merged === null || merged === 'pending') return merged;
      // Scattered on the herd's own tangent plane. A ring rather than a disc
      // would be a corral; a grid would be a car park.
      const angle = each.unit() * TAU;
      const radius = Math.sqrt(each.unit()) * site.spread;
      // Yaw is free variety and it is the only kind a merged mesh can have per
      // instance — a per-instance *scale* is baked into the vertices here, which
      // is `OutlineEffect` rather than thrift: a non-uniform scale at draw time
      // needs the inverse transpose for its normals and the pen is built along
      // them. `mergeGroup` does the transpose; a `Mesh.scale` would not.
      const scale = each.spread(1, 0.07);
      herdQuat.setFromAxisAngle(herdUp, each.unit() * TAU);
      herdScale.set(scale, scale, scale);

      // Where this one really is, in the frame `update` will draw the mesh in:
      // local X is `right` and local Z is `forward`, both handed over by the
      // scan. The probes go out along the same pair rather than along tangents
      // rebuilt at the animal — over 26 units of a 16,000-unit radius they are
      // 0.0016 rad apart, which moves a probe by two hundredths of a unit.
      herdSeat
        .copy(site.centre)
        .addScaledVector(site.right, (Math.cos(angle) * radius) / PLANET_RADIUS)
        .addScaledVector(site.forward, (Math.sin(angle) * radius) / PLANET_RADIUS)
        .normalize();
      gradeAt(herdSeat, site.right, site.forward, stance, headSlope);
      // Nothing grazes the scree either; see `MAX_SLOPE`. The site gate is a
      // mean over the whole spread, so this is what catches the outcrop inside
      // an otherwise gentle field.
      if (headSlope.grade > MAX_SLOPE) continue;
      const seat = Math.min(reliefAt(herdSeat.x, herdSeat.y, herdSeat.z), headSlope.lowest) - site.relief;

      herdPoint.set(Math.cos(angle) * radius, seat, Math.sin(angle) * radius);
      const matrix = new THREE.Matrix4().compose(herdPoint, herdQuat, herdScale);
      members.push({ merged, matrix });
      heads.push({ species: site.species, region: site.region, variant, pose: poseKind, matrix });
      vertices += merged.position.length / 3;
    }
    if (members.length === 0) return null;

    const position = new Float32Array(vertices * 3);
    const normal = new Float32Array(vertices * 3);
    const color = new Float32Array(vertices * 3);
    const outline = new Float32Array(vertices * 3);
    let cursor = 0;
    for (const member of members) {
      herdNormal.getNormalMatrix(member.matrix);
      const source = member.merged;
      for (let i = 0; i < source.position.length; i += 3) {
        herdPoint.set(source.position[i]!, source.position[i + 1]!, source.position[i + 2]!).applyMatrix4(member.matrix);
        position[cursor] = herdPoint.x;
        position[cursor + 1] = herdPoint.y;
        position[cursor + 2] = herdPoint.z;
        herdPoint.set(source.normal[i]!, source.normal[i + 1]!, source.normal[i + 2]!).applyMatrix3(herdNormal).normalize();
        normal[cursor] = herdPoint.x;
        normal[cursor + 1] = herdPoint.y;
        normal[cursor + 2] = herdPoint.z;
        herdPoint.set(source.outline[i]!, source.outline[i + 1]!, source.outline[i + 2]!).applyMatrix3(herdNormal).normalize();
        outline[cursor] = herdPoint.x;
        outline[cursor + 1] = herdPoint.y;
        outline[cursor + 2] = herdPoint.z;
        color[cursor] = source.color[i]!;
        color[cursor + 1] = source.color[i + 1]!;
        color[cursor + 2] = source.color[i + 2]!;
        cursor += 3;
      }
    }
    const geometry = geometryOf({ position, normal, color, outline, triangles: vertices / 3 });
    const rigged = shape.rigs !== undefined && shape.rigs.length > 0 && options.rigs !== undefined;
    return { geometry, triangles: vertices / 3, bytes: position.byteLength * 4, heads: members.length, animals: rigged ? heads : undefined };
  }

  /** Builds whatever the last frame asked for, under a millisecond budget. */
  function serve(): void {
    if (wanted.size === 0) {
      stats.lastBuildMs = 0;
      return;
    }
    const started = performance.now();
    const budget = detailBuild(BUILD_BUDGET_MS);
    // The set itself and not a copy: this runs every frame something is
    // waiting, and a set may drop the entry it is visiting. Nothing below adds
    // to it — only `update` does.
    for (const key of wanted) {
      // Checked before a build rather than after one, inside this file's slice
      // and the frame's (`mayBuild` in `view.ts`): what moves is served after
      // every streamer, out of what they left.
      if (!mayBuild(started, budget, true)) break;
      wanted.delete(key);
      const parts = key.split('|');
      if (parts[0] === 'v') {
        const style = trafficCache.get(parts[2]!);
        const built = style === undefined ? null : buildVehicle(key, parts[1]!, style, parts[2]!, Number(parts[3]));
        if (built === null) refused.add(key);
        else if (built !== 'pending') pool.set(key, built);
      } else if (parts[0] === 'w') {
        const built = buildWalker(key, parts[1]!, Number(parts[2]));
        if (built === null) refused.add(key);
        else built.forEach((entry, phase) => pool.set(`${key}|${phase}`, entry));
      } else if (parts[0] === 'h') {
        // A site the scan has not described is **not** a refusal, and the
        // distinction matters because `refused` is permanent: `herdSites` is
        // bounded the way `chains` is, so a key can outlive its record by one
        // scan, and refusing it would delete that herd for the session.
        const site = herdSites.get(key);
        if (site !== undefined) {
          const built = buildHerd(key, site);
          // A rig still on its way is asked for again by the next scan.
          if (built === null) refused.add(key);
          else if (built !== 'pending') pool.set(key, built);
        }
      }
    }
    stats.lastBuildMs = performance.now() - started;
  }

  // ------------------------------------------------------------------
  // Routes
  // ------------------------------------------------------------------

  /**
   * A mover on a road, `s` units along it from its first gate.
   *
   * **The height is the ribbon's own surface, asked of `surfaceLift`** — the
   * crown under a car, the shoulder under a walker on the verge — and not a
   * lift restated here. It was `elevationAt + RIBBON_LIFT` everywhere, which was
   * right on the crown between the towns and wrong at both ends of every road:
   * the ribbon climbs to its gate's paving now, and a car at the old lift would
   * drive into the embankment under a gate cut high on a hill and float over one
   * cut low. A walker on the verge stood a full lift over the shoulder for the
   * same reason; the surface puts him on it, and on the ground past it.
   */
  function roadFrame(index: number, s: number, lateral: number, out: Frame, ground: boolean): void {
    const course = geometry.course(index);
    const path = geometry.path(index);
    roadFrameOf(course, path, s, lateral, out);
    if (!ground) {
      out.height = PLANET_RADIUS + 20;
      out.live = true;
      return;
    }
    const elevation = world.elevationAt(out.dir);
    const ramp = rampFor(index);
    const sB = path.length - s;
    const centre = needsCentre(ramp, s, sB)
      ? world.elevationAt(coursePoint(course, parameterAt(path, s), onCentre))
      : elevation;
    const half = (ROAD_CLASSES[roads[index]!.cls] ?? ROAD_CLASSES[0]!).width * 0.5;
    out.live = elevation > 0;
    out.height = PLANET_RADIUS + elevation + Math.max(0, surfaceLift(ramp, half, s, sB, lateral, elevation, centre));
  }

  /**
   * A craft going round a circle on the sea.
   *
   * A closed loop and not a there-and-back, because a there-and-back has two
   * instants a lap at which the heading reverses and no easing hides them. A
   * circle of 160 to 520 units against a 1,700-unit reach is a turn you can
   * watch the boat make, which is what says *under way* rather than *adrift*.
   */
  function circleFrame(
    centre: THREE.Vector3, radius: number, rate: number, phase: number, clock: number,
    height: number, out: Frame,
  ): void {
    upAxis.copy(centre);
    northward.set(0, 1, 0).projectOnPlane(upAxis);
    if (northward.lengthSq() < 1e-8) northward.set(1, 0, 0).projectOnPlane(upAxis);
    northward.normalize();
    eastward.crossVectors(upAxis, northward).normalize();
    const angle = phase + clock * rate;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    out.dir
      .copy(upAxis)
      .addScaledVector(eastward, (c * radius) / PLANET_RADIUS)
      .addScaledVector(northward, (s * radius) / PLANET_RADIUS)
      .normalize();
    out.forward
      .copy(eastward).multiplyScalar(-s)
      .addScaledVector(northward, c)
      .projectOnPlane(out.dir)
      .normalize();
    out.height = height;
    out.roll = 0;
    out.live = true;
  }

  // ------------------------------------------------------------------
  // Scanning: which movers should exist
  // ------------------------------------------------------------------

  const movers = new Map<string, Mover>();
  const flocks = new Map<string, Flock>();
  const cone = createViewCone(KEEP_ALL_WITHIN);
  const scanned = new THREE.Vector3(Infinity, 0, 0);
  const scannedAxis = new THREE.Vector3(0, 0, -1);
  let scannedVersion = -1;
  /** The other knob — which towns exist; see `PROMINENCE_RADIUS`. It empties `shownCache`. */
  let scannedProminence = -1;
  let scannedAltitude = -1;
  let scannedMs = -Infinity;
  let clockNow = 0;

  /**
   * What a bird cell's ground is worth, cached per cell.
   *
   * These are the scan's memory and they are what makes a second look at the
   * same ground free. They are also the one thing in the file that grows with
   * how far you have travelled rather than with what is standing, so each is
   * emptied wholesale at a bound: a flight round the planet at detail 6 would
   * otherwise leave a few hundred thousand short strings behind it. Emptying
   * rather than evicting, because what they hold is a pure function of a
   * coordinate — losing it costs one query, not a wrong answer.
   */
  const birdLife = new Map<string, number>();
  const birdGround = new Map<string, number>();
  const birdAcross = new THREE.Vector3();
  const birdNorth = new THREE.Vector3();
  /** What `gradeAt` fills for a flock's ring. See the lift in the sky scan. */
  const birdSlope: Slope = { grade: 0, across: 0, north: 0, lowest: 0, highest: 0 };
  /** The same memory, for the pasture. Cleared wholesale at the same bound. */
  const herdGround = new Map<string, number>();
  const herdStock = new Map<string, { list: Weighted<string>[]; region: RegionId; density: number }>();
  const herdSample = biomeSample();
  const herdProbe = new THREE.Vector3();
  /** What `gradeAt` fills for a whole herd's ground. Reused: one per candidate cell. */
  const herdSlope: Slope = { grade: 0, across: 0, north: 0, lowest: 0, highest: 0 };
  const CACHE_CAP = 20_000;
  function trim(): void {
    if (birdLife.size > CACHE_CAP) { birdLife.clear(); birdGround.clear(); }
    if (herdGround.size > CACHE_CAP) { herdGround.clear(); herdStock.clear(); }
    if (wetness.size > CACHE_CAP) { wetness.clear(); dryCentres.clear(); }
    if (nearestCache.size > CACHE_CAP) nearestCache.clear();
    if (shownCache.size > CACHE_CAP) shownCache.clear();
    // A herd's pool key is its *site* now, so a refusal is a coordinate rather
    // than one of the 1,008 vehicle keys and the set grows with how far you
    // have flown. Emptying it costs one retry each; leaving it unbounded is a
    // string per steep field crossed in a session.
    if (refused.size > CACHE_CAP) refused.clear();
  }

  /** Whether a stretch of sea really is sea. Cached per candidate for ever. */
  const wetness = new Map<string, boolean>();
  const probe = new THREE.Vector3();
  const dryCentres = new Set<string>();
  function isWet(centre: THREE.Vector3, radius: number, key: string): boolean {
    const known = wetness.get(key);
    if (known !== undefined) return known;
    // **The centre is tested once for the whole candidate, not once per
    // radius.** Three radii are tried before a course is given up, and each was
    // re-asking the same point-in-polygon: inland, where every candidate fails,
    // that is three queries a slot and the water scan is four hundred slots.
    const stem = key.slice(0, key.lastIndexOf('.'));
    if (dryCentres.has(stem)) return false;
    if (world.elevationAt(centre) > 0) {
      dryCentres.add(stem);
      wetness.set(key, false);
      return false;
    }
    upAxis.copy(centre);
    northward.set(0, 1, 0).projectOnPlane(upAxis);
    if (northward.lengthSq() < 1e-8) northward.set(1, 0, 0).projectOnPlane(upAxis);
    northward.normalize();
    eastward.crossVectors(upAxis, northward).normalize();
    let wet = world.elevationAt(centre) <= 0;
    for (let i = 0; wet && i < 6; i++) {
      const angle = (i / 6) * TAU;
      probe
        .copy(centre)
        .addScaledVector(eastward, (Math.cos(angle) * radius) / PLANET_RADIUS)
        .addScaledVector(northward, (Math.sin(angle) * radius) / PLANET_RADIUS)
        .normalize();
      wet = world.elevationAt(probe) <= 0;
    }
    wetness.set(key, wet);
    return wet;
  }

  /**
   * The place nearest a direction, cached per sea cell.
   *
   * A boat needs a region for its paint and its mix, and there is no country
   * under it. This is a linear pass over 7,320 places, which is why it is cached
   * on the cell rather than on the boat: at two boats a cell it would otherwise
   * be run twice for the same answer.
   */
  const nearestCache = new Map<string, number>();
  function nearestPlace(dir: THREE.Vector3, key: string): number {
    const known = nearestCache.get(key);
    if (known !== undefined) return known;
    let best = 0;
    let bestDot = -2;
    for (let i = 0; i < places.length; i++) {
      const dot = dir.x * direction[i * 3]! + dir.y * direction[i * 3 + 1]! + dir.z * direction[i * 3 + 2]!;
      if (dot > bestDot) {
        bestDot = dot;
        best = i;
      }
    }
    nearestCache.set(key, best);
    return best;
  }

  /**
   * The nearest place that is *built*, for the herds, which stand outside a
   * village and not outside a name. A hidden place has no houses to keep a
   * cow away from — see `isShown` — so this skips them, with its own cache
   * because the answer changes when the prominence knob moves and the boats'
   * answer above does not. Returns -1 when nothing is shown at all.
   */
  const shownCache = new Map<string, number>();
  const shownMask = new Uint8Array(places.length);
  let shownFor = -1;
  function nearestShown(dir: THREE.Vector3, key: string): number {
    const known = shownCache.get(key);
    if (known !== undefined) return known;
    if (shownFor !== prominenceVersion()) {
      for (let i = 0; i < places.length; i++) shownMask[i] = isShown(places[i]!) ? 1 : 0;
      shownFor = prominenceVersion();
    }
    let best = -1;
    let bestDot = -2;
    for (let i = 0; i < places.length; i++) {
      if (shownMask[i] === 0) continue;
      const dot = dir.x * direction[i * 3]! + dir.y * direction[i * 3 + 1]! + dir.z * direction[i * 3 + 2]!;
      if (dot > bestDot) {
        bestDot = dot;
        best = i;
      }
    }
    shownCache.set(key, best);
    return best;
  }

  /**
   * Is there room for a herd here, clear of the two built things that are not a
   * town — and of the field a plane or a balloon stands in, which is not built
   * but is taken?
   *
   * **A road is a line and a monument is a pad, and neither is the disc the town
   * gate above tests.** The road half is `vegetation.ts`'s test with a herd in
   * place of a plant: the index is `roads.ts`'s, shared with the wood so the 28
   * ms of bucketing is paid once, the chords are the course's own `coursePath`
   * so a cow stands off the ribbon that is actually drawn — gate to gate —
   * rather than off a line between two town centres, and the clearance
   * is the two halves neither file states for the other — `roadClearance` is
   * half the drawn strip and `spread` is how wide this herd stands.
   *
   * The monument half needs no list and no footprint, which is why there is no
   * fourth copy of `WIDEST_FOOTPRINT` here: a monument's ground *is* its pad,
   * `terrain.ts` is the one definition of where that is, and `flattenWeightAt`
   * is already exported for `globe.ts`. Anything over zero is inside the flat
   * the landmark stands on.
   */
  const madeHere = new THREE.Vector3();
  const madeLast = new THREE.Vector3();
  const madeLeg = new THREE.Vector3();
  const madeFoot = new THREE.Vector3();
  const madeToward = new THREE.Vector3();
  const roadHits: number[] = [];
  const roadIndex =
    roads.length > 0 && places.length > 0 ? roadIndexFor(roads, places) : null;

  const fieldHits: FieldKeepout[] = [];

  function clearOfMade(centre: THREE.Vector3, spread: number): boolean {
    if (flattenWeightAt(centre.x, centre.y, centre.z) > 0) return false;
    // A standing aircraft's field: `fieldsNear` answers the fields whose own
    // radius reaches within `spread` of the herd's centre, which is the test.
    fieldHits.length = 0;
    if (options.fields !== undefined && options.fields.fieldsNear(centre, spread, fieldHits).length > 0) return false;
    if (roadIndex === null) return true;
    const widest = spread + roadClearance(ROAD_CLASSES.length - 1);
    madeToward.copy(centre).multiplyScalar(PLANET_RADIUS);
    for (const hit of roadIndex.near(centre, widest, roadHits)) {
      const road = roads[hit]!;
      const clear = spread + roadClearance(road.cls);
      const path = geometry.path(hit);
      for (let step = 0; step < path.count; step++) {
        madeHere
          .set(path.xyz[step * 3]!, path.xyz[step * 3 + 1]!, path.xyz[step * 3 + 2]!)
          .multiplyScalar(PLANET_RADIUS);
        if (step > 0) {
          // Point to segment, in world space rather than in a tangent frame:
          // one herd against a few dozen chords is not the thousands of plants
          // per tile that made the projection worth it in `vegetation.ts`.
          madeLeg.subVectors(madeHere, madeLast);
          const lengthSq = madeLeg.lengthSq();
          let t = 0;
          if (lengthSq > 1e-6) {
            t = madeFoot.subVectors(madeToward, madeLast).dot(madeLeg) / lengthSq;
            t = t < 0 ? 0 : t > 1 ? 1 : t;
          }
          madeFoot.copy(madeLast).addScaledVector(madeLeg, t);
          if (madeFoot.distanceTo(madeToward) < clear) return false;
        }
        madeLast.copy(madeHere);
      }
    }
    return true;
  }

  const candidates: Mover[] = [];
  const nearRoads: { index: number; near: number }[] = [];

  /**
   * Works out where a candidate is right now, cheaply, and keeps it if it is
   * both in range and on the screen.
   *
   * **The distance test skips the ground query on purpose.** `elevationAt` is a
   * point-in-polygon at 3.6 microseconds and a scan looks at up to a few hundred
   * candidates; asking it here would put three milliseconds into a scan to
   * refine a distance by at most the 700 units of relief on this planet, which
   * is inside the hysteresis anyway. The mover asks properly once it is standing
   * and is placed every frame.
   */
  function consider(mover: Omit<Mover, 'at' | 'mesh' | 'distance'>, viewer: THREE.Vector3, range: number): void {
    const standing = movers.get(mover.key);
    if (standing !== undefined) {
      // **A mover that has driven out of the frame gives up its slot**, which
      // is the half of the timer fix that matters. Without it the cast is
      // re-derived on schedule and the same ninety movers keep their places
      // whether or not any of them is still on the screen — the budget spent on
      // the road behind you, which is the radius bug `view.ts` exists to have
      // deleted, arriving through the one door that moves by itself.
      if (!cone.keeps(standing.at, 20)) return;
      standing.distance = standing.at.distanceTo(viewer);
      candidates.push(standing);
      return;
    }
    mover.route(clockNow, probeFrame, false);
    point.copy(probeFrame.dir).multiplyScalar(probeFrame.height);
    const distance = point.distanceTo(viewer);
    if (distance > range || !cone.admits(point, 14)) return;
    candidates.push({ ...mover, at: point.clone(), mesh: null, distance });
  }

  function scan(viewer: THREE.Vector3, altitude: number): void {
    candidates.length = 0;
    const reach = (base: number, ceiling: number): number =>
      altitude > ceiling ? 0 : Math.min(fogFar(altitude, PLANET_RADIUS) * 1.1, detailReach(base));
    /**
     * **A ceiling written as a zero reach does not switch a family off, and for
     * a while none of them did.** `slantRange(altitude, reach)` is
     * `hypot(altitude, reach)`, so a reach of zero comes back as the *altitude*
     * — and `consider` then admits anything closer than that, which from the air
     * is precisely the disc of ground directly under the aircraft. Measured at
     * 1,400 units over Ulm with `CEILING.herd` at 900: **two herds standing**,
     * on ground the camera is never pointed at, past a ceiling written to
     * prevent exactly that. It is the radius bug `view.ts` exists to have
     * deleted, walking back in through the one line that was meant to stop it,
     * and it was only ever a *near* miss on the other three families because
     * `distance > range` is a strict comparison and the ground under you is at
     * almost exactly `altitude`.
     */
    const rangeFor = (base: number, ceiling: number): number => {
      const along = reach(base, ceiling);
      return along <= 0 ? 0 : slantRange(altitude, along);
    };
    const roadRange = rangeFor(ROAD_REACH, CEILING.road);
    const waterRange = rangeFor(WATER_REACH, CEILING.water);
    const footRange = rangeFor(FOOT_REACH, CEILING.foot);
    const birdRange = rangeFor(BIRD_REACH, CEILING.air);
    const herdRange = rangeFor(HERD_REACH, CEILING.herd);
    stats.reach = reach(ROAD_REACH, CEILING.road);

    // --- the road, and the verge beside it -------------------------------
    //
    // **Two passes, and the second one is capped.** The first is arithmetic over
    // every road on the planet — a squared distance and no square root — and
    // costs about half a millisecond over 49,287. The second is the expensive
    // one: five seeded draws a road, and `rngFrom` hashes its arguments. In the
    // Ile-de-France there are eight hundred roads inside the on-foot reach, so
    // leaving the second pass uncapped measured a **scan of 8 to 26 ms every
    // 700 ms** — a visible hitch, for candidates that were then thrown away by
    // a cap of eighteen. Nearest-first and a hard cap on how many roads are even
    // *considered* takes it to a fraction of that, and it takes nothing away:
    // the budget was always going to spend itself on the nearest roads.
    if (roads.length > 0 && (roadRange > 0 || footRange > 0)) {
      const anchor = PLANET_RADIUS + 20;
      const widest = Math.max(roadRange, footRange);
      nearRoads.length = 0;
      for (let i = 0; i < roads.length; i++) {
        const dx = roadMid[i * 3]! * anchor - viewer.x;
        const dy = roadMid[i * 3 + 1]! * anchor - viewer.y;
        const dz = roadMid[i * 3 + 2]! * anchor - viewer.z;
        const limit = widest + roadSpan[i]!;
        const squared = dx * dx + dy * dy + dz * dz;
        if (squared > limit * limit) continue;
        nearRoads.push({ index: i, near: Math.sqrt(squared) - roadSpan[i]! });
      }
      nearRoads.sort((a, b) => a.near - b.near);
      if (nearRoads.length > ROAD_SCAN_CAP) nearRoads.length = ROAD_SCAN_CAP;
      for (const entry of nearRoads) {
        const i = entry.index;
        const near = entry.near;
        const road = roads[i]!;
        const cls = road.cls;
        const style = trafficAt(road.a);
        const region = regionAt(road.a).id;
        const width = ROAD_CLASSES[cls]!.width;

        if (near < roadRange) {
          for (let slot = 0; slot < ROAD_SLOTS; slot++) {
            const rng = rngFrom('drive', i, slot);
            if (!rng.chance(OCCUPANCY[cls]! * Math.min(1.6, style.density * 2.4))) continue;
            const id = rng.weighted(style.road);
            const pooled = `v|${id}|${region}|${rng.int(VARIANTS)}`;
            const key = `r${i}.${slot}`;
            const chain = chainFor(i, key);
            const phase = rng.unit();
            const speed = Math.min(ROAD_SPEED[cls]! * rng.spread(1, 0.16), chain.total / MIN_SECONDS);
            const lateral = width * 0.26;
            consider({
              family: 'road',
              key,
              pool: pooled,
              speed,
              route: (clock, out, ground) => {
                const where = alongAt(chain, phase, speed, clock);
                chainFrame(chain, where.at, lateral, out, ground, where.back);
              },
            }, viewer, roadRange);
          }
        }

        // Nobody walks a trunk road, and a walker is only worth having where a
        // person is more than a few pixels.
        if (near < footRange && cls < 2) {
          for (let slot = 0; slot < 2; slot++) {
            const rng = rngFrom('walk', i, slot);
            if (!rng.chance(0.5)) continue;
            const pooled = `w|${region}|${rng.int(WALK_BODIES)}`;
            const key = `f${i}.${slot}`;
            const chain = chainFor(i, key);
            const phase = rng.unit();
            const speed = Math.min(WALK_SPEED * rng.spread(0.85, 0.18), chain.total / MIN_SECONDS);
            // On the verge, outside the carriageway, and on the side the
            // traffic keeps: `chainFrame` applies the country's side to both.
            const lateral = width * 0.5 + rng.range(1.4, 3.2);
            consider({
              family: 'foot',
              key,
              pool: pooled,
              speed,
              route: (clock, out, ground) => {
                const where = alongAt(chain, phase, speed, clock);
                chainFrame(chain, where.at, lateral, out, ground, where.back);
              },
            }, viewer, footRange);
          }
        }
      }
    }

    // --- the sea ----------------------------------------------------------
    if (waterRange > 0) {
      forEachCell(viewer, WATER_CELL, waterRange, (row, col) => {
        for (let slot = 0; slot < WATER_SLOTS; slot++) {
          const rng = rngFrom('sail', row, col, slot);
          if (!rng.chance(0.55)) continue;
          const centre = cellPoint(row, col, WATER_CELL, rng.range(0.1, 0.9), rng.range(0.1, 0.9));
          const key = `s${row}.${col}.${slot}`;
          // **A boat wants to be near a coast and a coast is where a circle
          // stops fitting**, so the course tightens rather than being refused.
          // Measured off Palma before this: one wet circle in the whole bay at a
          // single 160-to-520 draw, because six probes round a 400-unit circle
          // inside a 500-unit inlet always find land. Three radii take it to
          // four, which is a harbour with boats in it.
          const wide = rng.range(150, 340);
          const radius = [wide, wide * 0.55, wide * 0.3].find(
            (candidate, index) => isWet(centre, candidate, `${key}.${index}`),
          );
          if (radius === undefined) continue;
          const index = nearestPlace(centre, `${row}.${col}`);
          const style = trafficAt(index);
          if (style.water.length === 0) continue;
          const pooled = `v|${rng.weighted(style.water)}|${regionAt(index).id}|${rng.int(VARIANTS)}`;
          const rate = ((rng.chance(0.5) ? 1 : -1) * CRAFT_SPEED) / radius;
          const phase = rng.unit() * TAU;
          const swellPhase = rng.unit() * TAU;
          consider({
            family: 'water',
            key,
            pool: pooled,
            speed: CRAFT_SPEED,
            route: (clock, out) => {
              circleFrame(centre, radius, rate, phase, clock, PLANET_RADIUS - SEA_SINK, out);
              // A swell, and a lean into the turn. Small on purpose: a boat
              // that rocks visibly at 300 units is a boat in a storm.
              out.height += Math.sin(clock * 0.9 + swellPhase) * 0.35;
              out.roll = Math.sin(clock * 0.62 + swellPhase) * 0.05 + (rate > 0 ? 0.05 : -0.05);
            },
          }, viewer, waterRange);
        }
      });
    }

    // --- the pasture ------------------------------------------------------
    //
    // **The biome says what kind of animal, the region says whose, and there is
    // no third table.** That is the pair the vegetation uses and it is
    // `src/fauna/regions.ts`'s whole design: `BY_BIOME` is keyed on `BiomeId`
    // and `RANGE` on `RegionId`, and neither knows about the other. A camel
    // reaches the Kazakh steppe because its range includes `east-europe`, and
    // there is still no camel in Serbia because Serbian ground is `temperate`.
    //
    // The order of the gates is the trap the bird scan already wrote down: the
    // **cheap seeded draw goes before the point-in-polygon**, because
    // `elevationAt` is 3.6 microseconds and a scan at detail 3 walks several
    // hundred cells. Rejecting seven in ten before the ground is ever asked
    // about is most of what this costs.
    herds.registry = bestiary.size;
    herds.altitude = altitude;
    herds.range = herdRange;
    herds.cells = 0; herds.chanced = 0; herds.inRange = 0; herds.land = 0;
    herds.stocked = 0; herds.dense = 0; herds.clearOfTown = 0; herds.clearOfSlope = 0;
    herds.clearOfMade = 0; herds.offered = 0;
    // Bounded here rather than inside the loop, so that everything one scan
    // writes survives that scan: `serve` reads these back on the same frame.
    if (herdSites.size > 4000) herdSites.clear();
    if (herdRange > 0 && bestiary.size > 0) {
      forEachCell(viewer, HERD_CELL, herdRange, (row, col) => {
        herds.cells++;
        const rng = rngFrom('herd', row, col);
        if (!rng.chance(HERD_CHANCE)) return;
        herds.chanced++;
        const key = `${row}.${col}`;
        const centre = cellPoint(row, col, HERD_CELL, rng.range(0.2, 0.8), rng.range(0.2, 0.8));

        // **The disc, before the ground.** `forEachCell` walks a square and the
        // reach is a circle, so a third to a half of every cell it visits is
        // outside the range before anything is asked about it. Rejecting one
        // here is a subtraction; rejecting it in `consider` is a `biomeAt`, a
        // `countryAt` and a point-in-polygon first.
        //
        // **Counted rather than timed, and deliberately** — on a loaded machine
        // the same cold scan over Finnmark read 11.7 ms and then 16.4 ms with
        // *less* work in it, which is the machine and not the code. The cells
        // are exact:
        //
        // ```
        //   latitude   cells visited   inside the reach   rejected here
        //      0            441              241              45%
        //     48            693              349              50%
        //     70          1,029              681              34%
        // ```
        //
        // The high-latitude row is the expensive one and the rejection does
        // least for it, which is worth knowing: what makes a polar scan cost
        // 2.3x an equatorial one is `forEachCell`'s longitude clamp widening the
        // sweep to 49 columns, and that is a fact about the grid rather than
        // about the herds.
        herdProbe.copy(centre).multiplyScalar(PLANET_RADIUS + 20);
        if (herdProbe.distanceTo(viewer) > herdRange + 60) return;
        herds.inRange++;

        let ground = herdGround.get(key);
        if (ground === undefined) {
          ground = world.elevationAt(centre);
          herdGround.set(key, ground);
        }
        if (ground <= 0) return;
        herds.land++;

        let choices = herdStock.get(key);
        if (choices === undefined) {
          const lat = latOf(centre.y);
          const lon = lonOf(centre.x, centre.z);
          const biome = biomeAt(centre.x, centre.y, centre.z, lat, lon, ground, herdSample);
          const index = world.countryAt(lat, lon);
          const country = index > 0 ? world.countries[index - 1] : undefined;
          const region = regionFor(country?.iso ?? '', continentOf.get(country?.iso ?? '') ?? '', lat);
          const style = FAUNA_STYLES[region.id as RegionId];
          // `stock` is a second, softer gate over the climate's own list: the
          // biome says a camel could live here and the region says how much of
          // the local livestock actually is one. It multiplies rather than
          // filtering, so a region that leaves an animal out still gets it if
          // the climate insists — a Norwegian summer farm has cattle whatever
          // the table thinks.
          const stockOf = (id: string): number =>
            0.6 + (style.stock.find((entry) => entry.item === id)?.weight ?? 0) * 0.5;
          choices = {
            list: BY_BIOME[biome.id]
              .filter((entry) => nativeHere(entry.item, region.id as RegionId) && bestiary.has(entry.item))
              .map((entry) => ({ item: entry.item, weight: entry.weight * stockOf(entry.item) })),
            region: region.id as RegionId,
            // **How many head a place carries is `biome.ts`'s `cover`**, which
            // is the same number the vegetation spends on plants and the birds
            // spend on flocks. Nothing in this file knows what a desert is: the
            // Sahara gets a camel string every few hundred units because its
            // cover is 0.03, and the same arithmetic fills an Irish field.
            density: Math.min(1, 0.15 + BIOMES[biome.id].cover * 1.1) * style.density,
          };
          herdStock.set(key, choices);
        }
        if (choices.list.length === 0) return;
        herds.stocked++;
        if (!rng.chance(choices.density)) return;
        herds.dense++;

        // **A herd stands outside the village, and the test is deliberately the
        // last one.** It is a linear pass over 23,867 places, which is why it
        // runs only on the handful of cells that have already passed everything
        // else — the water scan learned the same lesson from the other end. The
        // answer is cached per cell for ever.
        const nearest = places[nearestShown(centre, `p${key}`)];
        if (nearest !== undefined) {
          // **The margin is 12 and it was 40, and 40 emptied Europe.** The test
          // is only there to stop a herd standing inside the buildings, and
          // `radiusOf` already *is* where the buildings are. Measured around
          // Ulm — the densest 1,500-unit neighbourhood on the planet, 192 places
          // in it — a 40-unit margin left **0 herds at the shipped detail** and
          // a 12-unit one leaves them in the fields between the villages, which
          // is where a cow is.
          const keepOut = radiusOf(nearest) + 12;
          unitAt(nearest.lat, nearest.lon, herdProbe);
          if (herdProbe.angleTo(centre) * PLANET_RADIUS < keepOut) return;
        }
        herds.clearOfTown++;

        const species: string = rng.weighted(choices.list);
        const entry = bestiary.get(species)!;
        const [low, high] = FAUNA_KINDS[entry.kind].group;
        const heads = rng.between(low, high);
        // The herd widens with its own count, so ten sheep are not stacked in
        // the space three cattle would take. `size[0]` is the animal's own
        // length and it is why `Animal.size` is three numbers and not a radius.
        const spread = Math.max(HERD_SPREAD, entry.size[0] * 0.55 * Math.sqrt(heads));

        // **And nothing grazes a mountain face.** The same rule the vegetation
        // is held to and the same one definition of it — `MAX_SLOPE` and
        // `gradeAt` in `terrain.ts`, never a second gradient — asked **over the
        // ground the herd occupies rather than under its centre**, because a
        // herd has a spread and a herd on a 30-degree face with one animal on
        // level ground is still a herd on a face. `gradeAt`'s four probes go
        // out at `spread`, so the answer is the mean tilt across the disc the
        // animals are scattered over.
        //
        // Its own gate rather than a line inside the next one, so the
        // diagnostic can say which line returned. Two measurements, and they
        // are different questions (2026-09-08). Of the **ground**, over a
        // 1.2-degree box, it refuses 73.9% of a Norwegian fjord, 46.7% of the
        // Alps, 34.0% of the Rift escarpment behind the Serengeti and 25.7% of
        // the Altiplano, against **4.65% of the world's land** — which is
        // `MAX_SLOPE`'s own 4.9% asked at this reach. Of the **cells that reach
        // it** in a scan at detail 1, which is the number that decides what you
        // see, it drops 50% in Nepal, 38% in the Alps, 29% over the fjord, 23%
        // around Ulm, 20% on the Altiplano, 7% at the Serengeti and **nothing**
        // in the Sahara, in Mongolia, in Finnmark or in Cornwall.
        //
        // It runs before `clearOfMade` because it is the cheaper of the two —
        // four `reliefAt` calls and no index, where that one buckets the road
        // network and re-walks every carriageway near enough to matter — which
        // is the argument this file already made for the order of the gates
        // inside it.
        northward.set(0, 1, 0).projectOnPlane(centre);
        if (northward.lengthSq() < 1e-8) northward.set(1, 0, 0).projectOnPlane(centre);
        northward.normalize();
        eastward.crossVectors(centre, northward).normalize();
        if (gradeAt(centre, eastward, northward, spread, herdSlope).grade > MAX_SLOPE) return;
        herds.clearOfSlope++;

        // **And off the two other things that are built.** The town gate above
        // is a disc and it was the only one: a herd could stand in a
        // carriageway, and one did, or inside a monument's footprint, which is
        // 55 units of pad with a landmark on it. The road is a *line* and not a
        // disc — the same distinction `vegetation.ts` makes, and the same two
        // halves stated by the two files that own them: `roadClearance` is half
        // the drawn strip and the herd brings its own `spread`. It runs after
        // the town gate for the reason that one runs last, and after the draws
        // so that no seed moves.
        if (!clearOfMade(centre, spread)) return;
        herds.clearOfMade++;
        const bearing = rng.unit() * TAU;
        const height = PLANET_RADIUS + ground;
        const moverKey = `g${row}.${col}`;
        // **A herd is a mover that does not move**, which is what lets it share
        // every piece of machinery in this file — the view cone, the
        // nearest-first budget, the least-recently-used pool — for no new code
        // at all. Grazing is the one activity in the world that is honestly
        // static.
        const route = (_clock: number, out: Frame): void => {
          out.dir.copy(centre);
          out.height = height;
          northward.set(0, 1, 0).projectOnPlane(centre);
          if (northward.lengthSq() < 1e-8) northward.set(1, 0, 0).projectOnPlane(centre);
          northward.normalize();
          eastward.crossVectors(centre, northward).normalize();
          out.forward
            .copy(northward).multiplyScalar(Math.cos(bearing))
            .addScaledVector(eastward, Math.sin(bearing))
            .normalize();
          out.roll = 0;
          out.live = true;
        };

        // The site, for `buildHerd` to seat its animals against. **The frame is
        // taken from the route and from `update`'s own two lines rather than
        // written a third time**: the mesh's local X and Z are what those
        // produce, and a builder that derived them again would seat every
        // animal a few units from where it is drawn — which is a herd sunk into
        // the hill, and invisible in any still that does not have the hill in
        // it.
        const pooled = `h|${row}.${col}`;
        route(0, probeFrame);
        const forwardAt = probeFrame.forward.clone().projectOnPlane(centre).normalize();
        herdSites.set(pooled, {
          species,
          region: choices.region,
          heads,
          spread,
          centre,
          forward: forwardAt,
          right: new THREE.Vector3().crossVectors(centre, forwardAt).normalize(),
          relief: reliefAt(centre.x, centre.y, centre.z),
        });
        consider({
          family: 'herd',
          key: moverKey,
          pool: pooled,
          speed: 0,
          heads,
          route,
        }, viewer, herdRange);
        herds.offered++;
      });
    }

    // --- the sky ----------------------------------------------------------
    const seen = new Set<string>();
    if (birdRange > 0) {
      forEachCell(viewer, BIRD_CELL, birdRange, (row, col) => {
        const rng = rngFrom('flock', row, col);
        // **The cheap draw goes first and it is not tidiness.** The second gate
        // costs a point-in-polygon and a biome lookup — about 4 microseconds —
        // and a scan at detail 3 walks five hundred cells. Rejecting seven in
        // ten before the ground is ever asked about takes that from 2.2 ms a
        // scan to 0.7, and the answer is then cached per cell for ever, so a
        // second scan of the same ground is free.
        if (!rng.chance(FLOCK_CHANCE)) return;
        const key = `b${row}.${col}`;
        const centre = cellPoint(row, col, BIRD_CELL, rng.range(0.2, 0.8), rng.range(0.2, 0.8));
        let living = birdLife.get(key);
        if (living === undefined) {
          const elevation = world.elevationAt(centre);
          // **How many birds a place has is a question `biome.ts` already
          // answers.** `cover` is what the vegetation spends on plants — 0.03
          // in the Sahara, 0.9 in the Amazon — and a sky as full over a dune
          // field as over a wood is the uniform band that whole file exists to
          // prevent. The sea gets a flat share of its own, because a seabird
          // does not care what grows.
          living = elevation <= 0
            ? 0.55
            : 0.12 + 0.88 * BIOMES[biomeAt(
                centre.x, centre.y, centre.z,
                latOf(centre.y),
                lonOf(centre.x, centre.z),
                Math.max(0, elevation), biomeSample(),
              ).id].cover;
          // **And the ground it is asked about is the ground the flock circles
          // over, not the point under its centre.** A flock's altitude was one
          // `elevationAt` at the cell centre plus 45 to 130 of air, and its
          // members ride a ring up to `FLOCK_RADIUS[1]` out — so over a
          // hillside the far side of the ring was inside the rock. Measured
          // over 20,000 land cells (2026-09-08): the air under a circling bird
          // is 79 units at the median and **-0.3 at the p01**, and 1.01% of
          // flocks had a bird in the hill. After the lift, and measured against
          // a 24-point ring rather than against the four probes it is computed
          // from: **none**, at a p01 clearance of 45.4 units.
          //
          // The lift is the highest of `gradeAt`'s four probes at that radius,
          // which is `terrain.ts`'s one definition of the ground again and not
          // a fifth sampler — the same call the herds' gate is built on. It is
          // free: this cell's answer is cached for ever, and on flat ground the
          // highest probe *is* the centre, so nothing moves where nothing is
          // steep. It is not `MAX_SLOPE`: a bird is the one thing here that is
          // allowed over a mountain face, it just may not be inside it.
          birdAcross.set(0, 1, 0).projectOnPlane(centre);
          if (birdAcross.lengthSq() < 1e-8) birdAcross.set(1, 0, 0).projectOnPlane(centre);
          birdAcross.normalize();
          birdNorth.crossVectors(centre, birdAcross).normalize();
          gradeAt(centre, birdAcross, birdNorth, FLOCK_RADIUS[1], birdSlope);
          const rise = Math.max(0, birdSlope.highest - reliefAt(centre.x, centre.y, centre.z));
          birdGround.set(key, Math.max(0, elevation) + rise);
          birdLife.set(key, living);
        }
        if (!rng.chance(living)) return;
        const ground = birdGround.get(key) ?? 0;
        const altitudeOf = PLANET_RADIUS + ground + rng.range(45, 130);
        point.copy(centre).multiplyScalar(altitudeOf);
        if (point.distanceTo(viewer) > birdRange || !cone.admits(point, 140)) return;
        seen.add(key);
        if (flocks.has(key)) return;
        flocks.set(key, {
          centre,
          radius: rng.range(FLOCK_RADIUS[0], FLOCK_RADIUS[1]),
          altitude: altitudeOf,
          rate: (rng.chance(0.5) ? 1 : -1) * rng.range(0.14, 0.3),
          count: rng.int(FLOCK_MAX - FLOCK_MIN + 1) + FLOCK_MIN,
          seed: rng.int(0x7fffffff),
        });
      });
    }
    for (const key of [...flocks.keys()]) if (!seen.has(key)) flocks.delete(key);

    // --- the budget -------------------------------------------------------
    //
    // Nearest first under a cap per family and a cap over all of them, which is
    // the settlements' law with much smaller numbers in it. What falls off the
    // end is always the furthest, so the cast thins from the horizon inwards.
    herds.admitted = 0;
    candidates.sort((a, b) => a.distance - b.distance);
    const caps: Record<Family, number> = {
      road: Math.min(MAX_MOVERS, detailCount(ROAD_MOVERS)),
      water: Math.min(MAX_MOVERS, detailCount(WATER_MOVERS)),
      foot: Math.min(MAX_MOVERS, detailCount(FOOT_MOVERS)),
      herd: Math.min(MAX_MOVERS, detailCount(HERD_MOVERS)),
    };
    const taken: Record<Family, number> = { road: 0, water: 0, foot: 0, herd: 0 };
    const keep = new Set<string>();
    let total = 0;
    for (const candidate of candidates) {
      if (total >= MAX_MOVERS) break;
      if (taken[candidate.family] >= caps[candidate.family]) continue;
      taken[candidate.family]++;
      if (candidate.family === 'herd') herds.admitted++;
      total++;
      keep.add(candidate.key);
      if (!movers.has(candidate.key)) movers.set(candidate.key, candidate);
    }
    for (const [key, mover] of movers) {
      if (keep.has(key)) continue;
      if (mover.animated) releaseHerd(mover);
      if (mover.person) {
        group.remove(mover.person.holder);
        // Back to the cast's pool, not disposed: see `Cast.release`.
        folk?.release(mover.person.person);
        mover.person = null;
      }
      if (mover.mesh !== null) {
        group.remove(mover.mesh);
        mover.mesh = null;
      }
      movers.delete(key);
    }
    trim();
    scannedVersion = detailVersion();
  }

  /** Walks the lat/lon cells of a given size within a range of the viewer. */
  function forEachCell(
    viewer: THREE.Vector3, size: number, range: number,
    visit: (row: number, col: number) => void,
  ): void {
    const length = viewer.length() || 1;
    const lat = latOf(viewer.y / length);
    const lon = lonOf(viewer.x, viewer.z);
    const rows = Math.ceil(range / (size * DEG * PLANET_RADIUS)) + 1;
    // A degree of longitude shrinks with the cosine, so a high-latitude scan
    // needs more columns to cover the same ground. Clamped, or a pole is a scan
    // of the whole planet.
    const cols = Math.min(24, Math.ceil(rows / Math.max(0.12, Math.cos(lat * DEG))));
    const row0 = Math.floor(lat / size);
    const col0 = Math.floor(lon / size);
    for (let dr = -rows; dr <= rows; dr++) {
      const row = row0 + dr;
      if (row * size < -89 || row * size > 88) continue;
      for (let dc = -cols; dc <= cols; dc++) visit(row, col0 + dc);
    }
  }

  /** A unit vector inside one lat/lon cell. The planet's own handedness. */
  function cellPoint(row: number, col: number, size: number, u: number, v: number): THREE.Vector3 {
    return unitAt((row + u) * size, (col + v) * size, new THREE.Vector3());
  }

  const wrap = (t: number): number => {
    const f = t % 1;
    return f < 0 ? f + 1 : f;
  };

  // ------------------------------------------------------------------
  // The flock's one mesh
  // ------------------------------------------------------------------

  const bird = birdGeometry();
  const birdVertices = bird.position.length / 3;
  const flockGeometry = new THREE.BufferGeometry();
  const flockPosition = new Float32Array(MAX_BIRDS * birdVertices * 3);
  const flockNormal = new Float32Array(MAX_BIRDS * birdVertices * 3);
  const flockColor = new Float32Array(MAX_BIRDS * birdVertices * 3);
  for (let i = 0; i < MAX_BIRDS; i++) flockColor.set(bird.color, i * bird.color.length);
  flockGeometry.setAttribute('position', new THREE.BufferAttribute(flockPosition, 3));
  flockGeometry.setAttribute('normal', new THREE.BufferAttribute(flockNormal, 3));
  flockGeometry.setAttribute('color', new THREE.BufferAttribute(flockColor, 3));
  flockGeometry.setDrawRange(0, 0);
  const flockMesh = new THREE.Mesh(flockGeometry, moverMaterial(false));
  flockMesh.name = 'birds';
  // Its members are spread over hundreds of units and every vertex moves every
  // frame, so a bounding sphere computed once would be wrong immediately.
  flockMesh.frustumCulled = false;
  group.add(flockMesh);

  const birdMatrix = new THREE.Matrix4();
  const wingMatrix = new THREE.Matrix4();
  const bankMatrix = new THREE.Matrix4();
  const birdNormal = new THREE.Matrix3();
  const wingNormal = new THREE.Matrix3();

  function drawBirds(clock: number): number {
    let cursor = 0;
    let drawn = 0;
    for (const flock of flocks.values()) {
      upAxis.copy(flock.centre);
      northward.set(0, 1, 0).projectOnPlane(upAxis);
      if (northward.lengthSq() < 1e-8) northward.set(1, 0, 0).projectOnPlane(upAxis);
      northward.normalize();
      eastward.crossVectors(upAxis, northward).normalize();
      // Banked into the turn, which is most of what says *circling* at 13 px.
      bankMatrix.makeRotationZ(flock.rate > 0 ? 0.34 : -0.34);
      for (let i = 0; i < flock.count && drawn < MAX_BIRDS; i++) {
        const rng = rngFrom(flock.seed, 'bird', i);
        const lead = rng.unit() * TAU;
        const radius = flock.radius * rng.spread(1, 0.28);
        const rise = rng.range(-14, 14);
        const beatRate = rng.range(5.5, 8.5);
        const angle = lead + clock * flock.rate;
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        here
          .copy(upAxis)
          .addScaledVector(eastward, (c * radius) / PLANET_RADIUS)
          .addScaledVector(northward, (s * radius) / PLANET_RADIUS)
          .normalize();
        forward
          .copy(eastward).multiplyScalar(-s)
          .addScaledVector(northward, c)
          .projectOnPlane(here)
          .normalize();
        right.crossVectors(here, forward).normalize();
        basis.makeBasis(right, here, forward);
        spin.setFromRotationMatrix(basis);
        point.copy(here).multiplyScalar(flock.altitude + rise + Math.sin(clock * 0.5 + lead) * 6);
        birdMatrix.compose(point, spin, unit).multiply(bankMatrix);
        birdNormal.getNormalMatrix(birdMatrix);

        // The flap. A wing is a rigid piece hinged on the bird's own Z, so the
        // whole animation is one rotation a side and no vertex ever moves in the
        // bird's own frame.
        const beat = Math.sin(clock * beatRate + lead) * 0.62;
        for (let v = 0; v < birdVertices; v++) {
          const boneId = bird.bone[v]!;
          let matrix = birdMatrix;
          let normals = birdNormal;
          if (boneId !== 0) {
            wingMatrix.makeRotationZ(boneId === 1 ? beat : -beat).premultiply(birdMatrix);
            wingNormal.getNormalMatrix(wingMatrix);
            matrix = wingMatrix;
            normals = wingNormal;
          }
          point.set(bird.position[v * 3]!, bird.position[v * 3 + 1]!, bird.position[v * 3 + 2]!).applyMatrix4(matrix);
          flockPosition[cursor] = point.x;
          flockPosition[cursor + 1] = point.y;
          flockPosition[cursor + 2] = point.z;
          point.set(bird.normal[v * 3]!, bird.normal[v * 3 + 1]!, bird.normal[v * 3 + 2]!)
            .applyMatrix3(normals).normalize();
          flockNormal[cursor] = point.x;
          flockNormal[cursor + 1] = point.y;
          flockNormal[cursor + 2] = point.z;
          cursor += 3;
        }
        drawn++;
      }
    }
    flockGeometry.setDrawRange(0, drawn * birdVertices);
    (flockGeometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (flockGeometry.getAttribute('normal') as THREE.BufferAttribute).needsUpdate = true;
    flockMesh.visible = drawn > 0;
    return drawn;
  }

  // ------------------------------------------------------------------
  // The frame
  // ------------------------------------------------------------------

  /**
   * A walker from the cast: its own skinned body, placed on its route and held
   * at the phase of the walk its distance says, so its feet keep time with the
   * verge instead of with the frame rate. The pool key is `w|<region>|<body>`,
   * and the region is all a dressing needs.
   */
  function drawWalker(mover: Mover, clock: number): void {
    const visible = frame.live && cone.keeps(mover.at, 20);
    if (!visible) {
      if (mover.person) mover.person.holder.visible = false;
      return;
    }
    if (!mover.person) {
      // A dressing is a whole skinned clone. A few a frame, and only while the
      // frame has room: a verge that comes into view with nine walkers on it
      // dresses them over three frames, each hidden until it is.
      if (dressedThisFrame >= DRESS_PER_FRAME || !frameOpenFor(dressedThisFrame, true)) return;
      dressedThisFrame++;
      const person = folk!.dress(mover.key, mover.pool.split('|')[1] ?? 'atlantic-europe');
      if (person === null) return;
      const holder = new THREE.Group();
      holder.name = `foot:${mover.key}`;
      holder.add(person.root);
      group.add(holder);
      person.actions.get('Walk')!.play();
      mover.person = { holder, person };
    }
    const { holder, person } = mover.person;
    holder.visible = true;
    walkersShown.push(mover);
    forward.copy(frame.forward).projectOnPlane(frame.dir).normalize();
    right.crossVectors(frame.dir, forward).normalize();
    basis.makeBasis(right, frame.dir, forward);
    holder.position.copy(mover.at);
    holder.quaternion.setFromRotationMatrix(basis);
    const walk = person.actions.get('Walk')!;
    walk.time = walkPhase(mover, clock) * walk.getClip().duration;
    person.mixer.update(0);
    stats.nearestMoving = Math.min(stats.nearestMoving, mover.at.distanceTo(lastViewer));
    stats.foot++;
    stats.meshes++;
  }

  /**
   * Rigs a herd stands up from when it is animated, kept by rig id and handed
   * out again repainted. Never disposed: a rigged body's geometry shares its
   * rig's positions, normals and weights, and disposing any geometry frees the
   * GPU buffers of every attribute on it, shared ones included.
   */
  const spareRigs = new Map<string, Rigged[]>();
  let animatedHeads = 0;
  let lastUpdate = 0;
  const fitScratch = new THREE.Vector3();

  /**
   * Stands a herd up as its animals, each a skinned copy of its rig playing the
   * clip its merged frame was taken from — `Eating` for a grazer, `Idle` for the
   * rest — from that same instant, so the swap from the merged buffer is not a
   * jump. False if the cap or a rig not yet arrived says wait.
   */
  function animateHerd(mover: Mover, pooled: Pooled, mesh: THREE.Mesh, dt: number): boolean {
    const rigs = options.rigs;
    if (rigs === undefined || pooled.animals === undefined) return false;
    if (!mover.animated) {
      if (animatedHeads + pooled.animals.length > HERD_ANIMATED_CAP) return false;
      // One herd stood up a frame, and only while the frame has room: each
      // animal is a skinned copy of its rig. Until then the merged herd stands
      // in for it, which is what it is at any distance past this.
      if (herdsStoodThisFrame >= HERDS_PER_FRAME || !frameOpenFor(herdsStoodThisFrame, true)) return false;
      herdsStoodThisFrame++;
      const holder = new THREE.Group();
      holder.name = `herd-animated:${mover.key}`;
      const heads: { rigged: Rigged; rig: string }[] = [];
      for (const head of pooled.animals) {
        const entry = bestiary.get(head.species);
        const style = FAUNA_STYLES[head.region as RegionId];
        if (entry?.rigs === undefined || style === undefined) continue;
        const shape = entry.shape(rngFrom(entry.id, style.id, head.variant), style);
        const choice = rngFrom(entry.id, style.id, head.variant, 'rig').weighted(entry.rigs.map((rig) => ({ item: rig, weight: rig.weight })));
        const rig = rigs.get(choice.id);
        if (rig === null) continue;
        const paint = rigPaint(shape, choice);
        const spare = spareRigs.get(choice.id)?.pop();
        let rigged: Rigged;
        if (spare !== undefined) {
          rigged = spare;
          const colors = rigged.body.geometry.getAttribute('color') as THREE.BufferAttribute;
          (colors.array as Float32Array).set(paintColors(rig as unknown as Model, paint));
          colors.needsUpdate = true;
        } else {
          rigged = makeRigged(rig, paint);
        }
        const size = rig.box.getSize(fitScratch);
        const k = entry.size[0] / size.z;
        rigged.root.position.set(-(rig.box.min.x + rig.box.max.x) / 2, -rig.box.min.y, -(rig.box.min.z + rig.box.max.z) / 2);
        const fit = new THREE.Group();
        fit.scale.setScalar(k);
        fit.add(rigged.root);
        const place = new THREE.Group();
        place.matrixAutoUpdate = true;
        head.matrix.decompose(place.position, place.quaternion, place.scale);
        place.add(fit);
        holder.add(place);
        const clipName = clipFor(rig, head.pose);
        const action = rigged.actions.get(clipName);
        if (action !== undefined) {
          action.reset().play();
          // From the instant the merged herd held it in, so the swap is not a jump.
          const still = rig.far[farFrameOf(rig, head.pose, `${head.species}|${head.region}|${head.variant}|${head.pose}`)];
          action.time = still?.time ?? 0;
          action.timeScale = 0.85 + rngFrom(mover.key, 'rate', heads.length).unit() * 0.3;
        }
        heads.push({ rigged, rig: choice.id });
      }
      if (heads.length === 0) return false;
      group.add(holder);
      mover.animated = { holder, heads };
      animatedHeads += heads.length;
    }
    const { holder, heads } = mover.animated;
    holder.visible = true;
    holder.position.copy(mesh.position);
    holder.quaternion.copy(mesh.quaternion);
    for (const head of heads) head.rigged.mixer.update(dt);
    return true;
  }

  function releaseHerd(mover: Mover): void {
    const animated = mover.animated;
    if (!animated) return;
    for (const head of animated.heads) {
      head.rigged.mixer.stopAllAction();
      head.rigged.root.removeFromParent();
      const spares = spareRigs.get(head.rig) ?? [];
      spares.push(head.rigged);
      spareRigs.set(head.rig, spares);
    }
    group.remove(animated.holder);
    animatedHeads -= animated.heads.length;
    mover.animated = null;
  }

  /** How far through its own stride a walker is, from the clock alone. */
  const walkPhase = (mover: Mover, clock: number): number => wrap((mover.speed * clock) / WALK_STRIDE);

  /** The viewer of the frame being drawn, for `drawWalker`'s share of `nearestMoving`. */
  const lastViewer = new THREE.Vector3();
  /** The walkers drawn this frame, for `collide`. */
  const walkersShown: Mover[] = [];
  const walkerGap = new THREE.Vector3();
  /** Skinned clones made this frame; see `DRESS_PER_FRAME` and `HERDS_PER_FRAME`. */
  let dressedThisFrame = 0;
  let herdsStoodThisFrame = 0;

  function update(viewer: THREE.Vector3, altitude: number, camera: THREE.Camera | undefined, clock: number): void {
    herds.frame++;
    walkersShown.length = 0;
    lastViewer.copy(viewer);
    dressedThisFrame = 0;
    herdsStoodThisFrame = 0;
    clockNow = clock;
    cone.aim(camera);
    const now = performance.now();
    if (prominenceVersion() !== scannedProminence) {
      // The herds were admitted against the towns as they were.
      scannedProminence = prominenceVersion();
      shownCache.clear();
      ramps.clear();
      scannedVersion = -1;
    }
    if (
      detailVersion() !== scannedVersion ||
      now - scannedMs > RESCAN_MS ||
      viewer.distanceTo(scanned) > RESCAN_MOVE ||
      cone.turnFrom(scannedAxis) > RESCAN_TURN ||
      Math.abs(altitude - scannedAltitude) > Math.max(60, scannedAltitude * 0.25)
    ) {
      scanned.copy(viewer);
      scannedAxis.copy(cone.axis);
      scannedAltitude = altitude;
      scannedMs = now;
      scan(viewer, altitude);
      stats.lastScanMs = Number((performance.now() - now).toFixed(2));
    }
    serve();

    stats.road = 0;
    stats.water = 0;
    stats.foot = 0;
    stats.herd = 0;
    stats.animals = 0;
    stats.animated = 0;
    // The animated animals keep the machine's time, not the sky's: a cow does
    // not chew faster when `setRate` runs the sun at 600x.
    const realDt = lastUpdate === 0 ? 0 : Math.min(0.1, (now - lastUpdate) / 1000);
    lastUpdate = now;
    stats.meshes = 0;
    stats.triangles = 0;
    stats.nearestMoving = Infinity;

    for (const mover of movers.values()) {
      mover.route(clock, frame, true);
      mover.at.copy(frame.dir).multiplyScalar(frame.height);

      if (mover.family === 'foot' && folk !== undefined) {
        drawWalker(mover, clock);
        continue;
      }

      const key = mover.family === 'foot'
        ? `${mover.pool}|${Math.min(WALK_PHASES - 1, Math.floor(walkPhase(mover, clock) * WALK_PHASES))}`
        : mover.pool;
      const pooled = pool.get(key);
      if (pooled !== undefined) usedAt.set(key, frameCount);
      if (pooled === undefined) {
        if (!refused.has(mover.pool)) wanted.add(mover.pool);
        if (mover.mesh !== null) mover.mesh.visible = false;
        if (mover.animated) releaseHerd(mover);
        continue;
      }
      if (!frame.live || !cone.keeps(mover.at, 20)) {
        if (mover.mesh !== null) mover.mesh.visible = false;
        if (mover.animated) mover.animated.holder.visible = false;
        continue;
      }

      let mesh = mover.mesh;
      if (mesh === null) {
        mesh = new THREE.Mesh(pooled.geometry, material);
        mesh.name = `${mover.family}:${mover.key}`;
        // Casts and receives; the flock below does neither, at 20 triangles a
        // bird in a mesh rewritten every frame.
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mover.mesh = mesh;
        group.add(mesh);
      }
      mesh.visible = true;
      if (mesh.geometry !== pooled.geometry) mesh.geometry = pooled.geometry;

      // The one basis every placed thing in this project uses: X cross Y is Z,
      // so X is `up x forward` and never `makeBasis(east, up, north)`, whose
      // determinant is -1 and which renders a mesh as a solid ink blob.
      forward.copy(frame.forward).projectOnPlane(frame.dir).normalize();
      right.crossVectors(frame.dir, forward).normalize();
      basis.makeBasis(right, frame.dir, forward);
      mesh.position.copy(mover.at);
      mesh.quaternion.setFromRotationMatrix(basis);
      if (frame.roll !== 0) mesh.rotateZ(frame.roll);

      const away = mover.at.distanceTo(viewer);
      if (mover.family === 'herd' && pooled.animals !== undefined) {
        const near = away < HERD_ANIMATED_REACH;
        if (near && animateHerd(mover, pooled, mesh, realDt)) {
          mesh.visible = false;
          stats.animated += mover.animated!.heads.length;
          stats.nearestMoving = Math.min(stats.nearestMoving, away);
        } else if (mover.animated) {
          releaseHerd(mover);
        }
      } else if (mover.family !== 'herd') {
        stats.nearestMoving = Math.min(stats.nearestMoving, away);
      }

      stats[mover.family]++;
      // What was *built*, not what was asked for: `buildHerd` drops an animal
      // whose own patch is scree, and a count taken from the request would
      // report cattle that are not on the screen.
      if (mover.family === 'herd') stats.animals += pooled.heads ?? mover.heads ?? 0;
      stats.meshes++;
      stats.triangles += pooled.triangles;
    }

    stats.birds = drawBirds(clock);
    stats.meshes += stats.animated;
    if (stats.birds > 0) {
      stats.meshes++;
      stats.triangles += (stats.birds * birdVertices) / 3;
    }
    frameCount++;
    if ((frameCount & 63) === 0) evict();
    stats.pooled = pool.size;
    let bytes = 0;
    for (const entry of pool.values()) bytes += entry.bytes;
    stats.megabytes = Number((bytes / 1048576).toFixed(2));
  }

  function verify(): { bodies: number; phases: number; worstDip: number } {
    let worst = 0;
    let bodies = 0;
    const phases = 64;
    for (const region of ['atlantic-europe', 'east-asia', 'sub-saharan']) {
      for (let body = 0; body < WALK_BODIES; body++) {
        const rng = rngFrom('verify', region, body);
        const person = buildPerson(ctx, lookFor(rng, region, { pose: 'walk' }));
        const rig = rigOf(person);
        for (let phase = 0; phase < phases; phase++) {
          const dip = poseAt(rig, (phase / phases) * TAU, 0);
          if (dip < worst) worst = dip;
        }
        bodies++;
        dispose(person);
      }
    }
    return { bodies, phases, worstDip: worst };
  }

  return {
    group,
    stats,
    herds,
    update,
    verify,
    // The movers, and the birds, whose material has no ink normals.
    proxies: () => [proxyOf(material), proxyOf(flockMesh.material as THREE.Material)],
    collide(point, radius, personRadius, push) {
      let hit = false;
      const reach = radius + personRadius;
      const r = point.length();
      for (const mover of walkersShown) {
        walkerGap.copy(point).sub(mover.at);
        const up = walkerGap.dot(point) / r;
        if (up > AVATAR_HEIGHT || up < -AVATAR_HEIGHT) continue;
        walkerGap.addScaledVector(point, -up / r);
        const d = walkerGap.length();
        if (d >= reach || d < 1e-6) continue;
        push.addScaledVector(walkerGap, (reach - d) / d);
        hit = true;
      }
      return hit;
    },

    eachBoat(visit) {
      for (const mover of movers.values()) {
        if (mover.family === 'water' && mover.mesh !== null && mover.mesh.visible) visit(mover.mesh);
      }
    },
  };
}
