/**
 * The title a traveller wears under their name: over another player's head
 * (`peers/label.ts`), on the stage's plate, and wherever the HUD names them.
 */
import type { Appearance } from '../appearance.ts';
import { cosmeticAt } from './catalogue.ts';

/** The title `appearance` wears, or null for none (or one this build has not got). */
export function titleOf(appearance: Pick<Appearance, 'title'>): string | null {
  return cosmeticAt('title', appearance.title)?.name ?? null;
}
