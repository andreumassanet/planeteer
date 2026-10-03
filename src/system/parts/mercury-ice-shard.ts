/**
 * Ice in a cold trap: a cluster of blocks standing in a polar crater's floor,
 * where the sun has never reached in three billion years.
 *
 * The radar-bright deposits at Mercury's poles are almost certainly water ice
 * under a dark crust a few tens of centimetres thick, and what is drawn here
 * is the crust broken: blocks heaved up where the Cinder cut it (an invented
 * industry, on a real deposit). Upright crystals rather than tilted ones,
 * because a block tilted on its foot puts a corner under the ground.
 */
import type { Decoration } from '../contract.ts';
import { PALETTE } from '../../theme.ts';

export const MERCURY_ICE_SHARD: Decoration = {
  id: 'mercury-ice-shard',
  footprint: 2.2,
  bodies: ['mercury'],
  build(ctx, rng) {
    const group = new ctx.THREE.Group();
    const count = rng.between(3, 5);
    for (let k = 0; k < count; k++) {
      // The first is the big one and stands in the middle, so every variant
      // reaches most of its footprint.
      const big = k === 0;
      const half = big ? rng.range(0.75, 0.95) : rng.range(0.3, 0.6);
      const out = big ? rng.range(0.6, 1.1) : rng.range(0.4, 1.5);
      const angle = rng.range(0, Math.PI * 2);
      const height = half * rng.range(1.6, 2.8);
      const colour = k % 3 === 2 ? PALETTE.skyBlue : k % 2 === 0 ? PALETTE.white : ctx.tone(PALETTE.white, 0.86);
      const shard = ctx.taper(half, half * rng.range(0.1, 0.35), height, colour, rng.between(4, 5));
      shard.position.set(Math.cos(angle) * out, 0, Math.sin(angle) * out);
      shard.rotation.y = rng.range(0, Math.PI);
      group.add(shard);
    }
    // The dark crust the ice was cut out of, a slab at its foot.
    const crust = ctx.box(rng.range(1.2, 1.8), 0.22, rng.range(0.6, 0.9), PALETTE.steel);
    crust.position.set(rng.jitter() * 0.4, 0, rng.jitter() * 0.4);
    crust.rotation.y = rng.range(0, Math.PI);
    group.add(crust);
    return group;
  },
};
