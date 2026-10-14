/** What the wood keeps off: the countryside's pieces, fields and fences under a tile, in the tile's frame. */
import type * as THREE from 'three';
import { PLANET_RADIUS } from '../globe.ts';
import type { CountryPlan } from '../countryside.ts';
import type { CountryFrame } from './types.ts';

export interface Keepouts {
  /** Readies the keepouts for a tile, in its frame. */
  prepare(plans: readonly CountryPlan[], frame: CountryFrame): void;
  /** Whether a plant `spread` wide at (x, z) in the tile's frame stands on something planned. */
  blocks(x: number, z: number, spread: number): boolean;
}

export function createKeepouts(): Keepouts {
  /** Discs (x, z, radius) for pieces, rectangles (x, z, yaw, halfX, halfZ) for fields, segments (ax, az, bx, bz) for fences. */
  const discs: number[] = [];
  const rects: number[] = [];
  const lines: number[] = [];
  let across: THREE.Vector3 | null = null;
  let north: THREE.Vector3 | null = null;
  const lx = (u: THREE.Vector3): number => u.dot(across!) * PLANET_RADIUS;
  const lz = (u: THREE.Vector3): number => u.dot(north!) * PLANET_RADIUS;

  function prepare(plans: readonly CountryPlan[], frame: CountryFrame): void {
    across = frame.across;
    north = frame.north;
    discs.length = 0;
    rects.length = 0;
    lines.length = 0;
    for (const plan of plans) {
      for (const piece of plan.pieces) discs.push(lx(piece.at), lz(piece.at), piece.footprint);
      for (const field of plan.fields) rects.push(lx(field.at), lz(field.at), field.yaw, field.halfX, field.halfZ);
      for (const line of plan.lines) lines.push(lx(line.from), lz(line.from), lx(line.to), lz(line.to));
    }
  }

  function blocks(x: number, z: number, spread: number): boolean {
    for (let i = 0; i < discs.length; i += 3) {
      const r = discs[i + 2]! + spread * 0.6;
      const dx = x - discs[i]!;
      const dz = z - discs[i + 1]!;
      if (dx * dx + dz * dz < r * r) return true;
    }
    for (let i = 0; i < rects.length; i += 5) {
      const dx = x - rects[i]!;
      const dz = z - rects[i + 1]!;
      const c = Math.cos(rects[i + 2]!);
      const s = Math.sin(rects[i + 2]!);
      if (Math.abs(dx * c - dz * s) < rects[i + 3]! + spread * 0.5 && Math.abs(dx * s + dz * c) < rects[i + 4]! + spread * 0.5) return true;
    }
    for (let i = 0; i < lines.length; i += 4) {
      const ax = lines[i]!;
      const az = lines[i + 1]!;
      const dx = lines[i + 2]! - ax;
      const dz = lines[i + 3]! - az;
      const lengthSq = dx * dx + dz * dz;
      let t = lengthSq > 1e-9 ? ((x - ax) * dx + (z - az) * dz) / lengthSq : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ox = ax + t * dx - x;
      const oz = az + t * dz - z;
      const r = 1 + spread * 0.5;
      if (ox * ox + oz * oz < r * r) return true;
    }
    return false;
  }

  return { prepare, blocks };
}
