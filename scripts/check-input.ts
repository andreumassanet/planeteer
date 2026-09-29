/** Keyboard regressions, using Node's EventTarget to deliver real event sequences. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInput } from '../src/input.ts';
import type { Input } from '../src/input.ts';
import { BINDINGS, CONTROL_SECTIONS, DEFAULT_BINDINGS, boardingHints, actionOf, bindingsChanged, codeOf, keyBindable, labelOf, onKeyLabels, rebind, registerModal, resetBindings } from '../src/controls.ts';
import type { Action } from '../src/controls.ts';
import { createHornChorus, createHornKey } from '../src/horn.ts';
import type { HonkMessage, HornSound } from '../src/horn.ts';
import { HONK_HOLD_MS, HONK_INTERVAL_MS, HONK_REFRESH_MS, HONK_TAP_MS } from '../server/src/limits.ts';
import type { Honk } from '../server/src/limits.ts';

function withInput(run: (input: Input, keys: EventTarget, target: EventTarget) => void): void {
  const keys = new EventTarget();
  const target = new EventTarget();
  const document = Object.assign(new EventTarget(), { pointerLockElement: null, activeElement: null });
  const originals = new Map(['addEventListener', 'document'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.defineProperty(globalThis, 'addEventListener', { configurable: true, value: keys.addEventListener.bind(keys) });
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

test('Ctrl descends, and the keys it lands on are still the world\'s while it is held', () => withInput((input, keys) => {
  key(keys, 'keydown', 'ControlLeft', false, true);
  assert.equal(input.state.dive, true);
  assert.equal(key(keys, 'keydown', 'KeyW', false, true).defaultPrevented, true);
  assert.equal(input.state.move.y, 1);
  // A key nothing binds is the browser's: Ctrl+R still reloads.
  assert.equal(key(keys, 'keydown', 'KeyR', false, true).defaultPrevented, false);
  key(keys, 'keyup', 'ControlLeft');
  assert.equal(input.state.dive, false);
  key(keys, 'keyup', 'KeyW');
  // Without the world holding Ctrl, a Ctrl shortcut is left alone.
  assert.equal(key(keys, 'keydown', 'KeyS', false, true).defaultPrevented, false);
  assert.equal(input.state.move.y, 0);
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
