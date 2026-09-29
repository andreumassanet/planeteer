/**
 * Z-fighting, found headless: two faces of different colours in one plane,
 * facing the same way and overlapping where the camera can see them. Such a
 * pair is one surface drawn twice at one depth, and whichever colour wins a
 * pixel changes as the camera moves. A still frame shows one colour or the
 * other and looks fine, which is why this is measured rather than looked for.
 *
 * `pnpm scenery` holds every kit build to it and `pnpm check` every
 * monument, which asks with a wider `coplanar`: a landmark is looked at from
 * hundreds of units off, where a hair between two faces is inside one step
 * of the depth buffer.
 */
import type { Object3D } from 'three';
import { paletteName } from '../src/scenery/contract.ts';

type Attribute = { count: number; getX(i: number): number; getY(i: number): number; getZ(i: number): number };
type GroupLike = Pick<Object3D, 'updateMatrixWorld' | 'traverse'>;


/**
 * Plane separation under which two faces are one surface to the depth buffer,
 * at any distance. `PROUD` is the step that keeps them apart, and it is eighty
 * times this.
 */
const COPLANAR = 1e-3;
/**
 * How far from parallel two faces may be and still be one plane: the cosine
 * of the angle between their normals, less than one by this.
 */
const PARALLEL = 1e-6;
/** The overlap that counts, in u². */
const OVERLAP = 0.01;
/**
 * How near along the normal something must stand over a point to hide it, in
 * units — or the point must be inside a solid, which is how a roof sitting on
 * an eave band hides the band's top.
 *
 * One unit, and not "anything, anywhere along the normal": the stair of a
 * flat-roof house hangs out through the upper block's crown on the narrowest
 * variants, and what stood under the two undersides it shared was the lower
 * roof a storey down, which the unbounded version of this test counted as
 * cover. The nearest pass is the crowd's: pairs of garment faces whose next
 * surface out stands between 0.3 and 1 unit over them (2026-09-13), which
 * `people.ts` owns and this does not fail.
 */
const COVER = 1;
/** How far off the face each probe starts, so that it does not find its own plane. */
const PROBE = 0.03;

export interface Fight {
  /** Of the overlap, the area nothing covers, in u². */
  exposed: number;
  /** Height of the first face's first corner: enough to find the pair. */
  y: number;
  a: string;
  b: string;
}

type Piece = {
  isMesh?: boolean;
  userData: Record<string, unknown>;
  material?: { userData: Record<string, unknown> };
  geometry?: {
    index: { count: number; getX(i: number): number } | null;
    getAttribute(name: string): Attribute | undefined;
  };
  matrixWorld: { elements: number[] };
};

/** Clips a convex polygon by an anticlockwise triangle, both in one plane's 2D basis. */
function clipBy(polygon: number[][], triangle: number[][]): number[][] {
  let out = polygon;
  for (let i = 0; i < 3 && out.length > 0; i++) {
    const p = triangle[i]!;
    const q = triangle[(i + 1) % 3]!;
    const side = (r: number[]): number => (q[0]! - p[0]!) * (r[1]! - p[1]!) - (q[1]! - p[1]!) * (r[0]! - p[0]!);
    const input = out;
    out = [];
    for (let k = 0; k < input.length; k++) {
      const s = input[k]!;
      const e = input[(k + 1) % input.length]!;
      const ss = side(s);
      const se = side(e);
      const cut = (): number[] => {
        const t = ss / (ss - se);
        return [s[0]! + (e[0]! - s[0]!) * t, s[1]! + (e[1]! - s[1]!) * t];
      };
      if (se >= 0) {
        if (ss < 0) out.push(cut());
        out.push(e);
      } else if (ss >= 0) {
        out.push(cut());
      }
    }
  }
  return out;
}

function signedArea(polygon: number[][]): number {
  let sum = 0;
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i]!;
    const q = polygon[(i + 1) % polygon.length]!;
    sum += p[0]! * q[1]! - q[0]! * p[1]!;
  }
  return sum / 2;
}

/**
 * Every pair of faces in a build that z-fights: two colours, one plane
 * (`COPLANAR`), facing the same way, overlapping by more than `OVERLAP`, with
 * some of the overlap in view.
 *
 * A colour is the toon stamp and the `lit` strength together — two glasses lit
 * to different strengths are two colours after dark, and the machiya's door
 * and lattice were exactly that. In view means that of the overlap's centroid
 * and the points halfway to its corners, at least one is not hidden: not under
 * the floor the part stands on, not inside a solid, and with nothing within
 * `COVER` of it along the normal. Brute force over the pairs, because a part
 * is a few hundred triangles and the whole kit takes about a second.
 */
export interface FightOptions {
  /** Plane separation under which two faces are one surface; `COPLANAR` if left out. */
  coplanar?: number;
  /** How far from parallel two normals may be, as `1 - cos`; `PARALLEL` if left out. */
  parallel?: number;
}

export function fightsIn(group: GroupLike, options: FightOptions = {}): Fight[] {
  const coplanar = options.coplanar ?? COPLANAR;
  const parallel = options.parallel ?? PARALLEL;
  group.updateMatrixWorld(true);
  const corners: number[] = []; // nine a triangle, in group space
  const normals: number[] = []; // three a triangle
  const planes: number[] = []; // the plane's offset along its normal
  const owners: number[] = []; // the piece it belongs to
  const tints: number[] = []; // a piece's colour, interned
  const names: string[] = [];
  const interned = new Map<string, number>();
  group.traverse(((object: Piece) => {
    if (!object.isMesh || !object.geometry) return;
    const position = object.geometry.getAttribute('position');
    if (!position) return;
    const index = object.geometry.index;
    const e = object.matrixWorld.elements;
    const stamp = object.material?.userData.atlasToon;
    const lit = object.userData.atlasLit;
    const key = `${String(stamp)}/${typeof lit === 'number' ? lit : 'unlit'}`;
    if (!interned.has(key)) interned.set(key, interned.size);
    const piece = names.length;
    tints.push(interned.get(key)!);
    const low = [Infinity, Infinity, Infinity];
    const high = [-Infinity, -Infinity, -Infinity];
    const t = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    const count = index ? index.count : position.count;
    for (let i = 0; i + 2 < count; i += 3) {
      for (let k = 0; k < 3; k++) {
        const v = index ? index.getX(i + k) : i + k;
        const x = position.getX(v);
        const y = position.getY(v);
        const z = position.getZ(v);
        for (let c = 0; c < 3; c++) {
          const w = e[c]! * x + e[4 + c]! * y + e[8 + c]! * z + e[12 + c]!;
          t[k * 3 + c] = w;
          low[c] = Math.min(low[c]!, w);
          high[c] = Math.max(high[c]!, w);
        }
      }
      const ux = t[3]! - t[0]!;
      const uy = t[4]! - t[1]!;
      const uz = t[5]! - t[2]!;
      const vx = t[6]! - t[0]!;
      const vy = t[7]! - t[1]!;
      const vz = t[8]! - t[2]!;
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      const length = Math.hypot(nx, ny, nz);
      if (length < 1e-9) continue;
      corners.push(...t);
      normals.push(nx / length, ny / length, nz / length);
      planes.push((nx * t[0]! + ny * t[1]! + nz * t[2]!) / length);
      owners.push(piece);
    }
    const size = [0, 1, 2].map((c) => (high[c]! - low[c]!).toFixed(2)).join('x');
    const centre = [0, 1, 2].map((c) => ((high[c]! + low[c]!) / 2).toFixed(2)).join(', ');
    const colour = typeof stamp === 'number' ? paletteName(stamp) : 'unstamped';
    names.push(`the ${size} ${colour}${typeof lit === 'number' ? ` lit ${lit}` : ''} at (${centre})`);
  }) as never);

  const count = planes.length;
  const hidden = (ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, i: number, j: number): boolean => {
    if (oy < 0) return true;
    let nearest = Infinity;
    let inside = false;
    for (let t = 0; t < count; t++) {
      if (t === i || t === j) continue;
      const b = t * 9;
      const ax = corners[b]!;
      const ay = corners[b + 1]!;
      const az = corners[b + 2]!;
      const e1x = corners[b + 3]! - ax;
      const e1y = corners[b + 4]! - ay;
      const e1z = corners[b + 5]! - az;
      const e2x = corners[b + 6]! - ax;
      const e2y = corners[b + 7]! - ay;
      const e2z = corners[b + 8]! - az;
      const hx = dy * e2z - dz * e2y;
      const hy = dz * e2x - dx * e2z;
      const hz = dx * e2y - dy * e2x;
      const det = e1x * hx + e1y * hy + e1z * hz;
      if (Math.abs(det) < 1e-12) continue;
      const sx = ox - ax;
      const sy = oy - ay;
      const sz = oz - az;
      const u = (sx * hx + sy * hy + sz * hz) / det;
      if (u < 0 || u > 1) continue;
      const qx = sy * e1z - sz * e1y;
      const qy = sz * e1x - sx * e1z;
      const qz = sx * e1y - sy * e1x;
      const v = (dx * qx + dy * qy + dz * qz) / det;
      if (v < 0 || u + v > 1) continue;
      const distance = (e2x * qx + e2y * qy + e2z * qz) / det;
      if (distance <= 1e-4) continue;
      // Met from behind, the face says the probe is inside its solid. Ties
      // count: a box standing on another puts two faces at one distance, one
      // met from the front and one from behind, in whichever order.
      const behind = normals[t * 3]! * dx + normals[t * 3 + 1]! * dy + normals[t * 3 + 2]! * dz > 0;
      if (distance < nearest - 1e-6) {
        nearest = distance;
        inside = behind;
      } else if (distance <= nearest + 1e-6) {
        inside ||= behind;
      }
    }
    return nearest <= COVER || (nearest < Infinity && inside);
  };

  const fights: Fight[] = [];
  for (let i = 0; i < count; i++) {
    const nx = normals[i * 3]!;
    const ny = normals[i * 3 + 1]!;
    const nz = normals[i * 3 + 2]!;
    const plane = planes[i]!;
    const tint = tints[owners[i]!];
    for (let j = i + 1; j < count; j++) {
      if (tints[owners[j]!] === tint) continue;
      if (nx * normals[j * 3]! + ny * normals[j * 3 + 1]! + nz * normals[j * 3 + 2]! < 1 - parallel) continue;
      let apart = 0;
      for (let k = 0; k < 9; k += 3) {
        const b = j * 9 + k;
        apart = Math.max(apart, Math.abs(nx * corners[b]! + ny * corners[b + 1]! + nz * corners[b + 2]! - plane));
      }
      if (apart >= coplanar) continue;

      // The plane's own basis, both triangles flattened into it and clipped.
      const across = Math.abs(ny) < 0.9 ? 0 : 1;
      let ux = (1 - across) * nz;
      let uy = -across * nz;
      let uz = across * ny - (1 - across) * nx;
      const ul = Math.hypot(ux, uy, uz);
      ux /= ul;
      uy /= ul;
      uz /= ul;
      const vx = ny * uz - nz * uy;
      const vy = nz * ux - nx * uz;
      const vz = nx * uy - ny * ux;
      const flat = (t: number): number[][] => {
        const out: number[][] = [];
        for (let k = 0; k < 9; k += 3) {
          const b = t * 9 + k;
          const x = corners[b]!;
          const y = corners[b + 1]!;
          const z = corners[b + 2]!;
          out.push([x * ux + y * uy + z * uz, x * vx + y * vy + z * vz]);
        }
        return signedArea(out) < 0 ? out.reverse() : out;
      };
      const overlap = clipBy(flat(i), flat(j));
      if (overlap.length < 3) continue;
      const area = Math.abs(signedArea(overlap));
      if (area <= OVERLAP) continue;

      let cx = 0;
      let cy = 0;
      for (const p of overlap) {
        cx += p[0]!;
        cy += p[1]!;
      }
      cx /= overlap.length;
      cy /= overlap.length;
      const probes = [[cx, cy], ...overlap.map((p) => [(p[0]! + cx) / 2, (p[1]! + cy) / 2])];
      const lift = plane + PROBE;
      let open = 0;
      for (const probe of probes) {
        const s = probe[0]!;
        const r = probe[1]!;
        const ox = ux * s + vx * r + nx * lift;
        const oy = uy * s + vy * r + ny * lift;
        const oz = uz * s + vz * r + nz * lift;
        if (!hidden(ox, oy, oz, nx, ny, nz, i, j)) open++;
      }
      if (open === 0) continue;
      fights.push({
        exposed: (area * open) / probes.length,
        y: corners[i * 9 + 1]!,
        a: names[owners[i]!]!,
        b: names[owners[j]!]!,
      });
    }
  }
  return fights;
}
