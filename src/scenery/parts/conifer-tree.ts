import type { ScenicPart } from '../contract.ts';
import { rolePaint, sceneryModel } from '../contract.ts';

/**
 * Conifer: one of Kenney's pines (Nature Kit, CC0) in the region's foliage.
 */

const MODELS = ['tree-pineTallA', 'tree-pineTallB', 'tree-pineRoundC', 'tree-pineDefaultA', 'tree-pineSmallA'] as const;
const FOOTPRINT = 5.3;

export const coniferTree: ScenicPart = {
  id: 'conifer-tree',
  name: 'Conifer',
  kind: 'tree',
  footprint: FOOTPRINT,
  note: "Kenney pine, tall, round, default or small, in the region's darkest greens.",

  build(ctx, rng, style) {
    const { palette } = ctx;
    const id = rng.pick([...MODELS]);
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
