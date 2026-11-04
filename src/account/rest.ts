/**
 * The `profiles` table through the project's REST endpoint (PostgREST), with
 * nothing but `fetch`. A row is created once by a plain insert; after that a
 * device's progress is folded in by `merge_profile` (`supabase/schema.sql`),
 * which merges on the server in one locked step, so two devices writing at
 * once both keep what they sent. `rpc` calls any other function there, as
 * the player or as a visitor (the leaderboards).
 */
import { AuthError } from './auth.ts';
import type { AuthConfig, Fetch, Session } from './auth.ts';

/** A row as read back: the player's own to write, so nothing in it is trusted yet. */
export interface ProfileRow {
  name: unknown;
  look: unknown;
  /** `player`, `mod` or `owner`; read for a later use, never written. */
  role: unknown;
  progress: unknown;
}

export interface RowWrite {
  name?: string | null;
  look?: string | null;
  progress?: Record<string, unknown>;
}

/** Postgres' unique violation: the name is someone else's. */
export const TAKEN = 409;

/** The largest body sent while the page is going away (`keepalive` allows 64 KB). */
const KEEPALIVE_MAX = 60_000;

const COLUMNS = 'name,look,role,progress';

/** A function the endpoint may be asked to run: its name, nothing else. */
const RPC_NAME = /^[a-z_][a-z0-9_]{0,62}$/;
/** The most of an answer read: the boards answer a few KB. */
const ANSWER_MAX = 1_000_000;

/** `merge_profile`'s arguments: an empty name or look keeps the row's. */
const mergeBody = (row: RowWrite): Record<string, unknown> => ({
  p_name: row.name ?? '',
  p_look: row.look ?? '',
  p_progress: row.progress ?? {},
});

/** `listed` off the rows PostgREST answers, or null when there is none to read. */
function listedOf(body: unknown): boolean | null {
  const row = Array.isArray(body) ? (body[0] as unknown) : null;
  const listed = typeof row === 'object' && row !== null ? (row as { listed?: unknown }).listed : null;
  return typeof listed === 'boolean' ? listed : null;
}

export function createRest(config: AuthConfig, fetch: Fetch) {
  const root = `${config.url.replace(/\/+$/, '')}/rest/v1`;
  const base = `${root}/profiles`;
  const headers = (session: Session, extra: Record<string, string> = {}): Record<string, string> => ({
    apikey: config.key,
    Authorization: `Bearer ${session.access}`,
    'Content-Type': 'application/json',
    ...extra,
  });
  const mine = (session: Session): string => `id=eq.${encodeURIComponent(session.user.id)}`;
  /** A visitor's headers: the publishable key alone, which the gateway answers as `anon`. */
  const visitor = (): Record<string, string> => ({ apikey: config.key, 'Content-Type': 'application/json' });

  async function rows(response: Response): Promise<ProfileRow | null> {
    if (!response.ok) throw new AuthError(response.status, `profiles answered ${response.status}`);
    const body = (await response.json()) as unknown;
    const row = Array.isArray(body) ? (body[0] as unknown) : null;
    return typeof row === 'object' && row !== null ? (row as ProfileRow) : null;
  }

  return {
    async read(session: Session): Promise<ProfileRow | null> {
      return rows(await fetch(`${base}?${mine(session)}&select=${COLUMNS}`, { headers: headers(session) }));
    },
    async create(session: Session, row: RowWrite): Promise<ProfileRow | null> {
      return rows(await fetch(`${base}?select=${COLUMNS}`, {
        method: 'POST',
        headers: headers(session, { Prefer: 'return=representation' }),
        body: JSON.stringify({ id: session.user.id, ...row }),
      }));
    },
    /** Folds `row` into the player's row on the server and answers the row as it now stands. */
    async merge(session: Session, row: RowWrite): Promise<ProfileRow | null> {
      return rows(await fetch(`${root}/rpc/merge_profile`, {
        method: 'POST',
        headers: headers(session),
        body: JSON.stringify(mergeBody(row)),
      }));
    },
    /** Deletes the signed-in player's account and, with it, their profile (`delete_my_account` in `supabase/schema.sql`). */
    async deleteAccount(session: Session): Promise<void> {
      const response = await fetch(`${root}/rpc/delete_my_account`, { method: 'POST', headers: headers(session), body: '{}' });
      if (!response.ok) throw new AuthError(response.status, `deleting the account answered ${response.status}`);
    },
    /**
     * Replaces the progress on the player's own row: a reset, the one write
     * that is not a merge, since a merge never loses anything.
     */
    async replaceProgress(session: Session, progress: RowWrite['progress']): Promise<void> {
      const response = await fetch(`${base}?${mine(session)}`, {
        method: 'PATCH',
        headers: headers(session),
        body: JSON.stringify({ progress }),
      });
      if (!response.ok) throw new AuthError(response.status, `resetting the progress answered ${response.status}`);
    },
    /**
     * Runs `fn` on the endpoint (`/rest/v1/rpc/<fn>`) and answers its JSON, or
     * null for an empty answer: as the player when a session is given, else as
     * a visitor. Throws an `AuthError` for a refusal and whatever `fetch` throws.
     */
    async rpc(fn: string, args: Record<string, unknown>, session: Session | null = null): Promise<unknown> {
      if (!RPC_NAME.test(fn)) throw new AuthError(400, 'not a function name');
      const response = await fetch(`${root}/rpc/${fn}`, {
        method: 'POST',
        headers: session === null ? visitor() : headers(session),
        body: JSON.stringify(args),
      });
      if (!response.ok) throw new AuthError(response.status, `${fn} answered ${response.status}`);
      const text = await response.text();
      if (text.length > ANSWER_MAX) throw new AuthError(502, `${fn} answered too much`);
      return text === '' ? null : (JSON.parse(text) as unknown);
    },
    /** Whether the player shows on the leaderboards, off their own row; null when the row has no say. */
    async readListed(session: Session): Promise<boolean | null> {
      const response = await fetch(`${base}?${mine(session)}&select=listed`, { headers: headers(session) });
      if (!response.ok) throw new AuthError(response.status, `profiles answered ${response.status}`);
      return listedOf(await response.json());
    },
    /** Shows or hides the player on the leaderboards; answers what the row now holds, null when there is no row yet. */
    async setListed(session: Session, listed: boolean): Promise<boolean | null> {
      const response = await fetch(`${base}?${mine(session)}&select=listed`, {
        method: 'PATCH',
        headers: headers(session, { Prefer: 'return=representation' }),
        body: JSON.stringify({ listed }),
      });
      if (!response.ok) throw new AuthError(response.status, `showing on the leaderboards answered ${response.status}`);
      return listedOf(await response.json());
    },
    /** A last write as the page goes; nothing waits for it, and one too large is left to the next visit. */
    send(session: Session, row: RowWrite): void {
      const body = JSON.stringify(mergeBody(row));
      if (body.length > KEEPALIVE_MAX) return;
      fetch(`${root}/rpc/merge_profile`, { method: 'POST', headers: headers(session), body, keepalive: true }).catch(() => {});
    },
  };
}

export type Rest = ReturnType<typeof createRest>;
