/** The craft that stand in the towns: built while their town stands, let go with it unless the traveller moved one. */

import * as THREE from 'three';
import type { WorldSpec } from '../contract.ts';
import { createCraft, disposeCraft } from '../craft.ts';
import type { Craft } from '../craft.ts';
import type { WorldPlayer } from '../player.ts';
import type { CraftSpot, Settlements, Site } from '../settlements.ts';
import type { SceneryContext } from '../../scenery/contract.ts';

export interface CraftStream {
  /** The craft nobody has touched, which stand still and are not updated. */
  readonly still: Set<Craft>;
  stream(): void;
  /** The nearest craft in reach to board, or null. */
  inReach(): Craft | null;
  /** A craft blown up: out of the world, and its town's spot free for a new one. */
  wreck(craft: Craft): void;
}

export function createCraftStream(deps: {
  spec: WorldSpec;
  settlements: Settlements;
  ctx: SceneryContext;
  gradientMap: THREE.Texture;
  scene: THREE.Scene;
  player: WorldPlayer;
  crafts: Craft[];
  radius: number;
  groundAt: (point: THREE.Vector3) => number;
  spotsOf: (site: Site) => readonly CraftSpot[];
}): CraftStream {
  const { spec, settlements, ctx, gradientMap, scene, player, crafts, radius: R, groundAt, spotsOf } = deps;
  const standingCraft = new Map<string, Craft[]>();
  const still = new Set<Craft>();
  const spotAt = new THREE.Vector3();
  const spotAhead = new THREE.Vector3();
  /** Which town spot each streamed craft came from, and the spots whose craft the traveller took. */
  const spotOf = new WeakMap<Craft, string>();
  const takenSpots = new Set<string>();
  return {
    still,
    stream() {
      for (const site of settlements.sites) {
        const have = standingCraft.get(site.id);
        if (site.mesh !== null && have === undefined) {
          const made: Craft[] = [];
          for (const [index, spot] of spotsOf(site).entries()) {
            // A spot whose craft the traveller has taken stays empty: that craft
            // is wherever it was left, and two of it would stand otherwise.
            if (takenSpots.has(`${site.id}:${index}`)) continue;
            settlements.toWorld(site, spot.x, spot.y, spot.z, spotAt);
            settlements.toWorld(site, spot.x + Math.sin(spot.yaw), spot.y, spot.z + Math.cos(spot.yaw), spotAhead).sub(spotAt);
            spotAt.setLength(R + groundAt(spotAt));
            const craft = createCraft(spot.vehicle, ctx, gradientMap, spotAt, spotAhead.normalize(), spec.wind);
            craft.update(0, null, groundAt, player.gravity, R);
            scene.add(craft.object);
            crafts.push(craft);
            still.add(craft);
            made.push(craft);
            spotOf.set(craft, `${site.id}:${index}`);
          }
          standingCraft.set(site.id, made);
        } else if (site.mesh === null && have !== undefined) {
          for (const craft of have) {
            if (!still.has(craft) || craft === player.craft) {
              const spot = spotOf.get(craft);
              if (spot !== undefined) takenSpots.add(spot);
              continue;
            }
            still.delete(craft);
            crafts.splice(crafts.indexOf(craft), 1);
            disposeCraft(craft);
          }
          standingCraft.delete(site.id);
        }
      }
    },
    // Not the traffic's: a rover on the road has its driver at the wheel
    // (`traffic.ts`), and `E` beside one says so.
    wreck(craft) {
      const at = crafts.indexOf(craft);
      if (at >= 0) crafts.splice(at, 1);
      still.delete(craft);
      for (const [site, made] of standingCraft) {
        const index = made.indexOf(craft);
        if (index >= 0) made.splice(index, 1);
        if (made.length === 0) standingCraft.delete(site);
      }
      const spot = spotOf.get(craft);
      if (spot !== undefined) takenSpots.delete(spot);
      disposeCraft(craft);
    },
    inReach() {
      let found: Craft | null = null;
      let best = Infinity;
      for (const craft of crafts) {
        const d = craft.position.distanceTo(player.position);
        if (d < craft.reach && d < best) [found, best] = [craft, d];
      }
      return found;
    },
  };
}
