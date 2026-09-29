import type { RegionStyle, ScenicPart } from '../contract.ts';
import type { Rng } from '../random.ts';
import { PALETTE } from '../../theme.ts';
import { solidTree, treeForm } from '../tree-forms.ts';

/**
 * Palm: a curving ringed trunk and a head of drooping fronds (`tree-forms.ts`),
 * fronds in the region's foliage on a brown or tan trunk. A Kenney palm until
 * 2026-09-28.
 */

const FOOTPRINT = 7.4;

function formOf(rng: Rng, style: RegionStyle) {
  return treeForm('palm', rng, {
    height: rng.range(10, 15),
    reach: FOOTPRINT - 0.05,
    leaf: rng.pick(style.foliage),
    leaf2: rng.pick(style.foliage),
    bark: rng.pick([PALETTE.brown, PALETTE.tan, PALETTE.bark]),
  });
}

export const palmTree: ScenicPart = {
  id: 'palm-tree',
  name: 'Palm',
  kind: 'tree',
  footprint: FOOTPRINT,
  note: "A curving ringed trunk under drooping fronds in the region's greens.",
  build: (ctx, rng, style) => solidTree(ctx, formOf(rng, style)),
  form: formOf,
};
