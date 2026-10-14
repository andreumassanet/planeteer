import type { Group, Mesh } from 'three';
import type { SceneryContext } from '../../scenery/contract.ts';
import type { Alien, Morph } from '../contract.ts';
import { rigAlien } from './rig.ts';
import type { AlienRig } from './types.ts';

/**
 * One alien, from a `Morph`, an `Alien` and nothing else: the rig in its pose,
 * stood on its own lowest sole.
 *
 * The returned `Group` stands on `y = 0` with `+z` the way it faces, which is
 * the scenery contract's own convention and the one every placer already knows.
 * `scripts/check-system.ts` fingerprints every vertex of two builds rather than
 * rasterising a silhouette — at 0.2 units to a cell a raster cannot see a limb
 * moved by a tenth of a unit, and that is exactly the shape a stray
 * `Math.random()` takes.
 *
 * **The drop is measured off the built feet rather than solved from the
 * angles**, and that is not thrift, it is a bug that was there first: a sole
 * is not a point, it reaches ahead of the ankle, and solved without that the
 * walk pose put the forward foot 0.126 units through the floor — three pixels
 * at 40 units, invisible in a thumbnail.
 */
export function buildAlien(ctx: SceneryContext, morph: Morph, alien: Alien): Group {
  const rig = rigAlien(ctx, morph, alien);
  standAlien(rig);
  return rig.group;
}

/** Drops a posed rig onto its own lowest sole, measured off the feet's vertices. */
export function standAlien(rig: AlienRig): void {
  rig.root.position.y = 0;
  rig.group.updateMatrixWorld(true);
  let lowest = Infinity;
  for (const leg of rig.legs) {
    leg.ankle.traverse((object) => {
      const mesh = object as Mesh;
      if (mesh.isMesh !== true || mesh.parent !== leg.ankle) return;
      const e = mesh.matrixWorld.elements;
      const position = mesh.geometry.getAttribute('position');
      for (let i = 0; i < position.count; i++) {
        const y = e[1]! * position.getX(i) + e[5]! * position.getY(i) + e[9]! * position.getZ(i) + e[13]!;
        if (y < lowest) lowest = y;
      }
    });
  }
  if (!Number.isFinite(lowest)) lowest = 0;
  rig.root.position.y = -lowest;
  // A staff stands on the ground beside the body, whatever the drop was.
  if (rig.staff !== null) rig.staff.position.y = lowest;
  rig.group.updateMatrixWorld(true);
}
