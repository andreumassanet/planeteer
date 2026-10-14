import { createSceneryContext } from '../../src/scenery/contract.ts';

export const ctx = createSceneryContext();
export const SAMPLES = Number(process.argv[2] ?? 150);

/** What fails the run: a contract violation or a rebuild that disagreed with itself exits non-zero. */
export let failures = 0;
export const fail = (what: string): void => {
  failures++;
  console.log(`  FAIL ${what}`);
};
