/**
 * Keyboard, mouse and touch, with pointer lock where the browser offers it.
 *
 * Pointer lock keeps the cursor from reaching the edge of the window and
 * stopping the camera halfway through a look. The game still runs unlocked (the
 * browser drops the lock on Escape and on every alt-tab), so nothing depends on
 * holding it: losing the lock only stops the mouse look. Where the lock is
 * refused outright (an iframe without `allow-pointer-lock`) the mouse looks
 * while a button is held instead. Touch screens use a joystick and drag-look.
 *
 * The bindings are `controls.ts`'s, and so is the answer to whether a key is
 * the world's at all. The keys live in `input/keyboard.ts`, the mouse in
 * `input/pointer.ts`, over the state in `input/core.ts`.
 */
import { inputBlocked } from './controls.ts';
import { createInputCore } from './input/core.ts';
import { listenToKeys } from './input/keyboard.ts';
import { listenToMouse } from './input/pointer.ts';
import { isTouch, type TouchSink } from './touch.ts';

export interface InputState {
  /** -1..1 each. x = strafe right, y = forward. Already normalised for diagonals. */
  move: { x: number; y: number };
  /** Camera delta accumulated since the last frame, in radians. Reading it clears it. */
  look: { x: number; y: number };
  /**
   * Wheel travel accumulated since the last frame, in pixels, positive away
   * from the screen — pulling the camera back. Cleared by `endFrame`.
   */
  zoom: number;
  run: boolean;
  /** Edge-triggered: true for exactly one frame per press. */
  jump: boolean;
  /** Held. In the air they are the altitude: Space climbs, C descends (and in an aircraft Shift too, `player.ts`). */
  climb: boolean;
  dive: boolean;
  /**
   * Held: a plane's stick, -1..1 each. `pitch` positive pulls the nose up,
   * `roll` positive rolls right.
   */
  attitude: { pitch: number; roll: number };
  /** Edge-triggered: a plane's flight switches between travel and aerobatics. */
  flightMode: boolean;
  /** Edge-triggered: get into the vehicle beside you, or out of the one you are in. */
  use: boolean;
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
   * Whether the player can turn the camera right now: the lock is held, or,
   * where the lock is refused, the player has clicked into the world and not
   * left it since, or the controls are a finger's, which never pause. The
   * pause card is up whenever this is false.
   */
  readonly looking: boolean;
  /** True once the browser has refused the lock and drag-to-look took over. */
  readonly dragging: boolean;
  /** What the touch controls (`touch.ts`) steer, look and pinch through. */
  readonly touchSink: TouchSink;
  /**
   * Ask for the mouse. Call it from inside a click: the browser refuses a lock
   * asked for outside a user gesture. A finger has nothing to lock.
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

export function createInput(target: HTMLElement, options: InputOptions = {}): Input {
  const core = createInputCore(target);
  const { state, stick, events, fields, touch, refresh, release } = core;
  listenToKeys(core);
  const { lock } = listenToMouse(core, options);

  return {
    get state() {
      // A card can open between key events. Clear the previous frame's held
      // input before the camera or the player consumes it behind that card.
      if (inputBlocked()) release();
      return state;
    },
    get sensitivity() {
      return fields.sensitivity;
    },
    set sensitivity(value: number) {
      fields.sensitivity = Number.isFinite(value) && value > 0 ? value : 1;
    },
    get looking() {
      return isTouch() || document.pointerLockElement === target || (fields.dragging && fields.engaged);
    },
    touchSink: {
      steer(x, y, run) {
        stick.x = x;
        stick.y = y;
        stick.run = run;
        refresh();
        touch();
      },
      look(dx, dy) {
        state.look.x += dx * fields.sensitivity;
        state.look.y += dy * fields.sensitivity;
        touch();
      },
      zoom(pixels) {
        state.zoom += pixels;
        touch();
      },
    },
    get dragging() {
      return fields.dragging;
    },
    get lastActive() {
      return fields.lastActive;
    },
    lock,
    endFrame() {
      state.look.x = 0;
      state.look.y = 0;
      state.zoom = 0;
      state.jump = false;
      state.use = false;
      state.view = false;
      state.flightMode = false;
    },
    dispose() {
      events.abort();
      release();
      fields.engaged = false;
      fields.dragHeld = false;
      if (document.pointerLockElement === target && typeof document.exitPointerLock === 'function') document.exitPointerLock();
    },
  };
}
