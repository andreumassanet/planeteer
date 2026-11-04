/**
 * The Hall of Fame: a card over the world in the dark glass the settings and
 * the passport stand in. Six boards on tabs (Explorers by experience, with
 * the level; Countries, Landmarks, Racers by gold medals, Reputation and
 * Towns), the top fifty of the open one, and the player's own place pinned at
 * the foot: their rank and share of the board, or the way onto it.
 *
 * It holds the keyboard while it is up (`registerModal`): the arrows turn
 * the tabs, `Tab` walks the card's controls, `Esc` closes it. Like the
 * settings it releases pointer lock as it opens and asks for it back as it
 * closes if it was held. It owns no data: the boards are `client.ts`'s.
 */
import { holdFocus, registerModal } from '../controls.ts';
import { ensureStyle, h, icon, installUi } from '../ui.ts';
import { BOARDS, boardInfo, isBoard } from './boards.ts';
import type { BoardId } from './boards.ts';
import type { Answer, Leaderboards } from './client.ts';
import { leaderboards } from './page.ts';
import type { BoardRow, Standing } from './parse.ts';
import { footOf, listSay, rowOf } from './rows.ts';
import { STYLE } from './style.ts';

export interface HallOfFameOptions {
  /** Signs in, for the foot's button when signed out; without it there is no button. */
  signIn?(): void;
  /** Opens the account's page of Settings, for the notes on hiding and naming. */
  openAccount?(): void;
  /** Where to hand the pointer back to, if it was locked when the card opened. */
  lockTarget?: HTMLElement | null;
  onOpen?(): void;
  onClose?(): void;
  /** The boards to read: the page's own by default. */
  boards?: Leaderboards;
}

export interface HallOfFame {
  /** The card: on the page from the first `show`. */
  readonly root: HTMLElement;
  readonly open: boolean;
  /** Opens it on a board, or on the one open last. */
  show(board?: BoardId): void;
  hide(): void;
  toggle(board?: BoardId): void;
  /** Closes it, takes it off the page and lets go of its keys. */
  dispose(): void;
}

/** How long an answer may take before the list says it is reading, ms: a kept answer never flashes. */
const SAY_READING_MS = 140;
/** Rows drawn faint while a board is read. */
const GHOSTS = 6;

/** Lets go of the pointer, as every card that takes the mouse does. */
function releasePointer(): void {
  if (document.pointerLockElement != null && typeof document.exitPointerLock === 'function') document.exitPointerLock();
}

/** Asks for the pointer back. Chrome refuses a lock asked for too soon after one was released; that refusal is noise. */
function relockPointer(target: HTMLElement): void {
  if (typeof target.requestPointerLock !== 'function') return;
  try {
    const request: unknown = target.requestPointerLock();
    if (request instanceof Promise) request.catch(() => {});
  } catch {
    // The card is closed either way.
  }
}

/** The card's elements: the head, a tab a board, the blurb, the list and the foot. */
function cardDom(onTab: (id: BoardId) => void, signal: AbortSignal) {
  const root = h('div', { class: 'atlas-fame ui-glass', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'atlas-fame-title' });
  const panel = h('div', { class: 'atlas-fame-panel ui-card', tabindex: '-1' });
  root.append(panel);
  const close = h('button', { class: 'ui-btn icon atlas-fame-close', type: 'button', 'aria-label': 'Close', title: 'Close (Esc)' }, icon('close'));
  const head = h(
    'div',
    { class: 'atlas-fame-head' },
    h('div', { class: 'atlas-fame-crest', 'aria-hidden': 'true' }, icon('trophy')),
    h('div', {}, h('div', { class: 'atlas-fame-title', id: 'atlas-fame-title', text: 'Hall of Fame' }), h('div', { class: 'atlas-fame-sub', text: 'The Explorers’ Guild’s roll of honour' })),
    close,
  );
  const tabs = h('div', { class: 'atlas-fame-tabs', role: 'tablist', 'aria-label': 'Boards' });
  const tabOf = new Map<BoardId, HTMLButtonElement>();
  for (const board of BOARDS) {
    const tab = h(
      'button',
      { class: 'atlas-fame-tab', type: 'button', role: 'tab', id: `atlas-fame-tab-${board.id}`, 'aria-selected': 'false', 'aria-controls': 'atlas-fame-board' },
      icon(board.icon, 17),
      h('span', { text: board.tab }),
    );
    tab.addEventListener('click', () => onTab(board.id), { signal });
    tabs.append(tab);
    tabOf.set(board.id, tab);
  }
  const blurb = h('p', { class: 'atlas-fame-blurb' });
  const list = h('ol', { class: 'atlas-fame-list' });
  const say = h('div', { class: 'atlas-fame-say', role: 'status' });
  const body = h('div', { class: 'atlas-fame-body', id: 'atlas-fame-board', role: 'tabpanel', tabindex: '0' }, list, say);
  const foot = h('div', { class: 'atlas-fame-foot', 'aria-live': 'polite' });
  foot.hidden = true;
  panel.append(head, tabs, blurb, body, foot);
  return { root, panel, close, tabs, tabOf, blurb, list, say, body, foot };
}

export function createHallOfFame(options: HallOfFameOptions = {}): HallOfFame {
  installUi();
  ensureStyle('atlas-fame', STYLE);
  const boards = options.boards ?? leaderboards();
  /** Every listener the card adds goes with it on `dispose`. */
  const events = new AbortController();
  const { signal } = events;
  const { root, panel, close, tabs, tabOf, blurb, list, say, body, foot } = cardDom((id) => select(id), signal);

  let current: BoardId = 'xp';
  let showing = false;
  let relock = false;
  let previousFocus: HTMLElement | null = null;
  /** Bumped on every read, so a late answer for a board left behind is dropped. */
  let asked = 0;
  let readingTimer = 0;
  const unregisterModal = registerModal(() => showing);

  function sayText(text: string, retry: boolean): void {
    say.replaceChildren(text);
    if (retry) {
      const again = h('button', { class: 'ui-btn small', type: 'button', text: 'Try again' });
      again.addEventListener('click', () => select(current, true));
      say.append(again);
    }
    say.hidden = text === '';
  }

  function reading(): void {
    list.replaceChildren(...Array.from({ length: GHOSTS }, () => h('li', { class: 'atlas-fame-ghost', 'aria-hidden': 'true' })));
    sayText('Reading the roll…', false);
  }

  function render(id: BoardId, rows: Answer<BoardRow[]>, mine: Answer<Standing>): void {
    window.clearTimeout(readingTimer);
    list.replaceChildren(...(rows.state === 'ok' ? rows.value.map((row) => rowOf(id, row)) : []));
    sayText(listSay(rows), rows.state === 'offline' || rows.state === 'error' || rows.state === 'out');
    const parts = footOf(id, mine, { signIn: options.signIn, openAccount: options.openAccount && openAccount });
    foot.replaceChildren(...parts);
    foot.hidden = parts.length === 0;
  }

  /** Opens a board and reads it, the player's place with it. */
  function select(id: BoardId, fresh = false): void {
    current = id;
    for (const [board, tab] of tabOf) {
      tab.setAttribute('aria-selected', String(board === id));
      tab.tabIndex = 0;
    }
    body.setAttribute('aria-labelledby', `atlas-fame-tab-${id}`);
    blurb.textContent = boardInfo(id).blurb;
    tabOf.get(id)!.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    const token = ++asked;
    window.clearTimeout(readingTimer);
    readingTimer = window.setTimeout(() => {
      if (token === asked) reading();
    }, SAY_READING_MS);
    void Promise.all([boards.board(id, { fresh }), boards.mine(id, fresh)]).then(([rows, mine]) => {
      if (token === asked && showing) render(id, rows, mine);
    });
  }

  /** The next board along, or the one before, the focus following if it was on a tab. */
  function step(by: number): void {
    const at = BOARDS.findIndex((board) => board.id === current);
    const next = BOARDS[(at + by + BOARDS.length) % BOARDS.length]!.id;
    const onTab = tabs.contains(document.activeElement);
    select(next);
    if (onTab) tabOf.get(next)!.focus({ preventScroll: true });
  }

  function openAccount(): void {
    hide();
    options.openAccount?.();
  }

  function show(board?: BoardId): void {
    if (board !== undefined && isBoard(board)) current = board;
    if (showing) {
      select(current);
      return;
    }
    showing = true;
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const target = options.lockTarget ?? null;
    relock = target !== null && document.pointerLockElement === target;
    options.onOpen?.();
    releasePointer();
    if (!root.isConnected) document.body.append(root);
    root.classList.add('on');
    select(current);
    tabOf.get(current)!.focus({ preventScroll: true });
  }

  function hide(): void {
    if (!showing) return;
    showing = false;
    asked++;
    window.clearTimeout(readingTimer);
    root.classList.remove('on');
    options.onClose?.();
    const target = options.lockTarget ?? null;
    if (relock && target !== null) relockPointer(target);
    (document.activeElement as HTMLElement | null)?.blur?.();
    if (!relock && previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    previousFocus = null;
  }

  close.addEventListener('click', hide, { signal });
  // A click on the dimmed backdrop closes it, a click on the card does not.
  root.addEventListener('pointerdown', (event) => {
    if (event.target === root) hide();
  }, { signal });
  // A lock granted while the card is up is handed straight back.
  document.addEventListener('pointerlockchange', () => {
    if (showing) releasePointer();
  }, { signal });
  addEventListener('keydown', (event) => {
    if (!showing || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.code === 'Escape') {
      event.preventDefault();
      // Not the menu's Escape as well, which would go back a stage behind the card.
      event.stopImmediatePropagation();
      hide();
    } else if (event.code === 'ArrowRight' || event.code === 'ArrowLeft') {
      event.preventDefault();
      step(event.code === 'ArrowRight' ? 1 : -1);
    } else if ((event.code === 'Home' || event.code === 'End') && tabs.contains(document.activeElement)) {
      event.preventDefault();
      const id = BOARDS[event.code === 'Home' ? 0 : BOARDS.length - 1]!.id;
      select(id);
      tabOf.get(id)!.focus({ preventScroll: true });
    } else {
      holdFocus(event, panel);
    }
  }, { signal });

  return {
    root,
    get open() {
      return showing;
    },
    show,
    hide,
    toggle(board) {
      if (showing && (board === undefined || board === current)) hide();
      else show(board);
    },
    dispose() {
      hide();
      events.abort();
      unregisterModal();
      root.remove();
    },
  };
}
