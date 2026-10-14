import { resolve } from 'node:path';

export let failures = 0;
export const fail = (message: string): void => {
  failures++;
  console.log(`  FAIL  ${message}`);
};

export const ROOT = resolve(import.meta.dirname, '../..');
export const only = process.argv[2];
