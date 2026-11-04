/**
 * The page's own boards, read through its account (`accountSeam`): one for
 * the whole page, whatever world it shows. Without accounts in this build
 * every read answers `off`.
 */
import { accountSeam } from '../account.ts';
import { createLeaderboards } from './client.ts';
import type { Leaderboards } from './client.ts';

let shared: Leaderboards | null = null;

/** Whether this build has accounts, and so boards to show. */
export function leaderboardsAvailable(): boolean {
  return accountSeam() !== null;
}

export function leaderboards(): Leaderboards {
  shared ??= createLeaderboards({
    source: async () => {
      const seam = accountSeam();
      return seam === null ? null : seam.load();
    },
    now: () => Date.now(),
  });
  return shared;
}
