/**
 * The registry.
 *
 * The same trick as the monument, scenery and traffic registries and for the
 * same reason: **adding an animal is one file and nothing else.** Drop `goat.ts`
 * into `parts/` exporting an `Animal` and it is in the kit, in the check, and
 * available to every table that names it.
 *
 * Writing one, end to end:
 *
 * 1. `src/fauna/parts/<id>.ts`, named after the kebab-case id.
 * 2. Import from `../contract.ts` and `../body.ts` and nowhere else.
 * 3. Export a `shape(rng, style)` returning proportions **in metres**, and an
 *    `Animal` whose `build` is `buildAnimal(ctx, shape(rng, style), { kind:
 *    'stand' }).group`. The pose is the placer's, not the part's — see the note
 *    on `Animal`.
 * 4. Declare `size` as `[length, width, height]` in **world units** and mean it.
 *    `validateAnimal` holds every variant to it from both sides, and the number
 *    to put there is the one `pnpm fauna` prints: build first, declare second.
 * 5. Add it to `BY_BIOME` in `regions.ts` — a climate, never a country — and to
 *    `RANGE` only if it would be wrong somewhere.
 * 6. Run `pnpm fauna`. Read the **silhouette** before the table: an animal that
 *    measures correctly and does not look like itself is the failure this whole
 *    kit exists to avoid, and it is the one the numbers cannot see.
 */
import * as THREE from 'three';
import { KINDS, VARIANTS, extentOf, measure, validateAnimal, variantRng } from './contract.ts';
import type { Animal, Extent, FaunaContext, FaunaStyle, Measurements } from './contract.ts';
import { BY_BIOME, FAUNA_STYLES } from './regions.ts';

export * from './contract.ts';
export * from './regions.ts';
export { buildAnimal, legsOf, poseBody, hooves, strideOf } from './body.ts';
export type { Body, Pose, Shape } from './body.ts';

const MODULES = import.meta.glob<Record<string, unknown>>('./parts/*.ts', { eager: true });

function isAnimal(value: unknown): value is Animal {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<Animal>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.kind === 'string' &&
    Array.isArray(candidate.size) &&
    candidate.size.length === 3 &&
    typeof candidate.shape === 'function' &&
    typeof candidate.build === 'function'
  );
}

/** Files in `parts/` that export no animal. Almost always a typo in an export. */
export const SKIPPED: string[] = [];

/** Complaints about files rather than about geometry. */
export const REGISTRY_PROBLEMS: string[] = [];

const collected: Animal[] = [];
const seen = new Map<string, string>();

for (const path of Object.keys(MODULES).sort()) {
  const found = Object.values(MODULES[path]!).filter(isAnimal);
  if (found.length === 0) {
    SKIPPED.push(path);
    continue;
  }
  for (const entry of found) {
    const previous = seen.get(entry.id);
    if (previous !== undefined) {
      // A biome table names animals by id, so two under one id means a whole
      // climate silently builds the wrong one. Refuse to start.
      throw new Error(`duplicate animal id '${entry.id}' in ${previous} and ${path}`);
    }
    seen.set(entry.id, path);
    if (!path.endsWith(`/${entry.id}.ts`)) {
      REGISTRY_PROBLEMS.push(`${path} holds '${entry.id}' — the file should be ${entry.id}.ts`);
    }
    if (!(entry.kind in KINDS)) {
      REGISTRY_PROBLEMS.push(
        `'${entry.id}' has kind '${entry.kind}', which is not one of ${Object.keys(KINDS).join(', ')}`,
      );
    }
    collected.push(entry);
  }
}

export const ANIMALS: readonly Animal[] = collected.sort((a, b) => a.id.localeCompare(b.id));

export function animal(id: string): Animal | undefined {
  return ANIMALS.find((entry) => entry.id === id);
}

/**
 * Every id the two tables name, and whether the kit has it.
 *
 * **Both tables, not one**, and the scenery sheet's own orphan banner is the
 * reason: it decided a part was unbuildable by looking through the region styles
 * alone, and since `biome.ts` arrived there was a second table that places
 * parts — so it declared the entire wild flora unbuildable while it was standing
 * across Africa. This kit has the same two, in the same file, and asks both.
 */
export function namedByTables(): { known: Set<string>; unknown: string[]; orphans: string[] } {
  const known = new Set<string>();
  const unknown: string[] = [];
  const note = (id: string): void => {
    if (animal(id)) known.add(id);
    else if (!unknown.includes(id)) unknown.push(id);
  };
  for (const list of Object.values(BY_BIOME)) for (const entry of list) note(entry.item);
  for (const style of Object.values(FAUNA_STYLES)) for (const entry of style.stock) note(entry.item);
  const orphans = ANIMALS.filter((entry) => !known.has(entry.id)).map((entry) => entry.id);
  return { known, unknown, orphans };
}

/** Builds one variant, or refuses to. */
export function buildVariant(id: string, ctx: FaunaContext, style: FaunaStyle, variant: number): THREE.Group {
  const entry = animal(id);
  if (!entry) throw new Error(`no animal '${id}'`);
  const group = entry.build(ctx, variantRng(entry, style, variant), style);
  const problems = validateAnimal(entry, group);
  if (problems.length > 0) {
    throw new Error(`animal '${id}' breaks the contract:\n  - ${problems.join('\n  - ')}`);
  }
  group.name = `animal:${id}:${style.id}:${variant}`;
  return group;
}

export interface AnimalReview {
  animal: Animal;
  style: FaunaStyle;
  groups: THREE.Group[];
  measurements: Measurements[];
  extents: Extent[];
  problems: string[];
}

/**
 * Builds every variant, measures them, and collects every complaint.
 *
 * The determinism check compares the position buffers **byte for byte** rather
 * than comparing a triangle count and a height, which is the traffic sheet's
 * standard and the reason is theirs: the weaker test misses a part that shuffles
 * a colour, moves a leg or mirrors itself, because none of those changes any of
 * the three.
 */
export function reviewAnimal(entry: Animal, ctx: FaunaContext, style: FaunaStyle, count = VARIANTS): AnimalReview {
  const groups: THREE.Group[] = [];
  const measurements: Measurements[] = [];
  const extents: Extent[] = [];
  const problems: string[] = [];
  const add = (problem: string): void => {
    if (!problems.includes(problem)) problems.push(problem);
  };

  for (let variant = 0; variant < count; variant++) {
    let group: THREE.Group;
    try {
      group = entry.build(ctx, variantRng(entry, style, variant), style);
    } catch (error) {
      add(`build() threw on variant ${variant}: ${String(error)}`);
      continue;
    }
    for (const problem of validateAnimal(entry, group)) add(`variant ${variant}: ${problem}`);
    groups.push(group);
    measurements.push(measure(group));
    extents.push(extentOf(group));
  }

  try {
    const again = entry.build(ctx, variantRng(entry, style, 0), style);
    const first = groups[0];
    if (first !== undefined && fingerprint(again) !== fingerprint(first)) {
      add('build() is not deterministic — same seed, two different models. No Math.random(), no Date.');
    }
  } catch (error) {
    add(`build() threw on its second call: ${String(error)}`);
  }

  return { animal: entry, style, groups, measurements, extents, problems };
}

/** Every vertex of a built group in group space, plus the colour it is drawn in. */
export function fingerprint(group: THREE.Group): string {
  group.updateMatrixWorld(true);
  const toLocal = group.matrixWorld.clone().invert();
  const matrix = new THREE.Matrix4();
  const vertex = new THREE.Vector3();
  const parts: string[] = [];
  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    parts.push(`#${material?.userData.atlasToon ?? 'none'}`);
    const position = mesh.geometry.getAttribute('position');
    matrix.multiplyMatrices(toLocal, mesh.matrixWorld);
    for (let i = 0; i < position.count; i++) {
      vertex.fromBufferAttribute(position, i).applyMatrix4(matrix);
      parts.push(`${vertex.x.toFixed(4)},${vertex.y.toFixed(4)},${vertex.z.toFixed(4)}`);
    }
  });
  return parts.join('|');
}
