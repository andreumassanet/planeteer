/**
 * Every world that can be walked, by id, each behind its own `import()`.
 *
 * A table and not `import.meta.glob`, for two reasons. `scripts/check-worlds.ts`
 * runs in Node, where a glob does not exist, and this file is the one list both
 * the browser and the check read. And each world is its own chunk: entering
 * Mars fetches Mars and the engine, never Neptune.
 *
 * Every body has its row already, so a planet's author edits the planet's own
 * file and never this one. The Sun has none: there is nothing to stand on.
 */

import type { WorldSpec } from './contract.ts';
import { prepareWorldKit } from './kit.ts';

type Loader = () => Promise<{ WORLD: WorldSpec }>;

export const WORLDS: Readonly<Record<string, Loader>> = {
  mercury: () => import('./bodies/mercury.ts'),
  venus: () => import('./bodies/venus.ts'),
  moon: () => import('./bodies/moon.ts'),
  mars: () => import('./bodies/mars.ts'),
  jupiter: () => import('./bodies/jupiter.ts'),
  saturn: () => import('./bodies/saturn.ts'),
  uranus: () => import('./bodies/uranus.ts'),
  neptune: () => import('./bodies/neptune.ts'),
};

export const WORLD_IDS: readonly string[] = Object.keys(WORLDS);

/** The spec of a world, or an error naming what exists. */
export async function loadWorldSpec(id: string): Promise<WorldSpec> {
  const loader = WORLDS[id];
  if (loader === undefined) throw new Error(`there is no world '${id}' to walk (there are ${WORLD_IDS.join(', ')})`);
  const { WORLD } = await loader();
  if (WORLD.id !== id) throw new Error(`worlds/bodies/${id}.ts exports the world '${WORLD.id}'`);
  // The space kit the world is built from, in before the first town is
  // (`kit.ts`); a no-op headless, where a check hands the kit in itself.
  await prepareWorldKit(WORLD);
  return WORLD;
}
