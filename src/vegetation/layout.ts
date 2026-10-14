/** Where a tile will try to put a plant. */
import type * as THREE from 'three';
import { BIOMES, biomeAt } from '../biome.ts';
import type { BiomeSample } from '../biome.ts';
import { reliefAt } from '../terrain.ts';
import { rngFrom } from '../scenery/index.ts';
import { latOf, lonOf } from '../sphere.ts';
import { GROVE_FROM, GROVE_PLANTS, GROVE_RADIUS, JITTER, groveSpacing, pitchOf } from './levels.ts';
import type { Tile } from './tiles.ts';

/**
 * One place to try a plant. Two layouts feed one loop: the near levels are a
 * grid, one site per cell, where `cover` decides per site; the far levels are
 * groves, where `cover` is spent once on whether the grove is there and every
 * site inside it is planted.
 */
export interface Site {
  x: number;
  z: number;
  rng: ReturnType<typeof rngFrom>;
  /** True inside a grove: `cover` has already had its say, at the centre. */
  dense: boolean;
}

/** One site a cell. The cell seeds the plant, so adding a species or moving a town leaves every other plant where it was. */
function gridSites(tile: Tile, sites: Site[]): void {
  const pitch = pitchOf(tile.level);
  const columns = Math.max(1, Math.round((tile.halfEast * 2) / pitch));
  const rows = Math.max(1, Math.round((tile.halfNorth * 2) / pitch));
  const stepX = (tile.halfEast * 2) / columns;
  const stepZ = (tile.halfNorth * 2) / rows;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const rng = rngFrom(tile.key, column, row);
      sites.push({
        x: -tile.halfEast + (column + 0.5) * stepX + rng.jitter() * stepX * JITTER,
        z: -tile.halfNorth + (row + 0.5) * stepZ + rng.jitter() * stepZ * JITTER,
        rng,
        dense: false,
      });
    }
  }
}

/** A lattice of grove centres, each kept or not by the biome's `cover` at its centre, then `GROVE_PLANTS` sites in a disc. */
function groveSites(
  tile: Tile,
  sites: Site[],
  directionAt: (x: number, z: number, target: THREE.Vector3) => THREE.Vector3,
  scratch: THREE.Vector3,
  sample: BiomeSample,
): void {
  const spacing = groveSpacing(tile.level);
  const columns = Math.max(1, Math.round((tile.halfEast * 2) / spacing));
  const rows = Math.max(1, Math.round((tile.halfNorth * 2) / spacing));
  const stepX = (tile.halfEast * 2) / columns;
  const stepZ = (tile.halfNorth * 2) / rows;
  const radius = Math.min(stepX, stepZ) * GROVE_RADIUS;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const seed = rngFrom(tile.key, 'grove', column, row);
      const cx = -tile.halfEast + (column + 0.5) * stepX + seed.jitter() * stepX * JITTER;
      const cz = -tile.halfNorth + (row + 0.5) * stepZ + seed.jitter() * stepZ * JITTER;
      const at = directionAt(cx, cz, scratch);
      const lat = latOf(at.y);
      const lon = lonOf(at.x, at.z);
      biomeAt(at.x, at.y, at.z, lat, lon, reliefAt(at.x, at.y, at.z), sample);
      if (!seed.chance(BIOMES[sample.id].cover)) continue;
      for (let i = 0; i < GROVE_PLANTS; i++) {
        const rng = rngFrom(tile.key, 'plant', column * 4096 + row, i);
        // Square root on the radius, or every grove is a ring.
        const angle = rng.unit() * Math.PI * 2;
        const distance = Math.sqrt(rng.unit()) * radius;
        sites.push({
          x: cx + Math.cos(angle) * distance,
          z: cz + Math.sin(angle) * distance,
          rng,
          dense: true,
        });
      }
    }
  }
}

export function layoutSites(
  tile: Tile,
  directionAt: (x: number, z: number, target: THREE.Vector3) => THREE.Vector3,
  scratch: THREE.Vector3,
  sample: BiomeSample,
): Site[] {
  const sites: Site[] = [];
  if (tile.level < GROVE_FROM) gridSites(tile, sites);
  else groveSites(tile, sites, directionAt, scratch, sample);
  return sites;
}
