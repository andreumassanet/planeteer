/**
 * What the sward in `vegetation.ts` is made of: the baked models, how often
 * each grows and how tall. A module of its own and of nothing else, so
 * `pnpm scenery` can hold the list against the kit without importing the
 * streamer, which reaches a Vite-only glob through the scenery registry.
 */

/**
 * The clumps (KayKit Forest, single-sided), how often, and how tall in world
 * units. `far` is the clump a site of rank 1 or more draws instead, the same
 * shape at a third of the triangles: those are the sites still standing past
 * the first band, where a clump is a handful of pixels.
 */
export const SWARD_GRASS: readonly { id: string; far: string; weight: number; height: readonly [number, number] }[] = [
  { id: 'grass-1-a', far: 'grass-1-a', weight: 5, height: [1.5, 2.2] },
  { id: 'grass-1-b', far: 'grass-1-a', weight: 2, height: [1.5, 2.2] },
  { id: 'grass-2-a', far: 'grass-2-a', weight: 4, height: [2.0, 3.0] },
  { id: 'grass-2-b', far: 'grass-2-a', weight: 1.5, height: [2.0, 3.0] },
  { id: 'grass-1-c', far: 'grass-1-a', weight: 0.3, height: [1.6, 2.4] },
  { id: 'grass-2-c', far: 'grass-2-a', weight: 0.2, height: [2.2, 3.2] },
];
/** Kenney's flowers, a share of the sites where the grass is thick. */
export const SWARD_FLOWERS = ['flower-redA', 'flower-yellowA', 'flower-purpleA', 'flower-redC', 'flower-yellowC'] as const;
export const SWARD_FLOWER_SHARE = 0.035;
export const SWARD_FLOWER_HEIGHT: readonly [number, number] = [1.1, 1.7];
/** Every baked model the sward draws, for `pnpm scenery` to find in the kit. */
export const SWARD_MODELS: readonly string[] = [
  ...new Set([...SWARD_GRASS.flatMap((entry) => [entry.id, entry.far]), ...SWARD_FLOWERS]),
];
