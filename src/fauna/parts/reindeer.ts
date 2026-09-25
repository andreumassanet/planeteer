/**
 * The reindeer, which is also the caribou — one species, `Rangifer tarandus`,
 * circumpolar. That is why `RANGE` puts it in `north-america` as well as in
 * `nordic`, `polar`, `east-europe` and `east-asia`, and why it is not in
 * Scotland.
 *
 * It is here because the north was empty. `tundra` and `boreal` between them are
 * a great deal of the planet's land and neither carried an animal that belonged
 * there — a cow on the Finnmark plateau is a cow in the wrong place, and an
 * empty plateau was all there was.
 *
 * **The antlers are the whole model.** At 30 pixels a reindeer is a brown lozenge
 * that could be anything, plus a pair of swept beams that could be nothing else,
 * so they are unconditional and they are `bone` — the one pale mark on a dark
 * animal, which is what makes them read against a dark boreal ground.
 */
import { buildAnimal } from '../body.ts';
import { coatFor, atFaunaScale } from '../contract.ts';
import type { Animal, AnimalShape, Coat, FaunaContext, FaunaStyle, Rng } from '../contract.ts';
import { PALETTE } from '../../theme.ts';

const P = PALETTE;

const COATS: Coat[] = [
  { color: P.brown, weight: 6 },
  { color: P.bark, weight: 5 },
  { color: P.tan, weight: 3, pale: true },
  { color: P.bone, weight: 2, pale: true },
];

const shape = (rng: Rng, style: FaunaStyle): AnimalShape => {
  const s = rng.spread(1, 0.05);
  const coat = coatFor(rng, style, COATS);
  return {
    withers: 1.16 * s,
    croup: 1.10 * s,
    bodyLength: 1.22 * s,
    barrelDepth: 0.58 * s,
    barrelWidth: 0.40 * s,
    chestFore: 1.04,

    neckLength: 0.46 * s,
    neckRise: 0.36,
    // Thick, and it is not padding: a reindeer's neck is as deep as its head is
    // long, and a thin one gives a deer.
    neckThick: 0.20 * s,
    headLength: 0.38 * s,
    headDepth: 0.20 * s,
    headWidth: 0.14 * s,
    muzzle: 0.88,
    ear: 0.10 * s,
    earFlare: 0.75,

    legThick: 0.060 * s,
    cannonThick: 0.034 * s,
    foreSwing: 0.30,
    hindSwing: 0.33,
    foreLift: 0.68,
    hindLift: 0.38,

    // The shoulder hump every deer has and nobody draws.
    hump: 0.07 * s,
    humpAt: 0.08,
    mane: 0,
    tail: 0.13 * s,
    tailTuft: 0,
    horns: 'antler',
    // Fixed rather than seeded, and it is the trap about a feature that moves
    // the bounding box: at 0.30 to 0.46 the declared height would drift 14%,
    // which is wider than a declaration is allowed to be, and widening it hands
    // a placer a reindeer a fifth smaller than the space it reserved.
    hornSize: 0.38,
    fleece: 0.35,

    coat,
    under: P.bone,
    point: P.bone,
    face: coat,
  };
};

export const reindeer: Animal = {
  id: 'reindeer',
  name: 'Reindeer',
  kind: 'small',
  size: atFaunaScale([9.10, 2.23, 6.42]),
  gait: 'walk',
  note: 'Tundra and boreal forest, circumpolar. The antlers are the model.',
  // Quaternius's stag (Ultimate Animated Animals, CC0), antlers and all. Its
  // slots are unnamed in the pack: the main hide, the pale belly, the dark
  // hooves, the antlers and the eyes, read off their colours.
  rigs: [
    { id: 'stag', weight: 1, back: 1.15, slots: { Material: 'coat', 'Material.003': 'under', 'Material.001': 'dark', 'Material.010': 'point', 'Material.011': P.ink } },
  ],
  shape,
  build: (ctx: FaunaContext, rng: Rng, style: FaunaStyle) =>
    buildAnimal(ctx, shape(rng, style), { kind: 'stand' }).group,
};
