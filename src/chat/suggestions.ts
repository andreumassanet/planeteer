/** The rows listed over the field as a line starting with `/` is typed, and the greyed rest of the chosen row. */
import { h } from '../ui.ts';
import { suggest, suggestPlaces } from '../chat-core.ts';
import type { Suggestion } from '../chat-core.ts';
import type { ChatCtx } from './context.ts';
import type { Lookups } from './lookups.ts';

export interface Suggestions {
  readonly offered: readonly Suggestion[];
  readonly chosen: number;
  /** Whether `Esc` put the rows away until the next key. */
  dismissed: boolean;
  /** Reads the line again, as it is typed. */
  refresh(): void;
  choose(index: number): void;
  /** Writes row `index` into the field; with `send`, a row that finishes the line is sent. */
  accept(index: number, send: boolean): void;
  showGhost(): void;
  /** Puts the rows away without reading the line again. */
  clearOffered(): void;
}

/** `submit` sends the field's line. */
export function createSuggestions({ host, dom, state, signal }: ChatCtx, lookups: Lookups, submit: () => void): Suggestions {
  const { field, list, typedGhost, moreGhost } = dom;
  let offered: Suggestion[] = [];
  let chosen = 0;
  const sources = {
    players: [] as readonly string[],
    places: (query: string, limit: number) => suggestPlaces(query, host.gazetteer(), lookups.placeName, limit, host.here().iso || undefined),
  };

  function showGhost(): void {
    const value = field.value;
    const more = offered.length > 0 ? offered[chosen]!.ghost : api.dismissed ? '' : suggest(value, sources).ghost;
    typedGhost.textContent = value;
    // A line wider than the field has scrolled under its ghost.
    moreGhost.textContent = more === '' || field.scrollWidth > field.clientWidth ? '' : more;
  }

  function choose(index: number): void {
    const rows = list.querySelectorAll('li');
    rows[chosen]?.setAttribute('aria-selected', 'false');
    chosen = index;
    const row = rows[chosen];
    row?.setAttribute('aria-selected', 'true');
    row?.scrollIntoView({ block: 'nearest' });
    if (row !== undefined) field.setAttribute('aria-activedescendant', row.id);
    showGhost();
  }

  function refresh(): void {
    sources.players = lookups.players().map((player) => player.name);
    offered = api.dismissed || !state.showing ? [] : suggest(field.value, sources).items;
    list.replaceChildren(
      ...offered.map((item, i) => {
        const row = h(
          'li',
          { id: `atlas-chat-suggest-${i}`, role: 'option', 'aria-selected': 'false' },
          h('span', { class: 'name', text: item.label }),
          h('span', { class: 'usage', text: item.usage }),
          h('span', { class: 'detail', text: item.detail }),
        );
        row.addEventListener('mousemove', () => {
          if (chosen !== i) choose(i);
        }, { signal });
        row.addEventListener('click', () => accept(i, false), { signal });
        return row;
      }),
    );
    if (offered.length > 0) list.append(h('li', { class: 'atlas-chat-suggest-keys', role: 'presentation', text: '↑ ↓ to choose · Tab to fill in · Esc to close' }));
    list.classList.toggle('shown', offered.length > 0);
    field.setAttribute('aria-expanded', String(offered.length > 0));
    field.removeAttribute('aria-activedescendant');
    chosen = 0;
    if (offered.length > 0) choose(0);
    else showGhost();
  }

  function accept(index: number, send: boolean): void {
    const item = offered[index];
    if (item === undefined) return;
    const same = item.line.trimEnd() === field.value.trimEnd();
    field.value = item.line;
    field.setSelectionRange(item.line.length, item.line.length);
    field.focus({ preventScroll: true });
    if (send && item.done) {
      submit();
      return;
    }
    // Accepting what is already written is a request to see the next word's rows.
    if (same) api.dismissed = false;
    refresh();
  }

  const api: Suggestions = {
    get offered() {
      return offered;
    },
    get chosen() {
      return chosen;
    },
    dismissed: false,
    refresh,
    choose,
    accept,
    showGhost,
    clearOffered() {
      offered = [];
      list.classList.remove('shown');
    },
  };
  return api;
}
