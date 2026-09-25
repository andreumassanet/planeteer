/**
 * Every key in the world, and the one answer to whether a key belongs to it.
 *
 * **There were five tables and they could disagree.** `input.ts` bound the
 * movement and the vehicles, `navigation.ts` took `Tab`, `map.ts` took `M`,
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
  | 'dive'
  | 'use'
  | 'view'
  | 'map'
  | 'next'
  | 'flags'
  | 'nearer'
  | 'farther'
  | 'hints'
  | 'photo'
  | 'chat'
  | 'wave'
  | 'mapIn'
  | 'mapOut'
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
  // key would be a very tiring plane. In a plane or a balloon `Shift` climbs
  // too (`player.ts`), and `C` or `Ctrl` goes down.
  jump: ['Space'],
  descend: ['KeyC'],
  // **`Ctrl` is the one binding a browser will not always give up.** Held for
  // a descent with `W` for the throttle it is `Ctrl+W`, which closes the tab
  // and which no page can cancel; so while it is held in the air `input.ts`
  // asks the browser to confirm leaving the page (`guardUnload`). Every other
  // `Ctrl` shortcut that lands on a bound key is the world's while it is held.
  dive: ['ControlLeft', 'ControlRight'],
  // `E` for everything a vehicle asks: get in, take the wheel, get out. There
  // used to be a second key, `F`, that took off from anywhere, and it went with
  // the plane everybody owned. It also talks to whoever is nearer than any
  // seat, and moves a conversation on.
  use: ['KeyE'],
  // `V` for view, which is where three decades of third-person games put it.
  // Every other letter within reach of the movement hand is already spoken
  // for: C descends, E gets in and out.
  view: ['KeyV'],
  map: ['KeyM'],
  next: ['Tab'],
  flags: ['KeyB'],
  nearer: ['BracketLeft'],
  farther: ['BracketRight'],
  hints: ['KeyH'],
  // The one letter left near the right hand that nothing else wanted.
  photo: ['KeyP'],
  // The chat's field (`chat.ts`), which `/` also opens with the slash typed.
  // `Enter` opens it only when nothing on the page has the focus, so a
  // button a keyboard has reached still presses on `Enter`.
  chat: ['Enter', 'KeyT', 'NumpadEnter'],
  // A wave where the others can see it: the gesture every player makes first.
  wave: ['KeyG'],
  // The world map's zoom, while it is up: its buttons as keys, since `Tab` on
  // the map is the landmarks' and not a walk to its controls.
  mapIn: ['Equal', 'NumpadAdd'],
  mapOut: ['Minus', 'NumpadSubtract'],
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
  ControlLeft: 'Ctrl',
  ControlRight: 'Ctrl',
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
  Equal: '+',
  Minus: '−',
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
  { keys: ['run'], label: 'Run · swim faster · boost a car or a boat · gallop' },
  { keys: ['jump'], label: 'Jump' },
  { keys: ['jump', 'run'], label: 'Take off and climb · rise in a balloon or a helicopter' },
  { keys: ['descend', 'dive'], label: 'Descend and land · sink a balloon' },
  { keys: ['use'], label: 'Get in a vehicle you are next to · get out · talk to somebody' },
  { keys: ['view'], label: 'First person, on foot' },
  { keys: ['map'], label: 'World map' },
  { keys: ['mapIn', 'mapOut'], label: 'Zoom the world map' },
  { keys: ['next'], label: 'Next landmark to find' },
  { keys: ['flags'], label: 'Flags and borders' },
  { keys: ['nearer', 'farther'], label: 'Render distance' },
  { keys: ['photo'], label: 'Save a photo' },
  { keys: ['chat'], label: 'Chat · type / for commands' },
  { keys: ['wave'], label: 'Wave' },
  { keys: ['hints'], label: 'Key hints on screen' },
  { keys: ['release'], label: 'Free the mouse' },
];

/**
 * The keys worth showing along the bottom for the way you are travelling right
 * now, in the order they are used. Eight keys you can use on foot are not the
 * four you can use at a wheel, and a plane on the ground is not one in the air:
 * `airborne` says which, and it is what turns the climb key's "Take off" into
 * "Climb" and the way out into nothing, because nobody steps out of a plane in
 * flight. `stranded` is a passenger aloft with nobody at the controls, whose
 * `E` takes them (`fleet.ts`); any other passenger aloft has no way out to be
 * shown.
 */
export function hintsFor(mode: TravelMode, airborne = false, firstPerson = false, stranded = false): KeyHint[] {
  const out: KeyHint = { keys: ['use'], label: 'Get out' };
  const up: KeyHint = { keys: ['jump', 'run'], label: 'Climb' };
  const down: KeyHint = { keys: ['descend', 'dive'], label: 'Descend' };
  switch (mode) {
    case 'swim':
      return [
        { keys: MOVE, label: 'Swim' },
        { keys: ['run'], label: 'Faster' },
        { keys: ['view'], label: firstPerson ? 'Third person' : 'First person' },
        { keys: ['map'], label: 'Map' },
        { keys: ['photo'], label: 'Photo' },
      ];
    case 'car':
      return [
        { keys: MOVE, label: 'Drive' },
        { keys: ['run'], label: 'Boost' },
        out,
        { keys: ['map'], label: 'Map' },
        { keys: ['photo'], label: 'Photo' },
      ];
    case 'boat':
    case 'jetski':
      return [
        { keys: MOVE, label: 'Steer' },
        { keys: ['run'], label: 'Boost' },
        out,
        { keys: ['map'], label: 'Map' },
        { keys: ['photo'], label: 'Photo' },
      ];
    case 'sailboat':
      return [
        { keys: MOVE, label: 'Steer' },
        { keys: ['run'], label: 'Haul the sheet in' },
        out,
        { keys: ['map'], label: 'Map' },
        { keys: ['photo'], label: 'Photo' },
      ];
    case 'bicycle':
      return [
        { keys: MOVE, label: 'Pedal and steer' },
        { keys: ['run'], label: 'Out of the saddle' },
        out,
        { keys: ['map'], label: 'Map' },
        { keys: ['photo'], label: 'Photo' },
      ];
    case 'motorbike':
      return [
        { keys: MOVE, label: 'Ride' },
        { keys: ['run'], label: 'Full throttle' },
        out,
        { keys: ['map'], label: 'Map' },
        { keys: ['photo'], label: 'Photo' },
      ];
    case 'horse':
      return [
        { keys: MOVE, label: 'Ride' },
        { keys: ['run'], label: 'Gallop' },
        { ...out, label: 'Dismount' },
        { keys: ['map'], label: 'Map' },
        { keys: ['photo'], label: 'Photo' },
      ];
    case 'helicopter':
      return airborne
        ? [
            { keys: ['forward', 'back'], label: 'Fly forward · back' },
            { keys: ['left', 'right'], label: 'Turn' },
            up,
            { ...down, label: 'Descend · land on flat ground' },
            { keys: ['flags'], label: 'Flags' },
            { keys: ['map'], label: 'Map' },
            { keys: ['photo'], label: 'Photo' },
          ]
        : [
            { ...up, label: 'Hold to lift off' },
            { keys: ['left', 'right'], label: 'Turn' },
            out,
            { keys: ['map'], label: 'Map' },
            { keys: ['photo'], label: 'Photo' },
          ];
    case 'plane':
      return airborne
        ? [
            { keys: ['left', 'right'], label: 'Bank' },
            { keys: ['forward', 'back'], label: 'Throttle' },
            up,
            { ...down, label: 'Descend · land on flat ground' },
            { keys: ['flags'], label: 'Flags' },
            { keys: ['map'], label: 'Map' },
            { keys: ['photo'], label: 'Photo' },
          ]
        : [
            { keys: MOVE, label: 'Taxi' },
            { ...up, label: 'Hold to take off' },
            out,
            { keys: ['map'], label: 'Map' },
            { keys: ['photo'], label: 'Photo' },
          ];
    case 'balloon':
      return [
        { keys: MOVE, label: 'Steer' },
        { ...up, label: 'Rise' },
        { ...down, label: 'Sink' },
        ...(airborne ? [] : [out]),
        { keys: ['map'], label: 'Map' },
        { keys: ['photo'], label: 'Photo' },
      ];
    case 'passenger':
      return [
        ...(!airborne ? [out] : stranded ? [{ keys: ['use'], label: 'Take the controls' } as KeyHint] : []),
        { keys: ['map'], label: 'Map' },
        { keys: ['photo'], label: 'Photo' },
      ];
    default:
      return [
        { keys: MOVE, label: 'Move' },
        { keys: ['run'], label: 'Run' },
        { keys: ['jump'], label: 'Jump' },
        { keys: ['view'], label: firstPerson ? 'Third person' : 'First person' },
        { keys: ['map'], label: 'Map' },
        { keys: ['next'], label: 'Landmarks' },
        { keys: ['photo'], label: 'Photo' },
      ];
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
 * fly under — the destination cycling on `Tab` while the chart shows it — is
 * worth more than a map that freezes the plane.
 */
export function registerModal(isOpen: () => boolean): () => void {
  modals.add(isOpen);
  return () => modals.delete(isOpen);
}

const tabCards = new Set<() => boolean>();

/**
 * A card that takes `Tab` while it is up and leaves every other key to the
 * world: the pause card, whose buttons a keyboard could not reach while `Tab`
 * cycled the landmarks behind it. Its own `keydown` walks its controls with
 * `holdFocus`; `navigation.ts` asks `tabTaken` and leaves the key alone.
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
