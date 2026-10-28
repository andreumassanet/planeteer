/**
 * Optional accounts: the small part every load carries. It knows whether
 * this build has accounts at all (`VITE_SUPABASE_URL` and its publishable
 * key), takes the auth server's answer off the address as the page starts,
 * and loads the rest (`account/`) only when there is a session, an answer,
 * or a panel to show. Without the two values there are no accounts and no
 * button, and nothing here does anything.
 */
import type { Account, AccountLive } from './account/account.ts';
import { SESSION_KEY } from './account/keys.ts';

export type { Account, AccountLive, AccountView } from './account/account.ts';

/** Where an account panel stands: beside the title's buttons, or a page of Settings. */
export type AccountPlace = 'title' | 'settings';

export interface AccountSeam {
  /** The account, loaded on first ask. */
  load(): Promise<Account>;
  /** Builds a panel into `into`; `open` shows the settings' account page, for the title's chip. */
  mount(into: HTMLElement, place: AccountPlace, open?: () => void): void;
  /** Tells the account what is live in the game, now or once it has loaded. */
  attach(live: AccountLive): void;
}

/** The parameters the auth server comes back with, taken off the address. */
const RETURN_PARAMS = ['code', 'error', 'error_code', 'error_description'] as const;

function config(): { url: string; key: string } | null {
  const url = import.meta.env?.VITE_SUPABASE_URL?.trim() ?? '';
  const key = import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '';
  return /^https:\/\/[a-z0-9.-]+(:\d+)?\/?$/i.test(url) && key !== '' ? { url, key } : null;
}

/** The auth server's answer, if this load is one, with the address cleaned of it either way. */
function takeReturn(): { code: string } | { error: string } | null {
  const address = new URL(location.href);
  const code = address.searchParams.get('code');
  const error = address.searchParams.get('error');
  if (code === null && error === null) return null;
  for (const name of RETURN_PARAMS) address.searchParams.delete(name);
  history.replaceState(history.state, '', address.pathname + address.search + address.hash);
  if (code !== null && /^[A-Za-z0-9\-_.~]{6,512}$/.test(code)) return { code };
  return { error: error ?? 'invalid' };
}

/** The address to come back to: this one, without an earlier answer on it. */
function returnUrl(): string {
  const address = new URL(location.href);
  for (const name of RETURN_PARAMS) address.searchParams.delete(name);
  address.hash = '';
  return address.toString();
}

function hasSession(): boolean {
  try {
    return (localStorage.getItem(SESSION_KEY) ?? '') !== '';
  } catch {
    return false;
  }
}

let seam: AccountSeam | null | undefined;

/**
 * The page's accounts, or null when this build has none: one for the whole
 * page, whatever world it shows. The first call takes the auth server's
 * answer off the address, so the page makes it as it starts.
 */
export function accountSeam(): AccountSeam | null {
  if (seam === undefined) seam = createAccountSeam();
  return seam;
}

function createAccountSeam(): AccountSeam | null {
  const settings = config();
  if (settings === null) return null;
  const back = takeReturn();
  const pending: AccountLive = {};
  let loading: Promise<Account> | null = null;
  let loaded: Account | null = null;

  function load(): Promise<Account> {
    loading ??= import('./account/start.ts').then(({ startAccount }) => {
      loaded = startAccount(settings!, returnUrl);
      loaded.attach(pending);
      return loaded;
    });
    return loading;
  }

  if (back !== null) {
    load()
      .then((account) => account.returned(back))
      .catch((error: unknown) => console.warn('account: the sign-in did not finish', error instanceof Error ? error.message : ''));
  } else if (hasSession()) {
    load()
      .then((account) => account.sync())
      .catch(() => console.warn('account: not loaded'));
  }

  return {
    load,
    mount(into, place, open) {
      Promise.all([load(), import('./account/panel.ts')])
        .then(([account, { mountPanel }]) => mountPanel(account, into, place, open))
        .catch(() => console.warn('account: the panel did not load'));
    },
    attach(live) {
      Object.assign(pending, live);
      loaded?.attach(live);
    },
  };
}
