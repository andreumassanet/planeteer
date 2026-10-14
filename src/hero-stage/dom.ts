/** The stage's elements: the backdrop, the canvas holder, the wait message and the name plate. */
import { h } from '../ui.ts';
import { glyph, PEN } from './glyph.ts';

export function buildDom() {
  const backdrop = h('div', { class: 'hs-backdrop clear' });
  const view = h('div', { class: 'hs-view', 'aria-hidden': 'true' });
  const wait = h('div', { class: 'hs-wait', text: 'Unpacking the wardrobe…' });
  const root = h('div', { class: 'atlas-stage' }, backdrop, view, wait);

  const nameText = h('span', { class: 'hs-name' });
  const pen = h('button', { type: 'button', class: 'hs-pen', title: 'Change your name', 'aria-label': 'Change your name', html: glyph(PEN) });
  const nameInput = h('input', {
    type: 'text',
    maxlength: 20,
    placeholder: 'Your name',
    spellcheck: 'false',
    autocomplete: 'nickname',
    'aria-label': 'Your name',
  });
  nameInput.hidden = true;
  const plate = h('div', { class: 'hs-plate' }, nameText, nameInput, pen);
  root.append(plate);
  return { backdrop, view, wait, root, nameText, pen, nameInput, plate };
}

export type StageDom = ReturnType<typeof buildDom>;
