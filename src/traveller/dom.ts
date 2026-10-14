/** The creator's elements: the column (rail, pages, buttons) and the view buttons under the hero. */
import type { HeroStage } from '../hero-stage.ts';
import { h, icon } from '../ui.ts';
import type { CategoryId } from './categories.ts';
import { CHECK, glyph, UNDO } from './format.ts';

export function buildDom(stage: HeroStage) {
  const pages = new Map<CategoryId, HTMLElement>();
  const tabs = new Map<CategoryId, HTMLButtonElement>();
  const rail = h('div', { class: 'cr-rail', role: 'tablist', 'aria-label': 'What to change', 'aria-orientation': 'vertical' });
  const panel = h('div', { class: 'cr-panel ui-card' });

  const randomButton = h('button', { type: 'button', class: 'ui-btn', title: 'A traveller at random' }, icon('dice'), 'Randomise');
  const undoButton = h('button', { type: 'button', class: 'ui-btn', title: 'Undo (Ctrl+Z)', html: `${glyph(UNDO)}Undo` });
  const defaultButton = h('button', { type: 'button', class: 'ui-btn quiet', title: 'Back to the traveller everyone starts as' }, 'Default');
  const doneButton = h('button', { type: 'button', class: 'ui-btn primary cr-done', html: `${glyph(CHECK)}Done` });

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
  return { pages, tabs, rail, panel, randomButton, undoButton, defaultButton, doneButton, side, refreshViews, root };
}

export type TravellerDom = ReturnType<typeof buildDom>;
