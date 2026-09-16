import type { ScenicPart } from '../contract.ts';
import { rolePaint, sceneryModel } from '../contract.ts';

/**
 * Grass tuft: Kenney's grass leaves, its tall or short flat plant, or a red or
 * yellow flower in its leaves (Nature Kit, CC0),
 * in the region's foliage.
 */

const MODELS = ['grass-leafs', 'plant-flatTall', 'plant-flatShort', 'flower-redA', 'flower-yellowA'] as const;
const FOOTPRINT = 1.6;

export const grassTuft: ScenicPart = {
  id: 'grass-tuft',
  name: 'Grass tuft',
  kind: 'scatter',
  footprint: FOOTPRINT,
  note: "Kenney grass leaves or tall flat plant in the region's greens. Vertical strokes a shrub cannot make.",

  build(ctx, rng, style) {
    const id = rng.pick([...MODELS]);
    const paint = rolePaint(sceneryModel(id), [[/grass|leaf/i, rng.pick(style.foliage)]]);
    return ctx.fitted(id, {
      height: rng.range(1.3, 2.6),
      // Inside the footprint, which the contract holds to 0.05, and by a seeded
      // share of it: a model wider than tall is fitted by its radius, and a
      // fixed radius would give every tuft of it one silhouette.
      radius: (FOOTPRINT - 0.02) * rng.range(0.6, 1),
      yaw: rng.range(0, Math.PI * 2),
    }, paint);
  },
};
