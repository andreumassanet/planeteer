/** Showing a spread and turning to another: the 3D leaf, one-page-at-a-time stepping and swipes. */
import { h } from '../ui.ts';
import type { PassportCardOptions } from '../passport-card.ts';
import { TURN_MS } from './constants.ts';
import type { BookDom } from './dom.ts';
import { resize, single } from './sizing.ts';
import { spreads } from './model.ts';
import type { BookModel, Side } from './model.ts';

export interface Turner {
  /** Shows the spread the model is on. */
  showSpread(): void;
  /** Turns to a spread; a leaf crosses the spine unless motion is reduced. */
  turn(to: number): void;
  /** A page on or back; one page at a time slides to the other half before it turns the leaf. */
  stepPage(direction: 1 | -1): void;
  /** Ends a turn in the air at once. */
  settle(): void;
}

/** `chrome` refreshes the bookmarks and corners after the page changes. */
export function createTurner(
  model: BookModel,
  dom: BookDom,
  options: PassportCardOptions,
  signal: AbortSignal,
  chrome: () => void,
): Turner {
  const { left, right, book, previous, next, fit } = dom;
  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  /** The leaf in the air, and what finishes its turn. */
  let turning: { animation: Animation; shade: Animation[]; done: () => void } | null = null;

  function sideOf(index: number, side: Side): HTMLElement | null {
    const make = model.pages[index];
    return index < 0 || make === undefined ? null : make(side);
  }

  function fill(slot: HTMLElement, content: HTMLElement | null, label: string): void {
    slot.replaceChildren(...(content === null ? [] : [content]));
    slot.classList.toggle('blank', content === null);
    slot.setAttribute('aria-label', label);
  }

  function labelFor(index: number): string {
    return index === 0 ? 'Inside the cover' : index < 0 || index >= model.pages.length ? '' : `Page ${index}`;
  }

  function showSpread(): void {
    fill(left, sideOf(2 * model.spread, 'verso'), labelFor(2 * model.spread));
    fill(right, sideOf(2 * model.spread + 1, 'recto'), labelFor(2 * model.spread + 1));
    chrome();
  }

  function settle(): void {
    if (turning === null) return;
    const { animation, shade, done } = turning;
    turning = null;
    animation.cancel();
    for (const each of shade) each.cancel();
    done();
  }

  /**
   * Forward, the leaf is the right page lifting with the target's left page
   * on its back and the target's right page already underneath; backward is
   * the mirror over the spine. A jump of several spreads is one leaf too.
   */
  function swingLeaf(from: number, target: number): void {
    const step = target > from ? 1 : -1;
    const leaf = h('div', { class: `p-leaf ${step > 0 ? 'forward' : 'back'}` });
    const front = step > 0 ? sideOf(2 * from + 1, 'recto') : sideOf(2 * from, 'verso');
    const behind = step > 0 ? sideOf(2 * target, 'verso') : sideOf(2 * target + 1, 'recto');
    const frontShade = h('div', { class: 'p-shade' });
    const behindShade = h('div', { class: 'p-shade' });
    leaf.append(
      h('div', { class: 'p-face' }, front, frontShade),
      h('div', { class: 'p-face under' }, behind, behindShade),
    );
    if (step > 0) fill(right, sideOf(2 * target + 1, 'recto'), labelFor(2 * target + 1));
    else fill(left, sideOf(2 * target, 'verso'), labelFor(2 * target));
    book.append(leaf);
    chrome();
    const animation = leaf.animate(
      [{ transform: 'rotateY(0deg)' }, { transform: `rotateY(${step > 0 ? -180 : 180}deg)` }],
      { duration: TURN_MS, easing: 'cubic-bezier(0.35, 0.05, 0.25, 1)', fill: 'forwards' },
    );
    const shade = [
      frontShade.animate([{ opacity: 0 }, { opacity: 0.9 }], { duration: TURN_MS / 2, easing: 'ease-in', fill: 'forwards' }),
      behindShade.animate([{ opacity: 0.9 }, { opacity: 0 }], { duration: TURN_MS / 2, delay: TURN_MS / 2, easing: 'ease-out', fill: 'both' }),
    ];
    const done = (): void => {
      leaf.remove();
      if (step > 0) fill(left, sideOf(2 * target, 'verso'), labelFor(2 * target));
      else fill(right, sideOf(2 * target + 1, 'recto'), labelFor(2 * target + 1));
    };
    turning = { animation, shade, done };
    animation.onfinish = () => {
      if (turning?.animation === animation) settle();
    };
  }

  function turn(to: number): void {
    settle();
    const target = Math.max(0, Math.min(spreads(model) - 1, to));
    const landing = model.pendingHalf ?? 0;
    model.pendingHalf = null;
    if (target === model.spread) {
      if (single() && landing !== model.half) {
        model.half = landing;
        resize(model, dom);
      }
      return;
    }
    model.turned = true;
    const from = model.spread;
    model.spread = target;
    model.half = landing;
    if (single()) resize(model, dom);
    options.onTurn?.(Math.abs(target - from));
    if (calm.matches) {
      showSpread();
      return;
    }
    swingLeaf(from, target);
  }

  function stepPage(direction: 1 | -1): void {
    if (!single()) {
      turn(model.spread + direction);
      return;
    }
    settle();
    if (direction > 0 && model.half === 0) {
      model.half = 1;
      resize(model, dom);
    } else if (direction < 0 && model.half === 1) {
      model.half = 0;
      resize(model, dom);
    } else {
      model.pendingHalf = direction > 0 ? 0 : 1;
      turn(model.spread + direction);
    }
  }

  previous.addEventListener('click', () => stepPage(-1), { signal });
  next.addEventListener('click', () => stepPage(1), { signal });
  // A swipe across the page turns it, where one page is shown at a time.
  let swipeFrom: { id: number; x: number; y: number } | null = null;
  fit.addEventListener('pointerdown', (event) => {
    if (single()) swipeFrom = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }, { signal });
  fit.addEventListener('pointerup', (event) => {
    if (swipeFrom === null || event.pointerId !== swipeFrom.id) return;
    const dx = event.clientX - swipeFrom.x;
    const dy = event.clientY - swipeFrom.y;
    swipeFrom = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) stepPage(dx < 0 ? 1 : -1);
  }, { signal });
  fit.addEventListener('pointercancel', () => (swipeFrom = null), { signal });

  return { showSpread, turn, stepPage, settle };
}
