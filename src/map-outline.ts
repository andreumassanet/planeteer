/**
 * The world map's coast and frontiers, thinned to the zoom they are drawn at.
 *
 * **The sheet traced every point of every ring it could see, on every redraw.**
 * The outlines are 188,507 points in 2,875 rings (2026-09-25), and at the
 * world's own zoom every one of them is on the screen: a drag redraws the
 * sheet every frame, and each of those frames walked all of them to throw
 * four in five away as closer than a pixel to the last. The tile painter did
 * the same to fill its land mask, for a tile 256 pixels across.
 *
 * So each ring is thinned **once per band of zoom**, lazily, the first time a
 * band is asked for: level `k` keeps a point only where it is `OUTLINE_STEP /
 * 2^k` of the sheet from the last one kept, which is under a pixel at every
 * zoom the level serves (`outlineLevelFor`); the last level is the source
 * itself. A point where the kind of edge changes — coast, frontier, the
 * seams that are neither — is always kept, so a run of coast never swallows
 * the start of a frontier.
 *
 * And each level is cut into **runs** of `OUTLINE_RUN` segments with a box
 * each, because a ring's own box says little about a ring the size of Canada:
 * zoomed in on Vancouver the whole ring passed the test and all of it was
 * walked to draw one bay. A run whose box is off the screen is skipped whole.
 *
 * Pure: no DOM, so the headless bench can time it (`traceOutlines` against the
 * whole planet at the world's zoom and at a street's).
 */

/** A ring of the outlines on the sheet: `u` east from the antimeridian, `v` south from the pole. */
export interface SheetRing {
  u: Float32Array;
  v: Float32Array;
  /** 0 frontier, 1 coast, 2 not an edge (a pole, the antimeridian), per segment from each point. */
  edge: Uint8Array;
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  water: boolean;
  /** The ring's fill on a world with no sea, its nation's colour as CSS; left out on Earth. */
  fill?: string;
  /** Thinned copies, one a level, built the first time a level is drawn. */
  levels: (OutlineLevel | undefined)[];
}

/** A ring thinned for one band of zoom, in runs with their own boxes. */
export interface OutlineLevel {
  u: Float32Array;
  v: Float32Array;
  edge: Uint8Array;
  /** Where each run starts, and the point count at the end: runs are `[start[r], start[r + 1])`. */
  start: Int32Array;
  /** Each run's box, `u0 u1 v0 v1`, over its segments' both ends. */
  box: Float32Array;
}

/** Segments a run: small enough that a box means something, large enough that the boxes cost nothing. */
export const OUTLINE_RUN = 48;
/** How many levels, the last being the source. */
export const OUTLINE_LEVELS = 8;
/**
 * Level 0's step in sheet units, and the zoom it serves up to in pixels a
 * sheet unit: 0.8 pixels at 1,024, which is the whole planet across a window
 * of that width. Each level after halves the step and doubles the zoom.
 */
const OUTLINE_STEP = 0.8 / 1024;
const LEVEL_ZOOM = 1024;

/** The coarsest level whose step is under `0.8 px` at this many pixels per sheet unit. */
export function outlineLevelFor(pixelsPerUnit: number): number {
  if (pixelsPerUnit <= LEVEL_ZOOM) return 0;
  return Math.min(OUTLINE_LEVELS - 1, Math.ceil(Math.log2(pixelsPerUnit / LEVEL_ZOOM)));
}

/** `ring` at `level`, built on the first ask. */
export function levelOf(ring: SheetRing, level: number): OutlineLevel {
  const built = ring.levels[level];
  if (built !== undefined) return built;
  const n = ring.u.length;
  const step = level >= OUTLINE_LEVELS - 1 ? 0 : OUTLINE_STEP / 2 ** level;
  const keep: number[] = [];
  let lastU = 0;
  let lastV = 0;
  for (let k = 0; k < n; k++) {
    const u = ring.u[k]!;
    const v = ring.v[k]!;
    const turn = k === 0 || ring.edge[k] !== ring.edge[k - 1];
    if (!turn && step > 0 && Math.abs(u - lastU) + Math.abs(v - lastV) < step) continue;
    keep.push(k);
    lastU = u;
    lastV = v;
  }
  const m = keep.length;
  const u = new Float32Array(m);
  const v = new Float32Array(m);
  const edge = new Uint8Array(m);
  for (let i = 0; i < m; i++) {
    const k = keep[i]!;
    u[i] = ring.u[k]!;
    v[i] = ring.v[k]!;
    edge[i] = ring.edge[k]!;
  }
  const runs = Math.max(1, Math.ceil(m / OUTLINE_RUN));
  const start = new Int32Array(runs + 1);
  const box = new Float32Array(runs * 4);
  for (let r = 0; r < runs; r++) {
    const from = r * OUTLINE_RUN;
    const to = Math.min(m, from + OUTLINE_RUN);
    start[r] = from;
    let u0 = Infinity;
    let u1 = -Infinity;
    let v0 = Infinity;
    let v1 = -Infinity;
    // Through `to` itself, the far end of the run's last segment (the first
    // point again, for the segment that closes the ring).
    for (let k = from; k <= to; k++) {
      const i = k === m ? 0 : k;
      if (u[i]! < u0) u0 = u[i]!;
      if (u[i]! > u1) u1 = u[i]!;
      if (v[i]! < v0) v0 = v[i]!;
      if (v[i]! > v1) v1 = v[i]!;
    }
    box[r * 4] = u0;
    box[r * 4 + 1] = u1;
    box[r * 4 + 2] = v0;
    box[r * 4 + 3] = v1;
  }
  start[runs] = m;
  const out = { u, v, edge, start, box };
  ring.levels[level] = out;
  return out;
}

/** What a path is to the trace: `Path2D` and a canvas context both are. */
export interface PathSink {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
}

/** The view the trace draws into: the sheet point at the middle of the screen, and pixels a sheet unit. */
export interface SheetView {
  cu: number;
  cv: number;
  S: number;
  width: number;
  height: number;
}

/**
 * The coast and the frontiers on the screen, into two paths. Consecutive
 * points closer than `minStep` pixels (Manhattan) are merged as they always
 * were, which a level leaves little of. Returns the segments emitted, for
 * the bench.
 */
export function traceOutlines(
  rings: readonly SheetRing[],
  view: SheetView,
  coast: PathSink,
  frontier: PathSink,
  minStep = 0.8,
): number {
  const { cu, cv, S, width, height } = view;
  const level = outlineLevelFor(S);
  // A pixel of margin, so a line along the edge of the screen is not cut.
  const margin = 2 / S;
  const uLeft = cu - width / 2 / S - margin;
  const uRight = cu + width / 2 / S + margin;
  const vTop = cv - height / 2 / S - margin;
  const vBottom = cv + height / 2 / S + margin;
  let emitted = 0;
  for (const ring of rings) {
    if (ring.v1 < vTop || ring.v0 > vBottom) continue;
    for (let wrap = -1; wrap <= 1; wrap++) {
      if (ring.u1 + wrap < uLeft || ring.u0 + wrap > uRight) continue;
      const { u, v, edge, start, box } = levelOf(ring, level);
      const n = u.length;
      const originX = width / 2 + (wrap - cu) * S;
      const originY = height / 2 - cv * S;
      const runs = start.length - 1;
      let current = -1;
      let lastX = 0;
      let lastY = 0;
      for (let r = 0; r < runs; r++) {
        const b = r * 4;
        if (box[b + 1]! + wrap < uLeft || box[b]! + wrap > uRight || box[b + 3]! < vTop || box[b + 2]! > vBottom) {
          current = -1;
          continue;
        }
        const end = start[r + 1]!;
        for (let k = start[r]!; k < end; k++) {
          const cls = edge[k]!;
          if (cls === 2) {
            current = -1;
            continue;
          }
          const path = cls === 1 ? coast : frontier;
          if (cls !== current) {
            lastX = originX + u[k]! * S;
            lastY = originY + v[k]! * S;
            path.moveTo(lastX, lastY);
            current = cls;
          }
          const next = k + 1 === n ? 0 : k + 1;
          const nx = originX + u[next]! * S;
          const ny = originY + v[next]! * S;
          // The last segment of a run or of a kind is always drawn, so a run
          // that ends where the next begins leaves no gap between them.
          const last = k + 1 === end || edge[next] !== cls;
          if (last || Math.abs(nx - lastX) + Math.abs(ny - lastY) >= minStep) {
            path.lineTo(nx, ny);
            lastX = nx;
            lastY = ny;
            emitted++;
          }
        }
      }
    }
  }
  return emitted;
}

/**
 * The land mask's rings for one tile, thinned for the tile's own zoom: filled
 * closed, the kind of edge does not matter. `each` gets the level and the
 * wrap for every ring whose box reaches the tile.
 */
export function ringsForTile(
  rings: readonly SheetRing[],
  pixelsPerUnit: number,
  uMin: number,
  uMax: number,
  vMin: number,
  vMax: number,
  water: boolean,
  each: (level: OutlineLevel, wrap: number, ring: SheetRing) => void,
): void {
  const level = outlineLevelFor(pixelsPerUnit);
  for (const ring of rings) {
    if (ring.water !== water) continue;
    if (ring.v1 < vMin || ring.v0 > vMax) continue;
    for (let wrap = -1; wrap <= 1; wrap++) {
      if (ring.u1 + wrap < uMin || ring.u0 + wrap > uMax) continue;
      each(levelOf(ring, level), wrap, ring);
    }
  }
}
