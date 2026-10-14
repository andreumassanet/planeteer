/** The keys of the moment shown on taking a vehicle, and every label that names a key. */
import { type Action, actionOf, type HintSet, inputBlocked, labelOf, onKeyLabels } from '../controls.ts';
import { onTouchChange } from '../touch.ts';
import { h, icon, kbd } from '../ui.ts';
import { HINT_HOLD, HINT_USED_HOLD, HINTED_KEY, MODE_ICON } from './constants.ts';
import type { HudCtx } from './ctx.ts';
import { capsOf } from './format.ts';
import { renderWelcome } from './welcome.ts';

/** The `once` hint sets used on this device. Reads and writes are wrapped: a private window throws. */
export function loadHinted(): Set<string> {
  const hinted = new Set<string>();
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(HINTED_KEY) ?? '[]');
    if (Array.isArray(stored)) for (const id of stored) if (typeof id === 'string') hinted.add(id);
  } catch {
    // Nothing remembered: every first-time hint is first-time again.
  }
  return hinted;
}

function markHinted(ctx: HudCtx, id: string): void {
  const { hinted } = ctx;
  if (hinted.has(id)) return;
  hinted.add(id);
  try {
    localStorage.setItem(HINTED_KEY, JSON.stringify([...hinted]));
  } catch {
    // Remembered for this visit only.
  }
}

/** The keys of the moment, drawn from the live bindings. */
function renderHints(ctx: HudCtx): void {
  const { hintsCard } = ctx;
  if (ctx.hintSet === null || ctx.mode === null) return;
  hintsCard.replaceChildren(
    h('span', { class: 'atlas-hints-badge' }, icon(MODE_ICON[ctx.mode])),
    ...ctx.hintSet.hints.map((hint) => h('span', {}, h('span', {}, ...capsOf(hint)), hint.label)),
  );
}

/** A new set for a new way of travelling, or none. */
export function showHints(ctx: HudCtx, next: HintSet | null): void {
  const { hinted, hintsCard } = ctx;
  const wanted = next !== null && ctx.hintsOn && !(next.once && hinted.has(next.id)) ? next : null;
  ctx.hintSet = wanted;
  ctx.hintFor = HINT_HOLD;
  if (wanted === null) {
    hintsCard.classList.remove('on');
    return;
  }
  renderHints(ctx);
  hintsCard.classList.add('on');
}

export function renderPause(ctx: HudCtx): void {
  const { pauseText, pauseTitle } = ctx;
  pauseTitle.textContent = ctx.dragLook ? 'Drag to look around' : 'Click to look around';
  pauseText.textContent = ctx.dragLook
    ? 'This page cannot lock the mouse, so hold a button and move it to turn the camera.'
    : `The mouse turns the camera. ${labelOf('release')} gives the cursor back.`;
}

/** Every label that names a key, rewritten when the layout or a binding changes. */
function relabel(ctx: HudCtx): void {
  const { mapButton, mapCap, passportButton, passportCap, promptKey, settingsButton, settingsCap } = ctx;
  const settingsKey = labelOf('settings');
  const mapKey = labelOf('map');
  settingsCap.textContent = settingsKey;
  mapCap.textContent = mapKey;
  settingsButton.title = `Settings (${settingsKey})`;
  settingsButton.setAttribute('aria-label', 'Settings');
  settingsButton.setAttribute('aria-keyshortcuts', settingsKey);
  mapButton.title = `World map (${mapKey})`;
  mapButton.setAttribute('aria-label', 'World map');
  mapButton.setAttribute('aria-keyshortcuts', mapKey);
  const passportKey = labelOf('passport');
  passportCap.textContent = passportKey;
  passportButton.title = `Passport (${passportKey})`;
  passportButton.setAttribute('aria-label', 'Passport');
  passportButton.setAttribute('aria-keyshortcuts', passportKey);
  if (ctx.promptShown !== null) promptKey.replaceChildren(kbd(labelOf('use')));
  renderPause(ctx);
  renderHints(ctx);
  if (ctx.welcoming) renderWelcome(ctx);
}

export function bindHints(ctx: HudCtx): void {
  const { signal, unregister } = ctx;
  relabel(ctx);
  unregister.push(onKeyLabels(() => relabel(ctx)));
  unregister.push(onTouchChange(() => relabel(ctx)));

  // A key of the moment pressed is a key found: the set goes shortly after, and one marked `once` is not shown again on this device.
  addEventListener('keydown', (event) => {
    if (ctx.hintSet === null || ctx.hintSet.sticky || event.repeat || inputBlocked(event)) return;
    const action = actionOf(event.code);
    if (action === undefined || !ctx.hintSet.hints.some((hint) => hint.keys.includes(action as Action))) return;
    if (ctx.hintSet.once) markHinted(ctx, ctx.hintSet.id);
    ctx.hintFor = Math.min(ctx.hintFor, HINT_USED_HOLD);
  }, { signal });
}

export function applyHidden(ctx: HudCtx): void {
  const { root } = ctx;
  root.classList.toggle('hidden', ctx.hidden);
  document.body.classList.toggle('atlas-hud-hidden', ctx.hidden);
}
