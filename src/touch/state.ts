/**
 * Whether the controls are a finger's: decided by the last pointer that went
 * down, starting from `pointer: coarse`. A laptop with a touch screen has both,
 * and should not lose its mouse look to a finger once used. The answer is
 * `touch-ui` on `<html>`, which the HUD's and the cards' layouts read.
 */
import { codeOf } from '../controls.ts';
import type { Action } from '../controls.ts';

const touchListeners = new Set<() => void>();
let touchOn = false;

function setTouch(on: boolean): void {
  if (on === touchOn) return;
  touchOn = on;
  document.documentElement.classList.toggle('touch-ui', on);
  for (const listener of touchListeners) listener();
}

if (typeof document !== 'undefined' && typeof addEventListener === 'function') {
  try {
    setTouch(matchMedia('(pointer: coarse)').matches);
  } catch {
    // No media queries: a mouse, until a finger says otherwise.
  }
  addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'touch') setTouch(true);
    else if (event.pointerType === 'mouse') setTouch(false);
  }, { capture: true });
}

/** Whether the controls are a finger's right now. */
export const isTouch = (): boolean => touchOn;

/** Called when that changes; returns the way to stop. */
export function onTouchChange(listener: () => void): () => void {
  touchListeners.add(listener);
  return () => touchListeners.delete(listener);
}

/**
 * An action pressed or let go of as its key would be. Sent from `<body>`,
 * which is neither a field nor a dialog's control, so `inputBlocked` answers
 * for the cards and nothing else.
 */
export function press(action: Action, down: boolean): void {
  const code = codeOf(action);
  document.body.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true, cancelable: true }));
}

/** A tap: down and up at once, for the actions that fire on the press. */
export function tap(action: Action): void {
  press(action, true);
  press(action, false);
}
