/**
 * The passport: every country you have set foot in, stamped on the day you
 * arrived and at the town you came in by, and every town you have walked into;
 * and which continent's pages each country's stamp belongs on (`continentOf`).
 *
 * **A stamp is an arrival, not a flight over.** The HUD's arrival card is the
 * one debounced answer to *which country is this* — a country has to hold for
 * a second, the sea for three — and it fires from the plane as readily as on
 * foot. So an arrival only names a *candidate*; the stamp is taken on the
 * first frame after it with the traveller down on the ground or the water in
 * that same country: walking, swimming, driving, sailing, or a plane that has
 * landed. Fly over France and land in Spain and the book has Spain; land in
 * France on the way and it has both. See `observe`.
 *
 * **This half is data and nothing else**, so a headless check can hold its
 * one promise — what is written is what is read back, and a book that has
 * been damaged, hand-edited or written by an older build reads as the stamps
 * it can still vouch for rather than as an exception. The card that shows it
 * is `passport-card.ts`.
 *
 * **It lives on this device**, in `localStorage` under `PASSPORT_KEY`, every
 * read and write wrapped: a private window, a full quota or a blocked store
 * leaves a passport that works for the session and forgets on reload. Nothing
 * of it is sent to the other players.
 *
 * **One book for every world.** A nation of another planet is stamped under
 * its namespaced code, `mars:tharsis`, beside Earth's ADM0 codes, and a town
 * walked into there is `mars:tharsis:Name`; the card turns them into a chapter
 * a world (`passport-card.ts`). An older book reads as it always did.
 */

/** How you were travelling when the stamp was taken: `controls.ts`'s `TravelMode`. */
export type StampMode =
  | 'foot' | 'swim' | 'car' | 'boat' | 'plane' | 'balloon' | 'passenger'
  | 'bicycle' | 'motorbike' | 'horse' | 'jetski' | 'sailboat' | 'helicopter' | 'submarine';

const MODES: readonly StampMode[] = [
  'foot', 'swim', 'car', 'boat', 'plane', 'balloon', 'passenger',
  'bicycle', 'motorbike', 'horse', 'jetski', 'sailboat', 'helicopter', 'submarine',
];

export interface Stamp {
  /** ADM0_A3, the outlines' key; on another world the nation's namespaced code, `mars:tharsis`. */
  iso: string;
  /** The country's name when it was stamped, so a book outlives a re-bake that renames it. */
  name: string;
  /** The in-game date of the first visit, `YYYY-MM-DD` in UTC. */
  date: string;
  /** The built town nearest to where you came in. */
  town: string;
  mode: StampMode;
  /** Where the stamp was taken, to two decimals: a hundredth of a degree is 1.1 km. */
  lat: number;
  lon: number;
}

export interface PassportData {
  version: 1;
  /** In the order they were taken; one per country. */
  stamps: Stamp[];
  /** Towns walked into, as `ISO:name`, in the order they were first entered. */
  towns: string[];
}

export const PASSPORT_KEY = 'atlas.passport.v1';

/** More towns than this and the oldest are let go: a book is not an unbounded log. */
export const MAX_TOWNS = 20000;

/** The part of `Storage` this reads and writes. */
export interface PassportStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function emptyPassport(): PassportData {
  return { version: 1, stamps: [], towns: [] };
}

const ISO = /^[A-Z0-9]{2,4}$/;
/** A nation of another world: the body's id, a colon, the nation's. */
const NATION = /^[a-z]+:[a-z0-9-]{1,32}$/;

/** Whether a stamp's code is one the book can vouch for: Earth's, or another world's. */
export function isStampKey(iso: string): boolean {
  return ISO.test(iso) || NATION.test(iso);
}

/** The world a stamp's code is on: `'earth'` for Earth's codes, the prefix for the rest. */
export function worldOf(iso: string): string {
  const colon = iso.indexOf(':');
  return colon < 0 ? 'earth' : iso.slice(0, colon);
}
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A string field, trimmed and capped, or null. */
function text(value: unknown, cap: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed.slice(0, cap);
}

function coordinate(value: unknown, limit: number): number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit ? Math.round(value * 100) / 100 : 0;
}

/** One stamp as a stored value, or null when it cannot be vouched for. */
export function readStamp(value: unknown): Stamp | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  const iso = text(raw.iso, 40);
  const date = text(raw.date, 10);
  if (iso === null || !isStampKey(iso) || date === null || !DATE.test(date)) return null;
  const mode = MODES.includes(raw.mode as StampMode) ? (raw.mode as StampMode) : 'foot';
  return {
    iso,
    name: text(raw.name, 80) ?? iso,
    date,
    town: text(raw.town, 80) ?? '',
    mode,
    lat: coordinate(raw.lat, 90),
    lon: coordinate(raw.lon, 180),
  };
}

/**
 * The book as stored, read as leniently as it can be: anything that is not
 * JSON, not the right shape or from a version this does not know is an empty
 * book; a stamp that cannot be vouched for is dropped; a second stamp for a
 * country keeps the first.
 */
export function parsePassport(stored: string | null | undefined): PassportData {
  const data = emptyPassport();
  if (typeof stored !== 'string' || stored === '') return data;
  let raw: unknown;
  try {
    raw = JSON.parse(stored);
  } catch {
    return data;
  }
  if (typeof raw !== 'object' || raw === null || (raw as { version?: unknown }).version !== 1) return data;
  const { stamps, towns } = raw as { stamps?: unknown; towns?: unknown };
  const seen = new Set<string>();
  if (Array.isArray(stamps)) {
    for (const entry of stamps) {
      const stamp = readStamp(entry);
      if (stamp === null || seen.has(stamp.iso)) continue;
      seen.add(stamp.iso);
      data.stamps.push(stamp);
    }
  }
  if (Array.isArray(towns)) {
    const held = new Set<string>();
    for (const entry of towns) {
      const town = text(entry, 100);
      if (town === null || held.has(town)) continue;
      held.add(town);
      data.towns.push(town);
    }
    if (data.towns.length > MAX_TOWNS) data.towns.splice(0, data.towns.length - MAX_TOWNS);
  }
  return data;
}

export function serialisePassport(data: PassportData): string {
  return JSON.stringify({ version: 1, stamps: data.stamps, towns: data.towns });
}

/** The in-game date a stamp carries: the sky's clock, as a calendar day in UTC. */
export function stampDate(time: Date): string {
  return time.toISOString().slice(0, 10);
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** `2026-09-25` as the ink says it: `25 SEP 2026`. */
export function stampDateText(date: string): string {
  const [year, month, day] = date.split('-');
  return `${day} ${MONTHS[Number(month) - 1] ?? '???'} ${year}`;
}

/**
 * The continents the book has pages for, in the order it takes them.
 * Natural Earth's own, less its *Seven seas (open ocean)*, which nobody counts
 * as one: its islands go to the continent they are counted with
 * (`OPEN_OCEAN_HOMES`).
 */
export const CONTINENTS = ['Europe', 'Asia', 'Africa', 'North America', 'South America', 'Oceania', 'Antarctica'] as const;
export type Continent = (typeof CONTINENTS)[number];

/**
 * The open ocean's countries, each with the continent its pages are on: the
 * Indian Ocean's republics with Africa, as the African Union counts them; the
 * South Atlantic's islands with Africa or South America, by which shore they
 * face; and the sub-Antarctic territories with Antarctica.
 */
export const OPEN_OCEAN_HOMES: Readonly<Record<string, Continent>> = {
  MUS: 'Africa',
  SYC: 'Africa',
  SHN: 'Africa',
  SGS: 'South America',
  ATF: 'Antarctica',
  HMD: 'Antarctica',
};

/** Which continent's pages a country's stamp is on, or null for one the book does not know. */
export function continentOf(country: { iso: string; continent: string }): Continent | null {
  const home = OPEN_OCEAN_HOMES[country.iso];
  if (home !== undefined) return home;
  return (CONTINENTS as readonly string[]).includes(country.continent) ? (country.continent as Continent) : null;
}

/** Every country on its continent's pages, by name, each continent in `CONTINENTS`' order. */
export function byContinent<C extends { iso: string; name: string; continent: string }>(countries: readonly C[]): Map<Continent, C[]> {
  const pages = new Map<Continent, C[]>(CONTINENTS.map((continent) => [continent, []]));
  for (const country of countries) {
    const continent = continentOf(country);
    if (continent !== null) pages.get(continent)!.push(country);
  }
  for (const list of pages.values()) list.sort((a, b) => a.name.localeCompare(b.name, 'en'));
  return pages;
}

/** The key a town is counted under. */
export const townKey = (iso: string, name: string): string => `${iso}:${name}`;

/**
 * Where the traveller is this frame, as far as the book cares. The caller
 * keeps one and fills it in; nothing here holds on to it.
 */
export interface PassportMoment {
  /** The country under you, or `''` at sea. */
  iso: string;
  /** In the air: a plane off the ground, a balloon up, or a passenger in either. */
  aloft: boolean;
  mode: StampMode;
  /** The sky's clock. */
  time: Date;
  lat: number;
  lon: number;
  /** The nearest built town, its index among the places (a cheap key), and whether you are inside it. */
  town: { index: number; name: string; iso: string; inside: boolean };
}

export interface Passport {
  readonly data: PassportData;
  /**
   * The arrival card has come in for a country: it is the candidate for a
   * stamp until `observe` finds you down in it, or another arrival replaces it.
   */
  arrived(iso: string, name: string): void;
  /** Every frame: takes the candidate's stamp once you are down in it, and counts the town you are in. */
  observe(moment: PassportMoment): void;
  has(iso: string): boolean;
  /** Adds a stamp unless the country has one; true if it was new. */
  stamp(stamp: Stamp): boolean;
  /** Counts a town walked into; true if it was new. */
  visitTown(key: string): boolean;
  /** Told of every new stamp, after it is stored. */
  onStamp: ((stamp: Stamp) => void) | null;
  /** Empties the book, here and on the device. */
  clear(): void;
}

/** The device's store, if the browser will hand it over at all. */
function deviceStorage(): PassportStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * The book, read from `storage` (the device's by default) and written back
 * to it on every new stamp and every new town — a few times a minute at most
 * on foot, and never per frame. `null` keeps it in memory only.
 */
export function createPassport(storage: PassportStorage | null | undefined = deviceStorage()): Passport {
  let stored: string | null = null;
  try {
    stored = storage?.getItem(PASSPORT_KEY) ?? null;
  } catch {
    // A store that refuses a read is a book that starts empty.
  }
  const data = parsePassport(stored);
  const countries = new Set(data.stamps.map((stamp) => stamp.iso));
  const towns = new Set(data.towns);

  function save(): void {
    try {
      storage?.setItem(PASSPORT_KEY, serialisePassport(data));
    } catch {
      // Full or blocked: the session keeps the book.
    }
  }

  let candidate: { iso: string; name: string } | null = null;
  let lastTown = -1;

  const passport: Passport = {
    data,
    arrived(iso, name) {
      candidate = countries.has(iso) ? null : { iso, name };
    },
    observe(moment) {
      if (moment.aloft) return;
      if (candidate !== null && moment.iso === candidate.iso) {
        const { iso, name } = candidate;
        candidate = null;
        passport.stamp({
          iso,
          name,
          date: stampDate(moment.time),
          town: moment.town.name,
          mode: moment.mode,
          lat: moment.lat,
          lon: moment.lon,
        });
      }
      // A town counts once you are inside its buildings on the ground, and is
      // asked about only when the nearest one changes.
      if (moment.town.inside && moment.town.index !== lastTown) {
        lastTown = moment.town.index;
        passport.visitTown(townKey(moment.town.iso, moment.town.name));
      } else if (!moment.town.inside) lastTown = -1;
    },
    has: (iso) => countries.has(iso),
    stamp(stamp) {
      if (countries.has(stamp.iso)) return false;
      const clean = readStamp(stamp);
      if (clean === null) return false;
      countries.add(clean.iso);
      data.stamps.push(clean);
      save();
      passport.onStamp?.(clean);
      return true;
    },
    visitTown(key) {
      if (towns.has(key)) return false;
      towns.add(key);
      data.towns.push(key);
      if (data.towns.length > MAX_TOWNS) towns.delete(data.towns.shift()!);
      save();
      return true;
    },
    onStamp: null,
    clear() {
      data.stamps.length = 0;
      data.towns.length = 0;
      countries.clear();
      towns.clear();
      save();
    },
  };
  return passport;
}
