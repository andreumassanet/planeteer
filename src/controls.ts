/**
 * Every key in the world, and the one answer to whether a key belongs to it.
 *
 * **There were five tables and they could disagree.** `input.ts` bound the
 * movement and the craft, `navigation.ts` took `Tab`, `map.ts` took `M`,
 * `main.ts` took `B`, `H` and the brackets in a handler of its own, and the two
 * lists that teach the keys — the strip along the bottom of the HUD and the
 * card in the settings — each typed the caps out again as QWERTY letters.
 * Rebinding one key meant finding all of them, and nothing would have said which
 * one had been missed. This file is the table; the others read it.
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
 * settings card up, `Tab` changed the destination behind it, the arrows walked
 * the player while they were meant to move a slider, and `Space` jumped. Every
 * keyboard listener in the game asks `inputBlocked(event)` first — the card is
 * modal, and a key typed into a field or pressed on a dialog's button is that
 * field's or that button's.
 */
import type { Vehicle } from './player.ts';

/** What a key does in the world, as opposed to which key it is. */
export type Action =
  | 'forward'
  | 'back'
  | 'left'
  | 'right'
  | 'run'
  | 'jump'
  | 'descend'
  | 'fly'
  | 'ashore'
  | 'view'
  | 'map'
  | 'next'
  | 'flags'
  | 'nearer'
  | 'farther'
  | 'hints'
  | 'photo'
  | 'release';

/**
 * The bindings, as `event.code`s. The first code of each is the one its cap
 * shows; the rest are alternatives nobody has to be told about.
 */
export const BINDINGS: Readonly<Record<Action, readonly string[]>> = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  run: ['ShiftLeft', 'ShiftRight'],
  // Space is read twice: as an edge, which is the jump, and as a held key,
  // which is the climb. A plane that only climbed on the frame you pressed the
  // key would be a very tiring plane.
  jump: ['Space'],
  descend: ['KeyC'],
  fly: ['KeyF'],
  ashore: ['KeyE'],
  // `V` for view, which is where three decades of third-person games put it.
  // Every other letter within reach of the movement hand is already spoken
  // for: C descends, E goes ashore, F flies.
  view: ['KeyV'],
  map: ['KeyM'],
  next: ['Tab'],
  flags: ['KeyB'],
  nearer: ['BracketLeft'],
  farther: ['BracketRight'],
  hints: ['KeyH'],
  // The one letter left near the right hand that nothing else wanted.
  photo: ['KeyP'],
  // The browser's, not ours: it frees the mouse and nothing can bind it.
  release: ['Escape'],
};

const byCode = new Map<string, Action>();
for (const [action, codes] of Object.entries(BINDINGS) as [Action, readonly string[]][]) {
  for (const code of codes) byCode.set(code, action);
}

/** The action a physical key is bound to, if any. */
export const actionOf = (code: string): Action | undefined => byCode.get(code);

/** The key that stands for an action: the first of its bindings. */
export const codeOf = (action: Action): string => BINDINGS[action][0]!;

/* ------------------------------------------------------------------------- *
 * Labels
 * ------------------------------------------------------------------------- */

/** Keys that print nothing, named the way their caps are. */
const NAMED: Record<string, string> = {
  Space: 'Space',
  ShiftLeft: 'Shift',
  ShiftRight: 'Shift',
  Tab: 'Tab',
  Escape: 'Esc',
  Enter: 'Enter',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};

/** What the US layout prints on the punctuation this table binds. */
const US: Record<string, string> = {
  BracketLeft: '[',
  BracketRight: ']',
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
 * Called whenever the labels may have changed — the layout arrived, or the
 * player switched it. Returns the unsubscribe.
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
  return code;
}

/** The cap of the key an action is on. */
export const labelOf = (action: Action): string => keyLabel(codeOf(action));

/* ------------------------------------------------------------------------- *
 * The lists that teach them
 * ------------------------------------------------------------------------- */

/** A cap that is not a key. */
type Pointer = 'mouse' | 'wheel';

/** One line of a key list: the caps, in order, and what they do. */
export interface KeyHint {
  keys: readonly (Action | Pointer)[];
  label: string;
}

/** The four movement keys in the order a player reads them: W A S D. */
const MOVE: readonly Action[] = ['forward', 'left', 'back', 'right'];

/** A cap's text: a key's label, or the pointer's name. */
export const capOf = (key: Action | Pointer): string => (key === 'mouse' ? 'Mouse' : key === 'wheel' ? 'Wheel' : labelOf(key));

/** Every binding in the world, in the order a player meets them: the settings card. */
export const KEY_LIST: readonly KeyHint[] = [
  { keys: MOVE, label: 'Move, or steer' },
  { keys: ['mouse'], label: 'Look around' },
  { keys: ['wheel'], label: 'Camera nearer or further, on foot' },
  { keys: ['run'], label: 'Run · boost the boat and the plane' },
  { keys: ['jump'], label: 'Jump · climb in the plane' },
  { keys: ['descend'], label: 'Descend in the plane' },
  { keys: ['fly'], label: 'Take off · land · go around' },
  { keys: ['ashore'], label: 'Step ashore from the boat' },
  { keys: ['view'], label: 'First person, on foot' },
  { keys: ['map'], label: 'World map' },
  { keys: ['next'], label: 'Next landmark to find' },
  { keys: ['flags'], label: 'Flags and borders' },
  { keys: ['nearer', 'farther'], label: 'Render distance' },
  { keys: ['photo'], label: 'Save a photo' },
  { keys: ['hints'], label: 'Key hints on screen' },
  { keys: ['release'], label: 'Free the mouse' },
];

/**
 * The keys worth showing along the bottom for the way you are travelling right
 * now, in the order they are used. Eight keys you can use on foot are not the
 * four you can use in a boat, and a landing is not a flight: while the plane is
 * coming down, the fly key is a go-around, and the strip says so.
 */
export function hintsFor(vehicle: Vehicle, landing = false, firstPerson = false): KeyHint[] {
  if (vehicle === 'boat') {
    return [
      { keys: MOVE, label: 'Steer' },
      { keys: ['run'], label: 'Boost' },
      { keys: ['ashore'], label: 'Go ashore' },
      { keys: ['fly'], label: 'Take off' },
      { keys: ['map'], label: 'Map' },
      { keys: ['photo'], label: 'Photo' },
    ];
  }
  if (vehicle === 'plane') {
    return [
      { keys: MOVE, label: 'Steer' },
      { keys: ['run'], label: 'Boost' },
      { keys: ['jump'], label: 'Climb' },
      { keys: ['descend'], label: 'Descend' },
      { keys: ['fly'], label: landing ? 'Go around' : 'Land' },
      { keys: ['flags'], label: 'Flags' },
      { keys: ['map'], label: 'Map' },
      { keys: ['photo'], label: 'Photo' },
    ];
  }
  return [
    { keys: MOVE, label: 'Move' },
    { keys: ['run'], label: 'Run' },
    { keys: ['jump'], label: 'Jump' },
    { keys: ['fly'], label: 'Fly' },
    { keys: ['view'], label: firstPerson ? 'Third person' : 'First person' },
    { keys: ['map'], label: 'Map' },
    { keys: ['next'], label: 'Landmarks' },
    { keys: ['photo'], label: 'Photo' },
  ];
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
 * fly under — the destination cycling on `Tab` while the chart shows it — is
 * worth more than a map that freezes the plane.
 */
export function registerModal(isOpen: () => boolean): () => void {
  modals.add(isOpen);
  return () => modals.delete(isOpen);
}

/** Anything a key typed into is meant for. */
const EDITABLE = 'input, select, textarea, [contenteditable=""], [contenteditable="true"]';
/** And anything a key pressed on is meant for, when it is on a dialog. */
const CONTROL = 'button, a[href], [role="button"], [role="switch"], [role="slider"], [role="tab"]';
const DIALOG = '[role="dialog"], [role="alertdialog"], [aria-modal="true"]';

/**
 * Whether the keys are not the world's right now.
 *
 * True while a modal card is open, while an input method is composing, when
 * the key was typed into a field, and when it was pressed on a button or a
 * switch that lives on a dialog. **Only ever asked of `keydown`**: a `keyup`
 * is always the world's, or a key held when a card opened would stay held
 * after it closed.
 */
export function inputBlocked(event?: Event): boolean {
  for (const open of modals) if (open()) return true;
  if (event === undefined) return false;
  if ((event as KeyboardEvent).isComposing === true) return true;
  const target = event.target;
  if (typeof Element === 'undefined' || !(target instanceof Element)) return false;
  if (target.closest(EDITABLE) !== null) return true;
  return target.closest(CONTROL) !== null && target.closest(DIALOG) !== null;
}
