import type { Vehicle } from '../contract.ts';

/**
 * Rowing boat: Kenney's `boat-row-small` (Watercraft Kit, CC0), oars out. The
 * oars make it 1.16 as wide as it is long, so it is fitted to the 3.5 a craft
 * may be wide and comes out 3.02 long, and it sits `SINK` into the water: y = 0
 * is the waterline for a craft (`KindSpec.draft`).
 */
const MODEL = 'boat-row-small';
const SINK = 0.3;

export const rowingBoat: Vehicle = {
  id: 'rowing-boat',
  name: 'Rowing boat',
  kind: 'craft',
  size: [3.03, 3.5, 0.8],
  note: 'Kenney row boat, oars out, sitting in the water.',
  mounts: [
    { x: 0, y: 0.35, z: -0.2, yaw: 0, pose: 'sit', driver: true, headroom: Infinity, legroom: 0.62, beam: Infinity, grip: [0, 0.75, 0.5] },
  ],
  build(ctx, rng, style) {
    return ctx.vehicle(MODEL, { width: 3.5, sink: SINK }, ctx.vehiclePaint(MODEL, rng.pick(style.cargo)));
  },
};
