/** The controls page: the mouse and hints rows, and every key in the game as a table of caps that rebind on press. */
import { type Action, actionOf, BINDINGS, bindingsChanged, capOf, type Captured, captureKey, CONTROL_SECTIONS, keyBindable, keyLabel, labelOf, resetBindings } from '../controls.ts';
import { h } from '../ui.ts';
import { spareSlot, splitLabel } from './format.ts';
import type { SettingsOptions } from './types.ts';
import { section, type Widgets } from './widgets.ts';

export function createControlsPage(panel: HTMLElement, signal: AbortSignal, w: Widgets, options: SettingsOptions) {
  const { labelled, row, makeSlider, makeSwitch } = w;
  const labels = new Map<Action, string>();
  for (const section of CONTROL_SECTIONS) for (const line of section.rows) if (line.action !== undefined) labels.set(line.action, splitLabel(line.label).name);
  const nameOf = (action: Action): string => labels.get(action) ?? action;
  const bindList = h('div');
  const bindStatus = h('div', { class: 'atlas-settings-status', role: 'status', 'aria-live': 'polite' });
  const resetButton = h('button', { class: 'ui-btn small', type: 'button' }, 'Reset to defaults');
  /** Every cap that is a button, by `action:slot`. */
  const caps = new Map<string, HTMLButtonElement>();
  /** The cap waiting for its key, and how to stop it waiting. */
  let listening: { action: Action; slot: number; id: string } | null = null;
  let stopCapture: (() => void) | null = null;
  /** The cap just bound, which flashes once when the list is drawn again. */
  let moved = new Set<string>();

  function say(text: string, warn = false): void {
    bindStatus.textContent = text;
    bindStatus.classList.toggle('warn', warn);
  }

  /** A cap that rebinds `slot` of `action`'s keys. */
  function capButton(action: Action, slot: number, name: string): HTMLButtonElement {
    const id = `${action}:${slot}`;
    const code = BINDINGS[action][slot]!;
    const cap = keyLabel(code);
    const waiting = listening?.id === id;
    const button = h('button', {
      class: `atlas-settings-cap${slot > 0 ? ' spare' : ''}${waiting ? ' listening' : ''}${moved.has(id) ? ' moved' : ''}`,
      type: 'button',
      'aria-label': `${name}${slot > 0 ? ', second key' : ''}: ${cap}. Press to change`,
      text: waiting ? 'Press a key' : cap,
    });
    button.addEventListener('click', () => {
      if (listening?.id === id) stopListening();
      else startListening(action, slot);
    }, { signal });
    caps.set(id, button);
    return button;
  }

  function renderBinds(): void {
    const focused = [...caps].find(([, button]) => button === document.activeElement)?.[0] ?? null;
    caps.clear();
    bindList.replaceChildren(
      ...CONTROL_SECTIONS.map((section) =>
        h(
          'section',
          { class: 'atlas-settings-section' },
          h('div', { class: 'ui-eyebrow', text: section.title }),
          h(
            'div',
            { class: 'atlas-settings-binds' },
            ...section.rows.map((line) => {
              const { name, more } = splitLabel(line.label);
              const label = labelled(name, more).label;
              if (line.action === undefined) {
                const cap = line.fixed === 'release' ? labelOf('release') : capOf(line.fixed ?? 'mouse');
                return h(
                  'div',
                  { class: 'atlas-settings-bind' },
                  label,
                  h('span', { class: 'atlas-settings-keys' }, h('span', { class: 'atlas-settings-cap fixed', title: 'Cannot be changed', text: cap })),
                );
              }
              const spare = spareSlot(BINDINGS[line.action]);
              return h(
                'div',
                { class: 'atlas-settings-bind' },
                label,
                h(
                  'span',
                  { class: 'atlas-settings-keys' },
                  capButton(line.action, 0, name),
                  spare < 0 ? null : capButton(line.action, spare, name),
                ),
              );
            }),
          ),
        ),
      ),
    );
    moved = new Set();
    resetButton.disabled = !bindingsChanged();
    // Drawing the list again takes the focus off a cap with it, and a player
    // walking the list with `Tab` would be thrown out of it.
    if (focused !== null) caps.get(focused)?.focus({ preventScroll: true });
  }

  /** What a key pressed for a cap did, in words, with the caps redrawn. */
  function captured(action: Action, slot: number, outcome: Captured): void {
    const name = nameOf(action);
    if (outcome.kind === 'refused') {
      const holder = actionOf(outcome.code);
      say(
        !keyBindable(outcome.code)
          ? `${keyLabel(outcome.code)} belongs to the browser and cannot be used. Try another key, or ${labelOf('release')} to keep this one.`
          : `${keyLabel(outcome.code)} is the only key for ${holder === undefined ? 'another action' : nameOf(holder)}. Try another.`,
        true,
      );
      return;
    }
    listening = null;
    stopCapture = null;
    if (outcome.kind === 'cancelled') {
      say('Nothing changed.');
      renderBinds();
      caps.get(`${action}:${slot}`)?.focus({ preventScroll: true });
      return;
    }
    const cap = keyLabel(outcome.code);
    const { swapped, took } = outcome.result;
    if (swapped !== null) {
      say(`${name} is on ${cap} now. ${nameOf(swapped)} had it, and takes ${outcome.before === undefined ? 'its other key' : keyLabel(outcome.before)} instead.`, true);
    } else if (took !== null) {
      say(`${name} is on ${cap} now, which was a key for ${nameOf(took)} as well.`);
    } else {
      say(`${name} is on ${cap}.`);
    }
    // `rebind` has already had `onKeyLabels` draw the list; once more with the moved caps marked and the focus where the player was.
    moved = new Set([`${action}:${BINDINGS[action].indexOf(outcome.code)}`]);
    if (swapped !== null) moved.add(`${swapped}:0`);
    renderBinds();
    caps.get(`${action}:${BINDINGS[action].indexOf(outcome.code)}`)?.focus({ preventScroll: true });
  }

  /** The waiting cap is changed where it stands rather than redrawn: a button taken out from under a press never receives its click. */
  function startListening(action: Action, slot: number): void {
    stopListening();
    const id = `${action}:${slot}`;
    listening = { action, slot, id };
    stopCapture = captureKey(action, slot, (outcome) => captured(action, slot, outcome));
    const button = caps.get(id);
    if (button !== undefined) {
      button.classList.add('listening');
      button.textContent = 'Press a key';
      button.focus({ preventScroll: true });
    }
    say(`Press the key for ${nameOf(action)}${slot > 0 ? ' (second key)' : ''}, or ${labelOf('release')} to keep ${keyLabel(BINDINGS[action][slot]!)}.`);
  }

  /** Stops waiting for a key, if a cap was. */
  function stopListening(): void {
    if (listening === null) return;
    const { action, slot, id } = listening;
    stopCapture?.();
    stopCapture = null;
    listening = null;
    say('');
    const button = caps.get(id);
    if (button !== undefined) {
      button.classList.remove('listening');
      button.textContent = keyLabel(BINDINGS[action][slot]!);
    }
  }

  // A press anywhere but on the cap that is waiting lets go of the question,
  // as `Esc` does.
  panel.addEventListener('pointerdown', (event) => {
    if (listening === null) return;
    const waiting = caps.get(listening.id);
    if (waiting !== undefined && event.target instanceof Node && waiting.contains(event.target)) return;
    stopListening();
  }, { signal });

  resetButton.addEventListener('click', () => {
    stopListening();
    resetBindings();
    say('Every key is back where it started.');
    resetButton.focus({ preventScroll: true });
  }, { signal });

  const hints = makeSwitch(options.hints, 'Key hints');

  const sensitivity = makeSlider(options.sensitivity, 'Mouse sensitivity', (v) => [
    `${Math.round(v * 100)}%`,
    v < 0.8 ? 'steady' : v > 1.3 ? 'quick' : 'default',
  ]);

  const sections = [

    section(
      'Mouse and hints',
      row('Mouse sensitivity', 'How far the camera turns for a move of the mouse.', sensitivity.value, sensitivity.input),
      row('Key hints', "A vehicle's keys for a moment as you take it, and the climb and descent the first time you fly.", hints.element),
    ),
    bindList,
    h('div', { class: 'atlas-settings-foot' }, bindStatus, resetButton),

  ];
  return {
    sections,
    refresh(): void {
      sensitivity.refresh();
      hints.refresh();
    },
    renderBinds,
    say,
    stopListening,
    isListening: (): boolean => listening !== null,
  };
}
