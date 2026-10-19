import { RIDDEN_SECTION } from '../contract.ts';
import type { Vehicle } from '../contract.ts';

/**
 * Sailing dinghy: Kenney's `boat-sail-a` (Watercraft Kit, CC0), fitted by
 * length to 4.62 and sitting `SINK` into the water.
 */
const MODEL = 'boat-sail-a';
const SINK = 0.35;

export const sailingDinghy: Vehicle = {
  id: 'sailing-dinghy',
  name: 'Sailing dinghy',
  kind: 'craft',
  size: [4.63, 2.2, 5.5],
  // Crewed by the hero's size, as every vehicle a person rides.
  section: RIDDEN_SECTION,
  note: 'Kenney sailing boat: a small hull under a tall white sail.',
  // At the helm on the stern's side deck, clear of the boom, the feet in the cockpit.
  mounts: [{ x: 0, y: 1.11, z: -1.9, yaw: 0, pose: 'sit', driver: true, headroom: Infinity, legroom: 0.6, beam: Infinity }],
  build(ctx, rng, style) {
    return ctx.vehicle(MODEL, { length: 4.62, sink: SINK }, ctx.vehiclePaint(MODEL, rng.pick(style.paint)));
  },
};
