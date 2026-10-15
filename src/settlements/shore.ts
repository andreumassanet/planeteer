import { shoreSide } from '../scenery/floor.ts';
import type { Shore, ShoreLine } from '../scenery/floor.ts';

/** How many halvings find where an edge leaves the land: a pitch of 15 to within a tenth of a unit. */
const SEARCH_STEPS = 8;

/** Under this many units off the straight line, the coast is drawn straight. */
const BEND_MIN = 0.3;

/** The point between `land` and `sea` where the land ends, by halving. */
function landsEnd(
  lx: number, lz: number, sx: number, sz: number, seaAt: (x: number, z: number) => boolean,
): [number, number] {
  let lo = 0;
  let hi = 1;
  for (let step = 0; step < SEARCH_STEPS; step++) {
    const mid = (lo + hi) / 2;
    if (seaAt(lx + (sx - lx) * mid, lz + (sz - lz) * mid)) hi = mid;
    else lo = mid;
  }
  const t = (lo + hi) / 2;
  return [lx + (sx - lx) * t, lz + (sz - lz) * t];
}

/** The line through two points, turned so `(towardX, towardZ)` is on its positive side. */
function lineThrough(x0: number, z0: number, x1: number, z1: number, towardX: number, towardZ: number): ShoreLine | null {
  const length = Math.hypot(x1 - x0, z1 - z0);
  if (length < 1e-6) return null;
  let nx = -(z1 - z0) / length;
  let nz = (x1 - x0) / length;
  if (nx * towardX + nz * towardZ < 0) {
    nx = -nx;
    nz = -nz;
  }
  return { nx, nz, d: nx * x0 + nz * z0 };
}

/**
 * Where the coast crosses a cell, from its four corners in `pushQuad`'s order
 * (each with its plane coordinates and whether the sea has it) and `seaAt`,
 * the same question asked anywhere in the plane.
 *
 * Each edge with land at one end and sea at the other is searched for the
 * point it leaves the land; between those two the coast is searched once more
 * across the middle, and where it lies off the straight line the shore bends
 * there. Null where no corner is in the sea, and where the coast crosses the
 * cell four times (two wet corners facing each other), which keeps the quay
 * it had.
 */
export function shoreOf(
  corners: readonly { x: number; z: number; sea: boolean }[],
  seaAt: (x: number, z: number) => boolean,
): Shore | null {
  if (!corners.some((corner) => corner.sea)) return null;
  const ends: [number, number][] = [];
  for (let k = 0; k < 4; k++) {
    const p = corners[k]!;
    const q = corners[(k + 1) % 4]!;
    if (p.sea === q.sea) continue;
    ends.push(p.sea ? landsEnd(q.x, q.z, p.x, p.z, seaAt) : landsEnd(p.x, p.z, q.x, q.z, seaAt));
  }
  if (ends.length !== 2) return null;
  const [[x0, z0], [x1, z1]] = ends as [[number, number], [number, number]];
  // The land's side is where the dry corners are.
  let dryX = 0;
  let dryZ = 0;
  let dry = 0;
  for (const corner of corners) {
    if (corner.sea) continue;
    dryX += corner.x;
    dryZ += corner.z;
    dry++;
  }
  const midX = (x0 + x1) / 2;
  const midZ = (z0 + z1) / 2;
  const chord = lineThrough(x0, z0, x1, z1, dryX / dry - midX, dryZ / dry - midZ);
  if (chord === null) return null;
  // Across the middle of the chord, as far as the cell reaches either way.
  let reach = 0;
  for (const corner of corners) reach = Math.max(reach, Math.abs(corner.x - midX), Math.abs(corner.z - midZ));
  const inX = midX + chord.nx * reach;
  const inZ = midZ + chord.nz * reach;
  const outX = midX - chord.nx * reach;
  const outZ = midZ - chord.nz * reach;
  const straight: Shore = { lines: [chord], union: false, points: [[x0, z0], [x1, z1]] };
  if (seaAt(inX, inZ) || !seaAt(outX, outZ)) return straight;
  const [bx, bz] = landsEnd(inX, inZ, outX, outZ, seaAt);
  const offset = chord.nx * bx + chord.nz * bz - chord.d;
  if (Math.abs(offset) < BEND_MIN) return straight;
  const first = lineThrough(x0, z0, bx, bz, chord.nx, chord.nz);
  const second = lineThrough(bx, bz, x1, z1, chord.nx, chord.nz);
  if (first === null || second === null) return straight;
  // Bent towards the land the coast is a bay, and the land is either half's; bent out to sea, a headland, and both's.
  return { lines: [first, second], union: offset > 0, points: [[x0, z0], [bx, bz], [x1, z1]] };
}

/** How far inside the shore a footprint must keep, world units: a wall's thickness of quay in front of it. */
const SHORE_KEEP = 1;

/**
 * Whether the square a footprint covers is all on the dry side of a shore:
 * what may stand on a cell the coast crosses, for the raise and the map alike.
 */
export function standsDry(shore: Shore, x: number, z: number, footprint: number): boolean {
  for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    if (shoreSide(shore, x + dx * footprint, z + dz * footprint) < SHORE_KEEP) return false;
  }
  return true;
}
