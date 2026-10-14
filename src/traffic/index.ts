import * as THREE from 'three';
import { KINDS } from './contract.ts';
import type { Extent, Measurements, TrafficStyle, Variety, Vehicle } from './contract.ts';

export {
  KINDS,
  VARIANTS,
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
  WHEEL_SIDES,
  SAME_SHAPE,
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
  isGlass,
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
  VehicleFit,
  VehicleKind,
  CrowdBody,
} from './contract.ts';
export type { Group, Mesh, Object3D, Vector3, Rng, Weighted } from './contract.ts';
export { TRAFFIC_STYLES, MISSING_REGIONS, trafficFor } from './regions.ts';
export type { RegionId } from './regions.ts';

/**
 * The vehicle registry: every `Vehicle` exported from a file in `parts/`.
 *
 * A part lives in `parts/<id>.ts`, imports only from `../contract.ts` (use
 * `ctx.THREE` and the re-exported `Group`, `Mesh`, `Object3D`, `Vector3`
 * types), and builds one variant facing +Z, based at y = 0 (the waterline for
 * a craft), centred on its origin, coloured from `style` through `ctx.toon`.
 * Its declared `size` is held to the built variants from both sides, and it
 * declares `mounts` wherever a rider would be visible.
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
      // Region tables name vehicles by id, so a duplicate would build the wrong one.
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

