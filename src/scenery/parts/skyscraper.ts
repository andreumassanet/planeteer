import type { ScenicPart } from '../contract.ts';
import { DOOR_HEIGHT, buildingPaint, sceneryModel } from '../contract.ts';
import { isGlass } from '../../models.ts';

/**
 * Skyscraper: one of Kenney's City Kit (Commercial) towers (CC0), painted in
 * the region's walls, roofs and trim, its glass lit after dark. A near city's
 * `tower-block`; see `RegionStyle.assets`.
 */

const MODELS = Array.from('abcde', (t) => `skyscraper-${t}`);
const FOOTPRINT = 8.2;

export const skyscraper: ScenicPart = {
  id: 'skyscraper',
  name: 'Skyscraper',
  kind: 'block',
  footprint: FOOTPRINT,
  triangles: 1900,
  note: "Kenney tower in the region's walls, for a near city's middle.",

  build(ctx, rng, style) {
    const id = rng.pick(MODELS);
    const paint = buildingPaint(
      sceneryModel(id),
      { walls: rng.pick(style.walls), roofs: rng.pick(style.roofs), trim: rng.pick(style.trim) },
      isGlass,
    );
    // The tower keeps its height and its lobby storey (0.4 of the kit's units) grows to a door's.
    return ctx.fitted(
      id,
      { height: rng.range(26, 33.5), door: DOOR_HEIGHT, lift: 0.4, radius: FOOTPRINT - 0.02, width: 9.5, length: 9.5, narrow: true, windows: isGlass },
      paint,
    );
  },
};
