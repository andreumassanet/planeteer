import type { ScenicPart } from '../contract.ts';
import { BODY_SCALE } from '../../stature.ts';
import { lookFor } from '../dress.ts';
import { buildPerson } from '../people.ts';

/**
 * A child, a second part rather than an option on the first because the kit's
 * one per-instance freedom is a uniform scale, and shrinking an adult gives a
 * dwarf: the head has to keep most of its size while the body loses it.
 * `CHILD_BODY` in `people.ts` is the second set of proportions (about 3.2 heads
 * tall against an adult's 4, legs at 39% of the height instead of 44%).
 *
 * It is also how a settlement says how many: a weighted list of part ids is
 * how everything else in this kit does (see `CROWD_MIX` in `dress.ts`). A child
 * is dressed from the same regional wardrobe as everyone else, with no beard
 * and nothing carried but a small pack (drawn in `dress.ts`).
 */
export const child: ScenicPart = {
  id: 'child',
  name: 'Child',
  kind: 'person',
  // The adult's 2.9 scaled by the tallest child over the tallest adult, then
  // measured rather than trusted: the worst of 2,800 builds is 1.82.
  footprint: 2.0 * BODY_SCALE,
  note: 'One child: bigger head, shorter legs, the same wardrobe. Not an adult scaled down.',

  build(ctx, rng, style) {
    return buildPerson(ctx, lookFor(rng, style.id, { age: 'child' }));
  },
};
