/**
 * What a model is to a body walking round it, read off its own triangles.
 *
 * A town's buildings are solid because the town knows each one's plan box
 * (`settlements.ts`). A monument, a barn or a windmill has no plan box: it is a
 * merged soup of triangles, and a box round the whole of it would wall off the
 * space under the Arc de Triomphe and between the Eiffel Tower's legs, which is
 * the space anybody walking up to either wants to be in. So the footprint is
 * measured, not declared: **what occupies the band a person's body moves
 * through**, from the knee to the crown, over whatever the person would be
 * standing on there.
 *
 * - **The floor first.** Every face that looks up (`UP_FACING`) and is no
 *   higher than a person (`HEAD`) is something to stand on: a plinth, a step, a
 *   plaza's paving. A cell of the grid takes the highest such face over its
 *   centre. Anything higher than a person is walked under, never onto — the
 *   roof of a passage, the vault of an arch — so a gate's passage stays a
 *   passage.
 * - **Then the band.** Every face is sampled finely inside the slab the bands
 *   can reach, and a sample from `KNEE` to `HEAD` over its cell's floor marks
 *   the cell as occupied. Under the knee is a step, which the foot's own rule
 *   climbs or refuses (`STEP_UP` in `player.ts`); over the head is walked
 *   under. A staircase is a run of floors each a riser above the last, and
 *   none of its risers is in its own cell's band, so it climbs.
 * - **Then the hollows.** A space the grid's edge cannot reach through empty
 *   cells is the inside of something — a tower's hollow shell, a sealed
 *   chamber — and one smaller than `POCKET_AREA` is filled, so a body put
 *   inside it is freed to the outside rather than to the inside of the wall.
 *   A walled courtyard bigger than that stays open.
 * - **Then rectangles**, each run of occupied cells merged with the identical
 *   run on the row before it, so a wall is one rectangle and a round tower a
 *   stack of them, and every rectangle carries the height of the tallest thing
 *   over it, which is what the camera needs.
 *
 * Pure, deterministic and allocation-heavy: it runs once per model, and the
 * caller caches the answer.
 */
import { AVATAR_HEIGHT } from '../stature.ts';
import { disc } from './solids.ts';
import type { Solid } from './solids.ts';

/** Under this over the floor is a step, a kerb or a lip: the foot's business, not a wall's. */
export const KNEE = AVATAR_HEIGHT * 0.25;
/** Over this above the floor is walked under; and no floor is higher than this. */
export const HEAD = AVATAR_HEIGHT;
/** A face whose normal is within 45 degrees of up is a floor. */
const UP_FACING = Math.SQRT1_2;
/** The grid's cell, in the model's units: under half the body's width. */
export const OCCUPANCY_CELL = 0.5;
/** Cells at most, so a huge model is measured coarser rather than slower. */
const MAX_CELLS = 360_000;
/**
 * A sealed hollow smaller than this, in square units, is filled. 150 is a
 * room six people wide: bigger than any hollow tower or plinth in the kit, and
 * smaller than the courtyards the monuments enclose.
 */
const POCKET_AREA = 150;

export interface Occupancy {
  /**
   * Rectangles in the model's own frame, `(x, z, hx, hz, top)` five to a
   * rectangle: centre, half extents along x and z, and the height of the
   * tallest geometry over it, all in the model's units.
   */
  rects: Float32Array;
  /** The floor, in the model's frame; null where the caller did not ask for one. */
  floor: FloorGrid | null;
  /** Cells occupied, and the grid's cell: for the checks. */
  cells: number;
  cell: number;
}

/** Standing heights on a grid, `NaN` where nothing is stood on. */
export interface FloorGrid {
  minX: number;
  minZ: number;
  cell: number;
  cols: number;
  rows: number;
  height: Float32Array;
}

/** The floor under a model-local point, or `NaN`. */
export function floorAt(grid: FloorGrid, x: number, z: number): number {
  const c = Math.floor((x - grid.minX) / grid.cell);
  const r = Math.floor((z - grid.minZ) / grid.cell);
  if (c < 0 || r < 0 || c >= grid.cols || r >= grid.rows) return NaN;
  return grid.height[r * grid.cols + c]!;
}

/** Scratch for the slab clip: at most five corners, three numbers each. */
const clipA = new Float64Array(15);
const clipB = new Float64Array(15);

/**
 * Clips a triangle to `lo <= y <= hi` (Sutherland–Hodgman, twice) into
 * `clipA`; returns the corner count, 0 if nothing is left.
 */
function clipSlab(p: ArrayLike<number>, o: number, lo: number, hi: number): number {
  for (let k = 0; k < 9; k++) clipB[k] = p[o + k]!;
  let n = clipPlane(clipB, 3, clipA, lo, 1);
  if (n === 0) return 0;
  n = clipPlane(clipA, n, clipB, hi, -1);
  for (let k = 0; k < n * 3; k++) clipA[k] = clipB[k]!;
  return n;
}

/** Keeps the side of `y = level` where `sign * (y - level) >= 0`. */
function clipPlane(src: Float64Array, n: number, dst: Float64Array, level: number, sign: number): number {
  let out = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ay = src[i * 3 + 1]!;
    const by = src[j * 3 + 1]!;
    const da = sign * (ay - level);
    const db = sign * (by - level);
    if (da >= 0) {
      dst[out * 3] = src[i * 3]!;
      dst[out * 3 + 1] = ay;
      dst[out * 3 + 2] = src[i * 3 + 2]!;
      out++;
    }
    if ((da >= 0) !== (db >= 0)) {
      const t = da / (da - db);
      dst[out * 3] = src[i * 3]! + (src[j * 3]! - src[i * 3]!) * t;
      dst[out * 3 + 1] = level;
      dst[out * 3 + 2] = src[i * 3 + 2]! + (src[j * 3 + 2]! - src[i * 3 + 2]!) * t;
      out++;
    }
  }
  return out;
}

/**
 * Calls `visit(x, y, z)` on points of the triangle `a b c` no further apart
 * than `spacing`, corners and edges included.
 *
 * In lines parallel to the triangle's shortest side, swept from the corner
 * opposite it: the lines are at most `spacing` apart because no corner is
 * further from that side than the longer sides are long, and each line is
 * sampled by its own length. So a long thin face — a wall's strip, a
 * cornice — costs its area and not the square of its length.
 */
function sampleTriangle(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
  spacing: number,
  visit: (x: number, y: number, z: number) => void,
): void {
  const ab = Math.hypot(bx - ax, by - ay, bz - az);
  const bc = Math.hypot(cx - bx, cy - by, cz - bz);
  const ca = Math.hypot(ax - cx, ay - cy, az - cz);
  // Rotate the corners so `a` faces the shortest side, `bc`.
  if (ab <= bc && ab <= ca) {
    sampleFrom(cx, cy, cz, ax, ay, az, bx, by, bz, Math.max(bc, ca), ab, spacing, visit);
  } else if (ca <= bc) {
    sampleFrom(bx, by, bz, cx, cy, cz, ax, ay, az, Math.max(ab, bc), ca, spacing, visit);
  } else {
    sampleFrom(ax, ay, az, bx, by, bz, cx, cy, cz, Math.max(ab, ca), bc, spacing, visit);
  }
}

function sampleFrom(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
  reach: number, side: number, spacing: number,
  visit: (x: number, y: number, z: number) => void,
): void {
  const lines = Math.max(1, Math.ceil(reach / spacing));
  for (let i = 0; i <= lines; i++) {
    const t = i / lines;
    const px = ax + (bx - ax) * t, py = ay + (by - ay) * t, pz = az + (bz - az) * t;
    const qx = ax + (cx - ax) * t, qy = ay + (cy - ay) * t, qz = az + (cz - az) * t;
    const steps = Math.max(1, Math.ceil((side * t) / spacing));
    for (let j = 0; j <= steps; j++) {
      const u = j / steps;
      visit(px + (qx - px) * u, py + (qy - py) * u, pz + (qz - pz) * u);
    }
  }
}

/** Whether a face is a floor under a person's height: looks up, and no higher than `HEAD`. */
function standable(p: ArrayLike<number>, o: number): boolean {
  const ay = p[o + 1]!;
  const by = p[o + 4]!;
  const cy = p[o + 7]!;
  if (Math.max(ay, by, cy) > HEAD) return false;
  const ux = p[o + 3]! - p[o]!, uy = by - ay, uz = p[o + 5]! - p[o + 2]!;
  const vx = p[o + 6]! - p[o]!, vy = cy - ay, vz = p[o + 8]! - p[o + 2]!;
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const length = Math.hypot(nx, ny, nz);
  return length > 1e-12 && ny / length >= UP_FACING;
}

/**
 * Measures a triangle soup — a merged buffer's `position`, three vertices a
 * triangle, `y` up — into the rectangles a body cannot enter.
 *
 * `floors` asks for the standing surface as well, which a monument uses and a
 * barn does not.
 */
export function occupancyOf(position: ArrayLike<number>, floors = false, cellSize = OCCUPANCY_CELL): Occupancy {
  const count = Math.floor(position.length / 9);
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < count * 9; i += 3) {
    const x = position[i]!;
    const z = position[i + 2]!;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  if (count === 0 || !Number.isFinite(minX)) {
    return { rects: new Float32Array(0), floor: null, cells: 0, cell: cellSize };
  }
  let cell = cellSize;
  while (Math.ceil((maxX - minX) / cell + 1) * Math.ceil((maxZ - minZ) / cell + 1) > MAX_CELLS) cell *= 1.5;
  // One empty cell round the edge, so the flood that finds the hollows starts
  // outside everything.
  minX -= cell;
  minZ -= cell;
  const cols = Math.ceil((maxX - minX) / cell) + 2;
  const rows = Math.ceil((maxZ - minZ) / cell) + 2;
  const cells = cols * rows;
  const indexOf = (x: number, z: number): number => {
    const c = Math.min(cols - 1, Math.max(0, Math.floor((x - minX) / cell)));
    const r = Math.min(rows - 1, Math.max(0, Math.floor((z - minZ) / cell)));
    return r * cols + c;
  };

  // --- the floor ----------------------------------------------------------
  const floor = new Float32Array(cells).fill(NaN);
  for (let t = 0; t < count; t++) {
    const o = t * 9;
    const ax = position[o]!, ay = position[o + 1]!, az = position[o + 2]!;
    const bx = position[o + 3]!, by = position[o + 4]!, bz = position[o + 5]!;
    const cx = position[o + 6]!, cy = position[o + 7]!, cz = position[o + 8]!;
    if (Math.min(ay, by, cy) > HEAD) continue;
    // The face's normal, `(b - a) x (c - a)`; its y over its length is how
    // much it looks up.
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz);
    if (length < 1e-12 || ny / length < UP_FACING) continue;
    // Its plane over every cell centre inside its shadow on the ground.
    const c0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - minX) / cell - 0.5));
    const c1 = Math.min(cols - 1, Math.ceil((Math.max(ax, bx, cx) - minX) / cell - 0.5));
    const r0 = Math.max(0, Math.floor((Math.min(az, bz, cz) - minZ) / cell - 0.5));
    const r1 = Math.min(rows - 1, Math.ceil((Math.max(az, bz, cz) - minZ) / cell - 0.5));
    // The projected triangle's signed area, for barycentrics.
    const det = ux * vz - uz * vx;
    if (Math.abs(det) < 1e-12) continue;
    let covered = false;
    for (let r = r0; r <= r1; r++) {
      const pz = minZ + (r + 0.5) * cell;
      for (let c = c0; c <= c1; c++) {
        const px = minX + (c + 0.5) * cell;
        const wx = px - ax;
        const wz = pz - az;
        const s = (wx * vz - wz * vx) / det;
        const q = (ux * wz - uz * wx) / det;
        if (s < -1e-9 || q < -1e-9 || s + q > 1 + 1e-9) continue;
        covered = true;
        const y = ay + uy * s + vy * q;
        if (y > HEAD) continue;
        const k = r * cols + c;
        const known = floor[k]!;
        if (!(y <= known)) floor[k] = y;
      }
    }
    // A face too small to cover any cell's centre still stands in its cell.
    if (!covered) {
      const y = (ay + by + cy) / 3;
      if (y <= HEAD) {
        const k = indexOf((ax + bx + cx) / 3, (az + bz + cz) / 3);
        const known = floor[k]!;
        if (!(y <= known)) floor[k] = y;
      }
    }
  }

  // --- the band -------------------------------------------------------------
  // A floor under a person's height marks nothing in its own cells — the
  // floor there is at least as high as it — so only the rest is sampled:
  // walls, ceilings, slopes too steep to stand on, and floors over a head.
  const occupied = new Uint8Array(cells);
  const fine = cell * 0.5;
  /**
   * A face on a cell's edge — a wall at a whole unit, which is most of them —
   * belongs to the cell on its inside, not to whichever the rounding gives:
   * every sample is taken a hair behind its face, along the face's inward
   * normal, and a hair towards the face's own middle, which is what keeps a
   * sample on the face's side edge — a box's corner — off the cell beyond
   * it. Without it a box measured half a cell long on its `+x` and `+z`
   * sides and true on the others.
   */
  let inX = 0;
  let inZ = 0;
  let midX = 0;
  let midZ = 0;
  const mark = (x: number, y: number, z: number): void => {
    const k = indexOf(x + inX + (midX - x) * 1e-4, z + inZ + (midZ - z) * 1e-4);
    const f = floor[k]!;
    const base = f === f ? f : 0;
    if (y > base + KNEE && y < base + HEAD) occupied[k] = 1;
  };
  const behind = cell * 1e-3;
  for (let t = 0; t < count; t++) {
    const o = t * 9;
    if (standable(position, o)) continue;
    const n = clipSlab(position, o, KNEE, HEAD * 2);
    if (n === 0) continue;
    // The outward normal off the winding, flattened: the inward step is against it.
    const ux = position[o + 3]! - position[o]!, uy = position[o + 4]! - position[o + 1]!, uz = position[o + 5]! - position[o + 2]!;
    const vx = position[o + 6]! - position[o]!, vy = position[o + 7]! - position[o + 1]!, vz = position[o + 8]! - position[o + 2]!;
    const nx = uy * vz - uz * vy;
    const nz = ux * vy - uy * vx;
    const flat = Math.hypot(nx, nz);
    inX = flat > 1e-12 ? (-nx / flat) * behind : 0;
    inZ = flat > 1e-12 ? (-nz / flat) * behind : 0;
    midX = 0;
    midZ = 0;
    for (let k = 0; k < n; k++) {
      midX += clipA[k * 3]! / n;
      midZ += clipA[k * 3 + 2]! / n;
    }
    for (let k = 1; k + 1 < n; k++) {
      sampleTriangle(
        clipA[0]!, clipA[1]!, clipA[2]!,
        clipA[k * 3]!, clipA[k * 3 + 1]!, clipA[k * 3 + 2]!,
        clipA[k * 3 + 3]!, clipA[k * 3 + 4]!, clipA[k * 3 + 5]!,
        fine, mark,
      );
    }
  }

  // --- the hollows ----------------------------------------------------------
  const reached = new Uint8Array(cells);
  const queue = new Int32Array(cells);
  let head = 0;
  let tail = 0;
  const seed = (k: number): void => {
    if (occupied[k] === 1 || reached[k] === 1) return;
    reached[k] = 1;
    queue[tail++] = k;
  };
  for (let c = 0; c < cols; c++) {
    seed(c);
    seed((rows - 1) * cols + c);
  }
  for (let r = 0; r < rows; r++) {
    seed(r * cols);
    seed(r * cols + cols - 1);
  }
  const spread = (from: number, into: (k: number) => void): void => {
    const c = from % cols;
    const r = (from - c) / cols;
    if (c > 0) into(from - 1);
    if (c < cols - 1) into(from + 1);
    if (r > 0) into(from - cols);
    if (r < rows - 1) into(from + cols);
  };
  while (head < tail) spread(queue[head++]!, seed);
  const pocketCells = POCKET_AREA / (cell * cell);
  for (let k = 0; k < cells; k++) {
    if (occupied[k] === 1 || reached[k] === 1) continue;
    // One sealed hollow, gathered; `reached` marks it so it is gathered once.
    head = 0;
    tail = 0;
    reached[k] = 1;
    queue[tail++] = k;
    while (head < tail) {
      spread(queue[head++]!, (next) => {
        if (occupied[next] === 1 || reached[next] === 1) return;
        reached[next] = 1;
        queue[tail++] = next;
      });
    }
    if (tail <= pocketCells) for (let i = 0; i < tail; i++) occupied[queue[i]!] = 1;
  }

  // --- rectangles -----------------------------------------------------------
  const rects: number[] = [];
  /** Open rectangles by the run they are extending: first column, last column, first row. */
  let open: { c0: number; c1: number; r0: number }[] = [];
  let taken = 0;
  const close = (run: { c0: number; c1: number; r0: number }, r1: number): void => {
    rects.push(
      minX + ((run.c0 + run.c1 + 1) / 2) * cell,
      minZ + ((run.r0 + r1 + 1) / 2) * cell,
      ((run.c1 - run.c0 + 1) / 2) * cell,
      ((r1 - run.r0 + 1) / 2) * cell,
      HEAD,
    );
  };
  for (let r = 0; r <= rows; r++) {
    const next: { c0: number; c1: number; r0: number }[] = [];
    let c = 0;
    while (r < rows && c < cols) {
      if (occupied[r * cols + c] !== 1) {
        c++;
        continue;
      }
      const c0 = c;
      while (c + 1 < cols && occupied[r * cols + c + 1] === 1) c++;
      taken += c - c0 + 1;
      const same = open.findIndex((run) => run.c0 === c0 && run.c1 === c);
      if (same >= 0) {
        next.push(open[same]!);
        open.splice(same, 1);
      } else next.push({ c0, c1: c, r0: r });
      c++;
    }
    for (const run of open) close(run, r - 1);
    open = next;
  }

  // The tops: the highest corner of every face whose shadow on the ground
  // meets the rectangle. Generous over a slope — the whole face's top, not
  // its height over the rectangle — which errs the camera's way.
  for (let t = 0; t < count; t++) {
    const o = t * 9;
    const x0 = Math.min(position[o]!, position[o + 3]!, position[o + 6]!);
    const x1 = Math.max(position[o]!, position[o + 3]!, position[o + 6]!);
    const z0 = Math.min(position[o + 2]!, position[o + 5]!, position[o + 8]!);
    const z1 = Math.max(position[o + 2]!, position[o + 5]!, position[o + 8]!);
    const y = Math.max(position[o + 1]!, position[o + 4]!, position[o + 7]!);
    for (let i = 0; i < rects.length; i += 5) {
      if (y <= rects[i + 4]!) continue;
      if (x1 < rects[i]! - rects[i + 2]! || x0 > rects[i]! + rects[i + 2]! || z1 < rects[i + 1]! - rects[i + 3]! || z0 > rects[i + 1]! + rects[i + 3]!) continue;
      rects[i + 4] = y;
    }
  }

  return {
    rects: Float32Array.from(rects),
    floor: floors ? { minX, minZ, cell, cols, rows, height: floor } : null,
    cells: taken,
    cell,
  };
}

/**
 * The widest a model reaches from its own vertical axis between two heights:
 * a trunk's radius under the crown, a boulder's under a person's head. 0 when
 * nothing of it is in that band.
 */
export function reachBetween(position: ArrayLike<number>, low: number, high: number): number {
  let widest = 0;
  const count = Math.floor(position.length / 9);
  for (let t = 0; t < count; t++) {
    const n = clipSlab(position, t * 9, low, high);
    for (let k = 0; k < n; k++) widest = Math.max(widest, Math.hypot(clipA[k * 3]!, clipA[k * 3 + 2]!));
  }
  return widest;
}

/**
 * What kind of obstacle a part of the kit is to a body: a tree's **trunk**, a
 * **boulder** — both discs — or **walls**, the rectangles `occupancyOf`
 * measures. A part with none is walked through: a shrub, a tuft, a field.
 */
export type BodyKind = 'trunk' | 'boulder' | 'walls';

/** A part's obstacle in its own frame, before it is placed and scaled. */
export interface PartShape {
  /** A disc's radius about the part's own axis; 0 for none. */
  radius: number;
  /** `occupancyOf`'s rectangles, for walls; empty otherwise. */
  rects: Float32Array;
}

/** Slices a trunk is read in, bottom up. */
const TRUNK_SLICE = 0.4;
/**
 * A boulder's disc against its widest reach under the knee. A rock is round
 * nowhere, and the disc through its widest point walls off the air beside
 * every narrower side; most of it is the better lie.
 */
const BOULDER_SHARE = 0.85;

/**
 * The obstacle a part is, measured from its merged triangles.
 *
 * **A trunk is the narrowest slice under the crown**: the trees of the kit
 * flare at the root and several carry their crown down below a person's head,
 * so the widest reach anywhere under the head is a canopy and the narrowest
 * is the trunk. Slices from the root to half the tree's height or a person's,
 * whichever is lower, and the least of them. A boulder under the knee is
 * stepped over.
 */
export function partShape(position: ArrayLike<number>, kind: BodyKind): PartShape {
  const none = new Float32Array(0);
  if (kind === 'walls') return { radius: 0, rects: occupancyOf(position).rects };
  let height = 0;
  for (let i = 1; i < position.length; i += 3) height = Math.max(height, position[i]!);
  if (kind === 'boulder') {
    return { radius: height < KNEE ? 0 : reachBetween(position, 0, KNEE) * BOULDER_SHARE, rects: none };
  }
  const ceiling = Math.min(HEAD, height * 0.5);
  let narrowest = Infinity;
  for (let low = 0.2; low < ceiling; low += TRUNK_SLICE) {
    const reach = reachBetween(position, low, Math.min(ceiling, low + TRUNK_SLICE));
    if (reach > 0) narrowest = Math.min(narrowest, reach);
  }
  return { radius: Number.isFinite(narrowest) ? narrowest : 0, rects: none };
}

/**
 * A part's obstacle where a placed matrix puts it, into `into`, in the frame
 * the matrix places into — a tile's, whose `y` is up and whose origin stands
 * `ground` from the planet's centre.
 *
 * A disc goes where the part's axis meets the ground, scaled; it takes no
 * roof (`top` 0), which is a solid the camera never meets. Each rectangle goes
 * where the matrix puts its centre, its first axis the part's `+x` on the
 * ground, and a proper rotation puts the part's `+z` on its second; its roof
 * is the part's base plus its measured top, scaled. The matrix is the part's
 * whole placement — spin, lean and scale — and a lean is read as its
 * shadow on the ground.
 */
export function placeShape(shape: PartShape, e: ArrayLike<number>, ground: number, into: Solid[]): void {
  const scale = Math.hypot(e[0]!, e[1]!, e[2]!);
  if (shape.radius > 0) {
    into.push(disc(e[12]!, e[14]!, shape.radius * scale, 0));
    return;
  }
  const rects = shape.rects;
  const length = Math.hypot(e[0]!, e[2]!);
  if (rects.length === 0 || length < 1e-9) return;
  const cos = e[0]! / length;
  const sin = e[2]! / length;
  for (let r = 0; r < rects.length; r += 5) {
    const cx = rects[r]!;
    const cz = rects[r + 1]!;
    into.push({
      x: e[0]! * cx + e[8]! * cz + e[12]!,
      z: e[2]! * cx + e[10]! * cz + e[14]!,
      cos,
      sin,
      hx: rects[r + 2]! * scale,
      hz: rects[r + 3]! * scale,
      top: ground + e[13]! + rects[r + 4]! * scale,
      round: false,
    });
  }
}
