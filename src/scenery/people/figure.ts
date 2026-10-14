import { FIGURE } from '../../avatar.ts';
import { BODY_SCALE } from '../../stature.ts';

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
 * The hero's proportions; the crowd is built from the same record, imported
 * rather than restated, so a crowd cannot drift from the player. `src/avatar.ts`
 * owns the numbers.
 *
 * - Exactly four heads: `head / height` is 0.25.
 * - Legs at 44%: `hip / height` is 0.441, and `thigh + shin + ankle` sums to it
 *   exactly, so a change to any of the three has to be paid for by another.
 *
 * Each limb section is `[tip, root]`, the order `taper` takes, wider at the
 * joint than at the far end so a limb reads as a limb rather than a dowel.
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
  // The shoe is a literal here because `FIGURE` does not carry one: the hero
  // builds a trainer of two masses (a pale sole and an upper) where the crowd
  // builds one pressed flat underneath.
  bootWidth: 0.58 * BODY_SCALE,
  bootDepth: 0.96 * BODY_SCALE,
});

/**
 * A child is not a small adult, and a uniform scale cannot make one: the head
 * keeps most of its size while the body loses it, and the legs are a smaller
 * share of the whole. A stylised adult here is four heads tall; this puts a
 * child at about 3.2.
 *
 * The record is stated at the adult's full height, `AVATAR_HEIGHT`, and the
 * builder shrinks it like any other, so `height` stays the only thing a caller
 * sets.
 */
export function childFigure(adult: Figure): Figure {
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
