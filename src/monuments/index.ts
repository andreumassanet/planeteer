import * as THREE from 'three';
import { findFlaws, measure, validate } from './contract.ts';
import type { Flaw, Measurements, Monument, MonumentContext } from './contract.ts';

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
 * **Adding a monument is one file and nothing else.** Drop `taj-mahal.ts` into
 * this folder exporting a `Monument`, and it is in the world and on the contact
 * sheet. No line to add here, which matters because sixty of these are written
 * in parallel by agents who never see each other's work: a registry everyone has
 * to append to is a registry everyone collides in, and a monument that builds
 * perfectly but was never registered is the one failure nobody notices.
 *
 * The cost of the magic is that a file can go missing silently, so it does not:
 * anything in this folder that exports no `Monument` lands in `SKIPPED`, and the
 * contact sheet prints that list at the top.
 *
 * Adding one, end to end:
 *
 * 1. Create `src/monuments/<id>.ts`, named after the kebab-case id.
 * 2. Import from `./contract.ts` and from nowhere else: the `Monument` type,
 *    plus whichever of `MonumentContext`, `Group`, `Mesh`, `Object3D` and
 *    `Vector3` you need to annotate your own helpers. Export exactly one `const`
 *    typed `Monument`. **There is no `THREE` namespace in a monument file** —
 *    `ctx.THREE` is a value, not a namespace, so `: THREE.Group` will not
 *    compile. Write `: Group` and import the type.
 * 3. Take `iso`, `lat`, `lon` and the height from `scripts/monuments.source.json`
 *    — it is the placement authority and this file must agree with it. Where it
 *    has no `height`, **leave `realHeight` out**: it is optional, over half the
 *    list has none, and inventing one to fill the field is inventing a fact.
 * 4. `build(ctx)` returns a `Group` made only from `ctx` helpers and
 *    `ctx.palette` colours, facing +Z, based at y = 0, inside `footprint`.
 *    Anything that will sit in a recess, a courtyard, a doorway or behind
 *    columns wants a **warm** palette entry: read the note on `palette` in
 *    `contract.ts` for why a `bone` interior comes back reading as a hole, and
 *    why the white you want is `white`, not `bone`.
 * 5. Work out `halfDiagonal / height` before you plan anything: it must be 2 or
 *    under, and it is a half-*diagonal*, so an ordinary rectangular building can
 *    fail it. If the thing is over — a bridge, a wall, a cliff, a temple —
 *    crop to a representative section and **exaggerate the vertical** until it
 *    sits just under `MAX_ASPECT`, as the Golden Gate does at 2.3x. If instead
 *    it is too flat to read at its tier, squeeze the plan, as Stonehenge does at
 *    2:1. Read the note beside `MAX_ASPECT` in `contract.ts` before deciding,
 *    and put the numbers you chose in your file.
 * 6. Open `/contact-sheet.html`. A green card means it passes *mechanically*,
 *    and that is all it means: `validate` measures a bounding box, so a stick
 *    with a crossbar passes every check there is. The real gate is the
 *    thumbnail. Name the thing from it without reading the caption, and put it
 *    beside the Eiffel Tower, the Colosseum and Christ the Redeemer on the same
 *    sheet — **if yours is visibly barer than those three, it is not done.**
 *    Chunky and readable beats detailed, because the ink does the drawing; bare
 *    is a different thing from chunky, and it is what underspending looks like.
 *
 *    Optional, and meant to stay optional: several agents have written a small
 *    z-buffered software rasterizer in the scratchpad — `main.ts`'s four-step
 *    ramp and light rig, a couple of hundred lines — to render their own
 *    monument at true thumbnail size without waiting for a dozen siblings to
 *    stop reloading the sheet. It has changed real decisions: the Petronas piers
 *    went from `bone` to `white` because at that size the eight-pointed plan
 *    dissolved into one dark slab, and Hagia Sophia's buttresses were rebuilt
 *    after it showed them reading as free-standing posts. It is a heavy tool for
 *    a small question. Reach for it when the sheet is too busy to read, or when
 *    you cannot tell what a shape is doing at 260 pixels — not as a ritual.
 * 7. If you write a throwaway script to check something, **name it after your
 *    monument id** — `stonehenge-check.ts`, not `check.ts`. The scratchpad is
 *    shared with every other agent in the wave, and one of them has already had
 *    a `check.ts` overwritten underneath a running command.
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
      // Two monuments answering to one id means `buildMonument` silently returns
      // the wrong building. Better to refuse to start.
      throw new Error(`duplicate monument id '${monument.id}' in ${previous} and ${path}`);
    }
    seen.set(monument.id, path);
    // The folder is browsed by hand as often as it is imported; keep the name on
    // the tin.
    if (!path.endsWith(`/${monument.id}.ts`)) {
      REGISTRY_PROBLEMS.push(`${path} holds '${monument.id}' — the file should be ${monument.id}.ts`);
    }
    collected.push(monument);
  }
}

/** Every monument, sorted by id so the contact sheet and the world agree on order. */
export const MONUMENTS: readonly Monument[] = collected.sort((a, b) => a.id.localeCompare(b.id));

export function monument(id: string): Monument | undefined {
  return MONUMENTS.find((entry) => entry.id === id);
}

/**
 * Builds a monument, or refuses to.
 *
 * The contract is only worth having if something enforces it, and this is the
 * something: a group that fails `validate` never reaches the planet. Throwing
 * beats warning because a monument that floats twelve units above the ground is
 * not a degraded monument, it is a bug that survives to the screenshot.
 */
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

export interface Review {
  monument: Monument;
  group: THREE.Group;
  measurements: Measurements;
  /** Contract violations. Non-empty means `buildMonument` would refuse it. */
  problems: string[];
  /** Buried or floating parts: a warning for a person, never a refusal. */
  flaws: Flaw[];
}

/**
 * The same thing without the refusal: builds, measures and collects every
 * complaint so the contact sheet can show a broken monument next to what is
 * wrong with it. A monument that throws is reported, not propagated — one bad
 * file must not blank the sheet you were going to use to find it.
 */
export function reviewMonument(monument: Monument, ctx: MonumentContext): Review {
  let group: THREE.Group;
  try {
    group = monument.build(ctx);
  } catch (error) {
    return {
      monument,
      group: new THREE.Group(),
      measurements: measure(new THREE.Group()),
      problems: [`build() threw: ${String(error)}`],
      flaws: [],
    };
  }

  const problems = validate(monument, group);
  const measurements = measure(group);

  // Determinism is part of the contract and is invisible to `validate`, which
  // only ever sees one group. Build a second time and compare: `Math.random()`
  // in a monument would otherwise show up as a model that quietly differs
  // between the contact sheet and the planet.
  try {
    const again = monument.build(ctx);
    const second = measure(again);
    if (
      second.triangles !== measurements.triangles ||
      Math.abs(second.height - measurements.height) > 1e-9 ||
      Math.abs(second.radius - measurements.radius) > 1e-9
    ) {
      problems.push('build() is not deterministic — two builds differ. No Math.random(), no Date.');
    }
    again.traverse((object) => {
      const mesh = object as THREE.Mesh;
      // Materials are shared with the first build; only the geometry is ours.
      if (mesh.isMesh) mesh.geometry.dispose();
    });
  } catch (error) {
    problems.push(`build() threw on its second call: ${String(error)}`);
  }

  return { monument, group, measurements, problems, flaws: findFlaws(group) };
}
