import type { ScenicPart } from '../contract.ts';
import { lookFor } from '../dress.ts';
import { buildPerson } from '../people.ts';

/**
 * A person, of whatever kind the seed makes them.
 *
 * The file is thin on purpose: every decision is in `people.ts` (the body) and
 * `dress.ts` (who they are and what they wear), and this is the adaptor that
 * lets the registry, the review sheet and `validatePart` see a person as one
 * more part in the kit.
 *
 * **The `person` kind is not a `dwelling` with a low cap.** It has its own row
 * in `KINDS` for one reason worth stating: a person is the only part in the kit
 * whose size is set by something outside the kit. Everything else is authored in
 * `STOREY`s at `SCENERY_SCALE`; a person is authored against `AVATAR_HEIGHT`,
 * which is three times that. Give them the `dwelling` budget and the first
 * change to the house scale silently makes the population two units tall.
 *
 * **Read the card at 120 units, not at 40.** At 40 a person is 159 pixels and
 * everything works; at 120 they are 53 and the read collapses to five things —
 * height, the hat, the hem, and the two colours of the garment. Those are the
 * five the whole file spends its budget on, and the review that matters is the
 * cluster: nine people in a row is the only view in which a repeat is visible.
 */
export const villager: ScenicPart = {
  id: 'villager',
  name: 'Villager',
  kind: 'person',
  /**
   * **A person's footprint is a pose, not a body**, and that is the one number
   * on this file that surprised the measurement. The same neutral 6.8-unit body
   * reaches 1.94 units standing and **2.52 talking** — one arm up and out is
   * worth more than the whole rest of the figure — with `stride` at 2.42,
   * `carry` at 2.20, `rest` at 2.16 and `lift` at 2.13 in between. Swept over
   * 1,680 builds across all fourteen wardrobes the worst is 2.87, a tall person
   * mid-sentence.
   *
   * So it is declared at the reach of the widest pose rather than the widest
   * body. Nothing in the kit minds: a plot is `pitch * [0.5, 0.88]` against a
   * 13-to-27-unit pitch, so even the largest person fits everywhere a shrub
   * does.
   */
  footprint: 3.0,
  note: 'One adult. Body, face and hair from the seed; clothes from the region and the weather.',

  build(ctx, rng, style) {
    return buildPerson(ctx, lookFor(rng, style.id));
  },
};
