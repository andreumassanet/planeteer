/** The boats moored at a town's harbour (`harbours/plan.ts`): takeable, at its berths. */
import { createHarbourPlanner } from '../harbours/plan.ts';
import type { Taken } from '../harbours/plan.ts';
import { SITE_ROOM } from './site-rules.ts';
import type { FleetSite, FleetSource } from './site-types.ts';
import type { SiteWorld } from './site-world.ts';

/** The first `n` a harbour's berths take in their ids (`<model>:<place>:<n>`), past every other site's. */
export const HARBOUR_BERTH = 20;

/** Whether a site is a harbour's berth rather than one the harbour keeps clear of. */
export const isBerth = (site: FleetSite): boolean => Number(site.id.slice(site.id.lastIndexOf(':') + 1)) >= HARBOUR_BERTH;

/** What a harbour keeps clear of: every other site of its town, by its room. */
export function takenBy(sites: readonly FleetSite[]): Taken[] {
  return sites.filter((site) => !isBerth(site)).map((site) => ({ at: site.at, radius: SITE_ROOM[site.kind] }));
}

export function createHarbourSites(w: SiteWorld, source: FleetSource) {
  const planner = createHarbourPlanner({ world: w.world, places: w.places, monuments: source.monuments });

  /** After every other site of the town: its harbour's berths, clear of them. */
  function harbourBoats(p: number, out: FleetSite[]): void {
    const harbour = planner.harbourOf(p, takenBy(out.filter((site) => site.place === p)));
    if (harbour === null) return;
    harbour.berths.forEach((berth, n) => out.push(w.site(berth.model, p, HARBOUR_BERTH + n, berth.at, berth.forward)));
  }

  return { harbourBoats };
}
