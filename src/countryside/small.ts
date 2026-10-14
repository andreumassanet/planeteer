/** The small things anywhere in a cell: rocks, a meadow in flower, a bench or a fingerpost by the road. */
import * as THREE from 'three';
import type { BiomeId } from '../biome.ts';
import type { Rng } from '../scenery/random.ts';
import { dirAt, inCell } from './frame.ts';
import type { Site } from './ground.ts';
import { roadGap } from './nearby.ts';
import { tryPut } from './placing.ts';
import type { Context } from './placing.ts';
import { PROP_GRADE } from './tables.ts';
import type { CountryPlan } from './types.ts';

const ROCKY: Partial<Record<BiomeId, number>> = { steppe: 0.4, savanna: 0.3, desert: 0.35, tundra: 0.45, rock: 0.5, grassland: 0.22, temperate: 0.12, boreal: 0.2 };
const BLOOMS: Partial<Record<BiomeId, number>> = { temperate: 0.35, grassland: 0.4, steppe: 0.15, boreal: 0.12, savanna: 0.1, tundra: 0.1 };

/** Each draw is made in a fixed order before anything can refuse the cell. */
export function smallThings(s: Site, plan: CountryPlan, rng: Rng, c: Context): void {
  const rockDraw = rng.unit();
  const rockX = rng.jitter() * c.halfEast * 0.8;
  const rockZ = rng.jitter() * c.halfNorth * 0.8;
  const meadowDraw = rng.unit();
  const meadowX = rng.jitter() * c.halfEast * 0.7;
  const meadowZ = rng.jitter() * c.halfNorth * 0.7;
  const meadowRadius = rng.range(18, 40);
  const petal = rng.int(5);
  const benchDraw = rng.unit();
  const signDraw = rng.unit();
  const side = rng.sign();
  const along = rng.range(-0.4, 0.4);

  if (rockDraw < (ROCKY[c.biome] ?? 0)) tryPut(s, plan, 'rocks', rockX, rockZ, rng.range(0, Math.PI * 2), rng, PROP_GRADE, rng.range(0.9, 1.6));

  if (meadowDraw < (BLOOMS[c.biome] ?? 0) && inCell(s.frame, meadowX, meadowZ, meadowRadius)) {
    plan.meadows.push({ at: dirAt(s.frame, meadowX, meadowZ, new THREE.Vector3()), radius: meadowRadius, petal });
  }

  // By the road: the carriageway nearest the cell's middle, a little along it.
  const road = roadGap(s.nearby, 0, 0);
  if (road.gap < Math.max(c.halfEast, c.halfNorth)) {
    const px = road.x + road.dx * along * c.halfNorth;
    const pz = road.z + road.dz * along * c.halfNorth;
    const near = roadGap(s.nearby, px, pz);
    const centreline = Math.hypot(px - near.x, pz - near.z);
    const clearance = centreline - near.gap;
    const nx = near.dz * side;
    const nz = -near.dx * side;
    const run = Math.atan2(near.dx, near.dz);
    const baseX = near.x;
    const baseZ = near.z;
    if (signDraw < 0.3) {
      // Boards along the part's X, so it faces across the road and points along it.
      tryPut(s, plan, 'signpost', baseX + nx * (clearance + 3), baseZ + nz * (clearance + 3), run + Math.PI / 2, rng, PROP_GRADE);
    } else if (benchDraw < 0.12) {
      // Its back to the road, looking out over the country.
      tryPut(s, plan, 'bench', baseX + nx * (clearance + 5), baseZ + nz * (clearance + 5), Math.atan2(nx, nz), rng, PROP_GRADE);
    }
  }
}
