/**
 * The gear: every setting a player might want to touch, on one card.
 *
 * The card owns no state. Each row is a getter and a setter handed in by
 * `main.ts`, which owns the value and persists it; the keys keep working while
 * the card is down, and the card re-reads every value each time it opens.
 *
 * It takes the mouse the way the world map does: opening it releases pointer
 * lock, and closing it asks for the lock back only if it was held when the card
 * opened. It also holds the keyboard: it registers with `controls.ts` as modal,
 * so `Tab` walks its own controls and the arrows move its sliders instead of
 * the player.
 *
 * Pages on a rail down the left (graphics, sound, controls, account, credits), in
 * one card size whichever is open. The controls page lists every key in the
 * game; a cap is a button, and the next key pressed becomes that action's
 * (`captureKey` in `controls.ts`), `Esc` keeping the old one. `O` opens and
 * closes the card.
 *
 * The pages live in `settings/`.
 */

import { accountSeam } from './account.ts';
import {
  actionOf,
  holdFocus,
  inputBlocked,
  labelOf,
  onKeyLabels,
  registerModal,
} from './controls.ts';
import { h, icon, installUi, ensureStyle } from './ui.ts';
import { isTouch } from './touch.ts';
import { createControlsPage } from './settings/controls-page.ts';
import { createCreditsPage } from './settings/credits-page.ts';
import { createGraphicsPage } from './settings/graphics-page.ts';
import { createRail } from './settings/rail.ts';
import { createSoundPage } from './settings/sound-page.ts';
import { STYLE } from './settings/style.ts';
import type { Settings, SettingsOptions, SettingsPage } from './settings/types.ts';
import { createWidgets } from './settings/widgets.ts';

export type { Choice, Knob, Settings, SettingsOptions, SettingsPage, TimeOfDay, Toggle } from './settings/types.ts';

export function createSettings(options: SettingsOptions): Settings {
  installUi();
  ensureStyle('atlas-settings', STYLE);
  /** Every listener the card adds goes with it on `dispose`. */
  const events = new AbortController();
  const { signal } = events;
  const unregister: (() => void)[] = [];

  const root = h('div', { class: 'atlas-settings', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Settings' });
  const panel = h('div', { class: 'atlas-settings-panel ui-card' });
  root.append(panel);

  const close = h('button', { class: 'ui-btn icon atlas-settings-close', type: 'button', 'aria-label': 'Close' }, icon('close'));
  panel.append(
    h(
      'div',
      { class: 'atlas-settings-head' },
      h(
        'div',
        {},
        h('div', { class: 'atlas-settings-title', text: 'Settings' }),
        h('div', { class: 'atlas-settings-sub', text: 'Saved on this device, all but the time of day.' }),
      ),
      close,
    ),
  );

  const rail = createRail(panel, signal, () => controls.stopListening());
  const widgets = createWidgets(signal);
  const graphics = createGraphicsPage(options, widgets, signal);
  const sound = createSoundPage(options, widgets);
  const controls = createControlsPage(panel, signal, widgets, options);
  rail.fill('graphics', ...graphics.sections);
  rail.fill('sound', ...sound.sections);
  rail.tabs.get('sound')!.hidden = sound.hidden;
  rail.fill('controls', ...controls.sections);
  // The same Account page on every world's card: the page has one account, not a world.
  const account = accountSeam();
  rail.tabs.get('account')!.hidden = account === null;
  account?.mount(rail.pages.get('account')!, 'settings');
  rail.fill('credits', ...createCreditsPage());
  rail.turnTo('graphics');

  // What names a key, written again when `controls.ts` learns the layout or a
  // key is rebound.
  function relabel(): void {
    graphics.relabel();
    close.title = `Close (${labelOf('settings')} or ${labelOf('release')})`;
    close.setAttribute('aria-keyshortcuts', `${labelOf('settings')} Escape`);
    controls.renderBinds();
  }
  relabel();
  unregister.push(onKeyLabels(relabel));

  let showing = false;
  let relock = false;
  let previousFocus: HTMLElement | null = null;
  /** The clock keeps running while the panel is open, and so does its number. */
  let clockTimer = 0;

  function refresh(): void {
    graphics.refresh();
    controls.refresh();
    sound.refresh();
  }

  unregister.push(registerModal(() => showing));

  function show(next?: SettingsPage): void {
    if (next !== undefined) rail.turnTo(next);
    if (showing) return;
    showing = true;
    controls.say('');
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Read before `onOpen`, which may close the map; the map hands the lock back as it closes.
    relock = options.lockTarget !== null && document.pointerLockElement === options.lockTarget;
    options.onOpen?.();
    if (document.pointerLockElement != null && typeof document.exitPointerLock === 'function') document.exitPointerLock();
    // The keys and the mouse are nothing a finger has: no page for them.
    rail.tabs.get('controls')!.hidden = isTouch();
    if (rail.current() === 'controls' && isTouch()) rail.turnTo('graphics');
    refresh();
    root.classList.add('on');
    close.focus({ preventScroll: true });
    clockTimer = window.setInterval(() => graphics.tick(), 1000);
  }

  // The panel holds the mouse while it is up: something closed as it opened (the map) can
  // have its lock request granted a moment later, behind the card. A lock taken while the
  // card is up is handed straight back.
  document.addEventListener('pointerlockchange', () => {
    if (showing && document.pointerLockElement != null && typeof document.exitPointerLock === 'function') document.exitPointerLock();
  }, { signal });

  function hide(): void {
    if (!showing) return;
    controls.stopListening();
    showing = false;
    window.clearInterval(clockTimer);
    root.classList.remove('on');
    options.onClose?.();
    if (relock && options.lockTarget !== null && typeof options.lockTarget.requestPointerLock === 'function') {
      // Chrome refuses a lock asked for too soon after one was released; that
      // rejection is noise, the same rule `input.ts` and `map.ts` follow.
      try {
        const request: unknown = options.lockTarget.requestPointerLock();
        if (request instanceof Promise) request.catch(() => {});
      } catch {
        // Keep the panel closed if the browser refuses synchronously.
      }
    }
    (document.activeElement as HTMLElement | null)?.blur?.();
    if (!relock && previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    previousFocus = null;
  }

  close.addEventListener('click', hide, { signal });
  // A click on the dimmed backdrop closes it, a click on the card does not.
  root.addEventListener('pointerdown', (event) => {
    if (event.target === root) hide();
  }, { signal });
  // The world's keys are the world's only while the panel is down; everything a key did here
  // is a control on the card. A cap waiting for its key never lets one through (`captureKey`);
  // the card's own key closes it, except from a text field, where it is a letter.
  addEventListener('keydown', (event) => {
    if (!showing || controls.isListening()) return;
    if (event.code === 'Escape') {
      event.preventDefault();
      hide();
      return;
    }
    const typing = event.target instanceof HTMLInputElement && event.target.type === 'text';
    const plain = !event.ctrlKey && !event.metaKey && !event.altKey;
    if (plain && !typing && !event.repeat && actionOf(event.code) === 'settings') {
      event.preventDefault();
      hide();
      return;
    }
    holdFocus(event, panel);
  }, { signal });

  // And the card's key opens it, whenever the keys are the world's. Added after the listener
  // above, which has already seen this press and found the card shut: the other order
  // opened and closed the card on one key.
  addEventListener('keydown', (event) => {
    if (options.key === false || showing || event.repeat || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    if (actionOf(event.code) !== 'settings' || inputBlocked(event)) return;
    event.preventDefault();
    show();
  }, { signal });

  return {
    root,
    get open() {
      return showing;
    },
    show,
    hide,
    toggle() {
      if (showing) hide();
      else show();
    },
    dispose() {
      hide();
      window.clearInterval(clockTimer);
      events.abort();
      for (const off of unregister.splice(0)) off();
      root.remove();
    },
  };
}
