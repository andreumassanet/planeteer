/**
 * The animal registry: every `Animal` exported from a file in `parts/`.
 *
 * A part lives in `parts/<id>.ts`, imports only from `../contract.ts` and
 * `../body.ts`, exports a `shape(rng, style)` in metres and an `Animal` whose
 * `build` is `buildAnimal(ctx, shape(rng, style), { kind: 'stand' }).group`.
 * Its `size` is in world units (the one `pnpm fauna` prints), and it is listed
 * in `BY_BIOME` in `regions.ts` (and `RANGE` only if it would be wrong somewhere).
 */
import { KINDS } from './contract.ts';
import type { Animal } from './contract.ts';

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
      // Biome tables name animals by id, so a duplicate would build the wrong one.
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

