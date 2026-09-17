import type { ScenicPart } from '../contract.ts';
import { buildingPaint, sceneryModel } from '../contract.ts';
import { isGlass } from '../../models.ts';

/**
 * Suburban house: one of Kenney's City Kit (Suburban) houses (CC0), painted in
 * the region's walls, roofs and trim (`buildingPaint`), its glass lit after dark.
 *
 * Drawn only by a near town of a region whose `assets` name it (see
 * `RegionStyle.assets`): beyond that rank the same plot is a `gabled-house`.
 */

const MODELS = Array.from('acfghijklmnopqrsu', (t) => `suburban-${t}`);
const FOOTPRINT = 9;

export const suburbanHouse: ScenicPart = {
  id: 'suburban-house',
  name: 'Suburban house',
  kind: 'dwelling',
  footprint: FOOTPRINT,
  triangles: 1650,
  note: "Kenney suburban house in the region's walls and roofs, for a near town.",

  build(ctx, rng, style) {
    const id = rng.pick(MODELS);
    const paint = buildingPaint(
      sceneryModel(id),
      { walls: rng.pick(style.walls), roofs: rng.pick(style.roofs), trim: rng.pick(style.trim) },
      isGlass,
    );
    return ctx.fitted(id, { height: rng.range(8, 12), radius: FOOTPRINT - 0.02, windows: isGlass }, paint);
  },
};
