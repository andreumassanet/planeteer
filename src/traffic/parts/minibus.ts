import type { Vehicle } from '../contract.ts';

/**
 * Minibus: Quaternius's `Ambulance` (Public Transport, CC0) with the ambulance
 * painted out: a tall box behind a short cab, with side windows. The pack
 * paints it grey and white, so the paint names the bodywork slots.
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
