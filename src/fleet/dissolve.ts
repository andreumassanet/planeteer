/** Vehicles arriving and leaving the scene: dissolved in and out, pooled when put away, and the cap on how many stand. */
import { FADES, createFader } from '../fade.ts';
import { POOL_EACH, ROOM_MARGIN } from './limits.ts';
import type { Placing } from './placing.ts';
import type { Drawn, FleetContext } from './state.ts';
import type * as THREE from 'three';

export function createDissolve(ctx: FleetContext, placing: Placing) {
  const { options, group, drawn, pool, state } = ctx;
  const { player } = options;
  const { place } = placing;

  /** Dissolves what streams in and out, as a town or a wood tile does; a vehicle put away is no longer a wall the moment it goes. */
  const fader = createFader();

  /**
   * Whether a part of a vehicle dissolves: a mesh of one material, solid or
   * its glass (a pane left whole while the car round it dissolved would hang in
   * the air for the length of the fade), and not the propeller's see-through
   * disc, which is drawn only at speed.
   */
  function fades(part: THREE.Object3D): part is THREE.Mesh {
    const mesh = part as THREE.Mesh;
    if (mesh.isMesh !== true || Array.isArray(mesh.material)) return false;
    const material = mesh.material as THREE.Material;
    return !material.transparent || material.userData.atlasGlass === true;
  }

  /** A vehicle just built or taken from the pool, placed: in, dissolving. */
  function arrive(entry: Drawn): void {
    drawn.set(entry.id, entry);
    group.add(entry.group);
    place(entry);
    if (!FADES) return;
    entry.group.traverse((part) => {
      if (fades(part)) fader.in(part);
    });
  }

  /** Its own materials back at once, for a vehicle somebody gets into mid-fade. */
  function endFades(entry: Drawn): void {
    entry.group.traverse((part) => {
      if (fades(part)) fader.cancel(part);
    });
  }

  /** Out of the walls now, and out of sight when its fade is done. */
  function putAway(entry: Drawn): void {
    drawn.delete(entry.id);
    let left = 0;
    if (FADES) {
      entry.group.traverse((part) => {
        if (fades(part)) left++;
      });
    }
    if (left === 0) {
      retire(entry);
      return;
    }
    entry.group.traverse((part) => {
      if (!fades(part)) return;
      fader.out(part, () => {
        if (--left === 0) retire(entry);
      });
    });
  }

  function retire(entry: Drawn): void {
    group.remove(entry.group);
    const key = entry.key;
    let spares = pool.get(key);
    if (spares === undefined) pool.set(key, (spares = []));
    if (spares.length < POOL_EACH) {
      spares.push(entry);
      return;
    }
    // Not kept: its geometry is its own (`CraftModel.build` makes a fresh
    // copy) and goes now, or every take-off from a city leaks what did not
    // fit in the pool. The materials are the world's shared ones and stay,
    // and so does a propeller's swept disc, whose one circle every plane
    // shares (`craft/motion.ts`), and a horse's body, whose buffers are its
    // rig's and every other horse's (`makeRigged`).
    entry.group.traverse((part) => {
      if ((part as THREE.Mesh).isMesh && part.name !== 'prop-disc' && !(part as THREE.SkinnedMesh).isSkinnedMesh) (part as THREE.Mesh).geometry.dispose();
    });
  }

  /**
   * Puts away the furthest vehicle standing, if it is further than `distance`
   * by `ROOM_MARGIN`, to make room under `MAX_BUILT` for one that near. Never
   * the one going on alone, which the player just jumped out of.
   */
  function makeRoom(distance: number): boolean {
    let furthest: Drawn | null = null;
    let far = distance + ROOM_MARGIN;
    for (const entry of drawn.values()) {
      if (state.coast !== null && state.coast.entry === entry) continue;
      const gap = entry.group.position.distanceTo(player.position);
      if (gap <= far) continue;
      far = gap;
      furthest = entry;
    }
    if (furthest === null) return false;
    putAway(furthest);
    return true;
  }

  return { fadeStep: () => fader.update(), arrive, endFades, putAway, retire, makeRoom };
}
