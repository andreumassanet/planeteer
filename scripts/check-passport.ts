/**
 * The passport headless: round trip through storage, a damaged store reads as
 * what it can still vouch for, a failing store costs only the session, stamps
 * are taken on the ground and never from the air, every country sits on
 * exactly one continent's pages, other worlds' nations use namespaced codes,
 * and the rings' pages hold every landmark once and every course run once,
 * by kind, on pages none of which overflows.
 *
 *   node scripts/check-passport.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { decodeCountries } from '../src/pack.ts';
import {
  CONTINENTS,
  MAX_TOWNS,
  OPEN_OCEAN_HOMES,
  PASSPORT_KEY,
  byContinent,
  continentOf,
  createPassport,
  isStampKey,
  parsePassport,
  serialisePassport,
  stampDate,
  stampDateText,
  townKey,
  worldOf,
} from '../src/passport.ts';
import type { PassportMoment, PassportStorage, Stamp } from '../src/passport.ts';
import { LINE_ROOM, LOG_FIRST_ROWS, LOG_ROWS, courseSections, landmarkEntries, logPages } from '../src/passport-card/rings-model.ts';
import type { PassportRings } from '../src/passport-card/rings-model.ts';

function memory(initial: Record<string, string> = {}): PassportStorage & { items: Record<string, string> } {
  const items = { ...initial };
  return {
    items,
    getItem: (key) => items[key] ?? null,
    setItem: (key, value) => {
      items[key] = value;
    },
  };
}

const SPAIN: Stamp = { iso: 'ESP', name: 'Spain', date: '2026-09-25', town: 'Palma', mode: 'foot', lat: 39.57, lon: 2.65 };

function moment(iso: string, aloft = false, town = { index: 1, name: 'Palma', iso: 'ESP', inside: false }): PassportMoment {
  return { iso, aloft, mode: aloft ? 'plane' : 'foot', time: new Date(Date.UTC(2026, 8, 25, 10)), lat: 39.571234, lon: 2.649876, town };
}

test('a stamp and a town survive a reload', () => {
  const store = memory();
  const first = createPassport(store);
  assert.equal(first.stamp(SPAIN), true);
  assert.equal(first.stamp({ ...SPAIN, town: 'Madrid' }), false, 'a second stamp for a country is refused');
  assert.equal(first.visitTown('ESP:Palma'), true);
  assert.equal(first.visitTown('ESP:Palma'), false);
  const second = createPassport(store);
  assert.deepEqual(second.data, first.data);
  assert.equal(second.has('ESP'), true);
  assert.equal(second.data.stamps[0]!.town, 'Palma');
  assert.equal(serialisePassport(parsePassport(store.items[PASSPORT_KEY])), store.items[PASSPORT_KEY]);
});

test('a damaged book reads as the stamps it can vouch for', () => {
  for (const junk of [null, undefined, '', '{', '[]', 'null', '42', '{"version":2,"stamps":[]}', '{"version":1,"stamps":"no"}']) {
    assert.deepEqual(parsePassport(junk), { version: 1, stamps: [], towns: [] }, String(junk));
  }
  const mixed = JSON.stringify({
    version: 1,
    stamps: [
      SPAIN,
      { ...SPAIN, town: 'Madrid' },
      { iso: 'fra', date: '2026-09-25' },
      { iso: 'FRA', date: 'yesterday' },
      { iso: 'FRA', date: '2026-09-26', mode: 'teleport', lat: 'north', lon: 999 },
      'PRT',
      null,
    ],
    towns: ['ESP:Palma', 'ESP:Palma', 7, '', 'FRA:Paris'],
  });
  const book = parsePassport(mixed);
  assert.deepEqual(book.stamps.map((stamp) => stamp.iso), ['ESP', 'FRA']);
  assert.equal(book.stamps[0]!.town, 'Palma', 'the first stamp of a country is the one kept');
  assert.equal(book.stamps[1]!.mode, 'foot', 'an unknown mode reads as on foot');
  assert.equal(book.stamps[1]!.name, 'FRA', 'a missing name reads as the code');
  assert.equal(book.stamps[1]!.lat, 0);
  assert.equal(book.stamps[1]!.lon, 0);
  assert.deepEqual(book.towns, ['ESP:Palma', 'FRA:Paris']);
});

test('the towns are capped, oldest first', () => {
  const towns = Array.from({ length: MAX_TOWNS + 5 }, (_, i) => `XXX:${i}`);
  const book = parsePassport(JSON.stringify({ version: 1, stamps: [], towns }));
  assert.equal(book.towns.length, MAX_TOWNS);
  assert.equal(book.towns[0], 'XXX:5');
});

test('a store that refuses everything leaves a book for the session', () => {
  const hostile: PassportStorage = {
    getItem: () => {
      throw new Error('SecurityError');
    },
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
  };
  const passport = createPassport(hostile);
  assert.equal(passport.stamp(SPAIN), true);
  assert.equal(passport.has('ESP'), true);
  assert.equal(createPassport(null).data.stamps.length, 0);
});

test('a stamp is taken on the ground in the country arrived in, never from the air', () => {
  const passport = createPassport(memory());
  const stamped: Stamp[] = [];
  passport.onStamp = (stamp) => stamped.push(stamp);
  passport.arrived('ESP', 'Spain');
  passport.observe(moment('ESP', true));
  assert.equal(stamped.length, 0, 'flying over is not an arrival');
  passport.observe(moment('FRA'));
  assert.equal(stamped.length, 0, 'down in another country is not this one');
  passport.observe(moment('ESP'));
  assert.equal(stamped.length, 1);
  assert.deepEqual(stamped[0], { iso: 'ESP', name: 'Spain', date: '2026-09-25', town: 'Palma', mode: 'foot', lat: 39.57, lon: 2.65 });
  passport.observe(moment('ESP'));
  passport.arrived('ESP', 'Spain');
  passport.observe(moment('ESP'));
  assert.equal(stamped.length, 1, 'once a country');
  // Flying over France to land in Portugal stamps Portugal and not France.
  passport.arrived('FRA', 'France');
  passport.observe(moment('FRA', true));
  passport.arrived('PRT', 'Portugal');
  passport.observe(moment('PRT'));
  assert.deepEqual(passport.data.stamps.map((stamp) => stamp.iso), ['ESP', 'PRT']);
});

test('a town counts once, inside it and on the ground', () => {
  const passport = createPassport(memory());
  const palma = { index: 3, name: 'Palma', iso: 'ESP', inside: true };
  passport.observe(moment('ESP', true, palma));
  assert.equal(passport.data.towns.length, 0);
  passport.observe(moment('ESP', false, palma));
  passport.observe(moment('ESP', false, palma));
  passport.observe(moment('ESP', false, { ...palma, inside: false }));
  passport.observe(moment('ESP', false, palma));
  passport.observe(moment('ESP', false, { index: 4, name: 'Inca', iso: 'ESP', inside: true }));
  assert.deepEqual(passport.data.towns, ['ESP:Palma', 'ESP:Inca']);
});

test('the date is the sky clock\'s calendar day on the player\'s own calendar', () => {
  const zone = process.env['TZ'];
  try {
    // Half past midnight on New Year's Day in Auckland is still the old year in UTC.
    process.env['TZ'] = 'Pacific/Auckland';
    assert.equal(stampDate(new Date(Date.UTC(2026, 11, 31, 11, 30))), '2027-01-01');
    // And late on New Year's Eve in Honolulu is already the new year there.
    process.env['TZ'] = 'Pacific/Honolulu';
    assert.equal(stampDate(new Date(Date.UTC(2027, 0, 1, 9, 30))), '2026-12-31');
  } finally {
    if (zone === undefined) delete process.env['TZ'];
    else process.env['TZ'] = zone;
  }
  assert.equal(stampDateText('2026-09-05'), '05 SEP 2026');
});

test('every country has a place on exactly one continent\'s pages', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  let bytes: Uint8Array = readFileSync(resolve(here, '../public/data/countries.bin'));
  // The bake gzips; a file served already inflated reads as it is.
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = gunzipSync(bytes);
  const countries = decodeCountries(bytes);
  assert.ok(countries.length > 200, `${countries.length} countries read`);
  const pages = byContinent(countries);
  const placed = new Map<string, string>();
  for (const [continent, list] of pages) {
    for (const country of list) {
      assert.equal(placed.has(country.iso), false, `${country.iso} is on two continents' pages`);
      placed.set(country.iso, continent);
    }
    // `PER_PAGE` in passport-card.ts is thirty, and a continent is meant to lie open as one spread.
    assert.ok(list.length <= 60, `${continent} has ${list.length} countries, more than a spread holds`);
    assert.deepEqual(list.map((c) => c.name), [...list.map((c) => c.name)].sort((a, b) => a.localeCompare(b, 'en')), `${continent} is in order`);
  }
  for (const country of countries) {
    assert.notEqual(continentOf(country), null, `${country.iso} (${country.name}, ${country.continent}) has no continent`);
    assert.equal(placed.get(country.iso), continentOf(country));
  }
  assert.equal(placed.size, countries.length);
  assert.deepEqual([...pages.keys()], [...CONTINENTS]);
  // The open ocean's homes are for countries that are there, and nobody else.
  for (const iso of Object.keys(OPEN_OCEAN_HOMES)) {
    const country = countries.find((c) => c.iso === iso);
    assert.ok(country !== undefined, `${iso} is not in the outlines`);
    assert.equal(CONTINENTS.includes(country.continent as (typeof CONTINENTS)[number]), false, `${iso} already has a continent: ${country.continent}`);
  }
  assert.equal(continentOf({ iso: 'XXX', continent: 'Atlantis' }), null);
  console.log(`  ${[...pages].map(([continent, list]) => `${continent} ${list.length}`).join(' · ')}`);
});

test('another world\'s nations go in the same book under their own codes', () => {
  const store = memory();
  const passport = createPassport(store);
  const tharsis: Stamp = { iso: 'mars:tharsis', name: 'Tharsis', date: '2026-10-01', town: 'Ascraeus', mode: 'car', lat: 1.5, lon: -112.25 };
  assert.equal(passport.stamp(SPAIN), true);
  assert.equal(passport.stamp(tharsis), true);
  assert.equal(passport.stamp({ ...tharsis, town: 'Pavonis' }), false, 'once a nation, as once a country');
  assert.equal(passport.visitTown(townKey('mars:tharsis', 'Ascraeus')), true);
  const again = createPassport(store);
  assert.deepEqual(again.data, passport.data, 'a reload reads both worlds back');
  assert.equal(again.has('mars:tharsis'), true);
  assert.deepEqual(again.data.towns, ['mars:tharsis:Ascraeus']);
  // A stamp is taken on the ground there exactly as here.
  passport.arrived('moon:mare-imbrium', 'Mare Imbrium');
  passport.observe({ ...moment('moon:mare-imbrium', true), town: { index: 0, name: 'Copernicus', iso: 'moon:mare-imbrium', inside: false } });
  assert.equal(passport.has('moon:mare-imbrium'), false, 'not from a lander aloft');
  passport.observe({ ...moment('moon:mare-imbrium'), town: { index: 0, name: 'Copernicus', iso: 'moon:mare-imbrium', inside: false } });
  assert.equal(passport.has('moon:mare-imbrium'), true);
  assert.deepEqual(passport.data.stamps.map((stamp) => worldOf(stamp.iso)), ['earth', 'mars', 'moon']);
  // What is and is not a code the book vouches for.
  for (const good of ['ESP', 'US', 'mars:tharsis', 'jupiter:band-3', 'moon:x']) assert.equal(isStampKey(good), true, good);
  for (const bad of ['esp', 'ESPANA', 'Mars:tharsis', 'mars:', ':tharsis', 'mars:Tharsis', 'mars:tharsis:town', `mars:${'a'.repeat(33)}`, 'mars tharsis']) {
    assert.equal(isStampKey(bad), false, bad);
  }
  const book = parsePassport(JSON.stringify({ version: 1, stamps: [tharsis, { ...tharsis, iso: 'Mars:Tharsis' }, { ...tharsis, iso: 'venus:aphrodite', date: 'soon' }], towns: [] }));
  assert.deepEqual(book.stamps.map((stamp) => stamp.iso), ['mars:tharsis']);
  assert.equal(continentOf({ iso: 'mars:tharsis', continent: 'Mars' }), null, 'no continent of Earth\'s pages holds a nation of Mars');
});

test('the rings\' pages: every landmark once, every course run once under its kind, no page overfull', () => {
  const landmarks = Array.from({ length: 119 }, (_, i) => ({ id: `landmark-${i}`, name: `Landmark ${String(i).padStart(3, '0')}`, iso: i % 3 === 0 ? 'ESP' : i % 3 === 1 ? 'JPN' : 'BRA' }));
  const courses = new Map<string, { ms: number; medal: number; title: string; kind: 'air' | 'sea' | 'land' }>();
  for (let i = 0; i < 40; i++) courses.set(`a:${i}`, { ms: 60000 + i * 1000, medal: 1 + (i % 3), title: `Sky ${i}`, kind: 'air' });
  for (let i = 0; i < 3; i++) courses.set(`s:sea-${i}`, { ms: 90000, medal: 3, title: `Sea ${i}`, kind: 'sea' });
  const rings: PassportRings = {
    landmarks,
    collected: new Set(['landmark-1', 'landmark-4', 'landmark-7']),
    courses,
    totals: { air: 112, land: 98, sea: 16 },
  };
  const rank: Record<string, number> = { ESP: 0, JPN: 1, BRA: 2 };
  const entries = landmarkEntries(rings, (iso) => rank[iso] ?? 9);
  assert.equal(entries.length, 119);
  assert.equal(new Set(entries.map((entry) => entry.id)).size, 119, 'each landmark once');
  assert.deepEqual(entries.filter((entry) => entry.got).map((entry) => entry.id).sort(), ['landmark-1', 'landmark-4', 'landmark-7']);
  for (let i = 1; i < entries.length; i++) assert.ok(rank[entries[i - 1]!.iso]! <= rank[entries[i]!.iso]!, 'ordered by continent');

  const sections = courseSections(rings);
  assert.deepEqual(sections.map((section) => section.kind), ['air', 'land', 'sea']);
  assert.deepEqual(sections.map((section) => section.runs.length), [40, 0, 3]);
  assert.deepEqual(sections.map((section) => section.total), [112, 98, 16]);
  assert.equal(sections[0]!.medals.slice(1).reduce((a, b) => a + b, 0), 40, 'every run has its medal counted');
  for (const section of sections) {
    for (let i = 1; i < section.runs.length; i++) assert.ok(section.runs[i - 1]!.medal >= section.runs[i]!.medal, 'best medals first');
  }

  const pages = logPages(sections);
  const lines = pages.flat();
  assert.equal(lines.filter((line) => line.type === 'run').length, 43, 'every run on exactly one page');
  assert.equal(lines.filter((line) => line.type === 'head').length, 3);
  assert.equal(lines.filter((line) => line.type === 'none').length, 1, 'the kind with none run says so');
  pages.forEach((page, n) => {
    const used = page.reduce((sum, line) => sum + LINE_ROOM[line.type], 0);
    assert.ok(used <= (n === 0 ? LOG_FIRST_ROWS : LOG_ROWS), `log page ${n} holds ${used} rows`);
    assert.notEqual(page[page.length - 1]!.type, 'head', `log page ${n} does not end on a heading`);
  });
  // With nothing run, the log is one page saying so for each kind.
  const blank = logPages(courseSections({ ...rings, courses: new Map() }));
  assert.equal(blank.length, 1);
  assert.equal(blank[0]!.filter((line) => line.type === 'none').length, 3);
});
