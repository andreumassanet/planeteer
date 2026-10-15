/**
 * Which faces of a merged buffer are which: read off flat, non-indexed
 * position and colour arrays, so a town's variant, a countryside piece and a
 * monument share it.
 * A face is upright while its normal's height is under `UPRIGHT` and faces up
 * over it; the colours that cover a share of either are a surface's walls or
 * roof, the rest its trim.
 */
export const UPRIGHT = 0.3;

/** A vertex's colour as one integer, 8 bits a channel. */
export const colourKey = (color: ArrayLike<number>, i: number): number =>
  (Math.round(color[i]! * 255) << 16) | (Math.round(color[i + 1]! * 255) << 8) | Math.round(color[i + 2]! * 255);

export interface FaceAreas {
  /** Each triangle's unit normal's height; 0 for a degenerate one. */
  up: Float32Array;
  /** Each triangle's area. */
  area: Float32Array;
}

/** Every triangle's facing and area. */
export function faceAreas(position: ArrayLike<number>): FaceAreas {
  const faces = Math.floor(position.length / 9);
  const up = new Float32Array(faces);
  const area = new Float32Array(faces);
  const p = position;
  for (let f = 0; f < faces; f++) {
    const a = f * 9;
    const ux = p[a + 3]! - p[a]!, uy = p[a + 4]! - p[a + 1]!, uz = p[a + 5]! - p[a + 2]!;
    const vx = p[a + 6]! - p[a]!, vy = p[a + 7]! - p[a + 1]!, vz = p[a + 8]! - p[a + 2]!;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const twice = Math.hypot(nx, ny, nz);
    up[f] = twice === 0 ? 0 : ny / twice;
    area[f] = twice / 2;
  }
  return { up, area };
}

/** The colours (`colourKey`) covering at least `share` of the area of the faces `counts` admits. */
export function majorColours(
  color: ArrayLike<number>,
  faces: FaceAreas,
  counts: (up: number) => boolean,
  share: number,
): Set<number> {
  const byKey = new Map<number, number>();
  let total = 0;
  for (let f = 0; f < faces.up.length; f++) {
    if (!counts(faces.up[f]!)) continue;
    const key = colourKey(color, f * 9);
    byKey.set(key, (byKey.get(key) ?? 0) + faces.area[f]!);
    total += faces.area[f]!;
  }
  const out = new Set<number>();
  for (const [key, area] of byKey) if (area >= total * share) out.add(key);
  return out;
}

/** A vertex's mark: 0 untouched, a wall, the roof, a window pane. */
export const MARK = { none: 0, wall: 1, roof: 2, pane: 3 } as const;

/** The share of a build's upright area a colour must cover to be one of its walls. */
export const WALL_SHARE = 0.22;
/** The share of its upward area a colour must cover to be its roof. */
export const ROOF_SHARE = 0.25;

/**
 * Marks each vertex of a flat, non-indexed build: its walls are the colours
 * covering `WALL_SHARE` of its upright area, its roof what faces up in a
 * colour covering `ROOF_SHARE` of its upward area (a flat roof is often the
 * walls' own colour), and a pane any upright triangle `glazed` says is glass.
 */
export function surfaceMarks(
  position: ArrayLike<number>,
  color: ArrayLike<number>,
  glazed: (firstVertex: number) => boolean,
): Uint8Array {
  const count = Math.floor(position.length / 3);
  const mask = new Uint8Array(count);
  const faces = faceAreas(position);
  const walls = majorColours(color, faces, (y) => Math.abs(y) < UPRIGHT, WALL_SHARE);
  const roofs = majorColours(color, faces, (y) => y > UPRIGHT, ROOF_SHARE);
  for (let t = 0, f = 0; t + 2 < count; t += 3, f++) {
    const key = colourKey(color, t * 3);
    const y = faces.up[f]!;
    const upright = Math.abs(y) < UPRIGHT;
    const mark = upright && glazed(t) ? MARK.pane : y > UPRIGHT ? (roofs.has(key) ? MARK.roof : 0) : walls.has(key) && upright ? MARK.wall : 0;
    mask[t] = mark;
    mask[t + 1] = mark;
    mask[t + 2] = mark;
  }
  return mask;
}

/**
 * Where each corner of a pane lies across it, two bytes a vertex (0 to 255 for
 * 0 to 1): along the wall and up it, for `atlasPane`. A pane is a rectangle
 * drawn as two triangles and each triangle spans the whole rectangle, so a
 * triangle's own extent is its pane's. Zero off the glass.
 */
export function paneCornersOf(position: ArrayLike<number>, normal: ArrayLike<number>, mask: Uint8Array): Uint8Array {
  const p = position;
  const n = normal;
  const out = new Uint8Array(mask.length * 2);
  const along = [0, 0, 0];
  const up = [0, 0, 0];
  for (let t = 0; t + 2 < mask.length; t += 3) {
    if (mask[t] !== MARK.pane) continue;
    const nx = n[t * 3]!;
    const nz = n[t * 3 + 2]!;
    for (let k = 0; k < 3; k++) {
      const v = (t + k) * 3;
      along[k] = -nz * p[v]! + nx * p[v + 2]!;
      up[k] = p[v + 1]!;
    }
    const a0 = Math.min(...along), a1 = Math.max(...along);
    const u0 = Math.min(...up), u1 = Math.max(...up);
    for (let k = 0; k < 3; k++) {
      out[(t + k) * 2] = a1 > a0 ? Math.round(((along[k]! - a0) / (a1 - a0)) * 255) : 0;
      out[(t + k) * 2 + 1] = u1 > u0 ? Math.round(((up[k]! - u0) / (u1 - u0)) * 255) : 0;
    }
  }
  return out;
}
