/**
 * What covers another world's ground underfoot, as Earth's grass covers its
 * land: Earth's own grass (`grass.ts`), drawn by the same rings and the same
 * blades round the camera, asked of this world's ground instead of Earth's.
 * Without it the ground was a flat painted floor from the walker's eye; with
 * it the ground has a nap, catches the light and moves in the wind.
 *
 * What grows is the world's own: a short, stiff growth in the ground's own
 * colour — a regolith's grit on an airless crust, a hardier tuft where there
 * is air — sparse and ankle-high on the Moon and Mercury, thicker on Mars,
 * low and dark on Venus (`SWARDS`). Never on a cloud deck, which has no
 * ground to grow from, nor where the world keeps bare (`Terrain.bareAt`):
 * a town's levelled square, a road and its banks, a rocket's pad.
 *
 * The answers are `GrassGround`'s, which is all `grass.ts` asks of a planet:
 * the drawn ground's height (`Terrain.groundAt`, the finest tile's triangle,
 * which is what is drawn round the camera), its colour (`Terrain.sample`),
 * how thick and how tall.
 */

import * as THREE from 'three';
import type { WorldSpec } from './contract.ts';
import type { Terrain } from './terrain.ts';
import { newSample } from './terrain.ts';
import type { GrassGround, GrassSite } from '../vegetation.ts';

/** How thick and how tall a world's growth stands, of Earth's grass: 0 to 1 and a share of a knee. */
interface Sward {
  density: number;
  height: number;
  /** How much darker its root is than the ground it grows from, so the nap reads against it. */
  shade: number;
}

/** By world; a crust that names none takes `CRUST`. */
const SWARDS: Readonly<Record<string, Sward>> = {
  moon: { density: 0.42, height: 0.24, shade: 0.88 },
  mercury: { density: 0.4, height: 0.24, shade: 0.86 },
  mars: { density: 0.62, height: 0.4, shade: 0.84 },
  venus: { density: 0.5, height: 0.32, shade: 0.78 },
};
const CRUST: Sward = { density: 0.45, height: 0.28, shade: 0.86 };

/** The world's ground as the grass asks it, or null where nothing grows (a cloud deck). */
export function swardOf(spec: WorldSpec, terrain: Terrain): GrassGround | null {
  if (spec.ground === 'cloud-deck') return null;
  const look = SWARDS[spec.id] ?? CRUST;
  const R = terrain.radius;
  const sample = newSample();
  return {
    covers: () => true,
    gather: () => {},
    at(direction: THREE.Vector3, out: GrassSite): GrassSite | null {
      const { x, y, z } = direction;
      if (terrain.bareAt(x, y, z)) return null;
      terrain.sample(x, y, z, sample);
      out.radius = R + terrain.groundAt(x, y, z);
      out.density = look.density;
      out.r = sample.r * look.shade;
      out.g = sample.g * look.shade;
      out.b = sample.b * look.shade;
      out.dry = 0;
      out.height = look.height;
      return out;
    },
    floorChanges: (since) => since,
    version: () => 0,
  };
}
