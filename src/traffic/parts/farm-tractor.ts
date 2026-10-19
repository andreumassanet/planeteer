import type { Vehicle, VehicleFit } from '../contract.ts';

/**
 * Farm tractor: Kenney's `tractor` (Car Kit, CC0), a bonnet, a glazed cab and
 * big rear wheels. Enclosed, so no rider is drawn.
 */
const MODEL = 'tractor';

/** What its kit model is fitted to, here and in the craft that takes it (`craft/cars.ts`). */
const FIT: VehicleFit = { width: 2.16 };

export const farmTractor: Vehicle = {
  id: 'farm-tractor',
  name: 'Farm tractor',
  kind: 'utility',
  size: [3.45, 2.16, 2.52],
  // Placed as the craft that takes it: the least at which the hero sits upright in its cab, clear of it.
  section: 1.91,
  fit: FIT,
  note: 'Kenney tractor: a bonnet, a cab and two big wheels behind.',
  mounts: [],
  build(ctx, rng, style) {
    return ctx.vehicle(MODEL, FIT, ctx.vehiclePaint(MODEL, rng.pick(style.paint)));
  },
};
