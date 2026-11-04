/** What every suite of `pnpm cosmetics` shares: the failure count, and the cast read off disk. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { OUTFITS, castMaterial, loadCast, type Cast } from '../../src/cast.ts';

/** What fails the run. */
export let failures = 0;
export const fail = (what: string): void => {
  failures++;
  console.log(`  FAIL ${what}`);
};

const PUBLIC = resolve(import.meta.dirname, '../../public');

/** Every outfit of the cast, loaded as the game loads it, from the baked files. */
export async function castFromDisk(): Promise<Cast> {
  const g = globalThis as Record<string, unknown>;
  const real = g.fetch;
  g.fetch = async (url: string) => {
    const bytes = readFileSync(resolve(PUBLIC, `.${String(url).replace(/^[^/]*\/\/[^/]*/, '')}`));
    return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  };
  try {
    return await loadCast(castMaterial(new THREE.Texture(), { thickness: 0.005, color: [0, 0, 0] }), OUTFITS);
  } finally {
    g.fetch = real;
  }
}

export const f3 = (n: number): string => n.toFixed(3);
