/**
 * Walls for a body moving in the plane: footprints a body cannot walk into,
 * and a roof height a camera cannot see through.
 *
 * Coordinates are a town's tangent frame (`x` along `across`, `z` along
 * `north`, world units from its centre), the frame `madeHeightAt` reads the
 * floor in; the caller turns a displacement back as `x * across + z * north`.
 * A footprint is an oriented rectangle or a disc. To a body a footprint is
 * infinitely tall; `top` is the camera's alone.
 *
 * Pure and allocation-free after `solidField`. Every query walks solids in
 * index order whatever the grid, so answers do not depend on the cell size.
 */

export interface Solid {
  /** Centre of the footprint, in the town's frame. */
  x: number;
  z: number;
  /** The footprint's first axis is `(cos, sin)` in `(x, z)`; its second is `(-sin, cos)`. */
  cos: number;
  sin: number;
  /** Half extents along those two axes. */
  hx: number;
  hz: number;
  /** The roof, as a radius from the planet's centre. The camera's; a body ignores it. */
  top: number;
  /** A disc of radius `hx` rather than a rectangle; its axes are then unused. */
  round: boolean;
}

/** The solids of one town, a uniform grid over them, and query scratch. */
export interface SolidField {
  readonly solids: readonly Solid[];
  /** The grid: its origin, its far corner, its cell and its shape. */
  readonly minX: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxZ: number;
  readonly cell: number;
  readonly cols: number;
  readonly rows: number;
  /** Cell `c` holds `items[start[c] .. start[c + 1])`, ascending. */
  readonly start: Int32Array;
  readonly items: Int32Array;
  /** Each solid's axis-aligned half extents, for the grid and the quick reject. */
  readonly ex: Float64Array;
  readonly ez: Float64Array;
  /** Scratch, so that a query allocates nothing. Not re-entrant, and nothing here needs it to be. */
  readonly found: Int32Array;
  readonly near: Int32Array;
  readonly stamp: Int32Array;
  readonly corners: Float64Array;
  mark: number;
}

/** The grid's cell, in units: about one plot. Moves the cost of a query, never its answer. */
const SOLID_CELL = 16;
/** Cells a side, at most. A field wider than 64 cells gets wider cells instead. */
const MAX_SIDE = 64;

/**
 * Penetration below this is contact, not overlap: a body pushed out rests at
 * its radius, and the next query must not report that as a hit with no normal.
 */
const TOUCH = 1e-4;

/**
 * How many walls `pushOut` resolves, one at a time and deepest first. A body
 * still overlapping after that is inside a building, which is `freeSpot`'s case.
 */
const PUSH_ROUNDS = 8;

/** How far past its radius `freeSpot` puts a body, so its answer is clear under `pushOut`'s test. */
const SKIN = 0.01;
/** Slack on `freeSpot`'s inside test, so a candidate on an edge counts as on it. */
const EDGE = 1e-9;

/**
 * A footprint from a Three yaw. `rotation.y = yaw` takes local `+x` to
 * `(cos yaw, -sin yaw)` in `(x, z)`, so the record's `sin` is `-sin(yaw)`;
 * the other sign mirrors every rotated house about its centre.
 */
export function yawed(x: number, z: number, yaw: number, hx: number, hz: number, top: number): Solid {
  return { x, z, cos: Math.cos(yaw), sin: -Math.sin(yaw), hx, hz, top, round: false };
}

/** A round footprint: a trunk, a boulder. `top` as for a rectangle; 0 is one the camera never meets. */
export function disc(x: number, z: number, radius: number, top: number): Solid {
  return { x, z, cos: 1, sin: 0, hx: radius, hz: radius, top, round: true };
}

/** Whether `(x, z)` is inside a footprint grown by `margin`, its edge included. */
function within(s: Solid, x: number, z: number, margin: number): boolean {
  const dx = x - s.x;
  const dz = z - s.z;
  if (s.round) {
    const r = s.hx + margin;
    return dx * dx + dz * dz <= r * r;
  }
  return Math.abs(dx * s.cos + dz * s.sin) <= s.hx + margin && Math.abs(-dx * s.sin + dz * s.cos) <= s.hz + margin;
}

/** Whether `(x, z)` is strictly inside a footprint grown by `grow`, by more than `EDGE`: `freeSpot`'s test. */
function strictlyWithin(s: Solid, x: number, z: number, grow: number): boolean {
  const dx = x - s.x;
  const dz = z - s.z;
  if (s.round) {
    const r = s.hx + grow - EDGE;
    return dx * dx + dz * dz < r * r;
  }
  return Math.abs(dx * s.cos + dz * s.sin) < s.hx + grow - EDGE && Math.abs(-dx * s.sin + dz * s.cos) < s.hz + grow - EDGE;
}

/** Builds the field. Throws on a solid that is not one, which is a bug upstream. */
export function solidField(solids: readonly Solid[], cell: number = SOLID_CELL): SolidField {
  const n = solids.length;
  const ex = new Float64Array(n);
  const ez = new Float64Array(n);
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    const s = solids[i]!;
    if (![s.x, s.z, s.cos, s.sin, s.hx, s.hz, s.top].every(Number.isFinite) || s.hx <= 0 || s.hz <= 0) {
      throw new Error(`solid ${i} is not a footprint: ${JSON.stringify(s)}`);
    }
    if (Math.abs(s.cos * s.cos + s.sin * s.sin - 1) > 1e-6) {
      throw new Error(`solid ${i}'s axis (${s.cos}, ${s.sin}) is not a unit vector`);
    }
    if (s.round && s.hx !== s.hz) throw new Error(`solid ${i} is a disc with two radii`);
    const c = Math.abs(s.cos);
    const sn = Math.abs(s.sin);
    const halfX = s.round ? s.hx : c * s.hx + sn * s.hz;
    const halfZ = s.round ? s.hx : sn * s.hx + c * s.hz;
    ex[i] = halfX;
    ez[i] = halfZ;
    minX = Math.min(minX, s.x - halfX);
    maxX = Math.max(maxX, s.x + halfX);
    minZ = Math.min(minZ, s.z - halfZ);
    maxZ = Math.max(maxZ, s.z + halfZ);
  }
  if (n === 0) minX = minZ = maxX = maxZ = 0;

  const size = Math.max(cell, (maxX - minX) / MAX_SIDE, (maxZ - minZ) / MAX_SIDE);
  const cols = n === 0 ? 0 : Math.max(1, Math.ceil((maxX - minX) / size));
  const rows = n === 0 ? 0 : Math.max(1, Math.ceil((maxZ - minZ) / size));
  const at = (value: number, min: number, count: number): number =>
    Math.min(count - 1, Math.max(0, Math.floor((value - min) / size)));

  /** Every cell solid `i`'s bounding box touches. */
  const cells = (i: number, visit: (k: number) => void): void => {
    const s = solids[i]!;
    const c0 = at(s.x - ex[i]!, minX, cols);
    const c1 = at(s.x + ex[i]!, minX, cols);
    const r0 = at(s.z - ez[i]!, minZ, rows);
    const r1 = at(s.z + ez[i]!, minZ, rows);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) visit(r * cols + c);
  };
  // Counting sort into one compressed row per cell. Filled in index order, so
  // every cell's list is already ascending.
  const start = new Int32Array(cols * rows + 1);
  for (let i = 0; i < n; i++) cells(i, (k) => { start[k + 1] = start[k + 1]! + 1; });
  for (let k = 0; k < cols * rows; k++) start[k + 1] = start[k + 1]! + start[k]!;
  const items = new Int32Array(start[cols * rows]!);
  const fill = start.slice(0, cols * rows);
  for (let i = 0; i < n; i++) cells(i, (k) => { items[fill[k]!] = i; fill[k] = fill[k]! + 1; });

  return {
    solids,
    minX,
    minZ,
    maxX,
    maxZ,
    cell: size,
    cols,
    rows,
    start,
    items,
    ex,
    ez,
    found: new Int32Array(n),
    near: new Int32Array(n),
    stamp: new Int32Array(n),
    corners: new Float64Array(n * 8),
    mark: 0,
  };
}

/**
 * Every solid whose bounding box meets a query box, into `into`, ascending:
 * sorted so the answer does not depend on the order the cells are walked.
 */
function gather(f: SolidField, into: Int32Array, x0: number, z0: number, x1: number, z1: number): number {
  if (f.cols === 0 || x1 < f.minX || x0 > f.maxX || z1 < f.minZ || z0 > f.maxZ) return 0;
  const c0 = Math.max(0, Math.floor((x0 - f.minX) / f.cell));
  const c1 = Math.min(f.cols - 1, Math.floor((x1 - f.minX) / f.cell));
  const r0 = Math.max(0, Math.floor((z0 - f.minZ) / f.cell));
  const r1 = Math.min(f.rows - 1, Math.floor((z1 - f.minZ) / f.cell));
  if (f.mark >= 0x7ffffffe) {
    f.stamp.fill(0);
    f.mark = 0;
  }
  const mark = ++f.mark;
  let count = 0;
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const k = r * f.cols + c;
      const end = f.start[k + 1]!;
      for (let j = f.start[k]!; j < end; j++) {
        const i = f.items[j]!;
        if (f.stamp[i] === mark) continue;
        f.stamp[i] = mark;
        const s = f.solids[i]!;
        const halfX = f.ex[i]!;
        const halfZ = f.ez[i]!;
        if (s.x - halfX > x1 || s.x + halfX < x0 || s.z - halfZ > z1 || s.z + halfZ < z0) continue;
        into[count++] = i;
      }
    }
  }
  for (let a = 1; a < count; a++) {
    const value = into[a]!;
    let b = a - 1;
    while (b >= 0 && into[b]! > value) {
      into[b + 1] = into[b]!;
      b--;
    }
    into[b + 1] = value;
  }
  return count;
}

/** The displacement `separate` found, reused. */
const sep = { x: 0, z: 0 };

/**
 * The displacement that takes a circle out of one footprint, into `sep`, and
 * how deep it was; 0 when they do not overlap by more than `TOUCH`. Outside the
 * rectangle the push runs from its nearest point; with the centre inside, out
 * by the side of least penetration.
 */
function separate(s: Solid, x: number, z: number, radius: number): number {
  const dx = x - s.x;
  const dz = z - s.z;
  if (s.round) {
    const reach = s.hx + radius;
    const d2 = dx * dx + dz * dz;
    if (d2 >= reach * reach) return 0;
    const d = Math.sqrt(d2);
    const depth = reach - d;
    if (depth <= TOUCH) return 0;
    // Dead centre has no normal; it leaves along +x, which is as good as any
    // and the same every time.
    sep.x = d > 1e-12 ? (dx / d) * depth : depth;
    sep.z = d > 1e-12 ? (dz / d) * depth : 0;
    return depth;
  }
  const u = dx * s.cos + dz * s.sin;
  const v = -dx * s.sin + dz * s.cos;
  const au = Math.abs(u);
  const av = Math.abs(v);
  if (au >= s.hx + radius || av >= s.hz + radius) return 0;
  let nu: number;
  let nv: number;
  let depth: number;
  if (au > s.hx || av > s.hz) {
    const du = u - Math.max(-s.hx, Math.min(s.hx, u));
    const dv = v - Math.max(-s.hz, Math.min(s.hz, v));
    const d2 = du * du + dv * dv;
    if (d2 >= radius * radius) return 0;
    const d = Math.sqrt(d2);
    depth = radius - d;
    if (depth <= TOUCH) return 0;
    nu = du / d;
    nv = dv / d;
  } else {
    const alongU = s.hx - au + radius;
    const alongV = s.hz - av + radius;
    if (alongU <= alongV) {
      nu = u < 0 ? -1 : 1;
      nv = 0;
      depth = alongU;
    } else {
      nu = 0;
      nv = v < 0 ? -1 : 1;
      depth = alongV;
    }
  }
  sep.x = (nu * s.cos - nv * s.sin) * depth;
  sep.z = (nu * s.sin + nv * s.cos) * depth;
  return depth;
}

/**
 * Pushes a circle out of every solid it overlaps. `out` receives the total
 * displacement in `(x, z)`; returns whether anything was hit.
 *
 * One wall at a time, the deepest first: along a facade the face under the
 * body is deeper than a neighbour's corner on the same line, so a body sliding
 * along a terrace is not snagged at each party wall.
 *
 * `over`, a radius from the planet's centre, leaves out every solid whose roof
 * is at or under it: a craft in the air passes over a roof.
 */
export function pushOut(
  field: SolidField,
  x: number,
  z: number,
  radius: number,
  out: { x: number; z: number },
  over = -Infinity,
): boolean {
  let px = x;
  let pz = z;
  let hit = false;
  for (let round = 0; round < PUSH_ROUNDS; round++) {
    const count = gather(field, field.found, px - radius, pz - radius, px + radius, pz + radius);
    let deepest = 0;
    let dx = 0;
    let dz = 0;
    for (let k = 0; k < count; k++) {
      const solid = field.solids[field.found[k]!]!;
      if (solid.top <= over) continue;
      const depth = separate(solid, px, pz, radius);
      // Strictly deeper, so a tie goes to the lower index: deterministic.
      if (depth <= deepest) continue;
      deepest = depth;
      dx = sep.x;
      dz = sep.z;
    }
    if (deepest === 0) break;
    px += dx;
    pz += dz;
    hit = true;
  }
  out.x = px - x;
  out.z = pz - z;
  return hit;
}

/** Whether a circle overlaps any solid by more than contact: `pushOut`'s own test. */
export function overlaps(field: SolidField, x: number, z: number, radius: number): boolean {
  const count = gather(field, field.found, x - radius, z - radius, x + radius, z + radius);
  for (let k = 0; k < count; k++) {
    if (separate(field.solids[field.found[k]!]!, x, z, radius) > 0) return true;
  }
  return false;
}

/** The lowest-indexed solid whose footprint, grown by `margin`, contains `(x, z)`; or null. */
export function solidAt(field: SolidField, x: number, z: number, margin = 0): Solid | null {
  const count = gather(field, field.found, x - margin, z - margin, x + margin, z + margin);
  for (let k = 0; k < count; k++) {
    const s = field.solids[field.found[k]!]!;
    if (within(s, x, z, margin)) return s;
  }
  return null;
}

/**
 * Whether a point at `height` (a radius from the planet's centre) is inside
 * some footprint and under that solid's roof: the camera's question. Every
 * containing solid is asked, since a low porch may stand inside a tower.
 */
export function enclosed(field: SolidField, x: number, z: number, height: number): boolean {
  const count = gather(field, field.found, x, z, x, z);
  for (let k = 0; k < count; k++) {
    const s = field.solids[field.found[k]!]!;
    if (height >= s.top) continue;
    if (within(s, x, z, 0)) return true;
  }
  return false;
}

/** Whether a point is outside every footprint grown by `grow`: `freeSpot`'s test. */
function clearOfGrown(field: SolidField, x: number, z: number, grow: number): boolean {
  const count = gather(field, field.found, x - grow, z - grow, x + grow, z + grow);
  for (let k = 0; k < count; k++) {
    if (strictlyWithin(field.solids[field.found[k]!]!, x, z, grow)) return false;
  }
  return true;
}

/** The best candidate `freeSpot` has found so far. */
const best = { d2: 0, x: 0, z: 0, found: false };

function offer(field: SolidField, px: number, pz: number, x: number, z: number, grow: number): void {
  const d2 = (px - x) * (px - x) + (pz - z) * (pz - z);
  if (d2 >= best.d2 || !clearOfGrown(field, px, pz, grow)) return;
  best.d2 = d2;
  best.x = px;
  best.z = pz;
  best.found = true;
}

/**
 * The nearest clear point among the solids in `field.near[0 .. count)`, or
 * none within `reach`, into `best`.
 *
 * The nearest free point lies on the boundary of the union of grown
 * footprints: a perpendicular foot on an edge, a grown disc's nearest point,
 * a corner, or where two boundaries cross. Those are the candidates.
 */
function nearestExit(field: SolidField, count: number, x: number, z: number, grow: number, reach: number): void {
  const corners = field.corners;
  for (let k = 0; k < count; k++) {
    const s = field.solids[field.near[k]!]!;
    if (s.round) continue;
    const ax = s.cos * (s.hx + grow);
    const az = s.sin * (s.hx + grow);
    const bx = -s.sin * (s.hz + grow);
    const bz = s.cos * (s.hz + grow);
    const o = k * 8;
    corners[o] = s.x + ax + bx;
    corners[o + 1] = s.z + az + bz;
    corners[o + 2] = s.x - ax + bx;
    corners[o + 3] = s.z - az + bz;
    corners[o + 4] = s.x - ax - bx;
    corners[o + 5] = s.z - az - bz;
    corners[o + 6] = s.x + ax - bx;
    corners[o + 7] = s.z + az - bz;
  }
  best.d2 = reach * reach;
  best.found = false;

  for (let k = 0; k < count; k++) {
    const s = field.solids[field.near[k]!]!;
    if (s.round) {
      // The grown disc's nearest point: straight out from its centre.
      const r = s.hx + grow;
      const dx = x - s.x;
      const dz = z - s.z;
      const d = Math.hypot(dx, dz);
      if (d > 1e-12) offer(field, s.x + (dx / d) * r, s.z + (dz / d) * r, x, z, grow);
      else offer(field, s.x + r, s.z, x, z, grow);
      continue;
    }
    const o = k * 8;
    for (let e = 0; e < 4; e++) {
      const px = corners[o + e * 2]!;
      const pz = corners[o + e * 2 + 1]!;
      const qx = corners[o + ((e + 1) % 4) * 2]!;
      const qz = corners[o + ((e + 1) % 4) * 2 + 1]!;
      offer(field, px, pz, x, z, grow);
      const dx = qx - px;
      const dz = qz - pz;
      const t = Math.max(0, Math.min(1, ((x - px) * dx + (z - pz) * dz) / (dx * dx + dz * dz)));
      offer(field, px + dx * t, pz + dz * t, x, z, grow);
    }
  }

  for (let a = 0; a < count; a++) {
    const i = field.near[a]!;
    const si = field.solids[i]!;
    for (let b = a + 1; b < count; b++) {
      const j = field.near[b]!;
      const sj = field.solids[j]!;
      const slack = 2 * grow;
      if (
        Math.abs(si.x - sj.x) > field.ex[i]! + field.ex[j]! + slack ||
        Math.abs(si.z - sj.z) > field.ez[i]! + field.ez[j]! + slack
      ) continue;
      if (si.round && sj.round) {
        circles(field, si, sj, x, z, grow);
        continue;
      }
      if (si.round || sj.round) {
        const round = si.round ? si : sj;
        const o = (si.round ? b : a) * 8;
        for (let e = 0; e < 4; e++) {
          const px = corners[o + e * 2]!;
          const pz = corners[o + e * 2 + 1]!;
          crossing(field, round, px, pz, corners[o + ((e + 1) % 4) * 2]! - px, corners[o + ((e + 1) % 4) * 2 + 1]! - pz, x, z, grow);
        }
        continue;
      }
      for (let e = 0; e < 4; e++) {
        const px = corners[a * 8 + e * 2]!;
        const pz = corners[a * 8 + e * 2 + 1]!;
        const rx = corners[a * 8 + ((e + 1) % 4) * 2]! - px;
        const rz = corners[a * 8 + ((e + 1) % 4) * 2 + 1]! - pz;
        for (let f = 0; f < 4; f++) {
          const qx = corners[b * 8 + f * 2]!;
          const qz = corners[b * 8 + f * 2 + 1]!;
          const sx = corners[b * 8 + ((f + 1) % 4) * 2]! - qx;
          const sz = corners[b * 8 + ((f + 1) % 4) * 2 + 1]! - qz;
          const denominator = rx * sz - rz * sx;
          // Parallel edges meet, if at all, along a stretch whose ends are
          // corners, and the corners are already candidates.
          if (Math.abs(denominator) < 1e-12) continue;
          const wx = qx - px;
          const wz = qz - pz;
          const t = (wx * sz - wz * sx) / denominator;
          const u = (wx * rz - wz * rx) / denominator;
          if (t < 0 || t > 1 || u < 0 || u > 1) continue;
          offer(field, px + rx * t, pz + rz * t, x, z, grow);
        }
      }
    }
  }
}

/** Where two grown discs' rims cross, offered. */
function circles(field: SolidField, a: Solid, b: Solid, x: number, z: number, grow: number): void {
  const ra = a.hx + grow;
  const rb = b.hx + grow;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-12 || d > ra + rb || d < Math.abs(ra - rb)) return;
  const along = (d * d + ra * ra - rb * rb) / (2 * d);
  const across = Math.sqrt(Math.max(0, ra * ra - along * along));
  const mx = a.x + (dx / d) * along;
  const mz = a.z + (dz / d) * along;
  offer(field, mx - (dz / d) * across, mz + (dx / d) * across, x, z, grow);
  offer(field, mx + (dz / d) * across, mz - (dx / d) * across, x, z, grow);
}

/** Where a grown disc's rim crosses the segment from `(px, pz)` along `(rx, rz)`, offered. */
function crossing(field: SolidField, round: Solid, px: number, pz: number, rx: number, rz: number, x: number, z: number, grow: number): void {
  const r = round.hx + grow;
  const fx = px - round.x;
  const fz = pz - round.z;
  const a = rx * rx + rz * rz;
  const b = 2 * (fx * rx + fz * rz);
  const c = fx * fx + fz * fz - r * r;
  const discriminant = b * b - 4 * a * c;
  if (a < 1e-12 || discriminant < 0) return;
  const root = Math.sqrt(discriminant);
  const t0 = (-b - root) / (2 * a);
  const t1 = (-b + root) / (2 * a);
  if (t0 >= 0 && t0 <= 1) offer(field, px + rx * t0, pz + rz * t0, x, z, grow);
  if (t1 >= 0 && t1 <= 1) offer(field, px + rx * t1, pz + rz * t1, x, z, grow);
}

/**
 * The nearest point to `(x, z)` where a circle of `radius` overlaps nothing,
 * written to `out`; false, and `out` untouched, when `(x, z)` is already clear.
 *
 * Footprints are grown as rectangles rather than rounded shapes, so beside a
 * convex corner the answer can be up to `radius * (sqrt 2 - 1)` further out
 * than needed; a returned point is always clear. The search disc doubles from
 * four radii until it holds an answer.
 */
export function freeSpot(
  field: SolidField,
  x: number,
  z: number,
  radius: number,
  out: { x: number; z: number },
): boolean {
  if (!overlaps(field, x, z, radius)) return false;
  const grow = radius + SKIN;
  const n = field.solids.length;
  for (let reach = grow * 4; ; reach *= 2) {
    const count = gather(field, field.near, x - reach - grow, z - reach - grow, x + reach + grow, z + reach + grow);
    const everything = count === n;
    nearestExit(field, count, x, z, grow, everything ? Infinity : reach);
    if (best.found) {
      out.x = best.x;
      out.z = best.z;
      return true;
    }
    if (everything) {
      // Unreachable: a corner on the union's convex hull is inside nothing.
      // Past the field's far edge is clear by construction, so it is the floor.
      out.x = x;
      out.z = field.maxZ + 2 * grow;
      return true;
    }
  }
}

// ---------------------------------------------------------------------------
// A body moving among the solids
// ---------------------------------------------------------------------------

/** A body in the plane: where it is and how fast it is going, in units and units/s. */
export interface Body {
  x: number;
  z: number;
  vx: number;
  vz: number;
}

/** What a moving body asks of the world: `player.ts` answers through the settlements, the check with one field. */
export interface Walls {
  /** `pushOut`'s contract: the displacement in `push`, and whether anything was hit. */
  collide(x: number, z: number, radius: number, push: { x: number; z: number }): boolean;
  /** `freeSpot`'s contract: a clear position in `out`, or false if already clear. */
  freeSpot?(x: number, z: number, radius: number, out: { x: number; z: number }): boolean;
}

/**
 * The longest sub-step, as a fraction of the body's radius. A clear body that
 * steps half its radius is at worst half its radius into anything, so its
 * centre stays outside and it cannot tunnel through a wall.
 */
export const STEP_FRACTION = 0.5;
/** A ceiling on the sub-steps, so a runaway speed costs a bounded frame; well over a run's longest frame. */
export const MAX_STEPS = 32;

const push = { x: 0, z: 0 };
const spot = { x: 0, z: 0 };

/**
 * Moves a body by its velocity for `dt`, sliding along every wall it meets.
 *
 * Sub-steps of at most `STEP_FRACTION` of the radius, and at least one even
 * standing still. After each push the velocity's component into the wall is
 * removed in place. If anything was hit, `freeSpot` places a body the pushes
 * could not clear.
 *
 * Returns `'clear'` if nothing was touched, `'slid'` if a wall took some of the
 * move, and `'freed'` if the body had to be put somewhere else.
 */
export function slide(body: Body, dt: number, radius: number, walls: Walls): 'clear' | 'slid' | 'freed' {
  const travel = Math.hypot(body.vx, body.vz) * dt;
  const stride = Math.max(radius * STEP_FRACTION, 1e-6);
  const steps = Math.min(MAX_STEPS, Math.max(1, Math.ceil(travel / stride)));
  const h = dt / steps;
  let hit = false;
  for (let i = 0; i < steps; i++) {
    body.x += body.vx * h;
    body.z += body.vz * h;
    if (!walls.collide(body.x, body.z, radius, push)) continue;
    hit = true;
    body.x += push.x;
    body.z += push.z;
    const length = Math.hypot(push.x, push.z);
    if (length < 1e-9) continue;
    const nx = push.x / length;
    const nz = push.z / length;
    const into = body.vx * nx + body.vz * nz;
    if (into < 0) {
      body.vx -= into * nx;
      body.vz -= into * nz;
    }
  }
  if (!hit) return 'clear';
  if (walls.freeSpot !== undefined && walls.freeSpot(body.x, body.z, radius, spot)) {
    body.x = spot.x;
    body.z = spot.z;
    return 'freed';
  }
  return 'slid';
}
