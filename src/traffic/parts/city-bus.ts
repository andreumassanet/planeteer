import type { Vehicle } from '../contract.ts';

/**
 * City bus: Quaternius's `Bus` (Public Transport, CC0). It is grey and white in
 * the pack, so the paint names the bodywork (`Top`, `Bottom`, `Material`).
 *
 * Fitted to the 3.3 a bus may be wide it is 7.73 long, half the 14.76 the code
 * bus was, because the pack draws a bus as a toy; `KINDS.heavy.minLength` came
 * down to 7.5 for it. The pack's `SchoolBus` was tried as a variant and is 22%
 * taller at the same width, which no one declared box can hold.
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
