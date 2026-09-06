import * as THREE from 'three';
import {
  KINDS,
  VARIANTS,
  extentOf,
  measure,
  silhouetteOf,
  validateVehicle,
  variantRng,
  varietyOf,
} from './contract.ts';
import type { Extent, Measurements, TrafficContext, TrafficStyle, Variety, Vehicle } from './contract.ts';
import { TRAFFIC_STYLES } from './regions.ts';

export {
  KINDS,
  VARIANTS,
  TRAFFIC_SCALE,
  SCENERY_SCALE,
  STOREY,
  AVATAR_HEIGHT,
  RIDER_SCALE,
  RIDER_HEIGHT,
  PLACED_SECTION,
  PLACED_LENGTH_CAP,
  placedScale,
  placedSize,
  RIDER,
  SEATED,
  seatedDrift,
  WHEEL_SIDES,
  SAME_SHAPE,
  LEGIBLE_AT,
  createTrafficContext,
  extentOf,
  measure,
  paletteName,
  mountProblems,
  silhouetteOf,
  silhouetteOverlap,
  validateVehicle,
  variantRng,
  varietyOf,
  passesOn,
  fitsOn,
  rngFrom,
  seedOf,
} from './contract.ts';
export type {
  Extent,
  KindSpec,
  Measurements,
  Medium,
  Mount,
  RiderPose,
  SolidSpec,
  TrafficContext,
  TrafficStyle,
  Variety,
  Vehicle,
  VehicleKind,
  CrowdBody,
} from './contract.ts';
export type { Group, Mesh, Object3D, Vector3, Rng, Weighted } from './contract.ts';
export { TRAFFIC_STYLES, TRAFFIC_REGION_IDS, MISSING_REGIONS, trafficFor, sceneryFor } from './regions.ts';
export type { RegionId } from './regions.ts';

/**
 * The registry.
 *
 * Same trick as the monument and scenery registries and for the same reason:
 * **adding a vehicle is one file and nothing else.** Drop `tram.ts` into
 * `parts/` exporting a `Vehicle` and it is in the kit, on the sheet, and
 * available to every region table that names it.
 *
 * Writing one, end to end:
 *
 * 1. `src/traffic/parts/<id>.ts`, named after the kebab-case id.
 * 2. Import from `../contract.ts` and nowhere else. There is no `THREE`
 *    namespace in a part file — `ctx.THREE` is a value — so annotate helpers
 *    with the re-exported `Group`, `Mesh`, `Object3D` and `Vector3` types.
 * 3. `build(ctx, rng, style)` returns **one variant**: facing +Z, based at
 *    y = 0 (the waterline for a craft), centred on its own origin, coloured only
 *    out of `style` through `ctx.toon`.
 * 4. Declare `size` as `[length, width, height]` and mean it. It is the contract
 *    with whoever puts the thing on a road, and `validateVehicle` holds every
 *    variant to it from both sides — too big fails, and so does comfortably too
 *    small, because a placer that reserves nine units for a six-unit van refuses
 *    lanes the van fits.
 * 5. Declare `mounts` if a rider would be visible on it. A car's driver is
 *    behind glass at every distance a car is seen from and does not need one; a
 *    bicycle with nobody on it is a ghost.
 * 6. Open `/traffic-sheet.html`. Read the *street* row before the turntable: a
 *    vehicle alone is a model and a vehicle at a kerb beside a house is the
 *    thing that will actually be shipped.
 */
const MODULES = import.meta.glob<Record<string, unknown>>('./parts/*.ts', { eager: true });

function isVehicle(value: unknown): value is Vehicle {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<Vehicle>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.kind === 'string' &&
    Array.isArray(candidate.size) &&
    candidate.size.length === 3 &&
    typeof candidate.build === 'function'
  );
}

/** Files in `parts/` that export no vehicle. Almost always a typo in an export. */
export const SKIPPED: string[] = [];

/** Complaints about files rather than about geometry. */
export const REGISTRY_PROBLEMS: string[] = [];

const collected: Vehicle[] = [];
const seen = new Map<string, string>();

for (const path of Object.keys(MODULES).sort()) {
  const found = Object.values(MODULES[path]!).filter(isVehicle);
  if (found.length === 0) {
    SKIPPED.push(path);
    continue;
  }
  for (const vehicle of found) {
    const previous = seen.get(vehicle.id);
    if (previous !== undefined) {
      // A region table names vehicles by id, so two under one id means a street
      // silently builds the wrong one. Refuse to start.
      throw new Error(`duplicate vehicle id '${vehicle.id}' in ${previous} and ${path}`);
    }
    seen.set(vehicle.id, path);
    if (!path.endsWith(`/${vehicle.id}.ts`)) {
      REGISTRY_PROBLEMS.push(`${path} holds '${vehicle.id}' — the file should be ${vehicle.id}.ts`);
    }
    if (!(vehicle.kind in KINDS)) {
      REGISTRY_PROBLEMS.push(
        `'${vehicle.id}' has kind '${vehicle.kind}', which is not one of ${Object.keys(KINDS).join(', ')}`,
      );
    }
    collected.push(vehicle);
  }
}

export const VEHICLES: readonly Vehicle[] = collected.sort((a, b) => a.id.localeCompare(b.id));

export function vehicle(id: string): Vehicle | undefined {
  return VEHICLES.find((entry) => entry.id === id);
}

/** Every id any region names, and whether the kit has it. */
export function namedByRegions(): { known: Set<string>; unknown: string[] } {
  const known = new Set<string>();
  const unknown: string[] = [];
  for (const style of Object.values(TRAFFIC_STYLES)) {
    for (const list of [style.road, style.water, style.air]) {
      for (const entry of list) {
        if (vehicle(entry.item)) known.add(entry.item);
        else if (!unknown.includes(entry.item)) unknown.push(entry.item);
      }
    }
  }
  return { known, unknown };
}

/**
 * Builds one variant, or refuses to.
 *
 * Refusing matters here for the same reason it does in the scenery kit: a
 * vehicle that breaks the contract is broken everywhere the region table names
 * it, which is a continent. It matters slightly more, because the thing most
 * likely to be wrong is the declared `size` and the consequence of a wrong one
 * is a bus in a hedge rather than a bus that looks odd.
 */
export function buildVariant(
  id: string,
  ctx: TrafficContext,
  style: TrafficStyle,
  variant: number,
): THREE.Group {
  const entry = vehicle(id);
  if (!entry) throw new Error(`no vehicle '${id}'`);
  const group = entry.build(ctx, variantRng(entry, style, variant), style);
  const problems = validateVehicle(entry, group);
  if (problems.length > 0) {
    throw new Error(`vehicle '${id}' breaks the contract:\n  - ${problems.join('\n  - ')}`);
  }
  group.name = `vehicle:${id}:${style.id}:${variant}`;
  return group;
}

export interface VehicleReview {
  vehicle: Vehicle;
  style: TrafficStyle;
  /** One built group per variant, in variant order. */
  groups: THREE.Group[];
  measurements: Measurements[];
  extents: Extent[];
  variety: Variety;
  problems: string[];
}

/**
 * Builds every variant, measures them, and collects every complaint.
 *
 * The determinism check is **stronger than the scenery sheet's** and it is worth
 * saying why, because the sheet is the only place a `Math.random()` can be
 * caught. `reviewPart` rebuilds variant 0 and compares triangle count, height
 * and radius; that misses a part which shuffles a colour, moves a wheel, or
 * mirrors itself, because none of those changes any of the three. This compares
 * the position buffers **byte for byte** and the colour list with them, so the
 * only stray randomness it can miss is one that produces an identical model.
 */
export function reviewVehicle(
  entry: Vehicle,
  ctx: TrafficContext,
  style: TrafficStyle,
  count = VARIANTS,
): VehicleReview {
  const groups: THREE.Group[] = [];
  const measurements: Measurements[] = [];
  const extents: Extent[] = [];
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
    for (const problem of validateVehicle(entry, group)) add(`variant ${variant}: ${problem}`);
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
    again.traverse((object) => {
      const mesh = object as THREE.Mesh;
      // Materials are shared with every other vehicle; only the geometry is ours.
      if (mesh.isMesh) mesh.geometry.dispose();
    });
  } catch (error) {
    add(`build() threw on its second call: ${String(error)}`);
  }

  const variety = varietyOf(groups, measurements);
  if (groups.length > 1 && variety.shapes === 1 && variety.palettes === 1) {
    add(`all ${groups.length} variants are the same model in the same colours — the seed is doing nothing`);
  }

  return { vehicle: entry, style, groups, measurements, extents, variety, problems };
}

/**
 * Every vertex of a built group, in group space, plus the colour it is drawn in.
 *
 * The order matters and is deliberately not sorted: two builds that place the
 * same meshes in a different order are a different model to anything that draws
 * them, and a fingerprint that forgave it would forgive the bug it exists to
 * find.
 */
function fingerprint(group: THREE.Group): string {
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

/**
 * How distinct the kit actually is, across every vehicle rather than within one.
 *
 * The pairwise side-elevation overlap of variant 0 of each vehicle, in one
 * table. **This is the answer to "several distinct car models rather than one
 * car recoloured", and it is a measurement rather than a claim** — two vehicles
 * over `SAME_SHAPE` are two names for one silhouette and one of them should be
 * deleted or changed.
 */
export function distinctness(
  ctx: TrafficContext,
  style: TrafficStyle,
  list: readonly Vehicle[] = VEHICLES,
): { ids: string[]; overlap: number[][]; clashes: [string, string, number][] } {
  const ids: string[] = [];
  const signatures: Uint8Array[] = [];
  for (const entry of list) {
    try {
      const group = entry.build(ctx, variantRng(entry, style, 0), style);
      ids.push(entry.id);
      signatures.push(silhouetteOf(group));
    } catch {
      // A vehicle that will not build is already reported by `reviewVehicle`.
    }
  }
  const overlap = signatures.map((a) => signatures.map((b) => overlapOf(a, b)));
  const clashes: [string, string, number][] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const value = overlap[i]![j]!;
      if (value > 0.9) clashes.push([ids[i]!, ids[j]!, value]);
    }
  }
  clashes.sort((a, b) => b[2] - a[2]);
  return { ids, overlap, clashes };
}

function overlapOf(a: Uint8Array, b: Uint8Array): number {
  let both = 0;
  let either = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] || b[i]) either++;
    if (a[i] && b[i]) both++;
  }
  return either === 0 ? 1 : both / either;
}
