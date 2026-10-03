/**
 * A walked world as the shared UI sees it: the `PlanetSurface` (`planet.ts`)
 * that the HUD, the minimap, the world map and the navigation are handed in
 * place of Earth's globe.
 *
 * Everything here reads the world's one definitions and restates none of
 * them: the radius is the terrain's own, the ground's colour and relief are
 * `terrain.ts`'s `sample` and `heightAt`, and the political map is
 * `system/geography.ts`'s. Earth's paper is painted from `groundColorAt`; a
 * world's is painted from exactly the colour its tiles are built with, so
 * the map and the ground agree the way Earth's do.
 *
 * ## Which edges are frontiers
 *
 * Earth's `coastEdges` steps off each ring edge and asks whether the other
 * side is sea. A walked world has no sea, and its rings carry a second kind
 * of edge Earth's do not: `geography.ts` keeps every ring inside one tile of
 * the sphere, so a nation that crosses the equator or a quarter meridian is
 * two rings joined along a straight lattice line. That line is not a border
 * and must not be drawn as one. So an edge is a frontier when it lies on one
 * of `geography.frontiers` — the lines two nations actually share, each
 * listed once — and **2**, *not an edge*, otherwise, which `map.ts` leaves
 * undrawn as it does a ring's run along a pole. There is no 1: nothing here is
 * a coast.
 */

import * as THREE from 'three';
import type { World } from '../geo.ts';
import { frontierEdges } from '../system/outlines.ts';
import type { PlanetSurface } from '../planet.ts';
import type { Geography } from '../system/geography.ts';
import type { Terrain } from './terrain.ts';
import { newSample } from './terrain.ts';

export { frontierEdges, outlinesOf } from '../system/outlines.ts';

export function surfaceOf(terrain: Terrain, geography: Geography): PlanetSurface {
  const body = terrain.spec.body;
  const sample = newSample();
  let edges: Uint8Array[] | null = null;
  return {
    id: terrain.spec.id,
    name: body.name,
    radius: terrain.radius,
    radiusKm: body.radiusKm,
    groundCeiling: terrain.radius + Math.max(0, terrain.high),
    // Every world walked so far is dry, and its map is tiled by nations: there
    // is no water to be on and no ground that is nobody's.
    sea: false,
    emptyLabel: body.name,
    colorAt(unit: THREE.Vector3, out: THREE.Color): THREE.Color {
      terrain.sample(unit.x, unit.y, unit.z, sample);
      return out.setRGB(sample.r, sample.g, sample.b);
    },
    reliefAt: (x, y, z) => terrain.heightAt(x, y, z),
    coastEdges(world: World): Uint8Array[] {
      if (world !== geography.world) return frontierEdges(world, geography);
      edges ??= frontierEdges(world, geography);
      return edges;
    },
  };
}
