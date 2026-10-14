import * as THREE from 'three';
import { PALETTE } from '../../theme.ts';
import { SLAB } from './config.ts';

/** A building standing in the town: its variant's own triangles and where they are. */
export interface OverheadHost {
  /** The variant's positions, in its own frame, three a vertex, a triangle list. */
  position: Float32Array;
  /** The variant into the town's frame: a yaw, a uniform scale and a translation. */
  matrix: THREE.Matrix4;
}

/** A variant's triangles bucketed by height, so a horizontal ray reads one slab of them. */
export interface Shape {
  minY: number;
  maxY: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  slabs: Int32Array[];
}

export const shapes = new WeakMap<Float32Array, Shape>();

export function shapeOf(position: Float32Array): Shape {
  const known = shapes.get(position);
  if (known !== undefined) return known;
  let minY = Infinity;
  let maxY = -Infinity;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < position.length; i += 3) {
    minX = Math.min(minX, position[i]!);
    maxX = Math.max(maxX, position[i]!);
    minY = Math.min(minY, position[i + 1]!);
    maxY = Math.max(maxY, position[i + 1]!);
    minZ = Math.min(minZ, position[i + 2]!);
    maxZ = Math.max(maxZ, position[i + 2]!);
  }
  if (minY > maxY) minY = maxY = minX = maxX = minZ = maxZ = 0;
  const count = Math.max(1, Math.ceil((maxY - minY) / SLAB) + 1);
  const lists: number[][] = Array.from({ length: count }, () => []);
  for (let t = 0; t < position.length / 9; t++) {
    const y0 = position[t * 9 + 1]!;
    const y1 = position[t * 9 + 4]!;
    const y2 = position[t * 9 + 7]!;
    const from = Math.floor((Math.min(y0, y1, y2) - minY) / SLAB);
    const to = Math.floor((Math.max(y0, y1, y2) - minY) / SLAB);
    for (let k = Math.max(0, from); k <= Math.min(count - 1, to); k++) lists[k]!.push(t);
  }
  const shape: Shape = { minY, maxY, minX, maxX, minZ, maxZ, slabs: lists.map((list) => Int32Array.from(list)) };
  shapes.set(position, shape);
  return shape;
}

/** A host prepared for the town's queries: its shape, the way back into its frame, and its box in the town's. */
export interface Placed {
  position: Float32Array;
  shape: Shape;
  inverse: THREE.Matrix4;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  y0: number;
  y1: number;
}

export const corner = new THREE.Vector3();

export function prepare(host: OverheadHost): Placed {
  const shape = shapeOf(host.position);
  const inverse = host.matrix.clone().invert();
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const x of [shape.minX, shape.maxX]) {
    for (const y of [shape.minY, shape.maxY]) {
      for (const z of [shape.minZ, shape.maxZ]) {
        corner.set(x, y, z).applyMatrix4(host.matrix);
        x0 = Math.min(x0, corner.x);
        x1 = Math.max(x1, corner.x);
        y0 = Math.min(y0, corner.y);
        y1 = Math.max(y1, corner.y);
        z0 = Math.min(z0, corner.z);
        z1 = Math.max(z1, corner.z);
      }
    }
  }
  return { position: host.position, shape, inverse, x0, x1, z0, z1, y0, y1 };
}

export const rayFrom = new THREE.Vector3();
export const rayTo = new THREE.Vector3();

/**
 * How far along a horizontal ray from `(ox, y, oz)` in direction `(dx, dz)`
 * the first building wall is, up to `reach`; Infinity for none. Both faces
 * of a triangle count.
 */
export function wallHit(hosts: readonly Placed[], ox: number, y: number, oz: number, dx: number, dz: number, reach: number): number {
  const ex = ox + dx * reach;
  const ez = oz + dz * reach;
  const bx0 = Math.min(ox, ex);
  const bx1 = Math.max(ox, ex);
  const bz0 = Math.min(oz, ez);
  const bz1 = Math.max(oz, ez);
  let best = Infinity;
  for (const host of hosts) {
    if (y < host.y0 || y > host.y1 || bx1 < host.x0 || bx0 > host.x1 || bz1 < host.z0 || bz0 > host.z1) continue;
    rayFrom.set(ox, y, oz).applyMatrix4(host.inverse);
    rayTo.set(ex, y, ez).applyMatrix4(host.inverse);
    const shape = host.shape;
    const k = Math.floor((rayFrom.y - shape.minY) / SLAB);
    const list = shape.slabs[k];
    if (list === undefined) continue;
    const p = host.position;
    const Dx = rayTo.x - rayFrom.x;
    const Dy = rayTo.y - rayFrom.y;
    const Dz = rayTo.z - rayFrom.z;
    for (let n = 0; n < list.length; n++) {
      const t = list[n]! * 9;
      const v0x = p[t]!;
      const v0y = p[t + 1]!;
      const v0z = p[t + 2]!;
      const e1x = p[t + 3]! - v0x;
      const e1y = p[t + 4]! - v0y;
      const e1z = p[t + 5]! - v0z;
      const e2x = p[t + 6]! - v0x;
      const e2y = p[t + 7]! - v0y;
      const e2z = p[t + 8]! - v0z;
      // Moller-Trumbore over the segment, u in [0, 1] along it.
      const px = Dy * e2z - Dz * e2y;
      const py = Dz * e2x - Dx * e2z;
      const pz = Dx * e2y - Dy * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (Math.abs(det) < 1e-12) continue;
      const inv = 1 / det;
      const tx = rayFrom.x - v0x;
      const ty = rayFrom.y - v0y;
      const tz = rayFrom.z - v0z;
      const a = (tx * px + ty * py + tz * pz) * inv;
      if (a < 0 || a > 1) continue;
      const qx = ty * e1z - tz * e1y;
      const qy = tz * e1x - tx * e1z;
      const qz = tx * e1y - ty * e1x;
      const b = (Dx * qx + Dy * qy + Dz * qz) * inv;
      if (b < 0 || a + b > 1) continue;
      const u = (e2x * qx + e2y * qy + e2z * qz) * inv;
      if (u < 0 || u > 1) continue;
      const at = u * reach;
      if (at < best) best = at;
    }
  }
  return best;
}

/** Whether a point is inside a building's box, less `margin` on every side. */
export function inHost(hosts: readonly Placed[], x: number, y: number, z: number, margin: number): boolean {
  for (const host of hosts) {
    if (y < host.y0 || y > host.y1) continue;
    if (x > host.x0 + margin && x < host.x1 - margin && z > host.z0 + margin && z < host.z1 - margin) return true;
  }
  return false;
}

// The geometry

export class Out {
  position: number[] = [];
  normal: number[] = [];
  color: number[] = [];
  glow: number[] = [];
  get triangles(): number {
    return this.position.length / 9;
  }
}

export const ea = new THREE.Vector3();
export const eb = new THREE.Vector3();
export const faceNormal = new THREE.Vector3();

/** One triangle, wound so its normal is `outward`'s side, or its own geometric normal when `outward` is null. */
export function face(
  out: Out, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3,
  colour: THREE.Color, outward: THREE.Vector3 | null, glow = 0, bed = 0,
): void {
  ea.subVectors(b, a);
  eb.subVectors(c, a);
  faceNormal.crossVectors(ea, eb);
  if (faceNormal.lengthSq() < 1e-14) return;
  let first = b;
  let second = c;
  if (outward !== null && faceNormal.dot(outward) < 0) {
    first = c;
    second = b;
    faceNormal.negate();
  }
  if (outward !== null) faceNormal.copy(outward);
  faceNormal.normalize();
  for (const v of [a, first, second]) {
    out.position.push(v.x, v.y, v.z);
    out.normal.push(faceNormal.x, faceNormal.y, faceNormal.z);
    out.color.push(colour.r, colour.g, colour.b);
    out.glow.push(glow, bed);
  }
}

export const cardNormal = new THREE.Vector3();

/**
 * A triangle seen from both sides: the town's material draws front faces
 * only, so a pennant is its triangle twice, one each way.
 */
export function card(out: Out, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, colour: THREE.Color, glow = 0, bed = 0): void {
  ea.subVectors(b, a);
  eb.subVectors(c, a);
  cardNormal.crossVectors(ea, eb);
  if (cardNormal.lengthSq() < 1e-14) return;
  cardNormal.normalize();
  face(out, a, b, c, colour, cardNormal, glow, bed);
  cardNormal.negate();
  face(out, a, b, c, colour, cardNormal, glow, bed);
}

/** A quad `a b c d`, round its edge, seen from both sides. */
export function quadCard(out: Out, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, colour: THREE.Color): void {
  card(out, a, b, c, colour);
  card(out, a, c, d, colour);
}

export const outwardScratch = new THREE.Vector3();

/** A quad `a b c d` facing `outward`, one side only: the side of a closed shape. */
export function quadOut(out: Out, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, outward: THREE.Vector3, colour: THREE.Color, glow = 0, bed = 0): void {
  outwardScratch.copy(outward);
  face(out, a, b, c, colour, outwardScratch, glow, bed);
  face(out, a, c, d, colour, outwardScratch, glow, bed);
}

export const UP = new THREE.Vector3(0, 1, 0);
export const tubeAlong = new THREE.Vector3();
export const tubeU = new THREE.Vector3();
export const tubeV = new THREE.Vector3();
export const tubeN = new THREE.Vector3();
export const ringA = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
export const ringB = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

/** A tube from `a` to `b` of `sides` (3 or 4) flat sides, `radius` out: a wire, a cord, a strand. */
export function tube(out: Out, a: THREE.Vector3, b: THREE.Vector3, radius: number, colour: THREE.Color, sides = 3): void {
  tubeAlong.subVectors(b, a);
  if (tubeAlong.lengthSq() < 1e-12) return;
  tubeAlong.normalize();
  tubeU.crossVectors(tubeAlong, UP);
  if (tubeU.lengthSq() < 1e-8) tubeU.set(1, 0, 0);
  tubeU.normalize();
  tubeV.crossVectors(tubeU, tubeAlong).normalize();
  for (let k = 0; k < sides; k++) {
    const angle = (k * Math.PI * 2) / sides;
    ringA[k]!.copy(a).addScaledVector(tubeU, Math.cos(angle) * radius).addScaledVector(tubeV, Math.sin(angle) * radius);
    ringB[k]!.copy(ringA[k]!).add(b).sub(a);
  }
  for (let k = 0; k < sides; k++) {
    const j = (k + 1) % sides;
    const angle = ((k + 0.5) * Math.PI * 2) / sides;
    tubeN.copy(tubeU).multiplyScalar(Math.cos(angle)).addScaledVector(tubeV, Math.sin(angle));
    quadOut(out, ringA[k]!, ringA[j]!, ringB[j]!, ringB[k]!, tubeN, colour);
  }
}

export const boxCorners = Array.from({ length: 8 }, () => new THREE.Vector3());
export const boxNormal = new THREE.Vector3();

/** An upright box, `hx` by `hz` about `(x, z)`, from `y0` to `y1`, turned so its x axis is `(ax, az)`. */
export function box(out: Out, x: number, z: number, ax: number, az: number, hx: number, hz: number, y0: number, y1: number, colour: THREE.Color, bottom = false): void {
  // Local x along (ax, az), local z along (-az, ax).
  for (let i = 0; i < 8; i++) {
    const sx = i & 1 ? 1 : -1;
    const sz = i & 2 ? 1 : -1;
    const y = i & 4 ? y1 : y0;
    boxCorners[i]!.set(x + ax * sx * hx - az * sz * hz, y, z + az * sx * hx + ax * sz * hz);
  }
  const c = boxCorners;
  // +x, -x, +z, -z, top.
  boxNormal.set(ax, 0, az);
  quadOut(out, c[1]!, c[3]!, c[7]!, c[5]!, boxNormal, colour);
  boxNormal.set(-ax, 0, -az);
  quadOut(out, c[0]!, c[4]!, c[6]!, c[2]!, boxNormal, colour);
  boxNormal.set(-az, 0, ax);
  quadOut(out, c[2]!, c[6]!, c[7]!, c[3]!, boxNormal, colour);
  boxNormal.set(az, 0, -ax);
  quadOut(out, c[0]!, c[1]!, c[5]!, c[4]!, boxNormal, colour);
  boxNormal.set(0, 1, 0);
  quadOut(out, c[4]!, c[5]!, c[7]!, c[6]!, boxNormal, colour);
  if (bottom) {
    boxNormal.set(0, -1, 0);
    quadOut(out, c[0]!, c[2]!, c[3]!, c[1]!, boxNormal, colour);
  }
}

/** A point on a line hung from `a` to `b` with `sag` at its middle: a parabola, which a catenary this shallow is. */
export function hungAt(a: THREE.Vector3, b: THREE.Vector3, sag: number, t: number, into: THREE.Vector3): THREE.Vector3 {
  into.lerpVectors(a, b, t);
  into.y -= 4 * sag * t * (1 - t);
  return into;
}

export const lineA = new THREE.Vector3();
export const lineB = new THREE.Vector3();

/** The line itself, in `pieces`, a three-sided tube. */
export function line(out: Out, a: THREE.Vector3, b: THREE.Vector3, sag: number, radius: number, colour: THREE.Color, pieces: number, alternate?: THREE.Color): void {
  for (let i = 0; i < pieces; i++) {
    hungAt(a, b, sag, i / pieces, lineA);
    hungAt(a, b, sag, (i + 1) / pieces, lineB);
    tube(out, lineA, lineB, radius, alternate !== undefined && i % 2 === 1 ? alternate : colour);
  }
}

export const colourCache = new Map<number, THREE.Color>();
export function colourOf(hex: number): THREE.Color {
  let known = colourCache.get(hex);
  if (known === undefined) {
    known = new THREE.Color(hex);
    colourCache.set(hex, known);
  }
  return known;
}

/** A colour a shade darker, for a cap or a cord: kept off the palette's own list on purpose, as `roadside.ts`'s are. */
export const shadeCache = new Map<number, THREE.Color>();
export function shadeOf(hex: number, towards: number = PALETTE.ink, share = 0.35): THREE.Color {
  const key = hex * 7 + Math.round(share * 100) + towards;
  let known = shadeCache.get(key);
  if (known === undefined) {
    known = new THREE.Color(hex).lerp(new THREE.Color(towards), share);
    shadeCache.set(key, known);
  }
  return known;
}
