/**
 * Headless assertions over the scenery kit.
 *
 * `scripts/check-traffic.ts` is the model: a kit has no baked artefact, so the
 * check is to build every part in every region in every variant and hold each
 * one to the contract. 22 parts x 14 regions x 6 variants is 1,848 builds and
 * it takes a few seconds, most of them the two people.
 *
 * What it holds a part to, beyond `validatePart`:
 *
 * - **The seed has to do something.** `reviewPart` on the sheet flags a part
 *   whose six variants collapse onto three silhouettes, and so does this — per
 *   region, because a part can be varied in Norway and a rubber stamp in Mali.
 * - **Determinism, byte for byte.** Same seed, two builds, one fingerprint of
 *   every vertex and every colour. A silhouette raster cannot see a stray
 *   `Math.random()` that moves a lobe a tenth of a unit; this can.
 * - **No NaN.** A zero-area face gives `computeVertexNormals` a normal of
 *   `NaN`, which black-holes the whole mesh and nothing in the bounding box
 *   notices. Every position and normal is read.
 * - **A building has to be made of tones.** A `dwelling`, `block` or `civic`
 *   part drawing one flat colour a surface is the failure the whole kit was
 *   re-authored out of, because a flat colour is what a box looks like. Tones
 *   are free against the colour budget, so nothing else in the contract can
 *   catch a part that spends none: this asks that **every** variant draws at
 *   least `TONE_MARGIN` more tones than it has palette colours.
 * - **No two colours in one plane.** Two faces of different colours that lie
 *   in one plane, face the same way and overlap where something can see them
 *   are one surface drawn twice at one depth, and a merged town z-fights on it
 *   whenever the camera moves. A still frame shows one colour or the other and
 *   looks fine, which is how the roofs flickered for as long as they did. See
 *   `fightsIn`.
 * - **The tables agree with the files.** Every id a region or a biome names
 *   exists, and every part that is not a person is named by one of them —
 *   otherwise a review sheet that asks the tables asks only half the world.
 *
 * The registry cannot be used here: `import.meta.glob` is a Vite transform and
 * does not exist in Node, so the parts are read off disk and imported by path.
 * Pass kinds or ids to check a subset —
 * `node scripts/check-scenery.ts tree scatter` — which is what rewriting one
 * family of parts wants while other files are mid-edit.
 *
 * `node scripts/check-scenery.ts`, or `pnpm scenery`.
 */
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Object3D } from 'three';
import {
  KINDS,
  VARIANTS,
  createSceneryContext,
  measure,
  paletteName,
  validatePart,
  variantRng,
  varietyOf,
} from '../src/scenery/contract.ts';
import type { Measurements, ScenicPart } from '../src/scenery/contract.ts';
import { REGIONS, REGION_IDS, NATIVE_TO } from '../src/scenery/regions.ts';
import { BIOMES } from '../src/biome.ts';
import { registerModelsFromDisk } from './kit-node.ts';

// The flora and the vehicles are baked CC0 models (scripts/build-kit.ts): register them as main.ts does.
await registerModelsFromDisk();

const PARTS = resolve(import.meta.dirname, '../src/scenery/parts');

let failures = 0;
const fail = (message: string): void => {
  failures++;
  console.log(`  FAIL  ${message}`);
};

// --- load ---------------------------------------------------------------

const everything: ScenicPart[] = [];
const ids = new Map<string, string>();
for (const file of readdirSync(PARTS).filter((name) => name.endsWith('.ts')).sort()) {
  const module = (await import(pathToFileURL(resolve(PARTS, file)).href)) as Record<string, unknown>;
  const found = Object.values(module).filter(
    (value): value is ScenicPart =>
      typeof value === 'object' && value !== null && typeof (value as ScenicPart).build === 'function',
  );
  if (found.length === 0) fail(`${file} exports no part`);
  for (const part of found) {
    const previous = ids.get(part.id);
    if (previous !== undefined) fail(`duplicate id '${part.id}' in ${previous} and ${file}`);
    ids.set(part.id, file);
    if (file !== `${part.id}.ts`) fail(`${file} holds '${part.id}' — the file should be ${part.id}.ts`);
    everything.push(part);
  }
}

const wanted = new Set(process.argv.slice(2));
const parts = wanted.size === 0 ? everything : everything.filter((part) => wanted.has(part.kind) || wanted.has(part.id));
if (parts.length === 0) fail(`nothing matches ${[...wanted].join(', ')} — pass kinds (${Object.keys(KINDS).join(', ')}) or ids`);

const ctx = createSceneryContext();
const styles = REGION_IDS.map((id) => REGIONS[id]);

console.log(
  `scenery kit: ${parts.length} of ${everything.length} parts x ${styles.length} regions x ${VARIANTS} variants` +
    (wanted.size > 0 ? `  (${[...wanted].join(', ')})` : ''),
);

// --- helpers --------------------------------------------------------------

type Attribute = { count: number; getX(i: number): number; getY(i: number): number; getZ(i: number): number };
type MeshLike = {
  isMesh?: boolean;
  material?: { userData: Record<string, unknown> };
  geometry?: { getAttribute(name: string): Attribute | undefined; dispose(): void };
  matrixWorld: { elements: number[] };
};
/**
 * What these helpers need of a group: Three's own two methods. It was a
 * hand-written `traverse(fn: (o: never) => void)`, which Three's `Group` is not
 * assignable to — invisible while nothing typechecked `scripts/`.
 */
type GroupLike = Pick<Object3D, 'updateMatrixWorld' | 'traverse'>;

/** Every drawn colour in a group, as stamped — tones included, so 'green x0.85' and 'green' are two. */
function drawnColors(group: GroupLike): Set<number> {
  const seen = new Set<number>();
  group.traverse(((object: MeshLike) => {
    if (!object.isMesh) return;
    // A painted part (a baked model) draws its tones as vertex colours, so they
    // are read off the colour attribute rather than off the material's stamp.
    const painted = object.material?.userData.atlasPainted === true ? object.geometry?.getAttribute('color') : undefined;
    if (painted) {
      for (let i = 0; i < painted.count; i++) {
        seen.add((Math.round(painted.getX(i) * 255) << 16) | (Math.round(painted.getY(i) * 255) << 8) | Math.round(painted.getZ(i) * 255));
      }
      return;
    }
    const stamp = object.material?.userData.atlasToon;
    if (typeof stamp === 'number') seen.add(stamp);
  }) as never);
  return seen;
}

/** The first non-finite number in any position or normal, or nothing. */
function firstNaN(group: GroupLike): string | undefined {
  let found: string | undefined;
  group.traverse(((object: MeshLike) => {
    if (found || !object.isMesh || !object.geometry) return;
    for (const name of ['position', 'normal']) {
      const attribute = object.geometry.getAttribute(name);
      if (!attribute) continue;
      for (let i = 0; i < attribute.count; i++) {
        if (!Number.isFinite(attribute.getX(i)) || !Number.isFinite(attribute.getY(i)) || !Number.isFinite(attribute.getZ(i))) {
          found = `${name} ${i} of a mesh is not finite`;
          return;
        }
      }
    }
  }) as never);
  return found;
}

/**
 * Every vertex of a built group, in group space, and the colour it is drawn in.
 * Not sorted: two builds that place the same meshes in a different order are a
 * different model to anything that draws them.
 */
function fingerprint(group: GroupLike): string {
  group.updateMatrixWorld(true);
  const bits: string[] = [];
  group.traverse(((object: MeshLike) => {
    if (!object.isMesh || !object.geometry) return;
    bits.push(`#${String(object.material?.userData.atlasToon ?? 'none')}`);
    bits.push(object.matrixWorld.elements.map((n) => n.toFixed(4)).join(','));
    const position = object.geometry.getAttribute('position')!;
    for (let i = 0; i < position.count; i++) {
      bits.push(`${position.getX(i).toFixed(4)},${position.getY(i).toFixed(4)},${position.getZ(i).toFixed(4)}`);
    }
  }) as never);
  return bits.join('|');
}

function dispose(group: GroupLike): void {
  group.traverse(((object: MeshLike) => {
    if (object.isMesh) object.geometry?.dispose();
  }) as never);
}

// --- no two colours in one plane ------------------------------------------

/**
 * Plane separation under which two faces are one surface to the depth buffer,
 * at any distance. `PROUD` is the step that keeps them apart, and it is eighty
 * times this.
 */
const COPLANAR = 1e-3;
/** The overlap that counts, in u². */
const OVERLAP = 0.01;
/**
 * How near along the normal something must stand over a point to hide it, in
 * units — or the point must be inside a solid, which is how a roof sitting on
 * an eave band hides the band's top.
 *
 * One unit, and not "anything, anywhere along the normal": the stair of a
 * flat-roof house hangs out through the upper block's crown on the narrowest
 * variants, and what stood under the two undersides it shared was the lower
 * roof a storey down, which the unbounded version of this test counted as
 * cover. The nearest pass is the crowd's: pairs of garment faces whose next
 * surface out stands between 0.3 and 1 unit over them (2026-09-13), which
 * `people.ts` owns and this does not fail.
 */
const COVER = 1;
/** How far off the face each probe starts, so that it does not find its own plane. */
const PROBE = 0.03;

interface Fight {
  /** Of the overlap, the area nothing covers, in u². */
  exposed: number;
  /** Height of the first face's first corner: enough to find the pair. */
  y: number;
  a: string;
  b: string;
}

type Piece = {
  isMesh?: boolean;
  userData: Record<string, unknown>;
  material?: { userData: Record<string, unknown> };
  geometry?: {
    index: { count: number; getX(i: number): number } | null;
    getAttribute(name: string): Attribute | undefined;
  };
  matrixWorld: { elements: number[] };
};

/** Clips a convex polygon by an anticlockwise triangle, both in one plane's 2D basis. */
function clipBy(polygon: number[][], triangle: number[][]): number[][] {
  let out = polygon;
  for (let i = 0; i < 3 && out.length > 0; i++) {
    const p = triangle[i]!;
    const q = triangle[(i + 1) % 3]!;
    const side = (r: number[]): number => (q[0]! - p[0]!) * (r[1]! - p[1]!) - (q[1]! - p[1]!) * (r[0]! - p[0]!);
    const input = out;
    out = [];
    for (let k = 0; k < input.length; k++) {
      const s = input[k]!;
      const e = input[(k + 1) % input.length]!;
      const ss = side(s);
      const se = side(e);
      const cut = (): number[] => {
        const t = ss / (ss - se);
        return [s[0]! + (e[0]! - s[0]!) * t, s[1]! + (e[1]! - s[1]!) * t];
      };
      if (se >= 0) {
        if (ss < 0) out.push(cut());
        out.push(e);
      } else if (ss >= 0) {
        out.push(cut());
      }
    }
  }
  return out;
}

function signedArea(polygon: number[][]): number {
  let sum = 0;
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i]!;
    const q = polygon[(i + 1) % polygon.length]!;
    sum += p[0]! * q[1]! - q[0]! * p[1]!;
  }
  return sum / 2;
}

/**
 * Every pair of faces in a build that z-fights: two colours, one plane
 * (`COPLANAR`), facing the same way, overlapping by more than `OVERLAP`, with
 * some of the overlap in view.
 *
 * A colour is the toon stamp and the `lit` strength together — two glasses lit
 * to different strengths are two colours after dark, and the machiya's door
 * and lattice were exactly that. In view means that of the overlap's centroid
 * and the points halfway to its corners, at least one is not hidden: not under
 * the floor the part stands on, not inside a solid, and with nothing within
 * `COVER` of it along the normal. Brute force over the pairs, because a part
 * is a few hundred triangles and the whole kit takes about a second.
 */
function fightsIn(group: GroupLike): Fight[] {
  group.updateMatrixWorld(true);
  const corners: number[] = []; // nine a triangle, in group space
  const normals: number[] = []; // three a triangle
  const planes: number[] = []; // the plane's offset along its normal
  const owners: number[] = []; // the piece it belongs to
  const tints: number[] = []; // a piece's colour, interned
  const names: string[] = [];
  const interned = new Map<string, number>();
  group.traverse(((object: Piece) => {
    if (!object.isMesh || !object.geometry) return;
    const position = object.geometry.getAttribute('position');
    if (!position) return;
    const index = object.geometry.index;
    const e = object.matrixWorld.elements;
    const stamp = object.material?.userData.atlasToon;
    const lit = object.userData.atlasLit;
    const key = `${String(stamp)}/${typeof lit === 'number' ? lit : 'unlit'}`;
    if (!interned.has(key)) interned.set(key, interned.size);
    const piece = names.length;
    tints.push(interned.get(key)!);
    const low = [Infinity, Infinity, Infinity];
    const high = [-Infinity, -Infinity, -Infinity];
    const t = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    const count = index ? index.count : position.count;
    for (let i = 0; i + 2 < count; i += 3) {
      for (let k = 0; k < 3; k++) {
        const v = index ? index.getX(i + k) : i + k;
        const x = position.getX(v);
        const y = position.getY(v);
        const z = position.getZ(v);
        for (let c = 0; c < 3; c++) {
          const w = e[c]! * x + e[4 + c]! * y + e[8 + c]! * z + e[12 + c]!;
          t[k * 3 + c] = w;
          low[c] = Math.min(low[c]!, w);
          high[c] = Math.max(high[c]!, w);
        }
      }
      const ux = t[3]! - t[0]!;
      const uy = t[4]! - t[1]!;
      const uz = t[5]! - t[2]!;
      const vx = t[6]! - t[0]!;
      const vy = t[7]! - t[1]!;
      const vz = t[8]! - t[2]!;
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      const length = Math.hypot(nx, ny, nz);
      if (length < 1e-9) continue;
      corners.push(...t);
      normals.push(nx / length, ny / length, nz / length);
      planes.push((nx * t[0]! + ny * t[1]! + nz * t[2]!) / length);
      owners.push(piece);
    }
    const size = [0, 1, 2].map((c) => (high[c]! - low[c]!).toFixed(2)).join('x');
    const centre = [0, 1, 2].map((c) => ((high[c]! + low[c]!) / 2).toFixed(2)).join(', ');
    const colour = typeof stamp === 'number' ? paletteName(stamp) : 'unstamped';
    names.push(`the ${size} ${colour}${typeof lit === 'number' ? ` lit ${lit}` : ''} at (${centre})`);
  }) as never);

  const count = planes.length;
  const hidden = (ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, i: number, j: number): boolean => {
    if (oy < 0) return true;
    let nearest = Infinity;
    let inside = false;
    for (let t = 0; t < count; t++) {
      if (t === i || t === j) continue;
      const b = t * 9;
      const ax = corners[b]!;
      const ay = corners[b + 1]!;
      const az = corners[b + 2]!;
      const e1x = corners[b + 3]! - ax;
      const e1y = corners[b + 4]! - ay;
      const e1z = corners[b + 5]! - az;
      const e2x = corners[b + 6]! - ax;
      const e2y = corners[b + 7]! - ay;
      const e2z = corners[b + 8]! - az;
      const hx = dy * e2z - dz * e2y;
      const hy = dz * e2x - dx * e2z;
      const hz = dx * e2y - dy * e2x;
      const det = e1x * hx + e1y * hy + e1z * hz;
      if (Math.abs(det) < 1e-12) continue;
      const sx = ox - ax;
      const sy = oy - ay;
      const sz = oz - az;
      const u = (sx * hx + sy * hy + sz * hz) / det;
      if (u < 0 || u > 1) continue;
      const qx = sy * e1z - sz * e1y;
      const qy = sz * e1x - sx * e1z;
      const qz = sx * e1y - sy * e1x;
      const v = (dx * qx + dy * qy + dz * qz) / det;
      if (v < 0 || u + v > 1) continue;
      const distance = (e2x * qx + e2y * qy + e2z * qz) / det;
      if (distance <= 1e-4) continue;
      // Met from behind, the face says the probe is inside its solid. Ties
      // count: a box standing on another puts two faces at one distance, one
      // met from the front and one from behind, in whichever order.
      const behind = normals[t * 3]! * dx + normals[t * 3 + 1]! * dy + normals[t * 3 + 2]! * dz > 0;
      if (distance < nearest - 1e-6) {
        nearest = distance;
        inside = behind;
      } else if (distance <= nearest + 1e-6) {
        inside ||= behind;
      }
    }
    return nearest <= COVER || (nearest < Infinity && inside);
  };

  const fights: Fight[] = [];
  for (let i = 0; i < count; i++) {
    const nx = normals[i * 3]!;
    const ny = normals[i * 3 + 1]!;
    const nz = normals[i * 3 + 2]!;
    const plane = planes[i]!;
    const tint = tints[owners[i]!];
    for (let j = i + 1; j < count; j++) {
      if (tints[owners[j]!] === tint) continue;
      if (nx * normals[j * 3]! + ny * normals[j * 3 + 1]! + nz * normals[j * 3 + 2]! < 1 - 1e-6) continue;
      let apart = 0;
      for (let k = 0; k < 9; k += 3) {
        const b = j * 9 + k;
        apart = Math.max(apart, Math.abs(nx * corners[b]! + ny * corners[b + 1]! + nz * corners[b + 2]! - plane));
      }
      if (apart >= COPLANAR) continue;

      // The plane's own basis, both triangles flattened into it and clipped.
      const across = Math.abs(ny) < 0.9 ? 0 : 1;
      let ux = (1 - across) * nz;
      let uy = -across * nz;
      let uz = across * ny - (1 - across) * nx;
      const ul = Math.hypot(ux, uy, uz);
      ux /= ul;
      uy /= ul;
      uz /= ul;
      const vx = ny * uz - nz * uy;
      const vy = nz * ux - nx * uz;
      const vz = nx * uy - ny * ux;
      const flat = (t: number): number[][] => {
        const out: number[][] = [];
        for (let k = 0; k < 9; k += 3) {
          const b = t * 9 + k;
          const x = corners[b]!;
          const y = corners[b + 1]!;
          const z = corners[b + 2]!;
          out.push([x * ux + y * uy + z * uz, x * vx + y * vy + z * vz]);
        }
        return signedArea(out) < 0 ? out.reverse() : out;
      };
      const overlap = clipBy(flat(i), flat(j));
      if (overlap.length < 3) continue;
      const area = Math.abs(signedArea(overlap));
      if (area <= OVERLAP) continue;

      let cx = 0;
      let cy = 0;
      for (const p of overlap) {
        cx += p[0]!;
        cy += p[1]!;
      }
      cx /= overlap.length;
      cy /= overlap.length;
      const probes = [[cx, cy], ...overlap.map((p) => [(p[0]! + cx) / 2, (p[1]! + cy) / 2])];
      const lift = plane + PROBE;
      let open = 0;
      for (const probe of probes) {
        const s = probe[0]!;
        const r = probe[1]!;
        const ox = ux * s + vx * r + nx * lift;
        const oy = uy * s + vy * r + ny * lift;
        const oz = uz * s + vz * r + nz * lift;
        if (!hidden(ox, oy, oz, nx, ny, nz, i, j)) open++;
      }
      if (open === 0) continue;
      fights.push({
        exposed: (area * open) / probes.length,
        y: corners[i * 9 + 1]!,
        a: names[owners[i]!]!,
        b: names[owners[j]!]!,
      });
    }
  }
  return fights;
}

// --- every variant against the contract ---------------------------------

/**
 * How many more tones than colours every variant of a building has to draw.
 *
 * Three, and it is a floor rather than a target: a wall wants a darker base
 * course, a shadow band under its eaves and a lighter window surround before
 * anything else on it is considered, and those three are one palette colour
 * between them. Measured 2026-09-06 over the ten building parts, the leanest
 * variant in the kit clears it by one — `gabled-house` in `nordic` and
 * `tower-block` in `maghreb` both draw four more tones than colours — and there
 * is no reason for a new part to be leaner than the leanest one there is.
 */
const TONE_MARGIN = 3;

interface Worst {
  triangles: number;
  meshes: number;
  colors: number;
  tones: number;
  /** The fewest tones any one variant draws, and its own colour count with it. */
  fewestTones: number;
  /** The smallest (tones - colours) of any one variant: what the tone floor is asked of. */
  margin: number;
  reach: number;
  low: number;
  high: number;
  /** Fewest distinct silhouettes across six variants, over every region. */
  shapes: number;
  /** And the fewest distinct colour sets. */
  palettes: number;
}

let builds = 0;
let triangles = 0;
let fightingBuilds = 0;
const worst = new Map<string, Worst>();
console.log('');
for (const part of parts) {
  const kind = KINDS[part.kind];
  if (!kind) {
    fail(`'${part.id}' has kind '${part.kind}', which is not in KINDS`);
    continue;
  }
  const seen = new Set<string>();
  /** The builds of this part that draw two colours in one plane, and every such pair. */
  let fighting = 0;
  let partBuilds = 0;
  const fights: { where: string; fight: Fight }[] = [];
  const w: Worst = { triangles: 0, meshes: 0, colors: 0, tones: 0, fewestTones: Infinity, margin: Infinity, reach: 0, low: Infinity, high: 0, shapes: Infinity, palettes: Infinity };
  for (const style of styles) {
    const measurements: Measurements[] = [];
    for (let variant = 0; variant < VARIANTS; variant++) {
      let group;
      try {
        group = part.build(ctx, variantRng(part, style, variant), style);
      } catch (error) {
        fail(`${part.id} threw on ${style.id}/${variant}: ${String(error)}`);
        continue;
      }
      builds++;
      const problems = validatePart(part, group);
      const nan = firstNaN(group);
      if (nan) problems.push(nan);
      for (const problem of problems) {
        if (seen.has(problem)) continue;
        seen.add(problem);
        fail(`${part.id} (${style.id}/${variant}): ${problem}`);
      }
      partBuilds++;
      const fought = fightsIn(group);
      if (fought.length > 0) {
        fighting++;
        for (const fight of fought) fights.push({ where: `${style.id}/${variant}`, fight });
      }
      const m = measure(group);
      measurements.push(m);
      w.triangles = Math.max(w.triangles, m.triangles);
      w.meshes = Math.max(w.meshes, m.meshes);
      w.colors = Math.max(w.colors, m.colors.length);
      const tones = drawnColors(group).size;
      w.tones = Math.max(w.tones, tones);
      w.fewestTones = Math.min(w.fewestTones, tones);
      // Per variant, not the fewest tones against the most colours: those are
      // two different builds, and comparing them fails a part for a pairing
      // that never happens.
      w.margin = Math.min(w.margin, tones - m.colors.length);
      w.reach = Math.max(w.reach, m.radius);
      w.low = Math.min(w.low, m.height);
      w.high = Math.max(w.high, m.height);
      dispose(group);
    }
    if (measurements.length > 1) {
      const variety = varietyOf(measurements);
      w.shapes = Math.min(w.shapes, variety.shapes);
      w.palettes = Math.min(w.palettes, variety.palettes);
      // The sheet's rule, per region: half the variants sharing a silhouette
      // is a part that is not really parametric.
      if (variety.shapes * 2 <= variety.samples) {
        const problem = `only ${variety.shapes} distinct silhouettes across ${variety.samples} variants in ${style.id}`;
        if (!seen.has(problem)) {
          seen.add(problem);
          fail(`${part.id}: ${problem}`);
        }
      }
    }
  }
  if (part.kind === 'dwelling' || part.kind === 'block' || part.kind === 'civic') {
    if (w.margin < TONE_MARGIN) {
      fail(
        `${part.id}: its leanest variant draws only ${w.margin} more tones than it has colours — ` +
          `a building wants ${TONE_MARGIN}, and tones are free (see KindSpec.colors)`,
      );
    }
  }
  if (fighting > 0) {
    fail(
      `${part.id}: ${fighting} of ${partBuilds} builds draw two colours in one plane, ` +
        `which a merged town z-fights on as the camera moves — step one of them PROUD`,
    );
    fights.sort((a, b) => b.fight.exposed - a.fight.exposed);
    for (const { where, fight } of fights.slice(0, 3)) {
      console.log(
        `          ${where}: ${fight.exposed.toFixed(3)} u² in view at y ${fight.y.toFixed(2)}, ${fight.a} against ${fight.b}`,
      );
    }
  }
  fightingBuilds += fighting;
  worst.set(part.id, w);
  triangles += w.triangles;
  console.log(
    `  ${part.id.padEnd(17)} ${part.kind.padEnd(8)} fp ${part.footprint.toFixed(1).padStart(4)}` +
      `   ${String(w.triangles).padStart(3)}/${kind.triangles} tris` +
      `   ${String(w.meshes).padStart(2)}/${kind.meshes} meshes` +
      `   ${w.colors}/${kind.colors} colours in ${String(w.fewestTones).padStart(2)}..${String(w.tones).padStart(2)} tones` +
      `   ${w.low.toFixed(1).padStart(5)}..${w.high.toFixed(1).padStart(5)} tall` +
      `   reach ${w.reach.toFixed(2).padStart(5)}` +
      `   shapes ${Number.isFinite(w.shapes) ? w.shapes : '-'}/${VARIANTS}`,
  );
}
console.log(`\n  ${builds} builds, ${triangles} triangles across the kit at the worst variant of each part`);
console.log(`  ${builds - fightingBuilds} of ${builds} builds draw no two colours in one plane`);

// --- determinism, byte for byte ------------------------------------------

for (const part of parts) {
  for (const style of styles) {
    for (let variant = 0; variant < VARIANTS; variant++) {
      let once: string;
      let twice: string;
      try {
        const a = part.build(ctx, variantRng(part, style, variant), style);
        once = fingerprint(a);
        dispose(a);
        const b = part.build(ctx, variantRng(part, style, variant), style);
        twice = fingerprint(b);
        dispose(b);
      } catch {
        continue; // already reported above
      }
      if (once !== twice) {
        fail(`${part.id} (${style.id}/${variant}) is not deterministic — same seed, two different models`);
      }
    }
  }
}

// --- the tones, by name ---------------------------------------------------

/**
 * Which colours each part actually draws in one region, so a reviewer can see
 * that a conifer is three greens of one green and not one. Informational: the
 * budget is `colors`, and tones are free against it by design.
 */
const showcase = REGIONS['atlantic-europe'];
console.log(`\n  what each part draws in ${showcase.id}, variant 0:`);
for (const part of parts) {
  let group;
  try {
    group = part.build(ctx, variantRng(part, showcase, 0), showcase);
  } catch {
    continue;
  }
  const names = [...drawnColors(group)].map(paletteName).sort();
  dispose(group);
  console.log(`  ${part.id.padEnd(17)} ${names.join(', ')}`);
}

// --- the region and biome tables ------------------------------------------

const known = new Set(everything.map((part) => part.id));
const named = new Map<string, string>();
for (const style of styles) {
  for (const [list, entries] of [
    ['buildings', style.buildings],
    ['civic', style.civic],
    ['trees', style.trees],
    ['scatter', style.scatter],
  ] as const) {
    for (const entry of entries) {
      if (!named.has(entry.item)) named.set(entry.item, `${style.id}.${list}`);
      if (!known.has(entry.item)) fail(`region '${style.id}' names '${entry.item}' in ${list} and no such part exists`);
    }
  }
  // A near town's baked buildings are named by the region's `assets`, swapping
  // a part the same region's mixes name.
  for (const [code, asset] of Object.entries(style.assets ?? {})) {
    if (!named.has(asset)) named.set(asset, `${style.id}.assets`);
    if (!known.has(asset)) fail(`region '${style.id}' swaps '${code}' for '${asset}' and no such part exists`);
    if (![...style.buildings, ...style.civic].some((entry) => entry.item === code)) {
      fail(`region '${style.id}' swaps '${code}', which its buildings and civic never draw`);
    }
  }
}
for (const biome of Object.values(BIOMES)) {
  for (const plant of biome.plants) {
    if (!named.has(plant)) named.set(plant, `biome ${biome.id}`);
    if (!known.has(plant)) fail(`biome '${biome.id}' names '${plant}' and no such part exists`);
  }
}
// The sward is not a part and no table names it, so its models are checked
// against the kit by name: a clump the bake dropped would throw on the first
// tile a player walked into, in a browser, where no check runs.
{
  const { SWARD_MODELS } = await import('../src/sward-kit.ts');
  const { sceneryModel } = await import('../src/scenery/contract.ts');
  for (const id of SWARD_MODELS) {
    try {
      sceneryModel(id);
    } catch {
      fail(`the sward draws '${id}' and the baked kit has no such model`);
    }
  }
}
for (const plant of Object.keys(NATIVE_TO)) {
  if (!known.has(plant)) fail(`NATIVE_TO names '${plant}' and no such part exists`);
}
/**
 * Parts placed by code rather than by a table. The crowd places people, and
 * `settlements.ts` stands `street-lamp` along its own streets (`LAMP_PART`)
 * and `traffic-light` at a city's middle crossing (`SIGNAL_PART`); none is
 * named by a region or a biome and none is an orphan.
 */
const PLACED_BY_CODE = new Set(['street-lamp', 'traffic-light']);
for (const part of everything) {
  if (part.kind === 'person' || PLACED_BY_CODE.has(part.id)) continue;
  if (!named.has(part.id)) fail(`nothing will ever build '${part.id}' — no region and no biome names it`);
}

console.log(failures === 0 ? '\nOK\n' : `\n${failures} failures\n`);
process.exit(failures === 0 ? 0 : 1);
