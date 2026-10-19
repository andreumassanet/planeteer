import type { ScenicPart } from '../contract.ts';
import { DOOR_HEIGHT, buildingPaint, sceneryModel } from '../contract.ts';
import { isGlass } from '../../models.ts';

/**
 * Suburban house: one of Kenney's City Kit (Suburban) houses (CC0), painted in
 * the region's walls, roofs and trim (`buildingPaint`), its glass lit after dark.
 *
 * Drawn only by a near town of a region whose `assets` name it (see
 * `RegionStyle.assets`): beyond that rank the same plot is a `gabled-house`.
 */

// Not `f`, `g`, `j`, `m`, `n`, `s` and `u`: wide for their door, a cell's plan
// would squash them and stretch their walls by 1.8 to 2.3 to stand a door of
// `DOOR_HEIGHT`. The rest stretch by 1.75 at most.
const MODELS = Array.from('achiklopqr', (t) => `suburban-${t}`);
const FOOTPRINT = 7.4;
/**
 * Where the walls stop, in the kit's units: Kenney's houses stand a storey 0.4
 * tall, and the soffit of a one-storey house's eaves is at 0.4 and of a
 * two-storey house's at 0.8 (every model 0.9 tall or more).
 */
const wallsOf = (height: number): number => (height >= 0.9 ? 0.8 : 0.4);

export const suburbanHouse: ScenicPart = {
  id: 'suburban-house',
  name: 'Suburban house',
  kind: 'dwelling',
  footprint: FOOTPRINT,
  triangles: 1650,
  note: "Kenney suburban house in the region's walls and roofs, for a near town.",

  build(ctx, rng, style) {
    const id = rng.pick(MODELS);
    const model = sceneryModel(id);
    const paint = buildingPaint(
      model,
      { walls: rng.pick(style.walls), roofs: rng.pick(style.roofs), trim: rng.pick(style.trim) },
      isGlass,
    );
    const lift = wallsOf(model.box.max.y - model.box.min.y);
    return ctx.fitted(
      id,
      { door: DOOR_HEIGHT * rng.range(1, 1.1), lift, radius: FOOTPRINT - 0.02, width: 9, length: 9, narrow: true, windows: isGlass },
      paint,
    );
  },
};
