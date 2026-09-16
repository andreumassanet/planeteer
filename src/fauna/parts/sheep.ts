/**
 * The sheep. The smallest thing in the kit, and therefore the one the pixel
 * arithmetic is actually about.
 *
 * A sheep is **1.3 m nose to tail, which is 4.9 world units and 15 pixels at
 * 300** — two above the gull that `life.ts`'s traps call *a bird*, and the
 * measurement that says nothing in this kit needs the monument crop. See
 * `LEGIBILITY` in the contract.
 *
 * At 15 pixels a sheep is a pale lozenge with a dark head and four dark stalks,
 * and that is exactly what one is. So the whole budget goes on the fleece — an
 * offset second mass over the barrel, 24 triangles, without which the silhouette
 * is a shaved animal — and on the contrast between `coat` and `face`. There are
 * no horns: an ewe has none, most flocks are ewes, and 48 triangles of ram's
 * curl would be a mark two pixels across at the distance a flock is seen. The
 * curl is in `body.ts` and nothing in the kit calls for it yet.
 */
import { buildAnimal } from '../body.ts';
import { coatFor } from '../contract.ts';
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

    // Barely a neck. A sheep's head comes almost straight off its shoulders and
    // giving it one is the fastest way to build a small goat.
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
    // The dark head and dark legs. On a 15-pixel animal this is the only mark
    // there is, and it is the whole difference between a sheep and a stone.
    point: P.bark,
    face: coat === P.bark ? P.bone : P.bark,
  };
};

export const sheep: Animal = {
  id: 'sheep',
  name: 'Sheep',
  kind: 'small',
  size: [6.44, 2.43, 3.84],
  gait: 'walk',
  note: 'Everywhere there is grass. The pale lozenge with a dark head.',
  // Quaternius's sheep (Farm Animal Pack, CC0): a fleece and a dark face.
  rigs: [{ id: 'sheep', weight: 1, slots: { White: 'coat', Black: 'face' } }],
  shape,
  build: (ctx: FaunaContext, rng: Rng, style: FaunaStyle) =>
    buildAnimal(ctx, shape(rng, style), { kind: 'stand' }).group,
};
