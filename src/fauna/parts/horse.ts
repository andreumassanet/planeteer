/**
 * The horse. The steppe's animal, and the one the world already had a monument
 * to before it had the animal: `monuments.source.json` picked the Genghis Khan
 * Equestrian Statue for *the steppe, and the world's first horse*.
 *
 * What tells a horse from a cow at 30 pixels is three things and none of them
 * is the head: the **crest** along the neck, the **tail of hair** rather than a
 * rope with a switch on it, and a body that is longer than it is tall where a
 * cow is nearly square. All three are in the table.
 */
import { buildAnimal } from '../body.ts';
import { coatFor } from '../contract.ts';
import type { Animal, AnimalShape, Coat, FaunaContext, FaunaStyle, Rng } from '../contract.ts';
import { PALETTE } from '../../theme.ts';

const P = PALETTE;

const COATS: Coat[] = [
  { color: P.bark, weight: 5 },
  { color: P.brown, weight: 6 },
  { color: P.tan, weight: 4, pale: true },
  { color: P.bone, weight: 2, pale: true },
  { color: P.cream, weight: 2, pale: true },
  { color: P.clay, weight: 3 },
];

const shape = (rng: Rng, style: FaunaStyle): AnimalShape => {
  const s = rng.spread(1, 0.05);
  const coat = coatFor(rng, style, COATS);
  // Mane, tail and legs. A dark-pointed bay is the commonest horse there is,
  // and on a dark coat the points go pale instead, which is a grey or a dun.
  const point = coat === P.bark || coat === P.brown ? P.steel : P.bark;
  return {
    withers: 1.54 * s,
    croup: 1.52 * s,
    bodyLength: 1.62 * s,
    barrelDepth: 0.72 * s,
    barrelWidth: 0.47 * s,
    chestFore: 1.06,

    neckLength: 0.72 * s,
    neckRise: 0.62,
    neckThick: 0.22 * s,
    // Long and narrow, which is the one part of a horse's head that reads.
    headLength: 0.60 * s,
    headDepth: 0.28 * s,
    headWidth: 0.17 * s,
    muzzle: 0.74,
    // Up and close together, where a cow's go out sideways.
    ear: 0.14 * s,
    earFlare: 0.32,

    legThick: 0.088 * s,
    cannonThick: 0.042 * s,
    foreSwing: 0.30,
    hindSwing: 0.34,
    foreLift: 0.70,
    hindLift: 0.40,

    hump: 0,
    humpAt: 0,
    mane: rng.range(0.12, 0.16) * s,
    tail: 0.62 * s,
    // Nearly as long as the dock it hangs from: a horse's tail is hair, and the
    // silhouette is a fall rather than a switch.
    tailTuft: 0.46 * s,
    horns: 'none',
    hornSize: 0,
    fleece: 0,

    coat,
    under: coat === P.bone || coat === P.cream ? P.tan : P.brown,
    point,
    face: coat,
  };
};

export const horse: Animal = {
  id: 'horse',
  name: 'Horse',
  kind: 'large',
  size: [12.64, 2.55, 8.06],
  gait: 'walk',
  note: 'Steppe and grassland everywhere. The crest and the tail are what read.',
  shape,
  build: (ctx: FaunaContext, rng: Rng, style: FaunaStyle) =>
    buildAnimal(ctx, shape(rng, style), { kind: 'stand' }).group,
};
