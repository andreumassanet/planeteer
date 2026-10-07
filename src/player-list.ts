/**
 * Who is playing, held on `Tab`: yourself first, then everyone on your world,
 * then everyone on the others. A player on Earth carries the flag of the
 * country they stand in; a player anywhere else carries their world's mark
 * and its name, because another world's nations fly banners nobody would
 * recognise.
 *
 * It is a list and nothing else: shown while the key is held, gone when it is
 * let go. Your own world's rows are asked of the caller as the list is drawn
 * (`rows`), twice a second while it is up, so the flags follow the players;
 * the other worlds' come from the relay (`elsewhere`), asked when the list
 * opens and every few seconds while it stays.
 *
 * The key is `controls.ts`'s `players`, rebindable like any other. While a
 * card that walks its own buttons with `Tab` is up (`tabTaken`, the pause
 * card), the key is that card's, and in a field it is the field's.
 */
import { createFlagCanvas } from './flags.ts';
import { actionOf, inputBlocked, tabTaken } from './controls.ts';
import type { RelayPlayer } from './relay-players.ts';
import { worldName } from './relay-players.ts';
import { ensureStyle, h, icon, installUi } from './ui.ts';

/** One player on the list. */
export interface PlayerRow {
  id: string;
  name: string;
  /** The country they are standing in on Earth, as an ISO code, or null at sea. */
  iso: string | null;
  /** The world they are on, when it is not Earth. */
  world?: string;
  /** This page's own player. */
  you?: boolean;
}

export interface PlayerListOptions {
  /** The world this page is on, as the relay names it: `'earth'`, `'moon'`. */
  world: string;
  /** Everyone on this world, yourself first; asked each time the list is drawn. */
  rows(): readonly PlayerRow[];
  /** Whether the relay is connected; false shows the list as offline. */
  online(): boolean;
  /** Everyone on every world, from the relay; null when it does not answer. */
  elsewhere?(): Promise<readonly RelayPlayer[] | null>;
  /** A country's name for its code, for the flag's title. */
  countryName?(iso: string): string | undefined;
}

export interface PlayerList {
  /** The overlay, stylesheet included. The caller mounts it once. */
  root: HTMLElement;
  readonly open: boolean;
  /** Every frame; redraws the rows now and then while the list is up. */
  update(dt: number): void;
  dispose(): void;
}

/** How often the rows are asked again while the list is up, in seconds. */
const REFRESH = 0.5;
/** More rows than this and the rest are counted, not listed. */
const MAX_ROWS = 24;
/** How often the other worlds are asked again while the list is up, in seconds. */
const ELSEWHERE_REFRESH = 4;

const STYLE = `
.atlas-players {
  position: fixed;
  left: 50%;
  top: 72px;
  z-index: 9;
  width: min(440px, calc(100vw - 32px));
  max-height: calc(100vh - 144px);
  overflow: hidden;
  padding: 14px 16px 12px;
  transform: translate(-50%, -8px);
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition: opacity 0.15s ease, transform 0.2s var(--ui-ease), visibility 0s 0.15s;
}
.atlas-players.on { opacity: 1; visibility: visible; transform: translate(-50%, 0); transition-delay: 0s; }
.atlas-players-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
.atlas-players-head b { font-size: 17px; font-weight: 800; letter-spacing: -0.012em; }
.atlas-players-head span { font-size: 12px; font-weight: 700; color: var(--ui-muted); }
.atlas-players-list { display: grid; gap: 4px; }
.atlas-players-row {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 9px;
}
.atlas-players-row.you { background: var(--ui-cream); box-shadow: inset 0 0 0 2px var(--ui-ink); }
.atlas-players-row canvas.ui-flag { border-width: 1.5px; border-radius: 3px; }
.atlas-players-sea {
  display: grid;
  place-items: center;
  width: 30px;
  height: 20px;
  border: 1.5px solid var(--ui-ink);
  border-radius: 3px;
  background: var(--ui-sky);
}
.atlas-players-sea svg { width: 13px; height: 13px; }
.atlas-players-world { background: var(--ui-space); color: var(--ui-cream); }
.atlas-players-world svg { width: 15px; height: 15px; }
.atlas-players-name { font-size: 14px; font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.atlas-players-name small { margin-left: 6px; font-size: 10.5px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ui-muted); }
.atlas-players-note { margin-top: 8px; padding-top: 7px; border-top: 2px solid var(--ui-rule); font-size: 12px; font-weight: 700; color: var(--ui-muted); text-align: center; }
.atlas-players-note:empty { display: none; }
@media (prefers-reduced-motion: reduce) {
  .atlas-players, .atlas-players.on { transform: translate(-50%, 0); }
}
`;

export function createPlayerList(options: PlayerListOptions): PlayerList {
  installUi();
  ensureStyle('atlas-players', STYLE);

  const count = h('span');
  const list = h('div', { class: 'atlas-players-list' });
  const note = h('div', { class: 'atlas-players-note' });
  const root = h(
    'div',
    { class: 'atlas-players ui-card', role: 'status', 'aria-label': 'Players' },
    h('div', { class: 'atlas-players-head' }, h('b', { text: 'Players' }), count),
    list,
    note,
  );

  let showing = false;
  let refreshIn = 0;
  /** What the rows said when they were last drawn: the same list is not drawn again. */
  let drawn = '';

  /** The players on other worlds, as the relay last said; empty until it has. */
  let others: PlayerRow[] = [];
  let elsewhereIn = 0;
  let asking = false;

  function askElsewhere(): void {
    if (asking || options.elsewhere === undefined || !options.online()) return;
    asking = true;
    void options.elsewhere().then((all) => {
      asking = false;
      if (all === null) return;
      others = all
        .filter((player) => player.world !== options.world)
        .sort((a, b) => a.world.localeCompare(b.world) || a.name.localeCompare(b.name))
        .map((player) => ({ id: `${player.world}:${player.id}`, name: player.name, iso: null, world: player.world }));
      if (showing) render();
    });
  }

  /** The mark at the head of a row: a world's, a country's flag, or the sea's. */
  function markOf(row: PlayerRow): HTMLElement {
    if (row.world !== undefined && row.world !== 'earth') {
      return h('span', { class: 'atlas-players-sea atlas-players-world', title: worldName(row.world) }, icon('planet'));
    }
    if (row.iso === null) return h('span', { class: 'atlas-players-sea', title: 'At sea' }, icon('boat'));
    const flag = createFlagCanvas(row.iso, 30, 20);
    flag.className = 'ui-flag';
    flag.title = options.countryName?.(row.iso) ?? row.iso;
    return flag;
  }

  function render(): void {
    const online = options.online();
    const rows = online ? [...options.rows(), ...others] : options.rows();
    const said = `${online}|${rows.map((row) => `${row.id}\t${row.name}\t${row.iso}\t${row.world}`).join('\n')}`;
    if (said === drawn) return;
    drawn = said;
    list.replaceChildren(
      ...rows.slice(0, MAX_ROWS).map((row) => {
        // The world's name beside a player who is not on yours.
        const tag = row.you === true ? 'you' : row.world !== undefined && row.world !== options.world ? worldName(row.world) : null;
        return h(
          'div',
          { class: row.you === true ? 'atlas-players-row you' : 'atlas-players-row' },
          markOf(row),
          h('div', { class: 'atlas-players-name' }, row.name, tag === null ? null : h('small', { text: tag })),
        );
      }),
    );
    count.textContent = online ? `${rows.length} online` : '';
    note.textContent = !online ? 'Playing offline' : rows.length > MAX_ROWS ? `and ${rows.length - MAX_ROWS} more` : '';
  }

  function show(): void {
    if (showing) return;
    showing = true;
    askElsewhere();
    elsewhereIn = ELSEWHERE_REFRESH;
    render();
    refreshIn = REFRESH;
    root.classList.add('on');
  }

  function hide(): void {
    if (!showing) return;
    showing = false;
    root.classList.remove('on');
  }

  const events = new AbortController();
  const { signal } = events;
  addEventListener('keydown', (event) => {
    if (actionOf(event.code) !== 'players') return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.defaultPrevented || inputBlocked(event) || (event.code === 'Tab' && tabTaken())) return;
    // `Tab` would otherwise walk the focus over the page's controls.
    event.preventDefault();
    show();
  }, { signal });
  addEventListener('keyup', (event) => {
    if (actionOf(event.code) === 'players') hide();
  }, { signal });
  // A key let go in another window is never heard.
  addEventListener('blur', hide, { signal });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hide();
  }, { signal });

  return {
    root,
    get open() {
      return showing;
    },
    update(dt) {
      if (!showing) return;
      elsewhereIn -= dt;
      if (elsewhereIn <= 0) {
        elsewhereIn = ELSEWHERE_REFRESH;
        askElsewhere();
      }
      refreshIn -= dt;
      if (refreshIn > 0) return;
      refreshIn = REFRESH;
      render();
    },
    dispose() {
      events.abort();
      root.remove();
    },
  };
}
