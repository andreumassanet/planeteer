/** A page's paper: its running head, what it holds and its folio; and the progress bar a visa opens on. */
import { h } from '../ui.ts';
import type { Side } from './model.ts';

export function page(side: Side, number: number | null, running: string, world: string, ...children: (HTMLElement | null)[]): HTMLElement {
  return h(
    'div',
    { class: `p-page ${side}` },
    h('div', { class: 'p-running' }, h('span', { text: side === 'verso' ? 'Atlas' : running }), h('span', { text: side === 'verso' ? running : world })),
    ...children,
    number === null ? null : h('div', { class: 'p-folio', text: String(number) }),
  );
}

export function progressBar(got: number, all: number, ink: string): HTMLElement {
  const bar = h('div', { class: 'p-bar' }, h('i'));
  const fillBar = bar.firstElementChild as HTMLElement;
  fillBar.style.width = `${((got / Math.max(1, all)) * 100).toFixed(1)}%`;
  fillBar.style.background = ink;
  return bar;
}
