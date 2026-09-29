import type { RegionStyle, ScenicPart } from '../contract.ts';
import type { Rng } from '../random.ts';
import { solidTree, treeForm } from '../tree-forms.ts';

/**
 * Shrub: two to four clusters of leaf cards on the ground (`tree-forms.ts`)
 * in the region's foliage; far off, a few soft lumps. One of Kenney's bushes
 * until 2026-09-28.
 */

const FOOTPRINT = 2.5;

function formOf(rng: Rng, style: RegionStyle) {
  return treeForm('bush', rng, {
    height: rng.range(0.8, 1.7),
    // Inside the footprint by a seeded share of it, so a hedge of them is not one silhouette.
    reach: (FOOTPRINT - 0.05) * rng.range(0.6, 1),
    leaf: rng.pick(style.foliage),
    leaf2: rng.pick(style.foliage),
    bark: 0,
  });
}

export const shrub: ScenicPart = {
  id: 'shrub',
  name: 'Shrub',
  kind: 'scatter',
  footprint: FOOTPRINT,
  note: "A few clusters of leaves in the region's greens. Texture on the ground, not a plant.",
  build: (ctx, rng, style) => solidTree(ctx, formOf(rng, style)),
  form: formOf,
};
