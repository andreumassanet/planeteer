/**
 * What the traveller has earned to wear, read off this device's records:
 * what the traveller's card asks on the title screen, before the game (and
 * its progression) has arrived. Once it has, `app.unlocked` answers instead.
 */
import type { App } from './context.ts';

/** How long one answer is kept, ms: the card asks it on every redraw. */
const KEEP_MS = 2000;

export function earnedHere(app: App): () => ReadonlySet<string> | undefined {
  let made: (() => ReadonlySet<string>) | null = null;
  let kept: ReadonlySet<string> | null = null;
  let keptAt = -Infinity;
  void Promise.all([
    import('../cosmetics.ts'),
    import('../progress.ts'),
    import('../passport.ts'),
    import('../rings/store.ts'),
    import('../jobs/store.ts'),
  ]).then(([cosmetics, progress, passport, rings, jobs]) => {
    made = () => {
      let stored: string | null = null;
      try {
        stored = localStorage.getItem(passport.PASSPORT_KEY);
      } catch {
        stored = null;
      }
      const summary = progress.summaryOf({
        passport: passport.parsePassport(stored),
        rings: rings.readRecord(rings.deviceStore()),
        jobs: jobs.readJobs(jobs.deviceJobStore()),
        career: progress.readCareer(progress.deviceCareerStore()),
      });
      return cosmetics.unlockedOf(summary);
    };
  });
  return () => {
    const live = app.unlocked?.();
    if (live !== undefined) return live;
    if (made === null) return undefined;
    const now = performance.now();
    if (kept === null || now - keptAt > KEEP_MS) {
      kept = made();
      keptAt = now;
    }
    return kept;
  };
}
