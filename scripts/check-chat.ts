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
  CHAT_INTERVAL_MS,
  CHAT_MAX,
  EMOTES,
  chatWait,
  cleanChat,
  cleanCountry,
  cleanEmote,
  freshBucket,
  spendChat,
} from '../server/src/limits.ts';
import {
  COMMANDS,
  actionOf,
  complete,
  findPlace,
  matchPlayer,
  parseClock,
  parseCommand,
  parseLatLon,
  parseWeather,
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
  assert.equal(cleanEmote('moonwalk'), '');
  assert.equal(cleanEmote(undefined), '');
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

test('Tab completes a command, then a player', () => {
  assert.deepEqual(complete('/go', []), { line: '/goto ', choices: ['goto'] });
  const w = complete('/w', []);
  assert.equal(w?.line, '/w');
  assert.deepEqual(w?.choices.sort(), ['wave', 'weather', 'where', 'who']);
  assert.equal(complete('/wh', [])?.line, '/wh');
  assert.equal(complete('/zz', []), null);
  assert.equal(complete('hello', ['Ada']), null);
  const players = ['Ada', 'Adam', 'Bo', 'Álvaro'];
  assert.deepEqual(complete('/tp a', players), { line: '/tp A', choices: ['Ada', 'Adam', 'Álvaro'] });
  assert.deepEqual(complete('/tp ad', players), { line: '/tp Ada', choices: ['Ada', 'Adam'] });
  assert.deepEqual(complete('/tp b', players), { line: '/tp Bo ', choices: ['Bo'] });
  assert.deepEqual(complete('/mute alv', players), { line: '/mute Álvaro ', choices: ['Álvaro'] });
  assert.equal(complete('/goto par', players), null, '/goto takes a place, not a player');
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
  const spain = go('Spain');
  assert.equal(spain?.name, 'Madrid');
  assert.equal(spain?.via, 'Spain');
  assert.equal(go('Japan')?.name, 'Tokyo');
  assert.equal(go('qqqqzz'), null);
  assert.equal(go('  '), null);
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
