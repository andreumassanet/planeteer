import type { Vehicle, VehicleFit } from '../contract.ts';

/**
 * Panel van: Kenney's `van` (Car Kit, CC0). Blank flanks behind the cab, which
 * is still what tells a van from a minibus at distance.
 */
const MODEL = 'van';

/** What its kit model is fitted to, here and in the craft that takes it (`craft/cars.ts`). */
const FIT: VehicleFit = { width: 2.58 };

export const panelVan: Vehicle = {
  id: 'panel-van',
  name: 'Panel van',
  kind: 'utility',
  size: [4.74, 2.58, 2.34],
  // Placed as the craft that takes it: the least at which the hero sits in both rows, and a little air.
  section: 1.6,
  fit: FIT,
  note: 'Kenney van, fitted to a lane. No side glass behind the cab, which is the read.',
  mounts: [],
  build(ctx, rng, style) {
    return ctx.vehicle(MODEL, FIT, ctx.vehiclePaint(MODEL, rng.pick(style.paint)));
  },
};
