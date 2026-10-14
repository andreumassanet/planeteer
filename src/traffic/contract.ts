import type { RegionStyle, SceneryContext } from '../scenery/contract.ts';

/**
 * The traffic contract: everything that moves, and everything parked.
 *
 * Separate from the scenery kit because a scenic part declares its footprint
 * as a radius, and a vehicle needs `length` and `width` separately to decide
 * whether it fits a lane. The seed mixer, the context (and so the pen, ramp
 * and palette), the region table and `measure` are shared with the scenery
 * and monument kits rather than duplicated.
 *
 * On top of those this adds the size rules, the vehicle primitives (a wheel, a
 * tapered hexahedron, a lathe) and the mount: where a person goes.
 */

export { SCENERY_SCALE, STOREY, AVATAR_HEIGHT } from '../scenery/contract.ts';
export { PLACED_SECTION, PLACED_LENGTH_CAP, SEATED, RIDER_HEIGHT, RIDER_SCALE, RIDER, LEGIBLE_AT } from './contract/scale.ts';
export type { CrowdBody } from './contract/scale.ts';
export { KINDS, VARIANTS, placedScale, placedSize } from './contract/kinds.ts';
export type { KindSpec, Medium, VehicleKind } from './contract/kinds.ts';
export { variantRng } from './contract/types.ts';
export type { Mount, RiderPose, SolidSpec, TrafficContext, TrafficStyle, Vehicle, VehicleFit } from './contract/types.ts';
export { WHEEL_SIDES, createTrafficContext } from './contract/context.ts';
export { extentOf, mountProblems, validateVehicle } from './contract/validate.ts';
export type { Extent } from './contract/validate.ts';
export { SAME_SHAPE, fitsOn, passesOn, silhouetteOf, silhouetteOverlap, varietyOf } from './contract/variety.ts';
export type { Variety } from './contract/variety.ts';

// The baked models share the scenery kit's registry (`registerSceneryModels`).
export { isGlass } from '../models.ts';

export type { Measurements } from '../monuments/contract.ts';
export { measure, paletteName } from '../monuments/contract.ts';
export type { Group, Mesh, Object3D, Vector3 } from '../monuments/contract.ts';
export type { Rng, Weighted } from '../scenery/random.ts';
export { rngFrom, seedOf } from '../scenery/random.ts';
export type { RegionStyle, SceneryContext };

export const TAU = Math.PI * 2;
