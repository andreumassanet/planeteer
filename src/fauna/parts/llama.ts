/**
 * The llama. The Andes, and nowhere else on the planet — `RANGE` gives it
 * `latin-america` alone, which is the only entry in this kit whose range is a
 * mountain range rather than a continent.
 *
 * It reaches its ground through the *biome* rather than through a country: the
 * high Andes come back `rock` and `steppe` from `biomeAt`, and both of those
 * carry a llama. The pair is the mechanism the fauna is built on — the climate
 * says a llama could live here, the region says only the Andes may.
 *
 * Everything about the silhouette is above the shoulder: a neck two thirds of
 * the standing height, a small head on top of it, and the ears. A llama is a
 * sheep's body carrying a giraffe's arrangement.
 */
import { buildAnimal } from '../body.ts';
import { coatFor, atFaunaScale } from '../contract.ts';
import type { Animal, AnimalShape, Coat, FaunaContext, FaunaStyle, Rng } from '../contract.ts';
import { PALETTE } from '../../theme.ts';

const P = PALETTE;

const COATS: Coat[] = [
  { color: P.cream, weight: 5, pale: true },
  { color: P.brown, weight: 5 },
  { color: P.bark, weight: 3 },
  { color: P.tan, weight: 4, pale: true },
  { color: P.white, weight: 2, pale: true },
];

const shape = (rng: Rng, style: FaunaStyle): AnimalShape => {
  const s = rng.spread(1, 0.05);
  const coat = coatFor(rng, style, COATS);
  return {
    withers: 1.08 * s,
    croup: 1.10 * s,
    bodyLength: 1.02 * s,
    barrelDepth: 0.50 * s,
    barrelWidth: 0.37 * s,
    chestFore: 0.98,

    // Two thirds of the standing height, and nearly upright. This is the animal.
    neckLength: 0.62 * s,
    neckRise: 1.16,
    neckThick: 0.14 * s,
    headLength: 0.28 * s,
    headDepth: 0.16 * s,
    headWidth: 0.12 * s,
    muzzle: 0.78,
    // The bananas. Longer than the head is deep, and they are half of what
    // separates a llama from a small pale horse at any distance at all.
    ear: 0.17 * s,
    earFlare: 0.36,

    legThick: 0.055 * s,
    cannonThick: 0.030 * s,
    foreSwing: 0.28,
    hindSwing: 0.31,
    foreLift: 0.62,
    hindLift: 0.35,

    hump: 0,
    humpAt: 0,
    mane: 0,
    tail: 0.20 * s,
    tailTuft: 0.05 * s,
    horns: 'none',
    hornSize: 0,
    fleece: rng.range(0.45, 0.65),

    coat,
    under: coat === P.cream || coat === P.white ? P.tan : P.cream,
    point: P.bark,
    face: coat === P.bark ? P.tan : P.bark,
  };
};

export const llama: Animal = {
  id: 'llama',
  name: 'Llama',
  kind: 'small',
  size: atFaunaScale([7.09, 2.24, 6.55]),
  gait: 'walk',
  note: 'The high Andes: rock and steppe, in latin-america and nowhere else.',
  // Quaternius's alpaca (Ultimate Animated Animals, CC0), which is the llama's
  // smaller cousin and the only camelid in the pack.
  rigs: [
    { id: 'alpaca', weight: 1, slots: { Main: 'coat', Main_Light: 'under', Main_Dark: 'point', Hooves: 'point', Muzzle: 'face', Eyes_Black: P.ink, Eyes_White: P.white } },
  ],
  shape,
  build: (ctx: FaunaContext, rng: Rng, style: FaunaStyle) =>
    buildAnimal(ctx, shape(rng, style), { kind: 'stand' }).group,
};
