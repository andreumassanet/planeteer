import type { RegionStyle, ScenicPart } from '../contract.ts';
import type { Rng } from '../random.ts';
import { PALETTE } from '../../theme.ts';
import { solidTree, treeForm } from '../tree-forms.ts';

/**
 * Umbrella acacia: a bole forking into two or three limbs under a flat crown
 * of fine leaves (`tree-forms.ts`), which is the savanna's one shape. Kenney's
 * plateau tree until 2026-09-28.
 */

const FOOTPRINT = 6.4;

function formOf(rng: Rng, style: RegionStyle) {
  return treeForm('acacia', rng, {
    height: rng.range(8.5, 13),
    reach: FOOTPRINT - 0.05,
    leaf: rng.pick(style.foliage),
    leaf2: rng.pick(style.foliage),
    bark: rng.pick([PALETTE.bark, PALETTE.brown, PALETTE.darkOlive]),
  });
}

export const acaciaTree: ScenicPart = {
  id: 'acacia-tree',
  name: 'Umbrella acacia',
  kind: 'tree',
  footprint: FOOTPRINT,
  note: 'A flat crown of fine leaves on forking limbs. The savanna in one shape.',
  build: (ctx, rng, style) => solidTree(ctx, formOf(rng, style)),
  form: formOf,
};
