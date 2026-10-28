/**
 * The rings' pages, after Earth's continents: the landmarks' rings, a stamp a
 * landmark in the book's own grid, gold once flown through and an empty
 * outline until then; and the course log, a section a kind with what has
 * been run of it, each course with its medal and its best time stamped beside
 * it.
 */
import { h } from '../ui.ts';
import { CONTINENTS } from '../passport.ts';
import { COURSE_NAMES, courseBadgeSvg } from '../course-marks.ts';
import { MEDAL_NAMES, medalSvg } from '../rings/panel.ts';
import { lapText } from '../rings/store.ts';
import { PER_PAGE } from './constants.ts';
import { page, progressBar } from './leaf.ts';
import { continentOfIso, readRings, visaOf } from './model.ts';
import type { BookModel, Side, Visa } from './model.ts';
import { courseSections, landmarkEntries, logPages } from './rings-model.ts';
import type { CourseSection, LandmarkEntry, LogLine, PassportRings, RingCourseKind } from './rings-model.ts';
import { escape, hashOf } from './stamp-svg.ts';

/** What `pagesOf` lends the rings to lay their pages with. */
export interface PageLayer {
  add(make: (side: Side, number: number) => HTMLElement): void;
  blank(): void;
  /** Pages laid so far. */
  count(): number;
}

/** What to do about a kind of course none of which has been run yet. */
const NONE_YET: Readonly<Record<RingCourseKind, string>> = {
  air: 'None flown yet. Fly near the capital of a big country and its green start ring shows over the town: through it, and the clock runs.',
  land: 'None driven yet. Drive out of such a capital and the rally’s green arch stands on the road at its gate.',
  sea: 'None sailed yet. Take a boat off a port on one of the seas and the race’s green arch floats offshore.',
};

/** The landmarks' visa's seal: a ring inside the rose's circles. */
function ringSeal(colour: string): string {
  return (
    `<svg viewBox="0 0 48 48" fill="none" stroke="${colour}" stroke-width="2" aria-hidden="true">` +
    '<circle cx="24" cy="24" r="21"/><circle cx="24" cy="24" r="16" stroke-width="1" stroke-dasharray="1.5 2.5"/>' +
    '<circle cx="24" cy="24" r="8.5" stroke-width="4.5"/></svg>'
  );
}

/** The log's seal: a chequered flag inside the same circles. */
function flagSeal(colour: string): string {
  const squares: string[] = [];
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 4; column++) {
      if ((row + column) % 2 === 0) squares.push(`<rect x="${17 + column * 4}" y="${13 + row * 4}" width="4" height="4" fill="${colour}" stroke="none"/>`);
    }
  }
  return (
    `<svg viewBox="0 0 48 48" fill="none" stroke="${colour}" stroke-width="2" stroke-linejoin="round" aria-hidden="true">` +
    '<circle cx="24" cy="24" r="21"/><circle cx="24" cy="24" r="16" stroke-width="1" stroke-dasharray="1.5 2.5"/>' +
    `<path d="M17 37V13"/><rect x="17" y="13" width="16" height="12"/>${squares.join('')}</svg>`
  );
}

/**
 * A landmark's place, 64 by 48 like a country's: flown through, a gold ring
 * postmark with its country's code; not yet, the same as a dashed outline.
 */
function ringStamp(entry: LandmarkEntry, ink: string): string {
  const got = entry.got;
  const colour = got ? ink : 'rgba(30, 6, 3, 0.32)';
  const dash = got ? '' : ' stroke-dasharray="3.2 2.4"';
  const ring = got
    ? '<circle cx="32" cy="24" r="18" fill="none" stroke="currentColor" stroke-width="0.9"/>' +
      '<circle cx="32" cy="18.5" r="7.5" fill="none" stroke="currentColor" stroke-width="3.8"/>'
    : '<circle cx="32" cy="18.5" r="7.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="2.4 2"/>';
  return (
    `<svg viewBox="0 0 64 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="color:${colour};font-family:var(--ui-font)" fill="currentColor">` +
    `<g opacity="${got ? 0.92 : 1}"><circle cx="32" cy="24" r="21.5" fill="none" stroke="currentColor" stroke-width="2.6"${dash}/>${ring}` +
    `<text x="32" y="38.5" font-size="7" font-weight="800" letter-spacing="0.6" text-anchor="middle">${escape(entry.iso.slice(0, 4))}</text></g></svg>`
  );
}

/** A visa's heading: its seal, what it is, and the count with its bar. */
function heading(visa: Visa, seal: string, small: string, title: string, got: number, all: number): HTMLElement[] {
  return [
    h(
      'div',
      { class: 'p-cont-head' },
      h('span', { html: seal }),
      h('div', {}, h('small', { text: small }), h('b', { text: title })),
      h('div', { class: 'p-cont-count' }, String(got), h('small', { text: ` / ${all}` })),
    ),
    progressBar(got, all, visa.ink),
  ];
}

function landmarkPage(visa: Visa, side: Side, number: number, entries: readonly LandmarkEntry[], part: number): HTMLElement {
  const grid = h('div', { class: 'p-grid' });
  for (const entry of entries.slice(part * PER_PAGE, (part + 1) * PER_PAGE)) {
    const cell = h(
      'div',
      {
        class: entry.got ? 'p-cell got' : 'p-cell missing',
        'data-landmark': entry.id,
        role: 'img',
        'aria-label': entry.got ? `${entry.name}, ring collected` : `${entry.name}, ring not collected yet`,
      },
      h('div', { class: 'p-mini', html: ringStamp(entry, visa.ink) }),
      h('span', { text: entry.name }),
    );
    if (entry.got) cell.style.setProperty('--tilt', `${Math.round((hashOf(`${entry.id}/tilt`) - 0.5) * 16)}deg`);
    grid.append(cell);
  }
  const got = entries.reduce((sum, entry) => sum + (entry.got ? 1 : 0), 0);
  const result = part === 0
    ? page(side, number, visa.title, 'Earth', ...heading(visa, ringSeal(visa.ink), 'Collected', 'Landmark rings', got, entries.length), grid)
    : page(side, number, visa.title, 'Earth', grid);
  result.classList.add('guilloche');
  return result;
}

/** The tally of a section's medals: gold, silver and bronze, each with its count. */
function tally(section: CourseSection): HTMLElement {
  const medals = h('div', { class: 'p-tally' });
  for (const rank of [3, 2, 1]) {
    const count = section.medals[rank] ?? 0;
    medals.append(h('span', { class: count === 0 ? 'none' : '', 'aria-label': `${count} ${MEDAL_NAMES[rank]!.toLowerCase()}` }, h('i', { html: medalSvg(rank) }), String(count)));
  }
  return medals;
}

function logLine(line: LogLine, ink: string): HTMLElement {
  if (line.type === 'head') {
    const { section } = line;
    return h(
      'div',
      { class: 'p-log-head' },
      h('span', { class: 'p-log-badge', html: courseBadgeSvg(section.kind) }),
      h('div', {}, h('b', { text: COURSE_NAMES[section.kind] }), h('small', { text: `${section.runs.length} of ${section.total} run` })),
      tally(section),
    );
  }
  if (line.type === 'none') return h('div', { class: 'p-log-none', text: NONE_YET[line.kind] });
  const { run } = line;
  const time = h('span', { class: 'p-time', text: lapText(run.ms) });
  time.style.color = ink;
  time.style.setProperty('--tilt', `${((hashOf(`${run.key}/time`) - 0.5) * 7).toFixed(1)}deg`);
  return h(
    'div',
    { class: 'p-log-row', 'aria-label': `${run.title}: ${MEDAL_NAMES[run.medal]} medal, best ${lapText(run.ms)}` },
    h('i', { class: 'p-log-medal', html: medalSvg(run.medal) }),
    h('div', {}, h('b', { text: run.title }), h('small', { text: `${MEDAL_NAMES[run.medal]} · best time` })),
    time,
  );
}

function logPage(visa: Visa, side: Side, number: number, lines: readonly LogLine[], part: number, run: number, total: number): HTMLElement {
  const log = h('div', { class: 'p-log' }, ...lines.map((line) => logLine(line, visa.ink)));
  const result = part === 0
    ? page(side, number, visa.title, 'Earth', ...heading(visa, flagSeal(visa.ink), 'Logbook', 'Courses run', run, total), log)
    : page(side, number, visa.title, 'Earth', log);
  result.classList.add('guilloche');
  return result;
}

/** A continent's place in the book's order, for the landmarks' order; the end for none. */
function rankOf(model: BookModel): (iso: string) => number {
  return (iso) => {
    const continent = continentOfIso(model, iso);
    return continent === null ? CONTINENTS.length : CONTINENTS.indexOf(continent);
  };
}

/**
 * The rings' visas, laid after the continents': each opens on a left-hand
 * page when it runs to two or more, as a continent's does. What they hold is
 * read once, as the book is laid out.
 */
export function ringPages(model: BookModel, layer: PageLayer): void {
  model.partsOf.clear();
  if (model.ringVisas.length === 0) return;
  const rings: PassportRings | null = readRings(model.rings);
  const empty: PassportRings = { landmarks: [], collected: new Set(), courses: new Map(), totals: { air: 0, land: 0, sea: 0 } };
  const now = rings ?? empty;
  const lay = (key: string, parts: number, make: (visa: Visa, side: Side, number: number, part: number) => HTMLElement): void => {
    const visa = visaOf(model, key);
    if (visa === undefined) return;
    if (parts > 1 && layer.count() % 2 === 1) layer.blank();
    model.firstPageOf.set(key, layer.count());
    model.partsOf.set(key, parts);
    for (let part = 0; part < parts; part++) layer.add((side, number) => make(visa, side, number, part));
  };
  const entries = landmarkEntries(now, rankOf(model));
  lay('rings', Math.max(1, Math.ceil(entries.length / PER_PAGE)), (visa, side, number, part) => landmarkPage(visa, side, number, entries, part));
  const sections = courseSections(now);
  const pages = logPages(sections);
  const run = sections.reduce((sum, section) => sum + section.runs.length, 0);
  const total = sections.reduce((sum, section) => sum + section.total, 0);
  lay('courses', pages.length, (visa, side, number, part) => logPage(visa, side, number, pages[part]!, part, run, total));
}
