import type { Vehicle, VehicleFit } from '../contract.ts';

/**
 * City bus: Quaternius's `Bus` (Public Transport, CC0). The pack paints it grey
 * and white, so the paint names the bodywork slots. Fitted by width it is
 * 7.73 long, which is why `KINDS.heavy.minLength` is 7.5.
 */
const MODEL = 'bus';
const BODY = /^(Top|Bottom)$/;

/** What its kit model is fitted to, here and in the craft that takes it (`craft/cars.ts`). */
const FIT: VehicleFit = { width: 3.3 };

export const cityBus: Vehicle = {
  id: 'city-bus',
  name: 'City bus',
  kind: 'heavy',
  size: [7.74, 3.3, 3.18],
  fit: FIT,
  note: 'Quaternius Bus, repainted: a toy bus, short and tall.',
  mounts: [],
  build(ctx, rng, style) {
    return ctx.vehicle(MODEL, FIT, ctx.vehiclePaint(MODEL, rng.pick(style.paint), BODY));
  },
};
