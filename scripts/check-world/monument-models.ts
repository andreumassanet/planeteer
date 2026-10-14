/**
 * The monument model files, imported in Node.
 *
 * `src/monuments/index.ts` collects them with Vite's `import.meta.glob`, which
 * Node lacks, so the directory is listed and each file imported directly.
 */
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Monument } from '../../src/monuments/contract.ts';
import { here } from './harness.ts';

export const modelDir = resolve(here, '../src/monuments');

/** Whether a file in `src/monuments/` is a model rather than the contract or the registry. */
export const isModelFile = (file: string): boolean =>
  file.endsWith('.ts') && file !== 'contract.ts' && file !== 'index.ts';

/** Every model, in file-name order. */
export async function loadMonumentModels(): Promise<Monument[]> {
  const models: Monument[] = [];
  for (const file of readdirSync(modelDir).sort()) {
    if (!isModelFile(file)) continue;
    const module = (await import(`../../src/monuments/${file}`)) as Record<string, unknown>;
    const model = Object.values(module).find(
      (value): value is Monument => typeof (value as Monument | undefined)?.build === 'function' && typeof (value as Monument).id === 'string',
    );
    if (model !== undefined) models.push(model);
  }
  return models;
}
