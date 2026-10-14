/** Where the traveller comes down: the town chosen in the menu, a remembered place, `?at=`, `&site=`, else the capital. */

import * as THREE from 'three';
import type { WorldHost } from '../../world-host.ts';
import type { WorldSpec } from '../contract.ts';
import type { KeepClear } from '../aliens.ts';
import type { WorldPlayer } from '../player.ts';
import type { WorldRig } from '../camera.ts';
import { arrivalOf } from '../settlements.ts';
import type { Settlements, Site } from '../settlements.ts';
import { capitalOf, siteAt } from '../arrival.ts';
import { latLonOf, unitAt } from '../../sphere.ts';

export interface Spawn {
  /** The town the traveller came down in, if any. */
  spawnSite: Site | null;
  /** Where this visit began. */
  home: { lat: number; lon: number; name: string };
  byId(id: string | null): Site | null;
  /**
   * Stands the traveller at `lat`, `lon`. A town's own point (what `/goto` and
   * the map hand over, its square) is taken to its arrival; anywhere else is
   * stood on as found, facing north as Earth's `goTo` does.
   */
  standAt(lat: number, lon: number): Site | null;
}

export function createSpawn(deps: {
  spec: WorldSpec;
  host: WorldHost;
  query: URLSearchParams;
  settlements: Settlements;
  player: WorldPlayer;
  rig: WorldRig;
  radius: number;
  keepClear: Map<string, KeepClear[]>;
}): Spawn {
  const { spec, host, query, settlements, player, rig, radius: R, keepClear } = deps;
  const arrival = host.arrival ?? null;
  const byId = (id: string | null): Site | null => (id === null ? null : settlements.sites.find((site) => site.id === id) ?? null);
  const at = query.get('at')?.split(',').map(Number);
  const linked = at !== undefined && at.length === 2 && at.every(Number.isFinite) ? { lat: at[0]!, lon: at[1]! } : null;
  let spawnSite: Site | null = null;
  const start = new THREE.Vector3();
  const look = new THREE.Vector3();

  /** Stands the traveller at its arrival in `site`, looking in at the square. */
  function standIn(site: Site): void {
    const point = arrivalOf(site);
    settlements.toWorld(site, point.x, 0, point.z, start);
    look.copy(site.origin).sub(start);
    player.place(start.normalize(), look);
  }

  function standAt(lat: number, lon: number): Site | null {
    unitAt(lat, lon, start);
    const site = siteAt(settlements.sites, R, start);
    if (site !== null && !site.landmark && start.angleTo(site.dir) * R < site.plaza + 2) {
      standIn(site);
      return site;
    }
    look.set(0, 1, 0).addScaledVector(start, -start.y);
    if (look.lengthSq() < 1e-8) look.set(1, 0, 0);
    player.place(start, look);
    return site;
  }

  if (arrival !== null && arrival.settlement !== null && byId(arrival.settlement) !== null) {
    spawnSite = byId(arrival.settlement);
    standIn(spawnSite!);
  } else if (arrival !== null) spawnSite = standAt(arrival.lat, arrival.lon);
  else if (linked !== null) spawnSite = standAt(linked.lat, linked.lon);
  else {
    spawnSite = byId(query.get('site')) ?? capitalOf(spec, settlements.sites);
    if (spawnSite !== null) standIn(spawnSite);
    else standAt(0, 0);
  }
  rig.heading.copy(player.facing);
  const { lat, lon } = latLonOf(player.position);
  const home = { lat, lon, name: spawnSite?.name ?? arrival?.name ?? spec.body.name };
  if (spawnSite !== null) {
    const point = arrivalOf(spawnSite);
    keepClear.set(spawnSite.id, [{ x: point.x, z: point.z, r: 12 }]);
  }
  return { spawnSite, home, byId, standAt };
}
