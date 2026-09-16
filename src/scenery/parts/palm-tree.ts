import type { ScenicPart } from '../contract.ts';
import { rolePaint, sceneryModel } from '../contract.ts';

/**
 * Palm: one of Kenney's palms (Nature Kit, CC0), fronds in the region's
 * foliage on a brown or tan trunk.
 */

const MODELS = ['tree-palmTall', 'tree-palm', 'tree-palmBend'] as const;
const FOOTPRINT = 7.4;

export const palmTree: ScenicPart = {
  id: 'palm-tree',
  name: 'Palm',
  kind: 'tree',
  footprint: FOOTPRINT,
  note: "Kenney palm, tall, plain or bent, fronds in the region's greens.",

  build(ctx, rng, style) {
    const { palette } = ctx;
    const id = rng.pick([...MODELS]);
    const paint = rolePaint(sceneryModel(id), [[/leaf/i, rng.pick(style.foliage)], [/wood|bark/i, rng.pick([palette.brown, palette.tan, palette.bark])]]);
    return ctx.fitted(id, {
      height: rng.range(10, 15),
      // A hair inside the footprint, which the contract holds to 0.05.
      radius: FOOTPRINT - 0.02,
      yaw: rng.range(0, Math.PI * 2),
      // Darker under the crown and lit on top: see `ModelFit.shade`.
      shade: { slots: /leaf|grass/i, bottom: 0.8, top: 1.12 },
    }, paint);
  },
};
