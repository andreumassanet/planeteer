/**
 * The account, once the page has one to offer: signing in and out, and the
 * profile kept in step between this device and the account's row.
 *
 * On sign-in the row is read (made if there is none, under the device's name
 * or a free variant of it), merged with what the device holds, and the merge
 * written both ways. After that a change on the device is noticed on a timer
 * and sent a few seconds later; going away sends what is left; coming back
 * to the tab after a while reads the row again. A network that is down costs
 * nothing: the device keeps everything and the next attempt sends it.
 */
import { AuthError } from './auth.ts';
import type { Auth, AccountUser, Session } from './auth.ts';
import { PASSPORT_KEY, serialisePassport } from '../passport.ts';
import type { PassportData } from '../passport.ts';
import { RINGS_KEY, serialiseRecord } from '../rings/store.ts';
import type { RingRecord } from '../rings/store.ts';
import {
  CHANGES_KEY, accountName, emptyProfile, localSignature, mergeProfiles, profileFromRow, profileKey, progressOf,
  readLocalProfile, writeLocalProfile,
} from './profile.ts';
import type { Profile, ProfileStorage } from './profile.ts';
import { NAME_KEY } from '../peers/constants.ts';
import { TAKEN } from './rest.ts';
import type { ProfileRow, Rest, RowWrite } from './rest.ts';

/** How often the device's stores are looked at for a change. */
const WATCH_MS = 4_000;
/** How long after a change it is sent, so a run of them goes as one. */
const SEND_AFTER_MS = 3_000;
/** Back on the tab after this long, the row is read again. */
const PULL_AFTER_MS = 60_000;
/** After a failure, the next attempt: doubling between these. */
const RETRY_MS = [15_000, 300_000] as const;
/** Names tried for a new row before it is made with none. */
const NAME_TRIES = 6;

export type Role = 'player' | 'mod' | 'owner';

/** What the account panels show. */
export interface AccountView {
  state: 'out' | 'opening' | 'in';
  user: AccountUser | null;
  /** The account's name, `''` until it has one. */
  name: string;
  /** Read for a later use: nothing shows it to anyone yet. */
  role: Role;
  sync: 'idle' | 'saving' | 'saved' | 'offline';
  /** A line for the player: a refusal, a taken name. `''` for none. */
  message: string;
}

/** What is live in the game, told when the account changes something under it. */
export interface AccountLive {
  passport?: { absorb(other: PassportData): void };
  rings?: { absorb(other: RingRecord): void };
  minimap?: { invalidate(): void };
  /** The name the others see changed: rename on the relay, redraw the plate. */
  name?(name: string): void;
  /** The look changed, as its wire code. */
  look?(code: string): void;
  /** A short notice in the world, if there is one up. */
  notice?(text: string): void;
}

export type RenameResult = 'ok' | 'taken' | 'invalid' | 'offline';

export interface Account {
  readonly view: AccountView;
  onChange(listener: (view: AccountView) => void): () => void;
  attach(live: AccountLive): void;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  /**
   * Deletes the account and everything kept with it on the server, then signs
   * out; what this device keeps stays. False when the server could not be reached.
   */
  deleteAccount(): Promise<boolean>;
  /**
   * Empties the passport and the rings, on this device and, signed in, on the
   * account too. False when the account could not be reached; the device's
   * copy is left as it was then.
   */
  resetProgress(): Promise<boolean>;
  rename(name: string): Promise<RenameResult>;
  /** The page came back from the auth server. */
  returned(back: { code: string } | { error: string }): Promise<void>;
  /** Reads the row, merges and writes both ways. */
  sync(): Promise<void>;
  dispose(): void;
}

export interface AccountOptions {
  auth: Auth;
  rest: Rest;
  storage: ProfileStorage | null;
  now(): number;
  /** Where the browser goes to sign in, and the address to come back to. */
  go(url: string): void;
  returnUrl(): string;
  /** Off in the headless check: no timers, no page events. */
  watch?: boolean;
}

const roleOf = (value: unknown): Role => (value === 'mod' || value === 'owner' ? value : 'player');

/** Names to try for a new row: the device's, the Discord one, then numbered variants of the first. */
export function nameCandidates(local: string, handle: string, random: () => number): string[] {
  const first = accountName(local) || accountName(handle);
  if (first === '') return [];
  const stem = first.slice(0, 15).trim();
  const out = [first];
  for (let n = 2; out.length < NAME_TRIES - 1; n++) out.push(`${stem} ${n}`);
  out.push(`${stem} ${String(1000 + Math.floor(random() * 9000))}`);
  return [...new Set(out)];
}

export function createAccount(options: AccountOptions): Account {
  const { auth, rest, storage, now } = options;
  const listeners = new Set<(view: AccountView) => void>();
  const live: AccountLive = {};
  const view: AccountView = {
    state: auth.session === null ? 'out' : 'in',
    user: auth.session?.user ?? null,
    name: '',
    role: 'player',
    sync: 'idle',
    message: '',
  };
  /** The row as last read or written, merged. */
  let remote: Profile | null = null;
  let signature = '';
  let lastPull = 0;
  let running: Promise<void> | null = null;
  let again = false;
  let sendTimer: ReturnType<typeof setTimeout> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let retryMs: number = RETRY_MS[0];
  let taken = '';

  const tell = (): void => {
    for (const listener of listeners) listener(view);
  };
  const set = (patch: Partial<AccountView>): void => {
    Object.assign(view, patch);
    tell();
  };

  auth.onChange = (session) => {
    if (session === null) {
      remote = null;
      set({ state: 'out', user: null, name: '', role: 'player', sync: 'idle' });
    } else if (view.user?.id !== session.user.id) {
      set({ state: 'in', user: session.user });
    }
  };

  /** Writes a profile to the device and tells whatever is live. */
  function apply(profile: Profile): void {
    const written = writeLocalProfile(storage, profile);
    if (written.name) live.name?.(profile.name);
    if (written.look) live.look?.(profile.look);
    if (written.passport) live.passport?.absorb(profile.passport);
    if (written.rings) {
      live.rings?.absorb(profile.rings);
      live.minimap?.invalidate();
    }
  }

  function rowWrite(profile: Profile, against: Profile | null): RowWrite {
    const row: RowWrite = { progress: progressOf(profile) };
    if (profile.name !== '' && profile.name !== against?.name) row.name = profile.name;
    if (profile.look !== '' && profile.look !== against?.look) row.look = profile.look;
    return row;
  }

  async function create(session: Session, local: Profile): Promise<ProfileRow | null> {
    for (const name of nameCandidates(local.name, session.user.handle, Math.random)) {
      const profile: Profile = { ...local, name, nameAt: now() };
      try {
        return await rest.create(session, { name, look: local.look || null, progress: progressOf(profile) });
      } catch (error) {
        if (!(error instanceof AuthError) || error.status !== TAKEN) throw error;
        // Taken, or the row was made a moment ago by another tab.
        const row = await rest.read(session);
        if (row !== null) return row;
      }
    }
    return rest.create(session, { name: null, look: local.look || null, progress: progressOf(local) });
  }

  async function once(): Promise<void> {
    const session = await auth.current();
    if (session === null) return;
    set({ sync: 'saving' });
    let row = await rest.read(session);
    const local = readLocalProfile(storage, now());
    row ??= await create(session, local);
    if (row === null) throw new AuthError(500, 'no profile row');
    let read = profileFromRow(row);
    let merged = mergeProfiles(local, read);
    if (profileKey(merged) !== profileKey(read)) {
      try {
        row = await rest.merge(session, rowWrite(merged, read));
      } catch (error) {
        if (!(error instanceof AuthError) || error.status !== TAKEN) throw error;
        // The device's name is someone else's: the account keeps its own.
        taken = merged.name;
        merged = { ...merged, name: read.name, nameAt: read.nameAt };
        row = await rest.merge(session, rowWrite(merged, read));
      }
      if (row !== null) {
        read = profileFromRow(row);
        // What another device sent meanwhile came back folded in.
        merged = mergeProfiles(merged, read);
      }
    }
    apply(merged);
    remote = merged;
    signature = localSignature(storage);
    lastPull = now();
    retryMs = RETRY_MS[0];
    const message = taken === '' ? '' : `“${taken}” is taken. You are still ${merged.name || 'without a name'}.`;
    if (taken !== '') live.notice?.(message);
    taken = '';
    set({ name: read.name, role: roleOf(row?.role), sync: 'saved', message });
  }

  function retryLater(): void {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => void account.sync(), retryMs);
    retryMs = Math.min(RETRY_MS[1], retryMs * 2);
  }

  const watching = options.watch !== false && typeof window !== 'undefined';
  function onVisibility(): void {
    if (document.visibilityState === 'hidden') sendNow();
    else if (now() - lastPull > PULL_AFTER_MS) void account.sync();
  }
  /** Whatever changed since the last write, sent as the page goes, without waiting. */
  function sendNow(): void {
    const session = auth.session;
    if (session === null || remote === null || now() >= session.expiresAt) return;
    if (localSignature(storage) === signature) return;
    const merged = mergeProfiles(readLocalProfile(storage, now()), remote);
    if (profileKey(merged) === profileKey(remote)) return;
    rest.send(session, rowWrite(merged, remote));
  }
  const watchTimer = watching
    ? setInterval(() => {
      if (view.state !== 'in' || running !== null || localSignature(storage) === signature) return;
      clearTimeout(sendTimer);
      sendTimer = setTimeout(() => void account.sync(), SEND_AFTER_MS);
    }, WATCH_MS)
    : undefined;
  /** Back from Discord by the browser's back button: the page was kept as it was left. */
  function onPageShow(event: PageTransitionEvent): void {
    if (event.persisted && view.state === 'opening') set({ state: auth.session === null ? 'out' : 'in' });
  }
  if (watching) {
    document.addEventListener('visibilitychange', onVisibility);
    addEventListener('pagehide', sendNow);
    addEventListener('pageshow', onPageShow);
  }

  const account: Account = {
    view,
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    attach(next) {
      Object.assign(live, next);
    },
    async signIn() {
      set({ state: 'opening', message: '' });
      try {
        options.go(await auth.authorizeUrl(options.returnUrl()));
      } catch {
        set({ state: 'out', message: 'Could not reach Discord. Try again in a moment.' });
      }
    },
    async signOut() {
      clearTimeout(sendTimer);
      sendNow();
      await auth.signOut();
      // The name was the account's; the device is a guest again. The progress stays.
      try {
        storage?.setItem(NAME_KEY, '');
        storage?.setItem(CHANGES_KEY, '');
      } catch {
        // Kept for this visit.
      }
      live.name?.('');
      set({ state: 'out', user: null, name: '', role: 'player', sync: 'idle', message: '' });
    },
    async deleteAccount() {
      clearTimeout(sendTimer);
      try {
        const session = await auth.current();
        if (session !== null) await rest.deleteAccount(session);
      } catch {
        set({ message: 'Could not reach the server. Nothing was deleted; try again.' });
        return false;
      }
      await account.signOut();
      set({ message: 'Your account and everything kept with it are deleted.' });
      return true;
    },
    async resetProgress() {
      clearTimeout(sendTimer);
      const empty = emptyProfile();
      try {
        const session = await auth.current();
        if (session !== null) await rest.replaceProgress(session, progressOf(empty));
      } catch {
        set({ message: 'Could not reach the server. Nothing was reset; try again.' });
        return false;
      }
      try {
        storage?.setItem(PASSPORT_KEY, serialisePassport(empty.passport));
        storage?.setItem(RINGS_KEY, serialiseRecord(empty.rings));
      } catch {
        return false;
      }
      if (remote !== null) remote = { ...remote, passport: empty.passport, rings: empty.rings };
      signature = localSignature(storage);
      return true;
    },
    async rename(raw) {
      const name = accountName(raw);
      if (name === '' || name !== raw.trim()) return 'invalid';
      if (name === view.name) return 'ok';
      try {
        storage?.setItem(NAME_KEY, name);
      } catch {
        return 'offline';
      }
      await account.sync();
      if (view.sync === 'offline') return 'offline';
      if (view.name !== name) return 'taken';
      live.name?.(name);
      return 'ok';
    },
    async returned(back) {
      if ('error' in back) {
        set({ state: 'out', message: back.error === 'access_denied' ? 'Sign-in was cancelled.' : 'Sign-in did not finish. Try again.' });
        return;
      }
      set({ state: 'opening', message: '' });
      try {
        await auth.exchange(back.code);
      } catch {
        set({ state: 'out', message: 'Sign-in did not finish. Try again.' });
        return;
      }
      set({ state: 'in', user: auth.session?.user ?? null });
      await account.sync();
    },
    sync() {
      if (running !== null) {
        again = true;
        return running;
      }
      clearTimeout(retryTimer);
      running = (async () => {
        do {
          again = false;
          try {
            await once();
          } catch {
            // A refusal of the token signs out (`auth.current`); anything else is tried again later.
            if (auth.session !== null) {
              set({ sync: 'offline' });
              if (watching) retryLater();
            }
            break;
          }
        } while (again);
      })().finally(() => {
        running = null;
      });
      return running;
    },
    dispose() {
      clearInterval(watchTimer);
      clearTimeout(sendTimer);
      clearTimeout(retryTimer);
      if (watching) {
        document.removeEventListener('visibilitychange', onVisibility);
        removeEventListener('pagehide', sendNow);
        removeEventListener('pageshow', onPageShow);
      }
      listeners.clear();
    },
  };
  return account;
}
