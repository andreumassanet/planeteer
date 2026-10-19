import type { ScenicPart } from '../contract.ts';
import { DOOR_HEIGHT, buildingPaint, sceneryModel } from '../contract.ts';
import { isGlass } from '../../models.ts';

/**
 * Clapboard church: CreativeTrio's white wooden church with its steeple (Poly
 * Pizza, CC0), painted in the region's walls, roofs and trim, its windows lit
 * after dark. A near town's `steeple-church` where a church is built of boards
 * — North America, Oceania, the Nordic countries, the polar towns — and see
 * `RegionStyle.assets`. Its colours come through a JPEG palette, which the bake
 * reads by its blocks (`decodeJpeg` in `scripts/build-kit.ts`).
 */

const ID = 'church-clapboard';
const FOOTPRINT = 15.5;
/** The church's west door in the model's own units, under the trim at its head: its slot is the roof's too. */
const MODEL_DOOR = 0.19;

export const clapboardChurch: ScenicPart = {
  id: 'clapboard-church',
  name: 'Clapboard church',
  kind: 'civic',
  footprint: FOOTPRINT,
  triangles: 2300,
  note: "CreativeTrio's white wooden church, in the region's walls, for a near town's middle.",

  build(ctx, rng, style) {
    const paint = buildingPaint(
      sceneryModel(ID),
      { walls: rng.pick(style.walls), roofs: rng.pick(style.roofs), trim: rng.pick(style.trim) },
      isGlass,
    );
    return ctx.fitted(
      ID,
      { door: DOOR_HEIGHT * rng.range(1.05, 1.2), modelDoor: MODEL_DOOR, lift: MODEL_DOOR * 1.5, radius: FOOTPRINT - 0.02, width: 9.5, length: 15, narrow: true, yaw: 0, windows: isGlass },
      paint,
    );
  },
};
