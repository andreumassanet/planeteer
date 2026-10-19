import type { Vehicle, VehicleFit } from '../contract.ts';

/**
 * Hatchback: Kenney's `hatchback-sports` (Car Kit, CC0), fitted to a 2.22
 * lane width.
 *
 * No mount: near enough to see through the glass, `life.ts` glazes the car and
 * seats a driver (`glazeTraffic` in `craft/cars.ts`, `CABIN_REACH`).
 */
const MODEL = 'hatchback-sports';

/** What its kit model is fitted to, here and in the craft that takes it (`craft/cars.ts`). */
const FIT: VehicleFit = { width: 2.22 };

export const hatchback: Vehicle = {
  id: 'hatchback',
  name: 'Hatchback',
  kind: 'car',
  size: [4.88, 2.22, 1.9],
  // Placed as the craft that takes it: the least at which the hero sits under its low roof.
  section: 1.75,
  fit: FIT,
  note: 'Kenney hatchback-sports, fitted to a lane. The commonest car on the planet.',
  mounts: [],
  build(ctx, rng, style) {
    return ctx.vehicle(MODEL, FIT, ctx.vehiclePaint(MODEL, rng.pick(style.paint)));
  },
};
