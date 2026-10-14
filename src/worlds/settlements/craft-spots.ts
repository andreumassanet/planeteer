/** The craft standing in a town or at a landmark: parked cars, a pad's ship, a landmark's own. */

import { rngFrom } from '../../scenery/random.ts';
import { DEFAULT_KITS } from '../craft/kit-model.ts';
import { liveryOf } from '../kit.ts';
import { CARRIAGE_TOP } from '../roads.ts';
import type { TownContext } from './context.ts';
import { PARKED_KITS } from './types.ts';
import type { CraftSpot, Site } from './types.ts';

/** A site's craft in its own frame; pure, so every visitor finds the same ones. */
export function craftSpotsOf(t: TownContext, site: Site): CraftSpot[] {
  const { spec, style } = t;
  const out: CraftSpot[] = [];
  if (site.landmark) {
    for (const one of spec.landmarks.find((mark) => mark.id === site.id)?.craft ?? []) out.push({ ...one, y: site.floor });
  } else if (site.town !== null) {
    const town = site.town;
    town.parked.forEach((spot, k) => {
      const rng = rngFrom('worlds', spec.id, 'parked', site.id, k);
      const livery = liveryOf(style, rng);
      const kit = rng.pick(PARKED_KITS);
      out.push({
        vehicle: { kind: 'rover', name: 'the rover', kit: { ...kit, livery: { wall: livery.wall, roof: livery.roof, accent: livery.accent } } },
        x: spot.x,
        y: site.floor + CARRIAGE_TOP,
        z: spot.z,
        yaw: spot.yaw,
      });
    });
    for (const plot of town.plots) {
      if (plot.kind !== 'pad') continue;
      const rng = rngFrom('worlds', spec.id, 'building', plot.seed);
      const livery = liveryOf(style, rng);
      out.push({
        vehicle: { kind: 'lander', name: 'the ship', kit: { ...DEFAULT_KITS.lander!, livery: { wall: livery.wall, roof: livery.roof, accent: livery.accent } } },
        x: plot.x,
        y: site.floor + 0.2,
        z: plot.z,
        yaw: plot.yaw,
      });
    }
  }
  return out;
}
