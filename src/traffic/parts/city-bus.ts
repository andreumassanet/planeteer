import type { Vehicle } from '../contract.ts';

/**
 * City bus: Quaternius's `Bus` (Public Transport, CC0). The pack paints it grey
 * and white, so the paint names the bodywork slots. Fitted by width it is
 * 7.73 long, which is why `KINDS.heavy.minLength` is 7.5.
 */
const MODEL = 'bus';
const BODY = /^(Top|Bottom|Material)$/;

export const cityBus: Vehicle = {
  id: 'city-bus',
  name: 'City bus',
  kind: 'heavy',
  size: [7.74, 3.3, 3.18],
  note: 'Quaternius Bus, repainted: a toy bus, short and tall.',
  mounts: [],
  build(ctx, rng, style) {
    return ctx.vehicle(MODEL, { width: 3.3 }, ctx.vehiclePaint(MODEL, rng.pick(style.paint), BODY));
  },
};
