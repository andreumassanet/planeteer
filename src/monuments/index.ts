import * as THREE from 'three';
import { validate } from './contract.ts';
import type { Monument, MonumentContext } from './contract.ts';

export { TIERS, MAX_ASPECT, createContext, findFlaws, findUnsupported, measure, validate, paletteName } from './contract.ts';
export type {
  Flaw,
  Measurements,
  Monument,
  MonumentContext,
  MonumentTier,
  TierSpec,
} from './contract.ts';
// The four Three types a monument file may name. See the note beside them in
// `contract.ts`: there is no `THREE` namespace inside a monument.
export type { Group, Mesh, Object3D, Vector3 } from './contract.ts';

/**
 * The registry.
 *
 * Adding a monument is one file: drop `<id>.ts` (kebab-case) into this folder
 * exporting a `Monument`, and it is in the world. Anything that exports no
 * `Monument` lands in `SKIPPED`.
 *
 * A monument file:
 * 1. Imports from `./contract.ts` only: the `Monument` type, plus whichever of
 *    `MonumentContext`, `Group`, `Mesh`, `Object3D` and `Vector3` it needs to
 *    annotate helpers. It exports one `const` typed `Monument`. There is no `THREE`
 *    namespace (`ctx.THREE` is a value), so annotate with `Group` and import the type.
 * 2. Takes `iso`, `lat`, `lon` and the height from `scripts/monuments.source.json`,
 *    the placement authority. Where the source has no `height`, leave `realHeight` out.
 * 3. Builds in `build(ctx)` a `Group` made only from `ctx` helpers and `ctx.palette`
 *    colours, facing +Z, based at y = 0, inside `footprint`. Anything in a recess,
 *    courtyard or doorway wants a warm palette entry (see `palette` in
 *    `contract.ts`).
 * 4. Keeps `halfDiagonal / height` at 2 or under (see `MAX_ASPECT`): crop a long
 *    thing to a representative section and exaggerate the vertical, or squeeze the
 *    plan of a flat one.
 * 5. Passes `validate`, which only measures a bounding box; the real test is how it
 *    reads at thumbnail size, beside the Eiffel Tower, the Colosseum and Christ the
 *    Redeemer.
 */
const MODULES = import.meta.glob<Record<string, unknown>>(
  ['./*.ts', '!./contract.ts', '!./index.ts'],
  { eager: true },
);

function isMonument(value: unknown): value is Monument {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<Monument>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.iso === 'string' &&
    typeof candidate.lat === 'number' &&
    typeof candidate.lon === 'number' &&
    typeof candidate.tier === 'string' &&
    typeof candidate.build === 'function'
  );
}

/** Files in this folder that export no monument. Almost always a typo in an export. */
export const SKIPPED: string[] = [];

/** Registry-level complaints — things `validate` cannot see because they are about files. */
export const REGISTRY_PROBLEMS: string[] = [];

const collected: Monument[] = [];
const seen = new Map<string, string>();

for (const path of Object.keys(MODULES).sort()) {
  const found = Object.values(MODULES[path]!).filter(isMonument);
  if (found.length === 0) {
    SKIPPED.push(path);
    continue;
  }
  for (const monument of found) {
    const previous = seen.get(monument.id);
    if (previous !== undefined) {
      // A duplicate id would make `buildMonument` return the wrong building.
      throw new Error(`duplicate monument id '${monument.id}' in ${previous} and ${path}`);
    }
    seen.set(monument.id, path);
    // The file name must match the id.
    if (!path.endsWith(`/${monument.id}.ts`)) {
      REGISTRY_PROBLEMS.push(`${path} holds '${monument.id}' — the file should be ${monument.id}.ts`);
    }
    collected.push(monument);
  }
}

/** Every monument, sorted by id so every consumer agrees on order. */
export const MONUMENTS: readonly Monument[] = collected.sort((a, b) => a.id.localeCompare(b.id));

export function monument(id: string): Monument | undefined {
  return MONUMENTS.find((entry) => entry.id === id);
}

/** Builds a monument and throws if the group fails `validate`. */
export function buildMonument(id: string, ctx: MonumentContext): THREE.Group {
  const entry = monument(id);
  if (!entry) throw new Error(`no monument '${id}'`);

  const group = entry.build(ctx);
  const problems = validate(entry, group);
  if (problems.length > 0) {
    throw new Error(`monument '${id}' breaks the contract:\n  - ${problems.join('\n  - ')}`);
  }
  group.name = `monument:${id}`;
  return group;
}

