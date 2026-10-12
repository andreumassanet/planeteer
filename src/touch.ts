/**
 * The controls of a touch screen: a thumb on the left moves, a thumb on the
 * right looks, and a few round buttons in the right thumb's reach do what the
 * keys would.
 *
 * **Only the buttons that do something here are drawn.** A keyboard has every
 * key all the time and nobody minds; a screen covered in ten buttons, most of
 * them doing nothing on foot, is a dashboard over the world. So the cluster is
 * a function of the travel mode (`layoutOf`), as the keys' hints are
 * (`boardingHints` in `controls.ts`): on foot one button, jump; in the air
 * climb and descend; in a car the horn. What `use` does — take the car, talk,
 * get out — is never a standing button but a pill that says so, and only while
 * there is something to use (the HUD's own prompt, `setUse`).
 *
 * **The stick floats.** It is wherever the left thumb lands, in the lower part
 * of the left side of the screen, and rests as a faint ring in the corner to
 * say that it is there. It is analogue — half a push is a slow walk, which
 * `player.ts` already reads — and pushed past its rim it runs (a car's boost, a
 * horse's gallop); not in the air, where the run key is the descent.
 *
 * **A button is a key.** Pressing one sends its bound key's `keydown` and
 * letting go its `keyup` (`press`), so everything that answers a key —
 * `input.ts`'s held set, the horn held for as long as it is, the hints that go
 * once a key is found, Earth and the other worlds alike — answers the button
 * without knowing about it. Only what a key cannot say comes in by `TouchSink`:
 * the stick's direction and depth, a look, a pinch.
 *
 * Whether this is a touch screen is decided by the last pointer that went down
 * (`isTouch`), starting from `pointer: coarse`: a laptop with a touch screen
 * has both, and should not lose its mouse look to a finger once used. The
 * answer is `touch-ui` on `<html>`, which the HUD's and the cards' layouts read.
 */
import { codeOf, inputBlocked, type Action, type TravelMode } from './controls.ts';
import { ensureStyle, h, icon, installUi } from './ui.ts';

/** What the touch controls write into, in `input.ts`. */
export interface TouchSink {
  /** The stick, -1..1 each and no longer than 1; `run` pushed past the rim. */
  steer(x: number, y: number, run: boolean): void;
  /** A look, in radians. */
  look(dx: number, dy: number): void;
  /** A pinch, in the wheel's pixels: positive pulls the camera back. */
  zoom(pixels: number): void;
}

/* ------------------------------------------------------------------------- *
 * Whether the screen is touched
 * ------------------------------------------------------------------------- */

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

/* ------------------------------------------------------------------------- *
 * Which buttons, when
 * ------------------------------------------------------------------------- */

interface PadButton {
  action: Action;
  glyph: string;
  label: string;
}

interface PadLayout {
  /** The first is the big one under the thumb; at most two more beside it. */
  buttons: PadButton[];
  /** Whether a stick pushed past its rim is the run key: not where that key descends. */
  stickRuns: boolean;
  /** What `use` does here when nothing beside you offers more: getting out. */
  out: string | null;
}

const JUMP: PadButton = { action: 'jump', glyph: 'rise', label: 'Jump' };
const horn = (label = 'Horn'): PadButton => ({ action: 'horn', glyph: 'sound', label });
const up = (label: string): PadButton => ({ action: 'jump', glyph: 'rise', label });
const down = (label: string): PadButton => ({ action: 'descend', glyph: 'sink', label });

/** The cluster for a mode: `boardingHints`' lines, as buttons. */
export function layoutOf(mode: TravelMode, airborne: boolean, stranded: boolean): PadLayout {
  const bail = airborne ? 'Jump out' : 'Get out';
  switch (mode) {
    case 'foot':
      return { buttons: [JUMP], stickRuns: true, out: null };
    case 'swim':
      return { buttons: [up('Up'), down('Dive')], stickRuns: true, out: null };
    case 'submarine':
      return { buttons: [up('Rise'), down('Dive')], stickRuns: false, out: 'Get out' };
    case 'car':
    case 'boat':
    case 'jetski':
    case 'sailboat':
    case 'motorbike':
      return { buttons: [horn()], stickRuns: true, out: 'Get out' };
    case 'bicycle':
      return { buttons: [horn('Bell')], stickRuns: true, out: 'Get out' };
    case 'horse':
      return { buttons: [JUMP, horn('Snort')], stickRuns: true, out: 'Dismount' };
    case 'plane':
      return { buttons: airborne ? [up('Climb'), down('Descend')] : [], stickRuns: false, out: bail };
    case 'helicopter':
      return { buttons: airborne ? [up('Rise'), down('Descend')] : [up('Lift off')], stickRuns: false, out: bail };
    case 'balloon':
      return { buttons: [up('Rise'), down('Sink')], stickRuns: false, out: bail };
    case 'passenger':
      return { buttons: [], stickRuns: false, out: airborne && stranded ? 'Take the controls' : bail };
  }
}

/* ------------------------------------------------------------------------- *
 * The pad
 * ------------------------------------------------------------------------- */

/** Radians of turn per pixel a finger drags: a phone's width is about a third of a turn. */
const LOOK_PER_PIXEL = 0.0058;
/** The wheel's pixels per pixel of pinch. */
const ZOOM_PER_PIXEL = 3.2;
/** The stick's travel, in pixels from its centre to the full push. */
const STICK_REACH = 46;
/** Past the rim by this much, and the stick runs. */
const RUN_PAST = 1.3;
/** Under this much of a push the stick is at rest. */
const DEAD = 0.12;
/** The part of the screen a thumb lands on to move: the left, below the bar. */
const STICK_ZONE_X = 0.45;
const STICK_ZONE_Y = 0.28;

const STYLE = `
.atlas-touch {
  position: fixed;
  inset: 0;
  z-index: 4;
  display: none;
  pointer-events: none;
  font-family: var(--ui-font);
  color: var(--ui-ink);
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  transition: opacity 0.2s ease, visibility 0.2s;
}
html.touch-ui .atlas-touch { display: block; }
.atlas-touch.away { opacity: 0; visibility: hidden; }
.atlas-touch.away * { pointer-events: none !important; }

/* The stick: a ring at rest in the corner, and wherever the thumb lands. */
.tp-stick {
  position: absolute;
  left: calc(env(safe-area-inset-left) + 92px);
  top: calc(100% - env(safe-area-inset-bottom) - 100px);
  width: 120px;
  height: 120px;
  margin: -60px 0 0 -60px;
  box-sizing: border-box;
  border: 3px solid rgba(255, 242, 232, 0.85);
  border-radius: 50%;
  background: rgba(30, 6, 3, 0.24);
  box-shadow: 0 0 0 3px rgba(30, 6, 3, 0.28);
  opacity: 0.55;
  transition: opacity 0.2s ease, border-color 0.15s ease;
}
.tp-stick.held { opacity: 1; transition: border-color 0.15s ease; }
.tp-stick.running { border-color: var(--ui-gold); }
.tp-nub {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 52px;
  height: 52px;
  margin: -26px 0 0 -26px;
  box-sizing: border-box;
  border: 3px solid var(--ui-ink);
  border-radius: 50%;
  background: var(--ui-paper);
  box-shadow: 0 4px 0 var(--ui-ink);
}
.tp-stick.held .tp-nub { background: var(--ui-gold); }
.tp-run {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 10px);
  transform: translateX(-50%);
  padding: 3px 9px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  background: var(--ui-gold);
  border: 2.5px solid var(--ui-ink);
  border-radius: 999px;
  box-shadow: 0 3px 0 var(--ui-ink);
  opacity: 0;
  transition: opacity 0.12s ease;
}
.tp-stick.running .tp-run { opacity: 1; }

/* The buttons, round the primary's centre in the right thumb's arc. */
.tp-actions {
  position: absolute;
  right: calc(env(safe-area-inset-right) + 62px);
  bottom: calc(env(safe-area-inset-bottom) + 66px);
  width: 0;
  height: 0;
}
.tp-btn {
  position: absolute;
  left: calc(var(--x) - var(--size) / 2);
  top: calc(var(--y) - var(--size) / 2);
  width: var(--size);
  height: var(--size);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 0;
  box-sizing: border-box;
  border: 3px solid var(--ui-ink);
  border-radius: 50%;
  background: var(--ui-paper);
  color: var(--ui-ink);
  box-shadow: 0 5px 0 var(--ui-ink);
  font: 800 10.5px/1 var(--ui-font);
  letter-spacing: -0.01em;
  pointer-events: auto;
  touch-action: none;
  -webkit-tap-highlight-color: transparent;
  transition: transform 0.08s ease, box-shadow 0.08s ease;
  animation: tp-in 0.28s var(--ui-spring) both;
}
.tp-btn svg { width: 24px; height: 24px; }
.tp-btn.primary { background: var(--ui-gold); font-size: 11.5px; }
.tp-btn.primary svg { width: 30px; height: 30px; }
.tp-btn.on { transform: translateY(4px); box-shadow: 0 1px 0 var(--ui-ink); }

/* What use does here: a pill over the buttons, only while there is one. */
.tp-use {
  position: absolute;
  right: calc(env(safe-area-inset-right) + 18px);
  bottom: calc(env(safe-area-inset-bottom) + 186px);
  display: flex;
  align-items: center;
  gap: 9px;
  max-width: min(300px, calc(100vw - 190px));
  height: 50px;
  padding: 0 16px 0 6px;
  box-sizing: border-box;
  border: 3px solid var(--ui-ink);
  border-radius: 999px;
  background: var(--ui-paper);
  color: var(--ui-ink);
  box-shadow: 0 5px 0 var(--ui-ink);
  font: 800 15px/1.1 var(--ui-font);
  letter-spacing: -0.01em;
  pointer-events: auto;
  touch-action: none;
  -webkit-tap-highlight-color: transparent;
  opacity: 0;
  visibility: hidden;
  transform: translateY(8px) scale(0.96);
  transition: opacity 0.15s ease, transform 0.25s var(--ui-spring), visibility 0.15s, box-shadow 0.08s ease;
}
.tp-use.lower { bottom: calc(env(safe-area-inset-bottom) + 122px); }
.tp-use.show { opacity: 1; visibility: visible; transform: none; }
.tp-use.on { transform: translateY(4px); box-shadow: 0 1px 0 var(--ui-ink); }
.tp-use-icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 34px;
  height: 34px;
  box-sizing: border-box;
  border: 2.5px solid var(--ui-ink);
  border-radius: 50%;
  background: var(--ui-gold);
}
.tp-use-icon svg { width: 19px; height: 19px; }
.tp-use-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* A short landscape phone: everything a little smaller and lower. */
@media (orientation: landscape) and (max-height: 500px) {
  .tp-stick { width: 108px; height: 108px; margin: -54px 0 0 -54px; left: calc(env(safe-area-inset-left) + 86px); top: calc(100% - env(safe-area-inset-bottom) - 80px); }
  .tp-actions { right: calc(env(safe-area-inset-right) + 56px); bottom: calc(env(safe-area-inset-bottom) + 52px); }
  .tp-use { bottom: calc(env(safe-area-inset-bottom) + 160px); }
  .tp-use.lower { bottom: calc(env(safe-area-inset-bottom) + 104px); }
}
@keyframes tp-in { from { opacity: 0; transform: scale(0.6); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) {
  .tp-btn { animation: none; }
  .tp-use, .tp-use.show { transform: none; }
}
`;

/** Where the buttons sit round the primary's centre: under the thumb, left of it, above-left. */
const SLOTS = [
  { x: 0, y: 0, size: 78 },
  { x: -96, y: 12, size: 58 },
  { x: -68, y: -76, size: 58 },
];

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

  const nub = h('div', { class: 'tp-nub' });
  const stick = h('div', { class: 'tp-stick', 'aria-hidden': 'true' }, nub, h('span', { class: 'tp-run', text: 'Run' }));
  const actions = h('div', { class: 'tp-actions' });
  const useIcon = h('span', { class: 'tp-use-icon' });
  const useText = h('span', { class: 'tp-use-text' });
  const use = h('button', { class: 'tp-use', type: 'button' }, useIcon, useText);
  const root = h('div', { class: 'atlas-touch', 'aria-label': 'Touch controls' }, stick, actions, use);
  document.body.append(root);
  target.style.touchAction = 'none';

  /* --- the buttons -------------------------------------------------------- */

  /** Which pointer holds which action down, so a lift lets go of the right one. */
  const holding = new Map<number, { action: Action; element: HTMLElement }>();

  function hold(element: HTMLElement, action: Action, event: PointerEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (holding.has(event.pointerId)) return;
    element.setPointerCapture(event.pointerId);
    holding.set(event.pointerId, { action, element });
    element.classList.add('on');
    navigator.vibrate?.(8);
    press(action, true);
  }

  function letGo(pointer: number): void {
    const held = holding.get(pointer);
    if (held === undefined) return;
    holding.delete(pointer);
    held.element.classList.remove('on');
    press(held.action, false);
  }

  function bindButton(element: HTMLElement, action: () => Action): void {
    element.addEventListener('pointerdown', (event) => hold(element, action(), event), { signal });
    element.addEventListener('pointerup', (event) => letGo(event.pointerId), { signal });
    element.addEventListener('pointercancel', (event) => letGo(event.pointerId), { signal });
    element.addEventListener('contextmenu', (event) => event.preventDefault(), { signal });
  }
  bindButton(use, () => 'use');

  let layoutKey = '';
  let layout: PadLayout = layoutOf('foot', false, false);
  let useLabel: string | null = null;
  let useGlyph = 'walk';

  function renderButtons(): void {
    for (const pointer of [...holding.keys()]) if (holding.get(pointer)!.element !== use) letGo(pointer);
    actions.replaceChildren(
      ...layout.buttons.slice(0, SLOTS.length).map((button, i) => {
        const slot = SLOTS[i]!;
        const element = h(
          'button',
          {
            class: i === 0 ? 'tp-btn primary' : 'tp-btn',
            type: 'button',
            'aria-label': button.label,
            style: `--x: ${slot.x}px; --y: ${slot.y}px; --size: ${slot.size}px`,
          },
          icon(button.glyph, 24),
          h('span', { text: button.label }),
        );
        bindButton(element, () => button.action);
        return element;
      }),
    );
    renderUse();
  }

  function renderUse(): void {
    const label = useLabel ?? layout.out;
    use.classList.toggle('show', label !== null);
    // With nothing above-left of the primary the pill comes down to it.
    use.classList.toggle('lower', layout.buttons.length < 3);
    if (label === null) {
      if (holding.size > 0) for (const [pointer, held] of holding) if (held.element === use) letGo(pointer);
      return;
    }
    if (useText.textContent !== label) useText.textContent = label;
    const glyph = useLabel === null ? 'back' : useGlyph;
    if (use.dataset.glyph !== glyph) {
      use.dataset.glyph = glyph;
      useIcon.replaceChildren(icon(glyph, 19));
    }
    use.setAttribute('aria-label', label);
  }

  /* --- the stick ---------------------------------------------------------- */

  let stickPointer: number | null = null;
  let originX = 0;
  let originY = 0;

  function moveStick(x: number, y: number): void {
    const dx = x - originX;
    const dy = y - originY;
    const length = Math.hypot(dx, dy);
    const clamp = length > STICK_REACH ? STICK_REACH / length : 1;
    nub.style.transform = `translate(${(dx * clamp).toFixed(1)}px, ${(dy * clamp).toFixed(1)}px)`;
    const depth = Math.min(1, length / STICK_REACH);
    const running = layout.stickRuns && length > STICK_REACH * RUN_PAST;
    stick.classList.toggle('running', running);
    if (depth < DEAD) {
      sink.steer(0, 0, false);
      return;
    }
    // Out of the dead zone the push starts from nothing, not from the zone's edge.
    const scale = ((depth - DEAD) / (1 - DEAD)) / (length || 1);
    sink.steer(dx * scale, -dy * scale, running);
  }

  function dropStick(): void {
    stickPointer = null;
    stick.classList.remove('held', 'running');
    stick.style.left = '';
    stick.style.top = '';
    nub.style.transform = '';
    sink.steer(0, 0, false);
  }

  /* --- looking and pinching ---------------------------------------------- */

  const looks = new Map<number, { x: number; y: number }>();
  let pinch = 0;

  function spread(): number {
    const [a, b] = [...looks.values()];
    return a === undefined || b === undefined ? 0 : Math.hypot(a.x - b.x, a.y - b.y);
  }

  target.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'touch' || away || inputBlocked()) return;
    event.preventDefault();
    const inZone = event.clientX < innerWidth * STICK_ZONE_X && event.clientY > innerHeight * STICK_ZONE_Y;
    if (stickPointer === null && inZone) {
      stickPointer = event.pointerId;
      // Never so near an edge that the ring is cut off.
      const room = stick.offsetWidth / 2 + 6;
      originX = Math.max(room, event.clientX);
      originY = Math.min(innerHeight - room, Math.max(room, event.clientY));
      stick.style.left = `${originX}px`;
      stick.style.top = `${originY}px`;
      stick.classList.add('held');
      moveStick(event.clientX, event.clientY);
    } else {
      looks.set(event.pointerId, { x: event.clientX, y: event.clientY });
      pinch = spread();
    }
    target.setPointerCapture(event.pointerId);
  }, { signal });

  target.addEventListener('pointermove', (event) => {
    if (event.pointerId === stickPointer) {
      moveStick(event.clientX, event.clientY);
      return;
    }
    const last = looks.get(event.pointerId);
    if (last === undefined) return;
    const dx = event.clientX - last.x;
    const dy = event.clientY - last.y;
    last.x = event.clientX;
    last.y = event.clientY;
    if (looks.size >= 2) {
      // Two fingers on the world pinch the camera nearer and further; they do not look.
      const now = spread();
      if (pinch > 0) sink.zoom(-(now - pinch) * ZOOM_PER_PIXEL);
      pinch = now;
      return;
    }
    sink.look(dx * LOOK_PER_PIXEL, dy * LOOK_PER_PIXEL);
  }, { signal });

  const lift = (event: PointerEvent): void => {
    if (event.pointerId === stickPointer) dropStick();
    if (looks.delete(event.pointerId)) pinch = spread();
  };
  target.addEventListener('pointerup', lift, { signal });
  target.addEventListener('pointercancel', lift, { signal });
  target.addEventListener('contextmenu', (event) => {
    if (isTouch()) event.preventDefault();
  }, { signal });

  /** Everything let go of: a card came up, the window went, the overlay was put away. */
  function releaseAll(): void {
    for (const pointer of [...holding.keys()]) letGo(pointer);
    if (stickPointer !== null) dropStick();
    looks.clear();
    pinch = 0;
  }
  addEventListener('blur', releaseAll, { signal });

  let away = false;
  renderButtons();

  return {
    root,
    setMode(mode, airborne, stranded) {
      const key = `${mode}:${airborne}:${stranded}`;
      if (key === layoutKey) return;
      layoutKey = key;
      const next = layoutOf(mode, airborne, stranded);
      const same = next.buttons.length === layout.buttons.length
        && next.buttons.every((button, i) => button.action === layout.buttons[i]!.action && button.label === layout.buttons[i]!.label);
      layout = next;
      if (same) renderUse();
      else renderButtons();
    },
    setUse(label, glyph) {
      if (label === useLabel && glyph === useGlyph) return;
      useLabel = label;
      useGlyph = glyph;
      renderUse();
    },
    frame(hidden) {
      const next = hidden || !touchOn || inputBlocked();
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
