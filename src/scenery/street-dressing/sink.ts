import * as THREE from 'three';
import { bedtimeByte } from '../../lights.ts';
import type { ModelArrays } from './models.ts';
import type { Anchor } from './types.ts';

export class Sink {
  readonly position: number[] = [];
  /** The seats and rack slots written so far, in the frame `place` takes things into. */
  readonly anchors: Anchor[] = [];
  readonly normal: number[] = [];
  readonly color: number[] = [];
  readonly glow: number[] = [];
  /** The current transform, column-major as Three's, and one over its scale. */
  private readonly e = new Float64Array(16);
  private inverseScale = 1;
  private readonly paintColor = new THREE.Color();
  private lit = 0;
  private bed = 0;

  constructor() {
    this.e[0] = this.e[5] = this.e[10] = this.e[15] = 1;
  }

  get triangles(): number {
    return this.position.length / 9;
  }

  /**
   * Everything after this is written through `matrix`. Asserted proper: a
   * reflection flips every face this file winds by hand, and the town's one
   * material would draw each one inside out.
   */
  place(matrix: THREE.Matrix4): void {
    const det = matrix.determinant();
    if (!(det > 0)) throw new Error(`street-dressing: a transform with determinant ${det}`);
    const m = matrix.elements;
    for (let i = 0; i < 16; i++) this.e[i] = m[i]!;
    const scale = Math.hypot(m[0]!, m[1]!, m[2]!);
    this.inverseScale = scale === 0 ? 0 : 1 / scale;
  }

  /**
   * A place something else goes, at `(x, z)` on the piece's floor facing
   * `(fx, fz)`, carried into the current frame: a café chair's sitter's spot
   * (`bench.ts`) or a rack's slot for a bicycle (`BikeSlot` in `settlements.ts`).
   */
  anchor(kind: Anchor['kind'], x: number, z: number, fx: number, fz: number): void {
    const e = this.e;
    const k = this.inverseScale;
    const dx = (e[0]! * fx + e[8]! * fz) * k;
    const dz = (e[2]! * fx + e[10]! * fz) * k;
    const length = Math.hypot(dx, dz) || 1;
    this.anchors.push({
      kind,
      x: e[0]! * x + e[8]! * z + e[12]!,
      y: e[1]! * x + e[9]! * z + e[13]!,
      z: e[2]! * x + e[10]! * z + e[14]!,
      fx: dx / length,
      fz: dz / length,
    });
  }

  /** The colour everything after this is painted in, and how it glows after dark (0 to 1). */
  paint(hex: number, glow = 0): void {
    this.paintColor.setHex(hex);
    this.lit = Math.round(Math.max(0, Math.min(1, glow)) * 255);
    // A sign burns all night, as a lamp does: it is a shop's and not a household's.
    this.bed = this.lit > 0 ? bedtimeByte(0, true) : 0;
  }

  /** Where a mark would roll back to: see `rollback`. */
  mark(): number {
    return this.position.length;
  }

  rollback(mark: number): void {
    this.position.length = mark;
    this.normal.length = mark;
    this.color.length = mark;
    this.glow.length = (mark / 3) * 2;
  }

  private vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number): void {
    const e = this.e;
    this.position.push(
      e[0]! * x + e[4]! * y + e[8]! * z + e[12]!,
      e[1]! * x + e[5]! * y + e[9]! * z + e[13]!,
      e[2]! * x + e[6]! * y + e[10]! * z + e[14]!,
    );
    const k = this.inverseScale;
    this.normal.push(
      (e[0]! * nx + e[4]! * ny + e[8]! * nz) * k,
      (e[1]! * nx + e[5]! * ny + e[9]! * nz) * k,
      (e[2]! * nx + e[6]! * ny + e[10]! * nz) * k,
    );
    this.color.push(this.paintColor.r, this.paintColor.g, this.paintColor.b);
    this.glow.push(this.lit, this.bed);
  }

  /**
   * One triangle, wound so its face looks along `(hx, hy, hz)`: the hint is
   * the outside, and a triangle that came out facing in is turned round
   * rather than trusted.
   */
  tri(
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    hx: number, hy: number, hz: number,
  ): void {
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz);
    if (length < 1e-12) return;
    nx /= length;
    ny /= length;
    nz /= length;
    if (nx * hx + ny * hy + nz * hz < 0) {
      this.vertex(ax, ay, az, -nx, -ny, -nz);
      this.vertex(cx, cy, cz, -nx, -ny, -nz);
      this.vertex(bx, by, bz, -nx, -ny, -nz);
    } else {
      this.vertex(ax, ay, az, nx, ny, nz);
      this.vertex(bx, by, bz, nx, ny, nz);
      this.vertex(cx, cy, cz, nx, ny, nz);
    }
  }

  /** A quad `a b c d` (in order round it), facing along the hint. */
  quad(q: readonly number[], hx: number, hy: number, hz: number): void {
    this.tri(q[0]!, q[1]!, q[2]!, q[3]!, q[4]!, q[5]!, q[6]!, q[7]!, q[8]!, hx, hy, hz);
    this.tri(q[0]!, q[1]!, q[2]!, q[6]!, q[7]!, q[8]!, q[9]!, q[10]!, q[11]!, hx, hy, hz);
  }

  /** The same quad seen from both sides: a sheet of fabric, a sign's face on a blade. */
  sheet(q: readonly number[], hx: number, hy: number, hz: number): void {
    this.quad(q, hx, hy, hz);
    this.quad(q, -hx, -hy, -hz);
  }

  /**
   * An axis-aligned box from `x0..x1`, `y0..y1`, `z0..z1`. `skip` names the
   * faces nobody sees — `'b'` the back (-z, against a wall), `'d'` the
   * bottom (on the ground) — so a box against a wall is five faces, and one
   * standing on the paving is five more of them.
   */
  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, skip = ''): void {
    if (!skip.includes('f')) this.quad([x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1], 0, 0, 1);
    if (!skip.includes('b')) this.quad([x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0], 0, 0, -1);
    if (!skip.includes('r')) this.quad([x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1], 1, 0, 0);
    if (!skip.includes('l')) this.quad([x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0], -1, 0, 0);
    if (!skip.includes('u')) this.quad([x0, y1, z1, x1, y1, z1, x1, y1, z0, x0, y1, z0], 0, 1, 0);
    if (!skip.includes('d')) this.quad([x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1], 0, -1, 0);
  }

  /** A box centred on `(x, z)` standing on `y`: the kit's `ctx.box`. */
  post(x: number, z: number, width: number, depth: number, y: number, height: number, skip = 'd'): void {
    this.box(x - width / 2, x + width / 2, y, y + height, z - depth / 2, z + depth / 2, skip);
  }

  /**
   * A square bar from `a` to `b`, `t` thick, its four sides and no ends: a
   * bicycle's tube, a rack's hoop, a bracket.
   */
  bar(ax: number, ay: number, az: number, bx: number, by: number, bz: number, t: number): void {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const length = Math.hypot(dx, dy, dz);
    if (length < 1e-9) return;
    const fx = dx / length, fy = dy / length, fz = dz / length;
    // Any vector off the axis, then two perpendiculars.
    let ox = 0, oy = 1, oz = 0;
    if (Math.abs(fy) > 0.9) {
      ox = 1;
      oy = 0;
    }
    let sx = fy * oz - fz * oy, sy = fz * ox - fx * oz, sz = fx * oy - fy * ox;
    const sl = Math.hypot(sx, sy, sz);
    sx /= sl;
    sy /= sl;
    sz /= sl;
    const ux = sy * fz - sz * fy, uy = sz * fx - sx * fz, uz = sx * fy - sy * fx;
    const h = t / 2;
    const corners = [
      [sx + ux, sy + uy, sz + uz],
      [-sx + ux, -sy + uy, -sz + uz],
      [-sx - ux, -sy - uy, -sz - uz],
      [sx - ux, sy - uy, sz - uz],
    ] as const;
    for (let i = 0; i < 4; i++) {
      const p = corners[i]!;
      const q = corners[(i + 1) % 4]!;
      const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2, mz = (p[2] + q[2]) / 2;
      this.quad([
        ax + p[0] * h, ay + p[1] * h, az + p[2] * h,
        ax + q[0] * h, ay + q[1] * h, az + q[2] * h,
        bx + q[0] * h, by + q[1] * h, bz + q[2] * h,
        bx + p[0] * h, by + p[1] * h, bz + p[2] * h,
      ], mx, my, mz);
    }
  }

  /**
   * A flat ring in the plane `x = x0`, centred at `(cy, cz)`, both faces: a
   * wheel seen from the side, which is all a parked bicycle shows.
   */
  wheel(x0: number, cy: number, cz: number, outer: number, inner: number, sides = 8): void {
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      const b = ((i + 1) / sides) * Math.PI * 2;
      const q = [
        x0, cy + Math.sin(a) * inner, cz + Math.cos(a) * inner,
        x0, cy + Math.sin(a) * outer, cz + Math.cos(a) * outer,
        x0, cy + Math.sin(b) * outer, cz + Math.cos(b) * outer,
        x0, cy + Math.sin(b) * inner, cz + Math.cos(b) * inner,
      ];
      this.sheet(q, 1, 0, 0);
    }
  }

  /** A flat polygon on `y`, centred at `(x, z)`, facing up: a decal, a table top. */
  disc(x: number, z: number, y: number, radius: number, sides = 8, turn = Math.PI / 8): void {
    for (let i = 0; i < sides; i++) {
      const a = turn + (i / sides) * Math.PI * 2;
      const b = turn + ((i + 1) / sides) * Math.PI * 2;
      this.tri(x, y, z, x + Math.cos(a) * radius, y, z + Math.sin(a) * radius, x + Math.cos(b) * radius, y, z + Math.sin(b) * radius, 0, 1, 0);
    }
  }

  /**
   * A solid of revolution about the vertical through `(cx, cz)`: `profile` is
   * `[radius, y]` pairs from the middle of its foot round to the middle of its
   * top, so a closed solid starts and ends at radius 0. Faceted, `sides`
   * flat faces round and one a step of the profile, and turned so a face and
   * not an edge looks down +Z, where a slot or a label goes. `squash` narrows
   * it along z.
   */
  lathe(cx: number, cz: number, profile: readonly (readonly [number, number])[], sides: number, squash = 1): void {
    const step = (Math.PI * 2) / sides;
    const start = Math.PI / 2 - step / 2;
    for (let j = 0; j + 1 < profile.length; j++) {
      const [r0, y0] = profile[j]!;
      const [r1, y1] = profile[j + 1]!;
      const dy = y1 - y0;
      const dr = r1 - r0;
      for (let i = 0; i < sides; i++) {
        const a = start + i * step;
        const b = a + step;
        const m = a + step / 2;
        const ca = Math.cos(a), sa = Math.sin(a) * squash, cb = Math.cos(b), sb = Math.sin(b) * squash;
        this.quad(
          [cx + r0 * ca, y0, cz + r0 * sa, cx + r0 * cb, y0, cz + r0 * sb, cx + r1 * cb, y1, cz + r1 * sb, cx + r1 * ca, y1, cz + r1 * sa],
          Math.cos(m) * dy, -dr, Math.sin(m) * dy,
        );
      }
    }
  }

  /**
   * An upright prism: the convex outline `poly` (`[x, z]` pairs round it)
   * from `y0` to `y1`, its sides and a lid and a floor fanned from its middle.
   * `skip` leaves out the lid (`'u'`) or the floor (`'d'`).
   */
  prism(poly: readonly (readonly [number, number])[], y0: number, y1: number, skip = ''): void {
    let cx = 0;
    let cz = 0;
    for (const [x, z] of poly) {
      cx += x;
      cz += z;
    }
    cx /= poly.length;
    cz /= poly.length;
    for (let i = 0; i < poly.length; i++) {
      const [ax, az] = poly[i]!;
      const [bx, bz] = poly[(i + 1) % poly.length]!;
      this.quad([ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az], (ax + bx) / 2 - cx, 0, (az + bz) / 2 - cz);
      if (!skip.includes('u')) this.tri(cx, y1, cz, ax, y1, az, bx, y1, bz, 0, 1, 0);
      if (!skip.includes('d')) this.tri(cx, y0, cz, ax, y0, az, bx, y0, bz, 0, -1, 0);
    }
  }

  /**
   * The same along z: the convex outline `poly` (`[x, y]` pairs round it)
   * from `z0` to `z1`, the front (`'f'`) and back (`'b'`) fanned. What an
   * arched lid, a clock's drum or a rounded cabinet top is.
   */
  slab(poly: readonly (readonly [number, number])[], z0: number, z1: number, skip = ''): void {
    let cx = 0;
    let cy = 0;
    for (const [x, y] of poly) {
      cx += x;
      cy += y;
    }
    cx /= poly.length;
    cy /= poly.length;
    for (let i = 0; i < poly.length; i++) {
      const [ax, ay] = poly[i]!;
      const [bx, by] = poly[(i + 1) % poly.length]!;
      this.quad([ax, ay, z0, bx, by, z0, bx, by, z1, ax, ay, z1], (ax + bx) / 2 - cx, (ay + by) / 2 - cy, 0);
      if (!skip.includes('f')) this.tri(cx, cy, z1, ax, ay, z1, bx, by, z1, 0, 0, 1);
      if (!skip.includes('b')) this.tri(cx, cy, z0, ax, ay, z0, bx, by, z0, 0, 0, -1);
    }
  }

  /** A lump of leaves or a heap of fruit: a faceted ball `r` round and `h` tall, standing on `y`. */
  lump(x: number, y: number, z: number, r: number, h: number, sides = 6): void {
    this.lathe(x, z, [[0, y], [r * 0.82, y + h * 0.22], [r, y + h * 0.55], [r * 0.58, y + h * 0.88], [0, y + h]], sides);
  }

  /** A baked model's arrays, in the colours it was painted, through the current transform. */
  model(arrays: ModelArrays): void {
    const e = this.e;
    const k = this.inverseScale;
    const p = arrays.position;
    const n = arrays.normal;
    const c = arrays.color;
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i]!, y = p[i + 1]!, z = p[i + 2]!;
      const nx = n[i]!, ny = n[i + 1]!, nz = n[i + 2]!;
      this.position.push(e[0]! * x + e[4]! * y + e[8]! * z + e[12]!, e[1]! * x + e[5]! * y + e[9]! * z + e[13]!, e[2]! * x + e[6]! * y + e[10]! * z + e[14]!);
      this.normal.push((e[0]! * nx + e[4]! * ny + e[8]! * nz) * k, (e[1]! * nx + e[5]! * ny + e[9]! * nz) * k, (e[2]! * nx + e[6]! * ny + e[10]! * nz) * k);
      this.color.push(c[i]!, c[i + 1]!, c[i + 2]!);
      this.glow.push(0, 0);
    }
  }
}

/** A rectangle `x0..x1` by `z0..z1` with its corners cut round in `segments` steps of radius `r`, as `[x, z]` pairs. */
export function rounded(x0: number, x1: number, z0: number, z1: number, r: number, segments = 2): [number, number][] {
  const out: [number, number][] = [];
  const corners: [number, number, number][] = [[x1 - r, z1 - r, 0], [x0 + r, z1 - r, Math.PI / 2], [x0 + r, z0 + r, Math.PI], [x1 - r, z0 + r, Math.PI * 1.5]];
  for (const [cx, cz, from] of corners) {
    for (let s = 0; s <= segments; s++) {
      const a = from + (s / segments) * (Math.PI / 2);
      out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
    }
  }
  return out;
}

/** A cabinet's outline seen from the front: `x0..x1` wide, straight up to `y1` and arched over it by `rise`. */
export function arched(x0: number, x1: number, y0: number, y1: number, rise: number, segments = 5): [number, number][] {
  const out: [number, number][] = [[x0, y0], [x1, y0]];
  for (let s = 0; s <= segments; s++) {
    const t = s / segments;
    const a = t * Math.PI;
    out.push([x1 - (x1 - x0) * t, y1 + Math.sin(a) * rise]);
  }
  return out;
}
