/**
 * Keyboard and mouse, with pointer lock.
 *
 * Pointer lock is not a nicety here: without it the cursor reaches the edge of
 * the window and the camera stops turning halfway through a look, which on a
 * planet you orbit constantly is unusable. The game still has to run unlocked
 * (the browser drops the lock on Escape and on every alt-tab), so nothing here
 * depends on holding it: losing the lock only stops the mouse look.
 */

export interface InputState {
  /** -1..1 each. x = strafe right, y = forward. Already normalised for diagonals. */
  move: { x: number; y: number };
  /** Mouse delta accumulated since the last frame, in radians. Reading it clears it. */
  look: { x: number; y: number };
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
  /** Call once per frame AFTER everything has read `state`; clears look delta and jump edge. */
  endFrame(): void;
  dispose(): void;
}

/** Radians of camera rotation per pixel of mouse movement. */
const SENSITIVITY = 0.0024;
/**
 * Chrome delivers one enormous delta on the frame the pointer is locked, and
 * again when the lock is regained after alt-tab. Nothing a hand does produces
 * this in a single event, so the event is dropped rather than clamped: clamped,
 * it still snaps the camera a quarter turn.
 */
const MAX_DELTA = 200;

const BINDINGS: Record<string, string> = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'run', ShiftRight: 'run',
  // Space is read twice: as an edge, which is the jump, and as a held key,
  // which is the climb. A plane that only climbed on the frame you pressed the
  // key would be a very tiring plane.
  Space: 'jump',
  KeyC: 'dive',
  KeyF: 'fly',
  KeyE: 'exit',
  // `V` for view, which is where three decades of third-person games put it.
  // Every other letter within reach of the movement hand is already spoken
  // for: C descends, E goes ashore, F flies.
  KeyV: 'view',
};

/** Actions that fire once per physical press rather than while held. */
const EDGES = new Set(['jump', 'fly', 'exit', 'view']);

export function createInput(target: HTMLElement): Input {
  const state: InputState = {
    move: { x: 0, y: 0 },
    look: { x: 0, y: 0 },
    run: false,
    jump: false,
    climb: false,
    dive: false,
    fly: false,
    exit: false,
    view: false,
  };

  const held = new Set<string>();
  let sensitivity = 1;
  const events = new AbortController();
  const { signal } = events;

  function refresh(): void {
    const x = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0);
    const y = (held.has('up') ? 1 : 0) - (held.has('down') ? 1 : 0);
    // A diagonal must not be faster than a straight line.
    const length = Math.hypot(x, y);
    const scale = length > 1 ? 1 / length : 1;
    state.move.x = x * scale;
    state.move.y = y * scale;
    state.run = held.has('run');
    state.climb = held.has('jump');
    state.dive = held.has('dive');
  }

  addEventListener('keydown', (event) => {
    // Leave the browser's own shortcuts alone.
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const action = BINDINGS[event.code];
    if (!action) return;
    event.preventDefault();
    // The edge fires once per physical press: `repeat` would otherwise make a
    // held Space into a jump every frame the key auto-repeats.
    if (EDGES.has(action) && !event.repeat && !held.has(action)) {
      state[action as 'jump' | 'fly' | 'exit' | 'view'] = true;
    }
    held.add(action);
    refresh();
  }, { signal });

  addEventListener('keyup', (event) => {
    const action = BINDINGS[event.code];
    if (!action) return;
    event.preventDefault();
    held.delete(action);
    refresh();
  }, { signal });

  // Without this a key held while the window loses focus never gets its keyup,
  // and you come back to the tab already running north.
  addEventListener('blur', () => {
    held.clear();
    refresh();
    state.jump = false;
    state.fly = false;
    state.exit = false;
    state.view = false;
    state.look.x = 0;
    state.look.y = 0;
  }, { signal });

  target.addEventListener('click', () => {
    if (document.pointerLockElement === target) return;
    // Chrome returns a promise that rejects if the lock is requested too soon
    // after Escape released it. An unhandled rejection there is noise, not news.
    const request: unknown = target.requestPointerLock();
    if (request instanceof Promise) request.catch(() => {});
  }, { signal });

  document.addEventListener('mousemove', (event) => {
    if (document.pointerLockElement !== target) return;
    if (Math.abs(event.movementX) > MAX_DELTA || Math.abs(event.movementY) > MAX_DELTA) return;
    state.look.x += event.movementX * SENSITIVITY * sensitivity;
    state.look.y += event.movementY * SENSITIVITY * sensitivity;
  }, { signal });

  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === target) return;
    state.look.x = 0;
    state.look.y = 0;
  }, { signal });

  return {
    state,
    get sensitivity() {
      return sensitivity;
    },
    set sensitivity(value: number) {
      sensitivity = Number.isFinite(value) && value > 0 ? value : 1;
    },
    endFrame() {
      state.look.x = 0;
      state.look.y = 0;
      state.jump = false;
      state.fly = false;
      state.exit = false;
      state.view = false;
    },
    dispose() {
      events.abort();
      if (document.pointerLockElement === target) document.exitPointerLock();
    },
  };
}
