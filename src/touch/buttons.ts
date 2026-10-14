/** The round buttons in the right thumb's reach, and the `use` pill: each is a key, pressed and let go as the key would be. */
import type { Action, TravelMode } from '../controls.ts';
import { h, icon } from '../ui.ts';
import { SLOTS, layoutOf } from './layout.ts';
import type { PadLayout } from './layout.ts';
import { press } from './state.ts';

/** The elements the pad is made of. */
export interface PadDom {
  readonly root: HTMLElement;
  readonly stick: HTMLElement;
  readonly nub: HTMLElement;
  readonly actions: HTMLElement;
  readonly use: HTMLElement;
  readonly useIcon: HTMLElement;
  readonly useText: HTMLElement;
}

export function buildPadDom(): PadDom {
  const nub = h('div', { class: 'tp-nub' });
  const stick = h('div', { class: 'tp-stick', 'aria-hidden': 'true' }, nub, h('span', { class: 'tp-run', text: 'Run' }));
  const actions = h('div', { class: 'tp-actions' });
  const useIcon = h('span', { class: 'tp-use-icon' });
  const useText = h('span', { class: 'tp-use-text' });
  const use = h('button', { class: 'tp-use', type: 'button' }, useIcon, useText);
  const root = h('div', { class: 'atlas-touch', 'aria-label': 'Touch controls' }, stick, actions, use);
  return { root, stick, nub, actions, use, useIcon, useText };
}

export function createPadButtons(dom: PadDom, signal: AbortSignal) {
  const { actions, use, useIcon, useText } = dom;

  /** Which pointer holds which action down, so a lift lets go of the right one. */
  const holding = new Map<number, { action: Action; element: HTMLElement }>();

  function hold(element: HTMLElement, action: Action, event: PointerEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (holding.has(event.pointerId)) return;
    element.setPointerCapture(event.pointerId);
    holding.set(event.pointerId, { action, element });
    element.classList.add('on');
    navigator.vibrate?.(8);
    press(action, true);
  }

  function letGo(pointer: number): void {
    const held = holding.get(pointer);
    if (held === undefined) return;
    holding.delete(pointer);
    held.element.classList.remove('on');
    press(held.action, false);
  }

  function bindButton(element: HTMLElement, action: () => Action): void {
    element.addEventListener('pointerdown', (event) => hold(element, action(), event), { signal });
    element.addEventListener('pointerup', (event) => letGo(event.pointerId), { signal });
    element.addEventListener('pointercancel', (event) => letGo(event.pointerId), { signal });
    element.addEventListener('contextmenu', (event) => event.preventDefault(), { signal });
  }
  bindButton(use, () => 'use');

  let layoutKey = '';
  let layout: PadLayout = layoutOf('foot', false, false);
  let useLabel: string | null = null;
  let useGlyph = 'walk';

  function renderButtons(): void {
    for (const pointer of [...holding.keys()]) if (holding.get(pointer)!.element !== use) letGo(pointer);
    actions.replaceChildren(
      ...layout.buttons.slice(0, SLOTS.length).map((button, i) => {
        const slot = SLOTS[i]!;
        const element = h(
          'button',
          {
            class: i === 0 ? 'tp-btn primary' : 'tp-btn',
            type: 'button',
            'aria-label': button.label,
            style: `--x: ${slot.x}px; --y: ${slot.y}px; --size: ${slot.size}px`,
          },
          icon(button.glyph, 24),
          h('span', { text: button.label }),
        );
        bindButton(element, () => button.action);
        return element;
      }),
    );
    renderUse();
  }

  function renderUse(): void {
    const label = useLabel ?? layout.out;
    use.classList.toggle('show', label !== null);
    // With nothing above-left of the primary the pill comes down to it.
    use.classList.toggle('lower', layout.buttons.length < 3);
    if (label === null) {
      if (holding.size > 0) for (const [pointer, held] of holding) if (held.element === use) letGo(pointer);
      return;
    }
    if (useText.textContent !== label) useText.textContent = label;
    const glyph = useLabel === null ? 'back' : useGlyph;
    if (use.dataset.glyph !== glyph) {
      use.dataset.glyph = glyph;
      useIcon.replaceChildren(icon(glyph, 19));
    }
    use.setAttribute('aria-label', label);
  }

  /** The travel mode, which decides the buttons. */
  function setMode(mode: TravelMode, airborne: boolean, stranded: boolean): void {
    const key = `${mode}:${airborne}:${stranded}`;
    if (key === layoutKey) return;
    layoutKey = key;
    const next = layoutOf(mode, airborne, stranded);
    const same = next.buttons.length === layout.buttons.length
      && next.buttons.every((button, i) => button.action === layout.buttons[i]!.action && button.label === layout.buttons[i]!.label);
    layout = next;
    if (same) renderUse();
    else renderButtons();
  }

  /** What `use` does beside you, from the HUD's prompt, or null for nothing. */
  function setUse(label: string | null, glyph: string): void {
    if (label === useLabel && glyph === useGlyph) return;
    useLabel = label;
    useGlyph = glyph;
    renderUse();
  }

  /** Lets go of every button held. */
  function releaseButtons(): void {
    for (const pointer of [...holding.keys()]) letGo(pointer);
  }

  renderButtons();

  return { setMode, setUse, releaseButtons, stickRuns: () => layout.stickRuns };
}

export type PadButtons = ReturnType<typeof createPadButtons>;
