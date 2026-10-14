/**
 * Cattle: the baseline grazing animal, standing in nine of the ten biomes that
 * carry anything. One shape covers the dairy cow, the beef cow and the zebu;
 * the lever is the seeded hump, from a European withers to a Sahelian fist of
 * muscle.
 */
import { buildAnimal } from '../body.ts';
import { coatFor, atFaunaScale } from '../contract.ts';
import type { Animal, AnimalShape, Coat, FaunaContext, FaunaStyle, Rng } from '../contract.ts';
import { PALETTE } from '../../theme.ts';

const P = PALETTE;

/**
 * Coats, solid colours only: a patch laid flush on the barrel would be
 * coplanar and draw with no ink line round it.
 */
const COATS: Coat[] = [
  { color: P.brown, weight: 6 },
  { color: P.bark, weight: 4 },
  { color: P.tan, weight: 4, pale: true },
  { color: P.cream, weight: 3, pale: true },
  { color: P.clay, weight: 3 },
  { color: P.bone, weight: 2, pale: true },
];

const shape = (rng: Rng, style: FaunaStyle): AnimalShape => {
  // One uniform scale over the whole beast: the box moves by 5%, the
  // proportions do not.
  const s = rng.spread(1, 0.05);
  const coat = coatFor(rng, style, COATS);
  return {
    withers: 1.36 * s,
    croup: 1.40 * s,
    bodyLength: 1.52 * s,
    barrelDepth: 0.80 * s,
    barrelWidth: 0.58 * s,
    chestFore: 0.94,

    neckLength: 0.60 * s,
    neckRise: 0.06,
    neckThick: 0.25 * s,
    headLength: 0.50 * s,
    headDepth: 0.30 * s,
    headWidth: 0.23 * s,
    muzzle: 0.86,
    // Straight out sideways, which tells a cow from a small horse.
    ear: 0.21 * s,
    earFlare: 1.28,

    legThick: 0.105 * s,
    cannonThick: 0.052 * s,
    foreSwing: 0.26,
    hindSwing: 0.30,
    foreLift: 0.62,
    hindLift: 0.34,

    hump: rng.range(0.11, 0.17) * s,
    humpAt: 0.06,
    mane: 0,
    tail: 0.78 * s,
    tailTuft: 0.20 * s,
    horns: 'cow',
    hornSize: 0.26,
    fleece: 0,

    coat,
    under: coat === P.cream || coat === P.bone ? P.tan : P.blush,
    point: P.bark,
    face: coat,
  };
};

export const cattle: Animal = {
  id: 'cattle',
  name: 'Cattle',
  kind: 'large',
  size: atFaunaScale([11.97, 3.36, 6.36]),
  gait: 'walk',
  note: 'The world\'s baseline grazer: nine biomes, every region, a seeded zebu hump.',
  // Quaternius's cow, and its bull as the darker one in five (Ultimate Animated
  // Animals, CC0). The muzzle takes the belly's colour.
  rigs: [
    { id: 'cow', weight: 4, back: 1.4, slots: { Main: 'coat', Main_Light: 'under', Muzzle: 'under', Hooves: 'point', Horns: P.bone, Eye_Black: P.ink, Eye_White: P.white } },
    { id: 'bull', weight: 1, back: 1.5, slots: { Main: 'coat', Main_Light: 'under', Muzzle: 'point', Hooves: 'point', Horns: P.bone, Eye_Black: P.ink, Eye_White: P.white } },
  ],
  shape,
  build: (ctx: FaunaContext, rng: Rng, style: FaunaStyle) =>
    buildAnimal(ctx, shape(rng, style), { kind: 'stand' }).group,
};
