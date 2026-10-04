/**
 * The chat without a browser or a relay: what a line may be and how often
 * (`server/src/limits.ts`, which the relay reads too), how a typed line is
 * read as a command and completed, where `/goto` goes on the real gazetteer,
 * what `/time` and `/weather` take, how a townsperson's line is spoken
 * (`voice.ts`), and that nothing a player types is ever written as markup.
 *
 *   node scripts/check-chat.ts
 *
 * The relay's own side, against a running relay, is `scripts/check-relay.ts`.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  CHAT_BURST,
  CHAT_CLIENT_INTERVAL_MS,
  CHAT_INTERVAL_MS,
  CHAT_JITTER_MS,
  CHAT_MAX,
  EMOTES,
  FLAGS,
  chatWait,
  cleanChat,
  cleanCountry,
  cleanEmote,
  cleanFlags,
  freshBucket,
  freshHonk,
  hasFlag,
  HONK_INTERVAL_MS,
  cleanHonkOn,
  spendChat,
  spendHonk,
} from '../server/src/limits.ts';
import {
  COMMANDS,
  actionOf,
  findPlace,
  matchPlayer,
  parseClock,
  parseCommand,
  parseLatLon,
  parseWeather,
  SUGGEST_LIMIT,
  suggest,
  suggestPlaces,
  unescapeSlash,
} from '../src/chat-core.ts';
import { decodeCountries, decodePlaces, inflate } from '../src/pack.ts';
import { indexPlaces } from '../src/places.ts';
import { planSpeech, revealed, voiceOf } from '../src/voice.ts';
import { CLIPS } from '../src/cast.ts';

const here = dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------------------- *
 * A line
 * ------------------------------------------------------------------------- */

test('a line is one printable line, its spaces made one', () => {
  assert.equal(cleanChat('  hello \n\t there  '), 'hello there');
  assert.equal(cleanChat('a\u0000b\u0007c'), 'abc');
  assert.equal(cleanChat(''), '');
  assert.equal(cleanChat('   \n  '), '');
  for (const nonsense of [undefined, null, 3, {}, ['hi']]) assert.equal(cleanChat(nonsense), '');
});

test('nothing turns a line, or the next one, backwards or invisible', () => {
  assert.equal(cleanChat('abc‮def'), 'abcdef');
  assert.equal(cleanChat('⁦x⁩​z﻿'), 'xz');
  assert.equal(cleanChat('one two'), 'onetwo');
  assert.equal(cleanChat('privateuse'), 'privateuse');
});

test('emoji survive, joined ones too, and a heart is not a tag', () => {
  const family = '\u{1F468}‍\u{1F469}‍\u{1F467}';
  assert.equal(cleanChat(`hi ${family}`), `hi ${family}`);
  assert.equal(cleanChat('<3 & <b>bold</b>'), '<3 & <b>bold</b>');
  assert.equal(cleanChat('olé ¿qué tal? 你好 مرحبا'), 'olé ¿qué tal? 你好 مرحبا');
});

test('a web address is carried as [link]', () => {
  assert.equal(cleanChat('see https://example.com/x?y=1 now'), 'see [link] now');
  assert.equal(cleanChat('www.example.org is nice'), '[link] is nice');
  assert.equal(cleanChat('HTTP://SHOUT.COM'), '[link]');
  // A number with a dot is not an address.
  assert.equal(cleanChat('pi is 3.14'), 'pi is 3.14');
});

test(`a line is at most ${CHAT_MAX} characters, never half of one`, () => {
  assert.equal(Array.from(cleanChat('x'.repeat(500))).length, CHAT_MAX);
  const emoji = cleanChat('\u{1F30D}'.repeat(300));
  assert.equal(Array.from(emoji).length, CHAT_MAX);
  assert.ok(!/[\uD800-\uDBFF]$/.test(emoji), 'no lone high surrogate at the end');
  // Cut at the limit, the trailing space goes.
  assert.equal(cleanChat(`${'a'.repeat(CHAT_MAX - 1)} b`), 'a'.repeat(CHAT_MAX - 1));
});

test('a country is an outline code or nothing, a gesture one of the list', () => {
  assert.equal(cleanCountry('ESP'), 'ESP');
  assert.equal(cleanCountry('esp'), '');
  assert.equal(cleanCountry('<b>'), '');
  assert.equal(cleanCountry(12), '');
  for (const emote of EMOTES) assert.equal(cleanEmote(emote), emote);
  // Sitting is a bench now, and still says so on the wire, old clients too.
  assert.equal(cleanEmote('sit'), 'sit');
  assert.equal(cleanEmote('moonwalk'), '');
  assert.equal(cleanEmote(undefined), '');
});

test('flags are an integer of the known bits, or refused', () => {
  const all = (1 << FLAGS.length) - 1;
  for (let f = 0; f <= all; f++) assert.equal(cleanFlags(f), f);
  for (const bad of [all + 1, -1, 0.5, '1', null, undefined, NaN, Infinity]) assert.equal(cleanFlags(bad), -1, String(bad));
  assert.ok(hasFlag(1 << FLAGS.indexOf('chute'), 'chute'));
  assert.ok(!hasFlag(1 << FLAGS.indexOf('chute'), 'sitting'));
  assert.ok(hasFlag(all, 'sitting'));
});

test('every gesture has a clip on the cast', () => {
  const clips: readonly string[] = CLIPS;
  for (const clip of ['Wave', 'Dance', 'Sit']) assert.ok(clips.includes(clip), clip);
});

/* ------------------------------------------------------------------------- *
 * How often
 * ------------------------------------------------------------------------- */

test(`${CHAT_BURST} lines at once, then one each ${CHAT_INTERVAL_MS} ms`, () => {
  const bucket = freshBucket();
  const t0 = 1_000_000;
  for (let i = 0; i < CHAT_BURST; i++) assert.ok(spendChat(bucket, t0 + i), `line ${i + 1}`);
  assert.equal(spendChat(bucket, t0 + CHAT_BURST), false, 'one past the burst');
  assert.ok(chatWait(bucket, t0 + CHAT_BURST) > 0);
  assert.ok(chatWait(bucket, t0 + CHAT_BURST) <= CHAT_INTERVAL_MS);
  assert.equal(chatWait(bucket, t0 + CHAT_BURST + CHAT_INTERVAL_MS), 0);
  assert.ok(spendChat(bucket, t0 + CHAT_BURST + CHAT_INTERVAL_MS), 'one interval later');
  assert.equal(spendChat(bucket, t0 + CHAT_BURST + CHAT_INTERVAL_MS + 10), false);
  // A long silence refills the burst and no more.
  const later = t0 + 3_600_000;
  for (let i = 0; i < CHAT_BURST; i++) assert.ok(spendChat(bucket, later + i));
  assert.equal(spendChat(bucket, later + CHAT_BURST), false);
});

test(`a horn starts at most once each ${HONK_INTERVAL_MS} ms, and stops only what started`, () => {
  const horn = freshHonk();
  const t0 = 2_000_000;
  assert.equal(spendHonk(horn, false, t0), false, 'a stop with nothing sounding');
  assert.ok(spendHonk(horn, true, t0), 'a start');
  assert.equal(spendHonk(horn, true, t0 + 10), false, 'a second start at once');
  assert.ok(spendHonk(horn, false, t0 + 20), 'the stop, however soon');
  assert.equal(spendHonk(horn, false, t0 + 30), false, 'and only once');
  assert.equal(spendHonk(horn, true, t0 + 100), false, 'a tap again too soon');
  assert.ok(spendHonk(horn, true, t0 + HONK_INTERVAL_MS), 'a start one interval on');
  assert.ok(spendHonk(horn, true, t0 + HONK_INTERVAL_MS * 4), 'a refresh while held');
  assert.ok(spendHonk(horn, undefined, t0 + HONK_INTERVAL_MS * 6), 'a tap from an older client');
  assert.equal(spendHonk(horn, false, t0 + HONK_INTERVAL_MS * 6 + 1), false, 'a tap is not held, so nothing stops it');
  assert.equal(cleanHonkOn(true), true);
  assert.equal(cleanHonkOn(false), false);
  assert.equal(cleanHonkOn(undefined), undefined);
  for (const bad of [1, 0, 'true', null, {}]) assert.equal(cleanHonkOn(bad), null, String(bad));
});

/**
 * Two minutes of a sender pressing Enter whenever `press` says, paced by the game's own
 * bucket at `interval`, each line it lets through delayed on its way by a
 * random `[0, jitter]` and kept in order, as a socket keeps it; and how many
 * of those the relay's bucket refuses.
 */
function dropped(interval: number, jitter: number, seed: number, press: (n: number) => number): { sent: number; lost: number } {
  let state = seed >>> 0;
  const random = (): number => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 2 ** 32;
  };
  const game = freshBucket();
  const relay = freshBucket();
  let arrived = 0;
  let sent = 0;
  let lost = 0;
  const start = 1_000_000;
  let t = start;
  // Two minutes of it, however often the key is pressed.
  for (let n = 0; t < start + 120_000; n++) {
    t += press(n);
    if (chatWait(game, t, interval) > 0 || !spendChat(game, t, interval)) continue;
    sent++;
    arrived = Math.max(arrived, t + random() * jitter);
    if (!spendChat(relay, arrived)) lost++;
  }
  return { sent, lost };
}

test(`the game paces ${CHAT_JITTER_MS} ms slower than the relay, so jitter never loses a line`, () => {
  assert.equal(CHAT_CLIENT_INTERVAL_MS, CHAT_INTERVAL_MS + CHAT_JITTER_MS, 'the margin is the jitter it absorbs, added');
  // The burst is the relay's: three lines at once still go.
  const game = freshBucket();
  for (let i = 0; i < CHAT_BURST; i++) assert.ok(spendChat(game, 7_000_000 + i, CHAT_CLIENT_INTERVAL_MS), `line ${i + 1} of the burst`);
  assert.equal(spendChat(game, 7_000_000 + CHAT_BURST, CHAT_CLIENT_INTERVAL_MS), false);
  assert.ok(chatWait(game, 7_000_000 + CHAT_BURST, CHAT_CLIENT_INTERVAL_MS) > CHAT_INTERVAL_MS, 'the game waits longer than the relay would');
  // Hammering the key, pressing at random, and pressing just as the game
  // allows: through a socket that jitters by up to the margin, none lost.
  const senders: [string, (n: number) => number][] = [
    ['every millisecond', () => 1],
    ['every 37 ms', () => 37],
    ['at random', (n) => ((n * 7_919) % 2_300) + 1],
    ['just as allowed', () => CHAT_CLIENT_INTERVAL_MS],
    ['in bursts', (n) => (n % 5 === 4 ? 6_000 : 2)],
  ];
  for (const [name, press] of senders) {
    for (let seed = 1; seed <= 20; seed++) {
      const { sent, lost } = dropped(CHAT_CLIENT_INTERVAL_MS, CHAT_JITTER_MS, seed, press);
      assert.ok(sent > CHAT_BURST, `${name}: some lines go (${sent})`);
      assert.equal(lost, 0, `${name}, seed ${seed}: ${lost} of ${sent} lines dropped by the relay`);
    }
  }
  // And the test bites: paced at the relay's own interval, the same socket
  // loses lines, which is what the margin is for.
  let lost = 0;
  for (let seed = 1; seed <= 20; seed++) lost += dropped(CHAT_INTERVAL_MS, CHAT_JITTER_MS, seed, () => 1).lost;
  assert.ok(lost > 0, 'without the margin, jitter drops a line');
});

test('a clock that goes backwards earns nothing', () => {
  const bucket = freshBucket();
  for (let i = 0; i < CHAT_BURST; i++) spendChat(bucket, 5_000_000);
  assert.equal(spendChat(bucket, 4_000_000), false);
  assert.equal(spendChat(bucket, 4_000_001), false);
});

/* ------------------------------------------------------------------------- *
 * Commands
 * ------------------------------------------------------------------------- */

test('a line with a slash is a command, and `//` escapes it', () => {
  assert.deepEqual(parseCommand('/goto  Paris '), { typed: 'goto', command: COMMANDS.find((c) => c.name === 'goto'), args: 'Paris' });
  assert.equal(parseCommand('/GO paris')?.command?.name, 'goto');
  assert.equal(parseCommand('/? ')?.command?.name, 'help');
  const unknown = parseCommand('/fly me');
  assert.equal(unknown?.command, null);
  assert.equal(unknown?.typed, 'fly');
  assert.equal(parseCommand('hello /goto'), null);
  assert.equal(parseCommand('//shrug'), null);
  assert.equal(unescapeSlash('//shrug'), '/shrug');
  assert.equal(unescapeSlash('plain'), 'plain');
  assert.equal(parseCommand('/')?.command, null);
  assert.equal(actionOf('/me waves hello'), 'waves hello');
  assert.equal(actionOf('/me'), null);
  assert.equal(actionOf('me too'), null);
});

test('every command and alias has one meaning', () => {
  const names = COMMANDS.flatMap((command) => [command.name, ...(command.aliases ?? [])]);
  assert.equal(new Set(names).size, names.length);
  for (const command of COMMANDS) assert.equal(parseCommand(`/${command.name}`)?.command, command);
});

test('a slash lists every command, and typing narrows it', () => {
  const none = { players: [] };
  assert.equal(suggest('/', none).items.length, COMMANDS.length);
  assert.deepEqual(suggest('/w', none).items.map((item) => item.label).sort(), ['/wave', '/weather', '/where', '/who']);
  const go = suggest('/go', none).items;
  assert.equal(go[0]!.label, '/goto', 'the name before an alias');
  assert.equal(go[0]!.line, '/goto ');
  assert.equal(go[0]!.usage, '<town, country or lat,lon>');
  assert.equal(go[0]!.ghost, 'to <town, country or lat,lon>');
  assert.equal(go[0]!.done, false, '/goto wants a place yet');
  assert.ok(go[0]!.detail.length > 0);
  // An alias finds its command.
  assert.deepEqual(suggest('/spa', none).items.map((item) => item.label), ['/home']);
  const home = suggest('/home', none).items[0]!;
  assert.equal(home.line, '/home');
  assert.equal(home.done, true, 'nothing to add: Enter sends it');
  assert.equal(suggest('/zz', none).items.length, 0);
  assert.equal(suggest('hello', none).items.length, 0);
  assert.equal(suggest('//shrug', none).items.length, 0);
  assert.equal(suggest('/sit', none).items.length, 0, '/sit is gone: benches are sat on');
});

test('after the command, its arguments', () => {
  const players = { players: ['Ada', 'Adam', 'Bo', 'Álvaro', 'Ada'] };
  assert.deepEqual(suggest('/tp ', players).items.map((item) => item.label), ['Ada', 'Adam', 'Bo', 'Álvaro']);
  const ad = suggest('/tp ad', players).items;
  assert.deepEqual(ad.map((item) => item.label), ['Ada', 'Adam']);
  assert.equal(ad[0]!.line, '/tp Ada');
  assert.equal(ad[1]!.ghost, 'am');
  assert.deepEqual(suggest('/mute alv', players).items.map((item) => item.line), ['/mute Álvaro']);
  // A name inside another comes after the ones it begins.
  assert.deepEqual(suggest('/tp o', players).items.map((item) => item.label), ['Bo', 'Álvaro']);
  // What is typed whole is not offered back.
  assert.equal(suggest('/tp Bo', players).items.length, 0);
  assert.deepEqual(suggest('/weather ', players).items.map((item) => item.label), ['clear', 'rain', 'storm', 'snow', 'fog', 'auto']);
  assert.deepEqual(suggest('/weather s', players).items.map((item) => item.label), ['storm', 'snow']);
  assert.ok(suggest('/time ', players).items.some((item) => item.label === 'dusk'));
  assert.deepEqual(suggest('/time mi', players).items.map((item) => item.line), ['/time midnight']);
  for (const item of suggest('/time ', players).items) assert.notEqual(parseClock(item.label), null, item.label);
  for (const item of suggest('/weather ', players).items) assert.equal(parseWeather(item.label), item.label);
  // A command that takes nothing offered shows what it takes, greyed.
  assert.deepEqual(suggest('/me ', players), { items: [], ghost: '<action>' });
  assert.equal(suggest('/me waves', players).ghost, '');
  assert.equal(suggest('/goto ', players).ghost, '<town, country or lat,lon>');
});

test('a player is found by name, whole or begun, never by guess', () => {
  const players = [{ name: 'Ada' }, { name: 'Adam' }, { name: 'Bo' }, { name: 'Zoë' }];
  assert.equal(matchPlayer('ada', players)?.name, 'Ada');
  assert.equal(matchPlayer('ADAM', players)?.name, 'Adam');
  assert.equal(matchPlayer('ad', players), null, 'two begin with it');
  assert.equal(matchPlayer('zoe', players)?.name, 'Zoë');
  assert.equal(matchPlayer('o', players), null);
  assert.equal(matchPlayer('', players), null);
});

test('/time takes an hour, a word or the real clock', () => {
  assert.deepEqual(parseClock('18:30'), { hour: 18.5 });
  assert.deepEqual(parseClock('7'), { hour: 7 });
  assert.deepEqual(parseClock('7pm'), { hour: 19 });
  assert.deepEqual(parseClock('12am'), { hour: 0 });
  assert.deepEqual(parseClock('12pm'), { hour: 12 });
  assert.deepEqual(parseClock('24:00'), { hour: 0 });
  assert.deepEqual(parseClock('noon'), { hour: 12 });
  assert.deepEqual(parseClock('Night'), { hour: 23 });
  assert.equal(parseClock('real'), 'real');
  assert.equal(parseClock('live'), 'real');
  for (const nonsense of ['25', '12:75', '13pm', 'teatime', '', '-1']) assert.equal(parseClock(nonsense), null, nonsense);
});

test('/weather takes the five weathers and auto', () => {
  assert.equal(parseWeather('Rain'), 'rain');
  assert.equal(parseWeather('sunny'), 'clear');
  assert.equal(parseWeather('auto'), 'auto');
  assert.equal(parseWeather('hail'), null);
});

test('/goto takes a point', () => {
  assert.deepEqual(parseLatLon('48.86, 2.29'), { lat: 48.86, lon: 2.29 });
  assert.deepEqual(parseLatLon('-33.9 151.2'), { lat: -33.9, lon: 151.2 });
  assert.equal(parseLatLon('91, 0'), null);
  assert.equal(parseLatLon('Paris'), null);
});

test('/goto finds a built town, a name folded into one, and a country', async () => {
  const places = indexPlaces(decodePlaces(await inflate(readFileSync(resolve(here, '../public/data/places.bin')))), 0);
  const countries = decodeCountries(await inflate(readFileSync(resolve(here, '../public/data/countries.bin'))));
  const gazetteer = { places: places.all, aliases: places.aliases(), countries };
  const go = (query: string) => findPlace(query, gazetteer);

  const paris = go('paris');
  assert.equal(paris?.name, 'Paris');
  assert.equal(paris?.iso, 'FRA');
  assert.equal(go('sao paulo')?.name, 'São Paulo', 'accents folded');
  // Kobe is folded into Osaka by the bake, and found as it.
  const kobe = go('Kobe');
  assert.equal(kobe?.name, 'Osaka');
  assert.equal(kobe?.via, 'Kobe');
  // A country is its capital.
  // A town's own name before a name folded into a bigger one: a suburb of
  // Bogotá called Madrid once outweighed Madrid by Bogotá's population.
  assert.equal(go('madrid')?.iso, 'ESP');
  assert.deepEqual(go('madrid')?.others, ['COL']);
  // The same name in two countries: where you stand first, a country after a comma.
  assert.equal(findPlace('toledo', gazetteer, 'ESP')?.iso, 'ESP');
  assert.equal(findPlace('cuenca', gazetteer, 'ESP')?.iso, 'ESP');
  assert.equal(go('Toledo, Spain')?.iso, 'ESP');
  assert.equal(go('cuenca, esp')?.iso, 'ESP');
  assert.equal(go('Toledo, United')?.iso, 'USA');
  // A suggestion for a shared name carries its country, and goes to that row.
  const rows = suggestPlaces('toledo', gazetteer, (iso) => countries.find((c) => c.iso === iso)?.name ?? iso);
  const spanish = rows.find((row) => row.name.endsWith('Spain'));
  assert.ok(spanish !== undefined, 'Toledo, Spain is offered');
  assert.equal(go(spanish.name)?.iso, 'ESP');
  const spain = go('Spain');
  assert.equal(spain?.name, 'Madrid');
  assert.equal(spain?.via, 'Spain');
  assert.equal(go('Japan')?.name, 'Tokyo');
  assert.equal(go('qqqqzz'), null);
  assert.equal(go('  '), null);
  // A district of a city is not somewhere to go: the bake keeps a folded name
  // only for a separate town or a capital (`isDistrict` in build-places.mjs).
  for (const district of ['Ciudad Lineal', 'Chamartín', 'Paris 15 Vaugirard', 'Islington', 'City of Westminster', 'Brooklyn', 'Manhattan', 'Pudong', 'Nakano', 'Iztapalapa', 'Wan Chai']) {
    assert.equal(gazetteer.aliases.has(district), false, `${district} is a district, not an alias`);
    assert.notEqual(go(district)?.via, district, `/goto ${district}`);
  }
  // The towns folded into a bigger one still are, and so are the capitals.
  assert.equal(go('Yokohama')?.name, 'Tokyo');
  assert.equal(go('Móstoles')?.name, 'Madrid');
  assert.ok(gazetteer.aliases.has('Reading'), 'Reading, folded into London');
  assert.equal(go('Vatican City')?.name, 'Rome');
  assert.equal(go('Monaco')?.via, 'Monaco');

  const name = (iso: string) => countries.find((country) => country.iso === iso)?.name ?? iso;
  const offer = (query: string) => suggestPlaces(query, gazetteer, name);
  const par = offer('par');
  assert.equal(par[0]?.name, 'Paris', 'the biggest town that begins with it');
  assert.ok(par.length <= SUGGEST_LIMIT);
  assert.equal(new Set(par.map((row) => row.name.toLowerCase())).size, par.length, 'one row a name');
  assert.equal(offer('spain')[0]?.detail, 'Country · Madrid');
  assert.equal(offer('sao pa')[0]?.name, 'São Paulo');
  assert.equal(offer('kobe')[0]?.detail, 'Osaka, Japan', 'a folded name says where it stands');
  assert.equal(offer('qqqqzz').length, 0);
  // Every row it offers is somewhere /goto goes.
  for (const row of offer('san')) assert.notEqual(go(row.name), null, row.name);
  // And the line reads it, once past the command.
  const lines = suggest('/goto lond', { players: [], places: (query, limit) => suggestPlaces(query, gazetteer, name, limit) }).items;
  assert.equal(lines[0]?.line, '/goto London');
  assert.equal(lines[0]?.done, true);
  assert.equal(suggest('/goto 48.8, 2.3', { players: [], places: () => [{ name: 'x', detail: '' }] }).items.length, 0, 'a point is not a name');
});

/* ------------------------------------------------------------------------- *
 * Voices
 * ------------------------------------------------------------------------- */

test('a voice is the same for the same person, and sounds its age', () => {
  assert.deepEqual(voiceOf('k', 'adult', true), voiceOf('k', 'adult', true));
  for (let i = 0; i < 50; i++) {
    const key = `person:${i}`;
    const man = voiceOf(key, 'adult', false);
    const woman = voiceOf(key, 'adult', true);
    const child = voiceOf(key, 'child', false);
    const elder = voiceOf(key, 'elder', false);
    assert.ok(child.pitch > woman.pitch && woman.pitch > man.pitch && man.pitch > elder.pitch, key);
    assert.ok(child.pace > man.pace && man.pace > elder.pace, key);
    assert.ok(voiceOf(key, 'adult', false, 'grumpy').pitch < man.pitch);
  }
});

test('a line is spoken a syllable at a time, and types out to its end', () => {
  const voice = voiceOf('speaker', 'adult', false);
  const text = 'Hello there, traveller! Is this your first time in Palma?';
  const speech = planSpeech(text, voice, 'x');
  assert.deepEqual(speech, planSpeech(text, voice, 'x'), 'the same speech every time');
  assert.equal(speech.length, Array.from(text).length);
  assert.ok(speech.syllables.length >= 12 && speech.syllables.length <= 22, `${speech.syllables.length} syllables`);
  let last = -1;
  let end = 0;
  for (const s of speech.syllables) {
    assert.ok(s.at > last, 'in order');
    assert.ok(s.end >= end, 'revealing forward');
    assert.ok(s.vowel >= 0 && s.vowel < 5);
    last = s.at;
    end = s.end;
  }
  assert.equal(revealed(speech, 0), speech.syllables[0]!.end);
  assert.equal(revealed(speech, speech.duration + 1), speech.length);
  // A question rises into its end; a statement falls.
  const asked = planSpeech('Are you lost?', voice, 'q').syllables;
  const told = planSpeech('You are lost.', voice, 'q').syllables;
  assert.ok(asked[asked.length - 1]!.pitch > told[told.length - 1]!.pitch);
  assert.ok(asked[asked.length - 1]!.pitch > 1.1);
  assert.ok(told[told.length - 1]!.pitch < 0.95);
});

test('every script is spoken', () => {
  const voice = voiceOf('speaker', 'adult', true);
  for (const text of ['こんにちは、パルマへようこそ。', 'Добро пожаловать в Москву.', 'مرحبا بك في القاهرة؟', 'नमस्ते, स्वागत है।', 'สวัสดีครับ', '2026!']) {
    const speech = planSpeech(text, voice, 't');
    assert.ok(speech.syllables.length > 0, text);
    assert.ok(speech.duration > 0 && speech.duration < 10, text);
    assert.equal(revealed(speech, Infinity), Array.from(text).length);
  }
  // A syllabary is a syllable a character.
  assert.equal(planSpeech('こんにちは', voice, 't').syllables.length, 5);
  assert.equal(planSpeech('', voice, 't').syllables.length, 0);
});

/* ------------------------------------------------------------------------- *
 * Never markup
 * ------------------------------------------------------------------------- */

test('what players type is written as text, never as markup', () => {
  for (const file of ['../src/chat.ts', '../src/talk.ts']) {
    const source = readFileSync(resolve(here, file), 'utf8');
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|\bhtml:/.test(source), `${file} writes markup`);
  }
});

test('/goto searches another world\'s gazetteer as it searches Earth\'s: its towns, and its nations at their capitals', async () => {
  const { PROMINENCE_CAP } = await import('../src/places.ts');
  const town = (name: string, iso: string, lat: number, lon: number, pop: number, capital = false) =>
    ({ name, iso, lat, lon, pop, capital, prominence: PROMINENCE_CAP, zone: '' });
  const places = [
    town('Ascraeus', 'mars:tharsis', 11.9, -104.1, 900_000, true),
    town('Pavonis', 'mars:tharsis', 0.8, -113.4, 300_000),
    town('Hellas Port', 'mars:hellas', -42.4, 70.5, 500_000, true),
  ];
  const mars = { places, aliases: new Map<string, number>(), countries: [{ iso: 'mars:tharsis', name: 'Tharsis Union' }, { iso: 'mars:hellas', name: 'Hellas' }] };
  assert.equal(findPlace('pavonis', mars)?.name, 'Pavonis');
  assert.equal(findPlace('tharsis', mars)?.name, 'Ascraeus', 'a nation is arrived at in its capital');
  assert.equal(findPlace('hellas', mars)?.iso, 'mars:hellas');
  assert.equal(findPlace('Pavonis, Tharsis', mars)?.iso, 'mars:tharsis', 'qualified by its nation\'s name');
  assert.equal(findPlace('Pavonis, Hellas', mars), null);
});
