import { radiusOf } from '../places.ts';
import { CARRIAGEWAY_HALF } from '../scenery/grid.ts';

export interface RoadClass {
  name: string;
  /** Carriageway width in world units. A person is `AVATAR_HEIGHT`, 3.77. */
  width: number;
  /**
   * How far from the eye the class is drawn, in world units, before the
   * detail knob scales it: zooming out drops the lanes first and keeps the
   * trunks, as a map does. The `road` row sets how busy the world looks from
   * the air.
   */
  reach: number;
}

/**
 * Every class is the width of the street it arrives in (`CARRIAGEWAY_HALF` in
 * `scenery/grid.ts`), so a road never narrows into a town; the town's street
 * widens to it at the gate (`gateMouth`). The classes differ only in `reach`.
 */
export const ROAD_CLASSES: readonly RoadClass[] = [
  { name: 'lane', width: CARRIAGEWAY_HALF * 2, reach: 1300 },
  { name: 'road', width: CARRIAGEWAY_HALF * 2, reach: 5000 },
  { name: 'trunk', width: CARRIAGEWAY_HALF * 2, reach: 34000 },
];

/**
 * Which class a road between two places is, by the smaller end's `radiusOf`:
 * a lane joining a village to a capital is still a lane. The thresholds are
 * the built radii of 22,300 people (road) and 587,000 (trunk).
 */
export function classOf(a: { pop: number; radius?: number }, b: { pop: number; radius?: number }): number {
  const importance = Math.min(radiusOf(a), radiusOf(b));
  if (importance >= 55.5) return 2;
  if (importance >= 17.1) return 1;
  return 0;
}

/**
 * The drawn verge the network was baked against, as a multiple of the
 * carriageway's half-width. The bake refuses a road whose tightest turn is
 * under `roadClearance`, so changing this needs a re-bake of `roads.bin`.
 */
const VERGE_SPREAD = 1.8;

/**
 * How far from a road's centre line the ribbon reaches, in world units: half
 * the drawn strip, not half the carriageway. `vegetation.ts` adds a plant's
 * own footprint to this to keep it off the road; posts and poles beside a road
 * stand inside it.
 */
export function roadClearance(cls: number): number {
  const style = ROAD_CLASSES[cls] ?? ROAD_CLASSES[0]!;
  return style.width * 0.5 * VERGE_SPREAD;
}
