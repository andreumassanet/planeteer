import type { ScenicPart } from '../contract.ts';
import { lookFor } from '../dress.ts';
import { buildPerson } from '../people.ts';

/**
 * A child, and the reason it is a second part rather than an option on the
 * first is mechanical.
 *
 * The kit's one per-instance freedom is a **uniform scale**, and a child is
 * exactly the thing a uniform scale cannot make: shrink an adult and you get a
 * dwarf, because the head has to keep most of its size while the body loses it.
 * `CHILD_BODY` in `people.ts` is that second set of proportions — about 3.2
 * heads tall against an adult's 4, with the legs at 39% of the height instead of
 * 44% — so a child is a different family and gets its own id.
 *
 * The second reason is the placer's: a settlement wants to say *how many*, and a
 * weighted list of part ids is how everything else in this kit says that. See
 * `CROWD_MIX` in `dress.ts`, which is one ratio for the whole planet and says
 * why.
 *
 * A child is dressed out of the same regional wardrobe as everyone else, with
 * two differences drawn in `dress.ts` rather than here: no beard, and nothing
 * carried but a small pack. A four-unit figure with a water jar on its shoulder
 * is a mistake nobody would have to look twice at.
 */
export const child: ScenicPart = {
  id: 'child',
  name: 'Child',
  kind: 'person',
  // The adult's 2.9 scaled by the tallest child over the tallest adult, then
  // measured rather than trusted: the worst of 2,800 builds is 1.82.
  footprint: 2.0,
  note: 'One child: bigger head, shorter legs, the same wardrobe. Not an adult scaled down.',

  build(ctx, rng, style) {
    return buildPerson(ctx, lookFor(rng, style.id, { age: 'child' }));
  },
};
