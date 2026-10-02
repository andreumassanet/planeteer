/**
 * What lies about on the Moon besides the plain boulder every crust has.
 *
 * They live here and not in `src/system/parts/` for one reason: that directory
 * is checked against the bodies in `src/system/bodies/`, and the Moon is not
 * one of them (the orrery would draw it on top of Earth), so a part only the
 * Moon names would be reported as one nothing builds. The budgets are the
 * system's all the same — 220 triangles, 12 meshes, 4 colours.
 *
 * **Nothing here is weathered**, and that is the read: no wind, no water, no
 * frost to round a stone. A lunar boulder is as angular as the day the impact
 * that threw it broke it, so these are boxes and five-sided prisms set at odd
 * angles, never the waisted ventifacts of Mars.
 */

import type { Decoration } from '../../../system/contract.ts';

/**
 * A blocky ejecta field: four to seven angular blocks, the largest half buried,
 * the way the rim of a fresh crater is strewn. The commonest thing on the
 * Moon after dust, and the reason the rays are bright: fresh broken rock.
 */
export const MOON_BLOCKS: Decoration = {
  id: 'moon-blocks',
  footprint: 3.2,
  bodies: [],
  build(ctx, rng, look) {
    const group = new ctx.THREE.Group();
    const count = rng.between(4, 7);
    for (let k = 0; k < count; k++) {
      const size = rng.range(0.35, 1.3) * (k === 0 ? 1.6 : 1);
      const block = ctx.box(size * rng.range(0.8, 1.4), size * rng.range(0.5, 0.9), size * rng.range(0.8, 1.3), k % 3 === 0 ? look.lowland : look.surface);
      const a = rng.range(0, Math.PI * 2);
      const d = k === 0 ? 0 : rng.range(0.8, 2.0);
      block.position.set(Math.sin(a) * d, -size * 0.12, Math.cos(a) * d);
      block.rotation.set(rng.jitter() * 0.25, rng.range(0, Math.PI), rng.jitter() * 0.25);
      group.add(block);
    }
    return group;
  },
};

/**
 * A split boulder, after the one at Station 6 of Apollo 17: a house-sized rock
 * that rolled down the North Massif and broke in two as it stopped, and that
 * Harrison Schmitt was photographed beside. Two halves of one prism with a
 * crack you could walk into, and a scatter of the chips.
 */
export const MOON_SPLIT_ROCK: Decoration = {
  id: 'moon-split-rock',
  footprint: 3.6,
  bodies: [],
  build(ctx, rng, look) {
    const group = new ctx.THREE.Group();
    const width = rng.range(1.6, 2.6);
    const height = rng.range(1.6, 3.0);
    const gap = rng.range(0.25, 0.5);
    const sides = rng.between(5, 6);
    for (const side of [-1, 1]) {
      const half = ctx.taper(width * 0.62, width * 0.4, height, side < 0 ? look.surface : look.lowland, sides);
      half.scale.x = 0.55;
      const holder = new ctx.THREE.Group();
      holder.add(half);
      holder.position.x = side * (width * 0.36 + gap / 2);
      holder.rotation.z = -side * rng.range(0.04, 0.14);
      group.add(holder);
    }
    for (let k = 0; k < 3; k++) {
      const size = rng.range(0.3, 0.6);
      const chip = ctx.box(size, size * 0.7, size, look.surface);
      const a = rng.range(0, Math.PI * 2);
      chip.position.set(Math.sin(a) * width * 1.05, 0, Math.cos(a) * width * 1.05);
      chip.rotation.y = rng.range(0, Math.PI);
      group.add(chip);
    }
    group.rotation.y = rng.range(0, Math.PI * 2);
    return group;
  },
};

export const MOON_DECORATIONS: readonly Decoration[] = [MOON_BLOCKS, MOON_SPLIT_ROCK];
