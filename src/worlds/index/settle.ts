/** Settling the traveller on the ground before the first frame, and after a jump: the towns and roads round them built, walls stepped out of. */

import * as THREE from 'three';
import type { WorldPlayer } from '../player.ts';
import { BODY_RADIUS } from '../player.ts';
import type { WorldRig } from '../camera.ts';
import type { Roads } from '../roads.ts';
import type { Settlements } from '../settlements.ts';
import type { Terrain } from '../terrain.ts';

const NO_INPUT = { move: { x: 0, y: 0 }, look: { x: 0, y: 0 }, zoom: 0, run: false, jump: false, climb: false, dive: false, attitude: { pitch: 0, roll: 0 }, flightMode: false, use: false, view: false };

/** Sizes the lens to the renderer and returns `settle()`. */
export function createSettle(deps: {
  renderer: THREE.WebGLRenderer;
  settlements: Settlements;
  roads: Roads;
  terrain: Terrain;
  player: WorldPlayer;
  rig: WorldRig;
  radius: number;
  groundAt: (point: THREE.Vector3) => number;
  collide: (position: THREE.Vector3, radius: number) => boolean;
}): () => void {
  const { renderer, settlements, roads, terrain, player, rig, radius: R, groundAt, collide } = deps;
  const size = new THREE.Vector2();
  renderer.getSize(size);
  rig.resize(size.x, size.y);
  return () => {
    rig.aim(0, NO_INPUT, player);
    player.update(0, NO_INPUT, rig.steer);
    rig.snap(player, groundAt, R, terrain.high);
    settlements.prime(rig.camera.position);
    // The roads round the traveller, so a skyway under their feet is there to
    // stand on before they are put down (`roads.surfaceAt` knows only what has
    // been built).
    roads.update(player.position, 1);
    // A town raised round the traveller may put a wall where they stand: out
    // of it, and back on the ground.
    for (let k = 0; k < 8 && collide(player.position, BODY_RADIUS); k++) continue;
    player.place(player.position, player.facing);
  };
}
