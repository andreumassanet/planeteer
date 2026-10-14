// The first question about the relief freezes it: the flatten and detail sites
// can no longer be set, and the derived tables (valley levels, pad heights) are
// built. The terrain entry registers what "building" means.

let started = false;
let begin: (() => void) | null = null;

/** Registers the one-time setup run by the first relief query. */
export function onFirstQuery(setup: () => void): void {
  begin = setup;
}

/** Whether a relief question has been asked. */
export function queriesStarted(): boolean {
  return started;
}

/** Runs the one-time setup on the first call. */
export function ensureQueries(): void {
  if (started) return;
  started = true;
  begin?.();
}
