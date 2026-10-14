/**
 * The people of another world, walking their towns.
 *
 * A species is drawn as the space kit's creatures (`CreatureCast`): one or two
 * of the pack's animated aliens scaled to the species' own height and painted
 * in its hides, trims and accents (`kit.ts`'s `creaturePaint`), so the people
 * of a world are one people and every one of them a different coat. They play
 * the pack's own clips: the walk timed to the ground they cover, the idle while
 * they stand, now and then a wave, a nod, a jump or a dance; spoken to, they
 * stop, turn to the visitor and wave, then nod and shake their heads as they
 * talk. A species that leans (`Morph.windLean`) leans into the world's wind.
 *
 * Near only, and pooled: a town is peopled while the traveller is within
 * `CROWD_REACH` of it, its walkers animated within `ANIMATE_REACH` of the eye
 * and stood still past it, hidden past `SHOW_REACH`; a walker put away keeps
 * its rig in a pool by creature, repainted when it is stood up again.
 *
 * Where a walker may go is the street plan and nothing else (`aliens/plan.ts`):
 * every route is a straight segment tested against the town's footprints, so a
 * walker never walks through a wall and needs no collision of its own. A town
 * with a landing pad has two or three of the kit's crew astronauts standing
 * round its ship; they are from elsewhere and are not spoken to. The arrival
 * and the parked craft are kept clear (`keepClear`).
 */

import * as THREE from 'three';
import type { WorldSpec } from './contract.ts';
import type { Settlements, Site } from './settlements.ts';
import type { SceneryContext } from '../scenery/contract.ts';
import { worldKit } from './kit.ts';
import { people, unpeople } from './aliens/populate.ts';
import { release } from './aliens/rigs.ts';
import { ANIMATE_REACH, SHOW_REACH, animate, separate, step } from './aliens/walking.ts';
import { createCrowdState } from './aliens/state.ts';
import type { Crowd, KeepClear, Walker } from './aliens/types.ts';

export { bodyOf } from './aliens/body.ts';
export type { AlienBody } from './aliens/body.ts';
export { coatOf, crowdOf, statureOf, WIDEST } from './aliens/rules.ts';
export type { Crowd, KeepClear, Walker } from './aliens/types.ts';

/** Walkers are stood up in towns within this of the traveller, past their radius, and put away past the second. */
const CROWD_REACH = 450;
const CROWD_DROP = 650;

const UP = new THREE.Vector3(0, 1, 0);

export function createCrowd(
  spec: WorldSpec,
  settlements: Settlements,
  _ctx: SceneryContext,
  gradientMap: THREE.Texture,
  keepClear: (site: Site) => readonly KeepClear[] = () => [],
): Crowd {
  const s = createCrowdState(spec, settlements, gradientMap, keepClear);
  const { group, walkers, stats, pool, peopled, cast, material, windLean, wind, upwind } = s;
  const turn = new THREE.Quaternion();
  const lean = new THREE.Quaternion();
  const leanEuler = new THREE.Euler();
  const near = new THREE.Vector3();
  const inverse = new THREE.Quaternion();

  /** Stands people up in the towns the traveller has come near and puts them away from those left behind. */
  function streamTowns(player: THREE.Vector3): void {
    for (const site of settlements.sites) {
      if (site.landmark) continue;
      const d = player.distanceTo(site.origin);
      const on = peopled.has(site.id);
      const ready = site.mesh !== null && site.kit;
      if (!on && ready && d < site.radius + CROWD_REACH) {
        if (people(s, site)) peopled.add(site.id);
      } else if (on && (d > site.radius + CROWD_DROP || !ready)) unpeople(s, site);
    }
  }

  return {
    group,
    walkers,
    stats,
    update(dt, player, eye = player) {
      streamTowns(player);
      separate(s, dt);
      let animated = 0;
      let lastSite: Site | null = null;
      let playerLocal: THREE.Vector3 | null = null;
      for (const w of walkers) {
        if (w.site !== lastSite) {
          lastSite = w.site;
          near.copy(player).sub(w.site.origin).applyQuaternion(inverse.copy(w.site.quaternion).invert());
          playerLocal = Math.abs(near.y - w.site.floor) < 6 ? near : null;
        }
        const travelled = step(s, w, dt, playerLocal);
        settlements.toWorld(w.site, w.x, w.site.floor, w.z, w.mesh.position);
        w.mesh.quaternion.copy(w.site.quaternion).multiply(turn.setFromAxisAngle(UP, w.yaw));
        // Into the wind: forward by how much of it comes from ahead, sideways by the rest.
        if (upwind !== null && windLean !== 0 && wind !== null) {
          const gust = windLean * wind.strength * (1 + 0.18 * Math.sin(w.clock * 2.3 + w.x));
          const ahead = upwind.x * Math.sin(w.yaw) + upwind.z * Math.cos(w.yaw);
          const side = upwind.x * Math.cos(w.yaw) - upwind.z * Math.sin(w.yaw);
          w.mesh.quaternion.multiply(lean.setFromEuler(leanEuler.set(gust * ahead, 0, -gust * side)));
        }
        const d = w.mesh.position.distanceTo(eye);
        w.mesh.visible = d < SHOW_REACH;
        const live = d < ANIMATE_REACH;
        animate(w, dt, travelled, live);
        if (live) animated++;
      }
      stats.walkers = walkers.length;
      stats.animated = animated;
      stats.bodies = cast === undefined ? 0 : cast.creatures.filter((one) => worldKit()?.creatures.has(one.item) === true).length;
    },
    nearest(point, reach) {
      let found: Walker | null = null;
      let best = reach;
      for (const w of walkers) {
        if (w.visitor) continue;
        // A tall body is spoken to from further off.
        const d = w.mesh.position.distanceTo(point) - Math.max(0, w.height - 4) * 0.3;
        if (d < best) {
          best = d;
          found = w;
        }
      }
      return found;
    },
    headOf(walker, out) {
      return out.copy(walker.site.dir).multiplyScalar(walker.height * 1.04).add(walker.mesh.position);
    },
    dispose() {
      for (const w of walkers) release(s, w);
      walkers.length = 0;
      // Each rig's geometry is its own colour over the creature's shared
      // attributes (the creature is kept for the next visit); each rig's
      // skeleton is its own clone with a bone texture of its own.
      for (const list of pool.values()) {
        for (const rigged of list) {
          rigged.body.geometry.dispose();
          rigged.body.skeleton.dispose();
          rigged.mixer.uncacheRoot(rigged.mixer.getRoot());
        }
      }
      pool.clear();
      material.dispose();
    },
  };
}
