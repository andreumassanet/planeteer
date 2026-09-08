import * as THREE from 'three';
import { KINDS, measure, validatePart, variantRng, varietyOf, VARIANTS } from './contract.ts';
import type { Measurements, RegionStyle, ScenicPart, SceneryContext, Variety } from './contract.ts';

export {
  KINDS,
  VARIANTS,
  STOREY,
  SCENERY_SCALE,
  AVATAR_HEIGHT,
  LEGIBLE_AT,
  createSceneryContext,
  measure,
  paletteName,
  validatePart,
  variantRng,
  varietyOf,
} from './contract.ts';
export type {
  KindSpec,
  Measurements,
  PartKind,
  RegionStyle,
  SceneryContext,
  ScenicPart,
  Variety,
} from './contract.ts';
export type { Group, Mesh, Object3D, Vector3 } from './contract.ts';
export type { Rng, Weighted } from './random.ts';
export { rngFrom, seedOf } from './random.ts';
export { REGIONS, REGION_IDS, ISO_REGIONS, CONTINENT_REGIONS, NATIVE_TO, nativeHere, regionFor, isoCodesFor, POLAR_LATITUDE } from './regions.ts';
export type { RegionId } from './regions.ts';
export { plots, hamlet } from './layout.ts';
export type { Plot, Placed } from './layout.ts';
export {
  BODY,
  CHILD_BODY,
  POSES,
  SEATED_POSES,
  PEOPLE_VARIANTS,
  buildPerson,
  crowd,
  heroLook,
  personPool,
} from './people.ts';
export type {
  Age,
  Bystander,
  Carry,
  Figure,
  Garment,
  Hair,
  Headwear,
  Look,
  Pose,
  Sleeves,
} from './people.ts';
export {
  CROWD_MIX,
  DRESS,
  DRESS_IDS,
  PEOPLE_PART_IDS,
  SKIN_TONES,
  dressFor,
  lookFor,
  sameBodyEverywhere,
} from './dress.ts';
export type { DressStyle, LookOptions } from './dress.ts';

/**
 * The registry.
 *
 * Same trick as the monument registry and for the same reason: **adding a part
 * is one file and nothing else.** Drop `windmill.ts` into `parts/` exporting a
 * `ScenicPart` and it is in the kit, on the sheet, and available to every region
 * table that names it.
 *
 * The parts live in their own folder rather than beside the contract, so the
 * glob needs no exclusion list — which is the small difference from
 * `src/monuments/index.ts`, where four support files have to be spelled out and
 * a fifth would silently be treated as a monument.
 *
 * Writing one, end to end:
 *
 * 1. `src/scenery/parts/<id>.ts`, named after the kebab-case id.
 * 2. Import from `../contract.ts` and nowhere else. There is no `THREE`
 *    namespace in a part file — `ctx.THREE` is a value — so annotate helpers
 *    with the re-exported `Group`, `Mesh`, `Object3D` and `Vector3` types.
 * 3. `build(ctx, rng, style)` returns **one variant**: facing +Z, based at
 *    y = 0, inside `footprint`, coloured only out of `style` through `ctx.toon`.
 *    Every choice comes from `rng`; anything from `Math.random()` or `Date` is
 *    caught by the sheet, which builds each variant twice and compares.
 * 4. Decide what varies between *variants* (roofs, storeys, chimneys — anything
 *    structural) and what is left to the *instance* (position, yaw, a uniform
 *    scale). The line is not stylistic: see `VARIANTS` in the contract for why
 *    per-instance geometry cannot be drawn efficiently at all.
 * 5. Open `/sheets/scenery.html`. Read it at 120 units before you read it at 40:
 *    a part that only works close up is a part nobody will ever see working.
 *    Then turn on the cluster and look for the thing you cannot see in one
 *    thumbnail, which is the only failure that matters here — nine of them in a
 *    row that read as one house copied nine times.
 */
const MODULES = import.meta.glob<Record<string, unknown>>('./parts/*.ts', { eager: true });

function isPart(value: unknown): value is ScenicPart {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<ScenicPart>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.kind === 'string' &&
    typeof candidate.footprint === 'number' &&
    typeof candidate.build === 'function'
  );
}

/** Files in `parts/` that export no part. Almost always a typo in an export. */
export const SKIPPED: string[] = [];

/** Complaints about files rather than about geometry. */
export const REGISTRY_PROBLEMS: string[] = [];

const collected: ScenicPart[] = [];
const seen = new Map<string, string>();

for (const path of Object.keys(MODULES).sort()) {
  const found = Object.values(MODULES[path]!).filter(isPart);
  if (found.length === 0) {
    SKIPPED.push(path);
    continue;
  }
  for (const part of found) {
    const previous = seen.get(part.id);
    if (previous !== undefined) {
      // A region table names parts by id, so two parts under one id means a
      // village silently builds the wrong one. Refuse to start.
      throw new Error(`duplicate part id '${part.id}' in ${previous} and ${path}`);
    }
    seen.set(part.id, path);
    if (!path.endsWith(`/${part.id}.ts`)) {
      REGISTRY_PROBLEMS.push(`${path} holds '${part.id}' — the file should be ${part.id}.ts`);
    }
    if (!(part.kind in KINDS)) {
      REGISTRY_PROBLEMS.push(`'${part.id}' has kind '${part.kind}', which is not one of ${Object.keys(KINDS).join(', ')}`);
    }
    collected.push(part);
  }
}

export const PARTS: readonly ScenicPart[] = collected.sort((a, b) => a.id.localeCompare(b.id));

export function part(id: string): ScenicPart | undefined {
  return PARTS.find((entry) => entry.id === id);
}

/**
 * Builds one variant, or refuses to.
 *
 * Refusing matters more here than it does for a monument. A monument that breaks
 * the contract is one broken building in one place; a part that breaks it is
 * broken everywhere the region table names it, which is a continent.
 */
export function buildVariant(
  id: string,
  ctx: SceneryContext,
  style: RegionStyle,
  variant: number,
): THREE.Group {
  const entry = part(id);
  if (!entry) throw new Error(`no scenery part '${id}'`);
  const group = entry.build(ctx, variantRng(entry, style, variant), style);
  const problems = validatePart(entry, group);
  if (problems.length > 0) {
    throw new Error(`part '${id}' breaks the contract:\n  - ${problems.join('\n  - ')}`);
  }
  group.name = `part:${id}:${style.id}:${variant}`;
  return group;
}

export interface PartReview {
  part: ScenicPart;
  style: RegionStyle;
  /** One built group per variant, in variant order. */
  groups: THREE.Group[];
  measurements: Measurements[];
  variety: Variety;
  problems: string[];
}

/**
 * Builds every variant, measures them, and collects every complaint — the
 * sheet's version, which reports a broken part instead of propagating it. One
 * bad file must not blank the page you were going to use to find it.
 */
export function reviewPart(
  entry: ScenicPart,
  ctx: SceneryContext,
  style: RegionStyle,
  count = VARIANTS,
): PartReview {
  const groups: THREE.Group[] = [];
  const measurements: Measurements[] = [];
  const problems: string[] = [];
  const add = (problem: string) => {
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
    for (const problem of validatePart(entry, group)) add(`variant ${variant}: ${problem}`);
    groups.push(group);
    measurements.push(measure(group));
  }

  // Determinism, which `validatePart` cannot see because it only ever gets one
  // group. Rebuild variant 0 from the same seed and compare.
  try {
    const again = entry.build(ctx, variantRng(entry, style, 0), style);
    const second = measure(again);
    const first = measurements[0];
    if (
      first !== undefined &&
      (second.triangles !== first.triangles ||
        Math.abs(second.height - first.height) > 1e-9 ||
        Math.abs(second.radius - first.radius) > 1e-9)
    ) {
      add('build() is not deterministic — same seed, two different variants. No Math.random(), no Date.');
    }
    again.traverse((object) => {
      const mesh = object as THREE.Mesh;
      // Materials are shared with every other part; only the geometry is ours.
      if (mesh.isMesh) mesh.geometry.dispose();
    });
  } catch (error) {
    add(`build() threw on its second call: ${String(error)}`);
  }

  const variety = varietyOf(measurements);
  // The one check the monument contract has no equivalent of. Half the variants
  // sharing a silhouette is a part that is not really parametric, and it is
  // invisible in a single thumbnail.
  if (measurements.length > 1 && variety.shapes * 2 <= variety.samples) {
    add(`only ${variety.shapes} distinct silhouettes across ${variety.samples} variants — the seed is barely doing anything`);
  }
  if (measurements.length > 1 && variety.palettes === 1 && style.walls.length > 1) {
    add('every variant uses the same colours — the style offers more than one wall colour');
  }

  return { part: entry, style, groups, measurements, variety, problems };
}
