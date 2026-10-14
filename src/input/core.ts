/** What the keyboard and the mouse share: the state the game reads, the keys held, and the touch stick. */
import type { InputState } from '../input.ts';

export interface InputFields {
  /** A multiplier on the mouse sensitivity. */
  sensitivity: number;
  /** Until when a mouse delta over `MAX_DELTA` is the lock's jump rather than a hand. */
  settleUntil: number;
  /** The lock was refused and a held button looks instead. */
  dragging: boolean;
  /** In drag mode: the player has clicked into the world. */
  engaged: boolean;
  /** A button is down on the world, in drag mode. */
  dragHeld: boolean;
  /** When the input was last touched, from `performance.now()`. */
  lastActive: number;
  /** When the lock was last let go of: Escape, alt-tab, a card taking the mouse. */
  releasedAt: number;
  /**
   * A request of this file's own is waiting for its answer. Only those count:
   * the map and the settings ask for the lock back as they close, and closed with
   * Escape (which the browser does not count as a user gesture) their request is
   * refused for a reason that says nothing about the page.
   */
  asking: boolean;
}

export interface InputCore {
  readonly target: HTMLElement;
  readonly state: InputState;
  /** Physical keys held, tracked independently: W and ArrowUp can both hold forward. */
  readonly held: Map<string, string>;
  /** The touch stick (`touch.ts`): its direction, -1..1, and whether it is pushed past its rim. */
  readonly stick: { x: number; y: number; run: boolean };
  readonly events: AbortController;
  readonly signal: AbortSignal;
  readonly fields: InputFields;
  /** Notes that the input was just used. */
  touch(): void;
  /** Rebuilds the movement and held actions from the keys and the stick. */
  refresh(): void;
  /** Lets go of every key and clears the frame's edges and deltas. */
  release(): void;
}

export function createInputCore(target: HTMLElement): InputCore {
  const state: InputState = {
    move: { x: 0, y: 0 },
    look: { x: 0, y: 0 },
    zoom: 0,
    run: false,
    jump: false,
    climb: false,
    dive: false,
    use: false,
    view: false,
  };
  const held = new Map<string, string>();
  const stick = { x: 0, y: 0, run: false };
  const events = new AbortController();
  const fields: InputFields = {
    sensitivity: 1,
    settleUntil: 0,
    dragging: false,
    engaged: false,
    dragHeld: false,
    lastActive: performance.now(),
    releasedAt: -Infinity,
    asking: false,
  };

  const touch = (): void => {
    fields.lastActive = performance.now();
  };

  function refresh(): void {
    const actions = new Set(held.values());
    const x = (actions.has('right') ? 1 : 0) - (actions.has('left') ? 1 : 0);
    const y = (actions.has('up') ? 1 : 0) - (actions.has('down') ? 1 : 0);
    // A diagonal must not be faster than a straight line.
    const length = Math.hypot(x, y);
    const scale = length > 1 ? 1 / length : 1;
    // A held key wins; the stick, which is analogue, steers when none is.
    const keyed = x !== 0 || y !== 0;
    state.move.x = keyed ? x * scale : stick.x;
    state.move.y = keyed ? y * scale : stick.y;
    state.run = actions.has('run') || (!keyed && stick.run);
    state.climb = actions.has('jump');
    state.dive = actions.has('dive');
  }

  function release(): void {
    held.clear();
    stick.x = 0;
    stick.y = 0;
    stick.run = false;
    refresh();
    state.jump = false;
    state.use = false;
    state.view = false;
    state.look.x = 0;
    state.look.y = 0;
    state.zoom = 0;
  }

  return { target, state, held, stick, events, signal: events.signal, fields, touch, refresh, release };
}
