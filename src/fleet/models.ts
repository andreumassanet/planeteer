/** The model ids the fleet's sites name, and what kind each one is. */
import type { CraftKind } from '../craft/contract.ts';

/** The model ids the sites name, a kind's first; `craft/index.ts` builds them. */
export const FLEET_MODELS = {
  car: 'hatchback',
  van: 'van',
  boat: 'launch',
  plane: 'light-plane',
  balloon: 'balloon',
  bicycle: 'bicycle',
  motorbike: 'motorbike',
  tuktuk: 'tuk-tuk',
  bus: 'bus',
  tractor: 'tractor',
  jeep: 'jeep',
  horse: 'horse',
  jetski: 'jet-ski',
  sailboat: 'sailboat',
  helicopter: 'helicopter',
  submarine: 'submarine',
} as const satisfies Record<CraftKind, string>;

/**
 * Every model's kind, including the second looks of a kind: a scooter is
 * driven as a motorbike, a pickup as a jeep. A kind can be told from a vehicle
 * id alone this way, which is how the relay's vehicles and a town's parked
 * ones are known.
 */
export const KIND_OF: Readonly<Record<string, CraftKind>> = {
  ...Object.fromEntries((Object.entries(FLEET_MODELS) as [CraftKind, string][]).map(([kind, id]) => [id, kind])),
  scooter: 'motorbike',
  pickup: 'jeep',
};

/** The kinds that stand in the water rather than on the ground. */
export const AFLOAT: ReadonlySet<CraftKind> = new Set<CraftKind>(['boat', 'jetski', 'sailboat', 'submarine']);

/** The kind of a model id, or null for one no site ever names. */
export const kindOfModel = (model: string): CraftKind | null => KIND_OF[model] ?? null;

/** The model a vehicle id names: the part before the first colon. */
export const modelOfVehicle = (vehicle: string): string => vehicle.slice(0, Math.max(0, vehicle.indexOf(':')));
