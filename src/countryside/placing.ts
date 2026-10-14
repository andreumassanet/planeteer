/** Putting things into a plan: a piece, a field, a fence, and finding the coast. */
import * as THREE from 'three';
import type { BiomeId } from '../biome.ts';
import type { RegionStyle } from '../scenery/contract.ts';
import type { RegionId } from '../scenery/regions.ts';
import { rngFrom } from '../scenery/random.ts';
import type { Rng } from '../scenery/random.ts';
import { COUNTRY_PARTS, COUNTRY_VARIANTS, ROTOR_RADIUS } from '../countryside-kit.ts';
import { dirAt } from './frame.ts';
import { fieldFits, free, lineFree } from './ground.ts';
import type { Site } from './ground.ts';
import { CROP_GRADE, FIELD_GRADE } from './tables.ts';
import type { CountryPiece, CountryPlan, CropId } from './types.ts';

/** What a feature builder is told about the spot it was handed. */
export interface Context {
  x: number;
  z: number;
  iso: string;
  region: RegionId;
  biome: BiomeId;
  relief: number;
  style: RegionStyle;
  lat: number;
  halfEast: number;
  halfNorth: number;
}

export function put(s: Site, plan: CountryPlan, part: string, x: number, z: number, yaw: number, footprint: number, rng: Rng, scale = 1, scenic = false, base?: number): void {
  const piece: CountryPiece = {
    part,
    scenic,
    variant: rng.int(COUNTRY_VARIANTS),
    at: dirAt(s.frame, x, z, new THREE.Vector3()),
    yaw,
    scale,
    footprint: footprint * scale,
  };
  if (base !== undefined) piece.base = base;
  plan.pieces.push(piece);
  s.claimed.push({ x, z, radius: footprint * scale, yaw: 0, halfX: 0, halfZ: 0 });
}

/** Puts a part down if its ground is free; true if it stood. */
export function tryPut(s: Site, plan: CountryPlan, part: string, x: number, z: number, yaw: number, rng: Rng, grade: number, scale = 1): boolean {
  const spec = COUNTRY_PARTS[part]!;
  const reach = Math.max(spec.footprint, spec.rotor !== undefined ? ROTOR_RADIUS[spec.rotor.kind] * 0.55 : 0) * scale;
  if (!free(s, x, z, reach, grade)) return false;
  put(s, plan, part, x, z, yaw, reach, rng, scale);
  return true;
}

export function addField(s: Site, plan: CountryPlan, crop: CropId, x: number, z: number, yaw: number, halfX: number, halfZ: number, round = false): boolean {
  if (!fieldFits(s, x, z, yaw, halfX, halfZ, round, CROP_GRADE[crop] ?? FIELD_GRADE)) return false;
  plan.fields.push({ crop, at: dirAt(s.frame, x, z, new THREE.Vector3()), yaw, halfX, halfZ, round });
  s.claimed.push({ x, z, radius: Math.hypot(halfX, halfZ), yaw, halfX, halfZ });
  return true;
}

export function fence(s: Site, plan: CountryPlan, kind: 'fence' | 'wall', ax: number, az: number, bx: number, bz: number): void {
  if (!lineFree(s, ax, az, bx, bz)) return;
  plan.lines.push({ kind, from: dirAt(s.frame, ax, az, new THREE.Vector3()), to: dirAt(s.frame, bx, bz, new THREE.Vector3()) });
}

/** A wind direction a few degrees wide, shared by every turbine in it. */
export function windOf(lat: number, lon: number): number {
  return rngFrom('wind', Math.floor(lat / 4), Math.floor(lon / 4)).unit() * Math.PI * 2;
}

/**
 * The land point of a coastal cell with the most water round it, and the way
 * the water lies from it: a headland for a lighthouse, a strand for a jetty.
 * Sixteen candidates, eight looks each, only for a coastal cell that has
 * already drawn one of the two.
 */
export function coastPoint(s: Site, c: Context, wantHeadland: boolean): { x: number; z: number; toWater: number } | null {
  const { frame, world } = s;
  let best: { x: number; z: number; toWater: number; score: number } | null = null;
  const look = 26;
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const x = (-0.6 + (i * 1.2) / 3) * c.halfEast;
      const z = (-0.6 + (j * 1.2) / 3) * c.halfNorth;
      if (world.elevationAt(dirAt(frame, x, z, frame.scratch)) <= 0) continue;
      let wet = 0;
      let wx = 0;
      let wz = 0;
      for (let k = 0; k < 8; k++) {
        const angle = (k / 8) * Math.PI * 2;
        const ex = Math.sin(angle);
        const ez = Math.cos(angle);
        if (world.elevationAt(dirAt(frame, x + ex * look, z + ez * look, frame.scratch)) <= 0) {
          wet++;
          wx += ex;
          wz += ez;
        }
      }
      if (wet === 0 || wet === 8) continue;
      // A headland has water most of the way round; a strand on one side.
      const score = wantHeadland ? wet : 8 - Math.abs(wet - 3);
      if (best === null || score > best.score) best = { x, z, toWater: Math.atan2(wx, wz), score };
    }
  }
  return best;
}
