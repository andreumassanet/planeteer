/**
 * The baked kit, read off disk for the headless checks.
 *
 * `src/kit.ts` is the browser's reader and it runs in Node too, given the file's
 * bytes and the three globals `GLTFLoader` reaches for. This module supplies
 * both, so a check builds the same vehicles and animals the world draws.
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

const { vehicleModelsFrom, rigFrom } = await import('../src/kit.ts');
const { registerVehicleModels } = await import('../src/traffic/contract.ts');

const MODELS = resolve(import.meta.dirname, '../public/models');

/** Registers every baked vehicle with the traffic kit, as `main.ts` does. */
export async function registerVehiclesFromDisk(): Promise<number> {
  const models = await vehicleModelsFrom(readFileSync(resolve(MODELS, 'traffic/kit.bin')));
  registerVehicleModels(models);
  return models.length;
}

/** One animal's rig, as `loadRig` would fetch it. */
export async function rigFromDisk(id: string, material: import('three').Material) {
  return rigFrom(readFileSync(resolve(MODELS, `fauna/${id}.bin`)), id, material);
}
