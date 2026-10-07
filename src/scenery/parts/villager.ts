import type { ScenicPart } from '../contract.ts';
import { BODY_SCALE } from '../../stature.ts';
import { lookFor } from '../dress.ts';
import { buildPerson } from '../people.ts';

/**
 * A person, of whatever kind the seed makes them.
 *
 * The file is thin on purpose: every decision is in `people.ts` (the body) and
 * `dress.ts` (who they are and what they wear), and this is the adaptor that
 * lets the registry and `validatePart` see a person as one
 * more part in the kit.
 *
 * **The `person` kind is not a `dwelling` with a low cap.** It has its own row
 * in `KINDS` for one reason worth stating: a person is the only part in the kit
 * whose size is set by something outside the kit. Everything else is authored in
 * `STOREY`s at `SCENERY_SCALE`; a person is authored against `AVATAR_HEIGHT`,
 * which was three times that until 2026-09-24 and is 1.7 times it since
 * (`STATURE` in `stature.ts`). Give
 * them the `dwelling` budget and a change to the house scale silently changes
 * the population with it.
 *
 * **Read the card at the distance where a person is 53 pixels, not 159** — 120
 * and 40 units while a person was 6.8 units, 39 and 13 now. At 159 pixels
 * everything works; at 53 the read collapses to five things —
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
   * on this file that surprised the measurement. Measured on the neutral 6.8-unit
   * body of the time, and declared in its units times `BODY_SCALE`, it
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
  footprint: 3.0 * BODY_SCALE,
  note: 'One adult. Body, face and hair from the seed; clothes from the region and the weather.',

  build(ctx, rng, style) {
    return buildPerson(ctx, lookFor(rng, style.id));
  },
};
