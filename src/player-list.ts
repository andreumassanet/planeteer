/**
 * Who is playing, held on `Tab`: everyone in the relay's one room, yourself
 * first, each with the flag of the country they are standing in and what they
 * are doing — on foot, swimming, at the wheel of something or riding in it.
 *
 * It is a list and nothing else: shown while the key is held, gone when it is
 * let go, holding no state of its own. What it says is asked of the caller as
 * the list is drawn (`rows`), twice a second while it is up, so the flags and
 * the vehicles follow the players and nothing here can go stale. Without a
 * relay, or before one answers, it shows the one row there is and says so.
 *
 * The key is `controls.ts`'s `players`, rebindable like any other. While a
 * card that walks its own buttons with `Tab` is up (`tabTaken`, the pause
 * card), the key is that card's, and in a field it is the field's.
 */
import type { CraftKind } from './craft/contract.ts';
import { createFlagCanvas } from './flags.ts';
import { actionOf, inputBlocked, tabTaken } from './controls.ts';
import { ensureStyle, h, icon, installUi } from './ui.ts';
import type { IconName } from './ui.ts';

/** One player on the list. */
export interface PlayerRow {
  id: string;
  name: string;
  /** The country they are standing in, as an ISO code, or null at sea. */
  iso: string | null;
  /** What they are doing, from `describeDoing`. */
  doing: Doing;
  /** This page's own player. */
  you?: boolean;
}

/** What a player is doing, said in a few words beside an icon. */
export interface Doing {
  text: string;
  icon: IconName;
}

export interface PlayerListOptions {
  /** Everyone, yourself first; asked each time the list is drawn. */
  rows(): readonly PlayerRow[];
  /** Whether the relay is connected; false shows the list as offline. */
  online(): boolean;
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

const DRIVE: Record<CraftKind, string> = {
  car: 'Driving a car',
  van: 'Driving a van',
  boat: 'At the helm of a launch',
  plane: 'Flying a plane',
  balloon: 'Flying a balloon',
  bicycle: 'Cycling',
  motorbike: 'Riding a motorbike',
  tuktuk: 'Driving a tuk-tuk',
  bus: 'Driving a bus',
  tractor: 'Driving a tractor',
  jeep: 'Driving a jeep',
  horse: 'Riding a horse',
  jetski: 'Riding a jet ski',
  sailboat: 'Sailing',
  helicopter: 'Flying a helicopter',
  submarine: 'Diving a submarine',
};

const NOUN: Record<CraftKind, string> = {
  car: 'a car',
  van: 'a van',
  boat: 'a launch',
  plane: 'a plane',
  balloon: 'a balloon',
  bicycle: 'a bicycle',
  motorbike: 'a motorbike',
  tuktuk: 'a tuk-tuk',
  bus: 'a bus',
  tractor: 'a tractor',
  jeep: 'a jeep',
  horse: 'a horse',
  jetski: 'a jet ski',
  sailboat: 'a sailboat',
  helicopter: 'a helicopter',
  submarine: 'a submarine',
};

const KIND_ICON: Record<CraftKind, IconName> = {
  car: 'car',
  van: 'car',
  boat: 'boat',
  plane: 'plane',
  balloon: 'balloon',
  bicycle: 'bike',
  motorbike: 'moto',
  tuktuk: 'car',
  bus: 'car',
  tractor: 'car',
  jeep: 'car',
  horse: 'horse',
  jetski: 'jetski',
  sailboat: 'boat',
  helicopter: 'heli',
  submarine: 'sub',
};

/**
 * What a player is doing, from what the wire and the fleet say: their state
 * (`PLAYER_STATES`), and when seated, the kind of vehicle and whether theirs
 * is the driver's seat.
 */
export function describeDoing(state: string, kind: CraftKind | null = null, driving = false): Doing {
  if (state === 'swim') return { text: 'Swimming', icon: 'swim' };
  if (state !== 'seated') return { text: 'On foot', icon: 'walk' };
  if (kind === null) return { text: 'In a vehicle', icon: 'seat' };
  return driving ? { text: DRIVE[kind], icon: KIND_ICON[kind] } : { text: `Riding in ${NOUN[kind]}`, icon: 'seat' };
}

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
  grid-template-columns: 30px minmax(0, 1fr) auto;
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
.atlas-players-name { font-size: 14px; font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.atlas-players-name small { margin-left: 6px; font-size: 10.5px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ui-muted); }
.atlas-players-doing { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: var(--ui-muted); white-space: nowrap; }
.atlas-players-doing svg { width: 15px; height: 15px; }
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

  function render(): void {
    const rows = options.rows();
    const online = options.online();
    const said = `${online}|${rows.map((row) => `${row.id}\t${row.name}\t${row.iso}\t${row.doing.text}`).join('\n')}`;
    if (said === drawn) return;
    drawn = said;
    list.replaceChildren(
      ...rows.slice(0, MAX_ROWS).map((row) => {
        let mark: HTMLElement;
        if (row.iso === null) {
          mark = h('span', { class: 'atlas-players-sea', title: 'At sea' }, icon('boat'));
        } else {
          mark = createFlagCanvas(row.iso, 30, 20);
          mark.className = 'ui-flag';
          mark.title = options.countryName?.(row.iso) ?? row.iso;
        }
        return h(
          'div',
          { class: row.you === true ? 'atlas-players-row you' : 'atlas-players-row' },
          mark,
          h('div', { class: 'atlas-players-name' }, row.name, row.you === true ? h('small', { text: 'you' }) : null),
          h('span', { class: 'atlas-players-doing' }, icon(row.doing.icon), row.doing.text),
        );
      }),
    );
    count.textContent = online ? `${rows.length} online` : '';
    note.textContent = !online
      ? 'Playing offline'
      : rows.length > MAX_ROWS
        ? `and ${rows.length - MAX_ROWS} more`
        : rows.length <= 1
          ? 'Nobody else is here right now'
          : '';
  }

  function show(): void {
    if (showing) return;
    showing = true;
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
