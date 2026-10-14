/** The keys: held actions, edge-triggered presses, and letting go of everything when the window or a card takes focus. */
import { actionOf, inputBlocked } from '../controls.ts';
import type { InputCore } from './core.ts';

/** What `input.ts` does with each of the actions it owns. */
const HELD: Partial<Record<string, string>> = {
  forward: 'up',
  back: 'down',
  left: 'left',
  right: 'right',
  run: 'run',
  jump: 'jump',
  descend: 'dive',
  use: 'use',
  view: 'view',
};

/** Actions that fire once per physical press rather than while held. */
const EDGES = new Set(['jump', 'use', 'view']);

export function listenToKeys(core: InputCore): void {
  const { state, held, signal, fields, touch, refresh, release } = core;

  addEventListener('keydown', (event) => {
    touch();
    // Leave the browser's own shortcuts alone (`Ctrl+W` closes the tab).
    if (event.metaKey || event.altKey || event.ctrlKey) return;
    // Nor the settings card's slider, nor a search box: see `inputBlocked`.
    if (inputBlocked(event)) {
      release();
      return;
    }
    const bound = actionOf(event.code);
    const action = bound === undefined ? undefined : HELD[bound];
    if (action === undefined) {
      // Escape leaves drag mode the way it leaves the lock.
      if (event.code === 'Escape') fields.engaged = false;
      return;
    }
    event.preventDefault();
    // A modal or a lost window focus may have released this key. An old
    // auto-repeat must not start moving again without a fresh press.
    if (event.repeat && !held.has(event.code)) return;
    // The edge fires once per physical press: `repeat` would otherwise make a
    // held Space into a jump every frame the key auto-repeats.
    if (EDGES.has(action) && !event.repeat && !held.has(event.code)) {
      state[action as 'jump' | 'use' | 'view'] = true;
    }
    held.set(event.code, action);
    refresh();
  }, { signal });

  addEventListener('keyup', (event) => {
    touch();
    // macOS sends no keyup for a key released while Cmd is down, so Cmd+Tab
    // away with `W` held would walk north for ever. Letting go of Cmd is the one
    // event that is sure to arrive, so it lets go of everything.
    if (event.code === 'MetaLeft' || event.code === 'MetaRight') {
      release();
      return;
    }
    if (!held.delete(event.code)) return;
    if (!inputBlocked(event)) event.preventDefault();
    refresh();
  }, { signal });

  // Without this a key held while the window loses focus never gets its keyup,
  // and you come back to the tab already running north.
  addEventListener('blur', () => {
    release();
    fields.engaged = false;
    fields.dragHeld = false;
  }, { signal });

  addEventListener('focusin', (event) => {
    if (inputBlocked(event)) release();
  }, { signal });
}
