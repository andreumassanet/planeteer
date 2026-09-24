import { FIGURE } from '../avatar.ts';
import { BODY_SCALE } from '../stature.ts';
import { createSoftKit } from '../soft.ts';
import type { Ring, SoftKit } from '../soft.ts';
import type { Group, Mesh, SceneryContext } from './contract.ts';
import type { Rng } from './random.ts';
import { rngFrom } from './random.ts';

/**
 * The people. One parametric body, and everything that makes two of them
 * different.
 *
 * This is a new **kind** inside the scenery kit rather than a directory beside
 * it, and the choice is worth the paragraph because three of the kit's central
 * assumptions do not survive contact with a crowd:
 *
 * 1. **A person is built against `AVATAR_HEIGHT`, not in `STOREY`s.** A person
 *    is the one object in this world whose size is decided by something else,
 *    and the consequence runs both ways: **change `AVATAR_HEIGHT` and every
 *    person on the planet moves.** Until 2026-09-24 that height was 6.8 units,
 *    *avatar* scale, 3.78 u/m, three times the rest of the kit, and a person's
 *    head reached the eaves of a two-storey house, 6.8 against 7.6. Since then
 *    it is 1.75 m at `SCENERY_SCALE` times `STATURE` (1.7), 3.77 units
 *    (`stature.ts`): a little larger than life against the houses round it,
 *    a two-storey house about two of him.
 * 2. **Six variants is not a crowd.** `VARIANTS = 6` is right for houses: a
 *    village has ten of them and yaw plus a tenth of scale finishes the job. A
 *    street has *forty* people in a space where you can see all of them at once,
 *    and six models repeated forty times is the exact failure this file exists
 *    to avoid. `PEOPLE_VARIANTS` is 24 and the reason it can be is measured
 *    rather than assumed — see the note on `personPool`.
 * 3. **`build(ctx, rng, style)` has nowhere to put a climate or a pose.** So the
 *    part files are thin wrappers and the real entry point is
 *    `buildPerson(ctx, look)`, with `look` coming out of `lookFor` in
 *    `dress.ts`. A placer that knows the biome's `warmth`, or that wants a
 *    person sitting in a saddle, calls those two directly.
 *
 * **What is not in here is where anybody stands.** `crowd` lays out a review
 * cluster and nothing else; putting people in the world is `settlements.ts`'s
 * problem and deliberately not this file's.
 */

// ---------------------------------------------------------------------------
// The figure
// ---------------------------------------------------------------------------

export interface Figure {
  height: number;
  /** Chin to crown, and the module the whole body is measured in. */
  head: number;
  chin: number;
  /** Top of the shoulder mass. The neck is what is left between here and `chin`. */
  shoulder: number;
  shoulderJoint: number;
  chest: number;
  waist: number;
  hip: number;
  /** The ankle joint above the sole; the boot fills the gap under it. */
  ankle: number;

  shoulderHalf: number;
  chestHalf: number;
  waistHalf: number;
  hipHalf: number;
  /** Front-to-back squash on the trunk. A body is a slab, not a totem pole. */
  depth: number;
  headHalf: number;
  /** Front-to-back stretch on the head: a skull is deeper than it is wide. */
  headDepth: number;
  /** Lateral offset of each hip from the centreline. */
  hipX: number;
  /** And of each shoulder, which is not the same number. */
  shoulderX: number;

  thigh: number;
  shin: number;
  upperArm: number;
  forearm: number;
  hand: number;

  /** Limb half-widths as `[far end, joint end]`. Every limb is wider at the top. */
  thighR: readonly [number, number];
  shinR: readonly [number, number];
  upperArmR: readonly [number, number];
  forearmR: readonly [number, number];
  bootWidth: number;
  bootDepth: number;
}

/**
 * The hero's proportions, and the crowd is built from the same record.
 *
 * **It is imported rather than restated, and that is the point.** A crowd built
 * to different proportions than the player is the one failure mode invisible in
 * every screenshot except the ones with both in them, and the only defence
 * against it is that there is one set of numbers. `src/avatar.ts` owns them;
 * this derives.
 *
 * The two that decide what a body reads as, worth quoting rather than looking
 * up:
 *
 * - **Exactly four heads.** `head / height` is 0.25. The avatar this replaced
 *   was 3.24 heads with its legs at 32% of its height, which are a toddler's
 *   proportions, and that is most of why it read as crude rather than stylised.
 * - **Legs at 44%.** `hip / height` is 0.441, and `thigh + shin + ankle` sums to
 *   it exactly, so a change to any of the three has to be paid for by another.
 *
 * **Every number below comes from `FIGURE` and none of them is a copy.** The
 * four limb sections were the last exception — literals inside `buildAvatar`
 * until they were promoted — and the reason to close that gap is precise: every
 * other proportion was already imported, so a limb that thickened in the hero
 * and not in the crowd would have been the one difference nobody could name.
 * Each is `[tip, root]`, the order `taper` takes, and each is wider at the joint
 * than at the far end, which is what makes a limb read as a limb rather than as
 * a dowel.
 */
export const BODY: Figure = Object.freeze({
  height: FIGURE.height,
  head: FIGURE.head,
  chin: FIGURE.chinY,
  shoulder: FIGURE.shoulderY,
  shoulderJoint: FIGURE.shoulderJointY,
  chest: FIGURE.chestY,
  waist: FIGURE.waistY,
  hip: FIGURE.hipY,
  ankle: FIGURE.ankleY,

  shoulderHalf: FIGURE.shoulderHalf,
  chestHalf: FIGURE.chestHalf,
  waistHalf: FIGURE.waistHalf,
  hipHalf: FIGURE.hipHalf,
  depth: FIGURE.bodyDepth,
  headHalf: FIGURE.headHalf,
  headDepth: FIGURE.headDepth,
  hipX: FIGURE.hipX,
  shoulderX: FIGURE.shoulderX,

  thigh: FIGURE.thigh,
  shin: FIGURE.shin,
  upperArm: FIGURE.upperArm,
  forearm: FIGURE.forearm,
  hand: FIGURE.hand,

  thighR: FIGURE.thighRadius,
  shinR: FIGURE.shinRadius,
  upperArmR: FIGURE.upperArmRadius,
  forearmR: FIGURE.forearmRadius,
  // The shoe is still a literal here, because `FIGURE` does not carry one and
  // `buildAvatar` builds a trainer of two masses — a pale sole and an upper —
  // where the crowd builds one pressed flat underneath. These are the old boot's
  // numbers and the crowd's shoe is sized off them.
  bootWidth: 0.58 * BODY_SCALE,
  bootDepth: 0.96 * BODY_SCALE,
});

/**
 * A child is **not a small adult**, and a uniform scale is exactly the tool that
 * cannot make one.
 *
 * Two departures, and they are the difference between a child and a dwarf: the
 * head keeps most of its size while the body loses it, and the legs are a
 * smaller share of the whole. A stylised adult here is four heads tall; this
 * puts a child at about 3.2, which is the same exaggeration applied to the same
 * real relation.
 *
 * The record is still stated at the adult's full height, `AVATAR_HEIGHT`, and
 * the builder shrinks it like any other, so `height` stays the only thing a
 * caller sets.
 */
function childFigure(adult: Figure): Figure {
  const head = adult.head * 1.25;
  const chin = adult.height - head;
  const hip = adult.height * 0.39;
  // The three below the hip keep their proportions and re-sum to the new hip.
  const legScale = hip / adult.hip;
  const shoulder = chin - (adult.chin - adult.shoulder) * 1.1;
  const shoulderJoint = shoulder - (adult.shoulder - adult.shoulderJoint);
  const scaleR = (r: readonly [number, number], by: number): [number, number] => [
    r[0] * by,
    r[1] * by,
  ];
  return Object.freeze({
    ...adult,
    head,
    chin,
    shoulder,
    shoulderJoint,
    chest: shoulderJoint + (adult.chest - adult.shoulderJoint),
    waist: hip + (adult.waist - adult.hip) * 0.86,
    hip,
    ankle: adult.ankle * legScale,
    shoulderHalf: adult.shoulderHalf * 0.84,
    chestHalf: adult.chestHalf * 0.93,
    waistHalf: adult.waistHalf * 0.97,
    hipHalf: adult.hipHalf * 0.93,
    depth: adult.depth * 0.95,
    headHalf: adult.headHalf * 1.2,
    hipX: adult.hipX * 0.9,
    shoulderX: adult.shoulderX * 0.86,
    thigh: adult.thigh * legScale,
    shin: adult.shin * legScale,
    upperArm: adult.upperArm * 0.9,
    forearm: adult.forearm * 0.9,
    hand: adult.hand * 0.95,
    thighR: scaleR(adult.thighR, 0.94),
    shinR: scaleR(adult.shinR, 0.94),
    upperArmR: scaleR(adult.upperArmR, 0.92),
    forearmR: scaleR(adult.forearmR, 0.92),
    bootWidth: adult.bootWidth * 0.9,
    bootDepth: adult.bootDepth * 0.88,
  });
}

export const CHILD_BODY: Figure = childFigure(BODY);

// ---------------------------------------------------------------------------
// What a person is
// ---------------------------------------------------------------------------

export type Age = 'child' | 'adult' | 'elder';

/** What the body is dressed in. The single largest silhouette lever there is. */
export type Garment = 'shirt' | 'tunic' | 'robe' | 'dress' | 'coat' | 'apron' | 'poncho';

export type Sleeves = 'bare' | 'short' | 'long';

/**
 * On the head, and the second largest lever — because it is the part of a
 * person furthest from the ground and therefore the last thing the silhouette
 * loses at distance.
 *
 * `beanie`, `hood`, `scarf`, `turban` and `helmet` **cover** the hair; `cap`,
 * `brim` and `conical` sit on it. That split is not decoration: a covering hat
 * replaces the hair mesh instead of sitting a hair's breadth outside it, which
 * is a mesh saved and, more importantly, the coplanar-ink trap avoided.
 */
export type Headwear =
  | 'none'
  | 'cap'
  | 'brim'
  | 'conical'
  | 'beanie'
  | 'hood'
  | 'scarf'
  | 'turban'
  | 'helmet';

export type Hair = 'bald' | 'crop' | 'bob' | 'long' | 'bun' | 'topknot' | 'braid' | 'afro';

export type Carry =
  | 'none'
  | 'pack'
  | 'satchel'
  | 'basket'
  | 'headload'
  | 'staff'
  | 'jug'
  | 'parasol'
  | 'bundle';

export type Pose = 'stand' | 'walk' | 'stride' | 'talk' | 'rest' | 'carry' | 'lift' | 'sit' | 'astride';

/**
 * One person, entirely.
 *
 * A plain record on purpose: `dress.ts` fills it in from a seed and a region,
 * `buildPerson` turns it into geometry and reads nothing else, and a caller who
 * wants a *specific* person — a shopkeeper at a door, a driver in a seat —
 * writes one by hand. Nothing in the builder touches an `Rng`, so one `Look` is
 * one body forever.
 */
export interface Look {
  /** Crown of the head above the sole, before any hat. */
  height: number;
  /** Multiplies the trunk's half-widths and the limb sections. 0.87 to 1.17. */
  girth: number;
  age: Age;

  hair: Hair;
  beard: boolean;
  headwear: Headwear;
  garment: Garment;
  sleeves: Sleeves;
  carry: Carry;
  pose: Pose;

  /** Forward lean about the hip, in radians. Elders get a little. */
  stoop: number;
  /** A signed nudge on every swing angle, so two walkers are not one walker. */
  sway: number;

  skin: number;
  hairColor: number;
  /** Shirt, coat, robe: whatever the upper body is. */
  top: number;
  /** Trousers, skirt: whatever the lower body is. A robe sets it to `top`. */
  bottom: number;
  /** Boots, hats, staves. The dark one. */
  trim: number;
  /** The one bright thing: a carried basket, an apron, a poncho. */
  accent: number;

  /**
   * Where the feet actually go, in the **person's own frame** — which for a
   * seated or astride pose is the seat surface, hip joint at the origin, +Z the
   * way they face. Mirrored across the centreline, so one point places both
   * feet: a crank, a stirrup, a pedal box, a footrest.
   *
   * Given, the two leg joints are solved by `solveLimb` instead of read out of
   * `POSES`, and the feet land on the vehicle rather than near it. Absent, the
   * pose's own angles stand. `Mount.footrest` in `src/traffic/contract.ts` is
   * exactly this point, published for exactly this reason.
   */
  footrest?: readonly [number, number, number];
  /**
   * And where the hands go: bars, a wheel, an oar, the same frame.
   *
   * The lean of a cyclist is entirely this: a bicycle that publishes a saddle
   * and no bars gets a rider sitting bolt upright on it.
   */
  grip?: readonly [number, number, number];
}

/**
 * The player, as a `Look`, so the hero and the crowd can be put in one frame.
 *
 * `crimson` is the hero's and is deliberately absent from every region's
 * wardrobe: the player is the only person on the planet wearing it, which is how
 * you find yourself in a street.
 */
export function heroLook(palette: SceneryContext['palette']): Look {
  return {
    height: BODY.height,
    girth: 1,
    age: 'adult',
    hair: 'crop',
    beard: false,
    headwear: 'none',
    garment: 'shirt',
    sleeves: 'long',
    carry: 'pack',
    pose: 'stand',
    stoop: 0,
    sway: 0,
    skin: palette.blush,
    hairColor: palette.bark,
    top: palette.crimson,
    bottom: palette.slate,
    trim: palette.bark,
    accent: palette.gold,
  };
}

// ---------------------------------------------------------------------------
// Poses
// ---------------------------------------------------------------------------

/**
 * A pose is a table of joint angles and nothing else.
 *
 * There is no skeleton and no animation here: every person is a static mesh, so
 * a pose is baked in at build time — which is exactly why there has to be more
 * than one. **A crowd in a single pose reads as mannequins however well the
 * bodies vary**, and the cheapest thing in the whole file is that the same body
 * in `walk` and in `rest` is two silhouettes for no triangles at all.
 *
 * Sign convention, derived once so nobody has to do it again: a limb hangs down
 * `-Y` from a pivot at its top, so rotating the pivot by `+x` swings the far end
 * towards `-Z` — **backwards**. Forward is negative. `z` is signed per side by
 * the builder, so a positive `z` here always means *away from the body*.
 *
 * **No resting pose has `shoulderZ` under about 0.2, and that is not comfort,
 * it is the arm being visible at all.** The arm hangs from x = 1.24 with a
 * section of 0.28, so its inner edge sits at 0.96 against a chest half-width of
 * 1.00: dead vertical, the arms are *inside the body's own silhouette* and only
 * appear when they swing. The hero found the same thing and answered it with
 * `ARM_SPLAY`; this is the same number arrived at from the same measurement.
 */
interface PoseAngles {
  /** Upper body about the hip. Negative leans forward. */
  lean: number;
  /** Head about Y. */
  turn: number;
  /** [left, right] shoulder swing. Negative is forward. */
  shoulderX: readonly [number, number];
  /** [left, right] shoulder abduction. Positive is away from the body. */
  shoulderZ: readonly [number, number];
  /** [left, right] elbow. Negative folds the forearm forward. */
  elbow: readonly [number, number];
  hipX: readonly [number, number];
  /** Knee. Positive takes the heel backwards, which is the only way a knee bends. */
  kneeX: readonly [number, number];
  /** Feet apart, as a multiple of the hip offset. */
  stance: number;
  /**
   * Knees out, in radians, for a body straddling something.
   *
   * Every other pose leaves it at zero and moves the feet with `stance`, which
   * is a translation. A saddle needs a *rotation*: the thigh has to leave the
   * body's own plane, and sliding the hip sideways instead puts the leg through
   * the frame it is meant to be either side of.
   */
  splay?: number;
}

const HALF_PI = Math.PI / 2;

/**
 * **A static walk has to be in double support, and the knee is what decides
 * it.** A body frozen mid-swing has one foot in the air, which is correct for
 * an animation and reads as *floating* in a still frame — and every frame here
 * is still, because a crowd figure is a baked mesh with no clock.
 *
 * The arithmetic is `thigh * cos(h) + shin * cos(h + k)`: a knee only lifts a
 * foot while the thigh is behind vertical, so bending the trailing knee raises
 * that foot and nothing else moves. `buildPerson` drops the whole body onto its
 * own lowest point, so the *other* boot is what ends up in the air. Measured, by
 * building each leg's angles on both sides and comparing crown heights:
 *
 * ```
 *              trailing knee   daylight under the higher boot
 *   walk          0.50            0.053
 *   walk          0.42            0.002
 *   stride        0.76            0.352   <- eight pixels at 40 units
 *   stride        0.40            0.001
 * ```
 *
 * 0.40 radians is still 23 degrees of knee, so nothing was given up to get it.
 */
export const POSES: Record<Pose, PoseAngles> = {
  // Weight on both feet, arms hanging with a hint of clearance from the hips.
  // The small asymmetry is deliberate: a perfectly symmetric figure reads as a
  // shop dummy, and 0.05 radians is invisible as a detail and obvious as a mood.
  stand: {
    lean: -0.01,
    turn: 0.06,
    shoulderX: [-0.05, 0.03],
    shoulderZ: [0.22, 0.2],
    elbow: [-0.14, -0.1],
    hipX: [0.02, -0.03],
    kneeX: [0.03, 0.06],
    stance: 1.02,
  },
  // **The arm pairs go the opposite way from the legs, and for a long time they
  // did not.** `shoulderX[0]` and `hipX[0]` are the same side — `buildPerson`
  // gives index 0 to `side = +1` for both — so a walk written with both of them
  // negative swings one arm forward with the leg under it. That is an
  // *ipsilateral* gait, the one thing a walk cannot get wrong.
  //
  // **What hid it is that the thing which moves does not use these numbers.**
  // `life.ts`'s `poseAt` writes all four joints itself, taking only the
  // *amplitudes* from here — `abs` of both entries, so the swap does not move
  // it — and its own signs are `avatar.ts`'s. So every walker in the world was
  // always contralateral and every *standing* figure was not, which is the
  // wrong way round for being noticed: `walk` and `stride` are 8 of the 18
  // weights in `dress.ts`'s `IDLE_POSES`, so **44% of the figures merged into a
  // settlement stood in it**, at 40 units, in a still, where an ipsilateral
  // swing is a person with one foot forward.
  //
  // The elbows travel with their own arms; `shoulderZ`'s 0.02 does not, because
  // it is the mood asymmetry every pose here carries and not a fact about the
  // gait.
  walk: {
    lean: -0.05,
    turn: 0.03,
    shoulderX: [0.4, -0.44],
    shoulderZ: [0.21, 0.19],
    elbow: [-0.22, -0.34],
    hipX: [-0.36, 0.3],
    // 0.42 and not 0.50, and 0.40 and not 0.76 in `stride` below, and both were
    // searched rather than chosen. See the note under `POSES`.
    kneeX: [0.12, 0.42],
    stance: 0.92,
  },
  // Half again the walk's swing and no more. It was -0.78 at the shoulder and
  // -0.58 at the hip, which is a sprint rather than a stride — and which took
  // the reach of an outstretched arm to 2.81 units, past the declared
  // footprint. See the note on `villager.footprint`: a person's footprint is a
  // pose, not a body.
  // Contralateral for the same reason `walk` is, and it had the same fault: this
  // pose is never animated, so it was only ever wrong in a still — where a
  // bigger swing makes it *more* visible, not less.
  stride: {
    lean: -0.11,
    turn: 0.02,
    shoulderX: [0.56, -0.62],
    shoulderZ: [0.22, 0.2],
    elbow: [-0.3, -0.55],
    hipX: [-0.46, 0.37],
    kneeX: [0.16, 0.4],
    stance: 0.9,
  },
  // One arm up mid-sentence. It is the only pose whose hand is above the
  // shoulder, so at 300 units it is the one that reads as "these two are
  // talking" rather than as "two people".
  talk: {
    lean: -0.02,
    turn: 0.42,
    shoulderX: [-0.62, 0.06],
    shoulderZ: [0.36, 0.21],
    elbow: [-1.3, -0.2],
    hipX: [0.04, -0.06],
    kneeX: [0.05, 0.1],
    stance: 1.22,
  },
  // Arms folded. Two straight forearms brought across the chest read as folded
  // arms at every distance that matters, and a real fold would want a shoulder
  // roll this body does not have.
  rest: {
    lean: 0.03,
    turn: -0.14,
    shoulderX: [-0.2, -0.18],
    shoulderZ: [0.3, 0.28],
    elbow: [-1.72, -1.66],
    hipX: [0.06, -0.04],
    kneeX: [0.04, 0.12],
    stance: 1.1,
  },
  // Both forearms forward and level: something is being held in front.
  carry: {
    lean: 0.04,
    turn: 0.02,
    shoulderX: [-0.26, -0.24],
    shoulderZ: [0.24, 0.22],
    elbow: [-1.42, -1.38],
    hipX: [0.02, -0.02],
    kneeX: [0.05, 0.05],
    stance: 1.06,
  },
  // Both hands up beside the head, steadying a load on it. The hardest
  // silhouette in the set to mistake for any other. The abduction is 0.52 and
  // not more because past that the hand walks out of the declared footprint.
  lift: {
    lean: 0.02,
    turn: 0,
    shoulderX: [-0.08, 0.06],
    shoulderZ: [0.52, 0.5],
    elbow: [-2.26, -2.2],
    hipX: [0, 0],
    kneeX: [0.03, 0.03],
    stance: 1,
  },
  // Thighs horizontal, shins down. See `buildPerson` for why this pose alone
  // changes where the origin is.
  sit: {
    lean: 0.05,
    turn: 0.1,
    shoulderX: [-0.22, -0.18],
    shoulderZ: [0.24, 0.22],
    elbow: [-0.62, -0.5],
    hipX: [-HALF_PI, -HALF_PI],
    kneeX: [HALF_PI, HALF_PI],
    stance: 1.12,
  },
  // Straddling something: a bicycle, a scooter, an animal. Same origin as
  // `sit` — the saddle surface, hip joint on it — and these angles are only the
  // **fallback**, for a mount that publishes no footrest and no grip. Give
  // `Look.footrest` and `Look.grip` and the four joints are solved instead, so
  // the feet land on the actual pedals of the actual vehicle.
  astride: {
    lean: -0.34,
    turn: 0.02,
    shoulderX: [-0.92, -0.88],
    shoulderZ: [0.2, 0.18],
    elbow: [-0.22, -0.18],
    hipX: [-1.05, -1.0],
    kneeX: [0.92, 0.86],
    stance: 1.0,
    splay: 0.22,
  },
};

/** The two poses whose origin is the seat surface rather than the sole. */
export const SEATED_POSES: ReadonlySet<Pose> = new Set<Pose>(['sit', 'astride']);

/**
 * Two-link inverse kinematics for one limb, and it is thirty lines because a
 * rider who does not reach the pedals is the whole failure mode of a seated
 * pose.
 *
 * The kit's vehicles publish where the feet and the hands go — `Mount.footrest`
 * and `Mount.grip` in `src/traffic/contract.ts` — and those points differ
 * between a bicycle, a scooter and a tractor by more than any single pose could
 * absorb. So the angles are solved rather than tabulated.
 *
 * `dx`, `dy`, `dz` are the target **relative to the limb's root pivot**, in that
 * pivot's parent frame. The result is the three numbers the builder already
 * knows how to apply: the abduction about Z, the swing about X, and the bend at
 * the middle joint.
 *
 * The sign convention is the pose table's, derived once there: a limb hangs down
 * `-Y`, `+x` swings it backwards, and the middle joint bends so the far segment
 * trails. `bend` is `+1` for a knee, which folds backwards, and `-1` for an
 * elbow, which folds forwards.
 */
function solveLimb(
  dx: number,
  dy: number,
  dz: number,
  upper: number,
  lower: number,
  bend: 1 | -1,
): { splay: number; swing: number; joint: number } {
  const reach = Math.hypot(dx, dy, dz);
  if (reach < 1e-6) return { splay: 0, swing: 0, joint: 0 };
  // A target further than the limb is straightened at it rather than snapped to
  // it, and one inside the fold is pushed out — both cases are a vehicle whose
  // published point does not suit this body, and a straight leg pointing the
  // right way is the least wrong answer.
  const span = Math.min(upper + lower - 1e-4, Math.max(Math.abs(upper - lower) + 1e-4, reach));
  const ux = dx / reach;
  const uy = dy / reach;
  const uz = dz / reach;
  const splay = Math.asin(Math.max(-1, Math.min(1, ux)));
  // The swing that would point a *straight* limb at the target.
  const straight = Math.atan2(-uz, -uy);
  const clamp = (value: number) => Math.max(-1, Math.min(1, value));
  const atRoot = Math.acos(clamp((upper * upper + span * span - lower * lower) / (2 * upper * span)));
  const atJoint = Math.acos(clamp((upper * upper + lower * lower - span * span) / (2 * upper * lower)));
  return {
    splay,
    swing: straight - bend * atRoot,
    joint: bend * (Math.PI - atJoint),
  };
}

// ---------------------------------------------------------------------------
// The build
// ---------------------------------------------------------------------------

/** How many bodies one region caches. See the note on `personPool`. */
export const PEOPLE_VARIANTS = 24;

/**
 * Which hats take the hair over.
 *
 * A hat that covers the hair *replaces* it. The alternative — a beanie built a
 * hair's breadth outside the hair it covers — is two nearly coplanar surfaces,
 * and `OutlineEffect` hulls each mesh separately, so the outer one loses the
 * depth test and draws no ink at all. That is Niagara's blank cream curtain, on
 * a 1.4-unit head.
 */
const COVERS_HAIR: ReadonlySet<Headwear> = new Set<Headwear>([
  'beanie',
  'hood',
  'scarf',
  'turban',
  'helmet',
]);

/** Garments that replace the legs with a hem, so no trousers are built. */
const HIDES_LEGS: ReadonlySet<Garment> = new Set<Garment>(['robe']);

/** `Figure`, scaled to one person. Nothing below multiplies by `k` twice. */
interface Scaled {
  height: number;
  head: number;
  chin: number;
  shoulder: number;
  shoulderJoint: number;
  chest: number;
  waist: number;
  hip: number;
  ankle: number;
  shoulderHalf: number;
  chestHalf: number;
  waistHalf: number;
  hipHalf: number;
  depth: number;
  headHalf: number;
  headDepth: number;
  hipX: number;
  shoulderX: number;
  thigh: number;
  shin: number;
  upperArm: number;
  forearm: number;
  hand: number;
  thighR: [number, number];
  shinR: [number, number];
  upperArmR: [number, number];
  forearmR: [number, number];
  bootWidth: number;
  bootDepth: number;
}

interface Bones {
  /** Everything above the hip, so it leans as one piece. */
  upper: Group;
  /** Top of the head in *upper* coordinates, so a load can sit on it. */
  crownY: number;
}

function scaleFigure(base: Figure, height: number, girth: number): Scaled {
  const k = height / base.height;
  // Girth thickens the trunk and the limbs and barely moves the shoulders and
  // the head: a stout person is broader through the middle, not bigger-headed.
  const wide = (value: number): number => value * k * girth;
  const mild = (value: number): number => value * k * (0.94 + girth * 0.06);
  const pair = (r: readonly [number, number]): [number, number] => [wide(r[0]), wide(r[1])];
  return {
    height,
    head: base.head * k,
    chin: base.chin * k,
    shoulder: base.shoulder * k,
    shoulderJoint: base.shoulderJoint * k,
    chest: base.chest * k,
    waist: base.waist * k,
    hip: base.hip * k,
    ankle: base.ankle * k,
    shoulderHalf: mild(base.shoulderHalf),
    chestHalf: wide(base.chestHalf),
    waistHalf: wide(base.waistHalf),
    hipHalf: wide(base.hipHalf),
    depth: wide(base.depth),
    headHalf: base.headHalf * k * (0.97 + girth * 0.03),
    headDepth: base.headDepth,
    hipX: mild(base.hipX),
    shoulderX: mild(base.shoulderX),
    thigh: base.thigh * k,
    shin: base.shin * k,
    upperArm: base.upperArm * k,
    forearm: base.forearm * k,
    hand: base.hand * k,
    thighR: pair(base.thighR),
    shinR: pair(base.shinR),
    upperArmR: pair(base.upperArmR),
    forearmR: pair(base.forearmR),
    bootWidth: base.bootWidth * k,
    bootDepth: base.bootDepth * k,
  };
}

/**
 * Radial detail for a crowd figure, against the hero's 1.6: a lathe written
 * with ten sides comes out with six. See `soft.ts` for why a person is built of
 * smooth shapes at all, and for why six smooth sides read rounder than twelve
 * flat ones.
 */
const CROWD_DETAIL = 0.6;

/** One soft kit per context, so a crowd shares the context's material cache. */
const softKits = new WeakMap<SceneryContext, SoftKit>();
function softOf(ctx: SceneryContext): SoftKit {
  let kit = softKits.get(ctx);
  if (kit === undefined) {
    kit = createSoftKit(ctx.toon, CROWD_DETAIL);
    softKits.set(ctx, kit);
  }
  return kit;
}

/**
 * One person, from a `Look` and nothing else.
 *
 * The returned `Group` obeys the scenery contract for every pose but one:
 * **`sit` puts the origin at the seat surface** — the hip joint at y = 0, +Z the
 * way the person faces — because that is the coordinate a bench, a saddle or a
 * car seat already has, and the alternative makes every vehicle compute a hip
 * offset from a leg length it does not own. A seated person is therefore *not* a
 * valid `ScenicPart`: `validatePart` wants the base at y = 0 and a seated one is
 * 1.66 below it. That is intended, and it is why the part files never ask for
 * `sit`.
 *
 * Every piece is a **soft shape** from `soft.ts` — lathes and ellipsoids with
 * smooth normals, the hero's own construction at a crowd's resolution. Until
 * 2026-09-15 a person here was four-sided tapers and boxes, which is a toy
 * soldier: the whole cast looked worse than Roblox, and at the distance a crowd
 * is seen the prisms were the reason.
 *
 * **The joints are exactly where they were, and `life.ts` depends on it.** The
 * root holds two hips and a trunk, the trunk holds two shoulders and a head,
 * and each hip and shoulder holds exactly one `Group`, its second joint —
 * `rigOf` finds the walker's skeleton by that shape and throws if it changes.
 * Every load, strap and hat is a `Mesh`, never a group, for the same reason.
 */
export function buildPerson(ctx: SceneryContext, look: Look): Group {
  const { THREE } = ctx;
  const { lathe, ellipsoid } = softOf(ctx);
  const group = new THREE.Group();
  const root = new THREE.Group();
  group.add(root);

  const base = look.age === 'child' ? CHILD_BODY : BODY;
  const f = scaleFigure(base, look.height, look.girth);
  /** Absolute sizes that do not follow a proportion — a rim, a strap — follow the height. */
  const k = f.height / BODY.height;

  const pose = POSES[look.pose];
  // The sway is what stops two people in the same pose being the same person.
  // It moves the *swing* angles only: nudging the stance or the lean moves the
  // feet, and a crowd whose feet are all at different heights is a crowd
  // standing on nothing.
  const s = look.sway;
  const swing = (angles: readonly [number, number], amount: number): [number, number] => [
    angles[0] + s * amount,
    angles[1] - s * amount,
  ];
  const seated = SEATED_POSES.has(look.pose);
  const shoulderX = swing(pose.shoulderX, 0.16);
  const elbow = swing(pose.elbow, 0.12);
  const hipX: [number, number] = seated
    ? [pose.hipX[0], pose.hipX[1]]
    : swing(pose.hipX, 0.1);
  const kneeX: [number, number] = seated
    ? [pose.kneeX[0], pose.kneeX[1]]
    : swing(pose.kneeX, 0.08);

  /**
   * Feet and hands on a published point, when there is one.
   *
   * Both targets arrive in the person's own frame, which for a seated pose is
   * the seat surface with the hip joint at the origin — so the leg pivots, which
   * live `f.hip` up in `root`, see the target unchanged in y. The arms are one
   * frame further in: they hang off `upper`, which is *leaned*, so the grip has
   * to be brought back through that rotation before it means anything to a
   * shoulder.
   */
  const legX = f.hipX * pose.stance;
  const lean = pose.lean - look.stoop;
  const legs =
    look.footrest === undefined
      ? null
      : ([0, 1] as const).map((i) => {
          const side = i === 0 ? 1 : -1;
          const target = look.footrest!;
          return solveLimb(
            side * Math.abs(target[0]) - side * legX,
            target[1],
            target[2],
            f.thigh,
            f.shin + f.ankle,
            1,
          );
        });
  const arms =
    look.grip === undefined
      ? null
      : ([0, 1] as const).map((i) => {
          const side = i === 0 ? 1 : -1;
          const target = look.grip!;
          // Out of the seat frame and into `upper`'s, which is only the lean.
          const gy = target[1] * Math.cos(lean) + target[2] * Math.sin(lean);
          const gz = -target[1] * Math.sin(lean) + target[2] * Math.cos(lean);
          return solveLimb(
            side * Math.abs(target[0]) - side * f.shoulderX,
            gy - (f.shoulderJoint - f.hip),
            gz,
            f.upperArm,
            f.forearm + f.hand * 0.5,
            -1,
          );
        });

  const sleeved = look.sleeves !== 'bare';
  const armTop = sleeved ? look.top : look.skin;
  const armLow = look.sleeves === 'long' ? look.top : look.skin;
  const hidesLegs = HIDES_LEGS.has(look.garment);
  const legColor = hidesLegs ? look.top : look.bottom;

  // --- legs ------------------------------------------------------------------
  // Built even under a robe, minus the thighs and shins: a hem with nothing
  // under it reads as a bell, and two shoes under it read as a person.
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1;
    const hipPivot = new THREE.Group();
    hipPivot.position.set(side * legX, f.hip, 0);
    hipPivot.rotation.x = legs ? legs[i]!.swing : hipX[i]!;
    hipPivot.rotation.z = side * (legs ? legs[i]!.splay : pose.splay ?? 0);
    root.add(hipPivot);

    if (!hidesLegs) {
      hipPivot.add(
        lathe(
          [
            [f.thighR[0], -f.thigh - 0.06 * k],
            [f.thighR[1], 0],
            [0, f.thighR[1] * 0.8],
          ],
          legColor,
          { sides: 8 },
        ),
      );
    }

    const kneePivot = new THREE.Group();
    kneePivot.position.y = -f.thigh;
    kneePivot.rotation.x = legs ? legs[i]!.joint : kneeX[i]!;
    hipPivot.add(kneePivot);

    if (!hidesLegs) {
      kneePivot.add(
        lathe(
          [
            [f.shinR[0], -f.shin],
            [f.shinR[1], 0.04 * k],
            [0, f.shinR[1] * 0.7],
          ],
          legColor,
          { sides: 8 },
        ),
      );
    }

    // A shoe: an ellipsoid with its underside pressed flat, which is a sole
    // without a second mesh. Its top runs up inside the shin, so a bent ankle
    // never opens a gap.
    const sole = -f.ankle * 0.62;
    const shoe = ellipsoid(f.bootWidth * 0.5, f.ankle * 0.95, f.bootDepth * 0.56, look.trim, {
      sides: 7,
      rings: 4,
      warp: (v) => {
        if (v.y < sole) v.y = sole;
      },
    });
    shoe.position.set(0, -f.shin - f.ankle - sole, f.bootDepth * 0.16);
    kneePivot.add(shoe);
  }

  // --- the trunk -------------------------------------------------------------
  const upper = new THREE.Group();
  upper.position.y = f.hip;
  upper.rotation.x = lean;
  root.add(upper);

  // Local Y inside `upper` is measured from the hip.
  const y = (world: number): number => world - f.hip;

  for (const piece of buildGarment(ctx, look, f, y)) upper.add(piece);

  // The shoulders: two round masses standing out past the chest, which is both
  // the anatomy and the ink line that separates the arm from the body. Christ
  // the Redeemer's file found the ledge first; the hero rounds it the same way.
  const capHeight = (f.shoulder - f.chest) * 0.95;
  for (const side of [1, -1]) {
    const cap = ellipsoid(f.shoulderHalf * 0.31, capHeight, f.depth * 0.6, look.top, { sides: 8, rings: 3 });
    cap.position.set(side * f.shoulderHalf * 0.74, y(f.shoulder) - capHeight, 0);
    upper.add(cap);
  }

  // Neck: buried in the collar at one end and the head at the other, so it is
  // never seen as a cylinder and always seen as an absence of daylight.
  upper.add(
    lathe(
      [
        [f.headHalf * 0.36, y(f.shoulder) - 0.12 * k],
        [f.headHalf * 0.33, y(f.chin)],
        [f.headHalf * 0.4, y(f.chin) + 0.3 * k],
      ],
      look.skin,
      { sides: 8 },
    ),
  );

  const headPivot = new THREE.Group();
  headPivot.position.y = y(f.chin);
  headPivot.rotation.y = pose.turn + s * 0.22;
  upper.add(headPivot);

  buildHead(ctx, look, f, headPivot);

  // --- arms ------------------------------------------------------------------
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1;
    const shoulderPivot = new THREE.Group();
    shoulderPivot.position.set(side * f.shoulderX, y(f.shoulderJoint), 0);
    shoulderPivot.rotation.x = arms ? arms[i]!.swing : shoulderX[i]!;
    shoulderPivot.rotation.z = side * (arms ? arms[i]!.splay : pose.shoulderZ[i]!);
    upper.add(shoulderPivot);

    shoulderPivot.add(
      lathe(
        [
          [f.upperArmR[0], -f.upperArm - 0.04 * k],
          [f.upperArmR[1], 0],
          [0, f.upperArmR[1] * 0.85],
        ],
        armTop,
        { sides: 8 },
      ),
    );

    const elbowPivot = new THREE.Group();
    elbowPivot.position.y = -f.upperArm;
    elbowPivot.rotation.x = arms ? arms[i]!.joint : elbow[i]!;
    shoulderPivot.add(elbowPivot);

    elbowPivot.add(
      lathe(
        [
          [f.forearmR[0], -f.forearm],
          [f.forearmR[1], 0.03 * k],
          [0, f.forearmR[1] * 0.75],
        ],
        armLow,
        { sides: 8 },
      ),
    );

    // A mitten, thin across the palm and broad front to back, on every arm now
    // and not only on long sleeves: a smooth hand is one small round mass where
    // a box hand was one more hard corner.
    const hand = ellipsoid(f.hand * 0.34, f.hand * 0.62, f.hand * 0.48, look.skin, { sides: 7, rings: 3 });
    hand.position.set(0, -f.forearm - f.hand * 0.42, 0.02 * k);
    elbowPivot.add(hand);
  }

  buildCarried(ctx, look, f, { upper, crownY: y(f.chin) + f.head });

  // --- where the origin goes -------------------------------------------------
  //
  // Standing, the contract wants the base at y = 0 and a pose that lifts a heel
  // would leave it above, so the body is dropped onto its own lowest point
  // rather than onto the arithmetic — which also means a new pose can never
  // quietly float. Seated, the origin is the seat surface instead.
  if (seated) {
    root.position.y = -f.hip;
  } else {
    // `precise`, because the loose box is the geometry's own box carried
    // through the pose, and a rotated ellipsoid's box has corners far outside
    // it: the loose drop left 143 of 560 bodies standing 0.1 in the air.
    const bounds = new THREE.Box3().setFromObject(root, true);
    root.position.y = -bounds.min.y;
  }
  return group;
}

/**
 * The garment, which is most of what a person is at any distance over 60 units.
 *
 * Returned as a list rather than added directly, so the caller keeps one place
 * where things enter the trunk. Everything is in `upper` coordinates — `y`
 * converts from heights above the sole.
 *
 * Each garment is one or two **lathes of the whole trunk**, so a hem is a place
 * where the profile flares rather than a second box laid over the first: the
 * silhouette of a coat, a robe and a dress is the profile, and the ink runs
 * round the flare because it is the edge of the shape.
 */
function buildGarment(ctx: SceneryContext, look: Look, f: Scaled, y: (world: number) => number): Mesh[] {
  const { lathe, rounded } = softOf(ctx);
  const k = f.height / BODY.height;
  const pieces: Mesh[] = [];
  const chestTop = f.chest + (f.shoulder - f.chest) * 0.45;
  /** The trunk's front-to-back scale: a body is a slab, not a totem pole. */
  const depth = f.depth / f.chestHalf;
  const seat = f.waist - f.hip;

  /**
   * Where a hem is allowed to reach, and it is **not the same seated**.
   *
   * Every hem below is a height above the sole, which is the right frame while
   * there is a sole under the person. In `sit` the legs fold away and the
   * origin moves to the seat, so an ankle-length robe measured the same way
   * hangs 2.86 units below the bench — measured, over 400 seated bodies, before
   * this clamp existed. Cloth over the edge of a seat stops at about half a
   * thigh, and that is what this says.
   */
  const floor = SEATED_POSES.has(look.pose) ? f.hip - f.thigh * 0.45 : -Infinity;
  const hem = (world: number): number => Math.max(world, floor);

  /** From the waist to the neck: the part of every upper garment that is the same. */
  const chestRings = (scale = 1): Ring[] => [
    [f.waistHalf * scale, y(f.waist)],
    [f.chestHalf * scale, y(f.chest)],
    [f.chestHalf * 0.95 * scale, y(chestTop)],
    [f.shoulderHalf * 0.6, y(f.shoulder) - 0.02 * k],
    [f.headHalf * 0.46, y(f.shoulder) + 0.1 * k],
  ];

  /**
   * Hips and seat, in the trousers, from the crotch to under the waist. Kept
   * inside every garment that covers it by about 0.07 at every height, because
   * two surfaces of different colour that close are a z-fight in a merged
   * buffer — the hero's seat came through his jacket hem as a grey shard.
   */
  const pelvis = (): Mesh =>
    lathe(
      [
        [f.hipHalf * 0.6, -seat * 0.6],
        [f.hipHalf * 0.9, -seat * 0.2],
        [f.hipHalf * 0.86, seat * 0.3],
        [f.hipHalf * 0.66, seat * 0.62],
        [f.hipHalf * 0.4, seat * 0.72],
      ],
      look.bottom,
      { depth },
    );

  /** A shirt worn out, its hem just over the hip line. */
  const shirt = (color: number): Mesh =>
    lathe(
      [
        [f.hipHalf * 0.9, y(f.hip) - 0.02 * k],
        [f.hipHalf * 0.98, y(f.hip) + 0.08 * k],
        ...chestRings(),
      ],
      color,
      { depth, sides: 12 },
    );

  switch (look.garment) {
    case 'shirt':
      pieces.push(pelvis(), shirt(look.top));
      break;

    // A shirt that reaches mid-thigh. One mesh and a visibly longer body: the
    // cheapest garment in the file and the commonest one on the planet.
    case 'tunic': {
      const foot = hem(f.hip - f.thigh * 0.45);
      pieces.push(
        lathe(
          [
            [f.hipHalf * 1.08, y(foot)],
            [f.hipHalf * 1.12, y(foot) + 0.12 * k],
            [f.hipHalf * 1.02, y(f.hip)],
            ...chestRings(),
          ],
          look.top,
          { depth, sides: 12 },
        ),
      );
      break;
    }

    // Ankle to shoulder in one flare. It deletes the trousers, so it is
    // *cheaper* than a shirt, and at 300 units it is the only garment whose
    // lower half is a triangle rather than two vertical strokes.
    case 'robe': {
      const foot = hem(f.ankle * 0.7);
      pieces.push(
        lathe(
          [
            [f.hipHalf * 1.5, y(foot)],
            [f.hipHalf * 1.56, y(foot) + 0.14 * k],
            [f.hipHalf * 1.2, y(Math.max(foot + 0.3 * k, f.hip - f.thigh * 0.4))],
            [f.hipHalf * 1.02, y(f.hip)],
            ...chestRings(1.02),
          ],
          look.top,
          { depth: depth * 1.04, sides: 12 },
        ),
      );
      break;
    }

    case 'dress': {
      const foot = hem(f.hip - f.thigh * 0.92);
      pieces.push(
        lathe(
          [
            [f.hipHalf * 1.46, y(foot)],
            [f.hipHalf * 1.5, y(foot) + 0.12 * k],
            [f.hipHalf * 1.14, y(Math.max(foot + 0.3 * k, f.hip - f.thigh * 0.3))],
            [f.waistHalf * 1.04, y(f.waist) - 0.1 * k],
            ...chestRings(),
          ],
          look.top,
          { depth, sides: 12 },
        ),
      );
      break;
    }

    // A coat is a trunk whose hem stands out past the hips it hangs off — that
    // overhang is the whole read, the same ledge the round hut's thatch gets.
    case 'coat': {
      const foot = hem(f.hip - f.thigh * 0.62);
      pieces.push(
        pelvis(),
        lathe(
          [
            [f.hipHalf * 1.16, y(foot)],
            [f.hipHalf * 1.22, y(foot) + 0.12 * k],
            [f.hipHalf * 1.08, y(f.hip)],
            ...chestRings(1.06),
          ],
          look.top,
          { depth, sides: 12 },
        ),
      );
      break;
    }

    // Working clothes: a plain shirt and a wrap of bright cloth round the hips
    // over it, which reads as an apron from every side — a flat slab on the
    // front only read from the front, and floated off a waist that curves.
    case 'apron': {
      const foot = hem(f.hip - f.thigh * 0.55);
      pieces.push(
        pelvis(),
        shirt(look.top),
        lathe(
          [
            [f.hipHalf * 1.1, y(foot)],
            [f.hipHalf * 1.06, y(f.hip)],
            [f.waistHalf * 1.07, y(f.waist)],
            [f.waistHalf * 1.02, y(f.waist) + 0.08 * k],
          ],
          look.accent,
          { depth, sides: 12 },
        ),
      );
      break;
    }

    // A sheet over the shoulders, wider than they are. It reads from directly
    // above, which nothing else in the set does.
    case 'poncho': {
      const drop = (chestTop - f.waist) * 0.85;
      pieces.push(
        pelvis(),
        shirt(look.top),
        lathe(
          [
            [f.shoulderHalf * 1.3, y(f.chest) - drop],
            [f.shoulderHalf * 1.24, y(f.chest) - drop * 0.6],
            [f.shoulderHalf * 1.02, y(f.shoulder)],
            [f.headHalf * 0.55, y(f.shoulder) + 0.14 * k],
          ],
          look.accent,
          { depth: 0.8, sides: 12 },
        ),
      );
      break;
    }
  }

  // A carried pack wants its straps, and they are the garment's to draw.
  if (look.carry === 'pack') {
    for (const side of [1, -1]) {
      const strap = rounded(0.22 * k, (f.shoulder - f.waist) * 0.9, 0.1 * k, 0.04 * k, look.trim, 2);
      strap.position.set(side * f.chestHalf * 0.46, y(f.waist) + 0.02 * k, f.depth * 1.0);
      strap.rotation.x = -0.1;
      pieces.push(strap);
    }
  }
  return pieces;
}

/**
 * The head: skull, eyes, hair, beard and hat, all on the head pivot so they
 * turn with it.
 *
 * The skull is the hero's egg at a crowd's resolution, and the hair is his
 * technique too: a mass set back and up from the skull so the face comes out
 * through it in front, and whatever the style adds hanging off that mass. A
 * haircut is therefore a shape and not a lid, and a hat that covers the hair
 * *replaces* the mass rather than sitting a hair's breadth outside it — two
 * nearly coplanar surfaces lose the depth test and draw no ink at all, which is
 * Niagara's blank curtain on a 1.4-unit head.
 */
function buildHead(ctx: SceneryContext, look: Look, f: Scaled, head: Group): void {
  const { lathe, ellipsoid } = softOf(ctx);
  const w = f.headHalf;
  const h = f.head;
  const covered = COVERS_HAIR.has(look.headwear);

  /** The skull, as fractions of the head's half-width and height. */
  const SKULL: readonly Ring[] = [
    [0, -0.01],
    [0.62, 0.08],
    [0.96, 0.32],
    [0.94, 0.62],
    [0.58, 0.85],
    [0, 0.9],
  ].map(([r, at]) => [r! * w, at! * h] as const);
  const skullAt = (at: number): number => {
    for (let i = 0; i + 1 < SKULL.length; i++) {
      const [r0, y0] = SKULL[i]!;
      const [r1, y1] = SKULL[i + 1]!;
      if (at >= y0 && at <= y1) return r0 + ((r1 - r0) * (at - y0)) / (y1 - y0);
    }
    return 0;
  };
  const faceZ = (x: number, at: number): number =>
    Math.sqrt(Math.max(0, skullAt(at) ** 2 - x * x)) * f.headDepth;

  head.add(
    lathe(SKULL, look.skin, {
      sides: 14,
      depth: f.headDepth,
      warp: (v) => {
        if (v.y < 0.3 * h && v.z > 0) v.z += (0.3 * h - v.y) * 0.12;
      },
    }),
  );

  // Two dark ovals, sunk half into the face. They are the whole of the face at
  // this size and the one thing that makes a head a person rather than a ball.
  for (const side of [1, -1]) {
    const eye = ellipsoid(w * 0.11, w * 0.17, w * 0.07, ctx.palette.ink, { sides: 6, rings: 3 });
    eye.position.set(side * w * 0.37, h * 0.42, faceZ(w * 0.37, h * 0.42) - w * 0.02);
    head.add(eye);
  }

  // --- hair ------------------------------------------------------------------
  const color = look.hairColor;
  const fringe = () => {
    const bang = ellipsoid(w * 0.78, h * 0.12, w * 0.3, color, { sides: 10, rings: 4 });
    bang.position.set(0, h * 0.72, faceZ(0, h * 0.72) - w * 0.16);
    bang.rotation.set(-0.3, 0, 0.14);
    head.add(bang);
  };
  const mass = (rx: number, ry: number, rz: number, at: number, back: number) => {
    const piece = ellipsoid(w * rx, h * ry, w * rz, color, { sides: 14, rings: 5 });
    piece.position.set(0, h * at, -w * back);
    head.add(piece);
  };

  if (!covered && look.hair !== 'bald') {
    switch (look.hair) {
      case 'afro':
        // The one style that changes the head's own outline rather than what
        // hangs off it: set well back, so the face still comes out in front.
        mass(1.42, 0.52, 1.36, 0.62, 0.42);
        break;
      case 'bob':
        // Down to the jaw at the sides and back, framing the face.
        mass(1.2, 0.56, 1.22, 0.46, 0.28);
        fringe();
        break;
      default:
        mass(1.12, 0.41, 1.18, 0.59, 0.24);
        if (look.hair !== 'topknot') fringe();
        break;
    }

    switch (look.hair) {
      // Hair that falls down the back, past the collar, behind the trunk.
      case 'long': {
        const fall = lathe(
          [
            [0, -h * 0.85],
            [w * 0.62, -h * 0.72],
            [w * 0.95, -h * 0.2],
            [w * 0.9, h * 0.25],
            [0, h * 0.45],
          ],
          color,
          { depth: 0.45, sides: 10 },
        );
        fall.position.set(0, h * 0.4, -Math.max(w * 1.08, f.depth * 1.12));
        head.add(fall);
        break;
      }
      case 'bun': {
        const knot = ellipsoid(w * 0.4, w * 0.38, w * 0.38, color, { sides: 10, rings: 5 });
        knot.position.set(0, h * 0.8, -w * 1.2);
        head.add(knot);
        break;
      }
      case 'topknot': {
        const knot = ellipsoid(w * 0.3, w * 0.38, w * 0.3, color, { sides: 10, rings: 5 });
        knot.position.set(0, h * 1.02, -w * 0.12);
        head.add(knot);
        break;
      }
      case 'braid': {
        const braid = lathe(
          [
            [0, -h * 0.95],
            [w * 0.2, -h * 0.8],
            [w * 0.22, -h * 0.1],
            [w * 0.28, h * 0.2],
            [0, h * 0.32],
          ],
          color,
          { sides: 8 },
        );
        braid.position.set(0, h * 0.34, -Math.max(w * 1.12, f.depth * 1.18));
        head.add(braid);
        break;
      }
      default:
        break;
    }
  }

  if (look.beard) {
    const beard = ellipsoid(w * 0.8, h * 0.2, w * 0.55, color, { sides: 10, rings: 5 });
    beard.position.set(0, h * 0.13, w * 0.46);
    head.add(beard);
  }

  // --- hats ------------------------------------------------------------------
  const accent = look.accent;
  switch (look.headwear) {
    case 'none':
      break;
    // These five take the hair's place, so each is built to cover the skull
    // from the brow up and the face comes out through it in front.
    case 'beanie':
      head.add(
        lathe(
          [
            [w * 1.08, h * 0.52],
            [w * 1.12, h * 0.64],
            [w * 0.98, h * 0.86],
            [w * 0.55, h * 1.0],
            [0, h * 1.04],
          ],
          accent,
          { depth: f.headDepth * 1.02, sides: 12 },
        ),
      );
      break;
    case 'helmet':
      head.add(
        lathe(
          [
            [w * 1.18, h * 0.54],
            [w * 1.2, h * 0.64],
            [w * 1.06, h * 0.84],
            [w * 0.62, h * 1.02],
            [0, h * 1.06],
          ],
          accent,
          { depth: f.headDepth, sides: 12 },
        ),
      );
      break;
    case 'turban':
      head.add(
        lathe(
          [
            [w * 1.02, h * 0.55],
            [w * 1.2, h * 0.68],
            [w * 1.18, h * 0.9],
            [w * 0.82, h * 1.08],
            [0, h * 1.13],
          ],
          accent,
          { depth: f.headDepth, sides: 12 },
        ),
      );
      break;
    // A cowl round the whole head, open only at the face, standing out behind
    // the skull: the thing that tells a hood apart from a haircut at 120 units.
    case 'hood': {
      const cowl = ellipsoid(w * 1.32, h * 0.6, w * 1.42, accent, { sides: 14, rings: 6 });
      cowl.position.set(0, h * 0.5, -w * 0.52);
      head.add(cowl);
      break;
    }
    // Over the head and falling past the jaw onto the shoulders.
    case 'scarf': {
      const cover = ellipsoid(w * 1.18, h * 0.54, w * 1.26, accent, { sides: 14, rings: 6 });
      cover.position.set(0, h * 0.52, -w * 0.32);
      head.add(cover);
      const shawl = lathe(
        [
          [w * 1.52, -h * 0.32],
          [w * 1.4, -h * 0.2],
          [w * 0.94, h * 0.12],
          [0, h * 0.3],
        ],
        accent,
        { depth: 0.9, sides: 12 },
      );
      shawl.position.z = -w * 0.14;
      head.add(shawl);
      break;
    }
    // These three sit on the hair, so they clear the mass: its top is the head's
    // own height and its widest is 1.12 of the half-width.
    case 'cap': {
      head.add(
        lathe(
          [
            [w * 1.16, h * 0.7],
            [w * 1.1, h * 0.86],
            [w * 0.72, h * 1.03],
            [0, h * 1.08],
          ],
          look.trim,
          { depth: f.headDepth, sides: 12 },
        ),
      );
      const peak = ellipsoid(w * 0.74, h * 0.035, w * 0.55, look.trim, { sides: 10, rings: 3 });
      peak.position.set(0, h * 0.72, w * 1.02);
      head.add(peak);
      break;
    }
    case 'brim': {
      head.add(
        lathe(
          [
            [w * 1.04, h * 0.8],
            [w * 0.98, h * 1.06],
            [0, h * 1.12],
          ],
          accent,
          { sides: 12 },
        ),
      );
      const brim = ellipsoid(w * 1.8, h * 0.035, w * 1.8, accent, { sides: 14, rings: 3 });
      brim.position.y = h * 0.8;
      head.add(brim);
      break;
    }
    // One mesh, and the widest silhouette in the kit for the money: a cone
    // wider than the shoulders, a shape nothing else here makes.
    case 'conical':
      head.add(
        lathe(
          [
            [w * 2.02, h * 0.82],
            [w * 1.62, h * 0.9],
            [w * 0.12, h * 1.36],
            [0, h * 1.38],
          ],
          accent,
          { sides: 12 },
        ),
      );
      break;
  }
}

/**
 * What a person is carrying, the third silhouette lever and the one that says
 * what they are *doing*.
 *
 * **Every load is parented to the trunk and none of them to a hand, and that is
 * a correction rather than a shortcut.** A hand's frame turns with the elbow, so
 * a basket parented to it lies down flat the moment the forearm comes up —
 * which is exactly the pose a basket is carried in. Putting the load where it
 * belongs on the body and letting `dress.ts` choose a pose whose arms arrive
 * there is the version that cannot be wrong: `headload` is paired with `lift`,
 * `basket` with `carry`, and a load with no matching pose is not in the table.
 *
 * The hands do not actually grip anything and at the distance a person is seen
 * they do not have to. A real grip wants a wrist and a shoulder roll this body
 * does not have, and it would buy nothing past 20 units.
 */
function buildCarried(ctx: SceneryContext, look: Look, f: Scaled, bones: Bones): void {
  const { lathe, ellipsoid, rounded } = softOf(ctx);
  const k = f.height / BODY.height;
  const half = f.headHalf;
  const waistY = f.waist - f.hip;

  switch (look.carry) {
    case 'none':
      break;
    // The hero's own bag, kept narrower than the shoulders for the hero's own
    // reason: the camera lives behind a walking person and a pack as wide as
    // the back hides the arms that do the walking.
    case 'pack': {
      const bag = rounded(f.chestHalf * 1.3, f.chestHalf * 1.5, f.depth * 0.95, 0.2 * k, look.accent);
      bag.position.set(0, waistY + f.chestHalf * 0.12, -f.depth * 1.5);
      bones.upper.add(bag);
      break;
    }
    // At the hip on a strap that crosses the chest: the strap is what makes it a
    // bag somebody is wearing rather than a box stuck to their side.
    case 'satchel': {
      const bag = rounded(f.chestHalf * 0.95, f.chestHalf * 0.85, f.depth * 0.62, 0.12 * k, look.accent);
      bag.position.set(f.hipHalf * 1.02, waistY * 0.2, f.depth * 0.4);
      bones.upper.add(bag);
      const V = (x: number, yy: number, z: number) => new ctx.THREE.Vector3(x, yy, z);
      const { band } = softOf(ctx);
      const shoulder = V(-f.chestHalf * 0.5, f.shoulder - f.hip + 0.04 * k, 0);
      const across = V(f.chestHalf * 0.1, f.chest - f.hip - 0.2 * k, f.depth * 1.08);
      const down = V(f.hipHalf * 1.0, waistY * 0.2 + f.chestHalf * 0.8, f.depth * 0.62);
      bones.upper.add(band(shoulder, across, 0.14 * k, 0.07 * k, look.trim), band(across, down, 0.14 * k, 0.07 * k, look.trim));
      break;
    }
    // Held in front at waist height, which is where the `carry` pose puts both
    // forearms.
    case 'basket': {
      const pot = lathe(
        [
          [f.hipHalf * 0.6, 0],
          [f.hipHalf * 0.86, f.hipHalf * 0.6],
          [f.hipHalf * 0.94, f.hipHalf * 1.05],
        ],
        look.accent,
      );
      pot.position.set(0, waistY * 0.55, f.depth * 1.6);
      bones.upper.add(pot);
      break;
    }
    // On the head, which needs the arms up to steady it — paired with `lift`
    // and with nothing else.
    case 'headload': {
      const load = lathe(
        [
          [half * 0.78, 0],
          [half * 1.04, half * 0.5],
          [half * 1.0, half * 1.05],
        ],
        look.accent,
      );
      load.position.y = bones.crownY + 0.04 * k;
      bones.upper.add(load);
      break;
    }
    // 0.2 across, which is just over `LEGIBLE_AT(40)`'s 0.17 and reads much
    // further than that anyway — because the ink is *screen space*: a stick this
    // thin is two pixels of pen against the sky at any distance, and the pen is
    // what you see. Placed from the hip rather than from the hand for the reason
    // in the note above; a staff that swung with the arm would be a wand.
    case 'staff': {
      // How far it is to the ground, and it is **not** the hip height when the
      // person is sitting: the `sit` pose moves the origin to the seat surface,
      // so `-hip` would hang the staff 1.66 units under the bench. Measured
      // over 400 seated bodies before the guard, the lowest point of a seated
      // person came out at -3.15 against a sole at -1.66 — a staff in the air.
      const drop = SEATED_POSES.has(look.pose) ? f.shin + f.ankle : f.hip;
      const pole = lathe(
        [
          [0.1, 0],
          [0.1, drop + f.chestHalf * 2.6 - 0.12],
          [0.14, drop + f.chestHalf * 2.6],
        ],
        look.trim,
        { sides: 6 },
      );
      pole.position.set(f.hipHalf * 1.5, -drop + 0.02, f.depth * 0.5);
      bones.upper.add(pole);
      break;
    }
    case 'jug': {
      const jug = lathe(
        [
          [half * 0.42, 0],
          [half * 0.72, half * 0.5],
          [half * 0.6, half * 0.98],
          [half * 0.3, half * 1.16],
          [half * 0.36, half * 1.3],
        ],
        look.accent,
      );
      jug.position.set(f.shoulderHalf * 0.92, waistY + half * 0.8, 0);
      bones.upper.add(jug);
      break;
    }
    // The one load that reads from directly overhead, which is the plane's view
    // of a street. The canopy is sized off the person's *height* rather than
    // their girth, because a stout person with a proportionally wider parasol is
    // the case that walks out of the declared footprint.
    case 'parasol': {
      const lift = bones.crownY + f.head * 0.28;
      const shaft = lathe([[0.09, 0], [0.09, lift + f.height * 0.05]], look.trim, { sides: 6 });
      shaft.position.set(f.hipHalf * 0.8, waistY * 0.1, f.depth * 0.35);
      bones.upper.add(shaft);
      const canopy = lathe(
        [
          [f.height * 0.125, 0],
          [f.height * 0.11, f.height * 0.025],
          [0, f.height * 0.06],
        ],
        look.accent,
        { sides: 14 },
      );
      canopy.position.set(f.hipHalf * 0.8, lift, f.depth * 0.35);
      bones.upper.add(canopy);
      break;
    }
    // Squashed front to back rather than round, and it is a *footprint* fix
    // before it is a shape one: a load on the back is the furthest thing from
    // the body's own axis, and an elder's 0.19 of stoop swings its top corner
    // another 0.4 units further out. A round bundle at the obvious offset
    // measured 2.92 against a declared 2.4.
    case 'bundle': {
      const load = ellipsoid(f.chestHalf * 0.98, f.chestHalf * 0.72, f.chestHalf * 0.5, look.accent, { rings: 6 });
      load.position.set(0, waistY + f.chestHalf * 0.95, -f.depth * 1.35);
      bones.upper.add(load);
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Laying a crowd out
// ---------------------------------------------------------------------------

export interface Bystander {
  x: number;
  z: number;
  yaw: number;
  /** Stable, and derived from the cell rather than from a counter. */
  seed: number;
}

/**
 * People on a patch of ground, for looking at them together.
 *
 * **This is the review layout, not the world's.** Where a person actually stands
 * is a question about streets, doorways and squares and belongs with whatever
 * puts them there. What this is for is the one failure no single thumbnail can
 * show: forty of them at once, which is the only way repetition becomes visible.
 *
 * A jittered grid for the same reason `plots` is — a cell is an *identity*, so
 * adding a person does not reshuffle the others — with a looser fill and a
 * completely free yaw, because people do not align to a street the way buildings
 * do.
 */
export function crowd(
  seed: number | string,
  options: { radius: number; pitch?: number; fill?: number },
): Bystander[] {
  const radius = options.radius;
  const pitch = options.pitch ?? 3.4;
  const fill = options.fill ?? 0.62;
  const half = Math.ceil(radius / pitch);
  const found: Bystander[] = [];

  for (let row = -half; row <= half; row++) {
    for (let column = -half; column <= half; column++) {
      const rng = rngFrom(seed, column, row, 'bystander');
      if (!rng.chance(fill)) continue;
      const x = column * pitch + rng.jitter() * pitch * 0.42;
      const z = row * pitch + rng.jitter() * pitch * 0.42;
      if (Math.hypot(x, z) > radius) continue;
      found.push({
        x,
        z,
        yaw: rng.unit() * Math.PI * 2,
        seed: Math.floor(rngFrom(seed, column, row, 'who').unit() * 0x7fffffff),
      });
    }
  }
  return found;
}

/**
 * The cached pool a placer draws from.
 *
 * **Why 24 and not 6, and why not unlimited.** The kit caps a part at
 * `VARIANTS = 6` because a variant is a geometry and six geometries is what an
 * `InstancedMesh` strategy can afford. Settlements do not instance — they merge,
 * measured at one draw call against 218 — so a variant costs *build time* and
 * nothing else, and the constraint moved. Twenty-four bodies at about 700
 * triangles is 17,000 triangles and about 11 ms (`pnpm people`, 2026-09-15, on
 * the soft bodies), once per region for the life of the session, against a
 * settlement streamer that already spends 3.5 ms a frame. Six is a crowd where you can name the repeats; unlimited is a build
 * cost per town rather than per region.
 *
 * A caller who wants a *specific* person — a shopkeeper at a door, a driver in a
 * seat — should call `buildPerson` directly rather than reaching into the pool.
 * The pool is the answer to filling a street, which is a different question.
 */
export function personPool(
  ctx: SceneryContext,
  make: (rng: Rng, index: number) => Look,
  key: string,
  count = PEOPLE_VARIANTS,
): Group[] {
  const pool: Group[] = [];
  for (let index = 0; index < count; index++) {
    pool.push(buildPerson(ctx, make(rngFrom(key, index, 'person'), index)));
  }
  return pool;
}
