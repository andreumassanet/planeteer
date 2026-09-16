import type { Vehicle } from '../contract.ts';

/**
 * Sailing dinghy: Kenney's `boat-sail-a` (Watercraft Kit, CC0), fitted by
 * length to the code dinghy's 4.62 and sitting `SINK` into the water.
 */
const MODEL = 'boat-sail-a';
const SINK = 0.35;

export const sailingDinghy: Vehicle = {
  id: 'sailing-dinghy',
  name: 'Sailing dinghy',
  kind: 'craft',
  size: [4.63, 2.2, 5.5],
  note: 'Kenney sailing boat: a small hull under a tall white sail.',
  mounts: [],
  build(ctx, rng, style) {
    return ctx.vehicle(MODEL, { length: 4.62, sink: SINK }, ctx.vehiclePaint(MODEL, rng.pick(style.paint)));
  },
};
