/** The account made against the browser: its stores, its `fetch`, its address. */
import { createAccount } from './account.ts';
import type { Account } from './account.ts';
import { createAuth } from './auth.ts';
import type { AuthConfig, KeyStore } from './auth.ts';
import { createRest } from './rest.ts';

function store(get: () => Storage): KeyStore | null {
  try {
    return get();
  } catch {
    return null;
  }
}

export function startAccount(config: AuthConfig, returnUrl: () => string): Account {
  const fetcher = (input: string, init?: RequestInit): Promise<Response> => fetch(input, init);
  const storage = store(() => localStorage);
  const auth = createAuth({ config, fetch: fetcher, storage, tabStorage: store(() => sessionStorage), now: Date.now });
  return createAccount({
    auth,
    rest: createRest(config, fetcher),
    storage,
    now: Date.now,
    go: (url) => location.assign(url),
    returnUrl,
  });
}
