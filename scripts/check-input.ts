/** Keyboard regressions, using Node's EventTarget to deliver real event sequences. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInput } from '../src/input.ts';
import type { Input } from '../src/input.ts';
import { BINDINGS, CONTROL_SECTIONS, DEFAULT_BINDINGS, boardingHints, actionOf, bindingsChanged, captureKey, codeOf, keyBindable, labelOf, onKeyLabels, rebind, registerModal, resetBindings } from '../src/controls.ts';
import type { Action, Captured } from '../src/controls.ts';
import { HORN_HELD, createHornChorus, createHornKey } from '../src/horn.ts';
import type { HonkMessage, HornSound } from '../src/horn.ts';
import { HONK_HOLD_MS, HONK_INTERVAL_MS, HONK_REFRESH_MS, HONK_TAP_MS } from '../server/src/limits.ts';
import type { Honk } from '../server/src/limits.ts';

function withInput(run: (input: Input, keys: EventTarget, target: EventTarget) => void): void {
  const keys = new EventTarget();
  const target = new EventTarget();
  const document = Object.assign(new EventTarget(), { pointerLockElement: null, activeElement: null });
  const originals = new Map(['addEventListener', 'removeEventListener', 'document'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.defineProperty(globalThis, 'addEventListener', { configurable: true, value: keys.addEventListener.bind(keys) });
  Object.defineProperty(globalThis, 'removeEventListener', { configurable: true, value: keys.removeEventListener.bind(keys) });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: document });
  const input = createInput(target as HTMLElement);
  try {
    run(input, keys, target);
  } finally {
    input.dispose();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
}

function key(target: EventTarget, type: 'keydown' | 'keyup', code: string, repeat = false, ctrlKey = false): Event {
  const event = Object.assign(new Event(type, { cancelable: true }), { code, repeat, ctrlKey });
  target.dispatchEvent(event);
  return event;
}

test('releasing W leaves ArrowUp held', () => withInput((input, keys) => {
  key(keys, 'keydown', 'KeyW');
  key(keys, 'keydown', 'ArrowUp');
  key(keys, 'keyup', 'KeyW');
  assert.equal(input.state.move.y, 1);
  key(keys, 'keyup', 'ArrowUp');
  assert.equal(input.state.move.y, 0);
}));

test('releasing one Shift leaves the other running', () => withInput((input, keys) => {
  key(keys, 'keydown', 'ShiftLeft');
  key(keys, 'keydown', 'ShiftRight');
  key(keys, 'keyup', 'ShiftLeft');
  assert.equal(input.state.run, true);
  key(keys, 'keyup', 'ShiftRight');
  assert.equal(input.state.run, false);
}));

test('diagonals are normalised and opposite directions cancel', () => withInput((input, keys) => {
  key(keys, 'keydown', 'KeyW');
  key(keys, 'keydown', 'KeyD');
  assert.ok(Math.abs(Math.hypot(input.state.move.x, input.state.move.y) - 1) < 1e-12);
  key(keys, 'keydown', 'KeyS');
  assert.deepEqual(input.state.move, { x: 1, y: 0 });
}));

test('jump fires once per press while climb remains held', () => withInput((input, keys) => {
  key(keys, 'keydown', 'Space');
  assert.equal(input.state.jump, true);
  input.endFrame();
  key(keys, 'keydown', 'Space', true);
  assert.equal(input.state.jump, false);
  assert.equal(input.state.climb, true);
  key(keys, 'keyup', 'Space');
  assert.equal(input.state.climb, false);
  key(keys, 'keydown', 'Space');
  assert.equal(input.state.jump, true);
}));

test('Ctrl is nobody\'s: C descends, and a Ctrl shortcut is the browser\'s', () => withInput((input, keys) => {
  key(keys, 'keydown', 'KeyC');
  assert.equal(input.state.dive, true);
  key(keys, 'keyup', 'KeyC');
  assert.equal(input.state.dive, false);
  // Ctrl held is not a key of the world's, so Ctrl+W is not the throttle.
  assert.equal(key(keys, 'keydown', 'ControlLeft', false, true).defaultPrevented, false);
  assert.equal(input.state.dive, false);
  assert.equal(key(keys, 'keydown', 'KeyW', false, true).defaultPrevented, false);
  assert.equal(input.state.move.y, 0);
  key(keys, 'keyup', 'KeyW');
  key(keys, 'keyup', 'ControlLeft');
  // Shift is the run on foot; an aircraft reads it as the descent (`liftOf`).
  key(keys, 'keydown', 'ShiftLeft');
  assert.equal(input.state.run, true);
  assert.equal(input.state.dive, false);
}));

test('a modal clears movement and pending actions before the player reads them', () => withInput((input, keys) => {
  let open = false;
  const unregister = registerModal(() => open);
  try {
    key(keys, 'keydown', 'KeyW');
    key(keys, 'keydown', 'ShiftLeft');
    key(keys, 'keydown', 'Space');
    key(keys, 'keydown', 'KeyE');
    key(keys, 'keydown', 'KeyV');
    open = true;
    assert.deepEqual(input.state.move, { x: 0, y: 0 });
    for (const action of ['run', 'climb', 'jump', 'use', 'view'] as const) {
      assert.equal(input.state[action], false, action);
    }
    key(keys, 'keydown', 'KeyD');
    assert.equal(input.state.move.x, 0);
    open = false;
    key(keys, 'keydown', 'KeyW', true);
    assert.equal(input.state.move.y, 0, 'closing the modal needs a fresh press');
    key(keys, 'keyup', 'KeyW');
    key(keys, 'keydown', 'KeyW');
    assert.equal(input.state.move.y, 1);
  } finally {
    unregister();
  }
}));

test('keyup for a key the game never held keeps its native behaviour', () => withInput((_input, keys) => {
  const unregister = registerModal(() => true);
  try {
    key(keys, 'keydown', 'Space');
    assert.equal(key(keys, 'keyup', 'Space').defaultPrevented, false);
  } finally {
    unregister();
  }
}));

test('losing focus releases keys and ignores stale repeats', () => withInput((input, keys) => {
  key(keys, 'keydown', 'KeyW');
  keys.dispatchEvent(new Event('blur'));
  assert.equal(input.state.move.y, 0);
  key(keys, 'keydown', 'KeyW', true);
  assert.equal(input.state.move.y, 0);
}));

test('disposing input releases movement and detaches its listeners', () => withInput((input, keys) => {
  key(keys, 'keydown', 'KeyW');
  input.dispose();
  assert.equal(input.state.move.y, 0);
  key(keys, 'keydown', 'KeyD');
  assert.equal(input.state.move.x, 0);
}));

test('a rebound key moves the player and the old one no longer does', () => withInput((input, keys) => {
  try {
    assert.equal(rebind('forward', 'KeyI').ok, true);
    key(keys, 'keydown', 'KeyI');
    assert.equal(input.state.move.y, 1);
    key(keys, 'keyup', 'KeyI');
    key(keys, 'keydown', 'KeyW');
    assert.equal(input.state.move.y, 0, 'W is dropped, not kept as a spare');
    key(keys, 'keyup', 'KeyW');
    key(keys, 'keydown', 'ArrowUp');
    assert.equal(input.state.move.y, 1, 'the spare key still walks');
    key(keys, 'keyup', 'ArrowUp');
  } finally {
    resetBindings();
  }
}));

test('a key pressed for the controls page is bound there, and then moves the player', () => withInput((input, keys) => {
  // The settings card is up while a cap listens: modal, as it registers itself.
  let open = true;
  const unregister = registerModal(() => open);
  const outcomes: Captured[] = [];
  try {
    captureKey('forward', 0, (outcome) => outcomes.push(outcome));
    assert.equal(key(keys, 'keydown', 'KeyI').defaultPrevented, true, 'the key is the card\'s');
    assert.equal(outcomes.length, 1);
    assert.equal(outcomes[0]!.kind, 'bound');
    assert.equal(codeOf('forward'), 'KeyI');
    assert.equal(key(keys, 'keyup', 'KeyI').defaultPrevented, true, 'and so is its release, which would press a focused button');
    // Bound once: the capture has let go, and the next key is nobody's question.
    key(keys, 'keydown', 'KeyU');
    key(keys, 'keyup', 'KeyU');
    assert.equal(outcomes.length, 1);
    assert.equal(codeOf('forward'), 'KeyI');
    open = false;
    key(keys, 'keydown', 'KeyI');
    assert.equal(input.state.move.y, 1, 'the new key walks');
    key(keys, 'keyup', 'KeyI');
    key(keys, 'keydown', 'KeyW');
    assert.equal(input.state.move.y, 0, 'the old one does not');
    key(keys, 'keyup', 'KeyW');
    open = true;

    // Esc keeps the key as it was and stops listening.
    captureKey('jump', 0, (outcome) => outcomes.push(outcome));
    key(keys, 'keydown', 'Escape');
    assert.equal(outcomes.at(-1)!.kind, 'cancelled');
    assert.equal(codeOf('jump'), 'Space');
    key(keys, 'keydown', 'KeyK');
    assert.equal(codeOf('jump'), 'Space', 'nothing listens after Esc');

    // A key the browser keeps is refused and the question stays open.
    captureKey('jump', 0, (outcome) => outcomes.push(outcome));
    key(keys, 'keydown', 'MetaLeft');
    assert.deepEqual(outcomes.at(-1), { kind: 'refused', code: 'MetaLeft' });
    key(keys, 'keydown', 'KeyK');
    assert.equal(outcomes.at(-1)!.kind, 'bound');
    assert.equal(codeOf('jump'), 'KeyK');

    // A second key, on the cap beside the first.
    const stop = captureKey('forward', 1, (outcome) => outcomes.push(outcome));
    key(keys, 'keydown', 'KeyY');
    stop();
    assert.deepEqual(BINDINGS.forward, ['KeyI', 'KeyY']);
    assert.equal(actionOf('ArrowUp'), undefined, 'the second key it replaced is free');
  } finally {
    unregister();
    resetBindings();
  }
}));

test('a second key is swapped, taken or refused by the same rules as the first', () => {
  try {
    // Taken from a spare: back loses ArrowDown.
    assert.deepEqual(rebind('forward', 'ArrowDown', 1), { ok: true, swapped: null, took: 'back' });
    assert.deepEqual(BINDINGS.back, ['KeyS']);
    // Another's own key, for a second key that had one: the two swap.
    assert.deepEqual(rebind('forward', 'KeyE', 1), { ok: true, swapped: 'use', took: null });
    assert.deepEqual(BINDINGS.use, ['ArrowDown']);
    // A second key added where there was none, from an action with no other: refused.
    assert.equal(rebind('view', 'KeyM', 1).ok, false);
    assert.equal(codeOf('map'), 'KeyM');
    // Its own key again, as a second: nothing changes.
    assert.deepEqual(rebind('forward', 'KeyW', 1), { ok: true, swapped: null, took: null });
    assert.deepEqual(BINDINGS.forward, ['KeyW', 'KeyE']);
  } finally {
    resetBindings();
  }
});

test('keys chosen before a later version took one of them for a default are kept on the next load', async () => {
  const stored = new Map([['atlas.keys.v1', JSON.stringify({ jump: ['KeyQ'], view: ['ArrowUp'], photo: ['KeyZ'] })]]);
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (k: string) => stored.get(k) ?? null, setItem: () => {}, removeItem: () => {} },
  });
  try {
    // A second instance of the module, which reads the table as a page load does.
    const fresh = (await import(new URL('../src/controls.ts?load', import.meta.url).href)) as typeof import('../src/controls.ts');
    assert.equal(fresh.codeOf('photo'), 'KeyZ', 'a choice nothing contests');
    assert.equal(fresh.codeOf('view'), 'ArrowUp', 'a choice over a default with another key to keep');
    assert.deepEqual(fresh.BINDINGS.forward, ['KeyW']);
    assert.equal(fresh.codeOf('horn'), 'KeyQ', 'a default whose only key was chosen keeps it');
    assert.equal(fresh.codeOf('jump'), 'Space', 'and the choice falls back to its own default');
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('taking a key another action holds swaps the two, and nothing is left without one', () => {
  try {
    const result = rebind('jump', 'KeyW');
    assert.deepEqual(result, { ok: true, swapped: 'forward', took: null });
    assert.equal(actionOf('KeyW'), 'jump');
    assert.equal(actionOf('Space'), 'forward');
    assert.equal(codeOf('forward'), 'Space');
    assert.equal(labelOf('forward'), 'Space');
    // A spare is taken, not swapped: `ArrowUp` was forward's second key.
    assert.deepEqual(rebind('view', 'ArrowUp'), { ok: true, swapped: null, took: 'forward' });
    assert.deepEqual(BINDINGS.forward, ['Space']);
    const seen = new Map<string, Action>();
    for (const [action, codes] of Object.entries(BINDINGS) as [Action, readonly string[]][]) {
      assert.ok(codes.length > 0, `${action} has a key`);
      for (const code of codes) {
        assert.equal(seen.get(code), undefined, `${code} is bound once`);
        seen.set(code, action);
      }
    }
    assert.equal(bindingsChanged(), true);
  } finally {
    resetBindings();
  }
  assert.equal(bindingsChanged(), false);
  assert.deepEqual(BINDINGS.forward, DEFAULT_BINDINGS.forward);
  assert.equal(actionOf('KeyW'), 'forward');
});

test('the browser\'s keys cannot be bound, and Escape stays the way out', () => {
  for (const code of ['Escape', 'MetaLeft', 'AltLeft', 'F5', 'F12', 'Slash']) {
    assert.equal(keyBindable(code), false, code);
    assert.equal(rebind('jump', code).ok, false, code);
  }
  assert.equal(rebind('release', 'KeyQ').ok, false, 'release is the browser\'s');
  assert.equal(codeOf('jump'), 'Space');
  assert.equal(actionOf('Escape'), 'release');
});

test('every default is one key for one action, and the settings have a key of their own', () => {
  const seen = new Set<string>();
  for (const codes of Object.values(DEFAULT_BINDINGS)) {
    for (const code of codes) {
      assert.ok(!seen.has(code), code);
      seen.add(code);
    }
  }
  assert.equal(actionOf('KeyO'), 'settings');
  assert.equal(actionOf('KeyH'), 'hud');
});

test('the gestures the chat has are keys too: a wave and a dance, rebindable', () => {
  assert.equal(actionOf('KeyG'), 'wave');
  assert.equal(actionOf('KeyF'), 'dance');
  assert.equal(codeOf('dance'), 'KeyF');
  const listed = CONTROL_SECTIONS.flatMap((section) => section.rows.flatMap((row) => (row.action === undefined ? [] : [row.action])));
  assert.ok(listed.includes('dance'), 'the controls page lists the dance');
  try {
    rebind('dance', 'KeyK');
    assert.equal(actionOf('KeyK'), 'dance');
    assert.equal(actionOf('KeyF'), undefined);
  } finally {
    resetBindings();
  }
  assert.equal(actionOf('KeyF'), 'dance');
});

test('a rebinding tells whoever draws key caps', () => {
  let told = 0;
  const stop = onKeyLabels(() => told++);
  try {
    rebind('wave', 'KeyJ');
    assert.equal(told, 1);
    resetBindings();
    assert.equal(told, 2);
  } finally {
    stop();
    resetBindings();
  }
});

test('the keys of the moment: none on foot, the climb and the descent in the air, a way out when stranded', () => {
  assert.equal(actionOf('KeyQ'), 'horn');
  for (const mode of ['car', 'boat', 'bicycle', 'motorbike', 'horse'] as const) {
    assert.ok(boardingHints(mode)!.hints.some((hint) => hint.keys.includes('horn')), `${mode} says where its horn is`);
  }
  assert.ok(!boardingHints('plane', true)!.hints.some((hint) => hint.keys.includes('horn')), 'a plane has no horn');
  assert.equal(boardingHints('foot'), null);
  const air = boardingHints('plane', true);
  assert.ok(air !== null && air.once && !air.sticky);
  const keys = air.hints.flatMap((hint) => hint.keys);
  for (const action of ['jump', 'descend'] as const) assert.ok(keys.includes(action), action);
  const stranded = boardingHints('passenger', true, true);
  assert.ok(stranded !== null && stranded.sticky);
  const aboard = boardingHints('passenger', true, false);
  assert.ok(aboard !== null && aboard.once && !aboard.sticky, 'a passenger aloft with a pilot is told once how to jump out');
  assert.deepEqual(aboard.hints.flatMap((hint) => hint.keys), ['use']);
  for (const mode of ['swim', 'car', 'boat', 'plane', 'balloon', 'bicycle', 'motorbike', 'horse', 'jetski', 'sailboat', 'helicopter', 'passenger'] as const) {
    for (const hint of boardingHints(mode)?.hints ?? []) {
      for (const cap of hint.keys) assert.ok(cap in BINDINGS, `${mode}: ${cap} is a binding`);
    }
  }
});

test('the controls page lists every action the player can move, once', () => {
  const listed = CONTROL_SECTIONS.flatMap((section) => section.rows.flatMap((row) => (row.action === undefined ? [] : [row.action])));
  assert.equal(new Set(listed).size, listed.length);
  for (const action of Object.keys(BINDINGS) as Action[]) {
    if (action === 'release') continue;
    assert.ok(listed.includes(action), action);
  }
});

/** A horn's sounds as a log: what started, at what level, and whether it is still sounding. */
function hornLog(): { sound: (voice: Honk, near: number) => HornSound; played: { voice: Honk; near: number; on: boolean }[] } {
  const played: { voice: Honk; near: number; on: boolean }[] = [];
  return {
    played,
    sound(voice, near) {
      const entry = { voice, near, on: true };
      played.push(entry);
      return {
        level(value) {
          entry.near = value;
        },
        release() {
          entry.on = false;
        },
      };
    },
  };
}

test('a held horn sounds until the key comes up, and says so on the wire', () => {
  const log = hornLog();
  const sent: HonkMessage[] = [];
  const horn = createHornKey(log.sound, (message) => sent.push(message));
  horn.press('car', 1000);
  horn.press('car', 1010);
  assert.equal(log.played.length, 1, 'a key repeat is not a second horn');
  assert.deepEqual(sent, [{ t: 'honk', k: 'car', on: true }]);
  // Held: refreshed each HONK_REFRESH_MS and not in between.
  for (let t = 1000; t <= 1000 + HONK_REFRESH_MS * 3 + 40; t += 16) horn.update(t, 'car');
  assert.equal(sent.filter((m) => m.on).length, 4, 'a start and three refreshes');
  assert.ok(log.played[0]!.on);
  horn.release(1000 + HONK_REFRESH_MS * 3 + 60);
  assert.equal(log.played[0]!.on, false);
  assert.deepEqual(sent.at(-1), { t: 'honk', k: 'car', on: false });
  horn.release(1000 + HONK_REFRESH_MS * 3 + 60);
  assert.equal(sent.filter((m) => !m.on).length, 1, 'let go once');
});

test('a struck horn sounds once a press, held or not, here and for whoever hears it', () => {
  for (const voice of ['bell', 'squeak', 'whinny'] as const) assert.equal(HORN_HELD[voice], false, `${voice} is struck`);
  for (const voice of ['car', 'bus', 'ship', 'beep'] as const) assert.equal(HORN_HELD[voice], true, `${voice} is held`);
  const log = hornLog();
  const sent: HonkMessage[] = [];
  const horn = createHornKey(log.sound, (message) => sent.push(message));
  horn.press('bell', 0);
  // Held for two seconds, the key repeating all the while.
  for (let t = 0; t <= 2000; t += 16) {
    if (t % 48 === 0) horn.press('bell', t);
    horn.update(t, 'bell');
  }
  horn.release(2016);
  assert.equal(log.played.length, 1, 'one ring for one press');
  const heard = hornLog();
  const chorus = createHornChorus(heard.sound);
  for (const message of sent) chorus.hear('a', message.k, message.on, 0, 0.9);
  assert.equal(heard.played.length, 1, 'and one for whoever hears it, refreshes and all');
});

test('a horn is let go with the seat or the keyboard, and a quick second press reaches the wire late, not never', () => {
  const log = hornLog();
  const sent: HonkMessage[] = [];
  const horn = createHornKey(log.sound, (message) => sent.push(message));
  horn.press('bell', 0);
  horn.update(16, null);
  assert.equal(horn.voice, null, 'out of the seat, or a card open');
  assert.equal(log.played[0]!.on, false);
  assert.deepEqual(sent.map((m) => m.on), [true, false]);
  horn.press('bell', 100);
  assert.ok(log.played[1]!.on, 'heard here at once');
  assert.equal(sent.length, 2, 'too soon after the last start for the wire');
  for (let t = 100; t < HONK_INTERVAL_MS; t += 16) horn.update(t, 'bell');
  horn.update(HONK_INTERVAL_MS, 'bell');
  assert.deepEqual(sent.at(-1), { t: 'honk', k: 'bell', on: true }, 'sent once the interval allows');
  horn.update(HONK_INTERVAL_MS + 16, 'car');
  assert.equal(horn.voice, null, 'another vehicle, another horn: this one is let go');
});

test('another player\'s horn is held while they hold it, and let go when the stop is lost', () => {
  const log = hornLog();
  const chorus = createHornChorus(log.sound);
  let near: number | null = 0.8;
  chorus.hear('a', 'bus', true, 0, 0.8);
  assert.equal(log.played.length, 1);
  for (let t = 0; t <= HONK_HOLD_MS * 2; t += 100) {
    if (t % HONK_REFRESH_MS === 0) chorus.hear('a', 'bus', true, t, 0.8);
    chorus.update(t, () => near);
  }
  assert.ok(log.played[0]!.on, 'refreshed, so still held');
  chorus.hear('a', 'bus', false, HONK_HOLD_MS * 2 + 10, 0.8);
  assert.equal(log.played[0]!.on, false, 'the stop');
  assert.equal(chorus.held, 0);
  // The stop never comes: let go HONK_HOLD_MS after the last word.
  chorus.hear('b', 'car', true, 10_000, 0.5);
  chorus.update(10_000 + HONK_HOLD_MS - 1, () => near);
  assert.ok(log.played[1]!.on);
  chorus.update(10_000 + HONK_HOLD_MS + 1, () => near);
  assert.equal(log.played[1]!.on, false, 'not stuck');
  // A tap from an older client is short; out of earshot is silent until it is not; a player who leaves is let go.
  chorus.hear('c', 'car', undefined, 20_000, 0.5);
  chorus.update(20_000 + HONK_TAP_MS + 1, () => near);
  assert.equal(log.played[2]!.on, false);
  near = 0;
  chorus.hear('d', 'ship', true, 30_000, 0);
  assert.equal(log.played.length, 3, 'out of earshot, nothing sounds');
  near = 0.6;
  chorus.update(30_100, () => near);
  assert.equal(log.played[3]!.voice, 'ship', 'driven into earshot while held');
  chorus.update(30_200, () => 0.3);
  assert.equal(log.played[3]!.near, 0.3);
  chorus.stop('d');
  assert.equal(log.played[3]!.on, false);
  assert.equal(chorus.held, 0);
});

/* ------------------------------------------------------------------------- *
 * The cards a world builds and takes down again
 * ------------------------------------------------------------------------- */

/**
 * Just enough of a page for the HUD, the chat and the settings card to be
 * built and torn down headless: elements that hold their children, classes,
 * attributes and listeners and draw nothing. Anything a card asks of the page
 * that is not here throws, which is how this grows.
 */
class FakeElement extends EventTarget {
  readonly tagName: string;
  readonly nodeName: string;
  id = '';
  className = '';
  hidden = false;
  title = '';
  lang = '';
  dir = '';
  type = '';
  value = '';
  checked = false;
  disabled = false;
  tabIndex = 0;
  isContentEditable = false;
  offsetWidth = 0;
  offsetHeight = 0;
  readonly dataset: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  readonly childNodes: (FakeElement | string)[] = [];
  parentNode: FakeElement | null = null;
  readonly style: Record<string, unknown> = {
    setProperty: (name: string, value: string) => {
      this.style[name] = value;
    },
    removeProperty: (name: string) => {
      delete this.style[name];
    },
  };
  readonly classList = {
    held: new Set<string>(),
    add: (...names: string[]) => names.forEach((name) => this.classList.held.add(name)),
    remove: (...names: string[]) => names.forEach((name) => this.classList.held.delete(name)),
    toggle: (name: string, force?: boolean) => {
      const on = force ?? !this.classList.held.has(name);
      if (on) this.classList.held.add(name);
      else this.classList.held.delete(name);
      return on;
    },
    contains: (name: string) => this.classList.held.has(name),
  };
  constructor(tag: string) {
    super();
    this.tagName = tag.toUpperCase();
    this.nodeName = this.tagName;
  }
  get children(): FakeElement[] {
    return this.childNodes.filter((node): node is FakeElement => typeof node !== 'string');
  }
  get firstElementChild(): FakeElement | null {
    return this.children[0] ?? null;
  }
  get lastElementChild(): FakeElement | null {
    return this.children[this.children.length - 1] ?? null;
  }
  get firstChild(): FakeElement | string | null {
    return this.childNodes[0] ?? null;
  }
  get parentElement(): FakeElement | null {
    return this.parentNode;
  }
  get isConnected(): boolean {
    let at: FakeElement | null = this;
    while (at.parentNode !== null) at = at.parentNode;
    return at === page.root;
  }
  get textContent(): string {
    return this.childNodes.map((node) => (typeof node === 'string' ? node : node.textContent)).join('');
  }
  set textContent(text: string) {
    this.replaceChildren(text);
  }
  get innerHTML(): string {
    return '';
  }
  set innerHTML(html: string) {
    // Markup is not parsed: one element stands for whatever it said.
    this.replaceChildren(...(html === '' ? [] : [new FakeElement(/^<(\w+)/.exec(html)?.[1] ?? 'span')]));
  }
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, String(value));
    if (name === 'id') this.id = String(value);
  }
  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }
  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }
  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }
  toggleAttribute(name: string, force?: boolean): boolean {
    const on = force ?? !this.attributes.has(name);
    if (on) this.attributes.set(name, '');
    else this.attributes.delete(name);
    return on;
  }
  private adopt(node: FakeElement | string): FakeElement | string {
    if (typeof node !== 'string') {
      node.remove();
      node.parentNode = this;
    }
    return node;
  }
  append(...nodes: (FakeElement | string)[]): void {
    for (const node of nodes) this.childNodes.push(this.adopt(node));
  }
  appendChild<T extends FakeElement>(node: T): T {
    this.append(node);
    return node;
  }
  prepend(...nodes: (FakeElement | string)[]): void {
    this.childNodes.unshift(...nodes.map((node) => this.adopt(node)));
  }
  insertBefore<T extends FakeElement>(node: T, before: FakeElement | null): T {
    const at = before === null ? -1 : this.childNodes.indexOf(before);
    this.adopt(node);
    if (at < 0) this.childNodes.push(node);
    else this.childNodes.splice(at, 0, node);
    return node;
  }
  replaceChildren(...nodes: (FakeElement | string)[]): void {
    for (const node of this.childNodes) if (typeof node !== 'string') node.parentNode = null;
    this.childNodes.length = 0;
    this.append(...nodes);
  }
  removeChild<T extends FakeElement>(node: T): T {
    node.remove();
    return node;
  }
  remove(): void {
    const parent = this.parentNode;
    if (parent === null) return;
    const at = parent.childNodes.indexOf(this);
    if (at >= 0) parent.childNodes.splice(at, 1);
    this.parentNode = null;
  }
  contains(node: unknown): boolean {
    for (let at = node instanceof FakeElement ? node : null; at !== null; at = at.parentNode) if (at === this) return true;
    return false;
  }
  querySelector(): null {
    return null;
  }
  querySelectorAll(): FakeElement[] {
    return [];
  }
  closest(): null {
    return null;
  }
  matches(): boolean {
    return false;
  }
  focus(): void {
    page.document.activeElement = this;
  }
  blur(): void {
    if (page.document.activeElement === this) page.document.activeElement = null;
  }
  click(): void {
    this.dispatchEvent(new Event('click'));
  }
  select(): void {}
  setSelectionRange(): void {}
  scrollIntoView(): void {}
  getBoundingClientRect(): { left: number; top: number; right: number; bottom: number; width: number; height: number } {
    return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  }
  getContext(): null {
    return null;
  }
  animate(): { cancel(): void; onfinish: (() => void) | null } {
    return { cancel: () => {}, onfinish: null };
  }
  toDataURL(): string {
    return '';
  }
}

/** The page the fake elements belong to while a test runs. */
const page = {
  root: new FakeElement('html'),
  document: { activeElement: null as FakeElement | null },
};

/**
 * Runs `run` against a fake page whose window delivers `keys`, and counts the
 * listeners the window holds by type: added, removed, or let go by an
 * `AbortSignal`.
 */
async function withPage(run: (keys: EventTarget, live: (type: string) => number) => Promise<void> | void): Promise<void> {
  const keys = new EventTarget();
  const held = new Map<string, Set<unknown>>();
  const set = (type: string): Set<unknown> => held.get(type) ?? held.set(type, new Set()).get(type)!;
  const add = (type: string, listener: EventListenerOrEventListenerObject | null, options?: AddEventListenerOptions | boolean): void => {
    keys.addEventListener(type, listener, options);
    const signal = typeof options === 'object' ? options.signal : undefined;
    if (listener === null || signal?.aborted === true) return;
    set(type).add(listener);
    signal?.addEventListener('abort', () => set(type).delete(listener));
  };
  const remove = (type: string, listener: EventListenerOrEventListenerObject | null): void => {
    keys.removeEventListener(type, listener);
    set(type).delete(listener);
  };
  page.root = new FakeElement('html');
  const head = new FakeElement('head');
  const body = new FakeElement('body');
  page.root.append(head, body);
  const documentTarget = Object.assign(new EventTarget(), {
    head,
    body,
    documentElement: page.root,
    hidden: false,
    pointerLockElement: null,
    get activeElement() {
      return page.document.activeElement;
    },
    createElement: (tag: string) => new FakeElement(tag),
    createElementNS: (_ns: string, tag: string) => new FakeElement(tag),
    createTextNode: (text: string) => text,
    getElementById: (id: string) => head.children.find((element) => element.id === id) ?? body.children.find((element) => element.id === id) ?? null,
    exitPointerLock: () => {},
  });
  page.document = documentTarget as unknown as typeof page.document;
  const unref = <T>(timer: T): T => {
    (timer as { unref?: () => void }).unref?.();
    return timer;
  };
  const items = new Map<string, string>();
  const globals: Record<string, unknown> = {
    addEventListener: add,
    removeEventListener: remove,
    document: documentTarget,
    window: {
      addEventListener: add,
      removeEventListener: remove,
      setTimeout: (handler: () => void, ms?: number) => unref(setTimeout(handler, ms)),
      clearTimeout: (timer: ReturnType<typeof setTimeout>) => clearTimeout(timer),
      setInterval: (handler: () => void, ms?: number) => unref(setInterval(handler, ms)),
      clearInterval: (timer: ReturnType<typeof setInterval>) => clearInterval(timer),
      devicePixelRatio: 1,
    },
    localStorage: {
      getItem: (name: string) => items.get(name) ?? null,
      setItem: (name: string, value: string) => void items.set(name, value),
      removeItem: (name: string) => void items.delete(name),
    },
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    innerWidth: 1280,
    innerHeight: 800,
    devicePixelRatio: 1,
    Node: FakeElement,
    Element: FakeElement,
    HTMLElement: FakeElement,
    HTMLInputElement: FakeElement,
    HTMLButtonElement: FakeElement,
    HTMLCanvasElement: FakeElement,
    SVGElement: FakeElement,
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
  };
  const originals = new Map(Object.keys(globals).map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  try {
    await run(keys, (type) => set(type).size);
  } finally {
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
}

/** A knob, a switch and a choice that hold a value and nothing else. */
const knob = (value: number) => ({ min: 0, max: 10, get: () => value, set: (next: number) => (value = next) });
const toggle = (on: boolean) => ({ get: () => on, set: (next: boolean) => (on = next) });

test('a HUD, a chat and a settings card taken down leave no key behind, and a second one answers alone', () => withPage(async (keys, live) => {
  resetBindings();
  const { createHud } = await import('../src/hud.ts');
  const { createChat } = await import('../src/chat.ts');
  const { createSettings } = await import('../src/settings.ts');
  const { inputBlocked } = await import('../src/controls.ts');
  const lockTarget = new FakeElement('canvas') as unknown as HTMLElement;
  const world = { countries: [], rings: [], countryAt: () => 0, countryAtPoint: () => 0, elevationAt: () => 0 };
  const settingsOptions = () => ({
    detail: knob(1),
    flags: toggle(true),
    sensitivity: knob(1),
    performance: toggle(false),
    hints: toggle(true),
    resolution: { get: () => 'auto', set: (value: string) => value, options: [['auto', 'Auto']] as const },
    lockTarget,
  });
  // Every member a chat may ask of its host answers, with nothing.
  const host = () =>
    new Proxy({ peers: null, lockTarget, name: () => 'Tester' } as Record<string, unknown>, {
      get: (target, name) => (name in target ? target[name as string] : () => null),
    }) as unknown as Parameters<typeof createChat>[0];
  const baseline = { keydown: live('keydown'), keyup: live('keyup'), resize: live('resize') };
  for (let round = 0; round < 2; round++) {
    const hud = createHud(world);
    const chat = createChat(host());
    const settings = createSettings(settingsOptions());
    assert.ok(live('keydown') > baseline.keydown, 'the cards listen for keys while they stand');
    settings.show();
    assert.equal(inputBlocked(), true, 'an open card holds the keyboard');
    hud.dispose();
    chat.dispose();
    settings.dispose();
    for (const [type, count] of Object.entries(baseline)) assert.equal(live(type), count, `round ${round}: every ${type} listener is let go`);
    assert.equal(inputBlocked(), false, 'and the card disposed while open no longer holds the keyboard');
  }
  // One key, one card: a card made after another was taken down opens and closes alone.
  const gone = createSettings(settingsOptions());
  gone.dispose();
  const settings = createSettings(settingsOptions());
  key(keys, 'keydown', BINDINGS.settings[0]!);
  assert.equal(gone.open, false, 'the disposed card does not open');
  assert.equal(settings.open, true, 'the standing card opens');
  key(keys, 'keydown', BINDINGS.settings[0]!);
  assert.equal(settings.open, false, 'and the same key closes it, once');
  settings.dispose();
  const goneChat = createChat(host());
  goneChat.dispose();
  const chat = createChat(host());
  key(keys, 'keydown', BINDINGS.chat[0]!);
  assert.equal(goneChat.open, false, 'the disposed chat does not open');
  assert.equal(chat.open, true, 'the standing chat opens');
  chat.dispose();
  for (const [type, count] of Object.entries(baseline)) assert.equal(live(type), count, `every ${type} listener is let go at the end`);
}));

test('the passport, a chapter a world, turns through every world and lets go of its keys', () => withPage(async (keys, live) => {
  resetBindings();
  const { createPassport } = await import('../src/passport.ts');
  const { createPassportCard } = await import('../src/passport-card.ts');
  const { registerFlagPainter } = await import('../src/flags.ts');
  const baseline = { keydown: live('keydown'), resize: live('resize') };
  const unpaint = registerFlagPainter('mars', () => {});
  const book = createPassport(null);
  book.stamp({ iso: 'ESP', name: 'Spain', date: '2026-10-01', town: 'Palma', mode: 'foot', lat: 39.57, lon: 2.65 });
  book.stamp({ iso: 'mars:tharsis', name: 'Tharsis', date: '2026-10-01', town: 'Ascraeus', mode: 'car', lat: 1, lon: -110 });
  let asked = 0;
  const card = createPassportCard({
    passport: book,
    countries: [{ iso: 'ESP', name: 'Spain', continent: 'Europe' }, { iso: 'JPN', name: 'Japan', continent: 'Asia' }],
    here: () => 'mars:tharsis',
    chapters: async () => {
      asked++;
      return [
        {
          body: 'mars',
          name: 'Mars',
          color: 0xb36d45,
          nations: [{ iso: 'mars:tharsis', name: 'Tharsis', color: 0xe56202 }, { iso: 'mars:hellas', name: 'Hellas', color: 0x7c7691 }],
          script: () => new FakeElement('svg') as unknown as SVGElement,
        },
        { body: 'moon', name: 'Moon', nations: [{ iso: 'moon:imbrium', name: 'Imbrium', color: 0xc8c2c1 }] },
      ];
    },
  });
  key(keys, 'keydown', BINDINGS.passport[0]!);
  assert.equal(card.open, true, 'J opens it');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(asked, 1, 'the chapters are asked for once, on the first opening');
  for (const code of ['End', 'Home', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowLeft']) key(keys, 'keydown', code);
  card.celebrate({ iso: 'moon:imbrium', name: 'Imbrium', date: '2026-10-01', town: '', mode: 'plane', lat: 0, lon: 0 });
  card.celebrate({ iso: 'JPN', name: 'Japan', date: '2026-10-01', town: 'Tokyo', mode: 'foot', lat: 35.7, lon: 139.7 });
  key(keys, 'keydown', 'Escape');
  assert.equal(card.open, false, 'Escape closes it');
  key(keys, 'keydown', BINDINGS.passport[0]!);
  assert.equal(asked, 1, 'and not again');
  card.dispose();
  assert.equal(card.open, false);
  key(keys, 'keydown', BINDINGS.passport[0]!);
  assert.equal(card.open, false, 'a disposed book does not open');
  for (const [type, count] of Object.entries(baseline)) assert.equal(live(type), count, `every ${type} listener is let go`);
  unpaint();
}));
