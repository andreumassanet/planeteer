/**
 * The traveller's creator: how you look and what you are called, chosen with
 * the camera walked up to you, and worn at once by the hero and seen by
 * everyone else.
 *
 * **It is not a card in the middle of the screen any more.** The hero stands
 * on the stage (`hero-stage.ts`) on the right, large, and the creator is a
 * column on the left: a rail of categories — you, skin, hair, top, bottom,
 * shoes and rucksack — and the one that is open,
 * its choices as pictures of the hero wearing each (`stage.portrait`) and its
 * colours as swatches. Opening a category moves the camera to it: the face
 * for skin and hair, the feet for shoes, round the back for the rucksack.
 * The name floats over the hero's head with a pencil (the stage's plate), and
 * that is the one place it is changed.
 *
 * Opened from the title screen, the stage is already up: the title's column
 * goes, this one comes, and the camera dollies in; *Done* is the same move
 * back. Opened from the world or the planet menu, the stage comes up over a
 * dimmed, blurred version of what was there, and goes with the creator.
 *
 * It is a modal like the settings card — it holds the keyboard
 * (`registerModal`) and the mouse while it is up — and it owns nothing: the
 * appearance is `avatar.ts`'s (`dressHero`), handed in as a getter and a
 * setter by `main.ts`, which also tells the other players. Every click is applied at once, and *Undo* walks them back.
 */
import {
  CLOTH,
  DEFAULT_APPEARANCE,
  HAIR,
  SKINS,
  WARDROBE,
  colourName,
  encodeAppearance,
  fitAppearance,
  randomAppearance,
} from './appearance.ts';
import type { Appearance, Slot } from './appearance.ts';
import { holdFocus, registerModal } from './controls.ts';
import type { HeroStage, PortraitFrame, StageShot } from './hero-stage.ts';
import { rngFrom } from './scenery/random.ts';
import { PALETTE } from './theme.ts';
import { ensureStyle, h, hex, icon, installUi } from './ui.ts';

export { createHeroStage } from './hero-stage.ts';
export type { HeroStage } from './hero-stage.ts';

export interface TravellerOptions {
  /** The appearance, owned by the caller: `set` dresses the hero and tells the others. */
  appearance: { get(): Appearance; set(appearance: Appearance): void };
  /** The stage the hero stands on, shared with the title screen. */
  stage: HeroStage;
  /** Where to hand the pointer back to, if it was locked when the creator opened. */
  lockTarget?: HTMLElement | null;
  onOpen?(): void;
  onClose?(): void;
}

export interface Traveller {
  root: HTMLElement;
  readonly open: boolean;
  /**
   * Opens the creator. `relock` says whether to ask for the pointer back on
   * closing; left out, it is whether the pointer is locked now — which it is
   * not for a creator opened from another card that already released it.
   */
  show(options?: { relock?: boolean }): void;
  hide(): void;
}

type CategoryId = 'you' | 'skin' | 'hair' | 'top' | 'bottom' | 'feet' | 'pack';

interface Category {
  id: CategoryId;
  label: string;
  /** What the panel says under its title. */
  note: string;
  /** The rail's picture: strokes on a 24-unit grid, as `ui.ts` draws its icons. */
  glyph: string;
  shot: StageShot;
}

const CATEGORIES: readonly Category[] = [
  {
    id: 'you',
    label: 'You',
    note: 'Your body. Everyone online sees you as you choose here.',
    glyph: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="11" r="2.2"/><path d="M5.8 16.3c.6-1.6 1.8-2.4 3.2-2.4s2.6.8 3.2 2.4M14.2 10h3.3M14.2 13.5h3.3"/>',
    shot: 'full',
  },
  {
    id: 'skin',
    label: 'Skin',
    note: 'Eight tones, the same the people of the world are drawn in.',
    glyph: '<path d="M12 3.5c3.1 3.7 5.6 6.9 5.6 10.1a5.6 5.6 0 0 1-11.2 0c0-3.2 2.5-6.4 5.6-10.1z"/><path d="M9.6 14.2a2.6 2.6 0 0 0 2 2.4"/>',
    shot: 'head',
  },
  {
    id: 'hair',
    label: 'Hair',
    note: 'A style, a hat or a hood, and the colour of the hair, the brows and any beard.',
    glyph: '<circle cx="12" cy="13.5" r="6.3"/><path d="M5.7 12.6C6.6 8.4 9 6 12 6s5.4 2.4 6.3 6.6c-2.6-.3-5-1.6-6.3-3.6-1.3 2-3.7 3.3-6.3 3.6z"/>',
    shot: 'head',
  },
  {
    id: 'top',
    label: 'Top',
    note: 'What you wear over your shoulders, and its colour.',
    glyph: '<path d="M8.7 3.8 4.2 6.2 2.6 11l3 1.2 1.6-1.5v9.8h9.6v-9.8l1.6 1.5 3-1.2-1.6-4.8-4.5-2.4c-.5 1.5-1.8 2.4-3.3 2.4s-2.8-.9-3.3-2.4z"/>',
    shot: 'top',
  },
  {
    id: 'bottom',
    label: 'Bottom',
    note: 'Trousers, shorts or a skirt, and their colour.',
    glyph: '<path d="M6.6 3.6h10.8l1.5 16.8h-4.6L12 9.6l-2.3 10.8H5.1z"/><path d="M6.6 7h10.8"/>',
    shot: 'legs',
  },
  {
    id: 'feet',
    label: 'Shoes',
    note: 'From sandals to work boots, and their colour.',
    glyph: '<path d="M3.5 7.5v9h17v-1.4c0-1.8-1.4-3-3.3-3.4L12.3 10.6 9.6 7.5z"/><path d="M3.5 13.8h17M12.3 10.6l-1.6 1.6M14.6 11.2l-1.4 1.5"/>',
    shot: 'feet',
  },
  {
    id: 'pack',
    label: 'Rucksack',
    note: 'A rucksack on your back, or nothing at all.',
    glyph: '<rect x="5.5" y="6.5" width="13" height="14" rx="3.6"/><path d="M9 6.5V5.2a3 3 0 0 1 6 0v1.3"/><path d="M8.6 13.4h6.8v3.6H8.6z"/>',
    shot: 'back',
  },
];

const SLOT_FRAME: Readonly<Record<Slot, PortraitFrame>> = { head: 'head', top: 'top', bottom: 'bottom', feet: 'feet' };
const SLOT_COLOUR: Readonly<Record<Slot, 'hair' | 'topColour' | 'bottomColour' | 'feetColour'>> = {
  head: 'hair',
  top: 'topColour',
  bottom: 'bottomColour',
  feet: 'feetColour',
};
const SLOT_WORD: Readonly<Record<Slot, string>> = { head: 'Style', top: 'Top', bottom: 'Bottom', feet: 'Shoes' };

/** How many steps *Undo* remembers. */
const UNDO_DEPTH = 60;

const UNDO = '<path d="M9.2 5.5 4.5 10.2l4.7 4.7"/><path d="M4.5 10.2h10a4.9 4.9 0 0 1 0 9.8H11"/>';
const CHECK = '<path d="m5 12.5 4.5 4.5L19 7.5"/>';
const glyph = (paths: string): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

/** A colour's name as a person says it: the pen's ink is black hair, not "ink". */
const spoken = (color: number): string => (color === PALETTE.ink ? 'black' : colourName(color));

const STYLE = `
.atlas-creator {
  position: fixed;
  inset: 0;
  z-index: 12;
  pointer-events: none;
  font-family: var(--ui-font);
  color: var(--ui-ink);
  visibility: hidden;
  transition: visibility 0s 0.4s;
  --cr-centre: 62%;
}
.atlas-creator.on { visibility: visible; transition-delay: 0s; }
.cr-side {
  position: absolute;
  left: 24px;
  top: 24px;
  bottom: 24px;
  width: min(480px, calc(100vw - 48px));
  display: flex;
  flex-direction: column;
  gap: 14px;
  pointer-events: auto;
  opacity: 0;
  transform: translateX(-36px);
  transition: opacity 0.35s ease, transform 0.45s var(--ui-ease);
}
.atlas-creator.on .cr-side { opacity: 1; transform: none; }
.cr-head { display: flex; align-items: center; gap: 12px; color: var(--ui-paper); }
.cr-head h2 {
  margin: 0;
  font-size: 34px;
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1;
  -webkit-text-stroke: 6px var(--ui-ink);
  paint-order: stroke fill;
  text-shadow: 0 4px 0 var(--ui-ink);
}
.cr-head p { margin: 4px 0 0; font-size: 12.5px; font-weight: 700; color: rgba(255, 242, 232, 0.78); text-shadow: 0 2px 0 rgba(4, 6, 14, 0.7); }
.cr-main { flex: 1; min-height: 0; display: flex; gap: 12px; }
.cr-rail { display: flex; flex-direction: column; gap: 8px; flex: none; width: 78px; overflow-y: auto; scrollbar-width: none; padding: 2px 2px 6px; }
.cr-tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  flex: none;
  height: 62px;
  padding: 0;
  font: 800 11.5px/1 var(--ui-font);
  letter-spacing: -0.01em;
  color: var(--ui-ink);
  background: var(--ui-paper);
  border: 3px solid var(--ui-ink);
  border-radius: 14px;
  box-shadow: 0 4px 0 var(--ui-ink);
  cursor: pointer;
  transition: transform 0.12s var(--ui-spring), box-shadow 0.12s ease, background 0.15s ease;
}
.cr-tab svg { width: 24px; height: 24px; }
.cr-tab:hover { transform: translateX(3px); }
.cr-tab[aria-selected='true'] { background: var(--ui-gold); transform: translateX(6px); }
.cr-tab:focus-visible { outline: var(--ui-ring); outline-offset: 3px; }
.cr-panel { flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden; }
.cr-page { flex: 1; min-height: 0; overflow-y: auto; padding: 18px 18px 20px; scrollbar-width: thin; }
.cr-page[hidden] { display: none; }
.cr-page.fresh { animation: cr-in 0.3s var(--ui-ease) both; }
.cr-title { font-size: 25px; font-weight: 800; letter-spacing: -0.02em; line-height: 1; }
.cr-note { margin: 6px 0 4px; font-size: 12.5px; font-weight: 600; line-height: 1.4; opacity: 0.62; }
.cr-section { margin-top: 16px; }
.cr-section-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 9px; }
.cr-section-head output { font-size: 12.5px; font-weight: 800; text-transform: capitalize; }
.cr-tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 9px; }
.cr-tiles.two { grid-template-columns: repeat(2, 1fr); }
.cr-tile {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 5px;
  padding: 5px 5px 7px;
  font: 800 12px/1.15 var(--ui-font);
  color: var(--ui-ink);
  text-align: center;
  background: var(--ui-paper);
  border: 2.5px solid var(--ui-ink);
  border-radius: 12px;
  box-shadow: 0 3px 0 var(--ui-ink);
  cursor: pointer;
  transition: transform 0.12s var(--ui-spring), box-shadow 0.12s ease, background 0.15s ease;
}
.cr-tile:hover { transform: translateY(-2px); box-shadow: 0 5px 0 var(--ui-ink); }
.cr-tile:active { transform: translateY(2px); box-shadow: 0 1px 0 var(--ui-ink); }
.cr-tile:focus-visible { outline: var(--ui-ring); outline-offset: 3px; }
.cr-tile[aria-pressed='true'] { background: var(--ui-gold); }
.cr-tile canvas {
  display: block;
  width: 100%;
  aspect-ratio: 1;
  border-radius: 8px;
  background: radial-gradient(circle at 50% 40%, ${hex(PALETTE.white)}, ${hex(PALETTE.cream)} 70%);
}
.cr-tile canvas:not(.drawn) { animation: cr-wait 1.2s ease-in-out infinite alternate; }
.cr-tile .cr-tick {
  position: absolute;
  top: -7px;
  right: -7px;
  display: none;
  place-items: center;
  width: 22px;
  height: 22px;
  border: 2.5px solid var(--ui-ink);
  border-radius: 50%;
  background: var(--ui-paper);
}
.cr-tile .cr-tick svg { width: 13px; height: 13px; }
.cr-tile[aria-pressed='true'] .cr-tick { display: grid; }
.cr-swatches { display: flex; flex-wrap: wrap; gap: 8px; }
.cr-swatch {
  width: 34px;
  height: 34px;
  padding: 0;
  border: 3px solid var(--ui-ink);
  border-radius: 50%;
  box-shadow: 0 3px 0 var(--ui-ink);
  cursor: pointer;
  transition: transform 0.12s var(--ui-spring);
}
.cr-swatch:hover { transform: translateY(-2px) scale(1.06); }
.cr-swatch[aria-pressed='true'] { box-shadow: 0 0 0 3px var(--ui-paper), 0 0 0 6px var(--ui-ink); transform: scale(1.04); }
.cr-swatch:focus-visible { outline: var(--ui-ring); outline-offset: 6px; }
.cr-swatches.big .cr-swatch { width: 44px; height: 44px; }
.cr-foot { display: flex; align-items: center; gap: 8px; }
.cr-foot .cr-done { margin-left: auto; }
.cr-foot .ui-btn svg { width: 18px; height: 18px; }
.cr-views {
  position: absolute;
  left: var(--cr-centre);
  bottom: 22px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  pointer-events: auto;
  transform: translateX(-50%);
  opacity: 0;
  transition: opacity 0.35s ease 0.1s, left 0.3s var(--ui-ease);
}
.atlas-creator.on .cr-views { opacity: 1; }
.cr-hint { font-size: 12px; font-weight: 700; color: rgba(255, 242, 232, 0.72); text-shadow: 0 2px 0 rgba(4, 6, 14, 0.7); white-space: nowrap; }
@keyframes cr-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes cr-wait { from { opacity: 0.55; } to { opacity: 1; } }
@media (max-width: 760px) {
  .cr-side { left: 12px; right: 12px; top: auto; bottom: 12px; width: auto; height: 56vh; gap: 10px; }
  .cr-head { display: none; }
  .cr-main { flex-direction: column; gap: 10px; }
  .cr-rail { flex-direction: row; width: auto; overflow-x: auto; overflow-y: hidden; }
  .cr-tab { width: 66px; height: 56px; }
  .cr-tab[aria-selected='true'] { transform: translateY(-3px); }
  .cr-tab:hover { transform: none; }
  .cr-views { bottom: auto; top: 14px; }
  .cr-hint { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .cr-side, .cr-views, .cr-tab, .cr-tile, .cr-swatch { transition: none; }
  .cr-page.fresh, .cr-tile canvas:not(.drawn) { animation: none; }
}
`;

/** A tile: a picture of the hero wearing a choice, and its name. */
interface TileSpec {
  key: string;
  label: string;
  title?: string;
  look: () => Appearance;
  chosen: () => boolean;
  pick: () => void;
}

export function createTraveller(options: TravellerOptions): Traveller {
  installUi();
  ensureStyle('atlas-creator', STYLE);
  const stage = options.stage;

  /* --- the state: one appearance, applied on every change, and its history -- */

  let look: Appearance = fitAppearance(options.appearance.get());
  const history: Appearance[] = [];

  function change(next: Appearance): void {
    const fitted = fitAppearance(next);
    if (encodeAppearance(fitted) === encodeAppearance(look)) return;
    history.push(look);
    if (history.length > UNDO_DEPTH) history.shift();
    apply(fitted);
  }

  function apply(next: Appearance): void {
    look = next;
    options.appearance.set(look);
    refresh();
  }

  function undo(): void {
    const last = history.pop();
    if (last !== undefined) apply(last);
  }

  function randomise(): void {
    change(randomAppearance(rngFrom('traveller', Date.now(), Math.random())));
    stage.wave();
  }

  /* --- the pieces a page is made of ------------------------------------------ */

  /** What every page re-reads when anything changes; each page adds its own. */
  const refreshers = new Map<CategoryId, (() => void)[]>();
  let building: CategoryId = 'you';
  const onRefresh = (refresh: () => void): void => {
    const list = refreshers.get(building) ?? [];
    list.push(refresh);
    refreshers.set(building, list);
  };

  function section(title: string, value: HTMLElement | null, ...body: (Node | null)[]): HTMLElement {
    return h(
      'section',
      { class: 'cr-section' },
      h('div', { class: 'cr-section-head' }, h('span', { class: 'ui-eyebrow', text: title }), value),
      ...body,
    );
  }

  /**
   * A grid of tiles, made again whenever the list changes shape — a body's
   * wardrobe is not the other's — and otherwise only marked and re-pictured.
   */
  function tiles(frame: PortraitFrame, list: () => TileSpec[], wide = false): HTMLElement {
    const grid = h('div', { class: wide ? 'cr-tiles two' : 'cr-tiles', role: 'group' });
    let shape = '';
    let made: { spec: TileSpec; button: HTMLButtonElement; canvas: HTMLCanvasElement }[] = [];
    onRefresh(() => {
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
  function swatches(
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
    onRefresh(() => {
      const at = get();
      buttons.forEach((button, index) => button.setAttribute('aria-pressed', String(index === at)));
      value.textContent = colours[at] === undefined ? '' : name(colours[at]!, at);
    });
    return section(title, value, h('div', { class: big ? 'cr-swatches big' : 'cr-swatches', role: 'group', 'aria-label': title }, ...buttons));
  }

  /** A slot's styles, as pictures, and its colour. */
  function slotPage(slot: Slot): (HTMLElement | null)[] {
    const word = SLOT_WORD[slot];
    const value = h('output');
    onRefresh(() => {
      value.textContent = WARDROBE[look.body][slot][look[slot]]?.label ?? '';
    });
    const field = SLOT_COLOUR[slot];
    return [
      section(
        word,
        value,
        tiles(SLOT_FRAME[slot], () =>
          WARDROBE[look.body][slot].map((choice, index) => ({
            key: `${look.body}-${slot}-${index}`,
            label: choice.label,
            look: () => ({ ...look, [slot]: index }),
            chosen: () => look[slot] === index,
            pick: () => change({ ...look, [slot]: index }),
          })),
        ),
      ),
      swatches('Colour', slot === 'head' ? HAIR : CLOTH, () => look[field], (index) => change({ ...look, [field]: index })),
    ];
  }

  /* --- the pages --------------------------------------------------------------- */

  function page(category: Category): HTMLElement {
    building = category.id;
    const body: (Node | null)[] = [];
    switch (category.id) {
      case 'you':
        body.push(
          section(
            'Body',
            null,
            tiles(
              'body',
              () =>
                (['man', 'woman'] as const).map((kind) => ({
                  key: kind,
                  label: kind === 'man' ? 'Man' : 'Woman',
                  // A body is its own wardrobe, so switching keeps the colours
                  // and takes that body's first of everything.
                  look: () => (look.body === kind ? look : { ...look, body: kind, head: 0, top: 0, bottom: 0, feet: 0 }),
                  chosen: () => look.body === kind,
                  pick: () => {
                    if (look.body !== kind) change({ ...look, body: kind, head: 0, top: 0, bottom: 0, feet: 0 });
                  },
                })),
              true,
            ),
          ),
        );
        break;
      case 'skin':
        body.push(swatches('Tone', SKINS, () => look.skin, (skin) => change({ ...look, skin }), (_, index) => `tone ${index + 1} of ${SKINS.length}`, true));
        break;
      case 'hair':
        body.push(...slotPage('head'));
        break;
      case 'top':
      case 'bottom':
      case 'feet':
        body.push(...slotPage(category.id));
        break;
      case 'pack':
        body.push(
          section(
            'On your back',
            null,
            tiles(
              'pack',
              () =>
                [false, true].map((on) => ({
                  key: String(on),
                  label: on ? 'Rucksack' : 'Nothing',
                  look: () => ({ ...look, pack: on }),
                  chosen: () => look.pack === on,
                  pick: () => change({ ...look, pack: on }),
                })),
              true,
            ),
          ),
          // A colour picked is a rucksack worn: nobody chooses the colour of nothing.
          swatches('Colour', CLOTH, () => look.packColour, (packColour) => change({ ...look, packColour, pack: true })),
        );
        break;
    }
    return h(
      'div',
      { class: 'cr-page', role: 'tabpanel', id: `cr-page-${category.id}`, 'aria-label': category.label },
      h('div', { class: 'cr-title', text: category.label }),
      h('p', { class: 'cr-note', text: category.note }),
      ...body,
    );
  }

  /* --- the column ------------------------------------------------------------- */

  const pages = new Map<CategoryId, HTMLElement>();
  const tabs = new Map<CategoryId, HTMLButtonElement>();
  const rail = h('div', { class: 'cr-rail', role: 'tablist', 'aria-label': 'What to change', 'aria-orientation': 'vertical' });
  const panel = h('div', { class: 'cr-panel ui-card' });
  for (const category of CATEGORIES) {
    const tab = h('button', {
      type: 'button',
      class: 'cr-tab',
      role: 'tab',
      'aria-selected': 'false',
      'aria-controls': `cr-page-${category.id}`,
      title: category.label,
      html: `${glyph(category.glyph)}<span>${category.label}</span>`,
    });
    tab.addEventListener('click', () => select(category.id));
    tabs.set(category.id, tab);
    rail.append(tab);
    const built = page(category);
    built.hidden = true;
    pages.set(category.id, built);
    panel.append(built);
  }

  const randomButton = h('button', { type: 'button', class: 'ui-btn', title: 'A traveller at random' }, icon('dice'), 'Randomise');
  const undoButton = h('button', { type: 'button', class: 'ui-btn', title: 'Undo (Ctrl+Z)', html: `${glyph(UNDO)}Undo` });
  const defaultButton = h('button', { type: 'button', class: 'ui-btn quiet', title: 'Back to the traveller everyone starts as' }, 'Default');
  const doneButton = h('button', { type: 'button', class: 'ui-btn primary cr-done', html: `${glyph(CHECK)}Done` });
  randomButton.addEventListener('click', randomise);
  undoButton.addEventListener('click', undo);
  defaultButton.addEventListener('click', () => change({ ...DEFAULT_APPEARANCE }));
  doneButton.addEventListener('click', () => hide());

  const side = h(
    'div',
    { class: 'cr-side' },
    h('div', { class: 'cr-head' }, h('div', {}, h('h2', { text: 'Your traveller' }), h('p', { text: 'Saved on this device, and seen by everyone online.' }))),
    h('div', { class: 'cr-main' }, rail, panel),
    h('div', { class: 'cr-foot' }, randomButton, undoButton, defaultButton, doneButton),
  );

  // Under the hero: the two framings worth a button, and what the hand can do.
  const viewButtons = (['full', 'head'] as const).map((shot) => {
    const button = h('button', { type: 'button', text: shot === 'full' ? 'Whole body' : 'Face', 'aria-pressed': 'false' });
    button.addEventListener('click', () => {
      stage.shot(shot);
      refreshViews();
    });
    return [shot, button] as const;
  });
  const refreshViews = (): void => {
    for (const [shot, button] of viewButtons) button.setAttribute('aria-pressed', String(stage.shotName === shot));
  };
  const views = h(
    'div',
    { class: 'cr-views' },
    h('div', { class: 'ui-seg', role: 'group', 'aria-label': 'Camera' }, ...viewButtons.map(([, button]) => button)),
    h('div', { class: 'cr-hint', text: 'Drag to turn · scroll to zoom' }),
  );

  const root = h('div', { class: 'atlas-creator', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Your traveller' }, side, views);

  let current: CategoryId = 'you';

  function refresh(): void {
    for (const run of refreshers.get(current) ?? []) run();
    undoButton.disabled = history.length === 0;
    refreshViews();
  }

  function select(id: CategoryId, focus = false): void {
    const category = CATEGORIES.find((entry) => entry.id === id)!;
    const changed = id !== current;
    current = id;
    for (const [key, tab] of tabs) {
      tab.setAttribute('aria-selected', String(key === id));
      tab.tabIndex = key === id ? 0 : -1;
    }
    for (const [key, element] of pages) {
      element.hidden = key !== id;
      if (key === id && changed) {
        element.classList.remove('fresh');
        void element.offsetWidth;
        element.classList.add('fresh');
        element.scrollTop = 0;
      }
    }
    if (showing) stage.shot(category.shot);
    if (focus) tabs.get(id)!.focus({ preventScroll: true });
    refresh();
  }

  /** Tells the stage how much of the screen the column takes, so the hero stands in the rest. */
  function measure(): void {
    const width = innerWidth;
    const height = innerHeight;
    if (matchMedia('(max-width: 760px)').matches) {
      stage.insets({ left: 0, right: 0, top: 64, bottom: Math.max(0, height - side.offsetTop) + 8 });
      root.style.setProperty('--cr-centre', '50%');
    } else {
      const left = side.offsetLeft + side.offsetWidth + 12;
      stage.insets({ left, right: 0, top: 70, bottom: 92 });
      root.style.setProperty('--cr-centre', `${(left + (width - left) / 2).toFixed(0)}px`);
    }
  }
  addEventListener('resize', () => {
    if (showing) measure();
  });

  /* --- opening and closing ------------------------------------------------------ */

  let showing = false;
  let relock = false;
  /** Whether the stage was brought up for this, and so goes with it. */
  let ownsStage = false;
  let previousFocus: HTMLElement | null = null;
  registerModal(() => showing);

  function show(opening: { relock?: boolean } = {}): void {
    if (showing) return;
    showing = true;
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const target = options.lockTarget ?? null;
    relock = opening.relock ?? (target !== null && document.pointerLockElement === target);
    if (document.pointerLockElement) document.exitPointerLock();
    // Before the stage is touched: the title, if it is up, steps aside on this.
    options.onOpen?.();
    look = fitAppearance(options.appearance.get());
    history.length = 0;
    if (!root.isConnected) document.body.append(root);
    root.classList.add('on');
    measure();
    const category = CATEGORIES.find((entry) => entry.id === current)!;
    ownsStage = !stage.open;
    stage.mode('creator');
    stage.shot(category.shot, { instant: ownsStage });
    if (ownsStage) stage.show('dim');
    stage.adoptPlate(root);
    select(current);
    tabs.get(current)!.focus({ preventScroll: true });
    if (!ownsStage) window.setTimeout(() => stage.wave(), 500);
  }

  // A lock granted while the creator is up — asked for by whatever closed as it
  // opened — is handed straight back, as the settings card does.
  document.addEventListener('pointerlockchange', () => {
    if (showing && document.pointerLockElement !== null) document.exitPointerLock();
  });

  function hide(): void {
    if (!showing) return;
    showing = false;
    root.classList.remove('on');
    if (ownsStage) stage.hide();
    // The title, if it was under this, takes the stage back on this.
    options.onClose?.();
    const target = options.lockTarget ?? null;
    if (relock && target !== null && typeof target.requestPointerLock === 'function') {
      // Chrome refuses a lock asked for too soon after one was released; that
      // rejection is noise, the same rule `settings.ts` follows.
      try {
        const request: unknown = target.requestPointerLock();
        if (request instanceof Promise) request.catch(() => {});
      } catch {
        // The creator is closed either way.
      }
    }
    (document.activeElement as HTMLElement | null)?.blur?.();
    if (!relock && previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    previousFocus = null;
  }

  addEventListener('keydown', (event) => {
    if (!showing) return;
    if (event.code === 'Escape') {
      event.preventDefault();
      // Not the menu's Escape as well, which would go back a stage behind the creator.
      event.stopImmediatePropagation();
      hide();
      return;
    }
    const typing = event.target instanceof HTMLInputElement;
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.code === 'KeyZ' && !typing) {
      event.preventDefault();
      undo();
      return;
    }
    const along = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 }[event.code];
    if (along !== undefined && event.target instanceof Element && rail.contains(event.target)) {
      event.preventDefault();
      const at = CATEGORIES.findIndex((entry) => entry.id === current);
      select(CATEGORIES[(at + along + CATEGORIES.length) % CATEGORIES.length]!.id, true);
      return;
    }
    holdFocus(event, root);
  });

  return {
    root,
    get open() {
      return showing;
    },
    show,
    hide,
  };
}
