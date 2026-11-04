/**
 * The creator's pages for what is earned: hats, the back, trails, titles,
 * canopies and the companion (`cosmetics.ts`).
 *
 * Every item has a tile. One not yet earned wears a padlock and says what
 * earns it; picking it tries it on — the stage shows it (`stage.preview`),
 * nothing is worn or sent — and picking anything earned puts the real look
 * back. An earned item nobody has looked at yet has a dot until its page is
 * left (`markSeen`).
 */
import { CLOTH, WARDROBE, type Appearance } from '../appearance.ts';
import {
  FREE_IDS,
  conditionBadge,
  conditionText,
  cosmeticAt,
  freshOf,
  itemsOf,
  markSeen,
  seenCosmetics,
  takesHat,
  type Cosmetic,
  type CosmeticSlot,
} from '../cosmetics.ts';
import { HAT_MODELS } from '../cosmetics/hats.ts';
import type { PortraitFrame } from '../hero-stage.ts';
import { h } from '../ui.ts';
import type { CategoryId } from './categories.ts';
import type { TravellerCtx } from './ctx.ts';
import { onRefresh, section, swatches, tiles } from './parts.ts';
import { paintCanopy, paintNothing, paintPet, paintTitle, paintTrail } from './pictures.ts';
import { change } from './state.ts';
import type { TileSpec } from './types.ts';

type Field = 'hat' | 'back' | 'trail' | 'title' | 'canopy' | 'pet';

/** Which page shows each slot. */
const PAGE_OF: Readonly<Record<CosmeticSlot, CategoryId>> = { hat: 'hat', back: 'pack', trail: 'trail', title: 'title', canopy: 'canopy', pet: 'pet' };

/** What the traveller has earned: the caller's word, or the free items alone. */
export const unlockedIn = (ctx: TravellerCtx): ReadonlySet<string> => ctx.options.unlocked?.() ?? FREE_IDS;

/** Shows `look` on the stage instead of the one worn, or puts the worn one back with null. */
export function tryOn(ctx: TravellerCtx, look: Appearance | null): void {
  ctx.trying = look === null ? null : { ...look };
  ctx.stage.preview(ctx.trying);
}

/** Whether a page has an earned item not yet looked at. */
export function freshIn(ctx: TravellerCtx, category: CategoryId): boolean {
  const seen = seenCosmetics();
  return freshOf(unlockedIn(ctx), seen).some((item) => PAGE_OF[item.slot] === category);
}

/** Marks what a page showed as new as looked at, when it is left. */
export function markPageSeen(ctx: TravellerCtx, category: CategoryId): void {
  const shown = ctx.shownFresh.get(category);
  if (shown === undefined || shown.size === 0) return;
  markSeen(shown);
  shown.clear();
}

/** The tile of `item` (null for nothing) in `field`, on a page that is `category`. */
function itemTile(ctx: TravellerCtx, category: CategoryId, field: Field, item: Cosmetic | null, extra: Partial<TileSpec> = {}): TileSpec {
  const index = item?.index ?? 0;
  const unlocked = unlockedIn(ctx);
  const earned = item === null || unlocked.has(item.id);
  const fresh = item !== null && earned && !FREE_IDS.has(item.id) && !seenCosmetics().has(item.id);
  if (fresh) {
    const shown = ctx.shownFresh.get(category) ?? new Set<string>();
    shown.add(item.id);
    ctx.shownFresh.set(category, shown);
  }
  return {
    key: `${field}-${item?.id ?? 'none'}`,
    label: item?.name ?? 'None',
    title: item === null ? 'Nothing' : earned ? item.name : `${item.name}: ${conditionText(item)}`,
    look: () => ({ ...ctx.look, [field]: index }),
    chosen: () => ctx.look[field] === index,
    trying: () => ctx.trying !== null && ctx.trying[field] === index && ctx.look[field] !== index,
    locked: () => (earned || item === null ? null : conditionBadge(item)),
    fresh: () => fresh,
    pick: () => {
      if (!earned) {
        tryOn(ctx, { ...ctx.look, [field]: index });
        change(ctx, ctx.look, true);
        return;
      }
      tryOn(ctx, null);
      change(ctx, { ...ctx.look, [field]: index }, true);
    },
    ...extra,
  };
}

/** Under a page's tiles: what is being tried on and what earns it, or nothing. */
function tryingNote(ctx: TravellerCtx, field: Field, slot: CosmeticSlot): HTMLElement {
  const note = h('p', { class: 'cr-note' });
  onRefresh(ctx, () => {
    const item = ctx.trying === null || ctx.trying[field] === ctx.look[field] ? null : cosmeticAt(slot, ctx.trying[field]);
    note.hidden = item === null;
    note.textContent = item === null ? '' : `Trying on ${item.name}. ${conditionText(item)} to wear it.`;
  });
  return note;
}

/** A line saying what a page's slot is for. */
const lede = (text: string): HTMLElement => h('p', { class: 'cr-lede', text });

/** The hat page: the hats as pictures, their colour, and a word when the hair takes none. */
export function hatPage(ctx: TravellerCtx): (HTMLElement | null)[] {
  const value = h('output');
  const refused = h('p', { class: 'cr-note' });
  const colour = swatches(ctx, 'Colour', CLOTH, () => ctx.look.hatColour, (hatColour) => {
    if (ctx.trying !== null) tryOn(ctx, { ...ctx.trying, hatColour });
    change(ctx, { ...ctx.look, hatColour });
  });
  onRefresh(ctx, () => {
    const shown = ctx.trying ?? ctx.look;
    value.textContent = cosmeticAt('hat', ctx.look.hat)?.name ?? 'None';
    const head = WARDROBE[shown.body].head[shown.head];
    const takes = head === undefined || takesHat(head.outfit);
    refused.hidden = takes;
    refused.textContent = takes ? '' : `${head!.label} leaves no room for a hat. Choose another style under Hair to wear one.`;
    const hat = cosmeticAt('hat', shown.hat);
    colour.hidden = hat === null || HAT_MODELS[hat.id]?.colourable !== true;
  });
  const grid = tiles(ctx, 'hat', () =>
    [null, ...itemsOf('hat')].map((item) =>
      itemTile(ctx, 'hat', 'hat', item, {
        // On a head that takes no hat the picture is the body's first head, so the hat shows.
        look: () => {
          const head = WARDROBE[ctx.look.body].head[ctx.look.head];
          const own = head === undefined || takesHat(head.outfit);
          return { ...ctx.look, hat: item?.index ?? 0, ...(own ? {} : { head: 0 }) };
        },
      }),
    ),
  );
  return [section('Hat', value, grid, tryingNote(ctx, 'hat', 'hat'), refused), colour];
}

/** The back page: nothing, the rucksack, or one of the pieces earned, and the rucksack's colour. */
export function backPage(ctx: TravellerCtx): (HTMLElement | null)[] {
  const value = h('output');
  onRefresh(ctx, () => {
    value.textContent = cosmeticAt('back', ctx.look.back)?.name ?? (ctx.look.pack ? 'Rucksack' : 'Nothing');
  });
  const frame: PortraitFrame = 'carry';
  const grid = tiles(ctx, frame, () => [
    {
      key: 'back-nothing',
      label: 'Nothing',
      look: () => ({ ...ctx.look, pack: false, back: 0 }),
      chosen: () => !ctx.look.pack && ctx.look.back === 0,
      pick: () => {
        tryOn(ctx, null);
        change(ctx, { ...ctx.look, pack: false, back: 0 }, true);
      },
    },
    {
      key: 'back-rucksack',
      label: 'Rucksack',
      look: () => ({ ...ctx.look, pack: true, back: 0 }),
      chosen: () => ctx.look.pack && ctx.look.back === 0,
      pick: () => {
        tryOn(ctx, null);
        change(ctx, { ...ctx.look, pack: true, back: 0 }, true);
      },
    },
    // A piece on the back takes the rucksack's place.
    ...itemsOf('back').map((item) => {
      const tile = itemTile(ctx, 'pack', 'back', item);
      return {
        ...tile,
        look: () => ({ ...ctx.look, back: item.index, pack: false }),
        pick: () => {
          if (tile.locked?.() !== null) {
            tryOn(ctx, { ...ctx.look, back: item.index, pack: false });
            change(ctx, ctx.look, true);
            return;
          }
          tryOn(ctx, null);
          change(ctx, { ...ctx.look, back: item.index, pack: false }, true);
        },
      };
    }),
  ]);
  return [
    section('On your back', value, grid, tryingNote(ctx, 'back', 'back')),
    // A colour picked is a rucksack worn: nobody chooses the colour of nothing.
    swatches(ctx, 'Rucksack colour', CLOTH, () => ctx.look.packColour, (packColour) => {
      tryOn(ctx, null);
      change(ctx, { ...ctx.look, packColour, pack: true, back: 0 });
    }),
  ];
}

/** The page of a slot the stage does not picture: trails, titles, canopies, the companion. */
export function pictured(ctx: TravellerCtx, slot: 'trail' | 'title' | 'canopy' | 'pet'): (HTMLElement | null)[] {
  const category = PAGE_OF[slot];
  const field: Field = slot;
  const value = h('output');
  onRefresh(ctx, () => {
    value.textContent = cosmeticAt(slot, ctx.look[field])?.name ?? (slot === 'canopy' ? 'Sunset' : 'None');
  });
  const paint = (item: Cosmetic | null) => (canvas: HTMLCanvasElement): void => {
    if (slot === 'canopy') paintCanopy(canvas, item?.index ?? 0);
    else if (item === null) paintNothing(canvas);
    else if (slot === 'trail') paintTrail(canvas, item.id);
    else if (slot === 'title') paintTitle(canvas, item.name);
    else paintPet(canvas);
  };
  const ledes: Readonly<Record<typeof slot, string>> = {
    trail: 'Follows you on foot and in every vehicle, for everyone to see.',
    title: 'Shown under your name, over your head, to everyone.',
    canopy: 'Your parachute, when you jump from an aircraft.',
    pet: 'Trots after you wherever you walk.',
  };
  const grid = tiles(ctx, 'body', () =>
    [null, ...itemsOf(slot)].map((item) => itemTile(ctx, category, field, item, { paint: paint(item), ...(slot === 'canopy' && item === null ? { label: 'Sunset' } : {}) })),
  );
  const word = { trail: 'Trail', title: 'Title', canopy: 'Canopy', pet: 'Companion' }[slot];
  return [lede(ledes[slot]), section(word, value, grid, tryingNote(ctx, field, slot))];
}
