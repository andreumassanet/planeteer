/**
 * The controls of a touch screen: a thumb on the left moves, a thumb on the
 * right looks, and a few round buttons in the right thumb's reach do what the
 * keys would.
 *
 * Only the buttons that do something are drawn, so the cluster is a function of
 * the travel mode (`layoutOf`), as the keys' hints are (`boardingHints` in
 * `controls.ts`): on foot one button, jump; in the air climb and descend; in a
 * car the horn. What `use` does (take the car, talk, get out) is a pill that
 * says so, shown only while there is something to use (`setUse`).
 *
 * The stick floats: it is wherever the left thumb lands, and rests as a faint
 * ring in the corner. It is analogue (half a push is a slow walk) and pushed
 * past its rim it runs (a car's boost, a horse's gallop), except in the air,
 * where the run key is the descent.
 *
 * A button is a key. Pressing one sends its bound key's `keydown` and letting go
 * its `keyup` (`press`), so everything that answers a key (`input.ts`'s held
 * set, the horn, the hints) answers the button without knowing about it. Only
 * what a key cannot say comes in by `TouchSink`: the stick's direction and
 * depth, a look, a pinch.
 *
 * Whether this is a touch screen is `touch/state.ts`'s to say.
 */
import { inputBlocked } from './controls.ts';
import type { TravelMode } from './controls.ts';
import { ensureStyle, installUi } from './ui.ts';
import { buildPadDom, createPadButtons } from './touch/buttons.ts';
import { STYLE } from './touch/style.ts';
import { createWorldTouch } from './touch/stick.ts';
import { isTouch } from './touch/state.ts';

export { layoutOf } from './touch/layout.ts';
export { isTouch, onTouchChange, press, tap } from './touch/state.ts';

/** What the touch controls write into, in `input.ts`. */
export interface TouchSink {
  /** The stick, -1..1 each and no longer than 1; `run` pushed past the rim. */
  steer(x: number, y: number, run: boolean): void;
  /** A look, in radians. */
  look(dx: number, dy: number): void;
  /** A pinch, in the wheel's pixels: positive pulls the camera back. */
  zoom(pixels: number): void;
}

export interface TouchPad {
  root: HTMLElement;
  /** The travel mode, which decides the buttons. */
  setMode(mode: TravelMode, airborne: boolean, stranded: boolean): void;
  /** What `use` does beside you, from the HUD's prompt, or null for nothing. */
  setUse(label: string | null, glyph: string): void;
  /** Every frame: put away while a card has the keys or the overlay is hidden. */
  frame(away: boolean): void;
  dispose(): void;
}

export function createTouchPad(sink: TouchSink, target: HTMLElement): TouchPad {
  installUi();
  ensureStyle('atlas-touch', STYLE);
  const events = new AbortController();
  const { signal } = events;

  const dom = buildPadDom();
  const { root } = dom;
  document.body.append(root);
  target.style.touchAction = 'none';

  let away = false;
  const buttons = createPadButtons(dom, signal);
  const world = createWorldTouch(dom, sink, target, signal, { stickRuns: buttons.stickRuns, isAway: () => away });

  /** Everything let go of: a card came up, the window went, the overlay was put away. */
  function releaseAll(): void {
    buttons.releaseButtons();
    world.releaseWorld();
  }
  addEventListener('blur', releaseAll, { signal });

  return {
    root,
    setMode: buttons.setMode,
    setUse: buttons.setUse,
    frame(hidden) {
      const next = hidden || !isTouch() || inputBlocked();
      if (next === away) return;
      away = next;
      root.classList.toggle('away', away);
      if (away) releaseAll();
    },
    dispose() {
      releaseAll();
      events.abort();
      root.remove();
    },
  };
}
