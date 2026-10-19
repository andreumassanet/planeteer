/**
 * What a landmark at the water stands on: a foundation from its base down
 * into the sea floor.
 *
 * A landmark that stands in or at the water (the source's `shore` list, or a
 * plan the bake found reaching past the coastline: `clearance < 0`) is seated
 * on the land under its plan, so the part of it over the sea would hang in the
 * air over the water. Under it stands a foundation: the outline of the model's
 * own base (the convex hull of everything within `BASE_BAND` of the ground),
 * carried straight down `FOUNDATION_DEPTH` units, far past any floor within a
 * plan's reach of a coast. A natural island is rock that widens as it goes
 * down; anything built is a cut-stone plinth. Under the land it is buried and
 * never seen; over the water it is the islet or the quay the landmark stands
 * on, darker from just over the waterline down, where the sea wets it.
 *
 * Built from the monument context's primitives' material and merged into the
 * monument's mesh (`placement/builder.ts`), so it costs no draw call. Node-safe,
 * so the checks build the same foundation the game draws.
 */
import * as THREE from 'three';
import type { MonumentContext } from './monuments/contract.ts';
import { planShape } from './landmark-ground.ts';
import type { Plan } from './landmark-ground.ts';
import { SHORE_LIP } from './terrain.ts';

/** How far under the model's base a foundation reaches, in world units. */
export const FOUNDATION_DEPTH = 40;
/** Vertices at most this high count as the model's base, in world units. */
export const BASE_BAND = 1.2;
/** The foundation's top, a hair under the model's base so the two never share a plane. */
const TOP = -0.05;
/**
 * Where the wet band starts, in the model's frame: a little over the sea for
 * a landmark seated on the lip, which is where every one over the water is
 * (`checkCoastClearance` in `pnpm check`).
 */
const WET_FROM = -SHORE_LIP + 0.85;
/** How far a rock widens by its foot, as a share of the depth, and how far by the waterline. */
const ROCK_SPREAD = 0.16;
const ROCK_WATERLINE = 0.9;
/** How far a plinth's wet course stands out of its face. */
const PLINTH_STEP = 0.18;

/** The landmarks whose foundation is rock: islands and the stone they are. */
const ROCKY = new Set(['mont-saint-michel', 'the-pitons', 'moai-rapa-nui', 'mount-yasur', 'little-mermaid', 'nan-madol', 'niagara-falls']);

/** What a foundation needs to know about the landmark. */
export interface FoundationSite {
  id: string;
  shore?: true;
  clearance?: number;
  footprint?: number;
  plan?: Plan;
}

/** Whether a landmark stands at the water: listed `shore`, or its plan reaching past the coastline. */
export function needsFoundation(site: FoundationSite): boolean {
  return site.shore === true || (site.clearance ?? 0) < 0;
}

/** Whether the foundation is rock rather than masonry. */
export const isRocky = (id: string): boolean => ROCKY.has(id);

/** The convex hull of points in the plane, counter-clockwise seen from +y (`x` across, `z` north). */
function hullOf(points: [number, number][]): [number, number][] {
  const sorted = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length < 3) return sorted;
  const cross = (o: [number, number], a: [number, number], b: [number, number]): number =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: [number, number][] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** The plan's ground (its box cut by the footprint's disc) as a polygon, for a model with no base to measure. */
function planOutline(site: FoundationSite): [number, number][] {
  const shape = planShape(site);
  const points: [number, number][] = [];
  for (let k = 0; k < 48; k++) {
    const angle = (k / 48) * Math.PI * 2;
    let x = Math.cos(angle) * shape.radius;
    let z = Math.sin(angle) * shape.radius;
    if (Number.isFinite(shape.hx)) {
      x = Math.min(shape.cx + shape.hx, Math.max(shape.cx - shape.hx, x));
      z = Math.min(shape.cz + shape.hz, Math.max(shape.cz - shape.hz, z));
    }
    points.push([x, z]);
  }
  return hullOf(points);
}

const scratch = new THREE.Vector3();
const toModel = new THREE.Matrix4();

/**
 * The outline a foundation is cut to, in the model's frame: the convex hull of
 * every vertex of the model within `BASE_BAND` of its base, or the plan's
 * ground where the model has nothing that low.
 */
export function foundationOutline(model: THREE.Object3D, site: FoundationSite): [number, number][] {
  model.updateMatrixWorld(true);
  const inverse = model.matrixWorld.clone().invert();
  const points: [number, number][] = [];
  model.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh !== true) return;
    const position = mesh.geometry.getAttribute('position');
    if (position === undefined) return;
    toModel.multiplyMatrices(inverse, mesh.matrixWorld);
    for (let i = 0; i < position.count; i++) {
      scratch.fromBufferAttribute(position, i).applyMatrix4(toModel);
      if (scratch.y <= BASE_BAND) points.push([scratch.x, scratch.z]);
    }
  });
  const hull = hullOf(points);
  return hull.length >= 3 ? hull : planOutline(site);
}

/** A ring of the outline pushed out from its centre by `out` units, at height `y`. */
function ringAt(outline: readonly [number, number][], cx: number, cz: number, out: number, y: number): THREE.Vector3[] {
  return outline.map(([x, z]) => {
    const dx = x - cx;
    const dz = z - cz;
    const length = Math.hypot(dx, dz) || 1;
    return new THREE.Vector3(x + (dx / length) * out, y, z + (dz / length) * out);
  });
}

/** One flat-shaded triangle, wound so its normal points along `facing`. */
function pushTriangle(into: number[], normals: number[], a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, facing: THREE.Vector3): void {
  const n = new THREE.Vector3().crossVectors(scratch.subVectors(b, a), new THREE.Vector3().subVectors(c, a));
  if (n.lengthSq() < 1e-12) return;
  if (n.dot(facing) < 0) {
    [b, c] = [c, b];
    n.negate();
  }
  n.normalize();
  into.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  for (let k = 0; k < 3; k++) normals.push(n.x, n.y, n.z);
}

/** The side between two rings, in one colour. */
function band(ctx: MonumentContext, upper: THREE.Vector3[], lower: THREE.Vector3[], cx: number, cz: number, color: number): THREE.Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const facing = new THREE.Vector3();
  for (let i = 0; i < upper.length; i++) {
    const j = (i + 1) % upper.length;
    // Out from the middle, and up where the ring below stands wider: a step's tread faces the sky.
    facing.set((upper[i]!.x + upper[j]!.x) / 2 - cx, 0, (upper[i]!.z + upper[j]!.z) / 2 - cz).normalize();
    facing.y = 0.5;
    pushTriangle(positions, normals, upper[i]!, lower[i]!, lower[j]!, facing);
    pushTriangle(positions, normals, upper[i]!, lower[j]!, upper[j]!, facing);
  }
  return meshOf(ctx, positions, normals, color);
}

function meshOf(ctx: MonumentContext, positions: number[], normals: number[], color: number): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return new THREE.Mesh(geometry, ctx.toon(color));
}

/**
 * The foundation under a landmark, in the model's frame, or null for one that
 * stands on dry land. Measure the model before anything else (a square, its
 * lamps' posts) is added to it.
 */
export function buildFoundation(ctx: MonumentContext, model: THREE.Object3D, site: FoundationSite): THREE.Group | null {
  if (!needsFoundation(site)) return null;
  const outline = foundationOutline(model, site);
  let cx = 0;
  let cz = 0;
  for (const [x, z] of outline) {
    cx += x;
    cz += z;
  }
  cx /= outline.length;
  cz /= outline.length;
  const rocky = isRocky(site.id);
  const { palette, tone } = ctx;
  const dry = rocky ? tone(palette.bark, 0.9) : palette.bone;
  const wet = rocky ? tone(palette.slate, 1.1) : tone(palette.bone, 0.68);
  const top = ringAt(outline, cx, cz, 0, TOP);
  const waterline = ringAt(outline, cx, cz, rocky ? ROCK_WATERLINE : 0, WET_FROM);
  const course = ringAt(outline, cx, cz, rocky ? ROCK_WATERLINE : PLINTH_STEP, WET_FROM);
  const foot = ringAt(outline, cx, cz, rocky ? FOUNDATION_DEPTH * ROCK_SPREAD : PLINTH_STEP, -FOUNDATION_DEPTH);

  const group = new THREE.Group();
  group.name = 'foundation';
  // The top: a fan over the convex outline, where the model's base leaves it showing.
  const positions: number[] = [];
  const normals: number[] = [];
  const middle = new THREE.Vector3(cx, TOP, cz);
  const upward = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < top.length; i++) pushTriangle(positions, normals, middle, top[i]!, top[(i + 1) % top.length]!, upward);
  group.add(meshOf(ctx, positions, normals, dry));
  group.add(band(ctx, top, waterline, cx, cz, dry));
  // A plinth's wet course stands proud of its face, so the pen draws the step.
  if (!rocky) group.add(band(ctx, waterline, course, cx, cz, wet));
  group.add(band(ctx, course, foot, cx, cz, wet));
  return group;
}
