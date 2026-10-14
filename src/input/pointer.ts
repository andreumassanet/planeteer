/** The mouse: pointer lock, drag-to-look where the lock is refused, and the wheel. */
import { isTouch } from '../touch.ts';
import type { InputOptions } from '../input.ts';
import type { InputCore } from './core.ts';

/** Radians of camera rotation per pixel of mouse movement. */
const SENSITIVITY = 0.0024;
/**
 * Chrome delivers one enormous delta on the frame the pointer is locked, and
 * again when the lock is regained after alt-tab. Nothing a hand does produces
 * this in a single event, so the event is dropped rather than clamped (clamped,
 * it still snaps the camera a quarter turn). Only inside `LOCK_SETTLE` of the
 * lock changing, or a quick turn on a slow machine would be thrown away whole.
 */
const MAX_DELTA = 200;
const LOCK_SETTLE = 100;
/**
 * How soon after a release Chrome refuses a new lock as too soon, with margin:
 * about a second in Chrome's own implementation, which is not specified.
 */
const RELOCK_COOLDOWN = 1500;
/** A wheel "line", in the pixels a trackpad reports directly. */
const WHEEL_LINE = 33;

export function listenToMouse(core: InputCore, options: InputOptions): { lock(): void } {
  const { target, state, signal, fields, touch } = core;

  /**
   * A request came back refused. Chrome refuses one asked for too soon after
   * Escape released the last, which says nothing about the page, so it is
   * ignored. Any other says the page may not have the lock at all (an iframe
   * without `allow-pointer-lock`), and from then on a held button looks.
   */
  function refused(): void {
    if (!fields.asking) return;
    fields.asking = false;
    if (fields.dragging || performance.now() - fields.releasedAt < RELOCK_COOLDOWN) return;
    fields.dragging = true;
    fields.engaged = true;
    options.onLockRefused?.();
  }

  function lock(): void {
    // A finger has nothing to lock: the touch controls look by dragging.
    if (isTouch()) return;
    if (fields.dragging) fields.engaged = true;
    if (document.pointerLockElement === target) return;
    fields.asking = true;
    if (typeof target.requestPointerLock !== 'function') {
      refused();
      return;
    }
    try {
      // Chrome returns a promise that rejects with every refusal, and fires
      // `pointerlockerror` as well; both land in `refused`, and the first one
      // answers the request.
      const request: unknown = target.requestPointerLock();
      if (request instanceof Promise) request.catch(refused);
    } catch {
      refused();
    }
  }

  document.addEventListener('pointerlockerror', refused, { signal });

  target.addEventListener('mousedown', (event) => {
    touch();
    if (!fields.dragging) return;
    fields.engaged = true;
    fields.dragHeld = true;
    fields.settleUntil = performance.now() + LOCK_SETTLE;
    // Keep a drag from selecting the HUD's text or starting a native drag.
    event.preventDefault();
  }, { signal });
  addEventListener('mouseup', () => {
    fields.dragHeld = false;
  }, { signal });
  // A right-drag looks too, and should not open a menu at the end of it.
  target.addEventListener('contextmenu', (event) => {
    if (fields.dragging) event.preventDefault();
  }, { signal });

  target.addEventListener('click', () => {
    lock();
  }, { signal });

  document.addEventListener('mousemove', (event) => {
    touch();
    const locked = document.pointerLockElement === target;
    if (!locked && !(fields.dragging && fields.dragHeld)) return;
    if (
      performance.now() < fields.settleUntil &&
      (Math.abs(event.movementX) > MAX_DELTA || Math.abs(event.movementY) > MAX_DELTA)
    ) return;
    state.look.x += event.movementX * SENSITIVITY * fields.sensitivity;
    state.look.y += event.movementY * SENSITIVITY * fields.sensitivity;
  }, { signal });

  /**
   * The wheel, as pixels. Trackpads send dozens of small events and a mouse a
   * few large ones, and the camera reads the sum rather than the count, so both
   * come out as the same zoom for the same travel.
   */
  target.addEventListener('wheel', (event) => {
    touch();
    const unit = event.deltaMode === 1 ? WHEEL_LINE : event.deltaMode === 2 ? innerHeight : 1;
    state.zoom += event.deltaY * unit;
  }, { signal, passive: true });

  document.addEventListener('pointerlockchange', () => {
    touch();
    fields.asking = false;
    fields.settleUntil = performance.now() + LOCK_SETTLE;
    if (document.pointerLockElement === target) return;
    fields.releasedAt = performance.now();
    state.look.x = 0;
    state.look.y = 0;
  }, { signal });

  addEventListener('wheel', touch, { signal, passive: true });

  return { lock };
}
