import type { ScenicPart } from '../contract.ts';
import { rolePaint, sceneryModel } from '../contract.ts';

/**
 * Umbrella acacia: Kenney's plateau tree (Nature Kit, CC0), flat tiers of
 * canopy on a bare trunk, which is the savanna's one shape.
 */

const MODELS = ['tree-plateau'] as const;
const FOOTPRINT = 6.4;

export const acaciaTree: ScenicPart = {
  id: 'acacia-tree',
  name: 'Umbrella acacia',
  kind: 'tree',
  footprint: FOOTPRINT,
  note: 'Kenney plateau tree: tiers of flat canopy on a bare trunk. The savanna in one shape.',

  build(ctx, rng, style) {
    const { palette } = ctx;
    const id = rng.pick([...MODELS]);
    const paint = rolePaint(sceneryModel(id), [[/leaf/i, rng.pick(style.foliage)], [/wood|bark/i, rng.pick([palette.bark, palette.brown, palette.darkOlive])]]);
    return ctx.fitted(id, {
      height: rng.range(8.5, 13),
      // A hair inside the footprint, which the contract holds to 0.05.
      radius: FOOTPRINT - 0.02,
      yaw: rng.range(0, Math.PI * 2),
      // Darker under the crown and lit on top: see `ModelFit.shade`.
      shade: { slots: /leaf|grass/i, bottom: 0.8, top: 1.12 },
    }, paint);
  },
};
