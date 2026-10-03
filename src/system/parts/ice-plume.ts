/**
 * A plume of ice: the outer system's only vertical feature.
 *
 * Enceladus and Triton both do this and Triton's are photographed — nitrogen
 * driven up eight kilometres and then sheared flat by the wind at the top, so
 * the shape is a **column with a horizontal cap**, which is a silhouette
 * nothing else in this project has.
 *
 * The cap is the whole part, drawn as the plume it is: puffs up a leaning
 * column and a trail of flattened ones sheared off at the top. A column on its own is `iron-spire` in a lighter
 * colour, and the distinctness measure `pnpm system` runs would say so: it
 * rasterises the side elevation in **world units and not normalised into its
 * own box**, because a bicycle and a four-wheel-drive came out 0.889 alike
 * under normalisation and 0.06 apart in the units they are seen at.
 */
import type * as THREE from 'three';
import type { Decoration } from '../contract.ts';

export const ICE_PLUME: Decoration = {
  id: 'ice-plume',
  footprint: 4.1,
  bodies: [],
  build(ctx, rng, look) {
    const group = new ctx.THREE.Group();
    const height = rng.range(6.0, 13.0);
    const stem = rng.range(0.35, 0.75);

    const vent = ctx.taper(stem * 2.4, stem * 1.5, height * 0.06, look.lowland, 6);
    group.add(vent);

    // The column: puffs of vapour stacked up the plume, each a little wider
    // and further downwind than the one under it — a plume is gas, and a
    // column of boxes with a slab on top read as a hammer stood on the clouds.
    const puff = (radius: number, colour: number): THREE.Mesh => {
      const mesh = new ctx.THREE.Mesh(new ctx.THREE.SphereGeometry(radius, 6, 3), ctx.toon(colour));
      return mesh;
    };
    const lean = rng.range(0.03, 0.07);
    const steps = rng.between(4, 5);
    let y = height * 0.06;
    let x = 0;
    for (let n = 0; n < steps; n++) {
      const t = n / (steps - 1);
      const r = stem * (1.1 + t * 0.9);
      const one = puff(r, n % 2 === 0 ? look.cap : ctx.tone(look.cap, 0.92));
      one.scale.y = 0.85;
      one.position.set(x, y + r * 0.7, rng.jitter() * r * 0.2);
      group.add(one);
      y += (height * 0.7) / steps;
      x += height * lean * t * 0.5;
    }

    // The shear: at the top the wind takes it flat, a row of wide flattened
    // puffs trailing downwind — still the silhouette nothing else has.
    const spread = rng.range(1.6, 2.4);
    const trail = 3;
    for (let n = 0; n < trail; n++) {
      const r = (spread / trail) * rng.range(0.9, 1.3);
      const one = puff(r, look.cap);
      one.scale.set(1.4, 0.45, 0.9);
      one.position.set(x + n * r * 0.9, y + r * 0.3 - n * 0.15 * r, rng.jitter() * r * 0.3);
      group.add(one);
    }
    return group;
  },
};
