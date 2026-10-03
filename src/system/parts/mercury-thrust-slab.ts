/**
 * A lobate scarp in miniature: crust shingled over crust.
 *
 * Mercury's cliffs are thrust faults — the planet shrank by up to seven
 * kilometres of radius as its huge iron core cooled, and the crust took it up
 * by riding over itself. At the foot of a scarp the rock comes in plates, each
 * pushed a little further over the one beneath, and that is what this is:
 * three or four slabs stacked and stepped back, the overhang toward the low
 * ground. One repeating feature, the step, and nothing else on it.
 */
import type { Decoration } from '../contract.ts';
import { PALETTE } from '../../theme.ts';

export const MERCURY_THRUST_SLAB: Decoration = {
  id: 'mercury-thrust-slab',
  footprint: 2.7,
  bodies: ['mercury'],
  build(ctx, rng) {
    const group = new ctx.THREE.Group();
    const slabs = rng.between(3, 4);
    const turn = rng.range(0, Math.PI * 2);
    const colours = [PALETTE.slate, PALETTE.steel, ctx.tone(PALETTE.slate, 0.85), PALETTE.bark];
    let y = 0;
    for (let k = 0; k < slabs; k++) {
      const width = rng.range(2.6, 3.4) - k * 0.35;
      const depth = rng.range(1.5, 2.0) - k * 0.2;
      const height = rng.range(0.4, 0.75);
      const slab = ctx.box(width, height, depth, colours[k % colours.length]!);
      // Each one shoved further over the low side, and turned a little off
      // the last, as a broken plate is.
      const shove = (k - (slabs - 1) / 2) * 0.45;
      slab.position.set(Math.cos(turn) * shove, y, Math.sin(turn) * shove);
      slab.rotation.y = -turn + rng.jitter() * 0.15;
      group.add(slab);
      y += height;
    }
    // A fallen block at the front.
    const block = ctx.box(0.7, 0.6, 0.6, PALETTE.steel);
    block.position.set(Math.cos(turn) * -1.7, 0, Math.sin(turn) * -1.7);
    block.rotation.y = rng.range(0, Math.PI);
    group.add(block);
    return group;
  },
};
