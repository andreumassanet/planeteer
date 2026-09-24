/**
 * What the sward in `vegetation.ts` is made of: the baked models, how often
 * each grows and how tall. A module of its own and of nothing else, so
 * `pnpm scenery` can hold the list against the kit without importing the
 * streamer, which reaches a Vite-only glob through the scenery registry.
 */

/**
 * The clumps (KayKit Forest, single-sided), how often, and how tall in world
 * units: shin to thigh on a 3.77-unit person (knee to thigh at the 2.22 he
 * was earlier on 2026-09-24). They were 1.5 to 3.2 while a person was 6.8
 * units tall, and at 2.2 that grass stood over his head. `far` is the clump a
 * site of rank 1 or more draws instead, the same shape at a third of the triangles: those are the sites still standing past
 * the first band, where a clump is a handful of pixels.
 */
export const SWARD_GRASS: readonly { id: string; far: string; weight: number; height: readonly [number, number] }[] = [
  { id: 'grass-1-a', far: 'grass-1-a', weight: 5, height: [0.75, 1.1] },
  { id: 'grass-1-b', far: 'grass-1-a', weight: 2, height: [0.75, 1.1] },
  { id: 'grass-2-a', far: 'grass-2-a', weight: 4, height: [1.0, 1.5] },
  { id: 'grass-2-b', far: 'grass-2-a', weight: 1.5, height: [1.0, 1.5] },
  { id: 'grass-1-c', far: 'grass-1-a', weight: 0.3, height: [0.8, 1.2] },
  { id: 'grass-2-c', far: 'grass-2-a', weight: 0.2, height: [1.1, 1.6] },
];
/** Kenney's flowers, a share of the sites where the grass is thick. */
export const SWARD_FLOWERS = ['flower-redA', 'flower-yellowA', 'flower-purpleA', 'flower-redC', 'flower-yellowC'] as const;
export const SWARD_FLOWER_SHARE = 0.035;
export const SWARD_FLOWER_HEIGHT: readonly [number, number] = [0.55, 0.85];
/** Every baked model the sward draws, for `pnpm scenery` to find in the kit. */
export const SWARD_MODELS: readonly string[] = [
  ...new Set([...SWARD_GRASS.flatMap((entry) => [entry.id, entry.far]), ...SWARD_FLOWERS]),
];
