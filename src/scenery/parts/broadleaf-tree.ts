import type { ScenicPart } from '../contract.ts';
import { rolePaint, sceneryModel } from '../contract.ts';

/**
 * Broadleaf tree: one of Kenney's broadleaf trees (Nature Kit, CC0) — oak,
 * default, fat, tall or simple — in the region's foliage on a bark trunk.
 *
 * Until 2026-09-17 every plant in the kit was built here from lobes, tapers and
 * blobs; that history, and why a tree is anything but a lollipop, is in the git
 * history of this file. What survives is the declaration: the height range, the
 * footprint every wood keeps its spacing by, and the colours a region paints.
 */

const MODELS = ['tree-oak', 'tree-default', 'tree-fat', 'tree-tall', 'tree-simple'] as const;
const FOOTPRINT = 7.4;

export const broadleafTree: ScenicPart = {
  id: 'broadleaf-tree',
  name: 'Broadleaf tree',
  kind: 'tree',
  footprint: FOOTPRINT,
  note: "Kenney oak, round, fat, tall or simple tree in the region's greens on a bark-brown trunk.",

  build(ctx, rng, style) {
    const { palette } = ctx;
    const id = rng.pick([...MODELS]);
    const paint = rolePaint(sceneryModel(id), [[/leaf/i, rng.pick(style.foliage)], [/wood|bark/i, rng.pick([palette.bark, palette.brown, palette.darkOlive])]]);
    return ctx.fitted(id, {
      height: rng.range(9, 16),
      // A hair inside the footprint, which the contract holds to 0.05.
      radius: FOOTPRINT - 0.02,
      yaw: rng.range(0, Math.PI * 2),
      // Darker under the crown and lit on top: see `ModelFit.shade`.
      shade: { slots: /leaf|grass/i, bottom: 0.8, top: 1.12 },
    }, paint);
  },
};
