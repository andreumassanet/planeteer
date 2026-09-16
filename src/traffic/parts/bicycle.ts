import type { Vehicle } from '../contract.ts';

/**
 * Bicycle: Quaternius's `SquareFrameBicycle` (Public Transport, CC0), fitted by
 * length to the 2.5 the code bicycle was. The pack's handlebars make it 0.26
 * as wide as it is long, so it is 0.64 across the bars.
 *
 * The one road vehicle that keeps its rider, and the mount is measured off the
 * model rather than carried over: the saddle's top is 0.481 of the length up
 * and 0.161 behind the middle, the bars 0.541 up and 0.253 ahead.
 */
const MODEL = 'bicycle';
const LENGTH = 2.5;
const BODY = /^Material\.00[15]$/;

export const bicycle: Vehicle = {
  id: 'bicycle',
  name: 'Bicycle',
  kind: 'cycle',
  size: [2.52, 0.66, 1.37],
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
