/** The appearance being edited: every change is applied at once, and *Undo* walks them back. */
import { type Appearance, encodeAppearance, fitAppearance, randomAppearance } from '../appearance.ts';
import { cosmeticsOf } from '../cosmetics.ts';
import { rngFrom } from '../scenery/random.ts';
import type { TravellerCtx } from './ctx.ts';
import { UNDO_DEPTH } from './format.ts';
import { refresh } from './view.ts';

/** Applies `next`; with `redraw`, the page is drawn again even if nothing worn changed (something was tried on). */
export function change(ctx: TravellerCtx, next: Appearance, redraw = false): void {
  const { history } = ctx;
  const fitted = fitAppearance(next);
  if (encodeAppearance(fitted) === encodeAppearance(ctx.look)) {
    if (redraw) refresh(ctx);
    return;
  }
  history.push(ctx.look);
  if (history.length > UNDO_DEPTH) history.shift();
  apply(ctx, fitted);
}

function apply(ctx: TravellerCtx, next: Appearance): void {
  const { options } = ctx;
  ctx.look = next;
  options.appearance.set(ctx.look);
  refresh(ctx);
}

export function undo(ctx: TravellerCtx): void {
  const { history } = ctx;
  const last = history.pop();
  if (last !== undefined) apply(ctx, last);
}

export function randomise(ctx: TravellerCtx): void {
  const { stage } = ctx;
  // A new face and new clothes; what was earned and worn stays on.
  change(ctx, { ...randomAppearance(rngFrom('traveller', Date.now(), Math.random())), ...cosmeticsOf(ctx.look) });
  stage.wave();
}
