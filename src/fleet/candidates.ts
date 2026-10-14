/** Which vehicles are worth having built: the sites near the player, and anything moved near him. */
import { groundRadius } from '../globe.ts';
import { FRESH_TOWNS, KEEP, REACH } from './limits.ts';
import { isPose } from './pose.ts';
import type { Airstrips } from './airstrips.ts';
import type { FleetSite } from './site-types.ts';
import type { FleetContext } from './state.ts';

/** A vehicle in range, with its distance from the player and its site if it has one. */
export interface Wanted {
  id: string;
  distance: number;
  site: FleetSite | null;
}

export function createCandidates(ctx: FleetContext, airstrips: Airstrips) {
  const { options, link, sites, bayPose, up, centre } = ctx;
  const { world, player } = options;
  const found: FleetSite[] = [];

  /** The candidates: sites near the player, and anything moved near him, nearest first. */
  function scan(): Wanted[] {
    airstrips.scan();
    const wanted: Wanted[] = [];
    const here = player.position;
    found.length = 0;
    up.copy(here).normalize();
    // From higher than the reach over the ground nothing on it is in reach,
    // and a plane crossing a continent would otherwise work out every town
    // under its track.
    if (here.length() - groundRadius(world, here) > REACH) return wanted;
    sites.near(up, REACH, found, FRESH_TOWNS);
    // A plane stands further out of its town than `near` looks for a town;
    // its strip search is already worked out, so this is a lookup.
    for (const plane of airstrips.planeSites) if (!found.includes(plane)) found.push(plane);
    const seen = new Set<string>();
    for (const site of found) {
      // Moved elsewhere, it is found by its pose below; taken but not yet
      // moved (`pose` empty), it is still standing here.
      if (isPose(link.moved.get(site.id)?.pose)) continue;
      centre.copy(site.at).multiplyScalar(here.length());
      const distance = centre.distanceTo(here);
      if (distance > KEEP) continue;
      wanted.push({ id: site.id, distance, site });
      seen.add(site.id);
    }
    for (const [id, moved] of link.moved) {
      if (seen.has(id) || !isPose(moved.pose)) continue;
      seen.add(id);
      centre.set(moved.pose[0]!, moved.pose[1]!, moved.pose[2]!);
      const distance = centre.distanceTo(here);
      if (distance > KEEP) continue;
      wanted.push({ id, distance, site: sites.byId(id) });
    }
    // A town's car taken over and not moved since, still at its kerb.
    for (const [id, kerb] of bayPose) {
      if (seen.has(id)) continue;
      centre.set(kerb[0]!, kerb[1]!, kerb[2]!);
      const distance = centre.distanceTo(here);
      if (distance <= KEEP) wanted.push({ id, distance, site: null });
    }
    wanted.sort((a, b) => a.distance - b.distance || (a.id < b.id ? -1 : 1));
    return wanted;
  }

  return { scan };
}

export type Candidates = ReturnType<typeof createCandidates>;
