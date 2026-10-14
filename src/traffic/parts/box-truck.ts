import type { Vehicle } from '../contract.ts';

/**
 * Box truck: Kenney's `delivery` (Car Kit, CC0), a cab and a box. A `utility`
 * rather than a `heavy`: fitted to a utility's 2.9 width the toy-proportioned
 * model is 6.28 long, under the heavy floor.
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
