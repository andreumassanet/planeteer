/**
 * A ventifact: a boulder the wind has cut a waist into.
 *
 * The commonest thing on a dry world with an atmosphere and no rain, and the
 * one that says *wind* rather than *rock*. Two masses with a notch between
 * them, and the notch is the whole read: `OutlineEffect` inks the break of
 * slope, so a stone with a waist gets a line across its middle where a lump
 * gets an outline and nothing else.
 *
 * **One repeating feature per surface, never two.** Angel Falls' cliff was
 * seven strata crossed with five ribs and rendered as brickwork; this is bands
 * *or* facets and it is facets, because at 40 units a boulder is 20 pixels and
 * a band inside that is a texture nobody resolves.
 */
import type { Decoration } from '../contract.ts';

export const WIND_STONE: Decoration = {
  id: 'wind-stone',
  footprint: 2.1,
  bodies: [],
  build(ctx, rng, look) {
    const group = new ctx.THREE.Group();
    const width = rng.range(1.5, 3.4);
    const height = rng.range(1.1, 2.8);
    // Five or six sides, never eight: few joints read as natural and many read
    // as manufactured, and a boulder is the one thing here that must read as
    // found.
    const sides = rng.between(5, 6);

    const foot = ctx.taper(width * 0.5, width * 0.34, height * 0.42, look.lowland, sides);
    group.add(foot);

    const waist = ctx.taper(width * 0.34, width * 0.30, height * 0.14, look.highland, sides);
    waist.position.y = height * 0.42;
    waist.rotation.y = rng.range(0, 1.1);
    group.add(waist);

    const cap = ctx.taper(width * 0.46, width * 0.2, height * 0.5, look.surface, sides);
    cap.position.y = height * 0.56;
    cap.rotation.y = rng.range(0, 1.1);
    // A lean, because a stone the wind cut is a stone the wind pushed.
    cap.rotation.z = rng.jitter() * 0.16;
    group.add(cap);

    if (rng.chance(0.45)) {
      const chip = ctx.box(width * 0.3, height * 0.16, width * 0.26, look.lowland);
      chip.position.set(rng.jitter() * width * 0.5, 0, rng.jitter() * width * 0.5);
      chip.rotation.y = rng.range(0, 1.5);
      group.add(chip);
    }
    return group;
  },
};
