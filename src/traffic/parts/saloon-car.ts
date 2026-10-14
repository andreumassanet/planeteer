import type { Vehicle } from '../contract.ts';

/**
 * Saloon: Kenney's `sedan` (Car Kit, CC0), fitted by length to 4.55. Taller and
 * boxier than the hatchback, so the two stay under `SAME_SHAPE` from the side.
 */
const MODEL = 'sedan';

export const saloonCar: Vehicle = {
  id: 'saloon-car',
  name: 'Saloon car',
  kind: 'car',
  size: [4.56, 2.68, 2.33],
  note: 'Kenney sedan: taller and boxier than the hatchback beside it.',
  mounts: [],
  build(ctx, rng, style) {
    return ctx.vehicle(MODEL, { length: 4.55 }, ctx.vehiclePaint(MODEL, rng.pick(style.paint)));
  },
};
