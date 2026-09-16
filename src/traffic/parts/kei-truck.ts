import type { Vehicle } from '../contract.ts';

/**
 * Kei truck: Kenney's `truck-flat` (Car Kit, CC0) at the 1.88 of width a kei
 * truck is allowed, which leaves a small cab and a flat bed 3.45 long.
 */
const MODEL = 'truck-flat';

export const keiTruck: Vehicle = {
  id: 'kei-truck',
  name: 'Kei truck',
  kind: 'utility',
  size: [3.46, 1.88, 1.64],
  note: 'Kenney truck-flat, narrow: a small cab and a flat bed.',
  mounts: [],
  build(ctx, rng, style) {
    return ctx.vehicle(MODEL, { width: 1.88 }, ctx.vehiclePaint(MODEL, rng.pick(style.paint)));
  },
};
