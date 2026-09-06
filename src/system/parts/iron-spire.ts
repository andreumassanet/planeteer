/**
 * A spire: a plug of hard rock left standing when the soft ground around it
 * blew away.
 *
 * The tall one, and the only decoration in this kit that breaks a horizon. It
 * exists because a plain of boulders and drifts has nothing in it above knee
 * height, and the crop it makes is the monument contract's own: **ask what the
 * recognised view is, not what the object measures.** A real yardang is three
 * times as long as it is tall; this is the other way round, because what a
 * spire is *for* here is to stand against the sky.
 *
 * Segments are five, not twelve. The Space Needle measured the ceiling: at
 * twelve, `OutlineEffect`'s per-mesh hull turned a curve into a ladder, and the
 * question is never the geometric error, it is how many ink lines you want to
 * see.
 */
import type { Decoration } from '../contract.ts';

export const IRON_SPIRE: Decoration = {
  id: 'iron-spire',
  footprint: 4.6,
  bodies: [],
  build(ctx, rng, look) {
    const group = new ctx.THREE.Group();
    const height = rng.range(4.5, 11.0);
    const base = rng.range(1.5, 2.9);
    const sections = rng.between(3, 5);
    const sides = rng.between(5, 6);

    let y = 0;
    let width = base;
    for (let n = 0; n < sections; n++) {
      const run = (height / sections) * rng.spread(1, 0.22);
      const next = width * rng.range(0.58, 0.86);
      const piece = ctx.taper(width, next, run, n % 2 === 0 ? look.surface : look.highland, sides);
      piece.position.y = y;
      piece.rotation.y = rng.range(0, 1.2);
      group.add(piece);
      y += run;
      width = next;
    }

    // A skirt of fallen blocks. It is on the *near* face of nothing in
    // particular, which is the one thing a low camera can see of a tall object:
    // a rim of height h hides a band roughly 4h deep behind it.
    const blocks = rng.between(2, 4);
    for (let n = 0; n < blocks; n++) {
      const angle = (n / blocks) * Math.PI * 2 + rng.jitter();
      const block = ctx.box(base * 0.5, base * rng.range(0.3, 0.6), base * 0.44, look.lowland);
      block.position.set(Math.cos(angle) * base * 1.25, 0, Math.sin(angle) * base * 1.25);
      block.rotation.y = angle;
      group.add(block);
    }
    return group;
  },
};
