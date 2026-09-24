/**
 * What a town's buildings are to something moving among them: footprints a
 * body cannot walk into, and a volume a camera cannot see through.
 *
 * **Until this existed a town was a floor and nothing else.** The player stood
 * on `madeHeightAt` and walked straight through every house in the world. A
 * building is now a wall, and only a wall — the solids have no roof a foot can
 * stand on. The jump (8.5 units, `JUMP_HEIGHT` in `player.ts`) clears a small
 * house, and the point is walls, not rooftops to hop across, so to a body a
 * footprint is infinitely tall and `top` is the camera's alone.
 *
 * **The frame is the town's own tangent frame**, and it is the same one
 * `madeHeightAt` reads the floor in: `x` along the town's `across` axis and `z`
 * along its `north`, both in world units from its centre —
 * `dir.dot(floor.across) * PLANET_RADIUS`. Over a town the sphere is a plane to
 * well under a hair: the tangent coordinate of a point 150 units out differs
 * from its arc length by `r^3 / 6R^2`, 0.002 units. The caller turns a
 * displacement back into the world as `x * across + z * north`.
 *
 * **A footprint is an oriented rectangle**, because that is what a building part
 * is from above. Its first axis is `(cos, sin)` in `(x, z)` and its second is
 * `(-sin, cos)`; `yawed` builds one from a Three `rotation.y`, whose sign is the
 * opposite way round and is the one mistake this record invites.
 *
 * Everything here is pure and allocation-free after `solidField`, so the same
 * code runs in the player's frame and in `scripts/check-solids.ts`, and it is
 * deterministic: every query walks the solids in index order, whatever the grid
 * handed it, so an answer does not depend on the cell size (the check asserts
 * that it does not).
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
}

/**
 * The solids of one town and a uniform grid over them.
 *
 * Everything but `solids` is the index and its scratch, exposed because this
 * file's functions take the field rather than hide it in a closure — which is
 * what lets a town keep one per floor and the check build two and compare.
 */
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

/**
 * The grid's cell, in units: about one plot.
 *
 * A body's query box is 2.6 units across, so it touches at most four cells, and
 * a house lands in one to four. The grid is an index and not a rule — a query
 * sorts what it finds back into index order — so this moves the cost and never
 * the answer.
 */
const SOLID_CELL = 16;
/** Cells a side, at most. A field wider than 64 cells gets wider cells instead. */
const MAX_SIDE = 64;

/**
 * Penetration below this is contact, not overlap.
 *
 * A body pushed out of a wall rests at exactly its radius from it, and the next
 * query measures that as a penetration of a few ulps. Counting it as a hit would
 * report a wall with no normal to slide along; a ten-thousandth of a unit is
 * invisible on a 3.77-unit person and well clear of the arithmetic.
 */
const TOUCH = 1e-4;

/**
 * How many walls `pushOut` resolves, one at a time and deepest first.
 *
 * A flat wall takes one and the corner of two walls two; the rest is headroom
 * for the end of an alley and for a wedge between two rotated houses, which
 * converges rather than settles. Anything still overlapping after that is not
 * a contact but a body *inside* a building — spawned there, or a town raised
 * around it — and that is `freeSpot`'s case, not this one's.
 */
const PUSH_ROUNDS = 8;

/**
 * How far past its radius `freeSpot` puts a body.
 *
 * The search runs on the footprints grown by the radius, so its answers sit on
 * their edges; a hundredth of a unit more is what keeps a point on an edge
 * clear under `pushOut`'s own test instead of in contact with it.
 */
const SKIN = 0.01;
/** Slack on `freeSpot`'s inside test, so a candidate on an edge counts as on it. */
const EDGE = 1e-9;

/**
 * A footprint from a Three yaw, which is how every part in a town is placed.
 *
 * `rotation.y = yaw` takes local `+x` to `(cos yaw, -sin yaw)` in `(x, z)` — the
 * rotation about `+y` is counter-clockwise seen from above, and from above `+z`
 * points *down* the page. So the first axis is `(cos yaw, -sin yaw)` and the
 * record's `sin` is `-sin(yaw)`. Writing `Math.sin(yaw)` there mirrors every
 * rotated house about its own centre, and a square house hides it.
 */
export function yawed(x: number, z: number, yaw: number, hx: number, hz: number, top: number): Solid {
  return { x, z, cos: Math.cos(yaw), sin: -Math.sin(yaw), hx, hz, top };
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
    const c = Math.abs(s.cos);
    const sn = Math.abs(s.sin);
    const halfX = c * s.hx + sn * s.hz;
    const halfZ = sn * s.hx + c * s.hz;
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
 * Every solid whose bounding box meets a query box, into `into`, ascending.
 *
 * The sort is what makes the grid an index rather than a rule: a solid in four
 * cells is met in whatever order the cells are walked, and resolving walls in a
 * different order gives a different answer at a corner.
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
 * how deep it was; 0 when they do not overlap by more than `TOUCH`.
 *
 * Outside the rectangle the push is along the line from its nearest point,
 * which is the true contact normal and is what rounds a corner. With the
 * centre inside there is no nearest point, so it leaves by the side it is
 * nearest — the axis of least penetration. `slide` keeps a moving body out of
 * that second case altogether; it is for a body that was *put* inside.
 */
function separate(s: Solid, x: number, z: number, radius: number): number {
  const dx = x - s.x;
  const dz = z - s.z;
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
 * Pushes a circle out of every solid it overlaps.
 *
 * `out` receives the total displacement in `(x, z)` — not the new position —
 * and the return is whether anything was hit.
 *
 * **One wall at a time, the deepest first, and the order is the fix for a
 * snag.** Resolving them in index order let a house's corner push first where
 * its facade meets the next house's, and a body sliding along a terrace was
 * knocked sideways at every party wall — measured, it lost a quarter of its
 * speed along a flat street front. Along any flat facade the face under the
 * body is at least as deep as a neighbour's corner on the same line, so taking
 * the deepest first leaves the corner clear and the seam is not there. What
 * this cannot do is decide which way out of a *cluster* is nearest from inside
 * it — two terraced houses bounce a body between them — and that is
 * `freeSpot`, which `slide` asks whenever a frame hit anything.
 */
export function pushOut(
  field: SolidField,
  x: number,
  z: number,
  radius: number,
  out: { x: number; z: number },
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
      const depth = separate(field.solids[field.found[k]!]!, px, pz, radius);
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
    const dx = x - s.x;
    const dz = z - s.z;
    if (
      Math.abs(dx * s.cos + dz * s.sin) <= s.hx + margin &&
      Math.abs(-dx * s.sin + dz * s.cos) <= s.hz + margin
    ) return s;
  }
  return null;
}

/**
 * Whether a point at `height` — a radius from the planet's centre — is inside
 * some footprint and under that solid's roof. The camera's question.
 *
 * Every containing solid is asked, not the first: a porch in front of a tower
 * is a low solid inside a tall one's reach, and the point above the porch's
 * roof is still inside the tower.
 */
export function enclosed(field: SolidField, x: number, z: number, height: number): boolean {
  const count = gather(field, field.found, x, z, x, z);
  for (let k = 0; k < count; k++) {
    const s = field.solids[field.found[k]!]!;
    if (height >= s.top) continue;
    const dx = x - s.x;
    const dz = z - s.z;
    if (Math.abs(dx * s.cos + dz * s.sin) <= s.hx && Math.abs(-dx * s.sin + dz * s.cos) <= s.hz) return true;
  }
  return false;
}

/** Whether a point is outside every footprint grown by `grow`: `freeSpot`'s test. */
function clearOfGrown(field: SolidField, x: number, z: number, grow: number): boolean {
  const count = gather(field, field.found, x - grow, z - grow, x + grow, z + grow);
  for (let k = 0; k < count; k++) {
    const s = field.solids[field.found[k]!]!;
    const dx = x - s.x;
    const dz = z - s.z;
    if (
      Math.abs(dx * s.cos + dz * s.sin) < s.hx + grow - EDGE &&
      Math.abs(-dx * s.sin + dz * s.cos) < s.hz + grow - EDGE
    ) return false;
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
 * The nearest clear point among the solids in `field.near[0 .. count)`, or none
 * within `reach`.
 *
 * The free space is what is left outside the footprints grown by the body's
 * radius, and the nearest point of it to one inside is on the boundary of that
 * union: either the foot of a perpendicular on some edge, or a vertex — a
 * rectangle's corner, or where two edges cross. So those are the candidates,
 * and the nearest one that is clear of everything is the answer. Every
 * candidate inside `reach` comes from an edge inside it, which is why gathering
 * only the solids that reach the disc is enough.
 */
function nearestExit(field: SolidField, count: number, x: number, z: number, grow: number, reach: number): void {
  const corners = field.corners;
  for (let k = 0; k < count; k++) {
    const s = field.solids[field.near[k]!]!;
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

/**
 * The nearest point to `(x, z)` where a circle of `radius` overlaps nothing,
 * written to `out` as a position; false, and `out` untouched, when `(x, z)` is
 * already clear.
 *
 * It searches the footprints grown by the radius as **rectangles**, not as the
 * rounded shapes a circle really sweeps, so beside a convex corner the answer
 * can be up to `radius * (sqrt 2 - 1)` — half a unit for the avatar — further
 * out than it had to be. Exact on every flat, and a point it returns is always
 * clear. The disc it looks in doubles from four radii until it holds an answer,
 * so a body inside one house costs one round and a body inside a city block a
 * few; it is called only when a frame hit something.
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

/**
 * What a moving body asks of the world. `player.ts` answers it through the
 * settlements, which find the town and hand over to `pushOut` and `freeSpot`;
 * the check answers it with one field directly.
 */
export interface Walls {
  /** `pushOut`'s contract: the displacement in `push`, and whether anything was hit. */
  collide(x: number, z: number, radius: number, push: { x: number; z: number }): boolean;
  /** `freeSpot`'s contract: a clear position in `out`, or false if already clear. */
  freeSpot?(x: number, z: number, radius: number, out: { x: number; z: number }): boolean;
}

/**
 * The longest sub-step, as a fraction of the body's radius.
 *
 * **One step a frame tunnels.** At `RUN_SPEED` (13.5) and the 0.1 s `main.ts`
 * caps a frame at, a step is 1.35 units against a body 1.44 across — 9 against
 * 2.6 while a person was 6.8 units and the run 90, until 2026-09-24 — and a body
 * that starts in front of a wall and ends behind it was never inside it to be
 * pushed. The distance from a point to a rectangle changes no faster than the
 * point moves, so a clear body that steps half its radius is at worst half its
 * radius into anything: its centre is still outside, the push is along the
 * true contact normal, and no wall is thin enough to cross.
 */
export const STEP_FRACTION = 0.5;
/**
 * A ceiling on the sub-steps, so a runaway speed costs a bounded frame. 32
 * steps of half the body's radius, 0.36, is 11.5 units, against the 1.35 the
 * fastest foot covers in the longest frame (20.8 against 9 before 2026-09-24).
 */
export const MAX_STEPS = 32;

const push = { x: 0, z: 0 };
const spot = { x: 0, z: 0 };

/**
 * Moves a body by its velocity for `dt`, sliding along every wall it meets.
 *
 * Sub-steps no longer than `STEP_FRACTION` of the radius, and at least one even
 * standing still — a town raised around a body that is not moving has to push
 * it out too. After each push the component of the velocity *into* the wall is
 * removed and the rest kept, which is the whole difference between sliding
 * along a facade and sticking to it; the velocity is changed in place, so the
 * caller's own motion comes back without the part the wall took.
 *
 * If anything was hit, the end of the frame is asked `freeSpot`: a body the
 * pushes could not clear — spawned in a house, or terraced between two — is put
 * on the nearest clear spot now rather than ground out over many frames.
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
