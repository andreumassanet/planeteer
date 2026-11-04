/**
 * A course's records: the ten best times round it from everyone on the
 * boards, each with its medal, and the player's own best under them. Small
 * enough to sit inside another card (the marshal's words), in that card's ink.
 */
import { MEDAL_NAMES, medalSvg } from '../rings/panel.ts';
import { lapText } from '../rings/store.ts';
import { ensureStyle, h } from '../ui.ts';
import type { Answer } from './client.ts';
import { leaderboards } from './page.ts';
import type { CourseRow } from './parse.ts';
import { RECORDS_STYLE } from './style.ts';

/** How many records a course shows. */
export const COURSE_RECORDS = 10;

/** A course's best times, the fastest first; never throws. */
export function courseRecords(courseId: string): Promise<Answer<CourseRow[]>> {
  return leaderboards().course(courseId, { limit: COURSE_RECORDS });
}

/** A medal by its rank, drawn: 1 bronze to 3 gold, nothing for none. */
function medalOf(medal: number): HTMLElement {
  const rank = medal === 1 || medal === 2 || medal === 3 ? medal : 0;
  const holder = h('i', { class: 'atlas-records-medal', title: `${MEDAL_NAMES[rank]} medal` });
  // The markup is the medal's own, for one of three fixed ranks: nothing of a row goes into it.
  if (rank > 0) holder.innerHTML = medalSvg(rank);
  return holder;
}

function recordRow(row: CourseRow): HTMLElement {
  return h(
    'li',
    { class: row.me ? 'atlas-records-row me' : 'atlas-records-row' },
    h('span', { class: 'atlas-records-rank', text: String(row.rank) }),
    medalOf(row.medal),
    h('span', { class: 'atlas-records-name', text: row.name }),
    h('span', { class: 'atlas-records-time', text: lapText(row.ms) }),
  );
}

const SAY: Record<Exclude<Answer<CourseRow[]>['state'], 'ok'>, string> = {
  off: '',
  out: '',
  offline: 'The records are read when you are back online.',
  error: 'The records cannot be read just now.',
};

/**
 * The records as an element that fills itself once they arrive: the ten
 * fastest, the player's own marked, and `mine`, the player's best here as
 * this device keeps it, if they have one.
 */
export function courseBoardElement(courseId: string, mine?: { ms: number; medal: number }): HTMLElement {
  ensureStyle('atlas-records', RECORDS_STYLE);
  const list = h('ol', { class: 'atlas-records-list' });
  const say = h('div', { class: 'atlas-records-say', role: 'status', text: 'Reading the records…' });
  const own = h('div', { class: 'atlas-records-mine' });
  const best = mine !== undefined && Number.isFinite(mine.ms) && mine.ms > 0 ? mine : null;
  own.hidden = best === null;
  if (best !== null) own.append(h('span', { text: 'Your best' }), medalOf(best.medal), h('span', { class: 'atlas-records-time', text: lapText(best.ms) }));
  const element = h('div', { class: 'atlas-records' }, h('div', { class: 'atlas-records-head', text: 'Course records' }), list, say, own);
  void courseRecords(courseId).then((answer) => {
    if (answer.state !== 'ok') {
      say.textContent = SAY[answer.state];
      if (answer.state === 'off') element.hidden = best === null;
      return;
    }
    list.replaceChildren(...answer.value.map(recordRow));
    say.textContent = answer.value.length === 0 ? 'No times yet: the first one round sets the record.' : '';
  });
  return element;
}
