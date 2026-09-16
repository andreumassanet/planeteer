import type { Vehicle } from '../contract.ts';

/**
 * Farm tractor: Kenney's `tractor` (Car Kit, CC0), a bonnet, a glazed cab and
 * big rear wheels. Enclosed, so no rider is drawn.
 */
const MODEL = 'tractor';

export const farmTractor: Vehicle = {
  id: 'farm-tractor',
  name: 'Farm tractor',
  kind: 'utility',
  size: [3.45, 2.16, 2.52],
  note: 'Kenney tractor: a bonnet, a cab and two big wheels behind.',
  mounts: [],
  build(ctx, rng, style) {
    return ctx.vehicle(MODEL, { width: 2.16 }, ctx.vehiclePaint(MODEL, rng.pick(style.paint)));
  },
};
