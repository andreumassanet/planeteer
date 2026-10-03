/**
 * Hollows: the bright flakes at the edge of one of Mercury's own landforms.
 *
 * A hollow is a shallow, rimless, flat-floored pit, bright and faintly blue,
 * found on no other body; the leading idea is that something volatile in the
 * rock — sulphur is the suspect — sublimes in the sun and the ground slumps
 * as it goes. What a walker would see at the scale of a body is the crust
 * peeling: thin plates of the bright stuff, flat on the ground, stepped like
 * the pit's own edge. Flat on purpose: it is the one decoration on the planet
 * that is mostly colour.
 */
import type { Decoration } from '../contract.ts';
import { PALETTE } from '../../theme.ts';

export const MERCURY_HOLLOW_GLINT: Decoration = {
  id: 'mercury-hollow-glint',
  footprint: 2.6,
  bodies: ['mercury'],
  build(ctx, rng) {
    const group = new ctx.THREE.Group();
    const plates = rng.between(4, 7);
    for (let k = 0; k < plates; k++) {
      const width = k === 0 ? rng.range(1.4, 1.8) : rng.range(0.5, 1.2);
      const depth = width * rng.range(0.5, 0.9);
      // Kept inside the footprint: the offset plus the plate's half-diagonal.
      const reach = Math.max(0, 2.5 - Math.hypot(width, depth) / 2);
      const out = k === 0 ? reach : rng.range(0, reach);
      const angle = rng.range(0, Math.PI * 2);
      const colour = k % 3 === 0 ? PALETTE.skyBlue : k % 3 === 1 ? PALETTE.white : PALETTE.cream;
      const plate = ctx.box(width, rng.range(0.1, 0.32), depth, colour);
      plate.position.set(Math.cos(angle) * out, 0, Math.sin(angle) * out);
      plate.rotation.y = rng.range(0, Math.PI);
      group.add(plate);
    }
    // One plate stacked on another: the step of the pit's edge.
    const step = ctx.box(rng.range(0.6, 0.9), 0.2, rng.range(0.4, 0.6), ctx.tone(PALETTE.skyBlue, 1.15));
    step.position.y = 0.3;
    step.rotation.y = rng.range(0, Math.PI);
    group.add(step);
    return group;
  },
};
