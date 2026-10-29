/** The creator's elements: the column (rail, pages, buttons) and the view buttons under the hero. */
import type { HeroStage } from '../hero-stage.ts';
import { h, icon } from '../ui.ts';
import type { CategoryId } from './categories.ts';
import { BODY, CHECK, FACE, glyph, RESET, UNDO } from './format.ts';

export function buildDom(stage: HeroStage) {
  const pages = new Map<CategoryId, HTMLElement>();
  const tabs = new Map<CategoryId, HTMLButtonElement>();
  const rail = h('div', { class: 'cr-rail', role: 'tablist', 'aria-label': 'What to change', 'aria-orientation': 'vertical' });
  const panel = h('div', { class: 'cr-panel ui-card' });

  // The tools are small and beside the title; the one way out is the gold button under the column.
  const tool = (label: string, inner: string | SVGElement): HTMLButtonElement => {
    const button = h('button', { type: 'button', class: 'cr-tool', title: label, 'aria-label': label });
    if (typeof inner === 'string') button.innerHTML = inner;
    else button.append(inner);
    return button;
  };
  const randomButton = tool('Randomise', icon('dice', 18));
  const undoButton = tool('Undo (Ctrl+Z)', glyph(UNDO));
  const defaultButton = tool('Back to the traveller everyone starts as', glyph(RESET));
  const doneButton = h('button', { type: 'button', class: 'ui-btn primary big cr-done', html: `${glyph(CHECK)}Done` });

  const side = h(
    'div',
    { class: 'cr-side' },
    h('div', { class: 'cr-head' }, h('h2', { text: 'Your traveller' }), h('div', { class: 'cr-tools' }, randomButton, undoButton, defaultButton)),
    h('div', { class: 'cr-main' }, rail, panel),
    doneButton,
  );

  // Under the hero: the two framings worth a button, and what the hand can do.
  const viewButtons = (['full', 'head'] as const).map((shot) => {
    const label = shot === 'full' ? 'Whole body' : 'Face';
    const button = h('button', { type: 'button', class: 'cr-tool', title: label, 'aria-label': label, 'aria-pressed': 'false', html: glyph(shot === 'full' ? BODY : FACE) });
    button.addEventListener('click', () => {
      stage.shot(shot);
      refreshViews();
    });
    return [shot, button] as const;
  });
  const refreshViews = (): void => {
    for (const [shot, button] of viewButtons) button.setAttribute('aria-pressed', String(stage.shotName === shot));
  };
  const views = h('div', { class: 'cr-views', role: 'group', 'aria-label': 'Camera' }, ...viewButtons.map(([, button]) => button));

  const root = h('div', { class: 'atlas-creator ui-glass', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Your traveller' }, side, views);
  return { pages, tabs, rail, panel, randomButton, undoButton, defaultButton, doneButton, side, refreshViews, root };
}

export type TravellerDom = ReturnType<typeof buildDom>;
