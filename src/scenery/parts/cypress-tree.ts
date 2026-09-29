import type { RegionStyle, ScenicPart } from '../contract.ts';
import type { Rng } from '../random.ts';
import { PALETTE } from '../../theme.ts';
import { solidTree, treeForm } from '../tree-forms.ts';

/**
 * Cypress: the Mediterranean's dark flame, small clusters of fine leaves
 * stacked tight up a short bole (`tree-forms.ts`). Kenney's cone tree drawn
 * narrow until 2026-09-28; no pack in the style had a cypress.
 */

const FOOTPRINT = 3.1;

function formOf(rng: Rng, style: RegionStyle) {
  return treeForm('cypress', rng, {
    height: rng.range(9, 16),
    reach: FOOTPRINT - 0.05,
    leaf: rng.pick(style.foliage),
    leaf2: rng.pick(style.foliage),
    bark: rng.pick([PALETTE.bark, PALETTE.brown]),
  });
}

export const cypressTree: ScenicPart = {
  id: 'cypress-tree',
  name: 'Cypress',
  kind: 'tree',
  footprint: FOOTPRINT,
  note: 'A dark flame of small leaf clusters over a short bole.',
  build: (ctx, rng, style) => solidTree(ctx, formOf(rng, style)),
  form: formOf,
};
