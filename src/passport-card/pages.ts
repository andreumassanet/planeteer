/** The book's pages: the notice, the holder's page, each visa and each world's frontispiece. */
import { PALETTE } from '../theme.ts';
import { h } from '../ui.ts';
import { encodeAppearance } from '../appearance.ts';
import { stampDateText, worldOf } from '../passport.ts';
import type { PassportChapter } from '../planet.ts';
import type { PassportCardOptions } from '../passport-card.ts';
import { PER_PAGE, inked } from './constants.ts';
import { mrzName, pad, portrait, seal, worldDisc } from './art.ts';
import { page, progressBar } from './leaf.ts';
import { ringPages } from './rings-pages.ts';
import { hashOf, miniStamp } from './stamp-svg.ts';
import { miniSeal } from './seal-svg.ts';
import { continentOfIso, countOf, stampsByIso, visaOf } from './model.ts';
import type { BookModel, PageMaker, Side, Visa } from './model.ts';

/** The inside of the front cover, with the notice every passport prints there. */
function endpaper(model: BookModel): HTMLElement {
  const stamps = model.passport.data.stamps;
  return h(
    'div',
    { class: 'p-page endpaper verso' },
    h(
      'div',
      { class: 'p-label' },
      h('b', { text: 'Notice to the holder' }),
      h('p', { text: 'Every country you come down in is stamped in this book: walking in, swimming ashore, driving, sailing or landing. Flying over does not count.' }),
      h('p', { text: 'Each continent has its visa, with a place for every one of its countries. The ones still in grey are the ones you have not been to.' }),
      model.chapters.length === 0 ? null : h('p', { text: 'Every other world has a chapter of its own, behind the planets on the right-hand edge, with a seal for each of its nations.' }),
      h('small', { text: stamps.length === 0 ? 'Not yet stamped.' : `First stamp: ${stamps[0]!.name}, ${stampDateText(stamps[0]!.date)}.` }),
    ),
  );
}

/** How many of the book's worlds have a stamp in it. */
function worldsStamped(model: BookModel): number {
  const known = new Set(['earth', ...model.chapters.map((chapter) => chapter.body)]);
  return new Set(model.passport.data.stamps.map((stamp) => worldOf(stamp.iso)).filter((world) => known.has(world))).size;
}

function holderPage(model: BookModel, options: PassportCardOptions, side: Side, number: number): HTMLElement {
  const who = options.holder?.() ?? null;
  const name = who?.name.trim() || 'Traveller';
  const code = who === null ? '' : encodeAppearance(who.appearance);
  const stamps = model.passport.data.stamps;
  const earthly = stamps.filter((stamp) => worldOf(stamp.iso) === 'earth');
  const field = (label: string, value: string, mono = false): HTMLElement =>
    h('div', { class: 'p-field' }, h('small', { text: label }), h('span', { class: mono ? 'code' : '', text: value }));
  const surname = mrzName(name) || 'TRAVELLER';
  const mrz =
    `${pad(`P<ATL${surname}`, 32)}\n` +
    `${pad(`${code.toUpperCase().replace(/[^A-Z0-9]/g, '<')}<${String(stamps.length).padStart(3, '0')}<EARTH`, 32)}`;
  const holder = page(
    side,
    number,
    'Holder',
    'Earth',
    h('div', { class: 'p-id-head' }, h('b', { text: 'PASSPORT' }), h('span', { text: 'TYPE P · ATL' })),
    h(
      'div',
      { class: 'p-id' },
      h('div', { class: 'p-photo', html: portrait(who?.appearance ?? null) }),
      h(
        'div',
        { class: 'p-fields' },
        field('Name', name),
        field('Nationality', 'Of the Earth'),
        field('Countries', `${earthly.length} of ${options.countries.length}`),
        field('Continents', `${new Set(earthly.map((stamp) => continentOfIso(model, stamp.iso)).filter((c) => c !== null)).size} of ${model.earthVisas.length}`),
        model.chapters.length === 0 ? null : field('Worlds', `${worldsStamped(model)} of ${1 + model.chapters.length}`),
        field('Date of issue', stamps.length === 0 ? 'On the first stamp' : stampDateText(stamps[0]!.date)),
        field('Place of issue', stamps.length === 0 ? '—' : stamps[0]!.town || stamps[0]!.name),
      ),
    ),
    h('div', { class: 'p-sign' }, h('span', { text: name }), h('small', { text: 'Signature' })),
    h('div', { class: 'p-mrz', text: mrz, 'aria-hidden': 'true' }),
  );
  holder.classList.add('guilloche');
  return holder;
}

/**
 * A page of a visa: every one of its places in a grid, by name, the ones
 * stamped in their own ink and the rest an empty outline, so the page says
 * what is missing as plainly as what is there.
 */
function visaPage(model: BookModel, side: Side, number: number, visa: Visa, part: number): HTMLElement {
  const all = visa.entries;
  const stamped = stampsByIso(model);
  const got = countOf(visa, stamped);
  const earth = visa.chapter === 'earth';
  const world = earth ? 'Earth' : visa.title;
  const grid = h('div', { class: 'p-grid' });
  for (const entry of all.slice(part * PER_PAGE, (part + 1) * PER_PAGE)) {
    const stamp = stamped.get(entry.iso) ?? null;
    const nation = earth ? undefined : model.nationOf.get(entry.iso);
    const cell = h(
      'div',
      {
        class: stamp === null ? 'p-cell missing' : 'p-cell got',
        'data-iso': entry.iso,
        role: 'img',
        'aria-label': stamp === null ? `${entry.name}, not visited yet` : `${entry.name}, stamped ${stampDateText(stamp.date)}`,
      },
      h('div', { class: 'p-mini', html: nation === undefined ? miniStamp(entry.iso, stamp) : miniSeal(nation, stamp) }),
      h('span', { text: entry.name }),
    );
    if (stamp !== null) cell.style.setProperty('--tilt', `${Math.round((hashOf(`${entry.iso}/tilt`) - 0.5) * 16)}deg`);
    grid.append(cell);
  }
  // The heading, the count and the bar once a visa, on its first page; a
  // page it runs on to carries the grid alone under the running head.
  const mark = earth ? seal(visa.ink) : worldDisc(visa.chapter, model.chapters.find((chapter) => chapter.body === visa.chapter)?.color ?? PALETTE.white);
  const result = part === 0
    ? page(
        side,
        number,
        visa.title,
        world,
        h(
          'div',
          { class: 'p-cont-head' },
          h('span', { html: mark }),
          h('div', {}, h('small', { text: 'Visa' }), h('b', { text: earth ? visa.title : `The nations of ${visa.title}` })),
          h('div', { class: 'p-cont-count' }, String(got), h('small', { text: ` / ${all.length}` })),
        ),
        progressBar(got, all.length, visa.ink),
        grid,
      )
    : page(side, number, visa.title, world, grid);
  result.classList.add('guilloche');
  return result;
}

/**
 * The page a world's chapter opens on, facing its visa: the planet, its
 * name, in its own people's writing where they have one, and how much of it
 * the book holds.
 */
function frontispiece(model: BookModel, side: Side, number: number, chapter: PassportChapter): HTMLElement {
  const visa = visaOf(model, chapter.body);
  const got = visa === undefined ? 0 : countOf(visa, stampsByIso(model));
  const all = chapter.nations.length;
  const ink = visa?.ink ?? inked(PALETTE.slate, 0.35);
  let written: Element | null = null;
  try {
    written = chapter.script?.(chapter.name) ?? null;
  } catch {
    written = null;
  }
  const writing = written === null ? null : h('div', { class: 'p-script' }, written as HTMLElement);
  if (writing !== null) writing.style.color = ink;
  const front = page(
    side,
    number,
    chapter.name,
    chapter.name,
    h(
      'div',
      { class: 'p-front' },
      h('div', { class: 'p-globe', html: worldDisc(chapter.body, chapter.color ?? PALETTE.white) }),
      h('small', { text: 'Chapter' }),
      h('b', { text: chapter.name }),
      writing,
      h('p', { text: `${got === 0 ? 'Not one' : got} of its ${all} ${all === 1 ? 'nation' : 'nations'} stamped. Every nation you come down in here is sealed on the facing page.` }),
      progressBar(got, all, ink),
    ),
  );
  front.classList.add('guilloche');
  return front;
}

function blankPage(side: Side, number: number, world = 'Earth'): HTMLElement {
  return page(side, number, 'Notes', world);
}

/**
 * The book as it stands, open from the start: the inside of the cover and
 * the holder's page on the first spread, then a visa of one or more pages a
 * continent, each of two or more pages opening on a left-hand page so that
 * it lies open as one spread; then a chapter a world, its frontispiece on a
 * left-hand page facing its visa; and a blank to close the last spread.
 * The rings' visas, when the book has them, close Earth's chapter.
 * Page `2n` is spread `n`'s left, `2n + 1` its right.
 */
export function pagesOf(model: BookModel, options: PassportCardOptions): PageMaker[] {
  const pages: PageMaker[] = [() => endpaper(model)];
  let world = 'Earth';
  const add = (make: (side: Side, number: number) => HTMLElement): void => {
    const number = pages.length;
    pages.push((side) => make(side, number));
  };
  const blank = (): void => {
    const name = world;
    add((side, number) => blankPage(side, number, name));
  };
  add((side, number) => holderPage(model, options, side, number));
  model.firstPageOf.clear();
  model.chapterStart.clear();
  model.chapterStart.set('earth', 0);
  for (const visa of model.earthVisas) {
    const parts = Math.ceil(visa.entries.length / PER_PAGE);
    if (parts > 1 && pages.length % 2 === 1) blank();
    model.firstPageOf.set(visa.key, pages.length);
    for (let part = 0; part < parts; part++) add((side, number) => visaPage(model, side, number, visa, part));
  }
  ringPages(model, { add, blank, count: () => pages.length });
  for (const chapter of model.chapters) {
    if (pages.length % 2 === 1) blank();
    world = chapter.name;
    model.chapterStart.set(chapter.body, pages.length);
    add((side, number) => frontispiece(model, side, number, chapter));
    const visa = visaOf(model, chapter.body)!;
    model.firstPageOf.set(visa.key, pages.length);
    const parts = Math.max(1, Math.ceil(visa.entries.length / PER_PAGE));
    for (let part = 0; part < parts; part++) add((side, number) => visaPage(model, side, number, visa, part));
  }
  if (pages.length % 2 === 1) blank();
  return pages;
}