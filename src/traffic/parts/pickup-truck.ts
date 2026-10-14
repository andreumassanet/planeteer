import type { Vehicle } from '../contract.ts';

/**
 * Pickup: Kenney's `truck` (Car Kit, CC0), an open bed behind a cab. The bed is
 * too shallow to hold a seated rider, so it has no mount.
 */
const MODEL = 'truck';

export const pickupTruck: Vehicle = {
  id: 'pickup-truck',
  name: 'Pickup truck',
  kind: 'utility',
  size: [4.93, 2.5, 2.18],
  note: 'Kenney truck, fitted to a lane: a cab and an open bed.',
  mounts: [],
  build(ctx, rng, style) {
    return ctx.vehicle(MODEL, { width: 2.5 }, ctx.vehiclePaint(MODEL, rng.pick(style.paint)));
  },
};
