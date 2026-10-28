/**
 * Every key in the world, and the one answer to whether a key belongs to it.
 *
 * One table binds every action, and the player can move any of it: the settings'
 * controls page rebinds an action by the next key pressed (`rebind`), kept in
 * `localStorage`. A binding is a physical key (`event.code`), which names a
 * position on the keyboard and not a letter, so `W` is the key above `S` on every
 * layout; where the browser can say what a position prints the caps say it
 * (`keyLabel`), and every cap, prompt and hint in the game asks `labelOf` when it
 * draws and redraws on `onKeyLabels`.
 *
 * The lists that teach the keys are `controls/hints.ts`; `controls/focus.ts`
 * holds the one predicate that says when the keys are not the world's
 * (`inputBlocked`): a modal card is up, a field has the key, or an input method
 * is composing.
 */
import type { Action, Captured, Pointer, Rebound } from './controls/types.ts';

export type {
  Action,
  Captured,
  ControlRow,
  HintSet,
  KeyHint,
  Pointer,
  Rebound,
  TravelMode,
} from './controls/types.ts';
export { CONTROL_SECTIONS, MOVE, boardingHints } from './controls/hints.ts';
export { holdFocus, inputBlocked, modalOpen, registerModal, registerTabCard, tabTaken } from './controls/focus.ts';

/**
 * The bindings a new player gets, as `event.code`s. The first code of each is
 * the one its cap shows and the one the settings rebind; the rest are
 * alternatives, which a rebinding leaves alone.
 */
export const DEFAULT_BINDINGS: Readonly<Record<Action, readonly string[]>> = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  run: ['ShiftLeft', 'ShiftRight'],
  // Space is read twice: as an edge, the jump, and as a held key, the climb. In
  // an aircraft `Shift` goes down too (`liftOf` in `player/flight.ts`), and so
  // does `C`, which is also the dive.
  jump: ['Space'],
  // Not `Ctrl`: held for a descent with `W` for the throttle it is `Ctrl+W`,
  // which closes the tab and which no page can cancel.
  descend: ['KeyC'],
  // `E` for everything a vehicle asks: get in, take the wheel, get out. It also
  // talks to whoever is nearer than any seat, and moves a conversation on.
  use: ['KeyE'],
  // `Q` for the horn, at the controls of anything that has one (`HORN_OF` in
  // `craft/contract.ts`); `H`, the letter a horn would want, hides the overlay.
  horn: ['KeyQ'],
  // A light plane's stick, as `I J K L` and the numpad's arrows: `I` pushes the
  // nose down and `K` pulls it up, `J` and `L` roll. In travel they descend,
  // climb and roll into a turn; only `X` switches between travel and
  // aerobatics (`player/aerobatics.ts`), where they are the stick itself.
  pitchDown: ['KeyI', 'Numpad8'],
  pitchUp: ['KeyK', 'Numpad5'],
  rollLeft: ['KeyJ', 'Numpad4'],
  rollRight: ['KeyL', 'Numpad6'],
  flightMode: ['KeyX'],
  view: ['KeyV'],
  map: ['KeyM'],
  // Not `Esc`, which the browser spends on freeing the mouse.
  settings: ['KeyO'],
  // Held, the list of who is playing (`player-list.ts`).
  players: ['Tab'],
  flags: ['KeyB'],
  nearer: ['BracketLeft'],
  farther: ['BracketRight'],
  // The whole overlay off and on again, for a clear look at the world.
  hud: ['KeyH'],
  photo: ['KeyP'],
  // Photo mode (`app/photo-mode.ts`): a free camera, the lens and the look; `P` still takes the picture.
  photoMode: ['KeyR'],
  // The chat's field (`chat.ts`). `Enter` opens it only when nothing on the page
  // has the focus, so a button a keyboard has reached still presses on `Enter`.
  chat: ['Enter', 'KeyT', 'NumpadEnter'],
  // A wave where the others can see it, and a dance, on until the body moves.
  wave: ['KeyG'],
  dance: ['KeyF'],
  // The passport (`passport-card.ts`): `N` for notebook; `J` is the plane's roll.
  passport: ['KeyN'],
  // The world map's zoom while it is up: `Tab` on the map is the landmarks'.
  mapIn: ['Equal', 'NumpadAdd'],
  mapOut: ['Minus', 'NumpadSubtract'],
  // The browser's, not ours: it frees the mouse and nothing can bind it.
  release: ['Escape'],
};

const ACTIONS = Object.keys(DEFAULT_BINDINGS) as Action[];

/**
 * The bindings in force: the defaults with the player's own choices over them.
 * One code is bound to at most one action, which `rebind` keeps true and
 * `loadBindings` refuses to read past.
 */
const live = Object.fromEntries(ACTIONS.map((action) => [action, [...DEFAULT_BINDINGS[action]]])) as Record<Action, string[]>;

/** The bindings in force, for reading. `rebind` and `resetBindings` change them. */
export const BINDINGS: Readonly<Record<Action, readonly string[]>> = live;

const byCode = new Map<string, Action>();
function index(): void {
  byCode.clear();
  for (const action of ACTIONS) for (const code of live[action]) byCode.set(code, action);
}

/** The action a physical key is bound to, if any. */
export const actionOf = (code: string): Action | undefined => byCode.get(code);

/** The key that stands for an action: the first of its bindings. */
export const codeOf = (action: Action): string => live[action][0]!;

/** Called whenever the labels may have changed: the layout arrived, or a key was rebound. */
const labelListeners = new Set<() => void>();

/** Where the player's own bindings are kept: only the actions they changed. */
const STORAGE_KEY = 'atlas.keys.v1';

/**
 * Keys nothing may be bound to. `Esc` is the browser's way out of pointer lock
 * and every card's way out of itself; `/` opens the chat with the slash typed;
 * the system keys and the function keys are the browser's own; and `Ctrl`, since
 * every listener leaves a press with `ctrlKey` set to the browser (`input.ts`),
 * so a binding to it would never fire.
 */
const RESERVED = new Set([
  'Escape',
  'Slash',
  'ControlLeft',
  'ControlRight',
  'MetaLeft',
  'MetaRight',
  'OSLeft',
  'OSRight',
  'AltLeft',
  'AltRight',
  'ContextMenu',
  'CapsLock',
  'F5',
  'F11',
  'F12',
]);

/** Whether a physical key may be given to an action at all. */
export const keyBindable = (code: string): boolean => code !== '' && code !== 'Unidentified' && !RESERVED.has(code);

/** Whether the player may choose this action's key: all but `release`, which is the browser's. */
export const actionBindable = (action: Action): boolean => action !== 'release';

function notify(): void {
  for (const listener of labelListeners) listener();
}

function save(): void {
  const changed: Partial<Record<Action, string[]>> = {};
  for (const action of ACTIONS) {
    const now = live[action];
    const was = DEFAULT_BINDINGS[action];
    if (now.length !== was.length || now.some((code, i) => code !== was[i])) changed[action] = [...now];
  }
  // A private window throws on the getter, a full disk on the write: the
  // bindings hold for this visit either way.
  try {
    if (Object.keys(changed).length === 0) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(changed));
  } catch {
    // Not remembered, and nothing else lost.
  }
}

/**
 * Puts `code` on `action` as its own key. A key another action had as its own is
 * swapped: that action takes this one's old key, so nothing is ever left without
 * one. A key another action had as a spare is simply taken from it. The old key
 * of `action` is dropped, not kept as a spare.
 *
 * `slot` is which of the action's keys changes: 0, its own, or a later one, its
 * second key, under the same rules; one past the last adds a key. A key wanted
 * for a slot that holds none yet, from an action that has no other, is refused
 * (`ok` false): there is no old key to give that action back.
 */
export function rebind(action: Action, code: string, slot = 0): Rebound {
  const refused: Rebound = { ok: false, swapped: null, took: null };
  const own = live[action];
  if (!actionBindable(action) || !keyBindable(code) || slot < 0 || slot > own.length) return refused;
  // Already this key, or, for a second key, already the action's own.
  if (own[slot] === code || (slot > 0 && own[0] === code)) return { ok: true, swapped: null, took: null };
  const old = own[slot];
  let swapped: Action | null = null;
  let took: Action | null = null;
  const holder = byCode.get(code);
  if (holder !== undefined && holder !== action) {
    const theirs = live[holder];
    if (theirs[0] !== code) {
      live[holder] = theirs.filter((other) => other !== code);
      took = holder;
    } else if (old !== undefined) {
      live[holder] = [old, ...theirs.slice(1)];
      swapped = holder;
    } else if (theirs.length > 1) {
      // Their own key, and they have another to fall back on.
      live[holder] = theirs.slice(1);
      took = holder;
    } else {
      return refused;
    }
  }
  const next = [...own];
  next[slot] = code;
  live[action] = next.filter((other, i) => i === slot || other !== code);
  index();
  save();
  notify();
  return { ok: true, swapped, took };
}

/** Every action back on the keys a new player gets. */
export function resetBindings(): void {
  for (const action of ACTIONS) live[action] = [...DEFAULT_BINDINGS[action]];
  index();
  save();
  notify();
}

/** Whether any binding differs from the defaults. */
export function bindingsChanged(): boolean {
  return ACTIONS.some((action) => live[action].join() !== DEFAULT_BINDINGS[action].join());
}

/**
 * Listens for the next key and binds it to `action` at `slot` (`rebind`): the
 * settings' controls page, and `pnpm input`, which drives it with real events.
 * Returns the way to stop listening.
 *
 * The key is taken on the window, in the capture phase, and stopped there, before
 * any other listener in the game is offered it. Nothing but `Esc`, a refusal or a
 * binding ends it, and the release of the key that was bound is swallowed too,
 * since `Space` presses a focused button on its way up.
 */
export function captureKey(action: Action, slot: number, done: (outcome: Captured) => void): () => void {
  let listening = true;
  let swallow = '';
  const options = { capture: true } as const;
  const stopKeys = (): void => {
    listening = false;
    removeEventListener('keydown', onDown, options);
  };
  const stopRelease = (): void => {
    swallow = '';
    removeEventListener('keyup', onUp, options);
  };
  function onDown(event: Event): void {
    if (!listening) return;
    const key = event as KeyboardEvent;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (key.repeat) return;
    if (key.code === 'Escape') {
      stopKeys();
      stopRelease();
      done({ kind: 'cancelled' });
      return;
    }
    const before = live[action][slot];
    const result = rebind(action, key.code, slot);
    if (!result.ok) {
      done({ kind: 'refused', code: key.code });
      return;
    }
    stopKeys();
    swallow = key.code;
    done({ kind: 'bound', code: key.code, before, result });
  }
  function onUp(event: Event): void {
    const key = event as KeyboardEvent;
    if (swallow === '' || key.code !== swallow) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    stopRelease();
  }
  addEventListener('keydown', onDown, options);
  addEventListener('keyup', onUp, options);
  return () => {
    if (listening) stopKeys();
    // A release still to come is left to be swallowed: the key is down.
    if (swallow === '') stopRelease();
  };
}

/**
 * The player's bindings, read once as the module loads. All or nothing: a stored
 * table that names an unknown action, a reserved key, or one key for two of the
 * player's own choices is from another version or another hand, and the defaults
 * are safer than any repair of it.
 *
 * Except a key a later version gave a new default to: only the changed actions
 * are stored, so a chosen key and a later default can meet as one key for two
 * actions. The player's choice stands where the default has another key to keep;
 * where it has none, the default keeps its key and the choice gives it up,
 * falling back to the action's own default if that is all it had.
 */
function loadBindings(): void {
  let stored: unknown = null;
  try {
    const text = typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY);
    stored = text === null ? null : JSON.parse(text);
  } catch {
    return;
  }
  if (stored === null || typeof stored !== 'object') return;
  const next = Object.fromEntries(ACTIONS.map((action) => [action, [...DEFAULT_BINDINGS[action]]])) as Record<Action, string[]>;
  const chosen = new Set<Action>();
  for (const [kept, codes] of Object.entries(stored as Record<string, unknown>)) {
    // Tables from older versions: `next` is now `players`, and `dive` is gone.
    const action = kept === 'next' ? 'players' : kept;
    if (action === 'dive') continue;
    if (!(action in DEFAULT_BINDINGS) || !actionBindable(action as Action)) return;
    if (!Array.isArray(codes) || codes.length === 0) return;
    // A `Ctrl` binding never fired: let it go and keep the rest.
    const usable = codes.filter((code) => code !== 'ControlLeft' && code !== 'ControlRight');
    if (usable.length === 0) continue;
    if (!usable.every((code) => typeof code === 'string' && keyBindable(code))) return;
    next[action as Action] = usable as string[];
    chosen.add(action as Action);
  }
  const owner = new Map<string, Action>();
  for (const action of ACTIONS) {
    if (!chosen.has(action)) continue;
    for (const code of next[action]) {
      if (owner.has(code)) return;
      owner.set(code, action);
    }
  }
  // The defaults are one key an action among themselves (`pnpm input`), so
  // what is left to settle is a default against a choice.
  for (const action of ACTIONS) {
    if (chosen.has(action)) continue;
    const kept = next[action].filter((code) => !owner.has(code));
    if (kept.length > 0) {
      next[action] = kept;
    } else {
      for (const code of next[action]) {
        const from = owner.get(code)!;
        next[from] = next[from].filter((other) => other !== code);
        if (next[from].length === 0) next[from] = DEFAULT_BINDINGS[from].filter((other) => !owner.has(other));
        if (next[from].length === 0) return;
        for (const other of next[from]) owner.set(other, from);
      }
    }
    for (const code of next[action]) owner.set(code, action);
  }
  for (const action of ACTIONS) live[action] = next[action];
}
loadBindings();
index();

// ---- labels ------------------------------------------------------------------

/** Keys that print nothing, named the way their caps are. */
const NAMED: Record<string, string> = {
  Space: 'Space',
  ShiftLeft: 'Shift',
  ShiftRight: 'Shift',
  ControlLeft: 'Ctrl',
  ControlRight: 'Ctrl',
  Tab: 'Tab',
  Escape: 'Esc',
  Enter: 'Enter',
  NumpadEnter: 'Enter',
  Backspace: 'Backspace',
  Delete: 'Del',
  Insert: 'Ins',
  Home: 'Home',
  End: 'End',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};

/** What the US layout prints on the punctuation this table binds. */
const US: Record<string, string> = {
  BracketLeft: '[',
  BracketRight: ']',
  Equal: '+',
  Minus: '−',
  NumpadAdd: '+',
  NumpadSubtract: '−',
  Backquote: '`',
  Comma: ',',
  Period: '.',
  Semicolon: ';',
  Quote: "'",
  Backslash: '\\',
  IntlBackslash: '<',
};

/** `navigator.keyboard`, which TypeScript's DOM library does not describe yet. */
interface LayoutMap {
  get(code: string): string | undefined;
}
interface KeyboardApi {
  getLayoutMap(): Promise<LayoutMap>;
  addEventListener?(type: 'layoutchange', listener: () => void): void;
}

let layout: LayoutMap | null = null;
let asked = false;

/**
 * Asks the browser what each position prints, once, and again whenever the
 * layout changes under a running game. A browser without the API, or an iframe
 * whose permissions policy withholds it, keeps the US names.
 */
function askLayout(): void {
  const keyboard = typeof navigator === 'undefined' ? undefined : (navigator as { keyboard?: KeyboardApi }).keyboard;
  if (keyboard === undefined || typeof keyboard.getLayoutMap !== 'function') return;
  const read = (): void => {
    keyboard
      .getLayoutMap()
      .then((map) => {
        layout = map;
        for (const listener of labelListeners) listener();
      })
      .catch(() => {});
  };
  read();
  keyboard.addEventListener?.('layoutchange', read);
}

/** Called whenever the labels may have changed: the layout arrived, the player switched it, or a key was rebound. Returns the unsubscribe. */
export function onKeyLabels(listener: () => void): () => void {
  if (!asked) {
    asked = true;
    askLayout();
  }
  labelListeners.add(listener);
  return () => labelListeners.delete(listener);
}

/** What the cap of a physical key says on this keyboard. */
export function keyLabel(code: string): string {
  const named = NAMED[code];
  if (named !== undefined) return named;
  const printed = layout?.get(code);
  if (printed !== undefined && printed !== '') return printed.length === 1 ? printed.toUpperCase() : printed;
  const us = US[code];
  if (us !== undefined) return us;
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return code;
}

/** The cap of the key an action is on. */
export const labelOf = (action: Action): string => keyLabel(codeOf(action));

/** A cap's text: a key's label, or the pointer's name. */
export const capOf = (key: Action | Pointer): string => (key === 'mouse' ? 'Mouse' : key === 'wheel' ? 'Wheel' : labelOf(key));
