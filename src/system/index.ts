/**
 * The registry: every body, every species, every decoration, one file each.
 *
 * Same trick as the monument, scenery and traffic registries and for the same
 * reason: **adding a world is one file and nothing else.** Drop `io.ts` into
 * `bodies/` exporting a `Body` and it is in the system, on the orrery, and in
 * whatever menu lists it.
 *
 * **Nothing in the initial graph may import this**, and that is the one rule
 * this file has that the other three registries do not. Earth is the detailed
 * one, its first load is 244 KB of code over ten chunks, and the bundle trap
 * measured what a module in the initial graph costs: it is fetched *and parsed*
 * before `start()` runs, so at 250 KB/s the twelve-chunk version did not ask for
 * the first byte of data until 1,709 ms. Everything here belongs behind an
 * `import()` fired when a body other than Earth is chosen — the shape
 * `main.ts`'s `deferred` block already uses, and after `loadWorld` rather than
 * at the top of `start()`, because that is when the network is idle and the
 * main thread is not.
 *
 * ---
 *
 * # What a menu needs from this file
 *
 * The start menu is becoming **planet -> country -> city**, and the three steps
 * map onto three things here and nothing else:
 *
 * - **`BODIES`** — id, name, `kind`, `blurb`, `look.surface` for the disc, and
 *   `radiusKm` for the size. Ordered by distance from the Sun, so a menu can
 *   list them in the order a diagram would draw them.
 * - **`Body.nations`** — id, name, `lat`/`lon`, `radius` in degrees, `color`,
 *   `note`. A cap rather than an outline, which is what lets a menu draw a
 *   country on a sphere without a `countries.bin` for that world. **Earth's is
 *   empty on purpose**: there the menu should ask `geo.ts`, which is exact over
 *   real cartography.
 * - **`Body.settlements`** — id, name, `lat`/`lon`, `population`, `nation`.
 *   Same shape `places.bin` decodes into, so a menu written against Earth's
 *   places works unchanged. Earth's is empty for the same reason.
 *
 * and one function, `positionOf(id, date)`, if the menu wants to draw the
 * system as it actually is today rather than as a diagram.
 *
 * Two things a menu must **not** have to know. It must not know the scale —
 * `drawnRadiusOf` and `AU_UNITS` are in the contract and are the orrery's
 * business. And it must not know whether a body is walkable yet: `walkable`
 * below answers that from the data (`ground !== null`), so a menu greys out
 * the Sun without a hard-coded list.
 */

import type { Body, Decoration, Species } from './contract.ts';
import { drawnRadiusOf, SUN_DRAWN, systemPosition, validateBody } from './contract.ts';
import type { Vec3 } from './contract.ts';
import { heliocentric } from './orbits.ts';

export * from './contract.ts';
export { fbm, ridged, onSphere, alignment } from './noise.ts';
export { makeGround, reliefBudget, RELIEF_CEILING } from './ground.ts';
export type { GroundSpec, Landform, Province } from './ground.ts';
export { buildAlien, alienFor, ALIEN_POSES } from './alien.ts';
export type { AlienOptions } from './alien.ts';
export {
  ELEMENTS,
  apparentMagnitude,
  elementsAt,
  geocentric,
  heliocentric,
  moonPosition,
  orbitPath,
  periodOf,
  ringTilt,
  julianDay,
  centuriesSince2000,
} from './orbits.ts';
export type { Elements, Geocentric, Heliocentric, Lunar, OrbitalElements } from './orbits.ts';

const BODY_MODULES = import.meta.glob<Record<string, unknown>>('./bodies/*.ts', { eager: true });
const PART_MODULES = import.meta.glob<Record<string, unknown>>('./parts/*.ts', { eager: true });

function isBody(value: unknown): value is Body {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Partial<Body>;
  return typeof c.id === 'string' && typeof c.name === 'string' && typeof c.radiusKm === 'number';
}

function isDecoration(value: unknown): value is Decoration {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Partial<Decoration>;
  return typeof c.id === 'string' && typeof c.footprint === 'number' && typeof c.build === 'function';
}

/** Complaints about files rather than about geometry. See the other registries. */
export const REGISTRY_PROBLEMS: string[] = [];

const bodies: Body[] = [];
const species = new Map<string, Species>();
for (const [path, module] of Object.entries(BODY_MODULES)) {
  let found = 0;
  for (const value of Object.values(module)) {
    if (isBody(value)) {
      bodies.push(value);
      found++;
    }
  }
  const speciesList = (module as { SPECIES?: readonly Species[] }).SPECIES;
  if (Array.isArray(speciesList)) {
    for (const one of speciesList) {
      if (species.has(one.id)) REGISTRY_PROBLEMS.push(`two species called '${one.id}'`);
      species.set(one.id, one);
    }
  }
  if (found === 0) REGISTRY_PROBLEMS.push(`${path} exports no Body`);
  if (found > 1) REGISTRY_PROBLEMS.push(`${path} exports ${found} bodies — one file, one world`);
}

const decorations: Decoration[] = [];
for (const [path, module] of Object.entries(PART_MODULES)) {
  let found = 0;
  for (const value of Object.values(module)) {
    if (isDecoration(value)) {
      decorations.push(value);
      found++;
    }
  }
  if (found === 0) REGISTRY_PROBLEMS.push(`${path} exports no Decoration`);
}

/**
 * The order is the one a diagram would draw, and it is derived rather than
 * written down: the Sun first because it is the origin, then everything else by
 * its own semi-major axis. A hand-written order is a second copy of a fact the
 * elements already carry.
 */
const orderOf = (body: Body): number =>
  body.orbit === null ? -1 : heliocentric(body.orbit, new Date(0)).r;

export const BODIES: readonly Body[] = bodies.sort((a, b) => orderOf(a) - orderOf(b));
export const SPECIES: ReadonlyMap<string, Species> = species;
export const DECORATIONS: readonly Decoration[] = decorations.sort((a, b) => a.id.localeCompare(b.id));

export const body = (id: string): Body | undefined => BODIES.find((one) => one.id === id);

/**
 * Which decorations may stand on this world.
 *
 * `bodies: []` means anywhere, which is the same convention `nativeHere` uses
 * on Earth for a plant with no range map — *biome says what grows, region says
 * whose it is, and a species not named there grows wherever its biome puts it.*
 */
export const decorationsFor = (bodyId: string): readonly Decoration[] =>
  DECORATIONS.filter((part) => part.bodies.length === 0 || part.bodies.includes(bodyId));

/** Whether there is ground to stand on. The menu's own test; see the note above. */
export const walkable = (body: Body): boolean => body.ground !== null || body.id === 'earth';

/** Where a body is, in the orrery's own frame and units, at an instant. */
export function positionOf(id: string, date: Date): Vec3 {
  const found = body(id);
  if (found === undefined) throw new Error(`no body '${id}'`);
  if (found.orbit === null) return { x: 0, y: 0, z: 0 };
  return systemPosition(found.orbit, date);
}

/** What a body is drawn at in the orrery. The Sun is off the law; see the contract. */
export const drawnRadius = (body: Body): number =>
  body.kind === 'star' ? SUN_DRAWN : drawnRadiusOf(body.radiusKm);

/** Everything wrong with the registry, for the check script and the sheets. */
export function registryProblems(): string[] {
  const problems = [...REGISTRY_PROBLEMS];
  const ids = new Set<string>();
  for (const one of BODIES) {
    if (ids.has(one.id)) problems.push(`two bodies called '${one.id}'`);
    ids.add(one.id);
    for (const problem of validateBody(one)) problems.push(`${one.id}: ${problem}`);
    if (one.species !== null && !species.has(one.species)) {
      problems.push(`${one.id} names species '${one.species}' and no file declares it`);
    }
    if (one.ground !== null) {
      const named = new Set<string>();
      for (const biome of Object.values(one.ground.biomes)) for (const part of biome.parts) named.add(part);
      const available = new Set(decorationsFor(one.id).map((part) => part.id));
      for (const part of named) {
        if (!available.has(part)) problems.push(`${one.id} names decoration '${part}', which cannot stand there`);
      }
    }
  }
  const claimed = new Set<string>();
  for (const one of BODIES) {
    if (one.ground === null) continue;
    for (const biome of Object.values(one.ground.biomes)) for (const part of biome.parts) claimed.add(part);
  }
  for (const part of DECORATIONS) {
    if (!claimed.has(part.id)) problems.push(`nothing will ever build '${part.id}' — no biome names it`);
  }
  return problems;
}
