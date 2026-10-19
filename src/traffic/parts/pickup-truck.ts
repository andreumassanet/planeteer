import type { Vehicle, VehicleFit } from '../contract.ts';

/**
 * Pickup: Kenney's `truck` (Car Kit, CC0), an open bed behind a cab. The bed is
 * too shallow to hold a seated rider, so it has no mount.
 */
const MODEL = 'truck';

/** What its kit model is fitted to, here and in the craft that takes it (`craft/cars.ts`). */
const FIT: VehicleFit = { width: 2.5 };

export const pickupTruck: Vehicle = {
  id: 'pickup-truck',
  name: 'Pickup truck',
  kind: 'utility',
  size: [4.93, 2.5, 2.18],
  // Placed as the craft that takes it: the least at which the hero sits in its cab with his knees and shoulders clear.
  section: 1.58,
  fit: FIT,
  note: 'Kenney truck, fitted to a lane: a cab and an open bed.',
  mounts: [],
  build(ctx, rng, style) {
    return ctx.vehicle(MODEL, FIT, ctx.vehiclePaint(MODEL, rng.pick(style.paint)));
  },
};
