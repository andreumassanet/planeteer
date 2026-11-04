/**
 * A world's guild square as the guild's runtime reads it (`GuildSquare`, the
 * shape Earth's towns publish): its middle, its six people's spots, its two
 * boards' faces and the hall's door, in the world, off the town's frame.
 */

import * as THREE from 'three';
import { BOARD_DEPTH } from '../../guild/square.ts';
import type { GuildLayout, GuildSquare } from '../../guild/square.ts';
import type { Place } from '../../places.ts';
import { PROUD } from '../../scenery/contract/tones.ts';
import { GUILD_PAVE } from './guild-build.ts';
import { siteToWorld } from './layout.ts';
import type { Site } from './types.ts';

export function worldGuildSquare(site: Site, layout: GuildLayout, place: Place, index: number): GuildSquare {
  const top = site.floor + GUILD_PAVE;
  const at = (x: number, y: number, z: number): THREE.Vector3 => siteToWorld(site, x, y, z, new THREE.Vector3());
  /** A yaw of the town's frame as a direction in the world, laid on the ground at `where`. */
  const along = (yaw: number, where: THREE.Vector3): THREE.Vector3 => {
    const d = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).applyQuaternion(site.quaternion);
    const n = where.clone().normalize();
    return d.addScaledVector(n, -d.dot(n)).normalize();
  };
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(site.quaternion);
  const centre = at(layout.fountain.x, top, layout.fountain.z);
  const out = BOARD_DEPTH / 2 + PROUD;
  return {
    place,
    index,
    centre,
    up: centre.clone().normalize(),
    spots: layout.spots.map((spot) => {
      const where = at(spot.x, top, spot.z);
      return { role: spot.role, at: where, facing: along(spot.yaw, where) };
    }),
    boards: layout.boards.map((board) => ({
      kind: board.kind,
      at: at(board.x + Math.sin(board.yaw) * out, top + board.lift, board.z + Math.cos(board.yaw) * out),
      normal: new THREE.Vector3(Math.sin(board.yaw), 0, Math.cos(board.yaw)).applyQuaternion(site.quaternion),
      up: up.clone(),
      width: board.width,
      height: board.height,
    })),
    hall: (() => {
      const door = at(layout.hall.x, top, layout.hall.z);
      return { at: door, facing: along(layout.hall.yaw, door) };
    })(),
  };
}
