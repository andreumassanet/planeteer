import { RIDDEN_SECTION } from '../contract.ts';
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
  // Crewed by the hero's size, as every vehicle a person rides.
  section: RIDDEN_SECTION,
  note: 'Kenney fishing boat: a wheelhouse, two masts and a working deck.',
  // A hand on the working deck aft of the wheelhouse.
  mounts: [{ x: 0, y: 0.92, z: -2, yaw: 0, pose: 'stand', driver: true, headroom: Infinity, legroom: 0, beam: Infinity }],
  build(ctx, rng, style) {
    return ctx.vehicle(MODEL, { width: 3.4, sink: SINK }, ctx.vehiclePaint(MODEL, rng.pick(style.paint)));
  },
};
