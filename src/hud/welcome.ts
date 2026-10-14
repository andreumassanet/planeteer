/** The welcome card, and the pause card that takes `Tab` while the mouse is free. */
import { holdFocus, labelOf, MOVE, registerModal, registerTabCard } from '../controls.ts';
import { isTouch } from '../touch.ts';
import { h, icon, type IconName, kbd } from '../ui.ts';
import type { HudCtx } from './ctx.ts';
import { capsOf } from './format.ts';

export function renderWelcome(ctx: HudCtx): void {
  const { welcomeList, welcomeSub, welcomeTitle } = ctx;
  welcomeTitle.textContent = 'The whole planet, to walk';
  welcomeSub.textContent = 'Every country is real. Come down in one and your passport is stamped.';
  const row = (caps: HTMLElement[], text: string): HTMLElement =>
    h('div', { class: 'atlas-welcome-row' }, h('span', {}, ...caps), h('span', { text }));
  if (isTouch()) {
    // What a finger does, said with the shapes it will find on the screen.
    const glyph = (name: IconName): HTMLElement => h('span', { class: 'atlas-hints-badge' }, icon(name));
    welcomeList.replaceChildren(
      row([glyph('walk')], 'Drag on the left to walk, further to run'),
      row([glyph('eye')], 'Drag on the right to look around, pinch to zoom'),
      row([glyph('car')], 'Walk up to a car, a boat or a plane, and tap to take it'),
      row([glyph('map')], 'Tap the little map for the whole planet'),
      row([glyph('menu')], 'The passport, the chat and the settings are in the menu'),
    );
    return;
  }
  welcomeList.replaceChildren(
    row([kbd(labelOf('map'))], 'The whole planet on one map: click anywhere to put a marker there'),
    row([kbd(labelOf('passport'))], 'Your passport, a stamp for every country'),
    row([kbd(labelOf('use'))], 'Walk up to a car, a boat or a plane and take it'),
    row(capsOf({ keys: MOVE, label: '' }), 'Walk into the sea and you swim'),
    row([kbd(labelOf('settings'))], 'Settings, and every key, which you can change'),
  );
}

function closeWelcome(ctx: HudCtx): void {
  const { welcomeRoot } = ctx;
  if (!ctx.welcoming) return;
  ctx.welcoming = false;
  welcomeRoot.classList.remove('on');
  // The focus goes back to the world rather than a control.
  (document.activeElement as HTMLElement | null)?.blur?.();
  // Unknown until the next frame says whether the button got the mouse.
  ctx.paused = null;
  ctx.finishWelcome?.();
  ctx.finishWelcome = null;
}

function pauseUp(ctx: HudCtx): boolean {
  return ctx.paused === true && !ctx.welcoming && ctx.pause.querySelector('button, input, select, a[href], [tabindex]') !== null;
}

export function bindWelcome(ctx: HudCtx): void {
  const { options, pause, signal, unregister, welcomeCard, welcomeGo } = ctx;
  unregister.push(registerModal(() => ctx.welcoming));

  welcomeGo.addEventListener('click', () => {
    // Inside the click, so the browser counts it as the player's gesture when the caller asks for the mouse.
    options.onStart?.();
    closeWelcome(ctx);
  }, { signal });

  // The pause card takes `Tab` from the player list while it has anything to focus.
  unregister.push(registerTabCard(() => pauseUp(ctx)));
  addEventListener('keydown', (event) => {
    if (pauseUp(ctx)) holdFocus(event, pause);
  }, { signal });
  addEventListener('keydown', (event) => {
    if (!ctx.welcoming) return;
    if (event.code === 'Escape') {
      event.preventDefault();
      closeWelcome(ctx);
    } else {
      // Modal means the focus as well as the keys.
      holdFocus(event, welcomeCard);
    }
  }, { signal });
}
