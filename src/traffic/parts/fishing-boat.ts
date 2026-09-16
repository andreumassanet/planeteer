import type { Vehicle } from '../contract.ts';

/**
 * Fishing boat: Kenney's `boat-fishing-small` (Watercraft Kit, CC0), a
 * wheelhouse and two masts, fitted to 3.4 of beam and sitting `SINK` into the
 * water.
 */
const MODEL = 'boat-fishing-small';
const SINK = 0.6;

export const fishingBoat: Vehicle = {
  id: 'fishing-boat',
  name: 'Fishing boat',
  kind: 'craft',
  size: [7.4, 3.4, 4.9],
  note: 'Kenney fishing boat: a wheelhouse, two masts and a working deck.',
  mounts: [],
  build(ctx, rng, style) {
    return ctx.vehicle(MODEL, { width: 3.4, sink: SINK }, ctx.vehiclePaint(MODEL, rng.pick(style.paint)));
  },
};
