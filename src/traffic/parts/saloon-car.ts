import type { Vehicle, VehicleFit } from '../contract.ts';

/**
 * Saloon: Kenney's `sedan` (Car Kit, CC0), fitted by length to 4.55. Taller and
 * boxier than the hatchback, so the two stay under `SAME_SHAPE` from the side.
 */
const MODEL = 'sedan';

/** What its kit model is fitted to, here and in the craft that takes it (`craft/cars.ts`). */
const FIT: VehicleFit = { length: 4.55 };

export const saloonCar: Vehicle = {
  id: 'saloon-car',
  name: 'Saloon car',
  kind: 'car',
  size: [4.56, 2.68, 2.33],
  // Placed as the craft that takes it: the least at which the hero sits at the wheel, its knees and shoulders clear.
  section: 1.49,
  fit: FIT,
  note: 'Kenney sedan: taller and boxier than the hatchback beside it.',
  mounts: [],
  build(ctx, rng, style) {
    return ctx.vehicle(MODEL, FIT, ctx.vehiclePaint(MODEL, rng.pick(style.paint)));
  },
};
