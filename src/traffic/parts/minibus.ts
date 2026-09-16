import type { Vehicle } from '../contract.ts';

/**
 * Minibus: Quaternius's `Ambulance` (Public Transport, CC0) with the ambulance
 * painted out. A tall box body behind a short cab is what a marshrutka or a
 * matatu is, and the pack's model is the only van-sized vehicle with side
 * windows in either kit. Its body is grey and white in the pack, so the paint
 * names the bodywork (`White`, `Material`) rather than finding it by colour.
 */
const MODEL = 'ambulance';
const BODY = /^(White|Material|Red)$/;

export const minibus: Vehicle = {
  id: 'minibus',
  name: 'Minibus',
  kind: 'utility',
  size: [5.26, 2.6, 2.68],
  note: 'Quaternius Ambulance, repainted: a tall box behind a short cab.',
  mounts: [],
  build(ctx, rng, style) {
    return ctx.vehicle(MODEL, { width: 2.6 }, ctx.vehiclePaint(MODEL, rng.pick(style.paint), BODY));
  },
};
