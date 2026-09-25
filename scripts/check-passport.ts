/**
 * The passport's book, headless: what is written is what is read back, a
 * damaged store reads as what it can still vouch for, a store that refuses
 * every read and write costs nothing but the memory, and a stamp is taken on
 * the ground and never from the air.
 *
 *   node scripts/check-passport.ts
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_TOWNS,
  PASSPORT_KEY,
  createPassport,
  parsePassport,
  serialisePassport,
  stampDate,
  stampDateText,
} from '../src/passport.ts';
import type { PassportMoment, PassportStorage, Stamp } from '../src/passport.ts';

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

test('the date is the sky clock\'s calendar day', () => {
  assert.equal(stampDate(new Date(Date.UTC(2026, 11, 31, 23, 59))), '2026-12-31');
  assert.equal(stampDateText('2026-09-05'), '05 SEP 2026');
});
