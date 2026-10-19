import type { Vehicle, VehicleFit } from '../contract.ts';

/**
 * Minibus: Quaternius's `Ambulance` (Public Transport, CC0) with the ambulance
 * painted out: a tall box behind a short cab, with side windows. The pack
 * paints it grey and white, so the paint names the bodywork slots.
 */
const MODEL = 'ambulance';
const BODY = /^(White|Red)$/;

/** What its kit model is fitted to, here and in the craft that takes it (`craft/cars.ts`). */
const FIT: VehicleFit = { width: 2.6 };

export const minibus: Vehicle = {
  id: 'minibus',
  name: 'Minibus',
  kind: 'utility',
  size: [5.26, 2.6, 2.68],
  fit: FIT,
  note: 'Quaternius Ambulance, repainted: a tall box behind a short cab.',
  mounts: [],
  build(ctx, rng, style) {
    return ctx.vehicle(MODEL, FIT, ctx.vehiclePaint(MODEL, rng.pick(style.paint), BODY));
  },
};
