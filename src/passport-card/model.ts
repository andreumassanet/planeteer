/**
 * The book's data and which page is open: visas, nations, the page list and
 * the pure questions asked of them. No DOM lives here.
 */
import { PALETTE } from '../theme.ts';
import type { CountryFacts } from '../country-facts.ts';
import { CONTINENTS, byContinent, continentOf, worldOf } from '../passport.ts';
import type { Continent, Passport, Stamp } from '../passport.ts';
import type { PassportChapter } from '../planet.ts';
import { CONTINENT_INK, PER_PAGE, inked } from './constants.ts';
import type { Nation } from './seal-svg.ts';
import type { PassportCardOptions } from '../passport-card.ts';

export type Side = 'verso' | 'recto';
export type PageMaker = (side: Side) => HTMLElement;

/** One visa: a bookmark along the top, and a grid of places on one or more pages. */
export interface Visa {
  /** The continent's name on Earth, the body's id elsewhere. */
  key: string;
  /** The chapter it is in: `'earth'` or the body's id. */
  chapter: string;
  title: string;
  /** Its print, and the dye of its bookmark. */
  ink: string;
  dye: string;
  entries: readonly { iso: string; name: string }[];
}

export interface BookModel {
  readonly passport: Passport;
  readonly countryOf: Map<string, { iso: string; name: string; continent: string }>;
  /** Earth's visas: every continent with a country. */
  readonly earthVisas: Visa[];
  /** Earth's visas followed by one per chapter. */
  visas: Visa[];
  /** The other worlds, once the caller has handed them over. */
  chapters: readonly PassportChapter[];
  /** The other worlds' nations by code. */
  readonly nationOf: Map<string, Nation>;
  /** The page each visa begins on, and each chapter, as `pagesOf` last laid the book out. */
  readonly firstPageOf: Map<string, number>;
  readonly chapterStart: Map<string, number>;
  pages: PageMaker[];
  /** The spread on show: pages `2n` and `2n + 1`. */
  spread: number;
  /** Whether the book has been turned since it opened, so a late chapter does not move it. */
  turned: boolean;
  /** One page at a time: which of the spread's two is on show, 0 the left. */
  half: number;
  /** The half the next `turn` lands on, when its caller knows; the left otherwise. */
  pendingHalf: number | null;
  /** The facts for the tooltip's capital, once `country-facts.ts` has them. */
  facts: Record<string, CountryFacts> | null;
}

export function createBookModel(options: PassportCardOptions): BookModel {
  const continents = byContinent(options.countries);
  const earthVisas: Visa[] = CONTINENTS.filter((continent) => continents.get(continent)!.length > 0).map((continent) => ({
    key: continent,
    chapter: 'earth',
    title: continent,
    ink: inked(CONTINENT_INK[continent], 0.35),
    dye: inked(CONTINENT_INK[continent], 0.3),
    entries: continents.get(continent)!,
  }));
  return {
    passport: options.passport,
    countryOf: new Map(options.countries.map((country) => [country.iso, country])),
    earthVisas,
    visas: earthVisas,
    chapters: [],
    nationOf: new Map(),
    firstPageOf: new Map(),
    chapterStart: new Map(),
    pages: [],
    spread: 0,
    turned: false,
    half: 0,
    pendingHalf: null,
    facts: null,
  };
}

/** The chapters a caller hands in, without Earth's own. */
export function otherWorlds(list: readonly PassportChapter[]): readonly PassportChapter[] {
  return list.filter((chapter) => chapter.body !== 'earth');
}

/** Rebuilds `visas` and `nationOf` from the chapters as they stand. */
export function layoutModel(model: BookModel): void {
  model.visas = [
    ...model.earthVisas,
    ...model.chapters.map((chapter) => ({
      key: chapter.body,
      chapter: chapter.body,
      title: chapter.name,
      ink: inked(chapter.color ?? PALETTE.slate, 0.35),
      dye: inked(chapter.color ?? PALETTE.slate, 0.3),
      entries: chapter.nations,
    })),
  ];
  model.nationOf.clear();
  for (const chapter of model.chapters) {
    for (const nation of chapter.nations) {
      const entry: Nation = { iso: nation.iso, name: nation.name, color: nation.color, world: chapter.name };
      if (chapter.script !== undefined) entry.script = chapter.script;
      model.nationOf.set(nation.iso, entry);
    }
  }
}

export function stampsByIso(model: BookModel): Map<string, Stamp> {
  return new Map(model.passport.data.stamps.map((stamp) => [stamp.iso, stamp]));
}

export function continentOfIso(model: BookModel, iso: string): Continent | null {
  const country = model.countryOf.get(iso);
  return country === undefined ? null : continentOf(country);
}

export function visaOf(model: BookModel, key: string): Visa | undefined {
  return model.visas.find((visa) => visa.key === key);
}

/** How many of a visa's places are stamped. */
export function countOf(visa: Visa, stamped: Map<string, Stamp>): number {
  return visa.entries.reduce((sum, entry) => sum + (stamped.has(entry.iso) ? 1 : 0), 0);
}

export const spreads = (model: BookModel): number => model.pages.length / 2;

/** The spread a page lies open on. */
export const spreadOfPage = (index: number): number => Math.floor(index / 2);

/** The chapter a spread is in: the last to start at or before its left page. */
export function chapterAt(model: BookModel, at: number): string {
  let found = 'earth';
  let best = -1;
  for (const [id, start] of model.chapterStart) {
    if (start <= 2 * at && start > best) {
      best = start;
      found = id;
    }
  }
  return found;
}

/** The spread a country's or a nation's place is on, or null for one with no visa. */
export function spreadOfCountry(model: BookModel, iso: string): number | null {
  const world = worldOf(iso);
  const key = world === 'earth' ? continentOfIso(model, iso) : world;
  if (key === null) return null;
  const visa = visaOf(model, key);
  const first = model.firstPageOf.get(key);
  if (visa === undefined || first === undefined) return null;
  const at = visa.entries.findIndex((entry) => entry.iso === iso);
  if (world !== 'earth' && at < 0) return null;
  return spreadOfPage(first + Math.floor(Math.max(0, at) / PER_PAGE));
}

/** The spread with the newest stamp on it, or the holder's with none. */
export function newestSpread(model: BookModel): number {
  const newest = model.passport.data.stamps[model.passport.data.stamps.length - 1];
  return (newest === undefined ? null : spreadOfCountry(model, newest.iso)) ?? 0;
}

/** Where the book falls open: the visa of the country underfoot, else the newest stamp's. */
export function openingSpread(model: BookModel, here: string): number {
  return (here === '' ? null : spreadOfCountry(model, here)) ?? newestSpread(model);
}
