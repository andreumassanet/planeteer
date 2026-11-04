/**
 * The boards read through the account's endpoint: a board's rows, the
 * player's own standing, a course's best times. Each answer is kept for a
 * minute (a failure for a few seconds), two asks at once share one request,
 * and nothing here throws: a build without accounts, a network that is down
 * and a server that refuses each come back as a state the card can say.
 */
import { AuthError } from '../account/auth.ts';
import type { Session } from '../account/auth.ts';
import type { Account } from '../account/account.ts';
import type { Rest } from '../account/rest.ts';
import { COURSE_ID, isBoard } from './boards.ts';
import type { BoardId } from './boards.ts';
import { ROWS_MAX, nameOf, parseBoard, parseCourse, parseStanding } from './parse.ts';
import type { BoardRow, CourseRow, Standing } from './parse.ts';

/**
 * What a read came to: `off` when this build has no accounts, `out` when it
 * needs a signed-in player and there is none, `offline` when the network is
 * down, `error` when the server refused or answered something else.
 */
export type Answer<T> =
  | { state: 'ok'; value: T }
  | { state: 'off' | 'out' | 'offline' | 'error' };

/** What the boards are asked through: the account, or a stand-in for it. */
export type BoardsSource = Pick<Account, 'request' | 'view'>;

export interface LeaderboardsOptions {
  /** The account, null when this build has none; asked on every read. */
  source(): Promise<BoardsSource | null>;
  now(): number;
  /** How long an answer is kept, ms. */
  keepMs?: number;
  /** How long a failure is kept, ms, so a card opened again does not ask again at once. */
  failMs?: number;
}

export interface BoardQuery {
  /** Rows to read, 1 to 100: 50 by default. */
  limit?: number;
  /** Rows to skip from the top. */
  offset?: number;
  /** Ask again even if a fresh answer is kept. */
  fresh?: boolean;
}

export interface Leaderboards {
  board(id: BoardId, query?: BoardQuery): Promise<Answer<BoardRow[]>>;
  /** The signed-in player's standing on a board; `out` when signed out. */
  mine(id: BoardId, fresh?: boolean): Promise<Answer<Standing>>;
  /** A course's best times, the fastest first: ten by default. */
  course(id: string, query?: { limit?: number; fresh?: boolean }): Promise<Answer<CourseRow[]>>;
  /** Drops everything kept, as after the player hides or shows. */
  forget(): void;
}

export const KEEP_MS = 60_000;
export const FAIL_MS = 15_000;
/** The most answers kept at once: six boards, a few pages, the courses met. */
const KEPT_MAX = 200;

const SIGNED_OUT = Symbol('signed out');

/** A failure as a state: no network is `offline`, anything else `error`. */
function failure(error: unknown): 'offline' | 'error' {
  if (error instanceof AuthError) return 'error';
  if (error instanceof TypeError) return 'offline';
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
  return 'error';
}

/** The signed-in player's name as rows are compared to it, `''` signed out. */
const ownName = (source: BoardsSource): string => (source.view.state === 'in' ? source.view.name.toLowerCase() : '');

/** The rows with the player's own marked: a name is one player's whatever its case. */
function marked<T extends { name: string; me: boolean }>(rows: T[], source: BoardsSource): T[] {
  const me = ownName(source);
  return rows.map((row) => ({ ...row, me: me !== '' && row.name.toLowerCase() === me }));
}

const clamp = (value: number | undefined, fallback: number, min: number, max: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.floor(value))) : fallback;

export function createLeaderboards(options: LeaderboardsOptions): Leaderboards {
  const keepMs = options.keepMs ?? KEEP_MS;
  const failMs = options.failMs ?? FAIL_MS;
  const kept = new Map<string, { at: number; answer: Answer<unknown> }>();
  const asking = new Map<string, Promise<Answer<unknown>>>();
  /** Bumped by `forget`, so an answer asked for before it is not kept after. */
  let era = 0;

  function keep(key: string, answer: Answer<unknown>): void {
    kept.delete(key);
    kept.set(key, { at: options.now(), answer });
    while (kept.size > KEPT_MAX) kept.delete(kept.keys().next().value!);
  }

  /**
   * One read: kept, shared while under way, never thrown. `present` dresses
   * a value for who asks now (their own rows marked), kept or fresh.
   */
  function read<T>(
    key: (source: BoardsSource) => string,
    run: (rest: Rest, session: Session | null) => Promise<unknown>,
    parse: (body: unknown) => T | null,
    present: (value: T, source: BoardsSource) => T,
    fresh: boolean,
  ): Promise<Answer<T>> {
    const dressed = (answer: Answer<T>, source: BoardsSource): Answer<T> =>
      answer.state === 'ok' ? { state: 'ok', value: present(answer.value, source) } : answer;
    return (async (): Promise<Answer<T>> => {
      let source: BoardsSource | null;
      try {
        source = await options.source();
      } catch {
        return { state: 'error' };
      }
      if (source === null) return { state: 'off' };
      const id = key(source);
      const held = kept.get(id);
      if (!fresh && held !== undefined) {
        const age = options.now() - held.at;
        if (age >= 0 && age < (held.answer.state === 'ok' ? keepMs : failMs)) return dressed(held.answer as Answer<T>, source);
      }
      const under = asking.get(id);
      if (under !== undefined) return dressed(await (under as Promise<Answer<T>>), source);
      const started = era;
      const ask = (async (): Promise<Answer<T>> => {
        try {
          const body = await source.request(run);
          if (body === SIGNED_OUT) return { state: 'out' };
          const value = parse(body);
          return value === null ? { state: 'error' } : { state: 'ok', value };
        } catch (error) {
          return { state: failure(error) };
        }
      })();
      asking.set(id, ask);
      try {
        const answer = await ask;
        if (started === era && answer.state !== 'out') keep(id, answer);
        return dressed(answer, source);
      } finally {
        if (asking.get(id) === ask) asking.delete(id);
      }
    })();
  }

  return {
    board(id, query = {}) {
      if (!isBoard(id)) return Promise.resolve({ state: 'error' });
      const limit = clamp(query.limit, 50, 1, ROWS_MAX);
      const offset = clamp(query.offset, 0, 0, 1_000_000);
      return read(
        () => `board:${id}:${limit}:${offset}`,
        (rest, session) => rest.rpc('leaderboard', { p_board: id, p_limit: limit, p_offset: offset }, session),
        (body) => (Array.isArray(body) ? parseBoard(body, offset).slice(0, limit) : null),
        marked,
        query.fresh === true,
      );
    },
    mine(id, fresh = false) {
      if (!isBoard(id)) return Promise.resolve({ state: 'error' });
      return read(
        (source) => `mine:${id}:${source.view.user?.id ?? ''}`,
        (rest, session) => (session === null ? Promise.resolve(SIGNED_OUT) : rest.rpc('leaderboard_me', { p_board: id }, session)),
        (body) => parseStanding(body),
        (value, source) => ({ ...value, name: nameOf(source.view.name) }),
        fresh,
      );
    },
    course(id, query = {}) {
      if (typeof id !== 'string' || !COURSE_ID.test(id)) return Promise.resolve({ state: 'error' });
      const limit = clamp(query.limit, 10, 1, ROWS_MAX);
      return read(
        () => `course:${id}:${limit}`,
        (rest, session) => rest.rpc('course_board', { p_course: id, p_limit: limit }, session),
        (body) => (Array.isArray(body) ? parseCourse(body).slice(0, limit) : null),
        marked,
        query.fresh === true,
      );
    },
    forget() {
      era++;
      kept.clear();
    },
  };
}
