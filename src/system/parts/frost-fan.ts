/**
 * A frost fan: what a cold world's ground does when the sun reaches it.
 *
 * On Mars these are real and they are seasonal — sunlight gets under the
 * translucent CO2 slab, the bottom of it goes straight to gas, and the jet
 * carries dark dust out across the ice in a fan pointed downwind. They are the
 * single most alien-looking thing photographed on another planet's surface and
 * they are two triangles of dark on white.
 *
 * Which is exactly why this part is flat and why that is not a shortcut. The
 * trap it has to avoid instead is the other one: **a sheet laid on the ground
 * is laid on a surface nobody can see.** The land mesh is a piecewise-linear
 * approximation of `reliefAt`, so a decal at zero is buried in one town in
 * twelve; `GROUND_LIFT` on Earth is 0.7 for that reason and this carries the
 * same lift for the same reason.
 */
import type { Decoration } from '../contract.ts';

/** The same 0.7 `settlements.ts` uses, and for the same measurement. */
const LIFT = 0.7;

export const FROST_FAN: Decoration = {
  id: 'frost-fan',
  footprint: 8.2,
  bodies: [],
  build(ctx, rng, look) {
    const group = new ctx.THREE.Group();
    const reach = rng.range(3.5, 9.0);
    const yaw = rng.range(0, Math.PI * 2);
    const blades = rng.between(3, 6);

    // The vent itself: a low collar, so the fan has something it comes out of.
    const vent = ctx.taper(rng.range(0.5, 0.9), rng.range(0.3, 0.6), rng.range(0.25, 0.5), look.lowland, 5);
    vent.position.y = LIFT;
    group.add(vent);

    for (let n = 0; n < blades; n++) {
      // All within a quadrant of one bearing: a fan is a *direction*, and one
      // that spreads evenly round the vent is a splat.
      const angle = yaw + (n / Math.max(1, blades - 1) - 0.5) * rng.range(0.5, 1.1);
      const length = reach * rng.range(0.5, 1);
      const blade = ctx.box(rng.range(0.35, 0.9), 0.08, length, look.lowland);
      blade.position.set(
        Math.sin(angle) * length * 0.5,
        LIFT + n * 0.02,
        Math.cos(angle) * length * 0.5,
      );
      blade.rotation.y = angle;
      group.add(blade);
    }
    return group;
  },
};
