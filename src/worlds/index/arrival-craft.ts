/** The craft that wait where the traveller comes down, and the probes of the ground round a town they park by. */

import * as THREE from 'three';
import type { WorldSpec } from '../contract.ts';
import type { KeepClear } from '../aliens.ts';
import { createCraft } from '../craft.ts';
import type { Craft } from '../craft.ts';
import type { Roads } from '../roads.ts';
import type { Settlements, Site } from '../settlements.ts';
import type { Terrain } from '../terrain.ts';
import type { WorldPlayer } from '../player.ts';
import { padOf, parkingOf, siteAt, ufoParkingOf } from '../arrival.ts';
import type { UfoProbe } from '../arrival.ts';
import { UFO_RADIUS } from '../ufo.ts';
import type { SceneryContext } from '../../scenery/contract.ts';

export interface PadProbes {
  /** Scratch points the callers write a town's frame point into. */
  readonly padAt: THREE.Vector3;
  readonly ufoAt: THREE.Vector3;
  /** A town's roads within `within` of a point in its frame (`padOf`, `ufoParkingOf`). */
  roadNear(site: Site): (x: number, z: number, within: number) => boolean;
  /** What `ufoParkingOf` asks of the ground round a town, in its frame. */
  ufoProbe(site: Site): UfoProbe;
}

export function createPadProbes(deps: { settlements: Settlements; roads: Roads; terrain: Terrain; radius: number }): PadProbes {
  const { settlements, roads, terrain, radius: R } = deps;
  const padAt = new THREE.Vector3();
  const ufoAt = new THREE.Vector3();
  const roadNear = (site: Site) => (x: number, z: number, within: number): boolean => roads.near(settlements.toWorld(site, x, 0, z, padAt), within).length > 0;
  const ufoProbe = (site: Site): UfoProbe => ({
    road: roadNear(site),
    other: (x, z) => {
      const found = siteAt(settlements.sites, R, settlements.toWorld(site, x, 0, z, ufoAt));
      return found !== null && found !== site;
    },
    // The land and a deck town's platform, never a road's top: what a road
    // has built so far is not a pure function of the world.
    ground: (x, z) => {
      const n = settlements.toWorld(site, x, 0, z, ufoAt).normalize();
      const land = terrain.groundAt(n.x, n.y, n.z);
      return Math.max(land, settlements.floorAt(n.x, n.y, n.z) ?? land);
    },
  });
  return { padAt, ufoAt, roadNear, ufoProbe };
}

/**
 * Parks the world's craft: in the town the traveller came down in, on its
 * avenues and past its edge (`parkingOf`), a saucer off a corner of its square
 * where one is clear, and otherwise out in the open round the traveller.
 * Returns the town whose saucer waits among them, if one does.
 */
export function parkArrivalCraft(deps: {
  spec: WorldSpec;
  spawnSite: Site | null;
  settlements: Settlements;
  probes: PadProbes;
  player: WorldPlayer;
  terrain: Terrain;
  radius: number;
  groundAt: (point: THREE.Vector3) => number;
  ctx: SceneryContext;
  gradientMap: THREE.Texture;
  scene: THREE.Scene;
  crafts: Craft[];
  keepClear: Map<string, KeepClear[]>;
}): Site | null {
  const { spec, spawnSite, settlements, probes, player, terrain, radius: R, groundAt, ctx, gradientMap, scene, crafts, keepClear } = deps;
  let arrivalUfo: Site | null = null;
  spec.vehicles.forEach((vehicle, k) => {
    const kind = typeof vehicle === 'string' ? vehicle : vehicle.kind;
    const flies = kind === 'lander' || kind === 'aerostat' || kind === 'ufo';
    const where = new THREE.Vector3();
    const heading = new THREE.Vector3();
    const cornered =
      kind === 'ufo' && spawnSite !== null && spawnSite.town !== null && !spawnSite.landmark
        ? ufoParkingOf(spec, spawnSite, padOf(spawnSite, spec.vehicles.length, probes.roadNear(spawnSite)).corner, probes.ufoProbe(spawnSite), true)
        : null;
    if (cornered !== null && spawnSite !== null) {
      arrivalUfo = spawnSite;
      settlements.toWorld(spawnSite, cornered.x, 0, cornered.z, where);
      settlements.toWorld(spawnSite, cornered.ahead.x, 0, cornered.ahead.z, heading);
      heading.sub(where);
    } else if (spawnSite !== null && !spawnSite.landmark) {
      const spot = parkingOf(spawnSite, k, flies);
      settlements.toWorld(spawnSite, spot.x, 0, spot.z, where);
      settlements.toWorld(spawnSite, spot.ahead.x, 0, spot.ahead.z, heading);
      heading.sub(where);
    } else {
      const up = player.position.clone().normalize();
      const side = new THREE.Vector3().crossVectors(player.facing, up).normalize();
      where.copy(player.position).addScaledVector(side, 14 + k * 14).addScaledVector(player.facing, 6);
      heading.copy(player.facing);
      // Never inside the landmark the traveller arrived at: out past its
      // ground, each a little further round than the last.
      if (spawnSite !== null) {
        const out = where.clone().sub(spawnSite.origin);
        out.addScaledVector(spawnSite.dir, -out.dot(spawnSite.dir));
        const least = spawnSite.radius + 8 + k * 6;
        if (out.length() < least) {
          if (out.lengthSq() < 1e-6) out.copy(side);
          where.copy(spawnSite.origin).addScaledVector(out.normalize(), least);
        }
      }
    }
    where.setLength(R + groundAt(where));
    const up = where.clone().normalize();
    heading.addScaledVector(up, -heading.dot(up)).normalize();
    // Nothing lies about under a saucer off a corner, as under the towns' own.
    if (cornered !== null) terrain.keepBare(where.x, where.y, where.z, UFO_RADIUS + 4);
    const craft = createCraft(vehicle, ctx, gradientMap, where, heading, spec.wind);
    craft.update(0, null, groundAt, 1, R);
    scene.add(craft.object);
    crafts.push(craft);
    if (spawnSite !== null && !spawnSite.landmark) {
      const local = craft.position.clone().sub(spawnSite.origin).applyQuaternion(spawnSite.quaternion.clone().invert());
      keepClear.get(spawnSite.id)?.push({ x: local.x, z: local.z, r: craft.radius + 3 });
    }
  });
  return arrivalUfo;
}
