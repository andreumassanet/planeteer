import type { Vehicle } from '../contract.ts';

/**
 * Hatchback: Kenney's `hatchback-sports` (Car Kit, CC0), painted on the region's
 * paint and fitted to the 2.22 of width the lane rules were written for.
 *
 * Until 2026-09-17 every vehicle in the kit was built here from `solid` boxes;
 * the history of that — the greenhouse inset, the windows that must not be
 * panes, the wheel's eight sides — is in the git history of this file. What
 * survives is the declaration: the placer still reads `size` and nothing else,
 * so a toy-proportioned asset is fitted by width (see `TrafficContext.vehicle`)
 * and comes out shorter than the code car was, 4.87 against 5.16.
 *
 * No mount. The glass is opaque slate like every window in this world, so a
 * driver is never seen, and a rider nobody sees is ~700 triangles a car.
 */
const MODEL = 'hatchback-sports';

export const hatchback: Vehicle = {
  id: 'hatchback',
  name: 'Hatchback',
  kind: 'car',
  size: [4.88, 2.22, 1.9],
  note: 'Kenney hatchback-sports, fitted to a lane. The commonest car on the planet.',
  mounts: [],
  build(ctx, rng, style) {
    return ctx.vehicle(MODEL, { width: 2.22 }, ctx.vehiclePaint(MODEL, rng.pick(style.paint)));
  },
};
