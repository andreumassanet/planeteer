/**
 * The jobs' page, after the course log: what has been done (how many, of
 * which kind, with which medals) and the reputation earned in each country,
 * with the standing it buys there, highest first. Laid in the log's lines.
 */
import { labelOf } from '../controls.ts';
import { h } from '../ui.ts';
import { MEDAL_NAMES, medalSvg } from '../rings/panel.ts';
import { progressBar, page } from './leaf.ts';
import type { Side, Visa } from './model.ts';
import { hashOf } from './stamp-svg.ts';

/** What the caller hands the book of the jobs (`jobs.ts`'s record, read when a page is laid). */
export interface PassportJobs {
  /** Jobs done, by kind, and medals by rank: `[bronze, silver, gold]`. */
  done: number;
  byKind: Readonly<Record<'errand' | 'taxi' | 'cargo' | 'rescue', number>>;
  medals: readonly [number, number, number];
  /** Each country with any reputation, highest first. */
  countries: readonly { iso: string; name: string; points: number; standing: string; rank: number }[];
  /** The standings there are, for the bar under the heading. */
  ranks: number;
}

/** Rows on the first page, under the heading and the tally, and on every page after. */
export const JOB_FIRST_ROWS = 8;
export const JOB_ROWS = 13;

const KIND_NAMES = { errand: 'errands', taxi: 'fares', cargo: 'loads', rescue: 'rescues' } as const;

const noneYet = (): string =>
  'No jobs yet. A townsperson with an errand, a fare waving outside a town’s gate, crates beside an airstrip, ' +
  `somebody in trouble off a coast or up a hill: press ${labelOf('jobs')} to head for the nearest, and ${labelOf('use')} beside them.`;

/** The jobs' seal: a handshake's two hands inside the rose's circles, drawn as two hooks. */
function seal(colour: string): string {
  return (
    `<svg viewBox="0 0 48 48" fill="none" stroke="${colour}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
    '<circle cx="24" cy="24" r="21"/><circle cx="24" cy="24" r="16" stroke-width="1" stroke-dasharray="1.5 2.5"/>' +
    '<path d="M13 26l6-6h6l-4 4 3 3 8-7" stroke-width="2.6"/><path d="M35 26l-6 6h-5" stroke-width="2.6"/></svg>'
  );
}

/** A country's standing, stamped: its rank as stars in a double-ruled box, a little askew. */
function standingStamp(iso: string, rank: number, ink: string): HTMLElement {
  const stars = '★'.repeat(Math.max(1, rank));
  const stamp = h('span', { class: 'p-time', text: stars });
  stamp.style.color = ink;
  stamp.style.setProperty('--tilt', `${((hashOf(`${iso}/standing`) - 0.5) * 7).toFixed(1)}deg`);
  return stamp;
}

function tally(jobs: PassportJobs): HTMLElement {
  const medals = h('div', { class: 'p-tally' });
  for (const rank of [3, 2, 1]) {
    const count = jobs.medals[rank - 1] ?? 0;
    medals.append(h('span', { class: count === 0 ? 'none' : '', 'aria-label': `${count} ${MEDAL_NAMES[rank]!.toLowerCase()}` }, h('i', { html: medalSvg(rank) }), String(count)));
  }
  return medals;
}

/** How many pages the jobs run to. */
export function jobPageCount(jobs: PassportJobs): number {
  const rest = Math.max(0, jobs.countries.length - JOB_FIRST_ROWS);
  return 1 + Math.ceil(rest / JOB_ROWS);
}

export function jobPage(visa: Visa, side: Side, number: number, jobs: PassportJobs, part: number): HTMLElement {
  const from = part === 0 ? 0 : JOB_FIRST_ROWS + (part - 1) * JOB_ROWS;
  const rows = jobs.countries.slice(from, from + (part === 0 ? JOB_FIRST_ROWS : JOB_ROWS)).map((country) =>
    h(
      'div',
      { class: 'p-log-row', 'aria-label': `${country.name}: ${country.standing}, ${country.points} reputation` },
      h('div', {}, h('b', { text: country.name }), h('small', { text: `${country.standing} · ${country.points} reputation` })),
      standingStamp(country.iso, country.rank, visa.ink),
    ),
  );
  const log = h('div', { class: 'p-log' });
  if (part === 0) {
    const kinds = (Object.keys(KIND_NAMES) as (keyof typeof KIND_NAMES)[])
      .filter((kind) => jobs.byKind[kind] > 0)
      .map((kind) => `${jobs.byKind[kind]} ${KIND_NAMES[kind]}`)
      .join(' · ');
    log.append(
      h(
        'div',
        { class: 'p-log-head' },
        h('div', {}, h('b', { text: 'Reputation' }), h('small', { text: kinds === '' ? 'nothing done yet' : kinds })),
        tally(jobs),
      ),
    );
    if (jobs.countries.length === 0) log.append(h('div', { class: 'p-log-none', text: noneYet() }));
  }
  log.append(...rows);
  const best = jobs.countries[0]?.rank ?? 0;
  const result =
    part === 0
      ? page(
          side,
          number,
          visa.title,
          'Earth',
          h(
            'div',
            { class: 'p-cont-head' },
            h('span', { html: seal(visa.ink) }),
            h('div', {}, h('small', { text: 'Work permit' }), h('b', { text: 'Jobs done' })),
            h('div', { class: 'p-cont-count' }, String(jobs.done)),
          ),
          progressBar(best, jobs.ranks, visa.ink),
          log,
        )
      : page(side, number, visa.title, 'Earth', log);
  result.classList.add('guilloche');
  return result;
}
