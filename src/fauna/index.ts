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
import { KINDS,  } from './contract.ts';
import type { Animal,  } from './contract.ts';

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

