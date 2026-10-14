import type { Vehicle } from '../contract.ts';

/**
 * Rowing boat: Kenney's `boat-row-small` (Watercraft Kit, CC0), oars out. The
 * oars make it wider than long, so it is fitted to a craft's 3.5 width and
 * sits `SINK` into the water (y = 0 is the waterline, see `KindSpec.draft`).
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
