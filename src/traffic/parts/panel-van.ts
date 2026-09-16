import type { Vehicle } from '../contract.ts';

/**
 * Panel van: Kenney's `van` (Car Kit, CC0). Blank flanks behind the cab, which
 * is still what tells a van from a minibus at distance.
 */
const MODEL = 'van';

export const panelVan: Vehicle = {
  id: 'panel-van',
  name: 'Panel van',
  kind: 'utility',
  size: [4.74, 2.58, 2.34],
  note: 'Kenney van, fitted to a lane. No side glass behind the cab, which is the read.',
  mounts: [],
  build(ctx, rng, style) {
    return ctx.vehicle(MODEL, { width: 2.58 }, ctx.vehiclePaint(MODEL, rng.pick(style.paint)));
  },
};
