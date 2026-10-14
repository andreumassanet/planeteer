/** Read-only views over the drawn movers, for the wakes, the headlights and the fauna check. */
import type * as THREE from 'three';
import type { Life } from './api.ts';
import type { Mover } from './mover.ts';

export function eachBoat(movers: ReadonlyMap<string, Mover>, visit: (mesh: THREE.Object3D) => void): void {
  for (const mover of movers.values()) {
    if (mover.family === 'water' && mover.mesh !== null && mover.mesh.visible) visit(mover.mesh);
  }
}

export function eachRoadVehicle(movers: ReadonlyMap<string, Mover>, visit: Parameters<Life['eachRoadVehicle']>[0]): void {
  for (const mover of movers.values()) {
    if (mover.family !== 'road' || mover.mesh === null || !mover.mesh.visible) continue;
    const box = mover.mesh.geometry.boundingBox;
    visit(
      mover.mesh,
      box === null ? 2.5 : Math.max(-box.min.z, box.max.z),
      box === null ? 1 : Math.max(-box.min.x, box.max.x),
      mover.vehicle ?? '',
      box === null ? 0 : box.min.y,
    );
  }
}

export function grazersOf(movers: ReadonlyMap<string, Mover>): ReturnType<Life['grazers']> {
  const out: ReturnType<Life['grazers']> = [];
  for (const mover of movers.values()) {
    const herd = mover.animated;
    if (!herd) continue;
    out.push({
      key: mover.key,
      centre: herd.site.centre.clone(),
      right: herd.site.right.clone(),
      forward: herd.site.forward.clone(),
      room: herd.room,
      heads: herd.heads.map((head) => ({
        x: head.x, z: head.z, y: head.y, homeX: head.homeX, homeZ: head.homeZ,
        stance: head.stance, mode: head.mode, world: head.world.clone(),
      })),
    });
  }
  return out;
}
