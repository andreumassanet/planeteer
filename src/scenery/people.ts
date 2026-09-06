import { FIGURE } from '../avatar.ts';
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
 * 1. **A person is not built at `SCENERY_SCALE`.** The kit compresses a metre to
 *    1.267 units so a two-storey house is 10 units and reads as a 10 px mark at
 *    the horizon. Write a person in `STOREY`s and they come out **2.15 units
 *    tall — a third of the 6.8-unit avatar standing next to them.** A person is
 *    the one object in this world whose size is already decided by something
 *    else, and that something is `AVATAR_HEIGHT`. So the crowd is built at
 *    *avatar* scale, 3.78 u/m, three times the rest of the kit, and the
 *    consequence runs the other way too: **change `AVATAR_HEIGHT` and every
 *    person on the planet moves.** The relation the contract already accepts —
 *    a person's head at the eaves of a two-storey house, 6.8 against 7.6 — is
 *    the whole reason this works and it is not a bug to be fixed here.
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
  // The boot is still a literal here, because `FIGURE` does not carry one and
  // `buildAvatar` builds a two-mass boot — a sole and a lower toe — where the
  // crowd builds one. If the hero's foot changes shape, this is the line.
  bootWidth: 0.58,
  bootDepth: 0.96,
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
 * The record is still stated at the nominal 6.8 and the builder shrinks it like
 * any other, so `height` stays the only thing a caller sets.
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
 * Every limb is a **four-sided taper, wider at the joint than at the far end**,
 * which is the hero's own construction at the crowd's price: 16 triangles a
 * section against a box's 12, for the one thing that stops an arm reading as a
 * dowel. Five sides, which is what the hero uses, would be 20.
 */
export function buildPerson(ctx: SceneryContext, look: Look): Group {
  const { THREE, box, taper } = ctx;
  const group = new THREE.Group();
  const root = new THREE.Group();
  group.add(root);

  const base = look.age === 'child' ? CHILD_BODY : BODY;
  const f = scaleFigure(base, look.height, look.girth);

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
  // under it reads as a bell, and two boots under it read as a person.
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1;
    const hipPivot = new THREE.Group();
    hipPivot.position.set(side * legX, f.hip, 0);
    hipPivot.rotation.x = legs ? legs[i]!.swing : hipX[i]!;
    hipPivot.rotation.z = side * (legs ? legs[i]!.splay : pose.splay ?? 0);
    root.add(hipPivot);

    if (!hidesLegs) {
      const thigh = taper(f.thighR[0], f.thighR[1], f.thigh, legColor, 4);
      thigh.position.y = -f.thigh;
      hipPivot.add(thigh);
    }

    const kneePivot = new THREE.Group();
    kneePivot.position.y = -f.thigh;
    kneePivot.rotation.x = legs ? legs[i]!.joint : kneeX[i]!;
    hipPivot.add(kneePivot);

    if (!hidesLegs) {
      const shin = taper(f.shinR[0], f.shinR[1], f.shin, legColor, 4);
      shin.position.y = -f.shin;
      kneePivot.add(shin);
    }

    const boot = box(f.bootWidth, f.ankle, f.bootDepth, look.trim);
    boot.position.set(0, -f.shin - f.ankle, f.bootDepth * 0.16);
    kneePivot.add(boot);
  }

  // --- the trunk -------------------------------------------------------------
  const upper = new THREE.Group();
  upper.position.y = f.hip;
  upper.rotation.x = lean;
  root.add(upper);

  // Local Y inside `upper` is measured from the hip.
  const y = (world: number): number => world - f.hip;

  for (const piece of buildGarment(ctx, look, f, y)) upper.add(piece);

  // The shoulder mass: a slab 2.6 wide against a 2.0 chest, and the 0.30 of
  // ledge either side is both the anatomy and the ink line that separates the
  // arm from the body. Christ the Redeemer's file found it first.
  const shoulderHeight = (f.shoulder - f.chest) * 1.3;
  const shoulders = box(f.shoulderHalf * 2, shoulderHeight, f.depth * 1.9, look.top);
  shoulders.position.y = y(f.shoulder) - shoulderHeight;
  upper.add(shoulders);

  // Neck: buried in the shoulder mass at one end and the head at the other, so
  // it is never seen as a cylinder and always seen as an absence of daylight.
  const neckGap = f.chin - f.shoulder;
  const neck = box(f.headHalf * 0.52, neckGap * 3.2, f.headHalf * 0.5, look.skin);
  neck.position.y = y(f.shoulder) - neckGap * 1.1;
  upper.add(neck);

  const headPivot = new THREE.Group();
  headPivot.position.y = y(f.chin);
  headPivot.rotation.y = pose.turn + s * 0.22;
  upper.add(headPivot);

  // The skull narrows at the chin and widens at the cranium, which is the one
  // shape cue that survives past a head being six pixels tall.
  const skullHeight = f.head * 0.78;
  const skull = taper(f.headHalf * 0.8, f.headHalf * 0.99, skullHeight, look.skin, 6);
  skull.scale.z = f.headDepth;
  headPivot.add(skull);

  buildHead(ctx, look, f, skullHeight, headPivot);

  // --- arms ------------------------------------------------------------------
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1;
    const shoulderPivot = new THREE.Group();
    shoulderPivot.position.set(side * f.shoulderX, y(f.shoulderJoint), 0);
    shoulderPivot.rotation.x = arms ? arms[i]!.swing : shoulderX[i]!;
    shoulderPivot.rotation.z = side * (arms ? arms[i]!.splay : pose.shoulderZ[i]!);
    upper.add(shoulderPivot);

    const arm = taper(f.upperArmR[0], f.upperArmR[1], f.upperArm, armTop, 4);
    arm.position.y = -f.upperArm;
    shoulderPivot.add(arm);

    const elbowPivot = new THREE.Group();
    elbowPivot.position.y = -f.upperArm;
    elbowPivot.rotation.x = arms ? arms[i]!.joint : elbow[i]!;
    shoulderPivot.add(elbowPivot);

    const fore = taper(f.forearmR[0], f.forearmR[1], f.forearm, armLow, 4);
    fore.position.y = -f.forearm;
    elbowPivot.add(fore);

    // A hand only exists when a sleeve would otherwise end in cloth. A bare or
    // short-sleeved arm is already skin at the wrist, and a hand mesh on it is
    // 12 triangles that draw one more ink line and say nothing.
    if (look.sleeves === 'long') {
      const fist = box(f.hand * 1.03, f.hand, f.hand * 0.85, look.skin);
      fist.position.y = -f.forearm - f.hand;
      elbowPivot.add(fist);
    }
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
    const bounds = new THREE.Box3().setFromObject(root);
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
 */
function buildGarment(
  ctx: SceneryContext,
  look: Look,
  f: Scaled,
  y: (world: number) => number,
): Mesh[] {
  const { box, taper } = ctx;
  const pieces: Mesh[] = [];
  const chestTop = f.chest + (f.shoulder - f.chest) * 0.45;
  const depthOf = (half: number): number => (f.depth * 1.02) / half;

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

  /** The trunk from the waist to the top of the chest. Everyone has one. */
  const chest = (color: number): Mesh => {
    const mesh = taper(f.waistHalf, f.chestHalf, chestTop - f.waist, color, 6);
    mesh.position.y = y(f.waist);
    mesh.scale.z = depthOf(f.chestHalf);
    return mesh;
  };

  /** Hips and seat, from the hip line to the waist. */
  const pelvis = (color: number): Mesh => {
    const mesh = box(f.hipHalf * 2, f.waist - f.hip, f.depth * 1.94, color);
    mesh.position.y = 0;
    return mesh;
  };

  switch (look.garment) {
    case 'shirt':
      pieces.push(pelvis(look.bottom), chest(look.top));
      break;

    // A shirt that reaches mid-thigh. One mesh instead of two and a visibly
    // longer body: the cheapest garment in the file and the commonest one on
    // the planet.
    case 'tunic': {
      const foot = hem(f.hip - f.thigh * 0.45);
      const mesh = taper(f.hipHalf * 1.12, f.chestHalf, chestTop - foot, look.top, 6);
      mesh.position.y = y(foot);
      mesh.scale.z = depthOf(f.chestHalf);
      pieces.push(mesh);
      break;
    }

    // Ankle to shoulder in one flare. It deletes the trousers, so it is
    // *cheaper* than a shirt, and at 300 units it is the only garment whose
    // lower half is a triangle rather than two vertical strokes.
    case 'robe': {
      const foot = hem(f.ankle * 0.7);
      const mesh = taper(f.hipHalf * 1.6, f.chestHalf, chestTop - foot, look.top, 6);
      mesh.position.y = y(foot);
      mesh.scale.z = depthOf(f.chestHalf) * 1.04;
      pieces.push(mesh);
      break;
    }

    case 'dress': {
      const foot = hem(f.hip - f.thigh * 0.92);
      const skirt = taper(f.hipHalf * 1.52, f.waistHalf * 1.04, f.waist - foot, look.top, 6);
      skirt.position.y = y(foot);
      skirt.scale.z = depthOf(f.hipHalf * 1.34);
      pieces.push(skirt, chest(look.top));
      break;
    }

    // A coat is a chest plus a skirt below the hip, and the skirt is *wider*
    // than the hips it hangs off — that overhang is the whole read, the same
    // ledge the round hut's thatch gets.
    case 'coat': {
      const foot = hem(f.hip - f.thigh * 0.62);
      const skirt = taper(f.hipHalf * 1.22, f.chestHalf * 1.12, f.waist - foot, look.top, 6);
      skirt.position.y = y(foot);
      skirt.scale.z = depthOf(f.hipHalf * 1.18);
      pieces.push(pelvis(look.bottom), skirt, chest(look.top));
      break;
    }

    // Working clothes: a plain body and one bright slab across the front of it.
    // The slab stands 0.09 proud so it gets its own ink line — flush with the
    // chest it would be a colour change with no drawing on it, which is the
    // trap Niagara's curtain wrote down.
    case 'apron': {
      pieces.push(pelvis(look.bottom), chest(look.top));
      const height = f.waist - f.hip + (chestTop - f.waist) * 0.7;
      const front = box(f.chestHalf * 1.5, height, 0.16, look.accent);
      front.position.set(0, 0, f.depth * 1.02 + 0.09);
      pieces.push(front);
      break;
    }

    // A flat sheet over the shoulders, wider than they are. It reads from
    // directly above, which nothing else in the set does.
    case 'poncho': {
      pieces.push(pelvis(look.bottom), chest(look.top));
      const drop = (chestTop - f.waist) * 0.85;
      const cape = taper(f.shoulderHalf * 1.26, f.shoulderHalf * 1.04, drop, look.accent, 6);
      cape.position.y = y(f.chest) - drop;
      cape.scale.z = 0.8;
      pieces.push(cape);
      break;
    }
  }
  return pieces;
}

/**
 * Hair, beard and hat, all on the head pivot so they turn with it.
 *
 * **The crown is the hair.** The top fifth of the skull is a separate mesh
 * whatever happens, so a haircut is a colour and a size on a mesh that already
 * exists rather than a mesh added to one: bald costs the same as cropped, and an
 * afro — which is the one style that changes the head's own outline rather than
 * what hangs off it — costs the same as both.
 */
function buildHead(
  ctx: SceneryContext,
  look: Look,
  f: Scaled,
  skullHeight: number,
  head: Group,
): void {
  const { box, taper, column, dome } = ctx;
  const covered = COVERS_HAIR.has(look.headwear);
  const half = f.headHalf;
  const bald = look.hair === 'bald' && !covered;
  const crownColor = bald ? look.skin : covered ? look.accent : look.hairColor;

  const afro = look.hair === 'afro' && !covered;
  const crownWidth = afro ? half * 1.44 : half * (covered ? 1.09 : 1.01);
  const crownTop = afro ? half * 1.08 : half * (covered ? 0.56 : 0.46);
  const crownHeight = (f.head - skullHeight) * (afro ? 1.6 : 1);
  const crown = taper(crownWidth, crownTop, crownHeight, crownColor, 6);
  crown.position.y = skullHeight - (afro ? crownHeight * 0.3 : 0);
  crown.scale.z = afro ? 1 : f.headDepth;
  head.add(crown);

  if (!covered) {
    switch (look.hair) {
      // Hair that hangs behind the head. One box, and it only ever shows in the
      // silhouette from the side — which is half the people you pass.
      case 'bob':
      case 'long': {
        const drop = look.hair === 'long' ? f.head * 1.15 : f.head * 0.66;
        const fall = box(half * 1.8, drop, half * 0.9, look.hairColor);
        fall.position.set(0, skullHeight - drop + f.head * 0.06, -half * 0.62);
        head.add(fall);
        break;
      }
      case 'bun': {
        const knot = taper(half * 0.46, half * 0.36, half * 0.66, look.hairColor, 6);
        knot.position.set(0, skullHeight - half * 0.22, -half * 0.88);
        head.add(knot);
        break;
      }
      case 'topknot': {
        const knot = column(half * 0.28, half * 0.7, look.hairColor, 4);
        knot.position.y = skullHeight + crownHeight * 0.55;
        head.add(knot);
        break;
      }
      case 'braid': {
        const braid = box(half * 0.44, f.head * 1.3, half * 0.44, look.hairColor);
        braid.position.set(0, skullHeight - f.head * 1.3 + f.head * 0.1, -half * 0.92);
        head.add(braid);
        break;
      }
      default:
        break;
    }
  }

  if (look.beard) {
    const beard = box(half * 1.16, f.head * 0.42, half * 0.78, look.hairColor);
    beard.position.set(0, f.head * 0.03, half * 0.42);
    head.add(beard);
  }

  const top = f.head;
  switch (look.headwear) {
    // These five *are* the crown, above, in the accent colour, because a
    // separate shell over the hair would be two coplanar surfaces and no ink
    // between them. Two of them add a second piece, and both of those pieces
    // are the thing that tells the hat apart from a haircut at 120 units: a
    // scarf falls past the jaw, a hood stands out behind the skull.
    case 'none':
    case 'beanie':
    case 'turban':
      break;
    case 'scarf': {
      const shawl = taper(half * 1.5, half * 1.12, f.head * 0.72, look.accent, 6);
      shawl.position.y = -f.head * 0.02;
      head.add(shawl);
      break;
    }
    case 'hood': {
      const cowl = taper(half * 1.36, half * 1.12, f.head * 0.5, look.accent, 6);
      cowl.position.y = f.head * 0.18;
      cowl.scale.z = 1.14;
      head.add(cowl);
      break;
    }
    case 'helmet': {
      const shell = dome(half * 1.16, f.head * 0.46, look.accent, 6, 1);
      shell.position.y = top * 0.66;
      head.add(shell);
      break;
    }
    // Sits on the hair, so it has to clear it: 0.08 of air, four pixels at the
    // distance you would ever notice and nothing at all past that.
    case 'cap': {
      const shell = taper(half * 1.06, half * 0.68, half * 0.52, look.trim, 6);
      shell.position.y = top * 0.9;
      head.add(shell);
      const peak = box(half * 1.34, 0.09, half * 1.0, look.trim);
      peak.position.set(0, top * 0.94, half * 1.05);
      head.add(peak);
      break;
    }
    case 'brim': {
      const shell = taper(half * 1.02, half * 0.8, half * 0.76, look.accent, 6);
      shell.position.y = top * 0.88;
      head.add(shell);
      const brim = column(half * 1.8, 0.1, look.accent, 6);
      brim.position.y = top * 0.86;
      head.add(brim);
      break;
    }
    // One mesh, and the widest silhouette in the kit for the money: a cone
    // wider than the shoulders, a shape nothing else here makes.
    case 'conical': {
      const cone = taper(half * 2.05, 0.05, half * 1.2, look.accent, 6);
      cone.position.y = top * 0.84;
      head.add(cone);
      break;
    }
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
  const { box, taper } = ctx;
  const half = f.headHalf;
  const waistY = f.waist - f.hip;

  switch (look.carry) {
    case 'none':
      break;
    // The hero's own bag, kept narrower than the shoulders for the hero's own
    // reason: the camera lives behind a walking person and a pack as wide as
    // the back hides the arms that do the walking.
    case 'pack': {
      const bag = box(f.chestHalf * 1.3, f.chestHalf * 1.5, f.depth * 0.95, look.accent);
      bag.position.set(0, waistY + f.chestHalf * 0.12, -f.depth * 1.5);
      bones.upper.add(bag);
      break;
    }
    case 'satchel': {
      const bag = box(f.chestHalf * 0.95, f.chestHalf * 0.85, f.depth * 0.62, look.accent);
      bag.position.set(f.hipHalf * 1.02, waistY * 0.2, f.depth * 0.4);
      bones.upper.add(bag);
      break;
    }
    // Held in front at waist height, which is where the `carry` pose puts both
    // forearms.
    case 'basket': {
      const pot = taper(f.hipHalf * 0.76, f.hipHalf * 0.92, f.hipHalf * 1.05, look.accent, 6);
      pot.position.set(0, waistY * 0.55, f.depth * 1.6);
      bones.upper.add(pot);
      break;
    }
    // On the head, which needs the arms up to steady it — paired with `lift`
    // and with nothing else.
    case 'headload': {
      const load = taper(half * 1.0, half * 0.9, half * 1.05, look.accent, 6);
      load.position.y = bones.crownY + 0.04;
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
      const pole = box(0.2, drop + f.chestHalf * 2.6, 0.2, look.trim);
      pole.position.set(f.hipHalf * 1.5, -drop + 0.02, f.depth * 0.5);
      bones.upper.add(pole);
      break;
    }
    case 'jug': {
      const jug = taper(half * 0.58, half * 0.7, half * 1.2, look.accent, 6);
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
      const shaft = box(0.2, lift, 0.2, look.trim);
      shaft.position.set(f.hipHalf * 0.8, waistY * 0.1, f.depth * 0.35);
      bones.upper.add(shaft);
      const canopy = taper(f.height * 0.125, 0.06, f.height * 0.06, look.accent, 6);
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
      const load = taper(f.chestHalf, f.chestHalf * 0.88, f.chestHalf * 1.3, look.accent, 6);
      load.scale.z = 0.5;
      load.position.set(0, waistY + f.chestHalf * 0.3, -f.depth * 1.35);
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
 * nothing else, and the constraint moved. Twenty-four bodies at about 290
 * triangles is 7,000 triangles and a few milliseconds, once per region for the
 * life of the session, against a settlement streamer that already spends 3.5 ms
 * a frame. Six is a crowd where you can name the repeats; unlimited is a build
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
