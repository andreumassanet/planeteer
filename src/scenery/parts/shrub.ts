import type { ScenicPart } from '../contract.ts';
import { rolePaint, sceneryModel } from '../contract.ts';

/**
 * Shrub: one of Kenney's bushes (Nature Kit, CC0) in the region's foliage.
 */

const MODELS = ['plant-bushLarge', 'plant-bush', 'plant-bushDetailed'] as const;
const FOOTPRINT = 2.5;

export const shrub: ScenicPart = {
  id: 'shrub',
  name: 'Shrub',
  kind: 'scatter',
  footprint: FOOTPRINT,
  note: "Kenney bush, large, plain or detailed, in the region's greens. Texture on the ground, not a plant.",

  build(ctx, rng, style) {
    const id = rng.pick([...MODELS]);
    const paint = rolePaint(sceneryModel(id), [[/grass|leaf/i, rng.pick(style.foliage)]]);
    return ctx.fitted(id, {
      height: rng.range(0.8, 1.7),
      // Inside the footprint, which the contract holds to 0.05, and by a seeded
      // share of it: a model wider than tall is fitted by its radius, and a
      // fixed radius would give every one of it one silhouette.
      radius: (FOOTPRINT - 0.02) * rng.range(0.6, 1),
      yaw: rng.range(0, Math.PI * 2),
      // Darker under the crown and lit on top: see `ModelFit.shade`.
      shade: { slots: /leaf|grass/i, bottom: 0.8, top: 1.12 },
    }, paint);
  },
};
