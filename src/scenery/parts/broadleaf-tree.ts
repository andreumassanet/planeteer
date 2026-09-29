import type { RegionStyle, ScenicPart } from '../contract.ts';
import type { Rng } from '../random.ts';
import { PALETTE } from '../../theme.ts';
import { solidTree, treeForm } from '../tree-forms.ts';

/**
 * Broadleaf tree: a round crown of leaf clusters over a leaning bole, built in
 * code (`tree-forms.ts`) — and, in the north, a birch: a pale slender bole
 * with small clusters stacked up it, which is what a broadleaf is there.
 *
 * Until 2026-09-28 it was one of Kenney's Nature Kit trees, and before
 * 2026-09-17 lobes and tapers built here; the history is in git. What
 * survives is the declaration: the height range, the footprint every wood
 * keeps its spacing by, and the colours a region paints.
 */

const FOOTPRINT = 7.4;

/** The share of a region's broadleaves that are birches. */
const BIRCH: Partial<Record<string, number>> = {
  nordic: 0.55,
  'east-europe': 0.4,
  'north-america': 0.2,
  'atlantic-europe': 0.12,
  'east-asia': 0.12,
};

function formOf(rng: Rng, style: RegionStyle) {
  const birch = rng.chance(BIRCH[style.id] ?? 0);
  return treeForm(birch ? 'birch' : 'broadleaf', rng, {
    height: rng.range(9, 16),
    reach: FOOTPRINT - 0.05,
    leaf: rng.pick(style.foliage),
    leaf2: rng.pick(style.foliage),
    bark: birch ? PALETTE.bone : rng.pick([PALETTE.bark, PALETTE.brown, PALETTE.darkOlive]),
  });
}

export const broadleafTree: ScenicPart = {
  id: 'broadleaf-tree',
  name: 'Broadleaf tree',
  kind: 'tree',
  footprint: FOOTPRINT,
  note: "A round crown of leaf clusters in the region's greens on a bark-brown bole; a birch in the north.",
  build: (ctx, rng, style) => solidTree(ctx, formOf(rng, style)),
  form: formOf,
};
