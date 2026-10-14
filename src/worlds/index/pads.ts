/** Every town's launch pad and the saucers parked off the towns' corners: where they stand, kept clear of people. */

import * as THREE from 'three';
import type { WorldSpec } from '../contract.ts';
import type { KeepClear } from '../aliens.ts';
import type { Settlements, Site } from '../settlements.ts';
import type { CraftSpot } from '../settlements.ts';
import type { Terrain } from '../terrain.ts';
import { padOf, ufoParkingOf } from '../arrival.ts';
import { UFO_RADIUS } from '../ufo.ts';
import { ROCKET_CLEAR, ROCKET_HEIGHT } from '../../rocket.ts';
import type { PadProbes } from './arrival-craft.ts';

/** What a parked craft keeps of the people walking past it, units: a rover's half-length and a step. */
const PARKED_CLEAR = 6;

export interface Pad {
  site: Site;
  x: number;
  z: number;
  ahead: { x: number; z: number };
}

export interface PadPlan {
  /** Every town's launch pad, past its edge on an avenue the craft do not take, so a way off the world is within a walk. */
  pads: Map<string, Pad>;
  /** The saucers parked off the towns' corners, by town: craft to take like the town's own. */
  ufoSpots: Map<string, CraftSpot[]>;
  /** The pads and saucers as the maps mark them: points on the sphere. */
  mapPads: { id: string; at: THREE.Vector3 }[];
  mapSaucers: { id: string; at: THREE.Vector3 }[];
  /** Everything a town keeps to take: its own craft, then its saucer. */
  spotsOf(site: Site): readonly CraftSpot[];
}

export function planPads(deps: {
  spec: WorldSpec;
  settlements: Settlements;
  terrain: Terrain;
  probes: PadProbes;
  keepClear: Map<string, KeepClear[]>;
  /** The town whose saucer waits among the arrival's craft. */
  arrivalUfo: Site | null;
}): PadPlan {
  const { spec, settlements, terrain, probes, keepClear, arrivalUfo } = deps;
  const { padAt, ufoAt } = probes;
  const pads = new Map<string, Pad>();
  const ufoSpots = new Map<string, CraftSpot[]>();
  for (const site of settlements.sites) {
    if (site.landmark) continue;
    const spot = padOf(site, spec.vehicles.length, probes.roadNear(site));
    pads.set(site.id, { site, ...spot });
    const clear = keepClear.get(site.id) ?? [];
    clear.push({ x: spot.x, z: spot.z, r: ROCKET_CLEAR });
    keepClear.set(site.id, clear);
    // Nothing lies about on it, or under the camera that watches it go.
    settlements.toWorld(site, spot.x, 0, spot.z, padAt);
    terrain.keepBare(padAt.x, padAt.y, padAt.z, ROCKET_CLEAR + ROCKET_HEIGHT * 1.6);
    const ufo = site === arrivalUfo ? null : ufoParkingOf(spec, site, spot.corner, probes.ufoProbe(site));
    if (ufo !== null) {
      ufoSpots.set(site.id, [{ vehicle: { kind: 'ufo', name: 'the saucer', livery: ufo.livery }, x: ufo.x, y: 0, z: ufo.z, yaw: Math.atan2(ufo.ahead.x - ufo.x, ufo.ahead.z - ufo.z) }]);
      clear.push({ x: ufo.x, z: ufo.z, r: UFO_RADIUS + 3 });
      // Nothing lies about under it, and no outpost is planned on it.
      settlements.toWorld(site, ufo.x, 0, ufo.z, ufoAt);
      terrain.keepBare(ufoAt.x, ufoAt.y, ufoAt.z, UFO_RADIUS + 4);
    }
  }
  const mapPads = [...pads.values()].map(({ site, x, z }) => ({ id: `rocket:${site.id}`, at: settlements.toWorld(site, x, 0, z, new THREE.Vector3()).normalize() }));
  const mapSaucers = [...ufoSpots.entries()].flatMap(([id, spots]) => {
    const site = settlements.sites.find((one) => one.id === id);
    return site === undefined ? [] : spots.map((spot) => ({ id: `ufo:${id}`, at: settlements.toWorld(site, spot.x, 0, spot.z, new THREE.Vector3()).normalize() }));
  });
  const spotsOf = (site: Site): readonly CraftSpot[] => {
    const ufo = ufoSpots.get(site.id);
    return ufo === undefined ? settlements.craftAt(site) : [...settlements.craftAt(site), ...ufo];
  };
  // The craft standing in a town are kept clear of its people, as the pads are.
  for (const site of settlements.sites) {
    const spots = settlements.craftAt(site);
    if (spots.length === 0) continue;
    const clear = keepClear.get(site.id) ?? [];
    for (const spot of spots) clear.push({ x: spot.x, z: spot.z, r: PARKED_CLEAR });
    keepClear.set(site.id, clear);
  }
  return { pads, ufoSpots, mapPads, mapSaucers, spotsOf };
}
