/**
 * A vent, for the worlds whose weather comes out of the ground.
 *
 * Venus and Io, and the difference from `iron-spire` is that this is a *hole*
 * with a rim rather than a mass with a skirt. It is built as a ring wall and a
 * sunken floor, and the reason the floor is sunk rather than a flat disc is
 * Victoria Falls' finding, which is the sharpest thing in the whole modelling
 * section: **on a shallow camera a gorge narrower than it is deep cannot be
 * seen into at all.** So the rim is low against its own width — a fifth, where
 * a real vent's is more — and it reads as a hole rather than as a ring.
 */
import type { Decoration } from '../contract.ts';

export const SULPHUR_VENT: Decoration = {
  id: 'sulphur-vent',
  footprint: 8.1,
  bodies: [],
  build(ctx, rng, look) {
    const group = new ctx.THREE.Group();
    const outer = rng.range(2.6, 4.4);
    const inner = outer * rng.range(0.42, 0.62);
    const rim = outer * rng.range(0.16, 0.24);
    const sides = rng.between(6, 8);

    const wall = ctx.ringWall(inner, outer, rim, look.highland, sides);
    group.add(wall);

    const floor = ctx.taper(inner * 0.98, inner * 0.7, rim * 0.35, look.cap, sides);
    group.add(floor);

    // Spatter on the outside, downwind. Never a ring of it: a wall around a
    // thing is worth less than a detail on the front of it, every time.
    const bearing = rng.range(0, Math.PI * 2);
    const lumps = rng.between(2, 4);
    for (let n = 0; n < lumps; n++) {
      const angle = bearing + rng.jitter() * 0.7;
      const d = outer * rng.range(1.1, 1.7);
      const lump = ctx.taper(outer * 0.2, outer * 0.08, rim * rng.range(0.8, 1.8), look.cap, 5);
      lump.position.set(Math.cos(angle) * d, 0, Math.sin(angle) * d);
      group.add(lump);
    }
    return group;
  },
};
