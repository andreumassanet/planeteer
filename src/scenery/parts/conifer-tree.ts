import type { RegionStyle, ScenicPart } from '../contract.ts';
import type { Rng } from '../random.ts';
import { PALETTE } from '../../theme.ts';
import { solidTree, treeForm } from '../tree-forms.ts';

/**
 * Conifer: a spire, and tiers of drooping boughs of needles round it, fewer
 * and shorter up it (`tree-forms.ts`); far off, a stack of cones. A Kenney
 * pine until 2026-09-28.
 */

const FOOTPRINT = 5.3;

function formOf(rng: Rng, style: RegionStyle) {
  return treeForm('conifer', rng, {
    height: rng.range(9, 17),
    reach: FOOTPRINT - 0.05,
    leaf: rng.pick(style.foliage),
    leaf2: rng.pick(style.foliage),
    bark: rng.pick([PALETTE.bark, PALETTE.brown]),
  });
}

export const coniferTree: ScenicPart = {
  id: 'conifer-tree',
  name: 'Conifer',
  kind: 'tree',
  footprint: FOOTPRINT,
  note: "Tiers of drooping boughs round a spire, in the region's greens.",
  build: (ctx, rng, style) => solidTree(ctx, formOf(rng, style)),
  form: formOf,
};
