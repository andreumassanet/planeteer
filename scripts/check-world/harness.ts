/**
 * What every suite of `check-world.ts` shares: the pass/fail tally, the
 * scripts directory paths resolve against, and a textbook lat/lon conversion
 * that is deliberately written out here rather than imported from `src/`, so
 * it can witness `src/sphere.ts`.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Vector3 } from 'three';
import { PLANET_RADIUS } from '../../src/globe.ts';

/** The `scripts/` directory. */
export const here = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const DEG = Math.PI / 180;

/** A point on the planet's surface, from the textbook formula. */
export const at = (lat: number, lon: number): Vector3 =>
  new Vector3(
    Math.cos(lat * DEG) * Math.cos(lon * DEG),
    Math.sin(lat * DEG),
    -Math.cos(lat * DEG) * Math.sin(lon * DEG),
  ).multiplyScalar(PLANET_RADIUS);

let failures = 0;

export const check = (ok: boolean, label: string, detail = ''): void => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
};

export function failureCount(): number {
  return failures;
}
