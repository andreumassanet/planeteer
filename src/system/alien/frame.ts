import type { Morph } from '../contract.ts';

/**
 * Every length a builder needs, in world units, derived from the `Morph`'s
 * shares and one height.
 *
 * It is a derivation and not a table for the reason `scaleFigure` is one on
 * Earth: a species is a set of *ratios*, and a member of it is one number. Two
 * tables would be two places for a shoulder to be.
 */
export interface Frame {
  height: number;
  head: number;
  neck: number;
  shoulder: number;
  hip: number;
  ankle: number;
  thigh: number;
  shin: number;
  upperArm: number;
  forearm: number;
  hand: number;
  shoulderHalf: number;
  hipHalf: number;
  depth: number;
  headHalf: number;
  limbR: number;
  legX: number;
  armX: number;
}

const NECK_SHARE: Record<Morph['neck'], number> = {
  none: 0.005,
  short: 0.035,
  long: 0.09,
  stalk: 0.16,
};

export function frameOf(morph: Morph, height: number, girth: number): Frame {
  const head = height / morph.heads;
  const chin = height - head;
  const neck = height * NECK_SHARE[morph.neck];
  const shoulder = chin - neck;
  const hip = height * morph.legShare;
  // The ankle is what the foot fills; the two long bones share what is left,
  // and the thigh takes the larger share because on every body that walks it
  // does.
  const ankle = hip * 0.09;
  const thigh = (hip - ankle) * 0.53;
  const shin = (hip - ankle) * 0.47;
  const armSpan = shoulder - hip * 0.62;
  const shoulderHalf = height * morph.shoulderShare * girth;
  const hipHalf = height * morph.hipShare * girth;
  // A big head is a round one: under about three and a half heads to the body
  // the skull widens toward a ball, which is what turns a Floater's head into
  // the bag it is meant to be rather than a tall box with eyes.
  const round = Math.min(1, Math.max(0, (3.5 - morph.heads) / 1.2));
  return {
    height,
    head,
    neck,
    shoulder,
    hip,
    ankle,
    thigh,
    shin,
    upperArm: armSpan * 0.5,
    forearm: armSpan * 0.38,
    hand: armSpan * 0.12,
    shoulderHalf,
    hipHalf,
    depth: height * morph.shoulderShare * morph.depth * girth,
    headHalf: head * (0.3 + 0.12 * round),
    limbR: height * morph.limbR * girth,
    legX: hipHalf * 0.55,
    armX: shoulderHalf * 0.94,
  };
}
