import type { ScenicPart } from '../contract.ts';
import { rolePaint, sceneryModel } from '../contract.ts';

/**
 * Cypress: Kenney's cone tree (Nature Kit, CC0) narrowed to 0.55 of itself
 * across, which is the flame a Mediterranean cypress is. No pack in the style
 * has a cypress.
 */

const MODELS = ['tree-cone'] as const;
const FOOTPRINT = 3.1;

export const cypressTree: ScenicPart = {
  id: 'cypress-tree',
  name: 'Cypress',
  kind: 'tree',
  footprint: FOOTPRINT,
  note: 'Kenney cone tree drawn narrow: a dark flame over a short trunk.',

  build(ctx, rng, style) {
    const { palette } = ctx;
    const id = rng.pick([...MODELS]);
    const paint = rolePaint(sceneryModel(id), [[/leaf/i, rng.pick(style.foliage)], [/wood|bark/i, rng.pick([palette.bark, palette.brown])]]);
    return ctx.fitted(id, {
      height: rng.range(9, 16),
      // A hair inside the footprint, which the contract holds to 0.05.
      radius: FOOTPRINT - 0.02,
      yaw: rng.range(0, Math.PI * 2),
      // Darker under the crown and lit on top: see `ModelFit.shade`.
      shade: { slots: /leaf|grass/i, bottom: 0.8, top: 1.12 },
      squash: 0.55,
    }, paint);
  },
};
