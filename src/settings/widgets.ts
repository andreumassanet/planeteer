/** The card's building blocks: a labelled row, a switch, a logarithmic slider and a segmented choice. */
import { h, icon } from '../ui.ts';
import type { Choice, Knob, Toggle } from './types.ts';

export function createWidgets(signal: AbortSignal) {
  let tips = 0;
  /** A name and the `?` that says what it is for: a button, so a keyboard reaches it and its focus shows the bubble as hover does. Returns the bubble too, for text that names a key and is rewritten when the key moves. */
  function labelled(name: string, help: string): { label: HTMLElement; bubble: HTMLElement } {
    const id = `atlas-settings-tip-${++tips}`;
    const bubble = h('span', { class: 'atlas-settings-bubble', role: 'tooltip', id, text: help });
    const tip = h('button', { class: 'atlas-settings-tip', type: 'button', 'aria-label': `About ${name}`, 'aria-describedby': id, text: '?' });
    const label = h('div', { class: 'atlas-settings-label' }, h('span', { text: name }), help === '' ? null : tip, help === '' ? null : bubble);
    return { label, bubble };
  }

  const row = (name: string, help: string, ...side: (Node | null)[]): HTMLElement =>
    h('div', { class: 'atlas-settings-row' }, labelled(name, help).label, h('div', { class: 'atlas-settings-side' }, ...side));

  function makeSwitch(toggle: Toggle, label: string): { element: HTMLButtonElement; refresh(): void } {
    const element = h('button', { class: 'ui-switch', role: 'switch', 'aria-label': label });
    const refresh = (): void => element.setAttribute('aria-checked', String(toggle.get()));
    element.addEventListener('click', () => {
      toggle.set(!toggle.get());
      refresh();
    }, { signal });
    return { element, refresh };
  }

  /** A logarithmic slider over a knob: equal travel is an equal ratio, as the knob steps, so the middle of the track is the geometric middle of the range. */
  function makeSlider(
    knob: Knob,
    label: string,
    describe: (value: number) => [string, string],
  ): { value: HTMLElement; input: HTMLInputElement; refresh(): void } {
    const value = h('div', { class: 'atlas-settings-value' });
    const input = h('input', { class: 'ui-range', type: 'range', min: 0, max: 1000, step: 1, 'aria-label': label });
    const span = Math.log(knob.max / knob.min);
    // Clamped: a value under the knob's floor (a volume of 0) is a log of 0.
    const toPosition = (v: number): number => (Math.log(Math.min(knob.max, Math.max(knob.min, v)) / knob.min) / span) * 1000;
    const fromPosition = (p: number): number => knob.min * Math.exp((p / 1000) * span);
    const show = (v: number): void => {
      const [main, small] = describe(v);
      value.replaceChildren(document.createTextNode(main), h('small', { text: small }));
      input.style.setProperty('--fill', `${(toPosition(v) / 10).toFixed(1)}%`);
      input.setAttribute('aria-valuetext', `${main}, ${small}`);
    };
    const refresh = (): void => {
      const v = knob.get();
      input.value = String(Math.round(toPosition(v)));
      show(v);
    };
    input.addEventListener('input', () => show(knob.set(fromPosition(Number(input.value)))), { signal });
    return { value, input, refresh };
  }

  /** A segmented control over a choice: one button a value, the chosen one pressed. */
  function makeChoice(choice: Choice, label: string): { element: HTMLElement; refresh(): void } {
    const buttons = choice.options.map(([value, word]) => {
      const button = h('button', { type: 'button', text: word, 'aria-pressed': 'false' });
      button.addEventListener('click', () => {
        choice.set(value);
        refresh();
      }, { signal });
      return [value, button] as const;
    });
    const element = h('div', { class: 'ui-seg', role: 'group', 'aria-label': label }, ...buttons.map(([, button]) => button));
    const refresh = (): void => {
      const current = choice.get();
      for (const [value, button] of buttons) button.setAttribute('aria-pressed', String(value === current));
    };
    return { element, refresh };
  }
  return { labelled, row, makeSwitch, makeSlider, makeChoice };
}

export const section = (title: string, ...rows: (HTMLElement | null)[]): HTMLElement =>
  h('section', { class: 'atlas-settings-section' }, h('div', { class: 'ui-label', text: title }), ...rows);

export const link = (href: string, text: string): string => `<a href="${href}" target="_blank" rel="noopener">${text}</a>`;

/** A button out to a page of the people who made it, opened beside the world. */
export const out = (href: string, text: string): HTMLElement =>
  h('a', { class: 'ui-btn small', href, target: '_blank', rel: 'noopener' }, icon('link', 16), text);

export type Widgets = ReturnType<typeof createWidgets>;
