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
import { fightsIn } from './z-fight.ts';
import type { Fight } from './z-fight.ts';

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
for (const plant of Object.keys(NATIVE_TO)) {
  if (!known.has(plant)) fail(`NATIVE_TO names '${plant}' and no such part exists`);
}
/**
 * Parts placed by code rather than by a table. The crowd places people, and
 * `settlements.ts` stands `street-lamp` along its own streets (`LAMP_PART`),
 * `traffic-light` at a city's middle crossing (`SIGNAL_PART`) and
 * `street-bench` beside some of its lamps (`BENCH_PART`); none is named by a
 * region or a biome and none is an orphan.
 */
const PLACED_BY_CODE = new Set(['street-lamp', 'traffic-light', 'street-bench']);
for (const part of everything) {
  if (part.kind === 'person' || PLACED_BY_CODE.has(part.id)) continue;
  if (!named.has(part.id)) fail(`nothing will ever build '${part.id}' — no region and no biome names it`);
}

// --- the street dressing -------------------------------------------------
//
// What `scenery/street-dressing.ts` hangs on a near town's fronts and stands
// on its building line is written as flat arrays, not as parts, so it is held
// here to the same rules a part is: every piece of every region laid out by
// `sampleDressing`, regrouped a mesh a colour (a colour and its glow, as the
// town draws them) and asked for z-fights like any build; every normal a unit
// and on the side its winding says; and the same buffer twice.
{
  const THREE = await import('three');
  const { sampleDressing, pieceCost, propModels, DRESSING_REGIONS } = await import('../src/scenery/street-dressing.ts');
  const { createSceneryContext } = await import('../src/scenery/contract.ts');
  // The CC0 pieces from the kit on disk, as a town draws them.
  const models = propModels(createSceneryContext());
  console.log('\nthe street dressing:');
  const worst = new Map<string, number>();
  let fought = 0;
  let pieces = 0;
  for (const region of DRESSING_REGIONS) {
    // A country of each post box's shape: a pillar, a box on a post, a collection box, a cabinet.
    for (let variant = 0; variant < 4; variant++) {
      const iso = ['GBR', 'ESP', 'USA', 'JPN'][variant]!;
      const { dressed, pieces: laid } = sampleDressing(region, iso, variant, models);
      const again = sampleDressing(region, iso, variant, models).dressed;
      pieces += laid.length;
      for (const piece of laid) {
        worst.set(piece.name, Math.max(worst.get(piece.name) ?? 0, piece.triangles));
        // A town out of allowance skips a piece by its declared cost, so the cost must be the most it comes to.
        const cost = pieceCost(piece.name);
        if (cost !== undefined && piece.triangles > cost) fail(`street dressing (${region}/${variant}): ${piece.name} came to ${piece.triangles} triangles, over its declared ${cost}`);
      }
      const same =
        again.position.length === dressed.position.length &&
        again.position.every((value, i) => Object.is(value, dressed.position[i])) &&
        again.color.every((value, i) => Object.is(value, dressed.color[i]));
      if (!same) fail(`street dressing (${region}/${variant}): two samples differ`);
      let bent = 0;
      let turned = 0;
      const p = dressed.position;
      const n = dressed.normal;
      for (let t = 0; t < p.length; t += 9) {
        const ux = p[t + 3]! - p[t]!, uy = p[t + 4]! - p[t + 1]!, uz = p[t + 5]! - p[t + 2]!;
        const vx = p[t + 6]! - p[t]!, vy = p[t + 7]! - p[t + 1]!, vz = p[t + 8]! - p[t + 2]!;
        const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
        const length = Math.hypot(cx, cy, cz);
        for (let k = 0; k < 9; k += 3) {
          const size = Math.hypot(n[t + k]!, n[t + k + 1]!, n[t + k + 2]!);
          if (!(Math.abs(size - 1) < 1e-4)) bent++;
          // On the side the winding says: a CC0 piece's normals are creased, welded across its curves.
          if (length > 0 && (cx * n[t + k]! + cy * n[t + k + 1]! + cz * n[t + k + 2]!) / length < 0.2) turned++;
        }
      }
      if (bent > 0) fail(`street dressing (${region}/${variant}): ${bent} normals are not a unit long`);
      if (turned > 0) fail(`street dressing (${region}/${variant}): ${turned} normals face away from their triangle's winding`);
      if (p.some((value) => !Number.isFinite(value))) fail(`street dressing (${region}/${variant}): a position is not a number`);
      // A mesh a colour and glow, as the one merged material tells them apart.
      const group = new THREE.Group();
      const byTint = new Map<string, number[]>();
      const colour = new THREE.Color();
      for (let v = 0; v < p.length / 3; v += 3) {
        colour.setRGB(dressed.color[v * 3]!, dressed.color[v * 3 + 1]!, dressed.color[v * 3 + 2]!);
        const key = `${colour.getHex()}/${dressed.glow[v * 2]}`;
        const list = byTint.get(key) ?? [];
        for (let k = 0; k < 9; k++) list.push(p[v * 3 + k]!);
        byTint.set(key, list);
      }
      for (const [key, list] of byTint) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(list, 3));
        const material = new THREE.MeshBasicMaterial();
        material.userData.atlasToon = Number(key.split('/')[0]);
        const mesh = new THREE.Mesh(geometry, material);
        const glow = Number(key.split('/')[1]);
        if (glow > 0) mesh.userData.atlasLit = glow;
        group.add(mesh);
      }
      const fights = fightsIn(group as never);
      for (const fight of fights) {
        fought++;
        if (fought <= 5) fail(`street dressing (${region}/${variant}): ${fight.a} and ${fight.b} share a plane at y ${fight.y.toFixed(2)}`);
      }
      group.traverse((object) => {
        if ((object as InstanceType<typeof THREE.Mesh>).isMesh) (object as InstanceType<typeof THREE.Mesh>).geometry.dispose();
      });
    }
  }
  if (fought > 5) fail(`street dressing: ${fought - 5} more z-fights`);
  console.log(`  ${pieces} pieces over ${DRESSING_REGIONS.length} regions, ${fought} z-fights; the dearest of each, in triangles:`);
  console.log(`  ${[...worst].map(([name, triangles]) => `${name} ${triangles}`).join(', ')}`);
}

console.log(failures === 0 ? '\nOK\n' : `\n${failures} failures\n`);
process.exit(failures === 0 ? 0 : 1);
