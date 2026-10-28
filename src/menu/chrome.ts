/** The chrome around the globe: which controls show on which stage, the trail and the Continue label. */
import { h, icon } from '../ui.ts';
import type { MenuCtx } from './context.ts';
import { flag } from './dom.ts';
import { bodyById } from './flight.ts';
import { closeResults } from './search.ts';
import { backToRegions, bodyName } from './stages.ts';
import { capital } from './text.ts';

function setOff(ctx: MenuCtx, element: HTMLElement, off: boolean): void {
  element.classList.toggle('m-off', off);
  // A control that goes away takes the keyboard with it; a hidden button
  // left holding the focus would still answer Enter, invisibly.
  if (off && element.contains(document.activeElement)) ctx.root.focus({ preventScroll: true });
}

function crumb(label: string | Node, action: (() => void) | null, flagKey?: string): HTMLElement {
  const element = h('button', { class: action === null ? 'm-crumb here' : 'm-crumb' });
  if (flagKey !== undefined) element.append(flag(flagKey, 22, 15));
  element.append(label);
  if (action !== null) element.addEventListener('click', action);
  else element.setAttribute('aria-current', 'page');
  return element;
}

function refreshTrail(ctx: MenuCtx): void {
  const { backButton, trail } = ctx;
  // No *Solar system* at the head: every trail starts there, and the back button says the way.
  const parts: HTMLElement[] = [];
  if (ctx.stage === 'planet') {
    parts.push(crumb(bodyById(ctx, ctx.focusId).body.name, null));
  } else if (ctx.stage === 'region' || ctx.stage === 'site') {
    parts.push(crumb(ctx.body.name, ctx.stage === 'site' ? () => backToRegions(ctx) : null));
    if (ctx.stage === 'site' && ctx.region !== null) parts.push(crumb(ctx.region.name, null, ctx.region.key));
  }
  trail.replaceChildren();
  parts.forEach((part, i) => {
    if (i > 0) trail.append(icon('chevron'));
    trail.append(part);
  });
  // The arrow says where it goes, since nothing beside it does.
  const to = ctx.stage === 'site' ? capital(ctx.words.regions) : 'Solar system';
  backButton.title = `${to} (Esc)`;
  backButton.setAttribute('aria-label', `Back to ${to.toLowerCase()}`);
}

export function refreshContinue(ctx: MenuCtx): void {
  const { continueLabel, deps, fallback, home } = ctx;
  const elsewhere = ctx.last !== null && ctx.last.body !== home.id && deps.exploreBody !== undefined;
  if (ctx.last === null || (ctx.last.body !== home.id && !elsewhere)) {
    continueLabel.replaceChildren('Start in ', h('span', { class: 'quiet', text: fallback.name }));
  } else if (elsewhere) {
    const world = bodyName(ctx, ctx.last.body).replace(/^The /, 'the ');
    continueLabel.replaceChildren(
      'Continue on ',
      h('span', { class: 'quiet', text: ctx.last.name === '' ? world : `${world}, in ${ctx.last.name}` }),
    );
  } else if (ctx.last.name === '') {
    // Out at sea, most likely: somewhere with no town to name.
    continueLabel.replaceChildren('Continue where you left off');
  } else {
    continueLabel.replaceChildren('Continue in ', h('span', { class: 'quiet', text: ctx.last.name }));
  }
}

export function refreshChrome(ctx: MenuCtx): void {
  const { brand, continueButton, crumbs, dock, info, leaveButton, panel, root, search, select } = ctx;
  const flying = ctx.flight !== null;
  const open = ctx.chosen === null && !ctx.held;
  const settled = !flying && open;
  root.classList.toggle('flying', flying);
  root.classList.toggle('chosen', ctx.chosen !== null);
  root.classList.toggle('held', ctx.held);
  root.dataset.stage = ctx.stage;
  setOff(ctx, brand, !(ctx.stage === 'system' && settled));
  setOff(ctx, dock, !(ctx.stage === 'system' && settled));
  setOff(ctx, crumbs, !(ctx.stage !== 'system' && open));
  setOff(ctx, panel, !((ctx.stage === 'region' || ctx.stage === 'site') && settled));
  setOff(ctx, info, !(ctx.stage === 'planet' && settled));
  setOff(ctx, search, !(open && ctx.stage !== 'planet'));
  refreshContinue(ctx);
  // The remembered place is offered on every stage but the one where a town is
  // being chosen: *Start here* is that stage's one button.
  setOff(ctx, continueButton, !open || ctx.stage === 'site');
  if (leaveButton !== null) setOff(ctx, leaveButton, !(ctx.stage === 'system' && open));
  // The town picked, or once chosen the landing it is waiting for — never
  // under the title, which holds the menu with neither.
  const selecting = ctx.chosen !== null || (open && ctx.stage === 'site' && ctx.picked !== null && !flying);
  setOff(ctx, select, !selecting);
  root.classList.toggle('picking', selecting);
  // Not under the title, which says how far the world is in its own card.
  if (flying || !open) closeResults(ctx);
  refreshTrail(ctx);
}
