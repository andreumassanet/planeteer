/** The pieces a page is made of: sections, grids of tiles pictured by the stage, swatches and a slot's page. */
import { CLOTH, HAIR, type Slot, WARDROBE } from '../appearance.ts';
import type { PortraitFrame } from '../hero-stage.ts';
import { h, hex } from '../ui.ts';
import { SLOT_COLOUR, SLOT_FRAME, SLOT_WORD } from './categories.ts';
import type { TravellerCtx } from './ctx.ts';
import { CHECK, glyph, spoken } from './format.ts';
import { change } from './state.ts';
import type { TileSpec } from './types.ts';

function onRefresh(ctx: TravellerCtx, refresh: () => void): void {
  const list = ctx.refreshers.get(ctx.building) ?? [];
  list.push(refresh);
  ctx.refreshers.set(ctx.building, list);
}

export function section(title: string, value: HTMLElement | null, ...body: (Node | null)[]): HTMLElement {
  return h(
    'section',
    { class: 'cr-section' },
    h('div', { class: 'cr-section-head' }, h('span', { class: 'ui-label', text: title }), value),
    ...body,
  );
}

/**
 * A grid of tiles, made again whenever the list changes shape — a body's
 * wardrobe is not the other's — and otherwise only marked and re-pictured.
 */
export function tiles(ctx: TravellerCtx, frame: PortraitFrame, list: () => TileSpec[], wide = false): HTMLElement {
  const { stage } = ctx;
  const grid = h('div', { class: wide ? 'cr-tiles two' : 'cr-tiles', role: 'group' });
  let shape = '';
  let made: { spec: TileSpec; button: HTMLButtonElement; canvas: HTMLCanvasElement }[] = [];
  onRefresh(ctx, () => {
    const specs = list();
    const now = specs.map((spec) => spec.key).join('|');
    if (now !== shape) {
      shape = now;
      made = specs.map((spec) => {
        const canvas = h('canvas', { width: 128, height: 128 });
        const button = h(
          'button',
          { type: 'button', class: 'cr-tile', 'aria-pressed': 'false', title: spec.title ?? spec.label },
          canvas,
          h('span', { text: spec.label }),
          h('span', { class: 'cr-tick', html: glyph(CHECK) }),
        );
        const tile = { spec, button, canvas };
        // The spec current at the time of the click, not the one it was made with.
        button.addEventListener('click', () => tile.spec.pick());
        return tile;
      });
      grid.replaceChildren(...made.map((tile) => tile.button));
    } else {
      // The same tiles, with this refresh's closures.
      made.forEach((tile, index) => {
        tile.spec = specs[index]!;
      });
    }
    for (const tile of made) {
      tile.button.setAttribute('aria-pressed', String(tile.spec.chosen()));
      stage.portrait(tile.spec.look(), frame, tile.canvas);
    }
  });
  return grid;
}

/** A row of colours, with the chosen one's name over it. */
export function swatches(ctx: TravellerCtx, 
  title: string,
  colours: readonly number[],
  get: () => number,
  set: (index: number) => void,
  name: (color: number, index: number) => string = spoken,
  big = false,
): HTMLElement {
  const value = h('output', { 'aria-live': 'polite' });
  const buttons = colours.map((color, index) => {
    const button = h('button', {
      type: 'button',
      class: 'cr-swatch',
      title: name(color, index),
      'aria-label': `${title}: ${name(color, index)}`,
      'aria-pressed': 'false',
    });
    button.style.background = hex(color);
    button.addEventListener('click', () => set(index));
    return button;
  });
  onRefresh(ctx, () => {
    const at = get();
    buttons.forEach((button, index) => button.setAttribute('aria-pressed', String(index === at)));
    value.textContent = colours[at] === undefined ? '' : name(colours[at]!, at);
  });
  return section(title, value, h('div', { class: big ? 'cr-swatches big' : 'cr-swatches', role: 'group', 'aria-label': title }, ...buttons));
}

/** A slot's styles, as pictures, and its colour. */
export function slotPage(ctx: TravellerCtx, slot: Slot): (HTMLElement | null)[] {
  const word = SLOT_WORD[slot];
  const value = h('output');
  onRefresh(ctx, () => {
    value.textContent = WARDROBE[ctx.look.body][slot][ctx.look[slot]]?.label ?? '';
  });
  const field = SLOT_COLOUR[slot];
  return [
    section(
      word,
      value,
      tiles(ctx, SLOT_FRAME[slot], () =>
        WARDROBE[ctx.look.body][slot].map((choice, index) => ({
          key: `${ctx.look.body}-${slot}-${index}`,
          label: choice.label,
          look: () => ({ ...ctx.look, [slot]: index }),
          chosen: () => ctx.look[slot] === index,
          pick: () => change(ctx, { ...ctx.look, [slot]: index }),
        })),
      ),
    ),
    swatches(ctx, 'Colour', slot === 'head' ? HAIR : CLOTH, () => ctx.look[field], (index) => change(ctx, { ...ctx.look, [field]: index })),
  ];
}
