/** Watches the ground's changes (a town's floor raised or dropped, the prominence knob) and dirties the fields they reach. */
import * as THREE from 'three';
import type { GrassGround } from '../vegetation.ts';
import type { Baker } from './baker.ts';
import { tangentOf } from './layers.ts';
import type { Layers } from './layers.ts';

/** Returns a function to call each frame: it marks every texel a changed floor reaches as dirty, in every anchored field. */
export function createFloorWatcher(ground: GrassGround | null, R: number, layers: Layers, baker: Baker | null): () => void {
  const changes: number[] = [];
  let floorsSeen = ground?.floorChanges(0, changes) ?? 0;
  let versionSeen = ground?.version() ?? 0;
  const changedAt = new THREE.Vector3();
  const changedPlane = new THREE.Vector3();

  return function noteChanges(): void {
    if (ground === null) return;
    changes.length = 0;
    const version = ground.floorChanges(floorsSeen, changes);
    const moved = ground.version() !== versionSeen;
    if (version === floorsSeen && !moved) return;
    floorsSeen = version;
    versionSeen = ground.version();
    const all = moved || changes[0] === -1;
    for (const layer of [layers.front, layers.back]) {
      if (!layer.anchored) continue;
      for (const field of [layer.fine, layer.coarse]) {
        const n = field.size;
        if (all) {
          field.dirty.length = 0;
          field.dirty.push([field.i0, field.i0 + n, field.j0, field.j0 + n]);
          continue;
        }
        for (let c = 0; c + 3 < changes.length; c += 4) {
          changedAt.set(changes[c]!, changes[c + 1]!, changes[c + 2]!).multiplyScalar(R);
          const at = tangentOf(layer.frame, changedAt, changedPlane);
          const reach = changes[c + 3]! + field.texel * 2;
          if (!Number.isFinite(at.x)) continue;
          const i0 = Math.floor((at.x - reach) / field.texel);
          const i1 = Math.ceil((at.x + reach) / field.texel);
          const j0 = Math.floor((at.z - reach) / field.texel);
          const j1 = Math.ceil((at.z + reach) / field.texel);
          if (i1 <= field.i0 || i0 >= field.i0 + n || j1 <= field.j0 || j0 >= field.j0 + n) continue;
          field.dirty.push([i0, i1, j0, j1]);
        }
      }
    }
    // A patch under way was asked of the old answer: start it again.
    baker?.restartPatch();
  };
}
