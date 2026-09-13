import * as THREE from 'three';
import { SCENERY_SCALE, STOREY, AVATAR_HEIGHT, createSceneryContext } from '../scenery/contract.ts';
import { measure } from '../monuments/contract.ts';
import type { Measurements } from '../monuments/contract.ts';
import type { RegionStyle, SceneryContext } from '../scenery/contract.ts';
import { rngFrom } from '../scenery/random.ts';
import type { Rng, Weighted } from '../scenery/random.ts';

/**
 * The traffic contract: everything that moves, and everything parked.
 *
 * **Why this is its own directory and not a `kind` in `src/scenery/`.** The
 * scenery kit was the obvious home and it is the wrong one for exactly one
 * reason, and it is a mechanical reason rather than a taste: `ScenicPart`
 * declares a **`footprint`, which is a radius**, and a radius cannot say whether
 * a vehicle fits a lane. A city bus is 15.2 long and 3.2 across; its bounding
 * radius is 7.8. A placer reading that radius would ask for a 15.6-unit
 * carriageway, wider than the 12-unit trunk that is the widest road on the
 * planet, and would refuse to put a bus on any road at all. A vehicle is a long
 * thin thing and the two numbers that decide where it can go are `length` and
 * `width` separately. Every other difference — the budgets, the mounts, the
 * medium — follows from that one and could have been bolted on; this one could
 * not.
 *
 * The second reason is smaller and still real: `src/scenery/contract.ts` is
 * being edited by two other agents. A directory beside it needs no sequencing.
 *
 * What is **not** duplicated, because duplicating it is how a world stops being
 * one world:
 *
 * - the seed mixer (`rngFrom`, from `scenery/random.ts`),
 * - the pen and the ramp and the palette gate (`createSceneryContext`, which
 *   wraps the monument context, so a parked car is inked by the same
 *   `OutlineEffect` as the Eiffel Tower),
 * - the region table (`RegionStyle`, and `regionFor` in `scenery/regions.ts`),
 * - `measure`, from the monument contract, which is the one definition of what
 *   a built group's numbers are.
 *
 * This file adds three things on top: the size rules a vehicle has that a house
 * does not, the primitives a vehicle needs that a house does not (a wheel, a
 * hexahedron with a taper at both ends), and the **mount** — where a person
 * goes, which is the whole reason the kit has to know about the crowd at all.
 */

// ---------------------------------------------------------------------------
// Scale: the decision, and the arithmetic that forces it
// ---------------------------------------------------------------------------

/**
 * **A vehicle is built at `SCENERY_SCALE`, 1.267 units per metre, the same as
 * every house and every road. It is not built against the 6.8-unit person.**
 *
 * This is the one decision in the file and everything else is downstream, so it
 * is written out with the numbers rather than asserted. Three things want to
 * decide how big a car is and they do not agree:
 *
 * ```
 *                                real     avatar scale   scenery scale
 *   a 4.0 m car is                        (3.78 u/m)     (1.267 u/m)
 *     long                       4.00 m      15.1            5.07
 *     wide                       1.75 m       6.62           2.22
 *     tall                       1.55 m       5.86           1.96
 * ```
 *
 * against a world whose numbers are already fixed by other files:
 *
 * ```
 *   ROAD_CLASSES        lane 5.5   road 8.5   trunk 12      (roads.ts, before
 *                                                             the x1.5 below)
 *   GroundStyle.street  4.0 (Maghreb alley) .. 10.0 (US)    (scenery/ground.ts,
 *                                                             likewise)
 *   gabled-house        6.2 .. 7.8 wide, 7.6 tall at 2 storeys
 *   a person            6.80 tall, 5.46 seated, 2.60 across the shoulders
 * ```
 *
 * **At avatar scale a car is wider than a lane.** 6.62 against 5.5: it does not
 * fit on the road it is meant to be driving down, let alone pass another one.
 * It is 15.1 long against a house 7.0 wide — two houses long — and 5.86 tall
 * against a two-storey house's 7.6, so a village would read as a car park with
 * some sheds in it. A bus at that scale is 43 units long against a **median
 * settlement radius of 32**: one bus is longer than the town it is parked in.
 *
 * **At scenery scale every one of those lands.** 2.22 wide is two cars abreast
 * on a 5.5-unit lane with half a unit each side; 5.07 long is 0.72 of a house's
 * width; 1.96 tall is 26% of the house's 7.6, and in life a car is 25% of a
 * six-metre eaves. The whole set is right at once, which is what you would
 * expect, because **the roads and the houses were both authored at this scale
 * and the person is the only thing in the world that was not.**
 *
 * So the cost of the decision is precisely one thing: **a 6.8-unit person is
 * three times too big to stand beside these vehicles**, exactly as he is
 * already three times too big beside the houses. He is not a new error, he is
 * the existing one arriving somewhere it shows more — and it shows more because
 * the error scales with how close the object's size is to a person's. A house
 * is four times a person, so a 3x error still leaves it overhead and it reads as
 * *slightly toy*. A car is one person tall, so the same 3x error puts the roof
 * at his knee and it reads as *broken*.
 *
 * **`RIDER_SCALE` is the answer to that and it is not a fudge**: a rider is the
 * crowd's own figure scaled to this world, and every seat in the kit is
 * validated against the seated pose *after* that scaling, mechanically, in
 * `validateVehicle`. See `SEATED`.
 *
 * Do not author in metres. This constant is here to be quoted in a review, the
 * same way `SCENERY_SCALE` is; parts are authored in world units.
 */
export const TRAFFIC_SCALE = SCENERY_SCALE;

export { SCENERY_SCALE, STOREY, AVATAR_HEIGHT };

// ---------------------------------------------------------------------------
// Placed scale: the same argument, run again with a person in the frame
// ---------------------------------------------------------------------------

/**
 * **The kit is authored at `SCENERY_SCALE` and placed at twice it.**
 *
 * The arithmetic above is right about every relation it measures and it is
 * measuring the wrong pair. It sizes a car against the *road* and against the
 * *house*, both of which are 1.267 units per metre, and gets a car that fits
 * both — and then the thing standing at the kerb is a 6.8-unit person, because
 * `AVATAR_HEIGHT` was decided before any of this and every person on the planet
 * is built from it. A hatchback at 1:1.267 is **1.96 tall against a 6.8 avatar:
 * 29% of him, where life gives 83%.** The roof is at his knee. The file's own
 * conclusion says what that reads as, and it was right: *broken* rather than
 * toy.
 *
 * So the section doubles. What that buys, measured on the built kit:
 *
 * ```
 *                     authored          placed (x2)      against the avatar
 *   hatchback   5.16 x 2.22 x 2.13   10.32 x 4.44 x 4.26   roof at chestY 4.44
 *   boxy-suv    5.70 x 2.44 x 2.78   11.40 x 4.88 x 5.56   roof at chinY 5.10
 *   minibus     6.85 x 2.60 x 3.84   13.70 x 5.20 x 7.68   over his head
 *   bicycle     2.50 x 0.55 x 1.35    5.00 x 1.10 x 2.70   bars at hipY 3.00
 * ```
 *
 * A car roof at the chest is what a car looks like from the pavement, and it is
 * the one relation that could not be got by rescaling anything else: the roads
 * and the houses are already at 1.267 and moving *them* moves the whole world.
 *
 * **What it costs is written down rather than hidden.** A placed car is 10.3
 * long against a 7.0-wide, 7.6-tall house — as long as the house is tall, where
 * life gives 0.36 of it. Every made thing in this world is compressed 3x
 * against a person and the vehicles are now compressed 1.5x, so a vehicle is
 * **twice the size it should be relative to a building** and correct relative
 * to the person who gets out of it. That is the same trade every monument crop
 * in this project makes, and the person is the one to be right about because he
 * is the one you stand next to.
 *
 * The roads were widened by 1.5 to take it — `ROAD_CLASSES` in `roads.ts` and
 * `GroundStyle.street` in `scenery/ground.ts` — which is less than 2 on purpose:
 * two placed hatchbacks are 8.88 across against a 8.25-unit lane, so on a lane
 * they give way to each other and on a `road` (12.75) they pass, which is what
 * those two classes are for.
 */
export const PLACED_SECTION = 2;

/**
 * How long a placed vehicle may come out, before the length stops doubling.
 *
 * **The section is a relation to a person and the length is not.** Doubling a
 * city bus takes it to 29.5 units against a **median settlement radius of 32**
 * — one bus is the town — and past about twenty units a road vehicle also stops
 * fitting the curvature of the road it is on, because `courseOf` bends and a
 * rigid body does not. So the length is capped and the section is not, which
 * crops the longest vehicles rather than shrinking them: exactly what every
 * monument in this project does to a city.
 *
 * **It binds on one vehicle of the eighteen** and that is the measurement worth
 * keeping, because the request that produced it named three. Placed lengths, in
 * order: bicycle 5.0, scooter 5.1, hand-cart 5.5, auto-rickshaw 6.6, tractor
 * 7.7, kei truck 8.6, rowing boat 9.0, sailing dinghy 9.2, hatchback 10.3,
 * SUV 11.4, saloon 11.8, panel van 12.7, pickup 13.6, minibus 13.7, fishing
 * boat 18.2, box truck 19.4, **city bus 20.0 (from 29.5)**. The tractor was
 * expected to need cropping and does not: at 7.7 it is shorter than a
 * hatchback, and cropping it would give a cube with wheels on.
 */
export const PLACED_LENGTH_CAP = 20;

/**
 * The scale a placer applies, as `[x, y, z]` — width, height, **length**.
 *
 * A vehicle is built facing +Z, so the length is the z axis and the crop is a
 * z scale. `air` is exempt: a hot-air balloon is 20.6 across before anything is
 * done to it, and nothing about how big a balloon looks is decided by the
 * person in the basket.
 *
 * Determinant is `PLACED_SECTION^2 * lengthScale`, which is positive for every
 * vehicle in the kit — see the reflected-basis trap in `CLAUDE.md`.
 */
export function placedScale(vehicle: Vehicle): [number, number, number] {
  if (KINDS[vehicle.kind].medium === 'air') return [1, 1, 1];
  const length = Math.min(PLACED_SECTION, PLACED_LENGTH_CAP / vehicle.size[0]);
  return [PLACED_SECTION, PLACED_SECTION, length];
}

/**
 * `Vehicle.size` after `placedScale`, in the same `[length, width, height]`
 * order, which is what a placer has to compare against a carriageway.
 */
export function placedSize(vehicle: Vehicle): [number, number, number] {
  const [x, y, z] = placedScale(vehicle);
  return [vehicle.size[0] * z, vehicle.size[1] * x, vehicle.size[2] * y];
}

/**
 * The crowd's seated figure, hip at the origin.
 *
 * The convention is theirs and it is the useful one: **the origin is the seat
 * surface**, so a saddle at `y = 1.1` places a rider at `y = 1.1` and no vehicle
 * in this kit ever has to own a leg length.
 *
 * **These are measured off the built mesh with a bounding box, not derived from
 * the joint chain**, and two of them moved when they were measured rather than
 * calculated: the crown is 3.84 rather than the 3.80 the chain gives, because
 * the head has a cap on it, and the toe is 1.97 rather than 1.82.
 *
 * The one that matters most is `elbows`. **A seated person is 3.91 wide at the
 * elbows and 2.60 at the shoulders**, and a cab sized off the shoulders puts
 * every occupant's arms through the doors. Sized off the hips (1.96) it is
 * worse. The design number is `beam`, the envelope over 400 seeded bodies
 * across all fourteen regions, which is 4.3.
 *
 * The canonical elbow width was 3.55 while this kit was being built and is
 * 3.91 now, and the reason is worth keeping because it happened twice
 * independently: the crowd's resting arms hung so close in that their inner
 * edge sat *inside* the chest's own silhouette and only appeared when they
 * swung — the same fault the avatar found at `shoulderX` 1.16 and answered
 * with `ARM_SPLAY`, arrived at from the same measurement by someone who had
 * not seen it. Splaying the arms pushed the seated elbows out by 0.36.
 * **Nothing here was wrong, because nothing here was sized off the canonical
 * body**: `beam` reasons from the envelope, and the envelope did not move.
 *
 * Restated rather than imported, deliberately: `src/scenery/people.ts` has been
 * moved on disk twice while this file was being written, and a hard import
 * takes the whole traffic kit down with it every time. The cost of restating is
 * drift, and drift is answered mechanically — `seatedDrift` takes the crowd's
 * own `BODY` and reports any joint that has moved, and the review sheet calls
 * it, so a proportion changing next door is a red banner rather than a rider's
 * shins through a bicycle frame.
 */
export const SEATED = {
  /** Standing, for reference. */
  standing: 6.8,
  /** Crown above the seat surface, bare head. */
  crown: 3.84,
  /**
   * Clear height a seat must have over it. The envelope over 400 bodies, not
   * the canonical one: 3.9 for a bare head, 4.8 to admit a conical hat or a
   * headload. A vehicle picks one and says which.
   */
  headroomBare: 3.9,
  headroomHatted: 4.8,
  /** Sole below the seat. A footwell shallower than this puts the boot through the floor. */
  sole: 1.75,
  /** Knee ahead of it, so the seat pan has to be at least this deep. */
  knee: 1.34,
  /** Toe ahead of it. A pedal or footrest wants to sit between the knee and here. */
  toe: 1.97,
  /** Back of the body behind it. What a seat back has to clear. */
  back: 0.72,
  /** Half-width at the hips. Never the number to size a cab with. */
  hipHalf: 0.98,
  /** Half-width at the shoulders. Also not the number to size a cab with. */
  shoulderHalf: 1.3,
  /**
   * **Clear width a seat must have across it, elbows and all.** The one number
   * that gets a cab wrong, because the two obvious candidates — 1.96 across the
   * hips and 2.60 across the shoulders — are both smaller and both look like
   * the right answer.
   */
  beam: 4.3,
} as const;

/** The shape of the crowd's figure record, as much of it as this kit reads. */
export interface CrowdBody {
  height: number;
  hip: number;
  shin: number;
  ankle: number;
  thigh: number;
  bootDepth: number;
  hipHalf: number;
  shoulderHalf: number;
}

/**
 * Whether `SEATED` still agrees with the crowd's own figure.
 *
 * Hand it `BODY` from `src/scenery/people.ts` and it returns one line per joint
 * that has moved. Only the numbers the chain actually determines are compared —
 * the crown, the toe and the elbow envelope are *measured* off built meshes and
 * there is nothing in `BODY` to check them against, which is itself worth
 * knowing: they cannot drift silently, they can only drift unnoticed.
 */
export function seatedDrift(body: CrowdBody): string[] {
  const owed: [string, number, number][] = [
    ['standing', SEATED.standing, body.height],
    ['crown (before the head cap)', SEATED.crown - 0.04, body.height - body.hip],
    ['sole (canonical, before the envelope)', 1.66, body.shin + body.ankle],
    ['knee', SEATED.knee, body.thigh],
    ['hipHalf', SEATED.hipHalf, body.hipHalf],
    ['shoulderHalf', SEATED.shoulderHalf, body.shoulderHalf],
  ];
  return owed
    .filter(([, ours, theirs]) => Math.abs(ours - theirs) > 1e-6)
    .map(([name, ours, theirs]) => `SEATED ${name} is ${ours} and people.ts now says ${theirs.toFixed(3)}`);
}

/**
 * How tall a person riding something in this kit is built.
 *
 * `buildPerson` takes `look.height` and scales its whole chain off it, so a
 * rider is **built small rather than scaled small** — one call, no transform,
 * and the flat facets keep their proportions. A person of 1.82 m at
 * `SCENERY_SCALE` is this.
 *
 * **It is a third of the crowd's own height, and that is the whole cost of the scale
 * decision above.** A rider on a bicycle in a street is a third the size of the
 * pedestrian on the pavement beside him. There is no arrangement of these
 * numbers that avoids it: the vehicle fits the road or it fits the person.
 */
export const RIDER_HEIGHT = 1.82 * SCENERY_SCALE;

/** The same fact as a ratio, for anything that would rather scale than rebuild. */
export const RIDER_SCALE = RIDER_HEIGHT / SEATED.standing;

/** `SEATED`, in this kit's units. What a seat actually has to clear. */
export const RIDER = {
  crown: SEATED.crown * RIDER_SCALE,
  headroomBare: SEATED.headroomBare * RIDER_SCALE,
  headroomHatted: SEATED.headroomHatted * RIDER_SCALE,
  sole: SEATED.sole * RIDER_SCALE,
  knee: SEATED.knee * RIDER_SCALE,
  toe: SEATED.toe * RIDER_SCALE,
  back: SEATED.back * RIDER_SCALE,
  hipHalf: SEATED.hipHalf * RIDER_SCALE,
  shoulderHalf: SEATED.shoulderHalf * RIDER_SCALE,
  beam: SEATED.beam * RIDER_SCALE,
  standing: SEATED.standing * RIDER_SCALE,
} as const;

/**
 * How small a feature may be and still be seen, at a given distance.
 *
 * The same arithmetic as the scenery kit's `LEGIBLE_AT` and repeated here
 * because a vehicle is read at a different set of distances than a house is.
 * A vehicle is seen from a road you are on or from the air:
 *
 * ```
 *  distance   a 5.1-unit car is   smallest feature that reads
 *    40 u        119 px             0.17 u   a door line, a wheel spoke
 *   120 u         40 px             0.51 u   the greenhouse, a wheel
 *   360 u         13 px             1.54 u   the mass, and nothing else
 * ```
 *
 * **A car is a 40-pixel lozenge at 120 units and it carries a 2-3 pixel pen
 * around it.** That is the single most useful number in this file. It means the
 * silhouette is nearly all of what a vehicle is: the proportion of the
 * greenhouse to the body, the gap of daylight under the sill, the step of a
 * pickup's bed. It also means **windows must not be modelled as panes** — see
 * the note on the greenhouse in `solid`.
 */
export const LEGIBLE_AT = (distance: number): number => distance / 234;

// ---------------------------------------------------------------------------
// Kinds and budgets
// ---------------------------------------------------------------------------

/**
 * What a vehicle is, which is also what it costs and where it may go.
 *
 * - `cycle` — two wheels and a rider: bicycles, scooters, motorbikes.
 * - `car` — a private car. The class there will be most of.
 * - `utility` — a working road vehicle under about eight units: pickups, vans,
 *   minibuses, tractors, rickshaws, carts.
 * - `heavy` — buses and trucks. Long enough that a placer has to think about
 *   the road's curvature before it puts one down.
 * - `craft` — anything on water.
 * - `air` — anything in it.
 */
export type VehicleKind = 'cycle' | 'car' | 'utility' | 'heavy' | 'craft' | 'air';

/** Where a vehicle can be placed at all. A placer keys off this and nothing else. */
export type Medium = 'road' | 'water' | 'air';

export interface KindSpec {
  medium: Medium;
  /** Longest a built variant may come out, along Z. */
  length: number;
  /** And shortest, so a `car` cannot quietly be a scooter. */
  minLength: number;
  /** Widest, across X. **The number that decides whether it fits a lane.** */
  width: number;
  /** Tallest. */
  height: number;
  /** Triangle cap per variant. A crowd person is ~170; that is the yardstick. */
  triangles: number;
  /** Mesh cap. Mostly a cap on build time; `colors` is the real one. */
  meshes: number;
  /**
   * Cap on distinct palette colours, and the tightest number in the table for
   * the same reason it is in the scenery kit: however a town is drawn — merged
   * by material or instanced per variant — the colour count multiplies the draw
   * calls, and no triangle budget changes that.
   *
   * A car is four: paint, glass, tyre, and one trim. A fifth is a decision, not
   * a detail.
   */
  colors: number;
  /**
   * How far below y = 0 the model may reach.
   *
   * Zero everywhere except on the water, where **y = 0 is the waterline and not
   * the keel** — a placer drops a boat on the sea surface and the draft is what
   * is under it. Making the keel y = 0 instead would put every hull sitting on
   * top of the water like a bath toy, and would leave the placer computing a
   * sink depth it has no way to know.
   */
  draft: number;
}

export const KINDS: Record<VehicleKind, KindSpec> = {
  cycle: { medium: 'road', length: 3.4, minLength: 1.6, width: 1.4, height: 2.4, triangles: 190, meshes: 20, colors: 4, draft: 0 },
  car: { medium: 'road', length: 6.6, minLength: 4.2, width: 2.7, height: 2.8, triangles: 220, meshes: 22, colors: 4, draft: 0 },
  utility: { medium: 'road', length: 8.0, minLength: 2.6, width: 2.9, height: 3.9, triangles: 260, meshes: 26, colors: 5, draft: 0 },
  heavy: { medium: 'road', length: 16.0, minLength: 8.0, width: 3.4, height: 4.6, triangles: 330, meshes: 28, colors: 5, draft: 0 },
  craft: { medium: 'water', length: 11.0, minLength: 2.6, width: 3.6, height: 8.0, triangles: 200, meshes: 24, colors: 5, draft: 1.2 },
  air: { medium: 'air', length: 22.0, minLength: 6.0, width: 22.0, height: 28.0, triangles: 340, meshes: 24, colors: 6, draft: 0 },
};

/**
 * How many variants of one vehicle a region builds.
 *
 * Four rather than the scenery kit's six, and the reason is that **a vehicle's
 * variation is nearly all colour and a colour is not a variant.** A house varies
 * in storeys, plan, ridge direction and roof — structural things that have to be
 * decided at build time because per-instance geometry cannot be drawn
 * efficiently. A car varies in paint, and paint is the one thing that *is* a
 * separate variant here (a material is a draw call), so four variants of a
 * hatchback are mostly four colourways with a small shape drift on top.
 *
 * Six parts times four variants times four colours is 96 meshes for a whole
 * region's traffic, doubled by `OutlineEffect`. That is the budget this number
 * is set by.
 */
export const VARIANTS = 4;

// ---------------------------------------------------------------------------
// The mount
// ---------------------------------------------------------------------------

/** How a rider sits on this. The crowd's `look.pose`, spelled the same way. */
export type RiderPose = 'sit' | 'astride' | 'stand';

/**
 * Where a person goes, in the vehicle's own frame.
 *
 * The origin is **the seat surface**, which is the crowd's convention: hip at
 * the origin, +Z the way the rider faces, +Y up. A placer puts a person there,
 * scales them by `RIDER_SCALE`, and yaws them by `yaw`. It does not need a leg
 * length and neither does this file.
 *
 * `headroom` and `legroom` are what the *vehicle* promises, and
 * `validateVehicle` checks both against `RIDER` — so when the crowd publishes a
 * different chain, the seats that stop fitting say so instead of being found in
 * a screenshot.
 */
export interface Mount {
  x: number;
  y: number;
  z: number;
  /** Facing, relative to the vehicle's +Z. 0 is forward, Math.PI is aft. */
  yaw: number;
  pose: RiderPose;
  /** Whether this is the one that makes the vehicle look driven. */
  driver?: boolean;
  /**
   * Clear height above the seat before the rider fouls something.
   * `Infinity` for an open seat, which is most of them.
   */
  headroom: number;
  /** Clear depth below it before the shins foul the frame or the floor. */
  legroom: number;
  /**
   * Clear width across the seat, elbows and all. `Infinity` for an open-sided
   * vehicle, where the arms are above whatever the sides are.
   *
   * **This is the number that decides how many people a cab holds, and the
   * answer in this kit is always one.** A rider's elbows span 1.46 at
   * `RIDER_SCALE` and a 2.22-wide hatchback has about 1.9 of interior, so a
   * second seat beside the first would need 2.9. Every enclosed driver in the
   * kit therefore sits on the centreline, and that is arithmetic rather than a
   * modelling shortcut.
   */
  beam: number;
  /**
   * Whether this seat admits a hat or a headload — 4.8 of clearance rather than
   * 3.9. Only an open seat can afford it here, so it is off by default and the
   * cabs say nothing.
   */
  hats?: boolean;
  /**
   * Where the feet actually go: a crank, a stirrup, a footrest, a pedal box.
   * In the vehicle's frame, not the seat's.
   *
   * Published because the crowd agent asked for it and it is the only thing
   * that decides the two joint angles of an `astride` pose. Absent means the
   * feet hang or rest on the floor of a footwell.
   */
  footrest?: readonly [number, number, number];
  /**
   * Where the hands go: bars, a wheel, an oar. Same frame.
   *
   * The lean of a cyclist is entirely this point, so a bicycle that publishes a
   * saddle and no bars gets a rider sitting bolt upright on it.
   */
  grip?: readonly [number, number, number];
}

// ---------------------------------------------------------------------------
// The context
// ---------------------------------------------------------------------------

export interface TrafficContext extends SceneryContext {
  /**
   * A road wheel: axle along X, centred on the origin, **bottom at
   * `y = -radius`** so `mesh.position.y = radius` seats it on the ground.
   *
   * `sides` is an ink decision before it is a geometry one, and for a wheel it
   * is the *only* interesting one in the kit — see the note on `WHEEL_SIDES`.
   * The polygon is normalised to an exactly square bounding box of `2 * radius`,
   * the way `blob` is, so a wheel is as tall as it is long whatever `sides`
   * does; an octagon is 8% wider than tall left to itself and every "why does it
   * sink into the road" starts there.
   */
  wheel(radius: number, width: number, color: number, sides?: number): THREE.Mesh;

  /**
   * A closed lathe over an explicit profile, given as `[radius, y]` pairs from
   * the bottom up.
   *
   * The scenery kit's `dome` is a quarter-ellipse and is therefore **widest at
   * its base**, which is a dome and is not a balloon: built with it, a
   * hot-air-balloon envelope rendered as a mushroom cap with its widest point on
   * the ground. Anything whose waist is above its foot needs its own profile,
   * and that is the whole reason this exists.
   *
   * Give the profile a `[0, y]` at each end to cap it. An open lathe is
   * single-sided and you see straight through it into the far wall.
   */
  lathe(profile: readonly (readonly [number, number])[], color: number, sides?: number): THREE.Mesh;

  /**
   * A hexahedron: a box whose top face may be a different rectangle from its
   * bottom one, and whose two ends may each be narrowed and lifted.
   *
   * **This is the primitive nearly every vehicle in the kit is made of**, and it
   * exists because the three shapes a vehicle needs are all one shape with
   * different numbers:
   *
   * - a **body** with tumblehome: `topWidth` under `width`;
   * - a **greenhouse**: `topWidth` under `width` *and* `topAft`/`topFore` pulled
   *   in, which is what makes a windscreen and a backlight rake;
   * - a **hull**: `width` small (the keel), `topWidth` large (the beam),
   *   `foreWidth` at zero (a stem), `foreRise` positive (sheer at the bow).
   *
   * Twelve triangles, one mesh, and zero-area faces are dropped — a pointed bow
   * is two degenerate triangles and `computeVertexNormals` turns those into NaN
   * normals, which black-holes the whole mesh.
   *
   * **The windows are why this shape rather than four boxes.** A car's glass
   * against its body is the coplanar case from `CLAUDE.md` word for word: hull
   * the two meshes separately, the flush faces lose the depth test, and the
   * window renders as a colour patch with no line round it. Making the
   * greenhouse its own *narrower, inset* mass is not a workaround for that, it
   * is what a car actually is — and it buys the window band an ink line the
   * whole way round for no extra mesh at all.
   */
  solid(spec: SolidSpec): THREE.Mesh;
}

export interface SolidSpec {
  color: number;
  /** Full width at the -Z (aft) end of the bottom face. */
  width: number;
  /** Full width at the +Z (fore) end. Defaults to `width`. 0 is a stem. */
  foreWidth?: number;
  /** Length along Z, centred on the origin. */
  depth: number;
  height: number;
  /** Full width of the top face, aft and fore. Both default to their bottoms. */
  topWidth?: number;
  topForeWidth?: number;
  /** Z of the top face's aft and fore edges. Default -depth/2 and +depth/2. */
  topAft?: number;
  topFore?: number;
  /** Lift of the bottom edge at each end: ground clearance, rocker, a raised bow. */
  aftRise?: number;
  foreRise?: number;
}

/**
 * How many sides a road wheel gets, and it is the one number in this file that
 * was chosen by measuring rather than by taste. See `CLAUDE.md`.
 */
export const WHEEL_SIDES = 8;

const TAU = Math.PI * 2;

/**
 * One context for the whole kit.
 *
 * Wraps a `SceneryContext`, which wraps a `MonumentContext`. Pass the one the
 * world already built and a parked car shares a material cache and a ramp with
 * the house behind it and the cathedral behind that.
 */
export function createTrafficContext(base: SceneryContext = createSceneryContext()): TrafficContext {
  const meshOf = (geometry: THREE.BufferGeometry, color: number): THREE.Mesh => {
    const faceted = geometry.index ? geometry.toNonIndexed() : geometry;
    if (faceted !== geometry) geometry.dispose();
    faceted.computeVertexNormals();
    return new THREE.Mesh(faceted, base.toon(color));
  };

  return {
    ...base,

    wheel(radius, width, color, sides = WHEEL_SIDES) {
      const n = Math.max(3, Math.round(sides));
      // Build about Y, then lay the axle along X. Radius 1 and normalised
      // afterwards, so the caller's `radius` is the half-height of the finished
      // wheel whatever the polygon does to the bounding box.
      const geometry = new THREE.CylinderGeometry(1, 1, width, n, 1, false, Math.PI / n);
      geometry.rotateZ(Math.PI / 2);
      geometry.computeBoundingBox();
      const { min, max } = geometry.boundingBox!;
      // Read the numbers out before scaling: `BufferGeometry.scale` recomputes
      // the box in place, so holding the reference applies the scale twice.
      const sy = (radius * 2) / (max.y - min.y);
      const sz = (radius * 2) / (max.z - min.z);
      const cy = (min.y + max.y) * 0.5;
      const cz = (min.z + max.z) * 0.5;
      geometry.scale(1, sy, sz);
      geometry.translate(0, -cy * sy, -cz * sz);
      return meshOf(geometry, color);
    },

    lathe(profile, color, sides = 12) {
      const points = profile.map(([radius, y]) => new THREE.Vector2(radius, y));
      return meshOf(new THREE.LatheGeometry(points, Math.max(3, Math.round(sides))), color);
    },

    solid(spec) {
      const {
        color,
        width,
        depth,
        height,
        foreWidth = width,
        topWidth = width,
        topForeWidth = foreWidth,
        aftRise = 0,
        foreRise = 0,
      } = spec;
      const hd = depth / 2;
      const topAft = spec.topAft ?? -hd;
      const topFore = spec.topFore ?? hd;

      // The eight corners. Naming: b/t bottom or top, a/f aft or fore, l/r left
      // (-X) or right (+X). Winding below is checked face by face against the
      // outward normal; a reversed triangle is invisible from outside and its
      // inverted hull swallows the mesh, which reads as a bug in the outline.
      const bal: V = [-width / 2, aftRise, -hd];
      const bar: V = [width / 2, aftRise, -hd];
      const bfr: V = [foreWidth / 2, foreRise, hd];
      const bfl: V = [-foreWidth / 2, foreRise, hd];
      const tal: V = [-topWidth / 2, height, topAft];
      const tar: V = [topWidth / 2, height, topAft];
      const tfr: V = [topForeWidth / 2, height, topFore];
      const tfl: V = [-topForeWidth / 2, height, topFore];

      const points: V[] = [];
      const quad = (a: V, b: V, c: V, d: V) => points.push(a, b, c, a, c, d);
      quad(bfl, bfr, tfr, tfl); // +Z, the fore face
      quad(bar, bal, tal, tar); // -Z, the aft face
      quad(bfr, bar, tar, tfr); // +X
      quad(bal, bfl, tfl, tal); // -X
      quad(tal, tfl, tfr, tar); // +Y
      quad(bal, bar, bfr, bfl); // -Y

      const kept: number[] = [];
      for (let i = 0; i < points.length; i += 3) {
        // Drop the degenerate halves of a face that has collapsed to an edge —
        // a stem, a knife bow, a pyramid cab. NaN normals otherwise.
        if (area(points[i]!, points[i + 1]!, points[i + 2]!) > 1e-7) {
          kept.push(...points[i]!, ...points[i + 1]!, ...points[i + 2]!);
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(kept, 3));
      return meshOf(geometry, color);
    },
  };
}

type V = [number, number, number];

function area(a: V, b: V, c: V): number {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  const cx = uy * vz - uz * vy;
  const cy = uz * vx - ux * vz;
  const cz = ux * vy - uy * vx;
  return Math.hypot(cx, cy, cz) * 0.5;
}

// ---------------------------------------------------------------------------
// The part
// ---------------------------------------------------------------------------

export interface Vehicle {
  /** Kebab-case, unique, and the file is named after it: `city-bus.ts`. */
  id: string;
  name: string;
  kind: VehicleKind;
  /**
   * The box every variant must stay inside: `[length, width, height]`.
   *
   * **Three numbers rather than a radius, and that is why this kit exists.** A
   * placer asks two questions — does it fit the carriageway (`width`), and can
   * the road hold it straight for this long (`length`) — and a bounding radius
   * answers neither. `validateVehicle` holds every variant to all three and to
   * a floor as well, so a declaration that is comfortably too big is caught the
   * same way one that is too small is.
   */
  size: readonly [number, number, number];
  /** Where riders go. Empty is legal: nobody rides in a parked lorry. */
  mounts: readonly Mount[];
  /** One line on the sheet: what this is and what it is for. */
  note?: string;
  /**
   * Builds **one variant**. Deterministic in `rng` and `style` and nothing else.
   *
   * The `Group` follows the kit conventions: **faces +Z**, base at y = 0 (or at
   * `-draft` for a craft, where y = 0 is the waterline), centred in X and Z,
   * identity transform, materials only from `ctx.toon`.
   */
  build(ctx: TrafficContext, rng: Rng, style: TrafficStyle): THREE.Group;
}

/** The seed for one variant. Identity, not order: see `scenery/random.ts`. */
export function variantRng(vehicle: Vehicle, style: TrafficStyle, variant: number): Rng {
  return rngFrom(vehicle.id, style.id, variant);
}

// ---------------------------------------------------------------------------
// Region style
// ---------------------------------------------------------------------------

/**
 * What is on the road here, and what colour it is.
 *
 * Keyed on the same `RegionId` the scenery kit uses and resolved through the
 * same `regionFor(iso, continent, lat)`, so there is exactly one answer to
 * "whose ground is this" in the whole project. It is a *separate table* from
 * `RegionStyle` for the same reason `ground.ts` is: a car's paint is not a
 * wall colour, and folding one list into the other would have the region table
 * deciding both with one number.
 *
 * **The traffic mix is the strongest regional signal the kit has, and it is
 * nearly free.** A Sahelian road carries a pickup, a minibus and a donkey cart;
 * a Norwegian one carries an estate car and a bus. Same geometry, same palette,
 * two different places — and unlike the buildings it needs no new parts to say
 * so, only weights.
 */
export interface TrafficStyle {
  id: string;
  name: string;
  /** One line for the review sheet. What you would notice on the road there. */
  note: string;

  /**
   * Body paint.
   *
   * **Warm entries, for the reason the scenery contract measures**: a neutral
   * turned away from this scene's blue hemisphere light goes hueless, and a
   * vehicle is nothing but small turned-away surfaces. `bone` and `steel` are
   * here where a fleet really is grey, and never as the only entry in a list.
   *
   * The regional signal in this column is *saturation*, not hue: a European
   * street is silver, white and dark red; a West African one is white,
   * white and white, because a used Hilux is white everywhere on Earth.
   */
  paint: readonly number[];
  /** Bumpers, sills, tyres, tarpaulins. The dark that is not the paint. */
  trim: readonly number[];
  /** Glass. Warm darks. */
  glass: readonly number[];
  /** Chrome, bare metal, galvanised sheet. */
  metal: readonly number[];
  /** Load: crates, sacks, hay, nets. What a working vehicle is carrying. */
  cargo: readonly number[];

  /** What is parked or moving on a street here. Unknown ids are reported by the sheet. */
  road: readonly Weighted<string>[];
  /** What is moored at a coastal settlement. */
  water: readonly Weighted<string>[];
  /** What is in the air. Usually nothing, and that is a weight of zero, not an absence. */
  air: readonly Weighted<string>[];

  /**
   * Vehicles per built plot, roughly: how busy a street of this region is.
   *
   * Not used by anything in this directory — it is for whoever places them, and
   * it lives here because it is the same kind of fact as the mix and would
   * otherwise become a second region table somewhere else.
   */
  density: number;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type { Measurements } from '../monuments/contract.ts';
export { measure, paletteName } from '../monuments/contract.ts';
export type { Group, Mesh, Object3D, Vector3 } from '../monuments/contract.ts';
export type { Rng, Weighted } from '../scenery/random.ts';
export { rngFrom, seedOf } from '../scenery/random.ts';
export type { RegionStyle, SceneryContext };

const round = (value: number): string => value.toFixed(2);

/** The measured extent of a built vehicle, which `measure` does not give in this shape. */
export interface Extent {
  length: number;
  width: number;
  height: number;
  base: number;
  /** Horizontal offset of the box centre from the origin. */
  offset: number;
}

export function extentOf(group: THREE.Group): Extent {
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  if (box.isEmpty()) return { length: 0, width: 0, height: 0, base: 0, offset: 0 };
  return {
    length: box.max.z - box.min.z,
    width: box.max.x - box.min.x,
    height: box.max.y,
    base: box.min.y,
    offset: Math.hypot((box.min.x + box.max.x) / 2, (box.min.z + box.max.z) / 2),
  };
}

/** Everything wrong with one built variant, in plain English. Empty means it is fine. */
export function validateVehicle(vehicle: Vehicle, group: THREE.Group): string[] {
  const problems: string[] = [];
  const kind = KINDS[vehicle.kind];
  if (!kind) return [`kind '${vehicle.kind}' is not one of ${Object.keys(KINDS).join(', ')}`];

  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(vehicle.id)) problems.push(`id '${vehicle.id}' is not kebab-case`);

  if (group.position.lengthSq() > 1e-6) problems.push('group.position must be the origin');
  if (group.rotation.x !== 0 || group.rotation.y !== 0 || group.rotation.z !== 0) {
    problems.push('group.rotation must be identity — bake the rotation into the children');
  }
  if (Math.abs(group.scale.x - 1) > 1e-6 || Math.abs(group.scale.y - 1) > 1e-6) {
    problems.push('group.scale must be 1 — the instance carries the scale, not the variant');
  }

  group.traverse((object) => {
    if (object === group) return;
    const kinds = object as unknown as Record<string, boolean>;
    if (kinds.isPoints || kinds.isLine || kinds.isSprite) {
      problems.push(`${object.type} is not allowed: OutlineEffect only inks meshes`);
      return;
    }
    if (kinds.isLight || kinds.isCamera) {
      problems.push(`${object.type} is not allowed: the scene owns the lights and the camera`);
      return;
    }
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (material.userData.atlasToon === undefined) {
        problems.push(`a ${material.type} escaped ctx.toon — every material must come from it`);
      }
      if (material.side !== THREE.FrontSide) {
        problems.push('materials must stay FrontSide — the outline is an inverted back-face hull');
      }
    }
  });

  const { triangles, meshes, colors } = measure(group);
  if (meshes === 0) {
    problems.push('the variant is empty');
    return problems;
  }

  const [declaredLength, declaredWidth, declaredHeight] = vehicle.size;
  const built = extentOf(group);

  // --- pose ---
  if (built.base < -kind.draft - 0.06) {
    problems.push(
      kind.draft > 0
        ? `draws ${round(-built.base)} below the waterline, past the '${vehicle.kind}' draft of ${kind.draft}`
        : `sinks ${round(-built.base)} below y = 0`,
    );
  }
  if (built.base > 0.06) problems.push(`floats ${round(built.base)} above y = 0`);
  if (built.offset > Math.max(0.25, declaredLength * 0.08)) {
    problems.push(`is ${round(built.offset)} off-centre — a vehicle must straddle its own origin`);
  }

  // --- the declaration, which is the contract with the placer ---
  const owed: [string, number, number, number][] = [
    ['length', built.length, declaredLength, kind.length],
    ['width', built.width, declaredWidth, kind.width],
    ['height', built.height, declaredHeight, kind.height],
  ];
  for (const [name, actual, declared, cap] of owed) {
    if (declared > cap + 1e-6) {
      problems.push(`declared ${name} ${declared} is over the '${vehicle.kind}' cap of ${cap}`);
    }
    if (actual > declared + 0.06) {
      problems.push(`is ${round(actual)} ${name}, past its declared ${declared}`);
    }
    // A declaration comfortably larger than the model is the same failure as one
    // that is too small: the placer reserves road it does not need and refuses
    // lanes the vehicle fits. 12% is the drift a family of variants may have.
    if (actual < declared * 0.88) {
      problems.push(`only ${round(actual)} ${name} against a declared ${declared} — declare a tighter box`);
    }
  }
  if (declaredLength < kind.minLength) {
    problems.push(`declared length ${declaredLength} is under the '${vehicle.kind}' floor of ${kind.minLength}`);
  }

  // --- budget ---
  if (triangles > kind.triangles) {
    problems.push(`${triangles} triangles, over the '${vehicle.kind}' budget of ${kind.triangles}`);
  }
  if (meshes > kind.meshes) {
    problems.push(`${meshes} meshes, over the '${vehicle.kind}' budget of ${kind.meshes}`);
  }
  if (colors.length > kind.colors) {
    problems.push(
      `${colors.length} palette colours, over the '${vehicle.kind}' budget of ${kind.colors} — ` +
        `colours are draw calls here, see KindSpec.colors`,
    );
  }

  problems.push(...mountProblems(vehicle, built));
  return problems;
}

/**
 * Whether a rider actually fits the seats this vehicle declares.
 *
 * Split out and exported because it is the half of the contract that depends on
 * a number owned by another agent, and because it is the half worth re-running
 * on its own the day that number moves.
 */
export function mountProblems(vehicle: Vehicle, built: Extent): string[] {
  const problems: string[] = [];
  const kind = KINDS[vehicle.kind];
  for (const [index, mount] of vehicle.mounts.entries()) {
    const where = vehicle.mounts.length > 1 ? `mount ${index}` : 'the mount';
    if (mount.y < 0) problems.push(`${where} is below the ground`);
    if (Math.abs(mount.x) > built.width / 2 + 0.05 || Math.abs(mount.z) > built.length / 2 + 0.05) {
      problems.push(`${where} is outside the vehicle`);
    }
    const needsHead =
      mount.pose === 'stand'
        ? RIDER.standing
        : mount.hats
          ? RIDER.headroomHatted
          : RIDER.headroomBare;
    if (mount.headroom < needsHead - 1e-6) {
      problems.push(
        `${where} has ${round(mount.headroom)} of headroom and a ${mount.pose === 'stand' ? 'standing' : 'seated'} ` +
          `rider needs ${round(needsHead)} — the head goes through the roof`,
      );
    }
    if (mount.beam < RIDER.beam - 1e-6) {
      problems.push(
        `${where} is ${round(mount.beam)} across and a rider's elbows span ${round(RIDER.beam)} — ` +
          'sized off the shoulders rather than the elbows?',
      );
    }
    if (mount.beam !== Infinity && Math.abs(mount.x) + RIDER.beam / 2 > mount.beam / 2 + 1e-6) {
      problems.push(`${where} sits ${round(Math.abs(mount.x))} off the centreline and its elbows leave the ${round(mount.beam)} it has`);
    }
    if (mount.pose !== 'stand' && mount.legroom < RIDER.sole - 1e-6) {
      problems.push(
        `${where} has ${round(mount.legroom)} of legroom and a rider needs ${round(RIDER.sole)} — ` +
          'the boot goes through the floor',
      );
    }
    // A seat with the roof over it also has to clear the sky above the vehicle.
    if (mount.headroom !== Infinity && mount.y + mount.headroom > built.height + 0.06) {
      problems.push(`${where} claims ${round(mount.headroom)} of headroom the vehicle does not have`);
    }
    if (mount.pose !== 'stand' && mount.y - mount.legroom < -kind.draft - 0.06) {
      problems.push(`${where} claims ${round(mount.legroom)} of legroom that reaches below the vehicle`);
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Variety — the measurement, not the impression
// ---------------------------------------------------------------------------

/**
 * The silhouette grid: **world units, not normalised**, 0.2 to a cell.
 *
 * Spanning z in [-12, 12] and y in [-2, 28], which holds every kind in the
 * table from a rowing boat's draft to a balloon's crown. 120 x 150 cells, 18 kB
 * a vehicle, and the whole kit's table is built in about a millisecond.
 *
 * **Normalising by the bounding box was tried first and it is wrong, measured.**
 * Scaled into its own box, a bicycle and a four-wheel-drive both become "a
 * shape that roughly fills a rectangle" and came out at **0.889 overlap** — two
 * vehicles that share nothing at all, called near-identical, while a hatchback
 * and a saloon (genuinely close) sat at 0.881 underneath them. Normalisation
 * deletes the aspect ratio, and the aspect ratio is most of what tells a kit of
 * vehicles apart. In world units the same pair falls to 0.06.
 */
const CELL = 0.2;
const SIL_Z0 = -12;
const SIL_Y0 = -2;
const SIL_Z = 120;
const SIL_Y = 150;

/**
 * The **side elevation**, as a bitmap: the shadow the model casts along its own
 * X axis, in the vehicle's own frame with the ground at y = 0.
 *
 * Why a profile and not the bounding box the scenery kit compares. `varietyOf`
 * there asks whether two builds differ in `height x radius`, which is the right
 * question for a house — a house that is 3 storeys instead of 2 *is* a different
 * house. It is the wrong question here, because the brief a vehicle kit is
 * answering is "several distinct car models rather than one car recoloured", and
 * a saloon, a hatchback and an estate are **the same box to within a tenth of a
 * unit** and are three obviously different cars. What tells them apart is where
 * the mass is along the length: a boot step behind the cabin, a tailgate that
 * runs to the ground, a roof carried to the tail.
 *
 * Rasterising rather than sampling a few heights, because a pickup's bed is a
 * hole in the middle of the profile and a height field cannot see a hole.
 */
export function silhouetteOf(group: THREE.Group): Uint8Array {
  group.updateMatrixWorld(true);
  const bits = new Uint8Array(SIL_Z * SIL_Y);

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const position = mesh.geometry.getAttribute('position');
    const index = mesh.geometry.index;
    const count = index ? index.count : position.count;
    for (let i = 0; i < count; i += 3) {
      const ia = index ? index.getX(i) : i;
      const ib = index ? index.getX(i + 1) : i + 1;
      const ic = index ? index.getX(i + 2) : i + 2;
      a.fromBufferAttribute(position, ia).applyMatrix4(mesh.matrixWorld);
      b.fromBufferAttribute(position, ib).applyMatrix4(mesh.matrixWorld);
      c.fromBufferAttribute(position, ic).applyMatrix4(mesh.matrixWorld);
      // The triangle's own box in cell space, filled. Coarse — a long thin
      // diagonal fills its box — and that is the right error for a signature
      // whose job is to tell a pickup from a van, not to render.
      const zi0 = Math.floor((Math.min(a.z, b.z, c.z) - SIL_Z0) / CELL);
      const zi1 = Math.floor((Math.max(a.z, b.z, c.z) - SIL_Z0) / CELL);
      const yi0 = Math.floor((Math.min(a.y, b.y, c.y) - SIL_Y0) / CELL);
      const yi1 = Math.floor((Math.max(a.y, b.y, c.y) - SIL_Y0) / CELL);
      for (let zi = Math.max(0, zi0); zi <= Math.min(SIL_Z - 1, zi1); zi++) {
        for (let yi = Math.max(0, yi0); yi <= Math.min(SIL_Y - 1, yi1); yi++) {
          bits[yi * SIL_Z + zi] = 1;
        }
      }
    }
  });
  return bits;
}

/** Intersection over union of two silhouettes. 1 is the same shape, 0 shares nothing. */
export function silhouetteOverlap(a: Uint8Array, b: Uint8Array): number {
  let both = 0;
  let either = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] || b[i]) either++;
    if (a[i] && b[i]) both++;
  }
  return either === 0 ? 1 : both / either;
}

/**
 * Two vehicles read as the same thing above this.
 *
 * Measured over the built kit rather than picked. In world units the 18 vehicles
 * give 153 pairs with a **median overlap of 0.27**; the closest pair is the
 * minibus against the panel van at **0.81**, which is right — they are the same
 * box and what separates them is where the glass is, which a silhouette cannot
 * see. Next is the hatchback against the saloon at 0.79. So 0.9 is above
 * everything the kit actually contains and below anything that would be two
 * names for one shape, and `pnpm traffic` fails on a pair that crosses it.
 */
export const SAME_SHAPE = 0.9;

export interface Variety {
  /** Distinct silhouettes across the sample, clustered at `SAME_SHAPE`. */
  shapes: number;
  /** Distinct colour sets. */
  palettes: number;
  samples: number;
}

export function varietyOf(groups: readonly THREE.Group[], measurements: readonly Measurements[]): Variety {
  const signatures = groups.map(silhouetteOf);
  const kept: Uint8Array[] = [];
  for (const signature of signatures) {
    if (!kept.some((other) => silhouetteOverlap(signature, other) > SAME_SHAPE)) kept.push(signature);
  }
  const palettes = new Set<string>();
  for (const m of measurements) palettes.add([...m.colors].sort((x, y) => x - y).join(','));
  return { shapes: kept.length, palettes: palettes.size, samples: groups.length };
}

/** Whether a vehicle can pass another of itself on a carriageway this wide. */
export function passesOn(vehicle: Vehicle, carriageway: number): boolean {
  return vehicle.size[1] * 2 + 0.6 <= carriageway;
}

/** Whether one of it fits at all. */
export function fitsOn(vehicle: Vehicle, carriageway: number): boolean {
  return vehicle.size[1] + 0.4 <= carriageway;
}

export { TAU };
