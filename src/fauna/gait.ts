import { swingLift } from '../avatar.ts';

/**
 * Which way a joint's fold takes the segment below it.
 *
 * - `knee`: the lower segment swings backward (a human knee, a quadruped's
 *   front carpus).
 * - `hock`: the lower segment swings forward (the tarsus of a hind leg).
 *
 * Two segments per leg: on a standing animal the hind stifle is inside the
 * flank, so what shows is the tibia, the hock and the cannon.
 */
export type Fold = 'knee' | 'hock';

/**
 * Absolute angle of the lower segment. Positive trails, matching `avatar.ts`:
 * a positive `rotation.x` on a hanging limb sends its end to -Z, behind a body
 * facing +Z.
 */
export const lowerAngle = (upper: number, fold: number, kind: Fold): number =>
  kind === 'knee' ? upper + fold : upper - fold;

/** How far below its attachment a hoof sits, with both angles absolute. */
export const footDrop = (
  upperLength: number, lowerLength: number, upper: number, lower: number, hoof = 0,
): number => upperLength * Math.cos(upper) + lowerLength * Math.cos(lower) + hoof;

/**
 * Whether folding the joint further lifts the foot rather than driving it into
 * the ground. Differentiating the drop by the fold gives `-L2 sin(lower)` for a
 * knee and `+L2 sin(lower)` for a hock, so the test is on the lower segment's
 * absolute angle: folding lifts only while it takes that segment further from
 * vertical.
 *
 * A foreleg hangs near vertical, so it needs `swingLift`'s gate like the
 * biped. A hind leg is folded at rest by more than its swing amplitude, so the
 * test holds at every phase without a gate.
 */
export const foldLifts = (lower: number, kind: Fold): boolean =>
  kind === 'knee' ? Math.sin(lower) > 0 : Math.sin(lower) < 0;

/**
 * A leg. `upperLength` and `lowerLength` are solved by `solveLeg` rather than
 * declared, so the hoof lands on the ground at rest.
 */
export interface Leg {
  /** Height of the shoulder or hip above the ground, at rest. */
  attach: number;
  /** Where along +Z the leg hangs from. */
  z: number;
  /** Lateral offset from the centreline. Positive is the animal's left. */
  x: number;
  upperLength: number;
  lowerLength: number;
  upperRadius: number;
  lowerRadius: number;
  hoof: number;
  /** Rest angle of the upper segment. Positive trails. */
  restUpper: number;
  /** Rest fold. Always non-negative: a joint folds one way. */
  restFold: number;
  /** Radians the upper segment swings either side of its rest angle. */
  swing: number;
  /** Radians of extra fold at the top of the lift. */
  lift: number;
  kind: Fold;
  /** Where in the cycle this leg's footfall is, in turns. */
  offset: number;
}

/**
 * The two segment lengths that put the hoof exactly on the ground in the rest
 * pose. `split` is the upper segment's share of the total.
 */
export function solveLeg(attach: number, hoof: number, restUpper: number, restFold: number, kind: Fold, split: number): [number, number] {
  const restLower = lowerAngle(restUpper, restFold, kind);
  const reach = split * Math.cos(restUpper) + (1 - split) * Math.cos(restLower);
  const total = (attach - hoof) / reach;
  return [total * split, total * (1 - split)];
}

/** Where one leg is at one phase of the cycle. Angles are absolute. */
export interface LegPhase {
  upper: number;
  lower: number;
  fold: number;
  /** Below the attachment. */
  drop: number;
  /** Above the ground, if the body has not moved. Negative digs. */
  footY: number;
  /** Fore-and-aft position of the hoof relative to the attachment. +Z is ahead. */
  footZ: number;
  /** Whether the fold is doing its job at this instant. */
  lifting: boolean;
}

/**
 * One leg at one phase, in turns. The lift is `avatar.ts`'s `swingLift`, the
 * one gait in the world: non-zero only over the first half of the forward swing.
 */
export function legAt(leg: Leg, phase: number): LegPhase {
  const p = (phase + leg.offset) * Math.PI * 2;
  const upper = leg.restUpper + Math.sin(p) * leg.swing;
  const fold = leg.restFold + swingLift(p) * leg.lift;
  const lower = lowerAngle(upper, fold, leg.kind);
  const drop = footDrop(leg.upperLength, leg.lowerLength, upper, lower, leg.hoof);
  return {
    upper,
    lower,
    fold,
    drop,
    footY: leg.attach - drop,
    footZ: -(leg.upperLength * Math.sin(upper) + leg.lowerLength * Math.sin(lower)),
    lifting: foldLifts(lower, leg.kind),
  };
}

/**
 * Footfall offsets of the two gaits, as fractions of a cycle, in the order
 * `[left hind, left fore, right hind, right fore]`.
 *
 * - `walk`: the four-beat lateral sequence. Fore legs are half a cycle apart
 *   and so are the hind (never ipsilateral), and three feet are down at any
 *   instant, so a frozen frame does not float.
 * - `pace`: the lateral amble of a camel, both legs on one side together,
 *   offset by a twelfth so the animal is on two or three feet, not always two.
 */
export const GAITS = {
  walk: [0, 0.25, 0.5, 0.75],
  pace: [0, 0.08, 0.5, 0.58],
} as const;

export type GaitName = keyof typeof GAITS;

/** Index into a leg array: the order `GAITS` is written in. */
export const LEG_ORDER = ['left-hind', 'left-fore', 'right-hind', 'right-fore'] as const;
