/**
 * A plume of ice: the outer system's only vertical feature.
 *
 * Enceladus and Triton both do this and Triton's are photographed — nitrogen
 * driven up eight kilometres and then sheared flat by the wind at the top, so
 * the shape is a **column with a horizontal cap**, which is a silhouette
 * nothing else in this project has.
 *
 * The cap is the whole part. A column on its own is `iron-spire` in a lighter
 * colour, and the distinctness measure `pnpm system` runs would say so: it
 * rasterises the side elevation in **world units and not normalised into its
 * own box**, because a bicycle and a four-wheel-drive came out 0.889 alike
 * under normalisation and 0.06 apart in the units they are seen at.
 */
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

    const sections = rng.between(2, 3);
    let y = height * 0.06;
    for (let n = 0; n < sections; n++) {
      const run = (height * 0.72) / sections;
      const column = ctx.taper(stem * (1.3 - n * 0.2), stem * (1.1 - n * 0.2), run, look.cap, 5);
      column.position.y = y;
      // The shear starts before the top: a plume that goes straight up and then
      // turns is a lamp post with a hat on.
      column.rotation.z = (n / sections) * rng.range(0.05, 0.18);
      group.add(column);
      y += run * 0.98;
    }

    // The cap: wide, thin, and offset downwind of the stem. It is the one
    // feature that survives at the range this is seen from.
    const spread = rng.range(2.6, 5.0);
    const drift = rng.range(0.4, 1.4);
    const cap = ctx.box(spread, height * 0.1, spread * rng.range(0.5, 0.8), look.cap);
    cap.position.set(drift, y, rng.jitter() * drift * 0.5);
    cap.rotation.y = rng.range(0, 1.2);
    group.add(cap);
    return group;
  },
};
