/** `window.atlasWorld`: the console's handle on the running world. */

import * as THREE from 'three';
import type { Craft } from '../craft.ts';
import type { WorldPlayer } from '../player.ts';
import type { WorldRig } from '../camera.ts';
import type { Shell } from '../shell.ts';
import { UFO_RADIUS } from '../ufo.ts';
import { latLonOf, unitAt } from '../../sphere.ts';
import type { Rocket } from '../../rocket.ts';
import type { Parts } from './parts.ts';
import type { PadPlan } from './pads.ts';
import type { RocketPads } from './rocket-pads.ts';
import type { Spawn } from './spawn.ts';

/**
 * Exposes the world on `globalThis.atlasWorld`: `.goTo(lat, lon)`, `.hour(h)`,
 * `.stats()`, `.spec`, `.terrain`, `.geography`, `.player`, `.rig`, `.leave()`;
 * `.ufos()` lists the parked saucers nearest first and `.toUfo(k)` walks the
 * traveller to one.
 */
export function exposeWorld(deps: {
  parts: Parts;
  renderer: THREE.WebGLRenderer;
  player: WorldPlayer;
  rig: WorldRig;
  shell: Shell;
  crafts: Craft[];
  rocketPads: RocketPads;
  plan: PadPlan;
  spawn: Spawn;
  /** Stands the traveller clear of walls and on the ground. */
  settle(): void;
  leave(): void;
}): void {
  const { parts, renderer, player, rig, shell, crafts, rocketPads, plan, spawn, settle, leave } = deps;
  const { spec, R, terrain, geography, surface, sky, settlements, crowd, frontiers, ground, skyships, roads, traffic, sward, outposts } = parts;
  const ufoAt = new THREE.Vector3();
  const start = new THREE.Vector3();
  const look = new THREE.Vector3();

  /** The saucers parked off the towns' corners, nearest first: the town, where, and how far. */
  function listUfos(): { site: string; lat: number; lon: number; away: number }[] {
    const out: { site: string; lat: number; lon: number; away: number }[] = [];
    const here = player.position.clone().setLength(R);
    for (const [id, spots] of plan.ufoSpots) {
      const site = spawn.byId(id)!;
      for (const spot of spots) {
        settlements.toWorld(site, spot.x, 0, spot.z, ufoAt);
        const { lat, lon } = latLonOf(ufoAt);
        out.push({ site: site.name, lat, lon, away: Math.round(ufoAt.setLength(R).distanceTo(here)) });
      }
    }
    return out.sort((a, b) => a.away - b.away);
  }

  Object.assign(globalThis, {
    atlasWorld: {
      spec,
      terrain,
      geography,
      surface,
      player,
      rig,
      sky,
      settlements,
      crowd,
      frontiers,
      ground,
      hud: shell.hud,
      /** The maps' paper: `.stats` is what is painted, stored and baked. */
      mapTiles: shell.mapTiles,
      map: shell.map,
      leave,
      /** The pads standing round the traveller; `.board(rocket)` gets in the nearest as `E` does. */
      rockets: () => [...rocketPads.rockets.values()],
      skyships,
      roads,
      crafts,
      traffic,
      sward,
      outposts,
      board: (rocket?: Rocket) => {
        const nearest = rocket ?? [...rocketPads.rockets.values()].sort((a, b) => a.position.distanceTo(player.position) - b.position.distanceTo(player.position))[0];
        if (nearest !== undefined) rocketPads.board(nearest);
      },
      goTo(lat: number, lon: number) {
        spawn.standAt(lat, lon);
        shell.hud.jump();
      },
      ufos: listUfos,
      /** Stands the traveller a few paces from the `k`th nearest parked saucer (`ufos()`), facing it. */
      toUfo(k = 0) {
        const one = listUfos()[k];
        if (one === undefined) return;
        unitAt(one.lat, one.lon, ufoAt);
        const up = ufoAt.clone();
        const side = new THREE.Vector3(up.y, -up.x, 0.2).cross(up).normalize();
        start.copy(ufoAt).multiplyScalar(R).addScaledVector(side, UFO_RADIUS + 8);
        look.copy(ufoAt).multiplyScalar(R).sub(start);
        player.place(start.normalize(), look);
        rig.heading.copy(player.facing);
        settle();
        shell.hud.jump();
      },
      hour(h: number) {
        sky.setHour(h, shell.date(), player.position);
      },
      stats: () => ({
        ground: { ...ground.stats },
        frontiers: { ...frontiers.stats },
        towns: { ...settlements.stats },
        crowd: { ...crowd.stats },
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        hour: sky.state.hour,
        au: sky.state.au,
      }),
    },
  });
}
