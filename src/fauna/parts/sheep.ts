/**
 * The sheep, the smallest animal in the kit. Read as a pale lozenge with a dark
 * head and legs, so the budget goes on the fleece (an offset second mass) and
 * the contrast between `coat` and `face`. No horns: most of a flock is ewes.
 */
import { buildAnimal } from '../body.ts';
import { coatFor, atFaunaScale } from '../contract.ts';
import type { Animal, AnimalShape, Coat, FaunaContext, FaunaStyle, Rng } from '../contract.ts';
import { PALETTE } from '../../theme.ts';

const P = PALETTE;

const COATS: Coat[] = [
  { color: P.cream, weight: 7, pale: true },
  { color: P.bone, weight: 5, pale: true },
  { color: P.white, weight: 4, pale: true },
  { color: P.tan, weight: 3, pale: true },
  { color: P.bark, weight: 1 },
];

const shape = (rng: Rng, style: FaunaStyle): AnimalShape => {
  const s = rng.spread(1, 0.05);
  const coat = coatFor(rng, style, COATS);
  return {
    withers: 0.82 * s,
    croup: 0.85 * s,
    bodyLength: 0.90 * s,
    barrelDepth: 0.48 * s,
    barrelWidth: 0.36 * s,
    chestFore: 0.92,

    // Barely a neck: the head comes almost straight off the shoulders.
    neckLength: 0.28 * s,
    neckRise: 0.34,
    neckThick: 0.16 * s,
    headLength: 0.26 * s,
    headDepth: 0.16 * s,
    headWidth: 0.13 * s,
    muzzle: 0.70,
    ear: 0.10 * s,
    earFlare: 1.05,

    legThick: 0.050 * s,
    cannonThick: 0.028 * s,
    foreSwing: 0.26,
    hindSwing: 0.30,
    foreLift: 0.60,
    hindLift: 0.34,

    hump: 0,
    humpAt: 0,
    mane: 0,
    tail: 0.15 * s,
    tailTuft: 0,
    horns: 'none',
    hornSize: 0,
    fleece: rng.range(0.72, 0.95),

    coat,
    under: coat,
    // The dark head and dark legs.
    point: P.bark,
    face: coat === P.bark ? P.bone : P.bark,
  };
};

export const sheep: Animal = {
  id: 'sheep',
  name: 'Sheep',
  kind: 'small',
  size: atFaunaScale([6.44, 2.43, 3.84]),
  gait: 'walk',
  note: 'Everywhere there is grass. The pale lozenge with a dark head.',
  // Quaternius's sheep (Farm Animal Pack, CC0): a fleece and a dark face.
  rigs: [{ id: 'sheep', weight: 1, back: 0.85, slots: { White: 'coat', Black: 'face' } }],
  shape,
  build: (ctx: FaunaContext, rng: Rng, style: FaunaStyle) =>
    buildAnimal(ctx, shape(rng, style), { kind: 'stand' }).group,
};
