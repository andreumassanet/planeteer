/**
 * Signing in with Discord through the project's auth server (GoTrue), by
 * PKCE, with nothing but `fetch`. The session (both tokens, the expiry and
 * who it is) is kept under `SESSION_KEY` and nowhere else, refreshed a minute
 * before it expires, and never written to the console.
 */
import { SESSION_KEY } from './keys.ts';
import { VALID_VERIFIER, codeChallenge, codeVerifier } from './pkce.ts';

export { SESSION_KEY };
/** The verifier between leaving for Discord and coming back, in this tab's session store. */
export const VERIFIER_KEY = 'atlas.account.verifier';
/** How long before its expiry a token is refreshed. */
export const REFRESH_AHEAD_MS = 60_000;

export interface AccountUser {
  id: string;
  /** What Discord calls them, for proposing a name. */
  handle: string;
  /** Their Discord picture, or `''`. */
  avatar: string;
}

export interface Session {
  access: string;
  refresh: string;
  /** ms since the epoch. */
  expiresAt: number;
  user: AccountUser;
}

export interface AuthConfig {
  url: string;
  key: string;
}

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export type KeyStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9\-_.~+/=]{8,4096}$/;
const AVATAR = /^https:\/\/cdn\.discordapp\.com\/[A-Za-z0-9/_.\-?=&]{1,200}$/;

/** The user a GoTrue response describes, or null. */
export function userOf(raw: unknown): AccountUser | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { id, user_metadata: meta } = raw as { id?: unknown; user_metadata?: unknown };
  if (typeof id !== 'string' || !UUID.test(id)) return null;
  const data = typeof meta === 'object' && meta !== null ? (meta as Record<string, unknown>) : {};
  const claims = typeof data.custom_claims === 'object' && data.custom_claims !== null ? (data.custom_claims as Record<string, unknown>) : {};
  const handle = [claims.global_name, data.full_name, data.name, data.user_name].find((value) => typeof value === 'string' && value.trim() !== '');
  const avatar = typeof data.avatar_url === 'string' && AVATAR.test(data.avatar_url) ? data.avatar_url : '';
  return { id: id.toLowerCase(), handle: typeof handle === 'string' ? handle.trim().slice(0, 64) : '', avatar };
}

/** A session as stored, or null for anything that is not one. */
export function parseSession(stored: string | null | undefined): Session | null {
  if (typeof stored !== 'string' || stored === '') return null;
  let raw: unknown;
  try {
    raw = JSON.parse(stored);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const { access, refresh, expiresAt, user } = raw as Record<string, unknown>;
  if (typeof access !== 'string' || !TOKEN.test(access) || typeof refresh !== 'string' || !TOKEN.test(refresh)) return null;
  if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) return null;
  const who = userOf({ id: (user as { id?: unknown } | null)?.id, user_metadata: { full_name: (user as { handle?: unknown } | null)?.handle, avatar_url: (user as { avatar?: unknown } | null)?.avatar } });
  return who === null ? null : { access, refresh, expiresAt, user: who };
}

/** A token response as a session, or null. `now` is when it was asked for. */
export function sessionOf(raw: unknown, now: number): Session | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const body = raw as Record<string, unknown>;
  const user = userOf(body.user);
  const access = body.access_token;
  const refresh = body.refresh_token;
  if (user === null || typeof access !== 'string' || !TOKEN.test(access) || typeof refresh !== 'string' || !TOKEN.test(refresh)) return null;
  const expiresIn = typeof body.expires_in === 'number' && body.expires_in > 0 ? body.expires_in : 3600;
  return { access, refresh, expiresAt: now + expiresIn * 1000, user };
}

/** What to do with a session at `now`: use it, refresh it first, or there is none. */
export function sessionState(session: Session | null, now: number): 'none' | 'fresh' | 'refresh' {
  if (session === null) return 'none';
  return now < session.expiresAt - REFRESH_AHEAD_MS ? 'fresh' : 'refresh';
}

/** A response's failure, for the caller to tell a refusal from a network that is down. */
export class AuthError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface Auth {
  readonly session: Session | null;
  /** Where to send the browser to sign in; keeps the verifier for the return. */
  authorizeUrl(redirectTo: string): Promise<string>;
  /** The code the auth server came back with, for a session. */
  exchange(code: string): Promise<Session>;
  /**
   * A session good for a minute at least, refreshed if it is not, or null
   * when signed out. A refusal signs out; a network error throws and keeps it.
   */
  current(): Promise<Session | null>;
  signOut(): Promise<void>;
  /** Told whenever the session is set or cleared. */
  onChange: ((session: Session | null) => void) | null;
}

export interface AuthOptions {
  config: AuthConfig;
  fetch: Fetch;
  /** The session's store: the device's `localStorage`. */
  storage: KeyStore | null;
  /** The verifier's store: this tab's `sessionStorage`. */
  tabStorage: KeyStore | null;
  now(): number;
  random?: (bytes: Uint8Array) => Uint8Array;
}

export function createAuth(options: AuthOptions): Auth {
  const { config, storage, tabStorage, now } = options;
  const base = config.url.replace(/\/+$/, '');

  const readStored = (): Session | null => {
    try {
      return parseSession(storage?.getItem(SESSION_KEY));
    } catch {
      return null;
    }
  };
  let session = readStored();
  let refreshing: Promise<Session | null> | null = null;

  function keep(next: Session | null): void {
    session = next;
    try {
      if (next === null) storage?.removeItem(SESSION_KEY);
      else storage?.setItem(SESSION_KEY, JSON.stringify(next));
    } catch {
      // Not kept: signed in for this visit.
    }
    auth.onChange?.(next);
  }

  async function post(path: string, body: unknown, bearer?: string): Promise<unknown> {
    const headers: Record<string, string> = { apikey: config.key, 'Content-Type': 'application/json' };
    if (bearer !== undefined) headers.Authorization = `Bearer ${bearer}`;
    const response = await options.fetch(`${base}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!response.ok) throw new AuthError(response.status, `auth answered ${response.status}`);
    const text = await response.text();
    return text === '' ? null : (JSON.parse(text) as unknown);
  }

  async function refresh(held: Session): Promise<Session | null> {
    try {
      const next = sessionOf(await post('/auth/v1/token?grant_type=refresh_token', { refresh_token: held.refresh }), now());
      if (next === null) throw new AuthError(500, 'auth answered with no session');
      keep(next);
      return next;
    } catch (error) {
      if (!(error instanceof AuthError) || error.status >= 500) throw error;
      // Another tab may have spent the same refresh token a moment ago: its session is in the store.
      const stored = readStored();
      if (stored !== null && stored.refresh !== held.refresh && sessionState(stored, now()) === 'fresh') {
        session = stored;
        return stored;
      }
      keep(null);
      return null;
    }
  }

  const auth: Auth = {
    get session() {
      return session;
    },
    async authorizeUrl(redirectTo) {
      const verifier = codeVerifier(options.random);
      try {
        tabStorage?.setItem(VERIFIER_KEY, verifier);
      } catch {
        // Without it the return cannot be exchanged; the sign-in fails there, not here.
      }
      const query = new URLSearchParams({
        provider: 'discord',
        redirect_to: redirectTo,
        code_challenge: await codeChallenge(verifier),
        code_challenge_method: 's256',
      });
      return `${base}/auth/v1/authorize?${query.toString()}`;
    },
    async exchange(code) {
      let verifier: string | null = null;
      try {
        verifier = tabStorage?.getItem(VERIFIER_KEY) ?? null;
        tabStorage?.removeItem(VERIFIER_KEY);
      } catch {
        verifier = null;
      }
      if (verifier === null || !VALID_VERIFIER.test(verifier)) throw new AuthError(400, 'no sign-in was started in this tab');
      const next = sessionOf(await post('/auth/v1/token?grant_type=pkce', { auth_code: code, code_verifier: verifier }), now());
      if (next === null) throw new AuthError(500, 'auth answered with no session');
      keep(next);
      return next;
    },
    async current() {
      // Another tab may have signed in, refreshed or signed out since.
      const stored = readStored();
      if (stored === null && session !== null) keep(null);
      else if (stored !== null && (session === null || stored.expiresAt > session.expiresAt)) session = stored;
      const state = sessionState(session, now());
      if (state !== 'refresh') return session;
      refreshing ??= refresh(session!).finally(() => {
        refreshing = null;
      });
      return refreshing;
    },
    async signOut() {
      const held = session ?? readStored();
      keep(null);
      if (held === null) return;
      try {
        await post('/auth/v1/logout', {}, held.access);
      } catch {
        // Signed out here either way; the token expires on its own.
      }
    },
    onChange: null,
  };
  return auth;
}
