/**
 * Metal frost: galena on the high ground.
 *
 * Above about four and a half kilometres the mountains of Venus go bright to
 * radar, and the reading most planetary scientists hold is that lead and
 * bismuth sulphides boil off the 464-degree lowlands and condense where it is
 * a few dozen degrees cooler. Galena — lead sulphide — crystallises in cubes,
 * and it grows them on Earth too, stepped into each other like a pile of dice.
 *
 * So the frost on Maxwell is drawn as that: a cluster of cubes, each turned
 * about the vertical only (a tipped cube puts a corner under the ground), the
 * small ones sitting on the big one's top face the way intergrown crystals do.
 */
import { PALETTE } from '../../theme.ts';
import type { Decoration } from '../contract.ts';

export const VENUS_GALENA: Decoration = {
  id: 'venus-galena',
  footprint: 3.0,
  bodies: ['venus'],
  build(ctx, rng, look) {
    const group = new ctx.THREE.Group();
    // Fresh galena is a bright lead grey; the frost round it is the biome's.
    const metal = [PALETTE.steel, look.highland, PALETTE.slate];
    const big = rng.range(1.1, 1.9);
    const core = ctx.box(big, big, big, metal[0]!);
    core.rotation.y = rng.range(0, Math.PI / 2);
    group.add(core);
    // Smaller crystals round the foot.
    const foot = rng.between(2, 4);
    for (let n = 0; n < foot; n++) {
      const angle = (n / foot) * Math.PI * 2 + rng.jitter() * 0.5;
      const s = big * rng.range(0.35, 0.7);
      const d = big * 0.62 + s * 0.6;
      const cube = ctx.box(s, s, s, metal[1 + (n % 2)]!);
      cube.position.set(Math.cos(angle) * d, 0, Math.sin(angle) * d);
      cube.rotation.y = rng.range(0, Math.PI / 2);
      group.add(cube);
    }
    // And one or two grown out of the top face, the dice-pile look.
    const top = rng.between(1, 2);
    for (let n = 0; n < top; n++) {
      const s = big * rng.range(0.32, 0.5);
      const cube = ctx.box(s, s, s, metal[n % 2 === 0 ? 1 : 0]!);
      cube.position.set(rng.jitter() * big * 0.22, big, rng.jitter() * big * 0.22);
      cube.rotation.y = rng.range(0, Math.PI / 2);
      group.add(cube);
    }
    return group;
  },
};
