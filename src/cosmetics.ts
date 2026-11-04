/**
 * What a traveller earns to wear: hats, something on the back, a trail, a
 * title under the name, a parachute canopy and a companion.
 *
 * The catalogue (`cosmetics/catalogue.ts`) is every item with its stable id,
 * its wire index and what earns it; the look (`appearance.ts`) carries only
 * which index of each slot is worn, so the others see it with nothing new on
 * the wire. What is earned is a pure function of the progression's summary
 * (`unlockedOf`), which the progression hands in; the card lets a traveller
 * wear only what that says and try the rest on.
 *
 * Hats and back pieces are code-built in the world's style and measured to
 * the body they go on (`cosmetics/fit.ts`, `hats.ts`, `back.ts`), hung on its
 * bones whenever a person is dressed from a look (`wearCosmetics`: the hero,
 * the other players, the card's pictures). Trails are one pool of particles
 * for every traveller near (`createTrails`); a title is drawn under a name
 * (`titleOf`); a canopy is the parachute's colours (`cosmetics/canopy.ts`);
 * the companion trots after its traveller (`createCompanions`).
 *
 * Which unlocked items have been looked at is kept on this device
 * (`SEEN_KEY`), so the card can mark what is new.
 */
import type { Appearance } from './appearance.ts';
import { BY_SLOT, COSMETICS, COSMETIC_SLOTS, cosmeticAt, cosmeticById, type Cosmetic, type CosmeticSlot } from './cosmetics/catalogue.ts';
import { NO_PROGRESS, earned, unlockBadge, unlockText, type ConditionNames, type UnlockSummary } from './cosmetics/unlocks.ts';

export { BACKS, BY_SLOT, CANOPIES, COSMETICS, COSMETIC_SLOTS, HATS, PETS, TITLES, TRAILS, cosmeticAt, cosmeticById } from './cosmetics/catalogue.ts';
export type { Cosmetic, CosmeticSlot } from './cosmetics/catalogue.ts';
export { MILESTONE_NAMES, NO_PROGRESS, QUEST_NAMES, earned, unlockBadge, unlockText } from './cosmetics/unlocks.ts';
export type { ConditionNames, Unlock, UnlockSummary } from './cosmetics/unlocks.ts';
export { titleOf } from './cosmetics/titles.ts';
export { canopyCell } from './cosmetics/canopy.ts';
export { HATLESS_HEADS, takesHat } from './cosmetics/fit.ts';
export { cosmeticMeshes, shedCosmetics, stowCosmetics, wearCosmetics } from './cosmetics/worn.ts';
export { MAX_TRAIL_PARTICLES, TRAIL_KINDS, TRAIL_REACH, createTrails } from './cosmetics/trails.ts';
export type { TrailEmitter, Trails, TrailStats } from './cosmetics/trails.ts';
export { COMPANION_REACH, MAX_COMPANIONS, createCompanions } from './cosmetics/companions.ts';
export type { Companions, CompanionTraveller } from './cosmetics/companions.ts';

/** Every item `summary` has earned, by id: the free ones whatever it says. */
export function unlockedOf(summary: UnlockSummary = NO_PROGRESS): Set<string> {
  return new Set(COSMETICS.filter((item) => earned(item.unlock, summary)).map((item) => item.id));
}

/** The items worn free from the start: what is unlocked with no progress at all. */
export const FREE_IDS: ReadonlySet<string> = new Set(COSMETICS.filter((item) => item.unlock.kind === 'free').map((item) => item.id));

/** What to do to earn `item`: "Reach level 8", "Gold in Globetrotter", "Finish The Explorer's Path". */
export function conditionText(item: Cosmetic, names?: ConditionNames): string {
  return unlockText(item.unlock, names);
}

/** The same, short enough for a tile. */
export function conditionBadge(item: Cosmetic, names?: ConditionNames): string {
  return unlockBadge(item.unlock, names);
}

/** The look's field for each slot. */
export const SLOT_FIELD: Readonly<Record<CosmeticSlot, 'hat' | 'back' | 'trail' | 'title' | 'canopy' | 'pet'>> = {
  hat: 'hat',
  back: 'back',
  trail: 'trail',
  title: 'title',
  canopy: 'canopy',
  pet: 'pet',
};

/** What `appearance` wears, slot by slot, of the catalogue. */
export function wornItems(appearance: Appearance): Cosmetic[] {
  return COSMETIC_SLOTS.map((slot) => cosmeticAt(slot, appearance[SLOT_FIELD[slot]])).filter((item): item is Cosmetic => item !== null);
}

/** `appearance` with anything it wears that `unlocked` does not hold taken off: a look from elsewhere, worn here. */
export function withoutLocked(appearance: Appearance, unlocked: ReadonlySet<string>): Appearance {
  const out = { ...appearance };
  for (const slot of COSMETIC_SLOTS) {
    const item = cosmeticAt(slot, out[SLOT_FIELD[slot]]);
    if (item !== null && !unlocked.has(item.id)) out[SLOT_FIELD[slot]] = 0;
  }
  return out;
}

/** The earned part of a look, to keep when the rest is changed (a random traveller, say). */
export function cosmeticsOf(appearance: Appearance): Pick<Appearance, 'hat' | 'hatColour' | 'back' | 'trail' | 'title' | 'canopy' | 'pet'> {
  const { hat, hatColour, back, trail, title, canopy, pet } = appearance;
  return { hat, hatColour, back, trail, title, canopy, pet };
}

/** What is in `after` and was not in `before`: what has just been earned, in catalogue order. */
export function newlyUnlocked(before: ReadonlySet<string>, after: ReadonlySet<string>): Cosmetic[] {
  return COSMETICS.filter((item) => after.has(item.id) && !before.has(item.id));
}

/** Where the device keeps the ids of the unlocked items already looked at. */
export const SEEN_KEY = 'atlas.cosmetics.seen.v1';

/** The ids looked at on this device. Never throws. */
export function seenCosmetics(): Set<string> {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(SEEN_KEY);
    const list: unknown = raw === null ? [] : JSON.parse(raw);
    return new Set(Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string' && cosmeticById(id) !== undefined) : []);
  } catch {
    return new Set();
  }
}

/** Marks `ids` as looked at; private mode keeps them for this visit. */
export function markSeen(ids: Iterable<string>): void {
  const seen = seenCosmetics();
  const before = seen.size;
  for (const id of ids) if (cosmeticById(id) !== undefined) seen.add(id);
  if (seen.size === before) return;
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
  } catch {
    // Storage refused: the dots come back next visit.
  }
}

/** Unlocked items not looked at yet, the free ones never among them: what the card marks as new. */
export function freshOf(unlocked: ReadonlySet<string>, seen: ReadonlySet<string> = seenCosmetics()): Cosmetic[] {
  return COSMETICS.filter((item) => unlocked.has(item.id) && !FREE_IDS.has(item.id) && !seen.has(item.id));
}

/** A slot's items, in the order the card shows them. */
export const itemsOf = (slot: CosmeticSlot): readonly Cosmetic[] => BY_SLOT[slot];
