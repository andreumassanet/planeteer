import type { Vehicle } from '../contract.ts';

/**
 * Box truck: Kenney's `delivery` (Car Kit, CC0), a cab and a box.
 *
 * **It is a `utility` now and not a `heavy`.** The pack's box truck is 0.46 as
 * wide as it is long, so at the 2.9 a utility may be wide it is 6.28 long,
 * under the heavy floor of 7.5 and inside every utility cap — which is what a
 * toy delivery truck is.
 */
const MODEL = 'delivery';

export const boxTruck: Vehicle = {
  id: 'box-truck',
  name: 'Box truck',
  kind: 'utility',
  size: [6.3, 2.9, 3.2],
  note: 'Kenney delivery, fitted to a lane: a cab and a tall box.',
  mounts: [],
  build(ctx, rng, style) {
    return ctx.vehicle(MODEL, { width: 2.9 }, ctx.vehiclePaint(MODEL, rng.pick(style.paint)));
  },
};
