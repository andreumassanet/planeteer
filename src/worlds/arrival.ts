/**
 * Where a traveller comes down on a walked world, and where the craft stand
 * that are waiting there: pure functions of a town's layout, so the world and
 * `scripts/check-worlds.ts` ask the same question and get the same answer.
 *
 * **One rule, and it is Earth's: never somewhere weird.** Earth lands a
 * traveller in the town picked on the menu's globe, on its ground, clear of
 * every wall. Here a town is chosen in the planet's region stage
 * (`WorldArrival.settlement`) and the traveller stands on its own arrival
 * (`settlements.ts`'s `arrivalOf`: its first avenue, a little out from the
 * square) looking in at the square. Anything else — *Continue* from a place
 * remembered, `/goto`, the map's *join* — that falls inside a town is taken to
 * that town's arrival too; ground outside every town is stood on as found.
 *
 * `?world=<id>` with no `&site=` lands at the **capital**: the town the
 * world's own file names as its spawn, else its most populous.
 */

import type { WorldSpec } from './contract.ts';
import type { Site } from './settlements.ts';
import { arrivalOf } from './settlements.ts';

/** Craft and arrival keep at least this far apart, units: a craft is beside you, never on you. */
export const PARKING_CLEAR = 10;

/** The capital: the town the spec names, else the most populous that is not a landmark. */
export function capitalOf(spec: WorldSpec, sites: readonly Site[]): Site | null {
  if (typeof spec.spawn === 'string') {
    const named = sites.find((site) => site.id === spec.spawn);
    if (named !== undefined) return named;
  }
  let best: Site | null = null;
  for (const site of sites) if (!site.landmark && (best === null || site.population > best.population)) best = site;
  return best;
}

/** The town a direction stands in — inside its paving — or null. */
export function siteAt(sites: readonly Site[], radius: number, dir: { x: number; y: number; z: number }): Site | null {
  const length = Math.hypot(dir.x, dir.y, dir.z) || 1;
  let found: Site | null = null;
  let best = Infinity;
  for (const site of sites) {
    const cos = (site.dir.x * dir.x + site.dir.y * dir.y + site.dir.z * dir.z) / length;
    const away = Math.acos(Math.min(1, Math.max(-1, cos))) * radius;
    if (away < Math.max(site.paving, site.radius) && away < best) [found, best] = [site, away];
  }
  return found;
}

/**
 * Where the `k`th craft stands at a town, in the town's frame, and a point a
 * few units ahead of it for its heading. A craft on the ground waits on an
 * avenue other than the arrival's, out toward the edge and never in the
 * square; what flies stands past
 * the town's edge, where it has room to. A town with one avenue parks its
 * ground craft further out on that avenue, `PARKING_CLEAR` past the traveller.
 */
export function parkingOf(site: Site, k: number, flies: boolean): { x: number; z: number; ahead: { x: number; z: number } } {
  if (site.town !== null && !flies) {
    // **A grid town parks its craft on its main streets**, in the middle of
    // the carriageway a few cells out — east, west, north, never the south,
    // where the traveller comes in — a cell past the craft parked at the kerb.
    const town = site.town;
    const ways = [Math.PI / 2, (3 * Math.PI) / 2, 0];
    const way = ways[k % ways.length]!;
    // A square of one or two cells has no street: its craft wait just outside it.
    const inside = town.grid.cells >= 3 ? Math.min(town.grid.half - 5, town.grid.pitch * 2.5) : town.grid.half + 6;
    const out = inside + Math.floor(k / ways.length) * 8;
    return {
      x: Math.sin(way) * out,
      z: Math.cos(way) * out,
      ahead: { x: Math.sin(way) * (out + 5), z: Math.cos(way) * (out + 5) },
    };
  }
  const count = site.avenues.length;
  const index = count > 1 ? (k + 1) % count : 0;
  const avenue = site.avenues[index]!;
  const arrival = arrivalOf(site);
  const arrivalOut = Math.hypot(arrival.x, arrival.z);
  // On the ground: out toward the edge, and in a hamlet, whose centrepiece
  // fills most of its square, at least a few paces outside the square.
  let out = flies ? site.paving + 16 + k * 6 : Math.max(Math.min(site.paving - 6, site.plaza + 12), site.plaza + 4);
  if (!flies && index === 0) out = arrivalOut + PARKING_CLEAR + 4 + k * 6;
  const x = Math.sin(avenue) * out;
  const z = Math.cos(avenue) * out;
  // Clear of the arrival whatever the avenues' angles: pushed out along its
  // avenue until it is.
  const gap = Math.hypot(x - arrival.x, z - arrival.z);
  const extra = gap < PARKING_CLEAR ? PARKING_CLEAR - gap + 2 : 0;
  const reach = out + extra;
  return {
    x: Math.sin(avenue) * reach,
    z: Math.cos(avenue) * reach,
    ahead: { x: Math.sin(avenue) * (reach + 5), z: Math.cos(avenue) * (reach + 5) },
  };
}
