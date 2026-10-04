/**
 * Every key in the world, and the one answer to whether a key belongs to it.
 *
 * **There were five tables and they could disagree.** `input.ts` bound the
 * movement and the vehicles, the landmarks took `Tab`, `map.ts` took `M`,
 * `main.ts` took `B`, `H` and the brackets in a handler of its own, and the two
 * lists that teach the keys — the strip along the bottom of the HUD and the
 * card in the settings — each typed the caps out again as QWERTY letters.
 * Rebinding one key meant finding all of them, and nothing would have said which
 * one had been missed. This file is the table; the others read it.
 *
 * **And the player can move any of it.** The settings' controls page rebinds
 * an action by the next key pressed (`rebind`), kept in `localStorage`; every
 * cap, prompt and hint in the game asks `labelOf` when it draws, and
 * `onKeyLabels` tells them when to draw again.
 *
 * **A binding is a physical key and its label is whatever that key prints.**
 * The bindings are `event.code`, which names a position on the keyboard and not
 * a letter, so `W` is the key above `S` on every layout — on AZERTY it prints
 * `Z`, and a strip that says `W` there is telling the player to press the wrong
 * key. Where the browser can say what a position prints
 * (`navigator.keyboard.getLayoutMap()`, Chromium only) the caps say it; where it
 * cannot, they fall back to the US names, which is what they always were.
 *
 * **And one predicate says when the keys are not the world's.** With the
 * settings card up, `Tab` changed a destination behind it, the arrows walked
 * the player while they were meant to move a slider, and `Space` jumped. Every
 * keyboard listener in the game asks `inputBlocked(event)` first — the card is
 * modal, and a key typed into a field or pressed on a dialog's button is that
 * field's or that button's.
 */
/**
 * How the player is getting about, as far as the keys are concerned: on foot,
 * swimming, at the controls of a kind of vehicle — every four-wheeler is a
 * car here, from the hatchback to the bus — or in somebody
 * else's as a passenger, where the only key that does anything is the one that
 * gets you out. `player.ts` says which (`Player.mode`).
 */
export type TravelMode =
  | 'foot'
  | 'swim'
  | 'car'
  | 'boat'
  | 'plane'
  | 'balloon'
  | 'bicycle'
  | 'motorbike'
  | 'horse'
  | 'jetski'
  | 'sailboat'
  | 'helicopter'
  | 'submarine'
  | 'passenger';

/** What a key does in the world, as opposed to which key it is. */
export type Action =
  | 'forward'
  | 'back'
  | 'left'
  | 'right'
  | 'run'
  | 'jump'
  | 'descend'
  | 'use'
  | 'horn'
  | 'view'
  | 'map'
  | 'settings'
  | 'players'
  | 'flags'
  | 'nearer'
  | 'farther'
  | 'hud'
  | 'photo'
  | 'chat'
  | 'wave'
  | 'dance'
  | 'passport'
  | 'mapIn'
  | 'mapOut'
  | 'release';

/**
 * The bindings a new player gets, as `event.code`s. The first code of each is
 * the one its cap shows and the one the settings rebind; the rest are
 * alternatives nobody has to be told about, which a rebinding leaves alone.
 */
export const DEFAULT_BINDINGS: Readonly<Record<Action, readonly string[]>> = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  run: ['ShiftLeft', 'ShiftRight'],
  // Space is read twice: as an edge, which is the jump, and as a held key,
  // which is the climb. A plane that only climbed on the frame you pressed the
  // key would be a very tiring plane. In an aircraft `Shift` goes down
  // (`liftOf` in `player.ts`), and so does `C`, which is also the dive.
  jump: ['Space'],
  // **Not `Ctrl`, which it also was until 2026-10-01**: held for a descent
  // with `W` for the throttle it is `Ctrl+W`, which closes the tab and which
  // no page can cancel, and every other `Ctrl` with a letter is somebody's
  // shortcut.
  descend: ['KeyC'],
  // `E` for everything a vehicle asks: get in, take the wheel, get out. There
  // used to be a second key, `F`, that took off from anywhere, and it went with
  // the plane everybody owned. It also talks to whoever is nearer than any
  // seat, and moves a conversation on.
  use: ['KeyE'],
  // `Q` for the horn, the one key left under the movement hand's fingers:
  // `H`, the letter a horn would want, puts the overlay away. At the controls
  // of anything that has one (`HORN_OF` in `craft/contract.ts`).
  horn: ['KeyQ'],
  // `V` for view, which is where three decades of third-person games put it.
  // Every other letter within reach of the movement hand is already spoken
  // for: C descends, E gets in and out.
  view: ['KeyV'],
  map: ['KeyM'],
  // `O` for options, beside the photo's `P`. Not `Esc`, which the browser
  // spends on freeing the mouse and does not always hand the page.
  settings: ['KeyO'],
  // Held, the list of who is playing (`player-list.ts`), as a hundred games
  // have it.
  players: ['Tab'],
  flags: ['KeyB'],
  nearer: ['BracketLeft'],
  farther: ['BracketRight'],
  // The whole overlay off and on again, for a clear look at the world.
  hud: ['KeyH'],
  // The one letter left near the right hand that nothing else wanted.
  photo: ['KeyP'],
  // The chat's field (`chat.ts`), which `/` also opens with the slash typed.
  // `Enter` opens it only when nothing on the page has the focus, so a
  // button a keyboard has reached still presses on `Enter`.
  chat: ['Enter', 'KeyT', 'NumpadEnter'],
  // A wave where the others can see it: the gesture every player makes first.
  wave: ['KeyG'],
  // And a dance, beside it, the `/dance` of the chat: on until the body moves.
  // `F` has been free since it stopped taking off from anywhere.
  dance: ['KeyF'],
  // The passport (`passport-card.ts`): J for journal, free of both hands' other work.
  passport: ['KeyJ'],
  // The world map's zoom, while it is up: its buttons as keys, since `Tab` on
  // the map is the landmarks' and not a walk to its controls.
  mapIn: ['Equal', 'NumpadAdd'],
  mapOut: ['Minus', 'NumpadSubtract'],
  // The browser's, not ours: it frees the mouse and nothing can bind it.
  release: ['Escape'],
};

const ACTIONS = Object.keys(DEFAULT_BINDINGS) as Action[];

/**
 * The bindings in force: the defaults with the player's own choices over
 * them. One code is bound to at most one action, which `rebind` keeps true
 * and `loadBindings` refuses to read past.
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

/* ------------------------------------------------------------------------- *
 * Rebinding
 * ------------------------------------------------------------------------- */

/** Where the player's own bindings are kept: only the actions they changed. */
const STORAGE_KEY = 'atlas.keys.v1';

/**
 * Keys nothing may be bound to. `Esc` is the browser's way out of pointer
 * lock and every card's way out of itself; `/` opens the chat with the slash
 * typed, by what it prints (`chat.ts`); the system keys and the three
 * function keys are the browser's own (reload, full screen, the tools), and a
 * binding would take them from the player without saying so. **And `Ctrl`**:
 * every listener that answers the world's keys leaves a press with `ctrlKey`
 * set to the browser (`input.ts`), and `Ctrl` pressed alone is such a press,
 * so a binding to it was accepted by the settings and then never fired.
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

/** What a rebinding did besides the one it was asked for. */
export interface Rebound {
  /** False when the key or the action cannot be bound; nothing changed. */
  ok: boolean;
  /** The action that had this key as its own and now has the old one instead. */
  swapped: Action | null;
  /** The action that had this key as a spare, and has lost it. */
  took: Action | null;
}

function notify(): void {
  for (const listener of listeners) listener();
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
 * Puts `code` on `action` as its own key. A key another action had as its own
 * is **swapped**: that action takes this one's old key, so nothing is ever
 * left without one. A key another action had as a spare is simply taken from
 * it. The old key of `action` is dropped, not kept as a spare: a player who
 * moves the jump off `Space` does not expect `Space` to go on jumping.
 *
 * `slot` is which of the action's keys changes: 0, its own, or a later one,
 * its second key, under the same rules; one past the last adds a key. A key
 * wanted for a slot that holds none yet, from an action that has no other,
 * is refused (`ok` false): there is no old key to give that action back.
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

/** What became of the key pressed for a binding (`captureKey`). */
export type Captured =
  | { kind: 'bound'; code: string; before: string | undefined; result: Rebound }
  /** A key that cannot be had (`keyBindable`), or one `rebind` refused; still listening. */
  | { kind: 'refused'; code: string }
  /** `Esc`: nothing changed, and no longer listening. */
  | { kind: 'cancelled' };

/**
 * Listens for the next key and binds it to `action` at `slot` (`rebind`):
 * the settings' controls page, and `pnpm input`, which drives it with real
 * events. Returns the way to stop listening.
 *
 * **The key is taken on the window, in the capture phase, and stopped
 * there**, before any other listener in the game is offered it. The page
 * had the capture as one more bubbling listener on the window, registered
 * after a dozen others, so a press reached the world's keys before the card
 * that was asking for it, and whether the card got it at all rested on every
 * one of them standing aside; and a click that was not quite on the button,
 * or the list drawn again under the focus, took the question away silently.
 * Here nothing but `Esc`, a refusal or a binding ends it, and the release of
 * the key that was bound is swallowed too, since `Space` presses a focused
 * button on its way up.
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
 * The player's bindings, read once as the module loads. **All or nothing**: a
 * stored table that names an unknown action, a reserved key, or one key for
 * two of the player's own choices is from another version or another hand,
 * and the defaults are safer than any repair of it.
 *
 * **Except a key a later version gave a new default to.** Only the changed
 * actions are stored, so a key the player chose and a key the game later
 * handed some action by default (the horn's `Q` came after the bindings did)
 * met here as one key for two actions — and the whole table was thrown away
 * on the next load without a word: every key the player had set was back
 * where it started. The player's choice stands where the default has another
 * key to keep; where it has none, the default keeps its key and the choice
 * gives it up, falling back to the action's own default if that is all it
 * had. Either way every other key the player set is kept.
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
    // `next` cycled the landmarks on `Tab` until 2026-10-01; the key is the player list's now.
    const action = kept === 'next' ? 'players' : kept;
    // `dive` was a second descend key, `Ctrl`, until 2026-10-01: gone, and nothing to keep.
    if (action === 'dive') continue;
    if (!(action in DEFAULT_BINDINGS) || !actionBindable(action as Action)) return;
    if (!Array.isArray(codes) || codes.length === 0) return;
    // A `Ctrl` kept from before it was reserved never fired: let it go,
    // and the rest of what the player set with it stays.
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

/* ------------------------------------------------------------------------- *
 * Labels
 * ------------------------------------------------------------------------- */

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
const listeners = new Set<() => void>();

/**
 * Asks the browser what each position prints, once, and again whenever the
 * layout changes under a running game. A browser without the API, or an
 * iframe whose permissions policy withholds it, simply keeps the US names.
 */
function askLayout(): void {
  const keyboard = typeof navigator === 'undefined' ? undefined : (navigator as { keyboard?: KeyboardApi }).keyboard;
  if (keyboard === undefined || typeof keyboard.getLayoutMap !== 'function') return;
  const read = (): void => {
    keyboard
      .getLayoutMap()
      .then((map) => {
        layout = map;
        for (const listener of listeners) listener();
      })
      .catch(() => {});
  };
  read();
  keyboard.addEventListener?.('layoutchange', read);
}

/**
 * Called whenever the labels may have changed — the layout arrived, the
 * player switched it, or a key was rebound. Returns the unsubscribe.
 */
export function onKeyLabels(listener: () => void): () => void {
  if (!asked) {
    asked = true;
    askLayout();
  }
  listeners.add(listener);
  return () => listeners.delete(listener);
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

/* ------------------------------------------------------------------------- *
 * The lists that teach them
 * ------------------------------------------------------------------------- */

/** A cap that is not a key. */
export type Pointer = 'mouse' | 'wheel';

/** One line of a key list: the caps, in order, and what they do. */
export interface KeyHint {
  keys: readonly (Action | Pointer)[];
  label: string;
}

/** The four movement keys in the order a player reads them: W A S D. */
export const MOVE: readonly Action[] = ['forward', 'left', 'back', 'right'];

/** A cap's text: a key's label, or the pointer's name. */
export const capOf = (key: Action | Pointer): string => (key === 'mouse' ? 'Mouse' : key === 'wheel' ? 'Wheel' : labelOf(key));

/** One line of the controls page: an action to rebind, or a pointer or key nobody can. */
export interface ControlRow {
  /** The action, whose key the row shows and rebinds. */
  action?: Action;
  /** Or a cap that is not a binding: the mouse, the wheel, `Esc`. */
  fixed?: Pointer | 'release';
  label: string;
}

/**
 * Every binding in the world, in the order a player meets them: the settings'
 * controls page, which is the one place the whole table is shown. Nothing
 * along the bottom of the screen lists them any more; the world shows a key
 * only where it is the answer to something (`boardingHints`, the prompt).
 */
export const CONTROL_SECTIONS: readonly { title: string; rows: readonly ControlRow[] }[] = [
  {
    title: 'Moving',
    rows: [
      { action: 'forward', label: 'Forward · throttle up' },
      { action: 'back', label: 'Back · throttle down' },
      { action: 'left', label: 'Left · bank left' },
      { action: 'right', label: 'Right · bank right' },
      { action: 'run', label: 'Run · swim faster · boost · gallop · descend in the air' },
      { action: 'jump', label: 'Jump · climb · rise in a balloon or a helicopter · open or stow a parachute' },
      { action: 'descend', label: 'Descend and land · dive · sink' },
      { action: 'use', label: 'Get in or out · jump out under way · take the wheel · talk' },
      { action: 'horn', label: 'Horn · bell · snort, at the controls' },
    ],
  },
  {
    title: 'Camera',
    rows: [
      { fixed: 'mouse', label: 'Look around' },
      { fixed: 'wheel', label: 'Nearer or further, on foot' },
      { action: 'view', label: 'First person, on foot or in any seat' },
      { action: 'photo', label: 'Save a photo' },
      { action: 'hud', label: 'Hide or show everything on screen' },
    ],
  },
  {
    title: 'Finding your way',
    rows: [
      { action: 'map', label: 'World map' },
      { action: 'mapIn', label: 'Zoom the map in' },
      { action: 'mapOut', label: 'Zoom the map out' },
      { action: 'passport', label: 'Passport: a stamp for every country' },
      { action: 'flags', label: 'Flags and borders from the air' },
    ],
  },
  {
    title: 'Everyone else',
    rows: [
      { action: 'players', label: 'Who is playing (hold)' },
      { action: 'chat', label: 'Chat · type / for commands' },
      { action: 'wave', label: 'Wave' },
      { action: 'dance', label: 'Dance, until you move' },
    ],
  },
  {
    title: 'The game',
    rows: [
      { action: 'settings', label: 'Settings' },
      { action: 'nearer', label: 'Render distance nearer' },
      { action: 'farther', label: 'Render distance further' },
      { fixed: 'release', label: 'Free the mouse · close a card' },
    ],
  },
];

/**
 * The few keys a new way of travelling needs, shown for a moment as you take
 * it up and then put away (`hud.ts`). `id` names the set, so that one which is
 * `once` — worth saying until it has been used, and never again — can be
 * remembered as used; one which is `sticky` stays for as long as it is true,
 * because it is the only way out of where you are.
 *
 * On foot there is nothing: the welcome card has said it, and a player walking
 * is not asking. **A plane aloft is the one that matters**: the climb and the
 * descent are not keys anyone guesses, and a player who has never found them
 * cannot land.
 */
export interface HintSet {
  id: string;
  once: boolean;
  sticky: boolean;
  hints: KeyHint[];
}

export function boardingHints(mode: TravelMode, airborne = false, stranded = false): HintSet | null {
  const out: KeyHint = { keys: ['use'], label: 'Get out' };
  const horn: KeyHint = { keys: ['horn'], label: 'Horn' };
  const bail: KeyHint = { keys: ['use'], label: 'Jump out' };
  const set = (id: string, hints: KeyHint[], once = false, sticky = false): HintSet => ({ id, once, sticky, hints });
  switch (mode) {
    case 'swim':
      return set('swim', [
        { keys: MOVE, label: 'Swim' },
        { keys: ['run'], label: 'Faster' },
        { keys: ['descend'], label: 'Dive' },
        { keys: ['jump'], label: 'Up to the surface' },
      ], true);
    case 'submarine':
      return set('submarine', [
        { keys: MOVE, label: 'Steer' },
        { keys: ['descend'], label: 'Dive' },
        { keys: ['jump'], label: 'Rise · surface to get out' },
        out,
      ], true);
    case 'car':
      return set('car', [{ keys: MOVE, label: 'Drive' }, { keys: ['run'], label: 'Boost' }, horn, out]);
    case 'boat':
      return set('boat', [{ keys: MOVE, label: 'Steer' }, { keys: ['run'], label: 'Boost' }, horn, out]);
    case 'jetski':
      return set('jetski', [{ keys: MOVE, label: 'Steer' }, { keys: ['run'], label: 'Boost' }, horn, out]);
    case 'sailboat':
      return set('sailboat', [{ keys: MOVE, label: 'Steer' }, { keys: ['run'], label: 'Haul the sheet in' }, horn, out]);
    case 'bicycle':
      return set('bicycle', [{ keys: MOVE, label: 'Pedal and steer' }, { keys: ['run'], label: 'Out of the saddle' }, { ...horn, label: 'Bell' }, out]);
    case 'motorbike':
      return set('motorbike', [{ keys: MOVE, label: 'Ride' }, { keys: ['run'], label: 'Full throttle' }, horn, out]);
    case 'horse':
      return set('horse', [
        { keys: MOVE, label: 'Ride' },
        { keys: ['run'], label: 'Gallop' },
        { keys: ['jump'], label: 'Jump' },
        { ...horn, label: 'Snort' },
        { ...out, label: 'Dismount' },
      ]);
    case 'helicopter':
      // Aloft, the rise and the fall are the keys nobody guesses, as in the
      // plane: said until used. On the ground, how to lift off, every time.
      return airborne
        ? set(
            'helicopter-air-2',
            [
              { keys: ['jump'], label: 'Rise' },
              { keys: ['run', 'descend'], label: 'Descend · land on flat ground' },
              { keys: ['forward', 'back'], label: 'Fly forward · back' },
              { keys: ['left', 'right'], label: 'Turn' },
              { ...bail, label: 'Jump out, with a parachute' },
            ],
            true,
          )
        : set('helicopter', [{ keys: ['jump'], label: 'Hold to lift off' }, { keys: ['left', 'right'], label: 'Turn' }, out]);
    case 'plane':
      return airborne
        ? set(
            'plane-air-2',
            [
              { keys: ['jump'], label: 'Climb' },
              { keys: ['run', 'descend'], label: 'Descend · land on flat ground' },
              { keys: ['left', 'right'], label: 'Bank' },
              { ...bail, label: 'Jump out, with a parachute' },
            ],
            true,
          )
        : set('plane', [{ keys: ['forward'], label: 'Hold to take off' }, { keys: ['left', 'right'], label: 'Steer' }, { keys: ['back'], label: 'Brake' }, out]);
    case 'balloon':
      return set(airborne ? 'balloon-air' : 'balloon', [
        { keys: MOVE, label: 'Steer' },
        { keys: ['jump'], label: 'Rise' },
        { keys: ['run', 'descend'], label: 'Sink' },
        airborne ? { ...bail, label: 'Jump out, with a parachute' } : out,
      ]);
    case 'passenger':
      if (airborne && stranded) return set('stranded', [{ keys: ['use'], label: 'Take the controls' }], false, true);
      return airborne ? set('passenger-air', [{ ...bail, label: 'Jump out, with a parachute' }], true) : set('passenger', [out]);
    default:
      return null;
  }
}

/* ------------------------------------------------------------------------- *
 * Whose keys they are
 * ------------------------------------------------------------------------- */

const modals = new Set<() => boolean>();

/**
 * A card that holds the keyboard while it is open: the settings, the welcome
 * card, a notice. Returns the unregister.
 *
 * **Not the world map**, deliberately: `M` has to close it, and a map you can
 * fly under is worth more than a map that freezes the plane.
 */
export function registerModal(isOpen: () => boolean): () => void {
  modals.add(isOpen);
  return () => modals.delete(isOpen);
}

/**
 * Whether a card that holds the keyboard is up, whatever has the focus: for
 * a screen with keys of its own behind it — the menu's `Esc` and `Enter` —
 * whose own buttons are not the card's and must keep answering.
 */
export function modalOpen(): boolean {
  for (const open of modals) if (open()) return true;
  return false;
}

const tabCards = new Set<() => boolean>();

/**
 * A card that takes `Tab` while it is up and leaves every other key to the
 * world: the pause card, whose buttons a keyboard could not reach while `Tab`
 * meant something behind it. Its own `keydown` walks its controls with
 * `holdFocus`; `player-list.ts` asks `tabTaken` and leaves the key alone.
 * Returns the unregister.
 */
export function registerTabCard(isUp: () => boolean): () => void {
  tabCards.add(isUp);
  return () => tabCards.delete(isUp);
}

/** Whether a card that takes `Tab` is up. */
export function tabTaken(): boolean {
  for (const up of tabCards) if (up()) return true;
  return false;
}

/** What `Tab` can land on inside a card. */
const FOCUSABLE = 'button, input, select, textarea, a[href], [tabindex]';

/**
 * Walks `Tab` and `Shift+Tab` round a modal card's own controls, from its last
 * to its first and back, and from anywhere outside it onto it. Call it from the
 * card's own `keydown` while the card is open; it returns whether it moved the
 * focus.
 *
 * **Holding the game's keys is not holding the focus.** `registerModal` stops
 * the world answering a key behind a card, and the browser's own `Tab` goes on
 * walking the page: the welcome card and the notices said `aria-modal` and let
 * `Tab` out onto the controls behind them. The settings had this written out
 * for themselves; it is here so that every card holds the focus the same way.
 *
 * It takes every `Tab`, not only the two at the ends, so that two cards up at
 * once cannot pull the focus between them: the notice, which is over
 * everything and whose listener `notice.ts` adds as it loads, before any
 * card's, answers the key, and the card under it finds it answered
 * (`defaultPrevented`) and leaves it.
 */
export function holdFocus(event: KeyboardEvent, card: Element): boolean {
  if (event.code !== 'Tab' || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return false;
  event.preventDefault();
  const controls = [...card.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (element) => element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length > 0,
  );
  // Nothing on the card takes the focus, so nowhere else may either.
  if (controls.length === 0) return false;
  const at = controls.indexOf(document.activeElement as HTMLElement);
  const step = event.shiftKey ? -1 : 1;
  const next = at < 0 ? (step > 0 ? 0 : controls.length - 1) : (at + step + controls.length) % controls.length;
  controls[next]!.focus();
  return true;
}

/** Anything a key typed into is meant for. */
const EDITABLE = 'input, select, textarea';
/** And anything a key pressed on is meant for, when it is on a dialog. */
const CONTROL = 'button, a[href], [role="button"], [role="switch"], [role="slider"], [role="tab"]';
const DIALOG = '[role="dialog"], [role="alertdialog"], [aria-modal="true"]';

/**
 * Whether the keys are not the world's right now.
 *
 * True while a modal card is open, while an input method is composing, when
 * the key was typed into a field, and when it was pressed on a button or a
 * switch that lives on a dialog. Without an event, checks the focused element
 * before a frame consumes held input. Key releases still clear held keys even
 * when blocked; only their browser behaviour is left alone.
 */
export function inputBlocked(event?: Event): boolean {
  for (const open of modals) if (open()) return true;
  if ((event as KeyboardEvent | undefined)?.isComposing === true) return true;
  const target = event?.target ?? (typeof document === 'undefined' ? null : document.activeElement);
  if (typeof Element === 'undefined' || !(target instanceof Element)) return false;
  if (target.closest(EDITABLE) !== null || (target instanceof HTMLElement && target.isContentEditable)) return true;
  return target.closest(CONTROL) !== null && target.closest(DIALOG) !== null;
}
