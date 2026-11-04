/**
 * The Hall of Fame's rows and its foot, as DOM: a rank, a name, a level and
 * a score a line, and the player's own place pinned under them. Every name
 * is written with `textContent` (`h`'s `text`), never as markup.
 */
import { h } from '../ui.ts';
import { boardInfo, scoreText, standingText } from './boards.ts';
import type { BoardId } from './boards.ts';
import type { Answer } from './client.ts';
import type { BoardRow, Standing } from './parse.ts';

/** The score and its unit, the unit smaller. */
function scoreCell(id: BoardId, score: number): HTMLElement {
  const [one, many] = boardInfo(id).unit;
  return h('span', { class: 'atlas-fame-score' }, scoreText(score), h('small', { text: Math.floor(score) === 1 ? one : many }));
}

/** A rank: a gold, silver or bronze disc for the first three, a number after. */
function rankCell(rank: number | null): HTMLElement {
  const medal = rank !== null && rank <= 3 ? ` m${rank}` : '';
  return h('span', { class: `atlas-fame-rank${medal}`, text: rank === null ? '–' : rank.toLocaleString('en') });
}

function levelCell(id: BoardId, level: number): HTMLElement {
  if (level <= 0) return h('span', { class: 'atlas-fame-level' });
  return h('span', { class: `ui-tag atlas-fame-level${id === 'xp' ? ' gold' : ''}`, title: `Level ${level}`, text: `Lv ${level.toLocaleString('en')}` });
}

/** A board's line, the player's own marked. */
export function rowOf(id: BoardId, row: BoardRow): HTMLElement {
  const name = h('span', { class: 'atlas-fame-name', text: row.name });
  if (row.me) name.append(h('small', { text: 'you' }));
  return h(
    'li',
    { class: row.me ? 'atlas-fame-row me' : 'atlas-fame-row', 'aria-label': `${row.rank}. ${row.name}, ${scoreText(row.score)}` },
    rankCell(row.rank),
    name,
    levelCell(id, row.level),
    scoreCell(id, row.score),
  );
}

export interface FootActions {
  signIn?(): void;
  openAccount?(): void;
}

/** A sentence that ends on a button to the account's settings when there is one to press. */
function toAccount(lead: string, actions: FootActions, rest = ''): HTMLElement {
  const note = h('p', { class: 'atlas-fame-note' }, lead);
  if (actions.openAccount === undefined) {
    note.append('Settings → Account', rest);
    return note;
  }
  const button = h('button', { type: 'button', text: 'Settings → Account' });
  button.addEventListener('click', () => actions.openAccount?.());
  note.append(button, rest);
  return note;
}

/** The player's place under the board: their row, why there is none, or the way in. */
export function footOf(id: BoardId, answer: Answer<Standing>, actions: FootActions): HTMLElement[] {
  if (answer.state === 'off') return [];
  if (answer.state === 'out') {
    const line = h('div', { class: 'atlas-fame-line' }, h('span', { text: 'Your name is not on the roll yet.' }));
    if (actions.signIn !== undefined) {
      const button = h('button', { class: 'ui-btn primary small', type: 'button', text: 'Sign in to join the Hall of Fame' });
      button.addEventListener('click', () => actions.signIn?.());
      line.append(button);
    }
    return [line, h('p', { class: 'atlas-fame-note', text: 'Signed in with Discord, your name and your scores join the boards, and your progress follows you to every device.' })];
  }
  if (answer.state !== 'ok') {
    return [h('div', { class: 'atlas-fame-line' }, h('span', { text: 'Your place on the roll could not be read just now.' }))];
  }
  const mine = answer.value;
  if (mine.name === '') {
    return [h('div', { class: 'atlas-fame-line', text: 'A name puts you on the boards.' }), toAccount('Choose one in ', actions, '.')];
  }
  if (!mine.listed) {
    return [
      h('div', { class: 'atlas-fame-line', text: 'You are hidden from the boards.' }),
      toAccount('Turn on “Show me on the leaderboards” in ', actions, ' to take your place again.'),
    ];
  }
  const name = h('span', { class: 'atlas-fame-name', text: mine.name }, h('small', { text: 'you' }));
  const standing = h('span', {
    class: 'atlas-fame-standing',
    text: mine.rank === null ? 'Not on this board yet' : standingText(mine.rank, mine.total),
  });
  return [
    h('div', { class: 'atlas-fame-row me' }, rankCell(mine.rank), name, standing, scoreCell(id, mine.score)),
    toAccount('Rather not be seen? Hide yourself from the boards in ', actions, '.'),
  ];
}

/** What the list says in place of its rows. */
export function listSay(answer: Answer<BoardRow[]>): string {
  switch (answer.state) {
    case 'ok':
      return answer.value.length === 0 ? 'Nobody is on this board yet. The first name here could be yours.' : '';
    case 'off':
      return 'The Hall of Fame keeps its names with accounts, and this build has none.';
    case 'offline':
      return 'You are offline. The Hall of Fame is read again when you are back.';
    default:
      return 'The Hall of Fame cannot be read just now.';
  }
}
