import type { ScenicPart } from '../contract.ts';
import { DOOR_HEIGHT, buildingPaint, sceneryModel } from '../contract.ts';
import { isGlass } from '../../models.ts';

/**
 * City block: one of Kenney's City Kit (Commercial) buildings (CC0), painted in
 * the region's walls, roofs and trim, its glass lit after dark. A near town's
 * `terrace-block`; see `RegionStyle.assets`.
 */

// Not `c` and `e`: low and wide, they cannot be squashed into a cell's plan at
// a block's height without falling under the kind's floor of 13.
const MODELS = Array.from('abdfh', (t) => `commercial-${t}`);
const FOOTPRINT = 8.4;

export const cityBlock: ScenicPart = {
  id: 'city-block',
  name: 'City block',
  kind: 'block',
  footprint: FOOTPRINT,
  triangles: 1800,
  note: "Kenney commercial block in the region's walls, for a near town's streets.",

  build(ctx, rng, style) {
    const id = rng.pick(MODELS);
    const paint = buildingPaint(
      sceneryModel(id),
      { walls: rng.pick(style.walls), roofs: rng.pick(style.roofs), trim: rng.pick(style.trim) },
      isGlass,
    );
    // The shop storey (0.4 of the kit's units) is what grows where the plan holds the block short of its door.
    return ctx.fitted(
      id,
      { door: DOOR_HEIGHT * rng.range(1, 1.25), lift: 0.4, radius: FOOTPRINT - 0.02, width: 11, length: 9.5, narrow: true, windows: isGlass },
      paint,
    );
  },
};
