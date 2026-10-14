/** The manta of the air: the geometry of one flier, built once a flock. */

import * as THREE from 'three';

/** Half a manta's span, units at `size` 1: the wingtips are this far either side of the spine. */
export const MANTA_HALF_SPAN = 1.1;
/** Wing stations either side of the spine: enough that a bending wing reads as a curve and not a hinge. */
export const MANTA_COLUMNS = 7;
/** How far the bend's wave runs back along the body, radians a unit of length. */
export const MANTA_WAVE = 1.7;

/** A manta of the air, nose at +Z and span along X, as flat arrays of unshared triangles. */
export interface MantaPart {
  position: Float32Array;
  normal: Float32Array;
  color: Float32Array;
  /** How much of the tail's sway a vertex takes: 0 on the body, 1 at the tail's tip. */
  tail: Float32Array;
  /** How far a vertex turns with the wing's stroke, signed by side: `(|x| / half span)^1.4`, worked out once. */
  bend: Float32Array;
}

/**
 * The manta, built once a flock system: a top and an underside that meet at a
 * knife edge all round the rim, so nothing single-sided shows from below.
 *
 * The outline is a rounded diamond: the leading edge sweeps back from a blunt
 * nose to the wingtips and the trailing edge comes in to the root of the tail,
 * both written as a power of `u`, the fraction of the half-span out from the
 * spine. Each wing is `MANTA_COLUMNS` columns of two rows, the top bowed up by
 * a profile that is thickest at the spine (where a ridge runs down the back
 * as the head and body) and closes to nothing at the rim; the belly is the
 * same bow at under half the depth. Two cephalic fins point forward from
 * either side of the head, and the tail is a thin cross of two strips, flat
 * and upright, three segments long, tapering to a point a body-length behind.
 *
 * Normals are each face's own, flat as the rest of the world is shaded, and
 * every triangle is wound so its normal faces the side it is meant to face —
 * the top up, the belly down, a fin's or a strip's two faces opposite ways.
 * 112 triangles of wing, 4 of fin, 20 of tail: 136 a creature.
 */
export function mantaGeometry(back: number, belly: number): MantaPart {
  const position: number[] = [];
  const normal: number[] = [];
  const color: number[] = [];
  const tail: number[] = [];
  const dark = new THREE.Color(back);
  const pale = new THREE.Color(belly);
  // The rim a little lighter than the back, as a thin wing lets the light through.
  const rim = dark.clone().lerp(pale, 0.4);
  type P = [number, number, number];
  type Tint = THREE.Color | ((p: P) => THREE.Color);

  const tri = (a: P, b: P, c: P, want: P, tint: Tint, sway: (p: P) => number = () => 0): void => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    let order: [P, P, P] = [a, b, c];
    if (nx * want[0] + ny * want[1] + nz * want[2] < 0) {
      // Wound the wrong way for the side it shows: swap two corners.
      order = [a, c, b];
      nx = -nx; ny = -ny; nz = -nz;
    }
    const length = Math.hypot(nx, ny, nz);
    if (length < 1e-9) {
      [nx, ny, nz] = want;
    } else {
      nx /= length; ny /= length; nz /= length;
    }
    for (const p of order) {
      const t = typeof tint === 'function' ? tint(p) : tint;
      position.push(p[0], p[1], p[2]);
      normal.push(nx, ny, nz);
      color.push(t.r, t.g, t.b);
      tail.push(sway(p));
    }
  };
  const UP: P = [0, 1, 0];
  const DOWN: P = [0, -1, 0];

  // The outline. The tips are a little blunt (front and back 0.08 apart), so
  // the last column is a narrow quad and not a fan of slivers.
  const tipZ = -0.2;
  const noseZ = 0.6;
  const rootZ = -0.8;
  const frontOf = (u: number): number => tipZ + 0.04 + (noseZ - tipZ - 0.04) * Math.pow(1 - Math.pow(u, 1.5), 1.1);
  const backOf = (u: number): number => tipZ - 0.04 - (tipZ - 0.04 - rootZ) * Math.pow(1 - Math.pow(u, 1.25), 0.9);
  // Across the chord: nothing at the leading and trailing edges, most a little ahead of the middle.
  const ROWS = [0, 0.42, 1];
  const bowOf = (t: number): number => Math.pow(Math.sin(Math.PI * t), 0.8);
  const depthOf = (u: number): number => 0.1 * Math.pow(1 - u, 1.6) + 0.07 * Math.max(0, 1 - u * 3.5);
  const station = (i: number, r: number, top: boolean): P => {
    const u = Math.abs(i) / MANTA_COLUMNS;
    const t = ROWS[r]!;
    const z = frontOf(u) + (backOf(u) - frontOf(u)) * t;
    const bow = depthOf(u) * bowOf(t);
    return [(MANTA_HALF_SPAN * i) / MANTA_COLUMNS, top ? bow : -0.45 * bow, z];
  };
  // The back darkest along the spine and lightening to the rim.
  const backTint = (p: P): THREE.Color => {
    const u = Math.abs(p[0]) / MANTA_HALF_SPAN;
    const edge = p[1] < 1e-6 ? 1 : Math.pow(u, 3);
    return dark.clone().lerp(rim, edge);
  };

  for (let i = -MANTA_COLUMNS; i < MANTA_COLUMNS; i++) {
    for (let r = 0; r < ROWS.length - 1; r++) {
      for (const top of [true, false]) {
        const a = station(i, r, top);
        const b = station(i + 1, r, top);
        const c = station(i + 1, r + 1, top);
        const d = station(i, r + 1, top);
        const want = top ? UP : DOWN;
        const tint = top ? backTint : pale;
        tri(a, b, c, want, tint);
        tri(a, c, d, want, tint);
      }
    }
  }

  // The cephalic fins: a small flap either side of the head, pointing forward
  // and curling a little down, its two faces in the back's and belly's colours.
  for (const s of [1, -1]) {
    const inner: P = [s * 0.1, 0.02, noseZ - 0.12];
    const outer: P = [s * 0.27, 0.0, noseZ - 0.16];
    const tip: P = [s * 0.17, -0.07, noseZ + 0.22];
    tri(inner, outer, tip, UP, dark);
    tri(inner, outer, tip, DOWN, pale);
  }

  // The tail: three segments behind the root, tapering to a point, as a flat
  // strip and an upright one so it reads from above and from the side.
  const tailStart = rootZ + 0.04;
  const tailLength = 1.15;
  const stations = [0, 0.3, 0.62, 1];
  const widths = [0.05, 0.034, 0.018, 0];
  const swayOf = (p: P): number => Math.pow(Math.max(0, Math.min(1, (tailStart - p[2]) / tailLength)), 1.5);
  for (let k = 0; k < stations.length - 1; k++) {
    const z0 = tailStart - stations[k]! * tailLength;
    const z1 = tailStart - stations[k + 1]! * tailLength;
    const w0 = widths[k]!;
    const w1 = widths[k + 1]!;
    const last = k === stations.length - 2;
    for (const upright of [false, true]) {
      const at = (w: number, z: number): P => (upright ? [0, w, z] : [w, 0, z]);
      const faces: P[] = upright ? [[1, 0, 0], [-1, 0, 0]] : [UP, DOWN];
      for (const want of faces) {
        const tint = want === DOWN ? pale : dark;
        if (last) {
          tri(at(-w0, z0), at(w0, z0), at(0, z1), want, tint, swayOf);
        } else {
          tri(at(-w0, z0), at(w0, z0), at(w1, z1), want, tint, swayOf);
          tri(at(-w0, z0), at(w1, z1), at(-w1, z1), want, tint, swayOf);
        }
      }
    }
  }

  return {
    position: new Float32Array(position),
    normal: new Float32Array(normal),
    color: new Float32Array(color),
    tail: new Float32Array(tail),
    bend: Float32Array.from({ length: position.length / 3 }, (_, i) => {
      const x = position[i * 3]!;
      return Math.sign(x) * Math.pow(Math.min(1, Math.abs(x) / MANTA_HALF_SPAN), 1.4);
    }),
  };
}
