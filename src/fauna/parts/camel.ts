/**
 * The camel. The animal the user actually asked for.
 *
 * *"en el desierto podria haber camellos."* One shape covers the dromedary and
 * the Bactrian, because at the distance a herd is seen the second hump is two
 * pixels and everything else about them is the same animal: the long rising
 * neck, the small head, the narrow slab of a body, and legs that are half the
 * standing height.
 *
 * **It is the one animal in the kit that does not walk.** `gait: 'pace'` moves
 * both legs on one side together, which is what a camel does and what makes it
 * roll — and it costs one field in this file and not one triangle. See `GAITS`.
 */
import { buildAnimal } from '../body.ts';
import { coatFor } from '../contract.ts';
import type { Animal, AnimalShape, Coat, FaunaContext, FaunaStyle, Rng } from '../contract.ts';
import { PALETTE } from '../../theme.ts';

const P = PALETTE;

/** Every camel is a shade of the ground it stands on, which is the whole point of one. */
const COATS: Coat[] = [
  { color: P.sand, weight: 6, pale: true },
  { color: P.tan, weight: 5, pale: true },
  { color: P.brown, weight: 3 },
  { color: P.cream, weight: 2, pale: true },
  { color: P.bark, weight: 1 },
];

const shape = (rng: Rng, style: FaunaStyle): AnimalShape => {
  const s = rng.spread(1, 0.05);
  const coat = coatFor(rng, style, COATS);
  return {
    // 1.9 m at the shoulder, and the hump takes it past two. A camel is the
    // only animal here taller than the 1.8 m person the scale is built on.
    withers: 1.88 * s,
    croup: 1.76 * s,
    bodyLength: 1.58 * s,
    barrelDepth: 0.80 * s,
    // Narrow. A camel seen head on is a plank, and the narrowness is half of
    // why it reads as a camel from any angle at all.
    barrelWidth: 0.50 * s,
    chestFore: 1.0,

    neckLength: 1.02 * s,
    // Steep. A camel's neck is an S and this rig has one joint, so the rise is
    // set where the *head height* lands right rather than where the base angle
    // does: 0.95 rad puts the head at 2.5 m, which is where a camel's is.
    neckRise: 0.95,
    neckThick: 0.20 * s,
    headLength: 0.48 * s,
    headDepth: 0.26 * s,
    headWidth: 0.18 * s,
    muzzle: 0.92,
    ear: 0.09 * s,
    earFlare: 0.9,

    legThick: 0.092 * s,
    cannonThick: 0.046 * s,
    foreSwing: 0.30,
    hindSwing: 0.32,
    foreLift: 0.66,
    hindLift: 0.36,

    hump: rng.range(0.38, 0.50) * s,
    humpAt: 0.36,
    mane: 0,
    tail: 0.58 * s,
    tailTuft: 0.15 * s,
    horns: 'none',
    hornSize: 0,
    // The shoulder ruff, which is what stops a camel reading as a smooth sack
    // on stilts. Small: 0.18 of the barrel, not a fleece.
    fleece: 0.18,

    coat,
    under: coat === P.cream ? P.tan : P.cream,
    point: P.bark,
    face: coat,
  };
};

export const camel: Animal = {
  id: 'camel',
  name: 'Camel',
  kind: 'large',
  size: [12.15, 2.82, 10.79],
  gait: 'pace',
  note: 'Desert and dry steppe of the Old World. The only pacer in the kit.',
  // No CC0 camel exists in the style; this is Quaternius's horse (Ultimate
  // Animated Animals, CC0) with a hump grown on its back at bake time
  // (`scripts/build-kit.ts`). The mane goes the colour of the hide.
  rigs: [
    { id: 'camel', weight: 1, slots: { Main: 'coat', Main_Dark: 'dark', Main_Light: 'under', Hair: 'coat', Hooves: 'point', Muzzle: 'point', Eye_White: P.white, Eye_Black: P.ink } },
  ],
  shape,
  build: (ctx: FaunaContext, rng: Rng, style: FaunaStyle) =>
    buildAnimal(ctx, shape(rng, style), { kind: 'stand' }).group,
};
