import * as THREE from 'three';
import { poolAt } from '../../lights.ts';
import type { Ground } from './job.ts';

/**
 * Faces of a town's floor appended to its buffer, each vertex carrying the
 * light that falls on it from the lamps, the gates and the lit windows.
 */

/**
 * Something that lights the floor: a lamp, a gate, or a building with a window
 * on. `bed` is the hour it stops on `lights.ts`'s encoded clock (255 never),
 * the same byte a window carries.
 */
export interface Emitter {
  x: number;
  z: number;
  /**
   * The radius inside which the pool is at full, in world units: zero for a
   * lamp, the footprint for a building, so a building's light starts at its
   * wall rather than being spent under the house.
   */
  inner: number;
  /** Where the pool ends, in world units from the same centre. */
  reach: number;
  /** How bright at full, 0 to 1, before `poolAt`'s own peak. */
  strength: number;
  bed: number;
}

export const NO_EMITTERS: readonly Emitter[] = [];

/** The emitters whose reach touches a disc of `radius` about a point: filtered once per cell, not per vertex. */
export function litAround(emitters: readonly Emitter[], x: number, z: number, radius: number): readonly Emitter[] {
  if (emitters.length === 0) return NO_EMITTERS;
  const near: Emitter[] = [];
  for (const emitter of emitters) {
    const dx = x - emitter.x;
    const dz = z - emitter.z;
    const span = emitter.reach + radius;
    if (dx * dx + dz * dz < span * span) near.push(emitter);
  }
  return near.length === 0 ? NO_EMITTERS : near;
}

export interface GroundWriter {
  /** The emitters that can reach the faces being pushed now; set per cell. */
  lit: readonly Emitter[];
  /** One triangle of ground, wound so it faces the sky and flat-shaded. */
  pushFace(
    out: Ground,
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    ca: THREE.Color, cb: THREE.Color, cc: THREE.Color,
  ): void;
  pushQuad(
    out: Ground,
    a: number[], b: number[], c: number[], d: number[],
    ca: THREE.Color, cb: THREE.Color, cc: THREE.Color, cd: THREE.Color,
  ): void;
  /** One vertical face, wound to face `(outX, outZ)` in the town's plane: a riser, a quay, a side or a step. */
  pushWall(
    out: Ground,
    a: number[], b: number[], c: number[], d: number[],
    ca: THREE.Color, cb: THREE.Color, cc: THREE.Color, cd: THREE.Color,
    outX: number, outZ: number,
  ): void;
}

export function createGroundWriter(): GroundWriter {
  const faceA = new THREE.Vector3();
  const faceB = new THREE.Vector3();
  const faceNormal = new THREE.Vector3();

  /**
   * The brightest emitter wins outright: a vertex carries one bedtime, and a
   * sum would keep a house's spill lit as long as the lamp it overlaps.
   */
  const poolFor = (out: Ground, x: number, z: number): void => {
    let best = 0;
    let bed = 0;
    for (const emitter of writer.lit) {
      const value = poolAt(emitter.strength, Math.hypot(x - emitter.x, z - emitter.z), emitter.inner, emitter.reach);
      if (value > best) {
        best = value;
        bed = emitter.bed;
      }
    }
    out.glow.push(best, bed);
  };

  /**
   * The normal is computed and the winding flipped to make it face up, since a
   * cell on a terrace is not level in the town's flat frame. Non-indexed with
   * one normal per face, so the ground keeps flat cel facets.
   */
  function pushFace(
    out: Ground,
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    ca: THREE.Color, cb: THREE.Color, cc: THREE.Color,
  ): void {
    faceA.set(bx - ax, by - ay, bz - az);
    faceB.set(cx - ax, cy - ay, cz - az);
    faceNormal.crossVectors(faceA, faceB);
    const area = faceNormal.length();
    // Two lattice corners can coincide where a cell straddles a shelf.
    if (area < 1e-4) return;
    faceNormal.multiplyScalar(1 / area);
    let flip = false;
    if (faceNormal.y < 0) {
      faceNormal.negate();
      flip = true;
    }
    const p1x = flip ? cx : bx, p1y = flip ? cy : by, p1z = flip ? cz : bz;
    const p2x = flip ? bx : cx, p2y = flip ? by : cy, p2z = flip ? bz : cz;
    const k1 = flip ? cc : cb;
    const k2 = flip ? cb : cc;
    out.position.push(ax, ay, az, p1x, p1y, p1z, p2x, p2y, p2z);
    for (let v = 0; v < 3; v++) out.normal.push(faceNormal.x, faceNormal.y, faceNormal.z);
    out.color.push(ca.r, ca.g, ca.b, k1.r, k1.g, k1.b, k2.r, k2.g, k2.b);
    // In the order the positions went in, which the flip may have swapped.
    poolFor(out, ax, az);
    poolFor(out, p1x, p1z);
    poolFor(out, p2x, p2z);
  }

  const pushQuad = (
    out: Ground,
    a: number[], b: number[], c: number[], d: number[],
    ca: THREE.Color, cb: THREE.Color, cc: THREE.Color, cd: THREE.Color,
  ): void => {
    pushFace(out, a[0]!, a[1]!, a[2]!, b[0]!, b[1]!, b[2]!, c[0]!, c[1]!, c[2]!, ca, cb, cc);
    pushFace(out, a[0]!, a[1]!, a[2]!, c[0]!, c[1]!, c[2]!, d[0]!, d[1]!, d[2]!, ca, cc, cd);
  };

  /**
   * Wound against the known outward direction rather than `pushFace`'s "face
   * up" rule: a face walked along two slightly tilted local ups is vertical
   * only to that tilt, so its normal's `y` sign is noise.
   */
  function wallFace(
    out: Ground,
    a: number[], b: number[], c: number[],
    ka: THREE.Color, kb: THREE.Color, kc: THREE.Color,
    outX: number, outZ: number,
  ): void {
    faceA.set(b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!);
    faceB.set(c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!);
    faceNormal.crossVectors(faceA, faceB);
    const area = faceNormal.length();
    if (area < 1e-4) return;
    faceNormal.multiplyScalar(1 / area);
    // The town's frame is `makeBasis(across, up, north)`: its x and z are the plane's own.
    const flip = faceNormal.x * outX + faceNormal.z * outZ < 0;
    if (flip) faceNormal.negate();
    const p = flip ? c : b;
    const q = flip ? b : c;
    const kp = flip ? kc : kb;
    const kq = flip ? kb : kc;
    out.position.push(a[0]!, a[1]!, a[2]!, p[0]!, p[1]!, p[2]!, q[0]!, q[1]!, q[2]!);
    for (let v = 0; v < 3; v++) out.normal.push(faceNormal.x, faceNormal.y, faceNormal.z);
    out.color.push(ka.r, ka.g, ka.b, kp.r, kp.g, kp.b, kq.r, kq.g, kq.b);
    poolFor(out, a[0]!, a[2]!);
    poolFor(out, p[0]!, p[2]!);
    poolFor(out, q[0]!, q[2]!);
  }

  function pushWall(
    out: Ground,
    a: number[], b: number[], c: number[], d: number[],
    ca: THREE.Color, cb: THREE.Color, cc: THREE.Color, cd: THREE.Color,
    outX: number, outZ: number,
  ): void {
    wallFace(out, a, b, c, ca, cb, cc, outX, outZ);
    wallFace(out, a, c, d, ca, cc, cd, outX, outZ);
  }

  const writer: GroundWriter = { lit: NO_EMITTERS, pushFace, pushQuad, pushWall };
  return writer;
}
