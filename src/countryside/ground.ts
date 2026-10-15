/** Is this ground free for something: inside the cell, on land, clear of everything built and of what the plan already holds. */
import * as THREE from 'three';
import type { World } from '../geo.ts';
import { MAX_SLOPE, gradeAt } from '../terrain.ts';
import type { Slope } from '../terrain.ts';
import { planGap, planGapToBox } from '../landmark-ground.ts';
import { MONUMENT_CLEARANCE } from '../tile-grid.ts';
import { dirAt, inCell } from './frame.ts';
import type { CellFrame } from './frame.ts';
import { roadGap } from './nearby.ts';
import type { Disc, Nearby } from './nearby.ts';
import { CROP_GRADE, FIELD_GRADE } from './tables.ts';
import type { CropId } from './types.ts';

/** Keep-clear margins past what each thing already claims, world units. */
const TOWN_MARGIN = 6;
const ROAD_MARGIN = 2;
/** How far apart a field's ground is asked about: under the narrowest carriageway. */
const FIELD_PROBE = 7;

/** Ground a plan has taken: a disc, or with `halfX` a rectangle turned by `yaw`. */
export interface Claim extends Disc {
  yaw: number;
  halfX: number;
  halfZ: number;
}

/** The cell being planned and what surrounds it: everything the free-ground questions read. */
export interface Site {
  world: World;
  frame: CellFrame;
  nearby: Nearby;
  /** What this plan has put down so far. */
  claimed: Claim[];
  slope: Slope;
}

/** A local point turned by `yaw` about (ox, oz): a new one each call, because a plan holds several at once. */
export function turn(ox: number, oz: number, yaw: number, lx: number, lz: number): { x: number; z: number } {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: ox + lx * c + lz * s, z: oz - lx * s + lz * c };
}

/** How far a point is from a claim's ground: its disc, or its rectangle. */
function claimDistance(claim: Claim, x: number, z: number): number {
  if (claim.halfX <= 0) return Math.hypot(x - claim.x, z - claim.z) - claim.radius;
  const c = Math.cos(claim.yaw);
  const s = Math.sin(claim.yaw);
  const dx = x - claim.x;
  const dz = z - claim.z;
  const lx = Math.abs(dx * c - dz * s) - claim.halfX;
  const lz = Math.abs(dx * s + dz * c) - claim.halfZ;
  return Math.hypot(Math.max(lx, 0), Math.max(lz, 0)) + Math.min(Math.max(lx, lz), 0);
}

/** Two turned rectangles overlap unless one of their four axes separates them. */
function rectsOverlap(a: Claim, b: Claim): boolean {
  const axes = [a.yaw, a.yaw + Math.PI / 2, b.yaw, b.yaw + Math.PI / 2];
  for (const angle of axes) {
    const ax = Math.cos(angle);
    const az = -Math.sin(angle);
    const extent = (r: Claim): number =>
      r.halfX * Math.abs(Math.cos(r.yaw) * ax - Math.sin(r.yaw) * az) + r.halfZ * Math.abs(Math.sin(r.yaw) * ax + Math.cos(r.yaw) * az);
    const gap = Math.abs((a.x - b.x) * ax + (a.z - b.z) * az);
    if (gap >= extent(a) + extent(b)) return false;
  }
  return true;
}

/**
 * Whether a disc of ground is free for something: in the cell, on land, clear
 * of every town's country, landmark, carriageway and field, of what this plan
 * already put down, and no steeper than `grade`.
 */
export function free(s: Site, x: number, z: number, radius: number, grade: number, water = false): boolean {
  const { frame, nearby } = s;
  if (!inCell(frame, x, z, radius)) return false;
  for (const town of nearby.townDiscs) {
    const r = town.radius + radius + TOWN_MARGIN;
    if ((x - town.x) ** 2 + (z - town.z) ** 2 < r * r) return false;
  }
  for (const disc of nearby.builtDiscs) {
    const r = disc.radius + radius;
    if ((x - disc.x) ** 2 + (z - disc.z) ** 2 < r * r) return false;
  }
  for (const plan of nearby.builtPlans) if (planGap(plan.shape, x - plan.x, z - plan.z) < radius + MONUMENT_CLEARANCE) return false;
  for (const claim of s.claimed) if (claimDistance(claim, x, z) < radius) return false;
  if (roadGap(nearby, x, z).gap < radius + ROAD_MARGIN) return false;
  if (water) return true;
  const u = dirAt(frame, x, z, frame.scratch);
  if (!frame.inland && s.world.elevationAt(u) <= 0) return false;
  return gradeAt(u, frame.east, frame.north, Math.max(1.2, radius * 0.7), s.slope).grade <= grade;
}

const probeClaim: Claim = { x: 0, z: 0, radius: 0, yaw: 0, halfX: 0, halfZ: 0 };

/** Whether the field's turned corners are inside the cell. */
function cornersInCell(s: Site, x: number, z: number, yaw: number, halfX: number, halfZ: number): boolean {
  for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    const p = turn(x, z, yaw, u * halfX, v * halfZ);
    if (!inCell(s.frame, p.x, p.z, 0)) return false;
  }
  return true;
}

/** Whether a field's rectangle is clear of towns, discs, landmarks and what the plan already holds. */
function clearOfBuilt(s: Site, x: number, z: number, yaw: number, halfX: number, halfZ: number): boolean {
  const { nearby } = s;
  for (const town of nearby.townDiscs) if (claimDistance(probeClaim, town.x, town.z) < town.radius + TOWN_MARGIN) return false;
  for (const disc of nearby.builtDiscs) if (claimDistance(probeClaim, disc.x, disc.z) < disc.radius) return false;
  if (nearby.builtPlans.length > 0) {
    // The field's own box in the cell's frame, which holds the turned field.
    const ex = Math.abs(halfX * Math.cos(yaw)) + Math.abs(halfZ * Math.sin(yaw));
    const ez = Math.abs(halfX * Math.sin(yaw)) + Math.abs(halfZ * Math.cos(yaw));
    for (const plan of nearby.builtPlans) {
      const dx = x - plan.x;
      const dz = z - plan.z;
      if (planGapToBox(plan.shape, dx - ex, dx + ex, dz - ez, dz + ez) < MONUMENT_CLEARANCE) return false;
    }
  }
  for (const claim of s.claimed) {
    if (claim.halfX > 0 ? rectsOverlap(claim, probeClaim) : claimDistance(probeClaim, claim.x, claim.z) < claim.radius) return false;
  }
  return true;
}

/**
 * Whether a rectangle is free for a field: its corners in the cell, clear of
 * every town's country, landmark and plane's field, of what the plan already
 * holds, of the carriageways and the water at every point of a lattice over
 * it, and flat enough to plough.
 */
export function fieldFits(s: Site, x: number, z: number, yaw: number, halfX: number, halfZ: number, round: boolean, grade: number): boolean {
  const { frame, nearby } = s;
  if (!cornersInCell(s, x, z, yaw, halfX, halfZ)) return false;
  Object.assign(probeClaim, { x, z, yaw, halfX, halfZ, radius: Math.hypot(halfX, halfZ) });
  if (!clearOfBuilt(s, x, z, yaw, halfX, halfZ)) return false;
  const across = Math.max(1, Math.ceil((2 * halfX) / FIELD_PROBE));
  const along = Math.max(1, Math.ceil((2 * halfZ) / FIELD_PROBE));
  for (let i = 0; i <= across; i++) {
    for (let j = 0; j <= along; j++) {
      const lx = -halfX + (i * 2 * halfX) / across;
      const lz = -halfZ + (j * 2 * halfZ) / along;
      if (round && (lx / halfX) ** 2 + (lz / halfZ) ** 2 > 1.0001) continue;
      const p = turn(x, z, yaw, lx, lz);
      if (roadGap(nearby, p.x, p.z).gap < ROAD_MARGIN) return false;
      if (!frame.inland && s.world.elevationAt(dirAt(frame, p.x, p.z, frame.scratch)) <= 0) return false;
    }
  }
  const u = dirAt(frame, x, z, new THREE.Vector3());
  return fieldSteepness(u, frame.east, frame.north, halfX, halfZ, s.slope) <= grade;
}

/**
 * How steep a field's ground is, to set against its crop's grade: the fall
 * across most of the rectangle, or a third less strictly over its narrow
 * middle, whichever is the worse. The one measure the planner and the check
 * both take.
 */
export function fieldSteepness(u: THREE.Vector3, east: THREE.Vector3, north: THREE.Vector3, halfX: number, halfZ: number, slope: Slope): number {
  const across = gradeAt(u, east, north, Math.hypot(halfX, halfZ) * 0.7, slope).grade;
  const middle = gradeAt(u, east, north, Math.min(halfX, halfZ) * 0.5, slope).grade / 1.3;
  return Math.max(across, middle);
}

/** The steepest ground a crop is grown on (`CROP_GRADE`, else `FIELD_GRADE`). */
export function cropGrade(crop: CropId): number {
  return CROP_GRADE[crop] ?? FIELD_GRADE;
}

/** A fence or a wall is only drawn where every few units of it are free. */
export function lineFree(s: Site, ax: number, az: number, bx: number, bz: number): boolean {
  const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 5));
  for (let i = 0; i <= steps; i++) {
    if (!free(s, ax + ((bx - ax) * i) / steps, az + ((bz - az) * i) / steps, 0.6, MAX_SLOPE)) return false;
  }
  return true;
}
