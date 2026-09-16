import type { ScenicPart } from '../contract.ts';
import { rolePaint, sceneryModel } from '../contract.ts';

/**
 * Saguaro: Kenney's cacti (Nature Kit, CC0) in the region's foliage.
 */

const MODELS = ['cactus-tall', 'cactus-short'] as const;
const FOOTPRINT = 2.9;

export const cactus: ScenicPart = {
  id: 'cactus',
  name: 'Saguaro',
  kind: 'tree',
  footprint: FOOTPRINT,
  note: "Kenney cactus, tall or short, in the region's greens. Rare on purpose: desert cover is 0.03.",

  build(ctx, rng, style) {
    const id = rng.pick([...MODELS]);
    const paint = rolePaint(sceneryModel(id), [[/leaf/i, rng.pick(style.foliage)]]);
    return ctx.fitted(id, {
      height: rng.range(5, 8.5),
      // A hair inside the footprint, which the contract holds to 0.05.
      radius: FOOTPRINT - 0.02,
      yaw: rng.range(0, Math.PI * 2),
      // Darker under the crown and lit on top: see `ModelFit.shade`.
      shade: { slots: /leaf|grass/i, bottom: 0.8, top: 1.12 },
    }, paint);
  },
};
