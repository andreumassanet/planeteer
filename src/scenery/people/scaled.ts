import { createSoftKit, type SoftKit } from '../../soft.ts';
import type { Group, SceneryContext } from '../contract.ts';
import type { Figure } from './figure.ts';
import type { Garment, Headwear } from './look.ts';

/**
 * Which hats take the hair over.
 *
 * A hat that covers the hair *replaces* it. The alternative — a beanie built a
 * hair's breadth outside the hair it covers — is two nearly coplanar surfaces,
 * and `OutlineEffect` hulls each mesh separately, so the outer one loses the
 * depth test and draws no ink at all.
 */
export const COVERS_HAIR: ReadonlySet<Headwear> = new Set<Headwear>([
  'beanie',
  'hood',
  'scarf',
  'turban',
  'helmet',
]);

/** Garments that replace the legs with a hem, so no trousers are built. */
export const HIDES_LEGS: ReadonlySet<Garment> = new Set<Garment>(['robe']);

/** `Figure`, scaled to one person. Nothing below multiplies by `k` twice. */
export interface Scaled {
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

export interface Bones {
  /** Everything above the hip, so it leans as one piece. */
  upper: Group;
  /** Top of the head in *upper* coordinates, so a load can sit on it. */
  crownY: number;
}

export function scaleFigure(base: Figure, height: number, girth: number): Scaled {
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
export const CROWD_DETAIL = 0.6;

/** One soft kit per context, so a crowd shares the context's material cache. */
export const softKits = new WeakMap<SceneryContext, SoftKit>();
export function softOf(ctx: SceneryContext): SoftKit {
  let kit = softKits.get(ctx);
  if (kit === undefined) {
    kit = createSoftKit(ctx.toon, CROWD_DETAIL);
    softKits.set(ctx, kit);
  }
  return kit;
}
