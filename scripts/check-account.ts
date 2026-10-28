/**
 * The optional accounts headless: the profile's merge loses nothing and is
 * idempotent and commutative, a hostile row or a damaged store reads as what
 * it can vouch for, the device dates a change of name or look, PKCE matches
 * RFC 7636, the session is refreshed when due and dropped when refused (kept
 * when the network is down), and a sign-in makes the row, merges both ways
 * and keeps the account's name when the device's is taken. No network: every
 * `fetch` is a stub.
 *
 *   node scripts/check-account.ts
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { createAccount, nameCandidates } from '../src/account/account.ts';
import {
  AuthError, REFRESH_AHEAD_MS, SESSION_KEY, VERIFIER_KEY, createAuth, parseSession, sessionOf, sessionState,
} from '../src/account/auth.ts';
import type { Fetch, KeyStore, Session } from '../src/account/auth.ts';
import { VALID_VERIFIER, codeChallenge, codeVerifier } from '../src/account/pkce.ts';
import {
  CHANGES_KEY, accountName, emptyProfile, mergeProfiles, profileFromRow, profileKey, progressOf, readLocalProfile, writeLocalProfile,
} from '../src/account/profile.ts';
import type { Profile } from '../src/account/profile.ts';
import { createRest } from '../src/account/rest.ts';
import { DEFAULT_APPEARANCE, LOOK_KEY, encodeAppearance } from '../src/appearance.ts';
import { PASSPORT_KEY, mergePassports, parsePassport } from '../src/passport.ts';
import type { Stamp } from '../src/passport.ts';
import { NAME_KEY } from '../src/peers/constants.ts';
import { RINGS_KEY, parseRecord } from '../src/rings/store.ts';

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

const stamp = (iso: string, date: string, town = 'Town'): Stamp => ({ iso, name: iso, date, town, mode: 'foot', lat: 1, lon: 2 });
const LOOK_A = encodeAppearance(DEFAULT_APPEARANCE);
const LOOK_B = encodeAppearance({ ...DEFAULT_APPEARANCE, body: DEFAULT_APPEARANCE.body === 'man' ? 'woman' : 'man' });
const USER = '2b1c2f5e-8d43-4c55-9e1a-7f0d3b6a9c11';

function profile(part: Partial<Profile> & { stamps?: Stamp[]; towns?: string[]; landmarks?: string[]; courses?: [string, number, number][] }): Profile {
  const p = emptyProfile();
  Object.assign(p, { name: part.name ?? '', nameAt: part.nameAt ?? 0, look: part.look ?? '', lookAt: part.lookAt ?? 0 });
  p.passport.stamps = part.stamps ?? [];
  p.passport.towns = part.towns ?? [];
  p.rings.landmarks = new Set(part.landmarks ?? []);
  for (const [key, ms, medal] of part.courses ?? []) p.rings.courses.set(key, { ms, medal, title: key, kind: 'air' });
  return p;
}

/** A profile with its orders folded away, for comparing merges taken in either order. */
function normal(p: Profile): string {
  return JSON.stringify({
    name: p.name, nameAt: p.nameAt, look: p.look, lookAt: p.lookAt,
    stamps: [...p.passport.stamps].sort((a, b) => (a.iso < b.iso ? -1 : 1)),
    towns: [...p.passport.towns].sort(),
    landmarks: [...p.rings.landmarks].sort(),
    courses: [...p.rings.courses].sort((a, b) => (a[0] < b[0] ? -1 : 1)),
  });
}

const A = profile({
  name: 'Andreu', nameAt: 100, look: LOOK_A, lookAt: 50,
  stamps: [stamp('ESP', '2026-01-02'), stamp('FRA', '2026-02-01')], towns: ['ESP:Palma', 'FRA:Paris'],
  landmarks: ['eiffel-tower'], courses: [['a:palma', 60_000, 1], ['s:med', 90_000, 3]],
});
const B = profile({
  name: 'Andy', nameAt: 200, look: LOOK_B, lookAt: 10,
  stamps: [stamp('FRA', '2026-01-15', 'Lyon'), stamp('JPN', '2026-03-01')], towns: ['FRA:Paris', 'JPN:Tokyo'],
  landmarks: ['tokyo-tower'], courses: [['a:palma', 70_000, 3], ['l:tokyo', 120_000, 2]],
});

test('the merge keeps everything either side holds, and the best of each', () => {
  const m = mergeProfiles(A, B);
  assert.deepEqual(m.passport.stamps.map((s) => s.iso), ['ESP', 'FRA', 'JPN']);
  assert.equal(m.passport.stamps.find((s) => s.iso === 'FRA')!.date, '2026-01-15', 'the earliest stamp of a country');
  assert.equal(m.passport.stamps.find((s) => s.iso === 'FRA')!.town, 'Lyon');
  assert.deepEqual(m.passport.towns, ['ESP:Palma', 'FRA:Paris', 'JPN:Tokyo']);
  assert.deepEqual([...m.rings.landmarks].sort(), ['eiffel-tower', 'tokyo-tower']);
  const palma = m.rings.courses.get('a:palma')!;
  assert.equal(palma.ms, 60_000, 'the faster time');
  assert.equal(palma.medal, 3, 'and the better medal, from the other run');
  assert.equal(m.rings.courses.size, 3);
  assert.equal(m.name, 'Andy', 'the name changed last');
  assert.equal(m.look, LOOK_A, 'the look changed last');
});

test('the merge is idempotent, commutative and associative, and never loses', () => {
  const C = profile({ name: 'Cee', nameAt: 200, stamps: [stamp('ITA', '2025-12-31')], courses: [['s:med', 80_000, 1]] });
  for (const x of [A, B, C, emptyProfile()]) {
    assert.equal(normal(mergeProfiles(x, x)), normal(x));
    assert.equal(profileKey(mergeProfiles(mergeProfiles(x, A), A)), profileKey(mergeProfiles(x, A)));
    for (const y of [A, B, C, emptyProfile()]) {
      const m = mergeProfiles(x, y);
      assert.equal(normal(m), normal(mergeProfiles(y, x)));
      for (const z of [A, B, C]) assert.equal(normal(mergeProfiles(m, z)), normal(mergeProfiles(x, mergeProfiles(y, z))));
      for (const side of [x, y]) {
        for (const s of side.passport.stamps) assert.ok(m.passport.stamps.find((t) => t.iso === s.iso)!.date <= s.date);
        for (const town of side.passport.towns) assert.ok(m.passport.towns.includes(town));
        for (const id of side.rings.landmarks) assert.ok(m.rings.landmarks.has(id));
        for (const [key, best] of side.rings.courses) {
          assert.ok(m.rings.courses.get(key)!.ms <= best.ms);
          assert.ok(m.rings.courses.get(key)!.medal >= best.medal);
        }
      }
    }
  }
  // Equal times: one fixed winner whichever side it is on.
  assert.equal(mergeProfiles(C, B).name, mergeProfiles(B, C).name);
  // A name never loses to no name, whatever the times.
  assert.equal(mergeProfiles(profile({ name: 'Old', nameAt: 1 }), profile({ name: '', nameAt: 999 })).name, 'Old');
  // The book's own merge keeps a day's stamps in the order they were met.
  const day = mergePassports({ version: 1, stamps: [stamp('PRT', '2026-05-05'), stamp('AND', '2026-05-05')], towns: [] }, { version: 1, stamps: [], towns: [] });
  assert.deepEqual(day.stamps.map((s) => s.iso), ['PRT', 'AND']);
});

test('a row is the player\'s to write: it reads as what can be vouched for', () => {
  const hostile = [
    {},
    { name: 42, look: 'zzzzzzzzzzzzz', progress: 'nope' },
    { name: '<script>', look: null, progress: [] },
    { name: 'ok name', look: LOOK_A, progress: { nameAt: -5, lookAt: 'x', passport: { version: 1, stamps: [{ iso: 'ESP', date: 'yesterday' }, 7, null], towns: [1, 'ESP:Palma'] }, rings: { landmarks: ['ok', 'NOT OK', {}], courses: { 'a:x': { ms: -1, medal: 3 }, 'zz': { ms: 5, medal: 1 }, 'a:y': { ms: 5, medal: 9 }, 's:z': { ms: 900, medal: 2, title: 'T' } } } } },
    { progress: { passport: { version: 1, stamps: Array.from({ length: 5000 }, (_, i) => stamp(`mars:n${i}`, '2026-01-01')) } } },
  ];
  for (const row of hostile) {
    const p = profileFromRow(row);
    assert.ok(p.name === '' || /^[A-Za-z0-9 _.-]{2,20}$/.test(p.name));
    assert.ok(p.look === '' || p.look === LOOK_A);
    assert.ok(Number.isFinite(p.nameAt) && p.nameAt >= 0);
    assert.ok(p.passport.stamps.length <= 2000);
    for (const s of p.passport.stamps) assert.match(s.date, /^\d{4}-\d{2}-\d{2}$/);
  }
  const p = profileFromRow(hostile[3]!);
  assert.equal(p.name, 'ok name');
  assert.equal(p.nameAt, 0);
  assert.deepEqual(p.passport.towns, ['ESP:Palma']);
  assert.equal(p.passport.stamps.length, 0);
  assert.deepEqual([...p.rings.landmarks], ['ok']);
  assert.deepEqual([...p.rings.courses.keys()], ['s:z']);
  // And what is written reads back the same.
  const round = profileFromRow({ name: A.name, look: A.look, progress: JSON.parse(JSON.stringify(progressOf(A))) });
  assert.equal(profileKey(round), profileKey(A));
});

test('names: what an account may hold, and what a new row tries', () => {
  assert.equal(accountName('  José  María '), 'Jos Mara');
  assert.equal(accountName('x'), '');
  assert.equal(accountName('🙂🙂'), '');
  assert.equal(accountName('A'.repeat(30)), 'A'.repeat(20));
  const tries = nameCandidates('Andreu', 'ignored', () => 0.5);
  assert.equal(tries[0], 'Andreu');
  assert.equal(new Set(tries).size, tries.length);
  for (const name of tries) assert.equal(accountName(name), name);
  assert.equal(nameCandidates('', 'disc.ord_user', () => 0)[0], 'disc.ord_user');
  assert.deepEqual(nameCandidates('', '', () => 0), []);
});

test('the device: a damaged store, a change dated when seen, a write that reaches every store', () => {
  const store = memory({ [PASSPORT_KEY]: '{not json', [RINGS_KEY]: '[]', [NAME_KEY]: 'Andreu', [LOOK_KEY]: 'garbage', [CHANGES_KEY]: '{"known":"yes"' });
  const first = readLocalProfile(store, 1000);
  assert.equal(first.name, 'Andreu');
  assert.equal(first.nameAt, 0, 'a name never seen before is of unknown age');
  assert.equal(first.look, '');
  assert.equal(first.passport.stamps.length, 0);
  store.items[NAME_KEY] = 'Andy';
  assert.equal(readLocalProfile(store, 2000).nameAt, 2000, 'a change is dated when it is seen');
  assert.equal(readLocalProfile(store, 3000).nameAt, 2000, 'and keeps that date');

  const written = writeLocalProfile(store, mergeProfiles(readLocalProfile(store, 4000), B));
  assert.deepEqual(written, { name: false, look: true, passport: true, rings: true });
  assert.equal(store.items[LOOK_KEY], LOOK_B);
  assert.deepEqual(parsePassport(store.items[PASSPORT_KEY]).stamps.map((s) => s.iso), ['FRA', 'JPN']);
  assert.deepEqual([...parseRecord(store.items[RINGS_KEY]).landmarks], ['tokyo-tower']);
  const again = readLocalProfile(store, 5000);
  assert.equal(again.lookAt, B.lookAt, 'a written look is not taken for a change');
  assert.deepEqual(writeLocalProfile(store, again), { name: false, look: false, passport: false, rings: false });

  // A store that throws on every call costs the visit, not the page.
  const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
  assert.equal(readLocalProfile(broken, 1).name, '');
  writeLocalProfile(broken, A);
});

test('PKCE against RFC 7636', async () => {
  assert.equal(await codeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  for (let i = 0; i < 50; i++) {
    const verifier = codeVerifier();
    assert.match(verifier, VALID_VERIFIER);
    assert.equal(await codeChallenge(verifier), createHash('sha256').update(verifier).digest('base64url'));
  }
  assert.notEqual(codeVerifier(), codeVerifier());
});

const CONFIG = { url: 'https://example.supabase.co', key: 'sb_publishable_test' };
const user = { id: USER, user_metadata: { full_name: 'Andreu', avatar_url: 'https://cdn.discordapp.com/avatars/1/abc.png' } };
const tokens = (n: number) => ({ access_token: `access-token-${n}`, refresh_token: `refresh-token-${n}`, expires_in: 3600, user });

interface Call { url: string; method: string; body: unknown; headers: Record<string, string> }

/** A stubbed `fetch`: answers by a handler, records every call. */
function stub(handler: (call: Call) => { status: number; body?: unknown } | 'down') {
  const calls: Call[] = [];
  const fetch: Fetch = async (url, init = {}) => {
    const call: Call = { url, method: init.method ?? 'GET', body: init.body === undefined ? undefined : JSON.parse(String(init.body)), headers: { ...(init.headers as Record<string, string>) } };
    calls.push(call);
    const answer = handler(call);
    if (answer === 'down') throw new TypeError('Failed to fetch');
    return new Response(answer.body === undefined ? null : JSON.stringify(answer.body), { status: answer.status });
  };
  return { fetch, calls };
}

test('the session: stored, refreshed when due, dropped when refused, kept when the network is down', async () => {
  for (const bad of [null, '', '{', '[]', '{"access":"a"}', JSON.stringify({ access: 'x'.repeat(10), refresh: 'y'.repeat(10), expiresAt: 'soon', user: { id: USER } })]) {
    assert.equal(parseSession(bad), null);
  }
  const session = sessionOf(tokens(1), 1_000_000)!;
  assert.equal(session.expiresAt, 1_000_000 + 3_600_000);
  assert.equal(session.user.avatar, 'https://cdn.discordapp.com/avatars/1/abc.png');
  assert.deepEqual(parseSession(JSON.stringify(session)), session);
  assert.equal(sessionOf({ ...tokens(1), user: { ...user, user_metadata: { avatar_url: 'https://evil.example/x.png' } } }, 0)!.user.avatar, '');
  assert.equal(sessionState(null, 0), 'none');
  assert.equal(sessionState(session, session.expiresAt - REFRESH_AHEAD_MS - 1), 'fresh');
  assert.equal(sessionState(session, session.expiresAt - REFRESH_AHEAD_MS), 'refresh');

  let clock = 1_000_000;
  let mode: 'ok' | 'refuse' | 'down' = 'ok';
  const net = stub((call) => {
    if (mode === 'down') return 'down';
    if (call.url.includes('grant_type=refresh_token')) return mode === 'refuse' ? { status: 400, body: { error: 'invalid_grant' } } : { status: 200, body: tokens(2) };
    if (call.url.includes('grant_type=pkce')) return { status: 200, body: tokens(1) };
    if (call.url.endsWith('/logout')) return { status: 204 };
    return { status: 404 };
  });
  const storage = memory();
  const tab = memory();
  const auth = createAuth({ config: CONFIG, fetch: net.fetch, storage, tabStorage: tab, now: () => clock });

  const url = new URL(await auth.authorizeUrl('http://localhost:5174/?at=1,2'));
  assert.equal(url.origin + url.pathname, 'https://example.supabase.co/auth/v1/authorize');
  assert.equal(url.searchParams.get('provider'), 'discord');
  assert.equal(url.searchParams.get('redirect_to'), 'http://localhost:5174/?at=1,2');
  assert.equal(url.searchParams.get('code_challenge_method'), 's256');
  assert.equal(url.searchParams.get('code_challenge'), await codeChallenge(tab.items[VERIFIER_KEY]!));

  const verifier = tab.items[VERIFIER_KEY]!;
  await auth.exchange('the-code');
  const exchange = net.calls.at(-1)!;
  assert.deepEqual(exchange.body, { auth_code: 'the-code', code_verifier: verifier });
  assert.equal(exchange.headers.apikey, CONFIG.key);
  assert.equal(tab.items[VERIFIER_KEY], undefined, 'the verifier is spent');
  assert.equal(parseSession(storage.items[SESSION_KEY])!.access, 'access-token-1');
  await assert.rejects(auth.exchange('again'), AuthError, 'no verifier, no exchange');

  let before = net.calls.length;
  assert.equal((await auth.current())!.access, 'access-token-1');
  assert.equal(net.calls.length, before, 'a fresh session asks nothing');

  clock += 3_600_000 - REFRESH_AHEAD_MS + 1;
  const [x, y] = await Promise.all([auth.current(), auth.current()]);
  assert.equal(x!.access, 'access-token-2');
  assert.equal(y, x);
  assert.equal(net.calls.length, before + 1, 'one refresh for two asks');
  assert.deepEqual(net.calls.at(-1)!.body, { refresh_token: 'refresh-token-1' });

  clock += 3_600_000;
  mode = 'down';
  await assert.rejects(auth.current(), TypeError);
  assert.notEqual(auth.session, null, 'a network that is down keeps the session');
  assert.ok(storage.items[SESSION_KEY] !== undefined);

  // Another tab refreshed meanwhile: its session is taken rather than signing out.
  mode = 'refuse';
  const other = sessionOf(tokens(3), clock)!;
  storage.items[SESSION_KEY] = JSON.stringify(other);
  assert.equal((await auth.current())!.access, 'access-token-3');

  clock += 3_600_000;
  let told: Session | null | undefined;
  auth.onChange = (next) => (told = next);
  assert.equal(await auth.current(), null, 'a refused refresh signs out');
  assert.equal(told, null);
  assert.equal(storage.items[SESSION_KEY], undefined);

  storage.items[SESSION_KEY] = JSON.stringify(sessionOf(tokens(4), clock));
  mode = 'ok';
  before = net.calls.length;
  await auth.signOut();
  assert.equal(net.calls.at(-1)!.headers.Authorization, 'Bearer access-token-4');
  assert.equal(storage.items[SESSION_KEY], undefined);
});

/** A `profiles` table in memory behind PostgREST's answers, with its unique names. */
function table(rows: Map<string, Record<string, unknown>>, others: string[]) {
  return stub((call) => {
    const merging = call.url.includes('/rest/v1/rpc/merge_profile');
    if (!call.url.includes('/rest/v1/profiles') && !merging) return call.url.includes('refresh_token') ? { status: 200, body: tokens(9) } : { status: 404 };
    const taken = (name: unknown): boolean =>
      typeof name === 'string' && (others.some((o) => o.toLowerCase() === name.toLowerCase()) || [...rows.entries()].some(([id, r]) => id !== USER && String(r.name).toLowerCase() === name.toLowerCase()));
    const body = call.body as Record<string, unknown> | undefined;
    if (merging) {
      // The server's merge, by the same rules (the SQL twin is `merge_progress` in supabase/schema.sql).
      const held = rows.get(USER);
      if (held === undefined) return { status: 400 };
      const name = String(body!.p_name ?? '');
      if (name !== '' && name !== held.name && taken(name)) return { status: 409, body: { code: '23505' } };
      const merged = mergeProfiles(profileFromRow(held), profileFromRow({ name: name || held.name, look: body!.p_look || held.look, progress: body!.p_progress }));
      Object.assign(held, { name: merged.name || null, look: merged.look || null, progress: progressOf(merged) });
      return { status: 200, body: [held] };
    }
    if (call.method === 'GET') return { status: 200, body: rows.has(USER) ? [rows.get(USER)] : [] };
    if (call.method === 'POST') {
      if (rows.has(USER) || taken(body!.name)) return { status: 409, body: { code: '23505' } };
      rows.set(USER, { name: body!.name, look: body!.look, role: 'player', progress: body!.progress });
      return { status: 201, body: [rows.get(USER)] };
    }
    if (call.method === 'PATCH') {
      if ('role' in body!) return { status: 403 };
      if (taken(body!.name)) return { status: 409, body: { code: '23505' } };
      Object.assign(rows.get(USER)!, body);
      return { status: 200, body: [rows.get(USER)] };
    }
    return { status: 405 };
  });
}

test('a sign-in makes the row, merges both ways, and keeps a name nobody else has', async () => {
  const clock = 5_000_000;
  const storage = memory({
    [NAME_KEY]: 'Andreu',
    [PASSPORT_KEY]: JSON.stringify({ version: 1, stamps: [stamp('ESP', '2026-01-02')], towns: ['ESP:Palma'] }),
  });
  storage.items[SESSION_KEY] = JSON.stringify(sessionOf(tokens(1), clock));
  const rows = new Map<string, Record<string, unknown>>();
  const net = table(rows, ['andreu', 'Andreu 2']);
  const auth = createAuth({ config: CONFIG, fetch: net.fetch, storage, tabStorage: memory(), now: () => clock });
  const live: string[] = [];
  const logged: string[] = [];
  const log = console.log;
  const warn = console.warn;
  console.log = console.warn = (...args: unknown[]) => logged.push(args.map(String).join(' '));
  try {
    const account = createAccount({ auth, rest: createRest(CONFIG, net.fetch), storage, now: () => clock, go: () => {}, returnUrl: () => '', watch: false });
    account.attach({ name: (n) => live.push(`name:${n}`), passport: { absorb: () => live.push('passport') } });
    await account.sync();
    assert.equal(account.view.state, 'in');
    assert.equal(account.view.name, 'Andreu 3', 'the first free variant of the device\'s name');
    assert.equal(storage.items[NAME_KEY], 'Andreu 3');
    assert.deepEqual(live, ['name:Andreu 3']);
    assert.equal(rows.get(USER)!.name, 'Andreu 3');
    assert.deepEqual(profileFromRow(rows.get(USER)!).passport.stamps.map((s) => s.iso), ['ESP']);

    // Another device added to the row: it arrives here, and nothing here is lost.
    const progress = rows.get(USER)!.progress as Record<string, unknown>;
    rows.get(USER)!.progress = { ...progress, passport: { version: 1, stamps: [stamp('JPN', '2026-03-01')], towns: ['JPN:Tokyo'] } };
    await account.sync();
    assert.deepEqual(parsePassport(storage.items[PASSPORT_KEY]).stamps.map((s) => s.iso), ['ESP', 'JPN']);
    assert.deepEqual(profileFromRow(rows.get(USER)!).passport.stamps.map((s) => s.iso), ['ESP', 'JPN']);
    assert.ok(live.includes('passport'));

    assert.equal(await account.rename('x'), 'invalid');
    assert.equal(await account.rename('ANDREU'), 'taken');
    assert.equal(account.view.name, 'Andreu 3');
    assert.equal(storage.items[NAME_KEY], 'Andreu 3', 'a taken name goes back to the account\'s');
    assert.equal(await account.rename('Planeteer'), 'ok');
    assert.equal(rows.get(USER)!.name, 'Planeteer');

    // The network goes: progress stays on the device, and is sent on the next try.
    const down = stub(() => 'down');
    const offline = createAccount({ auth: createAuth({ config: CONFIG, fetch: down.fetch, storage, tabStorage: memory(), now: () => clock }), rest: createRest(CONFIG, down.fetch), storage, now: () => clock, go: () => {}, returnUrl: () => '', watch: false });
    storage.items[RINGS_KEY] = JSON.stringify({ landmarks: ['big-ben'], courses: {} });
    await offline.sync();
    assert.equal(offline.view.sync, 'offline');
    assert.deepEqual([...parseRecord(storage.items[RINGS_KEY]).landmarks], ['big-ben']);
    await account.sync();
    assert.deepEqual([...profileFromRow(rows.get(USER)!).rings.landmarks], ['big-ben']);

    await account.signOut();
    assert.equal(account.view.state, 'out');
    assert.equal(storage.items[NAME_KEY], '', 'a guest again');
    assert.deepEqual(parsePassport(storage.items[PASSPORT_KEY]).stamps.map((s) => s.iso), ['ESP', 'JPN'], 'the progress stays');
    account.dispose();
  } finally {
    console.log = log;
    console.warn = warn;
  }
  for (const line of logged) assert.ok(!/token-\d/.test(line), 'no token in the console');
});
