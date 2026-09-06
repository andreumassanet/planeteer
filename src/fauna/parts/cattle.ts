/**
 * Cattle. The animal most of the world's grazing actually is.
 *
 * `CLAUDE.md` refused to build a quadruped with the sentence *a bad cow is worse
 * than no cow*, so this is the file that sentence is about. It is the kit's
 * baseline in the literal sense: it stands in nine of the ten biomes that carry
 * anything at all, and the camel, the llama and the reindeer say *where you are*
 * only because a cow is what you would otherwise be looking at.
 *
 * One shape covers the dairy cow, the beef cow and the zebu, and the lever is
 * the hump — seeded, never absent, because a feature that moves the bounding box
 * has to be always there or small and this one is neither. A European cow gets a
 * withers you would call a wither; a Sahelian one gets a fist of muscle over it.
 */
import { buildAnimal } from '../body.ts';
import { coatFor } from '../contract.ts';
import type { Animal, AnimalShape, Coat, FaunaContext, FaunaStyle, Rng } from '../contract.ts';
import { PALETTE } from '../../theme.ts';

const P = PALETTE;

/**
 * Coats.
 *
 * Solid colours only, and the reason is the ink rather than the palette: a
 * Friesian's patches would be a second mesh laid flush on the barrel, which is
 * the coplanar trap word for word — `OutlineEffect` hulls each mesh separately,
 * so a patch flush with the hide loses the depth test and draws as a colour
 * blotch with no line round it. A patched cow wants the barrel *built* in two
 * pieces, which is 24 triangles for a mark that is four pixels across at the
 * distance a herd is seen. It is not built.
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
  // One uniform draw over the whole beast, so the declared box moves by 5% and
  // the proportions inside it do not. A herd's variety is per instance — yaw and
  // a baked scale — and per variant in the features, never in a stretch that
  // would make one cow a different animal.
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
    // Straight out sideways, which is a cow's one unmistakable feature from the
    // front and the only thing that tells her from a small horse at 30 pixels.
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
  size: [11.97, 3.36, 6.36],
  gait: 'walk',
  note: 'The world\'s baseline grazer: nine biomes, every region, a seeded zebu hump.',
  shape,
  build: (ctx: FaunaContext, rng: Rng, style: FaunaStyle) =>
    buildAnimal(ctx, shape(rng, style), { kind: 'stand' }).group,
};
