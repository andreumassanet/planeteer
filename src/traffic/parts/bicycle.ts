import { RIDDEN_SECTION } from '../contract.ts';
import type { Vehicle } from '../contract.ts';

/**
 * Bicycle: Quaternius's `SquareFrameBicycle` (Public Transport, CC0), fitted
 * by length. The only road vehicle that keeps its rider; the mount is measured
 * off the model (saddle top 0.481 of the length up and 0.161 behind the
 * middle, bars 0.541 up and 0.253 ahead).
 */
const MODEL = 'bicycle';
const LENGTH = 2.5;
const BODY = /^Material\.00[15]$/;

export const bicycle: Vehicle = {
  id: 'bicycle',
  name: 'Bicycle',
  kind: 'cycle',
  size: [2.52, 0.66, 1.37],
  // Ridden by the hero's own size: placed as the craft that takes it.
  section: RIDDEN_SECTION,
  note: 'Quaternius square-frame bicycle, with its rider.',
  mounts: [
    {
      x: 0,
      y: 0.481 * LENGTH - 0.03,
      z: -0.161 * LENGTH,
      yaw: 0,
      pose: 'astride',
      driver: true,
      headroom: Infinity,
      legroom: 0.481 * LENGTH - 0.03,
      beam: Infinity,
      footrest: [0.16, 0.34, -0.02],
      grip: [0, 0.541 * LENGTH, 0.253 * LENGTH],
    },
  ],
  build(ctx, rng, style) {
    return ctx.vehicle(MODEL, { length: LENGTH }, ctx.vehiclePaint(MODEL, rng.pick(style.paint), BODY));
  },
};
