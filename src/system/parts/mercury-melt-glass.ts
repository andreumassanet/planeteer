/**
 * Impact melt, frozen: a puddle of dark glass with lumps standing in it.
 *
 * The hot poles are where the sun has worked hardest and the oldest craters
 * the most; melt sheets and glassy spatter are what a big impact leaves, and
 * on a world that is dark already the glass is the darkest thing on it. A
 * flat pool, two or three lumps, and one glint of gold where the facets
 * catch the sun — the only bright mark, kept small.
 */
import type { Decoration } from '../contract.ts';
import { PALETTE } from '../../theme.ts';

export const MERCURY_MELT_GLASS: Decoration = {
  id: 'mercury-melt-glass',
  footprint: 2.5,
  bodies: ['mercury'],
  build(ctx, rng) {
    const group = new ctx.THREE.Group();
    const pool = ctx.taper(rng.range(1.9, 2.15), rng.range(1.5, 1.8), 0.18, PALETTE.bark, rng.between(6, 8));
    group.add(pool);
    const lumps = rng.between(2, 3);
    for (let k = 0; k < lumps; k++) {
      const r = k === 0 ? rng.range(0.55, 0.8) : rng.range(0.3, 0.5);
      const lump = ctx.blob(r, r * rng.range(1, 1.6), k === 0 ? PALETTE.brown : ctx.tone(PALETTE.bark, 1.2), 0);
      const angle = rng.range(0, Math.PI * 2);
      const out = rng.range(0, 1.4 - r);
      lump.position.set(Math.cos(angle) * out, 0.1, Math.sin(angle) * out);
      group.add(lump);
    }
    const glint = ctx.taper(0.18, 0.02, 0.5, PALETTE.gold, 4);
    glint.position.set(rng.jitter() * 0.8, 0.1, rng.jitter() * 0.8);
    group.add(glint);
    return group;
  },
};
