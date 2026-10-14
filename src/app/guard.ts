/**
 * Runs one subsystem's per-frame update so that a throw cannot take the
 * frame down with it: the first failure of each is logged, later ones are
 * counted on `atlas.failures`, and the rest of the frame carries on. Each
 * guarded update's cost is smoothed over about a second for `atlas.timings()`.
 */

export interface Guard {
  guard(name: string, run: () => void): void;
  failures: Map<string, number>;
  timings: Map<string, number>;
}

export function createGuard(): Guard {
  const failures = new Map<string, number>();
  const timings = new Map<string, number>();
  function guard(name: string, run: () => void): void {
    const began = performance.now();
    try {
      run();
      const spent = performance.now() - began;
      const was = timings.get(name);
      timings.set(name, was === undefined ? spent : was + (spent - was) * 0.05);
    } catch (error) {
      const count = failures.get(name) ?? 0;
      if (count === 0) console.error(`atlas: ${name} failed, and the rest of the world carries on`, error);
      failures.set(name, count + 1);
    }
  }
  return { guard, failures, timings };
}
