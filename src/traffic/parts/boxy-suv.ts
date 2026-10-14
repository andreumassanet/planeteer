import type { Vehicle } from '../contract.ts';

/**
 * SUV: Kenney's `suv` and `suv-luxury` (Car Kit, CC0), one or the other a
 * variant, both fitted to 2.44 wide.
 */
export const boxySuv: Vehicle = {
  id: 'boxy-suv',
  name: 'Boxy SUV',
  kind: 'car',
  size: [4.66, 2.44, 2.13],
  note: 'Kenney suv or suv-luxury, fitted to a lane.',
  mounts: [],
  build(ctx, rng, style) {
    const model = rng.chance(0.5) ? 'suv' : 'suv-luxury';
    return ctx.vehicle(model, { width: 2.44 }, ctx.vehiclePaint(model, rng.pick(style.paint)));
  },
};
