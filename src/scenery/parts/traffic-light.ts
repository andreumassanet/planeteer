import { rolePaint, sceneryModel } from '../contract.ts';
import type { ScenicPart } from '../contract.ts';
import type { Paint } from '../../models.ts';

/**
 * Traffic light: Kenney's from City Kit (Roads) (CC0), 212 triangles, its post
 * in the region's trim and its three lamps lit after dark.
 *
 * **Placed by `settlements.ts` and by nothing else**, like `street-lamp`: four
 * of them, one on each pavement corner of a city's middle crossing, each
 * facing the traffic that comes in by the street beside it, in a region built
 * from the City Kits and a place over `TOWER_URBANITY`. The model's lamps face
 * its local -x, which is the direction `Ground.signals` turns.
 */

/** A lamp's swatch is saturated; the post and the housing are greys. */
function isLamp(slot: string): boolean {
  const hex = slot.split('#')[1];
  if (hex === undefined) return false;
  const channels = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return Math.max(...channels) - Math.min(...channels) > 100;
}

export const trafficLight: ScenicPart = {
  id: 'traffic-light',
  name: 'Traffic light',
  kind: 'scatter',
  footprint: 1.2,
  triangles: 220,
  note: "Kenney's traffic light at a city's middle crossing, its lamps lit.",

  build(ctx, rng, style) {
    const model = sceneryModel('traffic-light');
    const post = rolePaint(model, [[/./, rng.pick(style.trim)]]);
    const paint: Paint = (slot, original) => (isLamp(slot) ? null : post(slot, original));
    return ctx.fitted('traffic-light', { height: rng.range(4, 5.95), radius: 1.18, windows: isLamp }, paint);
  },
};
