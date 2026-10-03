/**
 * The relay's protocol, against a running relay: the seats, the driven poses,
 * the parks that outlive a socket, the old player poses beside them, how
 * each player looks, the chat and its history, the gestures, the horn, and
 * a room a world. Before any of it, headless, the worlds' radii the relay
 * bounds a state by, against the bodies' own files.
 *
 * It starts nothing. Run the relay first (`pnpm peers`, which is
 * `wrangler dev` on port 8787, or any port given to it) and point this at it:
 *
 *   RELAY_URL=ws://localhost:8791/ws node scripts/check-relay.ts
 *
 * Every vehicle id is new each run, so what a previous run parked in the
 * room's storage never answers for this one. Not in CI: it wants a relay.
 */

import {
  BODY_RADII,
  CHAT_BURST,
  CHAT_HISTORY,
  CHAT_INTERVAL_MS,
  CHAT_MAX,
  EMOTE_INTERVAL_MS,
  HONK_INTERVAL_MS,
  MAX_RADIUS,
  MIN_RADIUS,
  cleanBody,
  cleanCountry,
  shellOf,
} from '../server/src/limits.ts';
import { PLANET_RADIUS, surfaceRadiusOf } from '../src/system/contract.ts';

const URL_ = process.env.RELAY_URL ?? 'ws://localhost:8791/ws';
const WAIT_MS = 2_000;

type Message = { t: string; [field: string]: unknown };

let failures = 0;
function check(ok: boolean, what: string, detail?: unknown): void {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${!ok && detail !== undefined ? `\n     ${JSON.stringify(detail)}` : ''}`);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class Client {
  readonly socket: WebSocket;
  readonly inbox: Message[] = [];
  private readonly waiters: { match: (m: Message) => boolean; resolve: (m: Message) => void }[] = [];
  id = '';
  hi: Message | null = null;

  private constructor(name: string, key?: string, look?: string, body?: string) {
    this.socket = new WebSocket(
      `${URL_}?name=${encodeURIComponent(name)}${key === undefined ? '' : `&key=${key}`}${look === undefined ? '' : `&look=${encodeURIComponent(look)}`}${body === undefined ? '' : `&body=${encodeURIComponent(body)}`}`,
    );
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as Message;
      const waiter = this.waiters.findIndex((w) => w.match(message));
      if (waiter >= 0) this.waiters.splice(waiter, 1)[0]!.resolve(message);
      else this.inbox.push(message);
    });
  }

  static async join(name: string, key?: string, look?: string, body?: string): Promise<Client> {
    const client = new Client(name, key, look, body);
    const hi = await client.next((m) => m.t === 'hi');
    client.hi = hi;
    client.id = String(hi.id);
    return client;
  }

  /** The first message, already in or still to come, that `match` accepts; rejects after `WAIT_MS`. */
  next(match: (m: Message) => boolean, ms = WAIT_MS): Promise<Message> {
    const waiting = this.inbox.findIndex(match);
    if (waiting >= 0) return Promise.resolve(this.inbox.splice(waiting, 1)[0]!);
    return new Promise((resolve, reject) => {
      const waiter = { match, resolve: (m: Message) => (clearTimeout(timer), resolve(m)) };
      const timer = setTimeout(() => {
        this.waiters.splice(this.waiters.indexOf(waiter), 1);
        reject(new Error('timed out'));
      }, ms);
      this.waiters.push(waiter);
    });
  }

  /** False if it came, true if nothing `match` accepts arrived within `ms`. */
  async none(match: (m: Message) => boolean, ms = 400): Promise<boolean> {
    try {
      await this.next(match, ms);
      return false;
    } catch {
      return true;
    }
  }

  send(message: unknown): void {
    this.socket.send(typeof message === 'string' ? message : JSON.stringify(message));
  }

  /** Stands at `at` on foot: an old-style nine-number pose. */
  standAt(at: readonly number[], state = 0): void {
    this.send([at[0], at[1], at[2], 0, 1, 0, state, 0, 0]);
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      this.socket.addEventListener('close', () => resolve());
      this.socket.close();
    });
  }
}

const got = async (what: string, promise: Promise<Message>): Promise<Message | null> => {
  try {
    return await promise;
  } catch {
    check(false, what, 'no message');
    return null;
  }
};

/** A pose `dx` units out along +X from a point on the planet, facing +Y, up +X. */
const HERE = [16_010, 0, 0] as const;
const pose = (dx: number, dy = 0): number[] => [HERE[0] + dx, HERE[1] + dy, HERE[2], 0, 1, 0, 1, 0, 0];
const near = (a: unknown, b: readonly number[], within = 0.05) =>
  Array.isArray(a) && a.length === 9 && a.every((n, i) => Math.abs((n as number) - b[i]!) <= within);

const run = Math.floor(Math.random() * 900_000 + 100_000);
const vehicle = (slot: number) => `hatchback:${run}:${slot}`;

/**
 * The worlds' radii, headless: every walkable body's file read for its
 * `radiusKm`, put through `surfaceRadiusOf`, against what the relay restates.
 */
async function worlds(): Promise<void> {
  check(BODY_RADII['earth'] === PLANET_RADIUS, 'Earth\'s room is bounded by the planet\'s own radius');
  const earth = shellOf('earth');
  check(earth.min === MIN_RADIUS && earth.max === MAX_RADIUS, "and Earth's shell is the one it always was", earth);
  for (const id of Object.keys(BODY_RADII)) {
    if (id === 'earth') continue;
    const module = (await import(`../src/system/bodies/${id}.ts`)) as Record<string, unknown>;
    const body = Object.values(module).find((value) => (value as { id?: unknown } | null)?.id === id) as { radiusKm: number } | undefined;
    const radius = body === undefined ? Number.NaN : Math.round(surfaceRadiusOf(body.radiusKm));
    check(radius === BODY_RADII[id], `${id}'s radius is its body's, ${radius}`, { relay: BODY_RADII[id], body: radius });
    const shell = shellOf(id);
    check(shell.min < radius && shell.max > radius * 1.25, `${id}'s shell holds its surface and its sky`, shell);
  }
  check(cleanBody(null) === 'earth' && cleanBody('') === 'earth' && cleanBody('mars') === 'mars', 'no body is Earth, and a known one is itself');
  check(cleanBody('pluto') === '' && cleanBody('__proto__') === '' && cleanBody(7) === '', 'an unknown world is refused');
  check(cleanCountry('ESP') === 'ESP' && cleanCountry('mars:tharsis') === 'mars:tharsis', "a country's code and a nation's key are both a line's country");
  check(cleanCountry('Mars:Tharsis') === '' && cleanCountry('mars:') === '' && cleanCountry('<b>') === '', 'and nothing else is');
}

/** The rooms a world: who sees whom, and what each room bounds a state by. */
async function rooms(): Promise<void> {
  const mars = BODY_RADII['mars']!;
  const onMars = [mars + 10, 0, 0] as const;
  const m1 = await Client.join('Mo', undefined, undefined, 'mars');
  const m2 = await Client.join('Ma', undefined, undefined, 'mars');
  const e1 = await Client.join('Ea');
  const e2 = await Client.join('Eb', undefined, undefined, 'earth');
  const metOnMars = await got('in on mars', m1.next((m) => m.t === 'in' && m.id === m2.id));
  check(metOnMars?.name === 'Ma', 'a world has a room: a join there is announced there');
  const metOnEarth = await got('in by ?body=earth', e1.next((m) => m.t === 'in' && m.id === e2.id));
  check(metOnEarth?.name === 'Eb', '`?body=earth` is the room an address without a body reaches');
  check(!((m1.hi?.peers as unknown[][] | undefined) ?? []).some((row) => row[0] === e1.id), "a newcomer on Mars is not told of Earth's players");
  check(await e1.none((m) => m.t === 'in' && (m.id === m1.id || m.id === m2.id), 200), "and Earth's are not told of Mars's");

  m1.standAt(onMars);
  const there = await got('at on mars', m2.next((m) => m.t === 'at' && m.id === m1.id));
  check(near(there?.s, [...onMars, 0, 1, 0, 0, 0, 0]), "a state on Mars's surface is relayed on Mars", there);
  check(await e1.none((m) => m.t === 'at' && m.id === m1.id), 'a peer on Mars is never seen on Earth');
  e1.standAt(HERE);
  check(await m1.none((m) => m.t === 'at' && m.id === e1.id), 'nor one on Earth on Mars');
  await got('at on earth', e2.next((m) => m.t === 'at' && m.id === e1.id));
  await sleep(100);
  e1.standAt(onMars);
  check(await e2.none((m) => m.t === 'at' && m.id === e1.id, 300), "a state at Mars's radius is under Earth's ground, and dropped there");
  await sleep(100);
  m1.standAt([mars * 0.5, 0, 0]);
  check(await m2.none((m) => m.t === 'at' && m.id === m1.id, 300), "and one deep inside Mars is dropped on Mars");

  const giant = await Client.join('Jo', undefined, undefined, 'jupiter');
  const watcher = await Client.join('Ju', undefined, undefined, 'jupiter');
  giant.standAt([BODY_RADII['jupiter']! + 10, 0, 0]);
  const deck = await got('at on jupiter', watcher.next((m) => m.t === 'at' && m.id === giant.id));
  check(deck !== null, "a state on Jupiter's deck, eleven Earths out, is a state there", deck);

  await sleep(300);
  m1.send({ t: 'sit', v: vehicle(9), seat: 0 });
  check(await m1.none((m) => m.t === 'seat', 500), "another world's room arbitrates no seat");

  m1.send({ t: 'chat', m: `hello from Tharsis ${run}`, c: 'mars:tharsis' });
  const line = await got('chat on mars', m2.next((m) => m.t === 'chat' && m.id === m1.id));
  check(line?.c === 'mars:tharsis', "a line on Mars carries its nation's key", line);
  check(await e1.none((m) => m.t === 'chat' && m.id === m1.id, 300), 'and is not heard on Earth');
  const late = await Client.join('Ed');
  check(!((late.hi?.chat as Message[] | undefined) ?? []).some((m) => m.id === m1.id), "Earth's history has no line said on Mars");

  let refused = false;
  try {
    await Client.join('Pl', undefined, undefined, 'pluto');
  } catch {
    refused = true;
  }
  check(refused, 'a world the relay does not know has no room');

  await Promise.all([m1.close(), m2.close(), e1.close(), e2.close(), giant.close(), watcher.close(), late.close()]);
}

async function main(): Promise<void> {
  await worlds();
  console.log(`relay ${URL_}, run ${run}`);
  await rooms();

  // --- Joining ------------------------------------------------------------
  const a = await Client.join('Ada');
  const b = await Client.join('Bo');
  check(a.id !== '' && b.id !== '' && a.id !== b.id, 'each socket gets its own id in hi');
  check(Array.isArray(a.hi?.vehicles) && Array.isArray(a.hi?.peers), 'hi carries peers and vehicles');
  const joined = await got('in', a.next((m) => m.t === 'in' && m.id === b.id));
  check(joined?.name === 'Bo', 'a join is announced with its name');

  // --- The old pose, and the state slot -------------------------------------
  a.standAt(HERE);
  const at = await got('at', b.next((m) => m.t === 'at' && m.id === a.id));
  check(near(at?.s, [...HERE, 0, 1, 0, 0, 0, 0]), 'an old nine-number pose is relayed as `at`', at);
  check(await a.none((m) => m.t === 'at' && m.id === a.id), 'a pose is not echoed to its sender');
  await sleep(100);
  b.standAt([HERE[0] + 5, 0, 0], 2);
  const seated = await got('at seated', a.next((m) => m.t === 'at' && m.id === b.id));
  check((seated?.s as number[] | undefined)?.[6] === 2, 'the state slot carries `seated` (2)');

  // --- Nonsense is ignored ---------------------------------------------------
  a.send('not json');
  a.send({ t: 'sit', v: 'NOT A VEHICLE', seat: 0 });
  a.send({ t: 'sit', v: vehicle(0), seat: 9 });
  a.send({ t: 'vp', v: vehicle(0), p: pose(0), sp: 1 });
  a.send({ t: 'up', v: vehicle(0), p: pose(0) });
  a.send([1, 2, 3, 0, 1, 0, 0, 0, 0]);
  a.send({ t: 'vp', v: vehicle(0), p: ['x', 0, 0, 0, 1, 0, 1, 0, 0], sp: 1 });
  a.send({ t: 'hi', id: 'forged' });
  check(await b.none(() => true, 500), 'invalid messages reach nobody', b.inbox);
  check(a.inbox.length === 0, 'and are not answered', a.inbox);
  await sleep(300);

  // --- Two claims on one seat ------------------------------------------------
  const v1 = vehicle(1);
  a.send({ t: 'sit', v: v1, seat: 0 });
  b.send({ t: 'sit', v: v1, seat: 0 });
  const [askA, askB] = await Promise.all([
    got('a answered', a.next((m) => m.t === 'seat' && m.v === v1 && m.ask === 0)),
    got('b answered', b.next((m) => m.t === 'seat' && m.v === v1 && m.ask === 0)),
  ]);
  const wonA = (askA?.seats as unknown[] | undefined)?.[0] === a.id;
  const wonB = (askB?.seats as unknown[] | undefined)?.[0] === b.id;
  check(wonA !== wonB, 'two claims on one seat: exactly one wins', { askA, askB });
  const [driver, other] = wonA ? [a, b] : [b, a];
  const named = (m: Message | null) => (m?.seats as unknown[] | undefined)?.[0];
  check(named(askA) === driver.id && named(askB) === driver.id, 'both answers name the same winner', { askA, askB });
  await sleep(100);
  a.inbox.length = 0;
  b.inbox.length = 0;

  // --- Driving ---------------------------------------------------------------
  driver.send({ t: 'vp', v: v1, p: pose(10), sp: 12.345 });
  const vp = await got('vp relayed', other.next((m) => m.t === 'vp' && m.v === v1));
  check(near(vp?.p, pose(10)) && vp?.sp === 12.3, 'a driver pose is relayed to the others', vp);
  check(await driver.none((m) => m.t === 'vp'), 'and not echoed to the driver');
  other.send({ t: 'vp', v: v1, p: pose(40), sp: 1 });
  check(await driver.none((m) => m.t === 'vp'), 'a pose from anyone but the driver is dropped');
  driver.send({ t: 'vp', v: v1, p: pose(11), sp: 1 });
  driver.send({ t: 'vp', v: v1, p: pose(12), sp: 1 });
  await got('rate-limited vp', other.next((m) => m.t === 'vp' && near(m.p, pose(11))));
  check(await other.none((m) => m.t === 'vp' && near(m.p, pose(12)), 300), 'a pose under 50 ms after the last is dropped');
  await sleep(100);
  driver.send({ t: 'vp', v: v1, p: [-HERE[0], 0, 0, 0, 1, 0, 1, 0, 0], sp: 1 });
  check(await other.none((m) => m.t === 'vp', 300), 'a pose across the planet from the last is dropped');
  await sleep(100);

  // --- The horn, held --------------------------------------------------------
  other.send({ t: 'honk', k: 'car', on: true });
  check(await driver.none((m) => m.t === 'honk', 300), 'a horn from anyone but the driver is dropped');
  driver.send({ t: 'honk', k: 'car', on: true });
  const held = await got('honk on', other.next((m) => m.t === 'honk' && m.id === driver.id));
  check(held?.k === 'car' && held?.on === true, 'a horn held is passed on with `on: true`', held);
  // Waited for less than the pace, or the next start is a refresh and goes.
  check(await driver.none((m) => m.t === 'honk', HONK_INTERVAL_MS / 3), 'and not echoed to the driver');
  driver.send({ t: 'honk', k: 'car', on: true });
  check(await other.none((m) => m.t === 'honk', 200), `a start under ${HONK_INTERVAL_MS} ms after the last is dropped`);
  driver.send({ t: 'honk', k: 'car', on: false });
  const let_go = await got('honk off', other.next((m) => m.t === 'honk' && m.on === false));
  check(let_go?.k === 'car', 'the stop goes at once, whatever the pace', let_go);
  driver.send({ t: 'honk', k: 'car', on: false });
  check(await other.none((m) => m.t === 'honk', 200), 'a second stop is dropped');
  driver.send({ t: 'honk', k: 'car', on: 'yes' });
  check(await other.none((m) => m.t === 'honk', 200), 'an `on` that is not a boolean is dropped');
  await sleep(HONK_INTERVAL_MS);
  driver.send({ t: 'honk', k: 'bell' });
  const tap = await got('honk tap', other.next((m) => m.t === 'honk' && m.k === 'bell'));
  check(tap !== null && !('on' in tap), 'a tap in the old shape is passed on in the old shape', tap);
  await sleep(100);

  // --- Getting out parks it --------------------------------------------------
  driver.send({ t: 'up', v: v1, p: pose(20) });
  const freed = await got('seat freed', other.next((m) => m.t === 'seat' && m.v === v1));
  check(Array.isArray(freed?.seats) && (freed!.seats as unknown[]).length === 0, 'leaving frees the seat for everyone', freed);
  const parked = await got('park', other.next((m) => m.t === 'park' && m.v === v1));
  check(near(parked?.p, pose(20)), 'the driver leaving parks it where they say', parked);

  // --- A newcomer is told --------------------------------------------------
  const c = await Client.join('Cy');
  const row = (c.hi?.vehicles as unknown[][] | undefined)?.find((r) => r[0] === v1);
  check(row !== undefined && near(row[1], pose(20)) && (row[2] as unknown[]).length === 0, "a newcomer's hi holds the parked vehicle", row);

  // --- A driver who disconnects parks; a passenger keeps their seat ----------
  c.standAt([HERE[0] + 18, 0, 0]);
  await sleep(300);
  c.send({ t: 'sit', v: v1, seat: 0 });
  await got('c seated', c.next((m) => m.t === 'seat' && m.ask === 0 && (m.seats as unknown[])[0] === c.id));
  await sleep(300);
  a.send({ t: 'sit', v: v1, seat: 1 });
  await got('a passenger', a.next((m) => m.t === 'seat' && m.ask === 1 && (m.seats as unknown[])[1] === a.id));
  c.send({ t: 'vp', v: v1, p: pose(30), sp: 5 });
  await got('c drives', b.next((m) => m.t === 'vp' && near(m.p, pose(30))));
  b.inbox.length = 0;
  await c.close();
  const left = await got('seat after disconnect', b.next((m) => m.t === 'seat' && m.v === v1));
  const leftSeats = left?.seats as unknown[] | undefined;
  check(leftSeats?.[0] === null && leftSeats?.[1] === a.id, 'a driver disconnecting frees seat 0 and the passenger keeps seat 1', left);
  const dropped = await got('park after disconnect', b.next((m) => m.t === 'park' && m.v === v1));
  check(near(dropped?.p, pose(30)), 'and the vehicle parks at its last pose', dropped);
  await got('bye', b.next((m) => m.t === 'bye'));

  // --- The passenger may take the wheel; a second claim moves them --------------
  await sleep(300);
  a.send({ t: 'sit', v: v1, seat: 0 });
  const moved = await got('a to seat 0', a.next((m) => m.t === 'seat' && m.ask === 0));
  const movedSeats = moved?.seats as unknown[] | undefined;
  check(movedSeats?.[0] === a.id && movedSeats.length === 1, 'claiming another seat gives up the one held', moved);
  await sleep(300);
  a.send({ t: 'up', v: v1 });
  await got('a out', b.next((m) => m.t === 'park' && m.v === v1));

  // --- Too far to claim ----------------------------------------------------
  const v2 = vehicle(2);
  await sleep(300);
  b.send({ t: 'sit', v: v2, seat: 0 });
  await got('b in v2', b.next((m) => m.t === 'seat' && m.v === v2 && m.ask === 0));
  b.send({ t: 'vp', v: v2, p: pose(500), sp: 30 });
  await sleep(100);
  b.send({ t: 'up', v: v2, p: pose(500) });
  await got('v2 parked far', a.next((m) => m.t === 'park' && m.v === v2));
  await sleep(300);
  b.inbox.length = 0;
  a.send({ t: 'sit', v: v2, seat: 0 });
  const far = await got('far claim answered', a.next((m) => m.t === 'seat' && m.v === v2 && m.ask === 0));
  check(far !== null && (far.seats as unknown[])[0] !== a.id, 'a claim from 500 units away is refused', far);
  check(await b.none((m) => m.t === 'seat' && m.v === v2, 300), 'and a refusal goes to the claimer alone');

  // --- A driver gone quiet is parked --------------------------------------
  const v3 = vehicle(3);
  b.send({ t: 'sit', v: v3, seat: 0 });
  await got('b in v3', b.next((m) => m.t === 'seat' && m.v === v3 && m.ask === 0));
  b.send({ t: 'vp', v: v3, p: pose(7), sp: 3 });
  await got('v3 driven', a.next((m) => m.t === 'vp' && m.v === v3));
  console.log('     (waiting 5.5 s for the silence)');
  await sleep(5_500);
  a.standAt(HERE);
  const quiet = await got('silent park', a.next((m) => m.t === 'park' && m.v === v3));
  check(near(quiet?.p, pose(7)), 'a driver silent for five seconds is parked where last seen', quiet);

  // --- A claim at a site says where the site is ------------------------------
  const v4 = vehicle(4);
  await sleep(300);
  a.send({ t: 'sit', v: v4, seat: 1, p: pose(3) });
  const placed = await got('site announced', b.next((m) => m.t === 'park' && m.v === v4));
  check(near(placed?.p, pose(3)), 'a claim at a site, beside it, announces where it stands', placed);

  // --- Persistence across a newcomer, again --------------------------------
  const d = await Client.join('Di');
  const rows = (d.hi?.vehicles as unknown[][] | undefined) ?? [];
  const three = rows.find((r) => r[0] === v3);
  check(three !== undefined && (three[2] as unknown[])[0] === b.id, 'the quiet driver still holds the seat in hi', three);
  check(rows.some((r) => r[0] === v2 && near(r[1], pose(500))), 'every parked vehicle is in hi');

  // --- A dropped driver's seat back, on a new socket with the same key ------
  const v5 = vehicle(5);
  const key = `check-relay-${run}-key`;
  const e = await Client.join('Ed', key);
  e.standAt(HERE);
  await sleep(300);
  e.send({ t: 'sit', v: v5, seat: 0 });
  await got('e in v5', e.next((m) => m.t === 'seat' && m.v === v5 && m.ask === 0));
  e.send({ t: 'vp', v: v5, p: pose(40), sp: 20 });
  await got('v5 driven', d.next((m) => m.t === 'vp' && m.v === v5));
  await e.close();
  await got('v5 parked on the drop', d.next((m) => m.t === 'park' && m.v === v5));
  // Back 3,000 units on, before saying where: the plane went on without the socket.
  const back = await Client.join('Ed', key);
  back.send({ t: 'sit', v: v5, seat: 0 });
  const again = await got('seat back', back.next((m) => m.t === 'seat' && m.v === v5 && m.ask === 0));
  check((again?.seats as unknown[] | undefined)?.[0] === back.id, 'a dropped driver on the same key gets the seat back, state or none', again);
  await sleep(300);
  back.send({ t: 'up', v: v5 });
  await got('v5 left', d.next((m) => m.t === 'park' && m.v === v5));
  const stranger = await Client.join('Fa', `${key}-other`);
  stranger.standAt([HERE[0], 3_000, 0]);
  await sleep(300);
  stranger.send({ t: 'sit', v: v5, seat: 0 });
  const refused = await got('stranger answered', stranger.next((m) => m.t === 'seat' && m.v === v5 && m.ask === 0));
  check(refused !== null && (refused.seats as unknown[])[0] !== stranger.id, 'and a stranger on another key does not', refused);

  // --- How a player looks ------------------------------------------------------
  // Codes as `encodeAppearance` writes them; the relay checks their shape only.
  const dressed = await Client.join('Gi', undefined, 'a12030405060a');
  const shown = await got('in with a look', a.next((m) => m.t === 'in' && m.id === dressed.id));
  check(shown?.look === 'a12030405060a', 'a join with ?look= is announced with it', shown);
  const late = await Client.join('Hu');
  check((late.hi?.looks as Record<string, unknown> | undefined)?.[dressed.id] === 'a12030405060a', 'hi carries every look by id', late.hi?.looks);
  dressed.send({ t: 'look', l: 'a0000000000b1' });
  const changed = await got('look', a.next((m) => m.t === 'look' && m.id === dressed.id));
  check(changed?.l === 'a0000000000b1', 'a change of look is passed on', changed);
  check(await dressed.none((m) => m.t === 'look'), 'and not echoed to its sender');
  await sleep(300);
  dressed.send({ t: 'look', l: '<b>A</b>' });
  check(await a.none((m) => m.t === 'look' && m.id === dressed.id), 'a look that is not a code is dropped');
  const plain = await Client.join('Io', undefined, '<script>');
  const bare = await got('in without a look', a.next((m) => m.t === 'in' && m.id === plain.id));
  check(bare !== null && !('look' in bare), 'a join whose ?look= is not a code carries none', bare);

  // --- The chat -------------------------------------------------------------
  // Lines this run says carry its number, so a room's history from an
  // earlier run never answers for this one.
  const said = (text: string) => `${text} ${run}`;
  const talker = await Client.join('Jo');
  const listener = await Client.join('Ki');
  talker.send({ t: 'chat', m: `  ${said('hello')}\u202E  there  `, c: 'ESP' });
  const line = await got('chat relayed', listener.next((m) => m.t === 'chat' && m.id === talker.id));
  check(
    line?.m === `${said('hello')} there` && line?.name === 'Jo' && line?.c === 'ESP' && typeof line?.at === 'number',
    'a chat line is cleaned, stamped with its sender and passed on',
    line,
  );
  const echo = await got('chat echoed', talker.next((m) => m.t === 'chat' && m.id === talker.id));
  check(echo?.m === line?.m, 'and its sender gets the same line back', echo);
  talker.send({ t: 'chat', m: 'x'.repeat(CHAT_MAX + 100), c: '<b>' });
  const long = await got('long line', listener.next((m) => m.t === 'chat' && m.id === talker.id));
  check(typeof long?.m === 'string' && long.m.length === CHAT_MAX && long.c === '', `a long line is cut to ${CHAT_MAX}, and a country that is not a code is none`, long);
  talker.send({ t: 'chat', m: said('look at https://example.com/x') });
  const linked = await got('link', listener.next((m) => m.t === 'chat' && m.id === talker.id));
  check(linked?.m === `look at [link] ${run}`, 'an address is carried as [link]', linked);
  // Three lines in a moment is the burst; the fourth is dropped.
  check(CHAT_BURST === 3, 'the burst is three lines, as these checks assume');
  talker.send({ t: 'chat', m: said('one too many') });
  check(await listener.none((m) => m.t === 'chat' && m.id === talker.id, 500), 'a line past the burst is dropped');
  talker.send({ t: 'chat', m: '   ' });
  talker.send({ t: 'chat', m: 42 });
  talker.send({ t: 'chat' });
  await sleep(CHAT_INTERVAL_MS + 100);
  talker.send({ t: 'chat', m: said('patient') });
  const patient = await got('after the interval', listener.next((m) => m.t === 'chat' && m.id === talker.id));
  check(patient?.m === said('patient'), 'a line after the interval goes, and the empty ones before it did not', patient);
  const newcomer = await Client.join('Lu');
  const history = (newcomer.hi?.chat as Message[] | undefined) ?? [];
  check(
    history.length <= CHAT_HISTORY && history[history.length - 1]?.m === said('patient') && history.some((m) => m.m === line?.m),
    `hi carries the room's last lines, at most ${CHAT_HISTORY}, oldest first`,
    history.slice(-4),
  );
  check(!history.some((m) => m.m === said('one too many')), 'and never a dropped one');

  // --- Gestures ---------------------------------------------------------------
  talker.send({ t: 'emote', e: 'wave' });
  const waved = await got('emote', listener.next((m) => m.t === 'emote' && m.id === talker.id));
  check(waved?.e === 'wave', 'a gesture is passed on', waved);
  check(await talker.none((m) => m.t === 'emote'), 'and not echoed to its maker');
  talker.send({ t: 'emote', e: 'dance' });
  check(await listener.none((m) => m.t === 'emote' && m.id === talker.id, 300), `a gesture under ${EMOTE_INTERVAL_MS} ms after the last is dropped`);
  await sleep(EMOTE_INTERVAL_MS);
  talker.send({ t: 'emote', e: 'moonwalk' });
  check(await listener.none((m) => m.t === 'emote' && m.id === talker.id, 300), 'a gesture nobody can make is dropped');
  talker.send({ t: 'emote', e: 'sit' });
  const sat = await got('sit', listener.next((m) => m.t === 'emote' && m.id === talker.id));
  check(sat?.e === 'sit', 'and the next one goes', sat);

  await Promise.all([a.close(), b.close(), d.close(), back.close(), stranger.close(), dressed.close(), late.close(), plain.close(), talker.close(), listener.close(), newcomer.close()]);
  console.log(failures === 0 ? '\nall relay checks pass' : `\n${failures} relay check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
