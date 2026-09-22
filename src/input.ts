/**
 * Keyboard and mouse, with pointer lock.
 *
 * Pointer lock is not a nicety here: without it the cursor reaches the edge of
 * the window and the camera stops turning halfway through a look, which on a
 * planet you orbit constantly is unusable. The game still has to run unlocked
 * (the browser drops the lock on Escape and on every alt-tab), so nothing here
 * depends on holding it: losing the lock only stops the mouse look.
 *
 * **And where the lock is refused outright there is a second way to look.** An
 * iframe without `allow-pointer-lock` — a portfolio embed, an itch.io page —
 * rejects every request, and until this existed it left the player with a
 * camera they could not turn at all. After the first refusal the mouse looks
 * while a button is held: drag to look, which is what every map on the web
 * already taught everyone.
 *
 * The bindings are `controls.ts`'s, and so is the answer to whether a key is
 * the world's at all.
 */
import { actionOf, inputBlocked } from './controls.ts';

export interface InputState {
  /** -1..1 each. x = strafe right, y = forward. Already normalised for diagonals. */
  move: { x: number; y: number };
  /** Mouse delta accumulated since the last frame, in radians. Reading it clears it. */
  look: { x: number; y: number };
  /**
   * Wheel travel accumulated since the last frame, in pixels, positive away
   * from the screen — pulling the camera back. Cleared by `endFrame`.
   */
  zoom: number;
  run: boolean;
  /** Edge-triggered: true for exactly one frame per press. */
  jump: boolean;
  /** Held. In the plane they are the altitude: Space climbs, C descends. */
  climb: boolean;
  dive: boolean;
  /** Edge-triggered. `fly` takes off and lands, `exit` steps out of the boat. */
  fly: boolean;
  exit: boolean;
  /** Edge-triggered: swaps the third-person rig for the avatar's own eye. */
  view: boolean;
}

export interface Input {
  state: InputState;
  /**
   * A multiplier on `SENSITIVITY`, 1 being the default. Settable live; the
   * settings panel owns the slider and `main.ts` owns where it is remembered.
   */
  sensitivity: number;
  /**
   * Whether the mouse is turning the camera right now: the lock is held, or,
   * where the lock is refused, the player has clicked into the world and not
   * left it since. The pause card is up whenever this is false.
   */
  readonly looking: boolean;
  /** True once the browser has refused the lock and drag-to-look took over. */
  readonly dragging: boolean;
  /**
   * Ask for the mouse. Call it from inside a click: the browser refuses a lock
   * asked for outside a user gesture.
   */
  lock(): void;
  /** When the input was last touched, from `performance.now()`. */
  readonly lastActive: number;
  /** Call once per frame AFTER everything has read `state`; clears look delta and jump edge. */
  endFrame(): void;
  dispose(): void;
}

export interface InputOptions {
  /** Once, the first time the lock is refused and dragging takes over. */
  onLockRefused?(): void;
}

/** Radians of camera rotation per pixel of mouse movement. */
const SENSITIVITY = 0.0024;
/**
 * Chrome delivers one enormous delta on the frame the pointer is locked, and
 * again when the lock is regained after alt-tab. Nothing a hand does produces
 * this in a single event, so the event is dropped rather than clamped: clamped,
 * it still snaps the camera a quarter turn.
 *
 * **Only inside `LOCK_SETTLE` of the lock changing.** The filter used to be on
 * all the time, and a mouse event is not a hand's movement, it is a frame's
 * worth of it: at 20 frames a second a fast flick is two hundred pixels an
 * event, so on exactly the machines that were already struggling a quick turn
 * was thrown away whole and the camera stuck. The jump the filter exists for
 * comes with the lock, so the filter does too.
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

/** What `input.ts` does with each of the actions it owns. */
const HELD: Partial<Record<string, string>> = {
  forward: 'up',
  back: 'down',
  left: 'left',
  right: 'right',
  run: 'run',
  jump: 'jump',
  descend: 'dive',
  fly: 'fly',
  ashore: 'exit',
  view: 'view',
};

/** Actions that fire once per physical press rather than while held. */
const EDGES = new Set(['jump', 'fly', 'exit', 'view']);

export function createInput(target: HTMLElement, options: InputOptions = {}): Input {
  const state: InputState = {
    move: { x: 0, y: 0 },
    look: { x: 0, y: 0 },
    zoom: 0,
    run: false,
    jump: false,
    climb: false,
    dive: false,
    fly: false,
    exit: false,
    view: false,
  };

  // Track physical keys independently: W and ArrowUp can both hold forward,
  // and releasing either must leave the other pressed.
  const held = new Map<string, string>();
  let sensitivity = 1;
  /** Until when a mouse delta over `MAX_DELTA` is the lock's jump rather than a hand. */
  let settleUntil = 0;
  /** The lock was refused and a held button looks instead. */
  let dragging = false;
  /** In drag mode: the player has clicked into the world. */
  let engaged = false;
  /** A button is down on the world, in drag mode. */
  let dragHeld = false;
  let lastActive = performance.now();
  const events = new AbortController();
  const { signal } = events;

  const touch = (): void => {
    lastActive = performance.now();
  };

  function refresh(): void {
    const actions = new Set(held.values());
    const x = (actions.has('right') ? 1 : 0) - (actions.has('left') ? 1 : 0);
    const y = (actions.has('up') ? 1 : 0) - (actions.has('down') ? 1 : 0);
    // A diagonal must not be faster than a straight line.
    const length = Math.hypot(x, y);
    const scale = length > 1 ? 1 / length : 1;
    state.move.x = x * scale;
    state.move.y = y * scale;
    state.run = actions.has('run');
    state.climb = actions.has('jump');
    state.dive = actions.has('dive');
  }

  function release(): void {
    held.clear();
    refresh();
    state.jump = false;
    state.fly = false;
    state.exit = false;
    state.view = false;
    state.look.x = 0;
    state.look.y = 0;
    state.zoom = 0;
  }

  addEventListener('keydown', (event) => {
    touch();
    // Leave the browser's own shortcuts alone.
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    // Nor the settings card's slider, nor a search box: see `inputBlocked`.
    if (inputBlocked(event)) {
      release();
      return;
    }
    const bound = actionOf(event.code);
    const action = bound === undefined ? undefined : HELD[bound];
    if (action === undefined) {
      // Escape leaves drag mode the way it leaves the lock.
      if (event.code === 'Escape') engaged = false;
      return;
    }
    event.preventDefault();
    // A modal or a lost window focus may have released this key. An old
    // auto-repeat must not start moving again without a fresh press.
    if (event.repeat && !held.has(event.code)) return;
    // The edge fires once per physical press: `repeat` would otherwise make a
    // held Space into a jump every frame the key auto-repeats.
    if (EDGES.has(action) && !event.repeat && !held.has(event.code)) {
      state[action as 'jump' | 'fly' | 'exit' | 'view'] = true;
    }
    held.set(event.code, action);
    refresh();
  }, { signal });

  addEventListener('keyup', (event) => {
    touch();
    // **macOS sends no keyup for a key released while Cmd is down**, so
    // Cmd+Tab away with `W` held and the player walks north for ever. Letting
    // go of Cmd is the one event that is sure to arrive, so it lets go of
    // everything.
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
    engaged = false;
    dragHeld = false;
  }, { signal });

  addEventListener('focusin', (event) => {
    if (inputBlocked(event)) release();
  }, { signal });

  /** When the lock was last let go of: Escape, alt-tab, a card taking the mouse. */
  let releasedAt = -Infinity;
  /**
   * A request of this file's own is waiting for its answer. **Only those
   * count**: the map and the settings ask for the lock back as they close, and
   * closed with Escape — which the browser does not count as a user gesture —
   * their request is refused for a reason that says nothing about the page.
   */
  let asking = false;

  /**
   * A request came back refused. **Chrome refuses one asked for too soon after
   * Escape released the last** — about a second — and that refusal says
   * nothing about the page, so it is ignored. Any other says the page may not
   * have the lock at all (an iframe without `allow-pointer-lock`), and from
   * then on a held button looks. Being wrong here is cheap: a click still asks
   * for the lock, and a lock that is granted is used.
   */
  function refused(): void {
    if (!asking) return;
    asking = false;
    if (dragging || performance.now() - releasedAt < RELOCK_COOLDOWN) return;
    dragging = true;
    engaged = true;
    options.onLockRefused?.();
  }

  function lock(): void {
    if (dragging) engaged = true;
    if (document.pointerLockElement === target) return;
    asking = true;
    if (typeof target.requestPointerLock !== 'function') {
      refused();
      return;
    }
    try {
      // Chrome returns a promise that rejects with every refusal, and fires
      // `pointerlockerror` as well; both land in `refused`, and the first one
      // answers the request. An unhandled rejection there is noise, not news.
      const request: unknown = target.requestPointerLock();
      if (request instanceof Promise) request.catch(refused);
    } catch {
      refused();
    }
  }

  document.addEventListener('pointerlockerror', refused, { signal });

  target.addEventListener('mousedown', (event) => {
    touch();
    if (!dragging) return;
    engaged = true;
    dragHeld = true;
    settleUntil = performance.now() + LOCK_SETTLE;
    // Keep a drag from selecting the HUD's text or starting a native drag.
    event.preventDefault();
  }, { signal });
  addEventListener('mouseup', () => {
    dragHeld = false;
  }, { signal });
  // A right-drag looks too, and should not open a menu at the end of it.
  target.addEventListener('contextmenu', (event) => {
    if (dragging) event.preventDefault();
  }, { signal });

  target.addEventListener('click', () => {
    lock();
  }, { signal });

  document.addEventListener('mousemove', (event) => {
    touch();
    const locked = document.pointerLockElement === target;
    if (!locked && !(dragging && dragHeld)) return;
    if (
      performance.now() < settleUntil &&
      (Math.abs(event.movementX) > MAX_DELTA || Math.abs(event.movementY) > MAX_DELTA)
    ) return;
    state.look.x += event.movementX * SENSITIVITY * sensitivity;
    state.look.y += event.movementY * SENSITIVITY * sensitivity;
  }, { signal });

  /**
   * The wheel, as pixels. Trackpads send dozens of small events and a mouse a
   * few large ones, and the camera reads the sum rather than the count, so
   * both come out as the same zoom for the same travel.
   */
  target.addEventListener('wheel', (event) => {
    touch();
    const unit = event.deltaMode === 1 ? WHEEL_LINE : event.deltaMode === 2 ? innerHeight : 1;
    state.zoom += event.deltaY * unit;
  }, { signal, passive: true });

  document.addEventListener('pointerlockchange', () => {
    touch();
    asking = false;
    settleUntil = performance.now() + LOCK_SETTLE;
    if (document.pointerLockElement === target) return;
    releasedAt = performance.now();
    state.look.x = 0;
    state.look.y = 0;
  }, { signal });

  addEventListener('wheel', touch, { signal, passive: true });

  return {
    get state() {
      // A card can open between key events. Clear the previous frame's held
      // input before the camera or the player consumes it behind that card.
      if (inputBlocked()) release();
      return state;
    },
    get sensitivity() {
      return sensitivity;
    },
    set sensitivity(value: number) {
      sensitivity = Number.isFinite(value) && value > 0 ? value : 1;
    },
    get looking() {
      return document.pointerLockElement === target || (dragging && engaged);
    },
    get dragging() {
      return dragging;
    },
    get lastActive() {
      return lastActive;
    },
    lock,
    endFrame() {
      state.look.x = 0;
      state.look.y = 0;
      state.zoom = 0;
      state.jump = false;
      state.fly = false;
      state.exit = false;
      state.view = false;
    },
    dispose() {
      events.abort();
      release();
      engaged = false;
      dragHeld = false;
      if (document.pointerLockElement === target) document.exitPointerLock();
    },
  };
}
