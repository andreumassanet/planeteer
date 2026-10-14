/** What a foot stands on: the drawn ground, a town's platform or a road's top over it. */

import * as THREE from 'three';
import type { Roads } from '../roads.ts';
import type { Settlements } from '../settlements.ts';
import type { Terrain } from '../terrain.ts';

/** How far under a skyway's top a body must be to pass under it rather than stand on it. */
const UNDER_SKYWAY = 2.5;

/** Returns the ground height over the radius under a point of any length. */
export function createGroundAt(deps: { settlements: Settlements; roads: Roads; terrain: Terrain; radius: number; skyways: boolean }): (point: THREE.Vector3) => number {
  const { settlements, roads, terrain, radius: R, skyways } = deps;
  return (point) => {
    const length = point.length() || 1;
    const x = point.x / length;
    const y = point.y / length;
    const z = point.z / length;
    const floor = settlements.floorAt(x, y, z);
    let road = roads.surfaceAt(x, y, z);
    const land = terrain.groundAt(x, y, z);
    // A skyway over a deck is a roof from below, as a bridge's deck is on
    // Earth (`ribbonHeightAt`): a body under it stays on the clouds.
    if (road !== null && skyways && length - R < road - UNDER_SKYWAY) road = null;
    return Math.max(land, floor ?? land, road ?? land);
  };
}
