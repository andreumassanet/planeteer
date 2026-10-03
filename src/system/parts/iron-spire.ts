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
    const height = rng.range(3.5, 8.0);
    const base = rng.range(1.6, 3.0);
    const sections = rng.between(3, 4);
    const sides = rng.between(5, 6);

    // **A stack of weathered blocks, not a cone.** Each section narrows only
    // a little, sits a little off the one under it and leans, so the outline
    // is a ragged column of rock; one rock's colour, a shade apart a block.
    // Until 2026-10-02 every section tapered by up to 40% in alternating
    // colours, and a field of them read as traffic cones.
    let y = 0;
    let width = base;
    let x = 0;
    let z = 0;
    for (let n = 0; n < sections; n++) {
      const run = (height / sections) * rng.spread(1, 0.25);
      const next = width * rng.range(0.78, 0.94);
      const piece = ctx.taper(width, next, run, ctx.tone(look.surface, rng.range(0.88, 1.04)), sides);
      piece.position.set(x, y, z);
      // The first block stands square on the ground; the ones over it lean.
      const lean = n === 0 ? 0 : 0.08;
      piece.rotation.set(rng.jitter() * lean, rng.range(0, 1.2), rng.jitter() * lean);
      group.add(piece);
      y += run * 0.96;
      width = next;
      x += rng.jitter() * width * 0.12;
      z += rng.jitter() * width * 0.12;
    }
    // A flat, broken cap rather than a point.
    const cap = ctx.taper(width * 0.92, width * 0.55, width * 0.45, ctx.tone(look.surface, 0.95), sides);
    cap.position.set(x, y, z);
    group.add(cap);

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
