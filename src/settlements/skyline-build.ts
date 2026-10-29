import * as THREE from 'three';
import type { World } from '../geo.ts';
import { PLANET_RADIUS } from '../globe.ts';
import { STOREY } from '../scenery/contract/scale.ts';
import { cellCentre, isAvenue, townFrame, townGrid } from '../scenery/grid.ts';
import { rngFrom } from '../scenery/random.ts';
import { urbanityOf } from './urbanity.ts';
import type { Slot } from './types.ts';

/**
 * A far town as the haze shows it: one box a cell, in its region's walls and
 * roofs, standing on the relief, with no plan, no floor and no kit. What
 * stands near is the real town (`raise/`); this is what stands past it, out
 * to the far haze, so a town is there before anyone has been near it.
 *
 * A tile of towns is one indexed buffer and one draw call; each town is a run
 * of vertices in it, folded under the ground while its real town stands
 * (`skyline.ts`).
 */

/** A landmark's ground, which no box stands in. */
export interface SkylineSite {
  readonly direction: THREE.Vector3;
  /** World units round the landmark's point kept clear. */
  readonly clear: number;
}

/** A town's vertices in its tile's buffer, and the point under the ground it folds to. */
export interface SkylineRun {
  readonly index: number;
  readonly first: number;
  readonly count: number;
  readonly buried: THREE.Vector3;
  folded: boolean;
  /** When its real town was first seen standing (`performance.now()`), or -1. */
  standingSince: number;
}

export interface SkylineTile {
  readonly geometry: THREE.BufferGeometry;
  readonly runs: SkylineRun[];
  /** The positions as built, for unfolding a run. */
  readonly original: Float32Array;
  readonly triangles: number;
  readonly boxes: number;
  readonly bytes: number;
}

/** A town's fill: the share of its cells that hold a box, by how urban it is. */
export const fillOf = (urbanity: number): number => 0.5 + 0.4 * urbanity;

/** Triangles a box costs at most: four walls and a gabled roof. */
export const BOX_TRIANGLES = 14;

/** What a town's boxes will cost before they are built, for the budget. */
export function estimateBoxes(slot: Slot): number {
  const grid = townGrid(slot.radius);
  return Math.ceil(grid.cells * grid.cells * fillOf(urbanityOf(slot.place.pop)));
}

/** How far into the ground a box's base goes: the drawn land is up to a few units off the relief, and the slope under a box more. */
const SINK = 7;
const SINK_SLOPE = 0.6;
/** Where a folded town's vertices go: under its own ground, out of every view. */
const BURY = 40;
/** The roof pitch from which a low box takes a gable. */
const GABLE_PITCH = 0.3;
const GABLE_STOREYS = 4;

/** The buffer under construction, as plain arrays. */
interface Writer {
  readonly position: number[];
  readonly normal: number[];
  readonly color: number[];
  readonly outline: number[];
  readonly index: number[];
  vertices: number;
  triangles: number;
}

const scratch = {
  up: new THREE.Vector3(),
  north: new THREE.Vector3(),
  across: new THREE.Vector3(),
  dir: new THREE.Vector3(),
  base: new THREE.Vector3(),
  mid: new THREE.Vector3(),
  wall: new THREE.Color(),
  roof: new THREE.Color(),
  a: new THREE.Vector3(),
  b: new THREE.Vector3(),
  n: new THREE.Vector3(),
  out: new THREE.Vector3(),
  slope: new THREE.Vector3(),
  top: new THREE.Vector3(),
  corners: Array.from({ length: 10 }, () => new THREE.Vector3()),
};

/** One quad or triangle, its winding turned to face `normal`, in the colour given. */
function face(w: Writer, points: readonly THREE.Vector3[], normal: THREE.Vector3, colour: THREE.Color, origin: THREE.Vector3, centre: THREE.Vector3): void {
  const { a, b, out } = scratch;
  const start = w.vertices;
  for (const p of points) {
    w.position.push(p.x - origin.x, p.y - origin.y, p.z - origin.z);
    w.normal.push(Math.round(normal.x * 127), Math.round(normal.y * 127), Math.round(normal.z * 127));
    w.color.push(Math.round(colour.r * 255), Math.round(colour.g * 255), Math.round(colour.b * 255));
    out.subVectors(p, centre).normalize();
    w.outline.push(Math.round(out.x * 127), Math.round(out.y * 127), Math.round(out.z * 127));
  }
  w.vertices += points.length;
  a.subVectors(points[1]!, points[0]!);
  b.subVectors(points[2]!, points[0]!);
  const outward = a.cross(b).dot(normal) > 0;
  for (let k = 1; k + 1 < points.length; k++) {
    if (outward) w.index.push(start, start + k, start + k + 1);
    else w.index.push(start, start + k + 1, start + k);
    w.triangles++;
  }
}

/**
 * One box: half extents `hx` along `across` and `hz` along `north`, walls `height`
 * over the ground at `base`, sunk `sink` under it, and a gable along the longer
 * side when `rise` is above zero.
 */
function box(w: Writer, base: THREE.Vector3, up: THREE.Vector3, across: THREE.Vector3, north: THREE.Vector3,
  hx: number, hz: number, height: number, sink: number, rise: number, wall: THREE.Color, roof: THREE.Color, origin: THREE.Vector3): void {
  const c = scratch.corners;
  const { mid, n } = scratch;
  // 0-3 the foot, 4-7 the eaves, counter-clockwise from (-x, -z).
  const signs = [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const;
  signs.forEach(([sx, sz], k) => {
    c[k]!.copy(base).addScaledVector(across, sx * hx).addScaledVector(north, sz * hz).addScaledVector(up, -sink);
    c[k + 4]!.copy(c[k]!).addScaledVector(up, sink + height);
  });
  mid.copy(base).addScaledVector(up, (height - sink) / 2);
  const sides = [
    [0, 1, 5, 4, north, -1],
    [1, 2, 6, 5, across, 1],
    [2, 3, 7, 6, north, 1],
    [3, 0, 4, 7, across, -1],
  ] as const;
  for (const [i, j, k, l, axis, sign] of sides) {
    n.copy(axis).multiplyScalar(sign);
    face(w, [c[i]!, c[j]!, c[k]!, c[l]!], n, wall, origin, mid);
  }
  if (rise <= 0) {
    face(w, [c[4]!, c[5]!, c[6]!, c[7]!], up, roof, origin, mid);
    return;
  }
  // The ridge along the longer side: 8 and 9 over the two short ends.
  const alongX = hx >= hz;
  const top = scratch.top.copy(base).addScaledVector(up, height + rise);
  const ridge = alongX ? across : north;
  const half = alongX ? hx : hz;
  c[8]!.copy(top).addScaledVector(ridge, -half);
  c[9]!.copy(top).addScaledVector(ridge, half);
  const slopeNormal = (side: THREE.Vector3, sign: number, span: number): THREE.Vector3 =>
    scratch.slope.copy(side).multiplyScalar(sign * rise).addScaledVector(up, span).normalize();
  if (alongX) {
    face(w, [c[4]!, c[5]!, c[9]!, c[8]!], slopeNormal(north, -1, hz), roof, origin, mid);
    face(w, [c[6]!, c[7]!, c[8]!, c[9]!], slopeNormal(north, 1, hz), roof, origin, mid);
    face(w, [c[7]!, c[4]!, c[8]!], n.copy(across).negate(), wall, origin, mid);
    face(w, [c[5]!, c[6]!, c[9]!], across, wall, origin, mid);
  } else {
    face(w, [c[5]!, c[6]!, c[9]!, c[8]!], slopeNormal(across, 1, hx), roof, origin, mid);
    face(w, [c[7]!, c[4]!, c[8]!, c[9]!], slopeNormal(across, -1, hx), roof, origin, mid);
    face(w, [c[4]!, c[5]!, c[8]!], n.copy(north).negate(), wall, origin, mid);
    face(w, [c[6]!, c[7]!, c[9]!], north, wall, origin, mid);
  }
}

/** One town's boxes, appended to the writer. */
function townBoxes(w: Writer, world: World, slot: Slot, sites: readonly SkylineSite[], origin: THREE.Vector3): number {
  const { up, north, across, dir, base, wall, roof } = scratch;
  up.copy(slot.direction);
  townFrame(up, across, north);
  const grid = townGrid(slot.radius);
  const style = slot.style;
  const urbanity = urbanityOf(slot.place.pop);
  const fill = fillOf(urbanity);
  const near = sites.filter((site) => site.direction.angleTo(up) * PLANET_RADIUS < slot.radius + site.clear + 20);
  const [low, high] = style.storeys;
  let boxes = 0;
  for (let row = 0; row < grid.cells; row++) {
    for (let col = 0; col < grid.cells; col++) {
      if (isAvenue(grid, col, row)) continue;
      const rng = rngFrom(slot.seed, 'skyline', col, row);
      const x = cellCentre(grid, col);
      const z = cellCentre(grid, row);
      const core = 1 - Math.max(Math.abs(x), Math.abs(z)) / Math.max(1, grid.half);
      if (rng.unit() > fill * (core < 0.2 ? 0.7 : 1)) continue;
      dir.copy(up).addScaledVector(across, x / PLANET_RADIUS).addScaledVector(north, z / PLANET_RADIUS).normalize();
      if (near.some((site) => site.direction.angleTo(dir) * PLANET_RADIUS < site.clear + grid.pitch)) continue;
      const elevation = world.elevationAt(dir);
      if (elevation <= 0) continue;
      const hx = grid.pitch * rng.range(0.28, 0.42);
      const hz = grid.pitch * rng.range(0.28, 0.42);
      let storeys = rng.between(low, high);
      if (urbanity >= 0.5 && rng.unit() < core * urbanity * 0.6) storeys += Math.round(rng.range(3, 10) * urbanity);
      const rise = style.pitch >= GABLE_PITCH && storeys <= GABLE_STOREYS ? style.pitch * Math.min(hx, hz) : 0;
      wall.setHex(rng.pick(style.walls));
      roof.setHex(rng.pick(style.roofs));
      base.copy(dir).multiplyScalar(PLANET_RADIUS + elevation);
      box(w, base, up, across, north, hx, hz, storeys * STOREY, SINK + SINK_SLOPE * Math.max(hx, hz), rise, wall, roof, origin);
      boxes++;
    }
  }
  return boxes;
}

/**
 * A tile's towns built a town at a time, `origin` the point the buffer is
 * relative to. Null when no town in it has a box standing.
 */
export function* skylineTileSteps(
  world: World, slots: readonly Slot[], towns: readonly number[], sites: readonly SkylineSite[], origin: THREE.Vector3,
): Generator<void, SkylineTile | null, void> {
  const w: Writer = { position: [], normal: [], color: [], outline: [], index: [], vertices: 0, triangles: 0 };
  const runs: SkylineRun[] = [];
  let boxes = 0;
  for (const index of towns) {
    const slot = slots[index]!;
    const first = w.vertices;
    boxes += townBoxes(w, world, slot, sites, origin);
    if (w.vertices > first) {
      const buried = slot.direction.clone().multiplyScalar(slot.anchor.length() - BURY).sub(origin);
      runs.push({ index, first, count: w.vertices - first, buried, folded: false, standingSince: -1 });
    }
    yield;
  }
  if (w.vertices === 0) return null;
  const geometry = new THREE.BufferGeometry();
  const position = new Float32Array(w.position);
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(w.normal), 3, true));
  geometry.setAttribute('color', new THREE.BufferAttribute(new Uint8Array(w.color), 3, true));
  geometry.setAttribute('outlineNormal', new THREE.BufferAttribute(new Int8Array(w.outline), 3, true));
  geometry.setIndex(w.vertices > 65535 ? new THREE.BufferAttribute(new Uint32Array(w.index), 1) : new THREE.BufferAttribute(new Uint16Array(w.index), 1));
  geometry.computeBoundingSphere();
  const bytes = w.vertices * (12 + 9) + w.index.length * (w.vertices > 65535 ? 4 : 2);
  return { geometry, runs, original: position.slice(), triangles: w.triangles, boxes, bytes };
}
