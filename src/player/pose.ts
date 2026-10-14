import type * as THREE from 'three';
import type { WirePose } from '../craft/contract.ts';

/**
 * Nine numbers from a position, a forward and an up: `WirePose`, the one
 * writer of it, used by the player's own pose and every site's in `fleet/`.
 */
export function writePose(position: THREE.Vector3, forward: THREE.Vector3, up: THREE.Vector3, out: WirePose): WirePose {
  out[0] = position.x;
  out[1] = position.y;
  out[2] = position.z;
  out[3] = forward.x;
  out[4] = forward.y;
  out[5] = forward.z;
  out[6] = up.x;
  out[7] = up.y;
  out[8] = up.z;
  return out;
}
