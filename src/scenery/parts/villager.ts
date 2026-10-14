import type { ScenicPart } from '../contract.ts';
import { BODY_SCALE } from '../../stature.ts';
import { lookFor } from '../dress.ts';
import { buildPerson } from '../people.ts';

/**
 * A person, of whatever kind the seed makes them.
 *
 * Thin on purpose: every decision is in `people.ts` (the body) and `dress.ts`
 * (who they are and what they wear), and this adapts a person to the registry
 * and `validatePart`.
 *
 * The `person` kind has its own row in `KINDS` because a person is the only
 * part whose size is set outside the kit: everything else is authored in
 * `STOREY`s at `SCENERY_SCALE`, a person against `AVATAR_HEIGHT` (1.7 times it,
 * `STATURE` in `stature.ts`). Give them the `dwelling` budget and a change to
 * the house scale would silently change the population.
 *
 * Read the card at the distance where a person is 53 pixels (39 and 13 units):
 * the read collapses to height, the hat, the hem and the two colours of the
 * garment, which is what the file spends its budget on. Nine people in a row is
 * the only view in which a repeat is visible.
 */
export const villager: ScenicPart = {
  id: 'villager',
  name: 'Villager',
  kind: 'person',
  /**
   * A person's footprint is a pose, not a body. Measured on the neutral body and
   * declared in its units times `BODY_SCALE`, it reaches 1.94 units standing and
   * 2.52 talking (one arm up and out is worth more than the rest of the figure),
   * with `stride` at 2.42, `carry` at 2.20, `rest` at 2.16 and `lift` at 2.13.
   * Swept over 1,680 builds across all fourteen wardrobes the worst is 2.87, a
   * tall person mid-sentence. It is declared at the reach of the widest pose;
   * even the largest person fits everywhere a shrub does.
   */
  footprint: 3.0 * BODY_SCALE,
  note: 'One adult. Body, face and hair from the seed; clothes from the region and the weather.',

  build(ctx, rng, style) {
    return buildPerson(ctx, lookFor(rng, style.id));
  },
};
