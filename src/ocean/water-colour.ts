// The water's colours: a profile of three tones (shoal, shelf, deep) per point,
// and the depth ramp between them by distance from the coast. The 2D maps paint
// the sea as one flat `OCEAN_COLOR`, so the open ocean is that colour exactly
// and everything shallower is brighter and everything colder darker.

import * as THREE from 'three';
import { biomeAt, biomeSample } from '../biome.ts';
import { latOf, lonOf } from '../sphere.ts';
import { fbm } from '../terrain.ts';
import { OCEAN_COLOR, PALETTE } from '../theme.ts';
import { ABYSS, SHELF } from './constants.ts';

export const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);
const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

// Temperature comes from `biome.ts`: `biomeAt` at zero elevation is the one
// warmth model, so the turquoise starts where the sand starts.
const deepWarm = new THREE.Color(OCEAN_COLOR);
const deepCold = new THREE.Color(OCEAN_COLOR)
  .lerp(new THREE.Color(PALETTE.steel), 0.30)
  .multiplyScalar(0.66);
// The shelf tones sit far enough from the deep that the shelf reads from a
// plane's circuit.
const shelfWarm = new THREE.Color(OCEAN_COLOR).lerp(new THREE.Color(PALETTE.skyBlue), 0.60);
const shelfCold = new THREE.Color(OCEAN_COLOR).lerp(new THREE.Color(PALETTE.bone), 0.30);
const shoalWarm = new THREE.Color(OCEAN_COLOR).lerp(new THREE.Color(PALETTE.skyBlue), 0.92);
const shoalCold = new THREE.Color(OCEAN_COLOR).lerp(new THREE.Color(PALETTE.bone), 0.52);
/** The wash: `white` rather than `cream`, which is two steps from the beach's `sand` and would lose the waterline. */
export const FOAM_COLOR = new THREE.Color(PALETTE.white);

/** Basin variation: one slow noise, so no two oceans are the same flat tone. */
const BASIN_FREQUENCY = 3.2;
const BASIN_DEPTH = 0.20;

const waterSample = biomeSample();
const waterDeep = new THREE.Color();
const waterShelf = new THREE.Color();
const waterShoal = new THREE.Color();

/**
 * The three tones this patch of sea runs between: shoal, shelf and deep, nine
 * numbers written into `out`. Separate from the depth ramp because the profile
 * is the expensive half (a biome lookup and a noise) and every vertex of a band
 * shares its point's profile.
 */
export function waterProfile(ux: number, uy: number, uz: number, out: Float64Array, offset: number): void {
  const lat = latOf(uy);
  const lon = lonOf(ux, uz);
  // Zero elevation, so this is the warmth term and nothing else.
  biomeAt(ux, uy, uz, lat, lon, 0, waterSample);
  const warm = smoothstep(0.20, 0.72, waterSample.warmth);
  // The noise is on the lightness only and it is small, so a basin is not a flat wash.
  const basin = 1 + BASIN_DEPTH * (fbm(ux * BASIN_FREQUENCY, uy * BASIN_FREQUENCY, uz * BASIN_FREQUENCY, 3) - 0.5);

  waterShoal.copy(shoalCold).lerp(shoalWarm, warm).multiplyScalar(basin);
  waterShelf.copy(shelfCold).lerp(shelfWarm, warm).multiplyScalar(basin);
  waterDeep.copy(deepCold).lerp(deepWarm, warm).multiplyScalar(basin);
  out[offset] = waterShoal.r; out[offset + 1] = waterShoal.g; out[offset + 2] = waterShoal.b;
  out[offset + 3] = waterShelf.r; out[offset + 4] = waterShelf.g; out[offset + 5] = waterShelf.b;
  out[offset + 6] = waterDeep.r; out[offset + 7] = waterDeep.g; out[offset + 8] = waterDeep.b;
}

/**
 * The depth ramp: where between shoal, shelf and deep a point `distance` units
 * from the coast sits. Two ramps rather than one, or the colour change would be
 * spent in the first hundred units; the second runs to `ABYSS` so the sphere
 * carries a graded margin round every landmass beyond the ribbon.
 */
export function depthMix(profile: Float64Array, offset: number, distance: number, target: THREE.Color): THREE.Color {
  const toShelf = smoothstep(0, SHELF * 0.44, distance);
  const toDeep = smoothstep(SHELF * 0.54, ABYSS, distance);
  const shoalR = profile[offset]!, shoalG = profile[offset + 1]!, shoalB = profile[offset + 2]!;
  const shelfR = profile[offset + 3]!, shelfG = profile[offset + 4]!, shelfB = profile[offset + 5]!;
  const deepR = profile[offset + 6]!, deepG = profile[offset + 7]!, deepB = profile[offset + 8]!;
  const r = shoalR + (shelfR - shoalR) * toShelf;
  const g = shoalG + (shelfG - shoalG) * toShelf;
  const b = shoalB + (shelfB - shoalB) * toShelf;
  // Set in the working space, where the profile's numbers already are: a colour
  // space argument would convert them a second time.
  return target.setRGB(
    r + (deepR - r) * toDeep,
    g + (deepG - g) * toDeep,
    b + (deepB - b) * toDeep,
  );
}

const singleProfile = new Float64Array(9);

/** Both halves at once, for the sphere, which asks once per vertex. */
export function waterColor(
  ux: number,
  uy: number,
  uz: number,
  distance: number,
  target: THREE.Color,
): THREE.Color {
  waterProfile(ux, uy, uz, singleProfile, 0);
  return depthMix(singleProfile, 0, distance, target);
}
