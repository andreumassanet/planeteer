/**
 * Slabs: the ground in Venera 13's photograph.
 *
 * On 1 March 1982 the lander's two cameras showed the first colour view of
 * another planet's surface, and what was in it was not boulders: flat plates
 * of layered basalt a few centimetres thick, broken into slabs and lying
 * stepped over one another, with dark soil in the cracks. So this is plates
 * and not lumps — a low pile of thin boxes, each a little proud of the one
 * under it, so the pen draws every layer.
 *
 * Nothing is tilted. A tipped box puts a corner under `y = 0`, and a plate
 * resting on another reads as layered just as well from a standing eye.
 */
import type { Decoration } from '../contract.ts';

export const VENUS_SLAB: Decoration = {
  id: 'venus-slab',
  footprint: 4.0,
  bodies: ['venus'],
  build(ctx, rng, look) {
    const group = new ctx.THREE.Group();
    const plates = rng.between(3, 6);
    const colours = [look.lowland, look.surface, look.highland];
    let y = 0;
    let x = 0;
    let z = 0;
    for (let n = 0; n < plates; n++) {
      const w = rng.range(1.6, 3.4) * (1 - n * 0.1);
      const d = rng.range(1.2, 2.6) * (1 - n * 0.1);
      const t = rng.range(0.16, 0.42);
      const plate = ctx.box(w, t, d, colours[n % colours.length]!);
      plate.position.set(x, y, z);
      plate.rotation.y = rng.range(-0.6, 0.6);
      group.add(plate);
      // The next one rests on this one, shifted toward an edge: a step, not a
      // stack, which is what weathered flow layers do.
      y += t;
      x = Math.max(-1.2, Math.min(1.2, x + rng.jitter() * w * 0.32));
      z = Math.max(-1.2, Math.min(1.2, z + rng.jitter() * d * 0.32));
      if (rng.chance(0.3)) y = 0;
    }
    // A loose chip or two lying off the pile.
    const chips = rng.between(1, 2);
    for (let n = 0; n < chips; n++) {
      const angle = rng.range(0, Math.PI * 2);
      const r = rng.range(2.6, 3.4);
      const chip = ctx.box(rng.range(0.5, 0.9), rng.range(0.1, 0.2), rng.range(0.4, 0.7), look.lowland);
      chip.position.set(Math.cos(angle) * r, 0, Math.sin(angle) * r);
      chip.rotation.y = angle;
      group.add(chip);
    }
    return group;
  },
};
