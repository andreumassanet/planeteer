import type { ScenicPart } from '../contract.ts';
import { rolePaint, sceneryModel } from '../contract.ts';

/**
 * Boulder: one of Kenney's large stones (Nature Kit, CC0) in the region's own
 * stone, grey in Norway and red in the Australian centre.
 */

const MODELS = ['stone-largeA', 'stone-largeB', 'stone-largeC', 'stone-largeD'] as const;
const FOOTPRINT = 3.4;

export const boulder: ScenicPart = {
  id: 'boulder',
  name: 'Boulder',
  kind: 'scatter',
  footprint: FOOTPRINT,
  note: "Kenney stone, low and faceted, in the region's own rock.",

  build(ctx, rng, style) {
    const id = rng.pick([...MODELS]);
    const paint = rolePaint(sceneryModel(id), [[/stone|dirt|default/i, rng.pick(style.stone)], [/grass/i, rng.pick(style.foliage)]]);
    return ctx.fitted(id, {
      height: rng.range(1, 2.4),
      // Inside the footprint, which the contract holds to 0.05, and by a seeded
      // share of it: a model wider than tall is fitted by its radius, and a
      // fixed radius would give every one of it one silhouette.
      radius: (FOOTPRINT - 0.02) * rng.range(0.6, 1),
      yaw: rng.range(0, Math.PI * 2),
    }, paint);
  },
};
