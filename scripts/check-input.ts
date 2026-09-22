/** Keyboard regressions, using Node's EventTarget to deliver real event sequences. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInput } from '../src/input.ts';
import type { Input } from '../src/input.ts';
import { registerModal } from '../src/controls.ts';

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

function key(target: EventTarget, type: 'keydown' | 'keyup', code: string, repeat = false): Event {
  const event = Object.assign(new Event(type, { cancelable: true }), { code, repeat });
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

test('a modal clears movement and pending actions before the player reads them', () => withInput((input, keys) => {
  let open = false;
  const unregister = registerModal(() => open);
  try {
    key(keys, 'keydown', 'KeyW');
    key(keys, 'keydown', 'ShiftLeft');
    key(keys, 'keydown', 'Space');
    key(keys, 'keydown', 'KeyF');
    key(keys, 'keydown', 'KeyE');
    key(keys, 'keydown', 'KeyV');
    open = true;
    assert.deepEqual(input.state.move, { x: 0, y: 0 });
    for (const action of ['run', 'climb', 'jump', 'fly', 'exit', 'view'] as const) {
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
