/** The chrome around the globe: which controls show on which stage, the trail and the Continue label. */
import { h, icon } from '../ui.ts';
import type { MenuCtx } from './context.ts';
import { flag } from './dom.ts';
import { bodyById } from './flight.ts';
import { closeResults } from './search.ts';
import { backToRegions, backToSystem, bodyName } from './stages.ts';

function setOff(ctx: MenuCtx, element: HTMLElement, off: boolean): void {
  element.classList.toggle('m-off', off);
  // A control that goes away takes the keyboard with it; a hidden button
  // left holding the focus would still answer Enter, invisibly.
  if (off && element.contains(document.activeElement)) ctx.root.focus({ preventScroll: true });
}

function crumb(label: string, action: (() => void) | null): HTMLElement {
  const element = h('button', { class: action === null ? 'm-crumb here' : 'm-crumb', text: label });
  if (action !== null) element.addEventListener('click', action);
  else element.setAttribute('aria-current', 'page');
  return element;
}

/** The path over the title, every step of it a way back, and the place itself as the title. */
function refreshTrail(ctx: MenuCtx): void {
  const { backLabel, leaveButton, trail, titleFlag, titleText } = ctx;
  // Over the system the title is the game's own name, with no path above it.
  const parts: HTMLElement[] = ctx.stage === 'system' ? [] : [crumb('Solar system', () => backToSystem(ctx))];
  let name = 'Planeteer';
  let flagKey: string | null = null;
  if (ctx.stage === 'planet') {
    name = bodyById(ctx, ctx.focusId).body.name;
  } else if (ctx.stage === 'region' || ctx.stage === 'site') {
    name = ctx.body.name;
    if (ctx.stage === 'site' && ctx.region !== null) {
      parts.push(crumb(ctx.body.name, () => backToRegions(ctx)));
      name = ctx.region.name;
      flagKey = ctx.region.key;
    }
  }
  trail.replaceChildren();
  parts.forEach((part, i) => {
    if (i > 0) trail.append(icon('chevron'));
    trail.append(part);
  });
  if (titleText.textContent !== name) titleText.textContent = name;
  titleFlag.replaceChildren(...(flagKey === null ? [] : [flag(flagKey, 42, 28)]));
  // The way back says where it goes.
  const to = ctx.stage === 'site' ? ctx.body.name : ctx.stage === 'system' ? 'Title screen' : 'Solar system';
  if (backLabel.textContent !== to) backLabel.textContent = to;
  leaveButton.title = ctx.stage === 'system' ? 'Your traveller, and online or offline' : `Back to ${to}`;
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
  const { continueButton, crumbs, deps, dock, info, leaveButton, panel, root, search, select } = ctx;
  const flying = ctx.flight !== null;
  const open = ctx.chosen === null && !ctx.held;
  const settled = !flying && open;
  root.classList.toggle('flying', flying);
  root.classList.toggle('chosen', ctx.chosen !== null);
  root.classList.toggle('held', ctx.held);
  root.dataset.stage = ctx.stage;
  setOff(ctx, dock, !(ctx.stage === 'system' && settled));
  // The title goes with the panel under it while the camera flies, and both come back on landing.
  setOff(ctx, crumbs, !settled);
  setOff(ctx, panel, !((ctx.stage === 'region' || ctx.stage === 'site') && settled));
  setOff(ctx, info, !(ctx.stage === 'planet' && settled));
  setOff(ctx, search, !(open && ctx.stage !== 'planet'));
  // The towns' list is a panel of its own; a world's prompt is words under its name.
  // Changed only while it stands, so a panel fading out keeps the look it had.
  if (settled) panel.classList.toggle('m-glass', ctx.stage === 'site');
  refreshContinue(ctx);
  // The remembered place is offered only before a world is chosen: past that
  // the choice being made is the way in.
  setOff(ctx, continueButton, !open || ctx.stage !== 'system');
  // Every stage has a way back; the system's is to the title, where there is one.
  setOff(ctx, leaveButton, !settled || (ctx.stage === 'system' && deps.onLeave === undefined));
  // The town picked, or once chosen the landing it is waiting for — never
  // under the title, which holds the menu with neither.
  const selecting = ctx.chosen !== null || (open && ctx.stage === 'site' && ctx.picked !== null && !flying);
  setOff(ctx, select, !selecting);
  root.classList.toggle('picking', selecting);
  // Not under the title, which says how far the world is in its own card.
  if (flying || !open) closeResults(ctx);
  // Rewritten only while it stands: a title fading out keeps the name it had,
  // and the next one is written as it comes back.
  if (settled) refreshTrail(ctx);
}
