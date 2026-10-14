/**
 * The baked kit read off disk for the headless checks. `src/kit.ts` runs in
 * Node given the file bytes and the globals `GLTFLoader` expects; this module
 * supplies both.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const g = globalThis as Record<string, unknown>;
g.ProgressEvent ??= class extends Event {
  constructor(type: string, init: Record<string, unknown> = {}) {
    super(type);
    Object.assign(this, init);
  }
};
g.self ??= globalThis;

const { modelsFrom, rigFrom } = await import('../src/kit.ts');
const { registerSceneryModels } = await import('../src/scenery/contract.ts');

const MODELS = resolve(import.meta.dirname, '../public/models');

/** Registers every baked vehicle, plant and rock with the kits, as `main.ts` does. */
export async function registerModelsFromDisk(): Promise<number> {
  const models = [
    ...(await modelsFrom(readFileSync(resolve(MODELS, 'traffic/kit.bin')))),
    ...(await modelsFrom(readFileSync(resolve(MODELS, 'nature/kit.bin')))),
    ...(await modelsFrom(readFileSync(resolve(MODELS, 'buildings/kit.bin')))),
  ];
  registerSceneryModels(models);
  return models.length;
}

/** One animal's rig, as `loadRig` would fetch it. */
export async function rigFromDisk(id: string, material: import('three').Material) {
  return rigFrom(readFileSync(resolve(MODELS, `fauna/${id}.bin`)), id, material);
}
