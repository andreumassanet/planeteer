import type { Vehicle } from '../contract.ts';

/**
 * Saloon: Kenney's `sedan` (Car Kit, CC0), fitted by length to 4.55 and so
 * 2.68 wide, near the top of what a car may be.
 *
 * The `sedan-sports` body was tried first, because fitted to a lane width it
 * came out longer; from the side it was 0.900 the same shape as the hatchback,
 * which is `SAME_SHAPE` exactly. The plain sedan is taller and boxier, which is
 * what tells a family saloon from a hatch at a hundred units.
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
