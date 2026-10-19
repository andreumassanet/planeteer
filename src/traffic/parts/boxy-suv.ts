import type { Vehicle, VehicleFit } from '../contract.ts';

/** What its kit model is fitted to, here and in the craft that takes it (`craft/cars.ts`). */
const FIT: VehicleFit = { width: 2.44 };

/**
 * SUV: Kenney's `suv` and `suv-luxury` (Car Kit, CC0), one or the other a
 * variant, both fitted to 2.44 wide.
 */
export const boxySuv: Vehicle = {
  id: 'boxy-suv',
  name: 'Boxy SUV',
  kind: 'car',
  size: [4.66, 2.44, 2.13],
  // Placed as the craft that takes it: the least at which the hero sits in either model with his knees and shoulders clear.
  section: 1.65,
  fit: FIT,
  note: 'Kenney suv or suv-luxury, fitted to a lane.',
  mounts: [],
  build(ctx, rng, style) {
    const model = rng.chance(0.5) ? 'suv' : 'suv-luxury';
    return ctx.vehicle(model, FIT, ctx.vehiclePaint(model, rng.pick(style.paint)));
  },
};
