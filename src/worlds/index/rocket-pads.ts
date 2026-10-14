/** The towns' rockets: built as the traveller comes near, boarded, left, and let go when far. */

import * as THREE from 'three';
import type { Craft } from '../craft.ts';
import type { WorldPlayer } from '../player.ts';
import type { WorldRig } from '../camera.ts';
import type { Settlements } from '../settlements.ts';
import type { Terrain } from '../terrain.ts';
import { PAD_RADIUS, ROCKET_REACH, createRocket } from '../../rocket.ts';
import type { Rocket } from '../../rocket.ts';
import type { Pad } from './pads.ts';

/** A town's rocket is built inside this, units from the traveller, and let go past the second. */
const ROCKET_BUILD = 1400;
const ROCKET_DROP = 1900;

export interface RocketPads {
  /** The rockets standing, by town. */
  readonly rockets: Map<string, Rocket>;
  /** The rocket the traveller is in, or null. */
  riding: Rocket | null;
  /** The pads near enough built, the far ones let go. */
  stream(from: THREE.Vector3): void;
  /** The parked rocket nearest the traveller and within reach, or null. */
  inReach(): Rocket | null;
  board(rocket: Rocket): void;
  /** Out of the rocket, if it has not left the pad. */
  leave(): void;
}

export function createRocketPads(deps: {
  pads: ReadonlyMap<string, Pad>;
  settlements: Settlements;
  terrain: Terrain;
  scene: THREE.Scene;
  gradientMap: THREE.Texture;
  player: WorldPlayer;
  rig: WorldRig;
  crafts: readonly Craft[];
  radius: number;
  groundAt: (point: THREE.Vector3) => number;
  /** The rockets map, shared with the collision pass created before the player. */
  rockets: Map<string, Rocket>;
}): RocketPads {
  const { pads, settlements, terrain, scene, gradientMap, player, rig, radius: R, groundAt, rockets } = deps;
  const padAt = new THREE.Vector3();
  const padAhead = new THREE.Vector3();
  const padUp = new THREE.Vector3();
  const padSide = new THREE.Vector3();
  const padOther = new THREE.Vector3();
  const padProbe = new THREE.Vector3();
  const stepOut = new THREE.Vector3();

  const self: RocketPads = {
    rockets,
    riding: null,
    stream(from) {
      for (const [id, pad] of pads) {
        const away = from.distanceTo(pad.site.origin);
        const standing = rockets.get(id);
        if (standing === undefined && away < ROCKET_BUILD * Math.max(1, settlements.reach)) {
          settlements.toWorld(pad.site, pad.x, 0, pad.z, padAt);
          settlements.toWorld(pad.site, pad.ahead.x, 0, pad.ahead.z, padAhead);
          // On the highest ground under the pad: its drum reaches down to the rest.
          padUp.copy(padAt).normalize();
          padSide.set(padUp.y, -padUp.x, 0);
          if (padSide.lengthSq() < 1e-8) padSide.set(1, 0, 0);
          padSide.normalize();
          padOther.crossVectors(padUp, padSide);
          let seat = groundAt(padAt);
          for (let k = 0; k < 8; k++) {
            const a = (k / 8) * Math.PI * 2;
            padProbe.copy(padAt).addScaledVector(padSide, Math.cos(a) * PAD_RADIUS).addScaledVector(padOther, Math.sin(a) * PAD_RADIUS);
            seat = Math.max(seat, groundAt(padProbe));
          }
          padAt.setLength(R + seat);
          padAhead.sub(padAt);
          const rocket = createRocket(padAt, padUp, padAhead, gradientMap);
          scene.add(rocket.object);
          rockets.set(id, rocket);
        } else if (standing !== undefined && away > ROCKET_DROP * Math.max(1, settlements.reach) && standing !== self.riding) {
          standing.dispose();
          rockets.delete(id);
        }
      }
    },
    inReach() {
      let found: Rocket | null = null;
      let best = Infinity;
      for (const rocket of rockets.values()) {
        if (rocket.state !== 'parked') continue;
        const d = rocket.position.distanceTo(player.position);
        if (d < ROCKET_REACH && d < best) [found, best] = [rocket, d];
      }
      return found;
    },
    board(rocket) {
      if (player.craft !== null) player.leave();
      rocket.board(player.avatar.group);
      self.riding = rocket;
    },
    leave() {
      if (self.riding === null || !self.riding.leave(stepOut)) return;
      const facing = stepOut.clone().sub(self.riding.position);
      self.riding = null;
      player.place(stepOut, facing);
      rig.snap(player, groundAt, R, terrain.high);
    },
  };
  return self;
}
