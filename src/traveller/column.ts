/** The column: a tab and a page for each category, and the foot buttons. */
import { DEFAULT_APPEARANCE } from '../appearance.ts';
import { h } from '../ui.ts';
import { CATEGORIES } from './categories.ts';
import type { TravellerCtx } from './ctx.ts';
import { glyph } from './format.ts';
import { page } from './pages.ts';
import { hide } from './showing.ts';
import { change, randomise, undo } from './state.ts';
import { select } from './view.ts';

export function fillColumn(ctx: TravellerCtx): void {
  const { defaultButton, doneButton, pages, panel, rail, randomButton, tabs, undoButton } = ctx;
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
    tab.addEventListener('click', () => select(ctx, category.id));
    tabs.set(category.id, tab);
    rail.append(tab);
    const built = page(ctx, category);
    built.hidden = true;
    pages.set(category.id, built);
    panel.append(built);
  }

  randomButton.addEventListener('click', () => randomise(ctx));
  undoButton.addEventListener('click', () => undo(ctx));
  defaultButton.addEventListener('click', () => change(ctx, { ...DEFAULT_APPEARANCE }));
  doneButton.addEventListener('click', () => hide(ctx));
}
