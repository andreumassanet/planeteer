/** Refreshing the open page, turning to another category and telling the stage how much of the screen the column takes. */
import { CATEGORIES, type CategoryId } from './categories.ts';
import type { TravellerCtx } from './ctx.ts';
import { freshIn, markPageSeen, tryOn } from './earned.ts';

export function refresh(ctx: TravellerCtx): void {
  const { history, refreshViews, refreshers, tabs, undoButton } = ctx;
  for (const run of refreshers.get(ctx.current) ?? []) run();
  undoButton.disabled = history.length === 0;
  refreshViews();
  // A dot on every tab with something earned not looked at yet.
  for (const [id, tab] of tabs) tab.classList.toggle('fresh', id !== ctx.current && freshIn(ctx, id));
}

export function select(ctx: TravellerCtx, id: CategoryId, focus = false): void {
  const { pages, stage, tabs } = ctx;
  const category = CATEGORIES.find((entry) => entry.id === id)!;
  const changed = id !== ctx.current;
  if (changed) {
    // What was tried on goes with the page it was tried on; what was new there has been seen.
    markPageSeen(ctx, ctx.current);
    if (ctx.trying !== null) tryOn(ctx, null);
  }
  ctx.current = id;
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
  if (ctx.showing) stage.shot(category.shot);
  if (focus) tabs.get(id)!.focus({ preventScroll: true });
  refresh(ctx);
}

/** Tells the stage how much of the screen the column takes, so the hero stands in the rest. */
export function measure(ctx: TravellerCtx): void {
  const { root, side, stage } = ctx;
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
