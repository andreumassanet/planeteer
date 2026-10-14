import type { Vehicle } from '../contract.ts';

/**
 * Hatchback: Kenney's `hatchback-sports` (Car Kit, CC0), fitted to a 2.22
 * lane width.
 *
 * No mount: near enough to see through the glass, `life.ts` glazes the car and
 * seats a driver (`glazeTraffic` in `craft/cars.ts`, `CABIN_REACH`).
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
