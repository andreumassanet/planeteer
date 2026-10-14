/** The lights a town shows at night: street lanterns, lit doorways and a landmark's plaza lamps. */

import * as THREE from 'three';
import { AVATAR_HEIGHT } from '../../stature.ts';
import { LAMP_FIELD } from '../../lights.ts';
import { CARRIAGE_TOP } from '../roads.ts';
import { planOf } from '../town-grid.ts';
import type { Site } from './types.ts';

/** A street lamp's height, units: a little over a person and a half. */
export const LAMP_HEIGHT = AVATAR_HEIGHT * 1.45;
/** How high a building's doorway light hangs over its floor: over a head, under its eaves. */
const DOOR_LIGHT = AVATAR_HEIGHT * 0.8;

interface PlazaLamp {
  x: number;
  z: number;
  yaw: number;
}

export interface TownLamps {
  /** Records a landmark's plaza lamps, in its site's frame, once it is built. */
  setPlazaLamps(siteId: string, lamps: PlazaLamp[]): void;
  /** The lights within `LAMP_FIELD` of `point` as `x, y, z, distance`, nearest first; returns how many. */
  near(sites: readonly Site[], point: THREE.Vector3, out: Float32Array, max: number): number;
}

export function createTownLamps(): TownLamps {
  const lights = new Map<string, Float32Array>();
  const plazaLamps = new Map<string, PlazaLamp[]>();
  const found: { x: number; y: number; z: number; d: number }[] = [];
  const scratch = new THREE.Vector3();

  /** A town's lights in the world, computed once: lanterns over the kerb and a doorway a lamp's height off each front. */
  function lightsOf(site: Site): Float32Array {
    const known = lights.get(site.id);
    if (known !== undefined) return known;
    const out: number[] = [];
    const at = new THREE.Vector3();
    const push = (x: number, y: number, z: number): void => {
      at.set(x, y, z).applyQuaternion(site.quaternion).add(site.origin);
      out.push(at.x, at.y, at.z);
    };
    // A landmark's plaza has its own ring of lamps, on its paving.
    for (const lamp of plazaLamps.get(site.id) ?? []) push(lamp.x + Math.sin(lamp.yaw) * 1.15, site.floor + LAMP_HEIGHT - 0.5, lamp.z + Math.cos(lamp.yaw) * 1.15);
    const town = site.town;
    if (town === null) {
      const heads = new Float32Array(out);
      lights.set(site.id, heads);
      return heads;
    }
    for (const lamp of town.lamps) push(lamp.x + Math.sin(lamp.yaw) * 1.15, site.floor + CARRIAGE_TOP + LAMP_HEIGHT - 0.5, lamp.z + Math.cos(lamp.yaw) * 1.15);
    for (const plot of town.plots) {
      if (plot.kind !== 'module' && plot.kind !== 'hub') continue;
      const deep = planOf(plot.form, plot.scale)[1];
      const out1 = deep / 2 + 1.2;
      push(plot.x + Math.sin(plot.yaw) * out1, site.floor + DOOR_LIGHT, plot.z + Math.cos(plot.yaw) * out1);
    }
    const heads = new Float32Array(out);
    lights.set(site.id, heads);
    return heads;
  }
  return {
    setPlazaLamps(siteId, lamps) {
      plazaLamps.set(siteId, lamps);
      lights.delete(siteId);
    },
    near(sites, point, out, max) {
      found.length = 0;
      for (const site of sites) {
        if (site.mesh === null || (site.town === null && !plazaLamps.has(site.id))) continue;
        if (site.origin.distanceTo(point) > site.radius * 1.5 + LAMP_FIELD) continue;
        const heads = lightsOf(site);
        for (let k = 0; k < heads.length; k += 3) {
          scratch.set(heads[k]!, heads[k + 1]!, heads[k + 2]!);
          const d = scratch.distanceTo(point);
          if (d < LAMP_FIELD) found.push({ x: heads[k]!, y: heads[k + 1]!, z: heads[k + 2]!, d });
        }
      }
      found.sort((a, b) => a.d - b.d);
      const n = Math.min(max, found.length);
      for (let i = 0; i < n; i++) out.set([found[i]!.x, found[i]!.y, found[i]!.z, found[i]!.d], i * 4);
      return n;
    },
  };
}
