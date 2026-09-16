import type { ScenicPart } from '../contract.ts';
import { rolePaint, sceneryModel } from '../contract.ts';

/**
 * Conifer: one of Kenney's pines (Nature Kit, CC0) in the region's foliage.
 */

/**
 * Weighted towards the two tall pines, which are 78 triangles against the round
 * ones' 164 to 230: drawn evenly the boreal forest came out at twice the code
 * conifer's triangles (Finland, detail 0.5, 36,520 -> 75,610, 2026-09-17).
 */
const MODELS = [
  { item: 'tree-pineTallA', weight: 3 },
  { item: 'tree-pineTallB', weight: 3 },
  { item: 'tree-pineSmallA', weight: 1 },
  { item: 'tree-pineRoundC', weight: 1 },
  { item: 'tree-pineDefaultA', weight: 1 },
];
const FOOTPRINT = 5.3;

export const coniferTree: ScenicPart = {
  id: 'conifer-tree',
  name: 'Conifer',
  kind: 'tree',
  footprint: FOOTPRINT,
  note: "Kenney pine, tall, round, default or small, in the region's darkest greens.",

  build(ctx, rng, style) {
    const { palette } = ctx;
    const id = rng.weighted(MODELS);
    const paint = rolePaint(sceneryModel(id), [[/leaf/i, rng.pick(style.foliage)], [/wood|bark/i, rng.pick([palette.bark, palette.brown])]]);
    return ctx.fitted(id, {
      height: rng.range(9, 17),
      // A hair inside the footprint, which the contract holds to 0.05.
      radius: FOOTPRINT - 0.02,
      yaw: rng.range(0, Math.PI * 2),
      // Darker under the crown and lit on top: see `ModelFit.shade`.
      shade: { slots: /leaf|grass/i, bottom: 0.8, top: 1.12 },
    }, paint);
  },
};
