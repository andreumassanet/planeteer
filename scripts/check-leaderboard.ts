/**
 * The leaderboards headless: the words for a rank and a share, a hostile
 * answer read as what can be vouched for, the requests' shapes (the URL, the
 * headers, the body) as a visitor and as a player, what is kept and for how
 * long, a build without accounts, the switch that hides a player, the board
 * painted on a canvas that records every call, and a read of
 * `supabase/schema.sql` for the functions, their guards and their grants (a
 * net under the SQL, not a run of it). No network: every `fetch` is a stub.
 *
 *   node scripts/check-leaderboard.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createAccount } from '../src/account/account.ts';
import type { AccountView } from '../src/account/account.ts';
import { AuthError, SESSION_KEY, createAuth, sessionOf } from '../src/account/auth.ts';
import type { Fetch, KeyStore, Session } from '../src/account/auth.ts';
import { createRest } from '../src/account/rest.ts';
import {
  BOARDS, COURSE_ID, ordinal, scoreText, scoreWithUnit, standingText, topPercent,
} from '../src/leaderboard/boards.ts';
import type { BoardId } from '../src/leaderboard/boards.ts';
import { FAIL_MS, KEEP_MS, createLeaderboards } from '../src/leaderboard/client.ts';
import type { BoardsSource } from '../src/leaderboard/client.ts';
import { nameOf, parseBoard, parseCourse, parseStanding } from '../src/leaderboard/parse.ts';
import { FAME_LINES, paintFameBoard } from '../src/leaderboard/paint.ts';
import { courseRecords, leaderboards, leaderboardsAvailable } from '../src/leaderboard.ts';

const CONFIG = { url: 'https://example.supabase.co', key: 'sb_publishable_test' };
const USER = '2b1c2f5e-8d43-4c55-9e1a-7f0d3b6a9c11';
const OTHER = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

interface Call { url: string; method: string; body: unknown; headers: Record<string, string> }

/** A stubbed `fetch`: answers by a handler, records every call. */
function stub(handler: (call: Call) => { status: number; body?: unknown; raw?: string } | 'down') {
  const calls: Call[] = [];
  const fetch: Fetch = async (url, init = {}) => {
    const call: Call = { url, method: init.method ?? 'GET', body: init.body === undefined ? undefined : JSON.parse(String(init.body)), headers: { ...(init.headers as Record<string, string>) } };
    calls.push(call);
    const answer = handler(call);
    if (answer === 'down') throw new TypeError('Failed to fetch');
    const text = answer.raw ?? (answer.body === undefined ? null : JSON.stringify(answer.body));
    return new Response(text, { status: answer.status });
  };
  return { fetch, calls };
}

function memory(initial: Record<string, string> = {}): KeyStore & { items: Record<string, string> } {
  const items: Record<string, string> = { ...initial };
  return {
    items,
    getItem: (key) => (key in items ? items[key]! : null),
    setItem: (key, value) => {
      items[key] = String(value);
    },
    removeItem: (key) => {
      delete items[key];
    },
  };
}

const tokens = (n: number, id = USER) => ({
  access_token: `access-token-${n}`, refresh_token: `refresh-token-${n}`, expires_in: 3600,
  user: { id, user_metadata: { full_name: 'Andreu' } },
});

function view(user: string | null, name = ''): AccountView {
  return { state: user === null ? 'out' : 'in', user: user === null ? null : { id: user, handle: '', avatar: '' }, name, role: 'player', sync: 'saved', message: '' };
}

/** A stand-in for the account: the real REST client over a stub, with a session or none. */
function source(fetch: Fetch, who: { user: string | null; name?: string }): Omit<BoardsSource, 'view'> & { view: AccountView; session: Session | null } {
  const rest = createRest(CONFIG, fetch);
  const held = {
    session: who.user === null ? null : sessionOf(tokens(1, who.user), Date.now()),
    view: view(who.user, who.name),
    request: <T>(run: (r: typeof rest, s: Session | null) => Promise<T>) => run(rest, held.session),
  };
  return held;
}

/** A character by its code point, so the source holds none it cannot show. */
const cp = (code: number): string => String.fromCodePoint(code);

const BOARD_ROWS = [
  { rank: 1, name: 'Ann', look: 'abcdefghijklm', level: 12, score: 9800 },
  { rank: 2, name: 'andreu', look: '', level: 3, score: 500 },
];

test('the words for a rank, a share and a score', () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111, 112, 1001].map(ordinal),
    ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '101st', '111th', '112th', '1,001st']);
  assert.equal(topPercent(4, 100), 4);
  assert.equal(topPercent(1, 1000), 1, 'never under 1%');
  assert.equal(topPercent(5, 1000), 1);
  assert.equal(topPercent(6, 1000), 1);
  assert.equal(topPercent(11, 1000), 2, 'rounded up: 1.1% is in the top 2%');
  assert.equal(topPercent(100, 100), 100);
  assert.equal(topPercent(150, 100), 100, 'a rank past the total is the last');
  for (const [rank, total] of [[0, 10], [1, 0], [Number.NaN, 5], [3, Number.POSITIVE_INFINITY], [-1, 4]] as const) {
    assert.equal(topPercent(rank, total), null);
  }
  assert.equal(standingText(4, 100), 'Top 4%');
  assert.equal(standingText(50, 100), 'Top 50%');
  assert.equal(standingText(51, 100), '51st of 100', 'the lower half by place, not by share');
  assert.equal(standingText(2, 7), '2nd of 7', 'a small board by place');
  assert.equal(standingText(1, 1), '1st of 1');
  assert.equal(standingText(0, 0), '');
  assert.deepEqual([0, 7, 999_999, 1_000_000, 1_250_000, 34_500_000_000, 150_000_000, 1e12, -5, Number.NaN].map(scoreText),
    ['0', '7', '999,999', '1M', '1.2M', '34.5B', '150M', '1T', '0', '0']);
  assert.equal(scoreWithUnit('countries', 1), '1 country');
  assert.equal(scoreWithUnit('countries', 12), '12 countries');
  assert.equal(scoreWithUnit('xp', 9800), '9,800 XP');
  assert.deepEqual(BOARDS.map((b) => b.id), ['xp', 'countries', 'landmarks', 'golds', 'reputation', 'towns']);
  assert.deepEqual(BOARDS.map((b) => b.tab), ['Explorers', 'Countries', 'Landmarks', 'Racers', 'Reputation', 'Towns']);
});

test('a hostile answer reads as what can be vouched for', () => {
  for (const body of [null, undefined, 'rows', 42, {}, { rows: [] }, true]) assert.deepEqual(parseBoard(body), []);
  const huge = 'x'.repeat(1_000_000);
  const rows = parseBoard([
    null, 7, 'row', [],
    { name: 'NoScore' },
    { name: 'Neg', score: -1 },
    { name: 'Big', score: 1e13 },
    { name: 'Text', score: 'lots' },
    { name: '', score: 5 },
    { name: '   ', score: 5 },
    { name: 42, score: 5 },
    { name: '<i>Ann</i>', score: 30, rank: 1, level: 4, look: '<b>' },
    { name: huge, score: '12', rank: '2', level: 'max', look: 'abcdefghijklm' },
    { name: `a${cp(0)}b${cp(0x202e)}c${cp(0x200b)}d\n\te`, score: 10.9, rank: 3.7, level: 99_999, look: 'ABC' },
    { name: 'Ann', score: 1e12, rank: 0, level: -3 },
    { name: 'Ann', score: 9, rank: 'first' },
  ]);
  assert.deepEqual(rows.map((r) => r.name), ['<i>Ann</i>', 'x'.repeat(20), 'abcd e', 'Ann', 'Ann'], 'markup is kept as the text it is');
  assert.equal(rows[0]!.look, '', 'markup is no look code');
  assert.equal(rows[0]!.level, 4);
  assert.deepEqual(rows[1], { rank: 2, name: 'x'.repeat(20), look: 'abcdefghijklm', level: 0, score: 12, me: false }, 'numeric strings read, a level out of range is none');
  assert.equal(rows[2]!.score, 10, 'a score is whole');
  assert.equal(rows[2]!.rank, 3);
  assert.equal(rows[2]!.level, 0);
  assert.equal(rows[2]!.look, '');
  assert.equal(rows[3]!.rank, 15, 'a rank out of range takes its place in the answer');
  assert.equal(rows[3]!.score, 1e12);
  for (const row of rows) {
    assert.ok(row.name.length >= 1 && Array.from(row.name).length <= 20);
    assert.ok(Number.isInteger(row.score) && row.score >= 0 && row.score <= 1e12);
    assert.ok(Number.isInteger(row.level) && row.level >= 0 && row.level <= 9999);
    assert.ok(Number.isInteger(row.rank) && row.rank >= 1);
    assert.match(row.look, /^([0-9a-z]{1,24})?$/);
  }
  assert.equal(parseBoard(Array.from({ length: 500 }, (_, i) => ({ name: `P${i}`, score: 500 - i, rank: i + 1 }))).length, 100, 'at most 100 rows');
  assert.equal(parseBoard([{ name: 'A', score: 1 }], 50)[0]!.rank, 51, 'a missing rank counts on from the offset');
  assert.equal(nameOf(`${cp(0x202e)}evil${cp(0x202c)} name`), 'evil name', 'no bidirectional override survives');
  assert.equal(nameOf('😀'.repeat(30)), '😀'.repeat(20), 'cut by character, never inside one');

  assert.deepEqual(parseStanding([{ rank: 3, total: 120, score: 500, listed: true }], 'Ann'), { rank: 3, total: 120, score: 500, listed: true, name: 'Ann' });
  assert.deepEqual(parseStanding([{ rank: null, total: 120, score: 0, listed: false }]), { rank: null, total: 120, score: 0, listed: false, name: '' });
  assert.equal(parseStanding([{ rank: 9, total: 3, score: 5 }])!.rank, null, 'a rank past the total is none');
  assert.equal(parseStanding([{ rank: 2, total: 3, score: 5 }])!.listed, true, 'a rank without the flag is a listed player');
  for (const body of [[], null, 'x', [{ rank: 1 }], [{ total: 'many' }], [{ total: -1 }]]) assert.equal(parseStanding(body), null);

  const course = parseCourse([
    { name: 'Hal', ms: 59000, medal: 2, rank: 1 },
    { name: 'Gus', ms: '61000', medal: 3, rank: 2 },
    { name: 'Zero', ms: 0, medal: 3 },
    { name: 'Slow', ms: 86_400_001, medal: 1 },
    { name: 'Odd', ms: 1000, medal: 2.5 },
    { name: 'Ten', ms: 1000, medal: 10 },
    { name: 'Str', ms: 'fast', medal: 3 },
    { name: '<script>', ms: 70000.4, medal: 1 },
  ]);
  assert.deepEqual(course.map((r) => [r.name, r.ms, r.medal]), [['Hal', 59000, 2], ['Gus', 61000, 3], ['<script>', 70000, 1]]);
  assert.deepEqual(parseCourse({ ms: 5 }), []);
});

test('the requests: as a visitor, as a player, and nothing for a board or a course that is none', async () => {
  const net = stub((call) => {
    if (call.url.endsWith('/rpc/leaderboard')) return { status: 200, body: BOARD_ROWS };
    if (call.url.endsWith('/rpc/leaderboard_me')) return { status: 200, body: [{ rank: 2, total: 2, score: 500, listed: true }] };
    if (call.url.endsWith('/rpc/course_board')) return { status: 200, body: [{ rank: 1, name: 'Andreu', look: '', ms: 61000, medal: 3 }] };
    return { status: 404 };
  });
  const visitor = source(net.fetch, { user: null });
  const boards = createLeaderboards({ source: async () => visitor, now: () => 0 });

  const answer = await boards.board('xp');
  assert.equal(answer.state, 'ok');
  const call = net.calls.at(-1)!;
  assert.equal(call.url, 'https://example.supabase.co/rest/v1/rpc/leaderboard');
  assert.equal(call.method, 'POST');
  assert.deepEqual(call.body, { p_board: 'xp', p_limit: 50, p_offset: 0 });
  assert.equal(call.headers.apikey, CONFIG.key);
  assert.equal(call.headers['Content-Type'], 'application/json');
  assert.equal(call.headers.Authorization, undefined, 'a visitor sends the publishable key alone');
  assert.deepEqual(answer.state === 'ok' && answer.value.map((r) => r.me), [false, false], 'a visitor owns no row');

  const before = net.calls.length;
  assert.deepEqual(await boards.mine('xp'), { state: 'out' }, 'a standing wants a player');
  assert.equal(net.calls.length, before, 'and asks nothing without one');

  await boards.board('countries', { limit: 1000, offset: -5 });
  assert.deepEqual(net.calls.at(-1)!.body, { p_board: 'countries', p_limit: 100, p_offset: 0 }, 'the limit and offset held to their range');
  await boards.board('towns', { limit: 10.7, offset: 20 });
  assert.deepEqual(net.calls.at(-1)!.body, { p_board: 'towns', p_limit: 10, p_offset: 20 });

  const quiet = net.calls.length;
  assert.deepEqual(await boards.board('nope' as BoardId), { state: 'error' });
  assert.deepEqual(await boards.mine('XP' as BoardId), { state: 'error' });
  for (const bad of ['', 'a:', 'x:12', 'a:12; drop table profiles', 'A:12', `a:${'1'.repeat(41)}`, 'a:12\n']) {
    assert.deepEqual(await boards.course(bad), { state: 'error' }, bad);
  }
  assert.equal(net.calls.length, quiet, 'nothing asked for any of them');
  for (const good of ['a:12', 'l:4021', 's:mediterranean', 's:gulf-of-mexico']) assert.ok(COURSE_ID.test(good));

  const player = source(net.fetch, { user: USER, name: 'Andreu' });
  const mine = createLeaderboards({ source: async () => player, now: () => 0 });
  const rows = await mine.board('xp');
  assert.equal(net.calls.at(-1)!.headers.Authorization, 'Bearer access-token-1', 'a player is asked as themselves');
  assert.deepEqual(rows.state === 'ok' && rows.value.map((r) => r.me), [false, true], 'their own row marked, whatever its case');
  const standing = await mine.mine('xp');
  const asked = net.calls.at(-1)!;
  assert.equal(asked.url, 'https://example.supabase.co/rest/v1/rpc/leaderboard_me');
  assert.deepEqual(asked.body, { p_board: 'xp' });
  assert.equal(asked.headers.Authorization, 'Bearer access-token-1');
  assert.deepEqual(standing, { state: 'ok', value: { rank: 2, total: 2, score: 500, listed: true, name: 'Andreu' } });
  const course = await mine.course('a:12');
  assert.deepEqual(net.calls.at(-1)!.body, { p_course: 'a:12', p_limit: 10 });
  assert.equal(net.calls.at(-1)!.url, 'https://example.supabase.co/rest/v1/rpc/course_board');
  assert.deepEqual(course.state === 'ok' && course.value.map((r) => [r.name, r.me]), [['Andreu', true]]);
});

test('through the real account: signed out a visitor, signed in a player with a fresh token', async () => {
  let clock = 1_000_000;
  const net = stub((call) => {
    if (call.url.includes('grant_type=refresh_token')) return { status: 200, body: tokens(2) };
    if (call.url.endsWith('/rpc/leaderboard')) return { status: 200, body: BOARD_ROWS };
    if (call.url.endsWith('/rpc/leaderboard_me')) return { status: 200, body: [{ rank: 1, total: 5, score: 9800, listed: true }] };
    return { status: 404 };
  });
  const storage = memory();
  const make = () => {
    const auth = createAuth({ config: CONFIG, fetch: net.fetch, storage, tabStorage: memory(), now: () => clock });
    return createAccount({ auth, rest: createRest(CONFIG, net.fetch), storage, now: () => clock, go: () => {}, returnUrl: () => '', watch: false });
  };
  const out = make();
  const visitor = createLeaderboards({ source: async () => out, now: () => clock });
  assert.equal((await visitor.board('xp')).state, 'ok');
  assert.equal(net.calls.at(-1)!.headers.Authorization, undefined);
  assert.deepEqual(await visitor.mine('xp'), { state: 'out' });
  out.dispose();

  storage.items[SESSION_KEY] = JSON.stringify(sessionOf(tokens(1), clock));
  const signed = make();
  const boards = createLeaderboards({ source: async () => signed, now: () => clock });
  assert.equal((await boards.mine('golds')).state, 'ok');
  assert.equal(net.calls.at(-1)!.headers.Authorization, 'Bearer access-token-1');
  clock += 3_600_000;
  await boards.mine('golds');
  const refreshed = net.calls.slice(-2);
  assert.ok(refreshed[0]!.url.includes('grant_type=refresh_token'), 'a token past its time is renewed first');
  assert.equal(refreshed[1]!.headers.Authorization, 'Bearer access-token-2');
  signed.dispose();
});

test('what is kept: a minute for an answer, seconds for a failure, one request for two asks', async () => {
  let clock = 0;
  let mode: 'ok' | 'fail' | 'down' | 'nonsense' = 'ok';
  const net = stub(() => (mode === 'down' ? 'down' : mode === 'fail' ? { status: 500 } : mode === 'nonsense' ? { status: 200, raw: '{"not":"rows"}' } : { status: 200, body: BOARD_ROWS }));
  const who = source(net.fetch, { user: USER, name: 'Andreu' });
  const boards = createLeaderboards({ source: async () => who, now: () => clock });
  const count = () => net.calls.length;

  await boards.board('xp');
  assert.equal(count(), 1);
  clock += KEEP_MS - 1;
  await boards.board('xp');
  assert.equal(count(), 1, 'kept for a minute');
  clock += 2;
  await boards.board('xp');
  assert.equal(count(), 2, 'asked again after it');
  await boards.board('xp', { fresh: true });
  assert.equal(count(), 3, 'or when asked fresh');
  await boards.board('xp', { offset: 50 });
  assert.equal(count(), 4, 'a page is its own answer');

  const [a, b] = await Promise.all([boards.board('golds'), boards.board('golds')]);
  assert.equal(count(), 5, 'two asks at once share one request');
  assert.deepEqual(a, b);

  mode = 'fail';
  assert.deepEqual(await boards.board('towns'), { state: 'error' });
  clock += FAIL_MS - 1;
  assert.deepEqual(await boards.board('towns'), { state: 'error' });
  assert.equal(count(), 6, 'a failure is kept a moment, so a card opened again does not hammer');
  clock += 2;
  mode = 'down';
  assert.deepEqual(await boards.board('towns'), { state: 'offline' }, 'no network is offline');
  mode = 'nonsense';
  assert.deepEqual(await boards.board('towns', { fresh: true }), { state: 'error' }, 'an answer that is no list is an error');
  mode = 'ok';
  clock += FAIL_MS + 1;
  assert.equal((await boards.board('towns')).state, 'ok', 'and the next ask after it reads again');

  const at = count();
  await boards.mine('xp');
  await boards.mine('xp');
  assert.equal(count(), at + 1);
  who.view = view(OTHER, 'Someone');
  who.session = sessionOf(tokens(3, OTHER), Date.now());
  await boards.mine('xp');
  assert.equal(count(), at + 2, 'a standing is kept for its player only');
  const rows = await boards.board('xp');
  assert.deepEqual(rows.state === 'ok' && rows.value.map((r) => r.me), [false, false], 'a kept board is marked for who asks now');

  boards.forget();
  await boards.board('xp');
  assert.equal(count(), at + 3, 'forgotten, asked again');

  // An answer under way when the boards are forgotten is not kept after.
  let release: () => void = () => {};
  const slow: Fetch = (url, init) => new Promise((resolve) => {
    release = () => resolve(net.fetch(url, init));
  });
  const late = createLeaderboards({ source: async () => source(slow, { user: null }), now: () => clock });
  const pending = late.board('landmarks');
  await new Promise((resolve) => setTimeout(resolve, 0));
  late.forget();
  release();
  assert.equal((await pending).state, 'ok');
  const again = late.board('landmarks');
  await new Promise((resolve) => setTimeout(resolve, 0));
  release();
  assert.equal((await again).state, 'ok', 'asked again rather than kept');
});

test('a build without accounts: every read is off, nothing asked, nothing thrown', async () => {
  let asked = 0;
  const off = createLeaderboards({ source: async () => {
    asked++;
    return null;
  }, now: () => 0 });
  assert.deepEqual(await off.board('xp'), { state: 'off' });
  assert.deepEqual(await off.mine('xp'), { state: 'off' });
  assert.deepEqual(await off.course('a:1'), { state: 'off' });
  assert.equal(asked, 3);
  const broken = createLeaderboards({ source: () => Promise.reject(new Error('no chunk')), now: () => 0 });
  assert.deepEqual(await broken.board('xp'), { state: 'error' });
  const throwing = createLeaderboards({ source: async () => ({ view: view(null), request: () => { throw new Error('boom'); } }), now: () => 0 });
  assert.deepEqual(await throwing.board('xp'), { state: 'error' });

  // This page has no accounts headless: the page's own boards are off.
  assert.equal(leaderboardsAvailable(), false);
  assert.deepEqual(await leaderboards().board('xp'), { state: 'off' });
  assert.deepEqual(await courseRecords('a:12'), { state: 'off' });
});

test('the REST client: rpc, the listed flag read and written on the player\'s own row', async () => {
  const net = stub((call) => {
    if (call.url.includes('/rest/v1/profiles?id=eq.')) {
      if (call.method === 'GET') return { status: 200, body: [{ listed: true }] };
      if (call.method === 'PATCH') return { status: 200, body: [{ listed: (call.body as { listed: boolean }).listed }] };
    }
    if (call.url.endsWith('/rpc/big')) return { status: 200, raw: JSON.stringify('x'.repeat(1_100_000)) };
    if (call.url.endsWith('/rpc/none')) return { status: 204 };
    if (call.url.endsWith('/rpc/refuse')) return { status: 401, body: { message: 'JWT expired' } };
    return { status: 404 };
  });
  const rest = createRest(CONFIG, net.fetch);
  const session = sessionOf(tokens(1), Date.now())!;

  assert.equal(await rest.setListed(session, false), false);
  const patch = net.calls.at(-1)!;
  assert.equal(patch.method, 'PATCH');
  assert.equal(patch.url, `https://example.supabase.co/rest/v1/profiles?id=eq.${USER}&select=listed`, 'only the player\'s own row');
  assert.deepEqual(patch.body, { listed: false }, 'and only the flag');
  assert.equal(patch.headers.Authorization, 'Bearer access-token-1');
  assert.equal(patch.headers.apikey, CONFIG.key);
  assert.equal(patch.headers.Prefer, 'return=representation');
  assert.equal(await rest.setListed(session, true), true);
  assert.deepEqual(net.calls.at(-1)!.body, { listed: true });

  assert.equal(await rest.readListed(session), true);
  assert.equal(net.calls.at(-1)!.method, 'GET');
  assert.equal(net.calls.at(-1)!.url, `https://example.supabase.co/rest/v1/profiles?id=eq.${USER}&select=listed`);

  // No row yet, or a row that does not say: null, for the switch to wait on.
  const empty = createRest(CONFIG, stub(() => ({ status: 200, body: [] })).fetch);
  assert.equal(await empty.setListed(session, false), null);
  assert.equal(await createRest(CONFIG, stub(() => ({ status: 200, body: [{ listed: 'no' }] })).fetch).readListed(session), null);
  // A column the server does not have yet is a refusal the panel names.
  const closed = createRest(CONFIG, stub(() => ({ status: 400, body: { code: '42703' } })).fetch);
  await assert.rejects(closed.setListed(session, false), (error: unknown) => error instanceof AuthError && error.status === 400);
  await assert.rejects(closed.readListed(session), AuthError);

  const before = net.calls.length;
  await assert.rejects(rest.rpc('leaderboard; drop table profiles', {}), AuthError);
  await assert.rejects(rest.rpc('../profiles', {}), AuthError);
  assert.equal(net.calls.length, before, 'a name that is no function is not sent');
  assert.equal(await rest.rpc('none', {}), null);
  await assert.rejects(rest.rpc('big', {}), (error: unknown) => error instanceof AuthError && error.status === 502, 'an answer past a megabyte is not read');
  await assert.rejects(rest.rpc('refuse', {}, session), (error: unknown) => error instanceof AuthError && error.status === 401);
});

/** A 2D context that records every call and draws nothing; `fail` throws from every method. */
function recorder(fail = false) {
  const texts: string[] = [];
  const calls: string[] = [];
  const context = new Proxy({} as Record<string | symbol, unknown>, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'measureText') return (text: string) => ({ width: text.length * 10 });
      if (key === 'fillText') return (text: string) => {
        if (fail) throw new Error('lost');
        texts.push(text);
      };
      return (...args: unknown[]) => {
        if (fail) throw new Error('lost');
        calls.push(String(key));
        return args.length < 0 ? undefined : undefined;
      };
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    },
  });
  return { context, texts, calls };
}

function canvas(context: unknown, width = 1024, height = 1280): HTMLCanvasElement {
  return { width, height, getContext: () => context } as unknown as HTMLCanvasElement;
}

test('the board in the world: ten lines at most, a name drawn as text, nothing thrown', () => {
  const lines = Array.from({ length: 60 }, (_, i) => ({ rank: i + 1, name: i === 0 ? '<img src=x onerror=alert(1)>' : `Player ${i}`, score: 1e12 - i }));
  const { context, texts, calls } = recorder();
  paintFameBoard(canvas(context), lines, 'Explorers', { ribbon: 'The top ten', unit: 'XP' });
  assert.ok(texts.includes('EXPLORERS'), 'the title, in capitals');
  assert.ok(texts.includes('The top ten'));
  assert.ok(texts.some((t) => t.startsWith('<img src=x')), 'markup is drawn as the letters it is');
  assert.equal(texts.filter((t) => t.startsWith('Player ')).length, FAME_LINES - 1, 'ten lines, no more');
  assert.ok(texts.includes('1T XP'), 'the score in its words and unit');
  assert.ok(calls.includes('arc') && calls.includes('fill') && calls.includes('stroke'));

  const empty = recorder();
  paintFameBoard(canvas(empty.context), [], '', {});
  assert.ok(empty.texts.includes('HALL OF FAME'), 'a board with no title is the Hall of Fame');
  assert.ok(empty.texts.some((t) => t.startsWith('The first name here')));

  const odd = recorder();
  paintFameBoard(canvas(odd.context, 0, 0), [{ rank: Number.NaN, name: '', score: Number.POSITIVE_INFINITY }, { rank: -4, name: 'x'.repeat(5000), score: 'lots of'.repeat(50) }], 'x'.repeat(500));
  assert.ok(odd.texts.every((t) => t.length <= 5001));
  paintFameBoard(canvas(recorder(true).context), lines, 'Explorers');
  paintFameBoard(canvas(null), lines, 'Explorers');
  paintFameBoard({ width: 10, height: 10, getContext: () => { throw new Error('no 2d'); } } as unknown as HTMLCanvasElement, lines, 'x');
});

test('supabase/schema.sql: the functions, their guards, their grants', () => {
  const sql = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
  const header = (name: string): string => {
    const at = sql.indexOf(`create or replace function public.${name}(`);
    assert.ok(at >= 0, `${name} is defined`);
    return sql.slice(at, sql.indexOf('$$', at));
  };
  const bodyOf = (name: string): string => {
    const at = sql.indexOf('$$', sql.indexOf(`create or replace function public.${name}(`)) + 2;
    return sql.slice(at, sql.indexOf('$$;', at));
  };
  for (const name of ['leaderboard', 'leaderboard_me', 'course_board']) {
    const head = header(name);
    assert.match(head, /security definer/, `${name} reads past the row-level rules`);
    assert.match(head, /set search_path = ''/, `${name} resolves nothing through a search path`);
    assert.match(head, /\bstable\b/);
    assert.doesNotMatch(head, /returns table \([^)]*\bid\b/, `${name} returns no id`);
  }
  assert.match(header('leaderboard'), /public\.leaderboard\(p_board text, p_limit int default 50, p_offset int default 0\)\s+returns table \(rank bigint, name text, look text, level int, score bigint\)/);
  assert.match(header('leaderboard_me'), /returns table \(rank bigint, total bigint, score bigint, listed boolean\)/);
  assert.match(header('course_board'), /public\.course_board\(p_course text, p_limit int default 10\)\s+returns table \(rank bigint, name text, look text, ms numeric, medal int\)/);
  for (const name of ['board_known', 'board_score']) assert.match(header(name), /immutable[^$]*set search_path = ''/);

  // Only named players who show; the limit held to 1..100; the caller's own row for a standing.
  for (const name of ['leaderboard', 'course_board']) {
    const body = bodyOf(name);
    assert.match(body, /p\.listed and p\.name is not null/);
    assert.match(body, /least\(greatest\(coalesce\(p_limit, \d+\), 1\), 100\)/);
    assert.doesNotMatch(body, /p\.id\b|p\.role\b/, `${name} hands back no id and no role`);
    const read = body.replace(/board_score\(p\.progress, /g, '').replace(/p\.progress -> 'rings' -> 'courses' -> p_course/g, '');
    assert.doesNotMatch(read, /p\.progress/, `${name} reads the document only for its score or its course`);
  }
  assert.match(bodyOf('leaderboard'), /greatest\(coalesce\(p_offset, 0\), 0\)/);
  assert.match(bodyOf('leaderboard_me'), /auth\.uid\(\)/);
  assert.match(bodyOf('leaderboard_me'), /if me is null then\s+raise exception/);

  // The boards and the course ids agree with the client's.
  const known = /p_board in \(([^)]*)\)/.exec(bodyOf('board_known'));
  assert.ok(known !== null);
  assert.deepEqual(known[1]!.split(',').map((s) => s.trim().replace(/'/g, '')), BOARDS.map((b) => b.id));
  assert.ok(bodyOf('course_board').includes(`'${COURSE_ID.source}'`), 'the course id is checked by the same pattern');
  const store = readFileSync(new URL('../src/rings/store.ts', import.meta.url), 'utf8');
  assert.ok(store.includes(`/${COURSE_ID.source}/`), 'and the rings keep courses under it');
  for (const board of BOARDS) {
    assert.match(sql, new RegExp(`create index if not exists profiles_board_${board.id} on public\\.profiles\\s+\\(public\\.board_score\\(progress, '${board.id}'\\) desc, lower\\(name\\)\\) where listed and name is not null;`));
  }

  // Grants: the boards anyone's, a standing a player's, the helpers nobody's but the writes'.
  const line = (text: string) => assert.ok(sql.includes(text), text);
  line('revoke all on function public.leaderboard(text, int, int) from public, anon, authenticated;');
  line('grant execute on function public.leaderboard(text, int, int) to anon, authenticated;');
  line('revoke all on function public.leaderboard_me(text) from public, anon, authenticated;');
  line('grant execute on function public.leaderboard_me(text) to authenticated;');
  line('revoke all on function public.course_board(text, int) from public, anon, authenticated;');
  line('grant execute on function public.course_board(text, int) to anon, authenticated;');
  line('revoke all on function public.board_known(text) from public, anon, authenticated;');
  line('grant execute on function public.board_score(jsonb, text) to authenticated;');
  assert.doesNotMatch(sql, /grant execute on function public\.leaderboard_me\(text\) to [^;]*anon/);
  assert.doesNotMatch(sql, /grant execute on function public\.board_known/);

  // The table: the look's code may grow, a player may hide, and the role stays the dashboard's.
  assert.ok(!sql.includes('char_length(look) = 13'), 'the look is not held to 13 characters');
  assert.equal(sql.match(/char_length\(look\) between 13 and 24/g)?.length, 2, 'in the table and in the constraint that replaces the old one');
  line('alter table public.profiles drop constraint if exists profiles_look_check;');
  line('listed boolean not null default true,');
  line('alter table public.profiles add column if not exists listed boolean not null default true;');
  line('grant insert (listed), update (listed) on public.profiles to authenticated;');
  for (const grant of sql.match(/grant (insert|update)[^;]*on public\.profiles[^;]*;/g) ?? []) {
    assert.doesNotMatch(grant, /\brole\b/, 'a player is never granted the role');
  }
  // The column exists before anything grants it or indexes it.
  const added = sql.indexOf('add column if not exists listed');
  assert.ok(added > 0 && added < sql.indexOf('grant insert (listed)') && added < sql.indexOf('create index if not exists profiles_board_xp'));
});
