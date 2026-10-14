import { actionOf, inputBlocked } from '../controls.ts';
import type { MapSheet } from './sheet.ts';
import { renderTip } from './tip.ts';
import { prepareRings, prepareTowns } from './data.ts';
import { centreOnMe, resize, zoomAt } from './view.ts';

/**
 * Whether the sheet took the pointer lock as it opened (`s.relockOnHide`), and
 * so gives it back as it closes.
 */
export function show(s: MapSheet): void {
  const { lockTarget, sheet, root } = s;
  if (s.showing) return;
  s.showing = true;
  s.relockOnHide = lockTarget !== null && document.pointerLockElement === lockTarget;
  // The cursor is the whole point of this screen, and pointer lock is
  // holding it. `input.ts` already stops the mouse look the moment the lock
  // goes, so nothing else has to be told.
  if (document.pointerLockElement != null && typeof document.exitPointerLock === 'function') document.exitPointerLock();
  root.classList.add('on');
  sheet.focus({ preventScroll: true });
  resize(s);
  prepareRings(s);
  prepareTowns(s);
  s.hover = null;
  renderTip(s);
  centreOnMe(s);
  s.dirty = true;
}

export function hide(s: MapSheet, relock = s.relockOnHide): void {
  const { lockTarget, mapTiles, sheet, root, tip } = s;
  if (!s.showing) return;
  s.showing = false;
  s.relockOnHide = false;
  root.classList.remove('on');
  if (root.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
  tip.classList.remove('on');
  s.hover = null;
  s.press = null;
  sheet.classList.remove('drag');
  // A closed sheet paints nothing for itself: its screenful is let go to
  // the paper's own keeping.
  mapTiles.want('map', []);
  if (relock && lockTarget !== null && typeof lockTarget.requestPointerLock === 'function') {
    try {
      const request: unknown = lockTarget.requestPointerLock();
      if (request instanceof Promise) request.catch(() => {});
    } catch {
      // Some browsers throw synchronously when pointer lock is unavailable.
    }
  }
}

/** The map key, Escape and the zoom keys while it is open, and the window's resize. */
export function attachWindowEvents(s: MapSheet): void {
  const { options, root, signal } = s;
  const key = options.key;
  const isKey = (code: string): boolean => (key === undefined ? actionOf(code) === 'map' : code === key);
  if (key !== null) {
    addEventListener('keydown', (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      // A key pressed on the map's own controls is blocked for the world, the
      // map being a dialog, and is still the map's.
      const own = s.showing && event.target instanceof Node && root.contains(event.target);
      if (!own && inputBlocked(event)) return;
      if (isKey(event.code)) {
        event.preventDefault();
        if (!event.repeat) {
          if (s.showing) hide(s);
          else if (options.blocked?.() !== true) show(s);
        }
        return;
      }
      if (!s.showing) return;
      const action = actionOf(event.code);
      if (event.code === 'Escape') hide(s);
      else if (action === 'mapIn' || action === 'mapOut') {
        event.preventDefault();
        zoomAt(s, action === 'mapIn' ? 2 : 0.5, s.width / 2, s.height / 2);
        s.hover = null;
        renderTip(s);
      }
    }, { signal });
  }

  addEventListener('resize', () => {
    if (s.showing) {
      resize(s);
      renderTip(s);
    }
  }, { signal });
}
