/**
 * The cube-sphere every world's ground is cut into: six faces, each a quadtree
 * of square tiles, each tile a grid of `TILE_SEGMENTS` squared quads.
 *
 * A latitude-longitude grid would pinch at the poles and a geodesic one has no
 * square children; a cube projected onto the sphere has neither problem and its
 * tiles split into four exactly. The face coordinates are **warped by a
 * tangent** (`u' = tan(u pi / 4)`) before the projection, which brings the
 * largest cell down from 1.8 times the smallest to 1.4.
 *
 * Every face is laid so that `uAxis x vAxis` is its outward normal, so a grid
 * wound `(i, j) -> (i+1, j) -> (i+1, j+1)` is counter-clockwise from outside —
 * front-facing — on all six. That is the one fact about the cube the tiles
 * cannot get wrong without the ground vanishing, and `check-worlds.ts` asserts
 * it on every face rather than trusting this comment.
 */

/** Quads along a tile's edge. 32 is 2,048 triangles a tile and a 33x33 grid. */
export const TILE_SEGMENTS = 32;

/**
 * How long the finest tile's edge is aimed at, units: a street's length on a
 * crust, where a crater a few units across has to be drawn, and four times
 * that on a cloud deck, whose finest bump is a hundred units long.
 */
export const FINEST_TILE = 60;
export const FINEST_DECK = 240;

export interface Face {
  axis: readonly [number, number, number];
  u: readonly [number, number, number];
  v: readonly [number, number, number];
}

export const FACES: readonly Face[] = [
  { axis: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
  { axis: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { axis: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  { axis: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { axis: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { axis: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
];

const QUARTER = Math.PI / 4;

/** The unit vector at face coordinates `u`, `v` in [-1, 1], written into `out`. */
export function faceDir(face: number, u: number, v: number, out: { x: number; y: number; z: number }): void {
  const f = FACES[face]!;
  const a = Math.tan(u * QUARTER);
  const b = Math.tan(v * QUARTER);
  const x = f.axis[0] + a * f.u[0] + b * f.v[0];
  const y = f.axis[1] + a * f.u[1] + b * f.v[1];
  const z = f.axis[2] + a * f.u[2] + b * f.v[2];
  const inverse = 1 / Math.hypot(x, y, z);
  out.x = x * inverse;
  out.y = y * inverse;
  out.z = z * inverse;
}

export interface FacePoint {
  face: number;
  u: number;
  v: number;
}

/** Which face a direction is on and where: the inverse of `faceDir`. */
export function facePoint(x: number, y: number, z: number, out: FacePoint): FacePoint {
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const az = Math.abs(z);
  let face: number;
  if (ax >= ay && ax >= az) face = x >= 0 ? 0 : 1;
  else if (ay >= az) face = y >= 0 ? 2 : 3;
  else face = z >= 0 ? 4 : 5;
  const f = FACES[face]!;
  const along = x * f.axis[0] + y * f.axis[1] + z * f.axis[2];
  const a = (x * f.u[0] + y * f.u[1] + z * f.u[2]) / along;
  const b = (x * f.v[0] + y * f.v[1] + z * f.v[2]) / along;
  out.face = face;
  out.u = Math.max(-1, Math.min(1, Math.atan(a) / QUARTER));
  out.v = Math.max(-1, Math.min(1, Math.atan(b) / QUARTER));
  return out;
}

/** How many levels the quadtree has under a face, so the finest tile is about `finest` units. */
export function levelsFor(radius: number, finest = FINEST_TILE): number {
  const faceEdge = radius * (Math.PI / 2);
  return Math.max(1, Math.ceil(Math.log2(faceEdge / finest)));
}

/** A tile's address: face, level and its column and row at that level. */
export interface TileKey {
  face: number;
  level: number;
  i: number;
  j: number;
}

export const keyOf = (t: TileKey): string => `${t.face}/${t.level}/${t.i}/${t.j}`;

/** The face coordinates a tile covers: `[u0, v0, size]`. */
export function tileSpan(t: TileKey): [number, number, number] {
  const size = 2 / (1 << t.level);
  return [-1 + t.i * size, -1 + t.j * size, size];
}
