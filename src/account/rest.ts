/**
 * The `profiles` table through the project's REST endpoint (PostgREST), with
 * nothing but `fetch`. A row is created once by a plain insert; after that a
 * device's progress is folded in by `merge_profile` (`supabase/schema.sql`),
 * which merges on the server in one locked step, so two devices writing at
 * once both keep what they sent.
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

/** `merge_profile`'s arguments: an empty name or look keeps the row's. */
const mergeBody = (row: RowWrite): Record<string, unknown> => ({
  p_name: row.name ?? '',
  p_look: row.look ?? '',
  p_progress: row.progress ?? {},
});

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
    /** A last write as the page goes; nothing waits for it, and one too large is left to the next visit. */
    send(session: Session, row: RowWrite): void {
      const body = JSON.stringify(mergeBody(row));
      if (body.length > KEEPALIVE_MAX) return;
      fetch(`${root}/rpc/merge_profile`, { method: 'POST', headers: headers(session), body, keepalive: true }).catch(() => {});
    },
  };
}

export type Rest = ReturnType<typeof createRest>;
