/** The rail down the left and the pages it turns. */
import { h, icon } from '../ui.ts';
import type { SettingsPage } from './types.ts';

export function createRail(panel: HTMLElement, signal: AbortSignal, onTurn: () => void) {
  // A page says what it is by its rows; only one needs a line on how to use it.
  const PAGES: readonly { id: SettingsPage; label: string; glyph: string; note?: string }[] = [
    { id: 'graphics', label: 'Graphics', glyph: 'eye' },
    { id: 'sound', label: 'Sound', glyph: 'sound' },
    { id: 'controls', label: 'Controls', glyph: 'keyboard', note: 'Click a key, then press the one you want instead.' },
    { id: 'credits', label: 'Credits', glyph: 'star' },
  ];
  const rail = h('div', { class: 'atlas-settings-rail', role: 'tablist', 'aria-label': 'Settings pages', 'aria-orientation': 'vertical' });
  const content = h('div', { class: 'atlas-settings-content' });
  const tabs = new Map<SettingsPage, HTMLButtonElement>();
  const pages = new Map<SettingsPage, HTMLElement>();
  for (const entry of PAGES) {
    const tab = h('button', {
      type: 'button',
      role: 'tab',
      id: `atlas-settings-tab-${entry.id}`,
      'aria-controls': `atlas-settings-${entry.id}`,
    }, icon(entry.glyph), entry.label);
    const element = h(
      'div',
      { class: 'atlas-settings-page', id: `atlas-settings-${entry.id}`, role: 'tabpanel', 'aria-labelledby': `atlas-settings-tab-${entry.id}` },
      h('div', { class: 'atlas-settings-page-title', text: entry.label }),
      entry.note === undefined ? null : h('p', { class: 'atlas-settings-page-note', text: entry.note }),
    );
    tab.addEventListener('click', () => turnTo(entry.id), { signal });
    tabs.set(entry.id, tab);
    pages.set(entry.id, element);
    rail.append(tab);
    content.append(element);
  }
  panel.append(h('div', { class: 'atlas-settings-body' }, rail, content));
  /** The pages a card without sound leaves out, in order. */
  const shown = (): SettingsPage[] => PAGES.map((entry) => entry.id).filter((id) => !tabs.get(id)!.hidden);
  let page: SettingsPage = 'graphics';
  function turnTo(next: SettingsPage): void {
    if (tabs.get(next)!.hidden) next = 'graphics';
    page = next;
    for (const [id, tab] of tabs) {
      tab.setAttribute('aria-selected', String(id === next));
      // One tab stop for the rail, as a tab list has; the arrows walk it.
      tab.tabIndex = id === next ? 0 : -1;
    }
    for (const [id, element] of pages) element.hidden = id !== next;
    content.scrollTop = 0;
    onTurn();
  }
  rail.addEventListener('keydown', (event) => {
    const step = event.code === 'ArrowDown' || event.code === 'ArrowRight' ? 1 : event.code === 'ArrowUp' || event.code === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const order = shown();
    const next = order[(order.indexOf(page) + step + order.length) % order.length]!;
    turnTo(next);
    tabs.get(next)!.focus({ preventScroll: true });
  }, { signal });

  /** Puts what was built on a page, leaving out the parts this card has not got. */
  const fill = (id: SettingsPage, ...parts: (HTMLElement | null)[]): void => {
    for (const part of parts) if (part !== null) pages.get(id)!.append(part);
  };
  return { tabs, pages, turnTo, fill, current: (): SettingsPage => page };
}
