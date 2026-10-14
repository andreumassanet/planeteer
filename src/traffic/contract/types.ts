import type * as THREE from 'three';
import type { Paint } from '../../models.ts';
import type { SceneryContext } from '../../scenery/contract.ts';
import { rngFrom } from '../../scenery/random.ts';
import type { Rng, Weighted } from '../../scenery/random.ts';
import type { VehicleKind } from './kinds.ts';

/** How a rider sits on this. The crowd's `look.pose`, spelled the same way. */
export type RiderPose = 'sit' | 'astride' | 'stand';

/**
 * Where a person goes, in the vehicle's own frame.
 *
 * The origin is the seat surface (the crowd's convention): +Z the way the rider
 * faces, +Y up. A placer puts a person there, scales them by `RIDER_SCALE` and
 * yaws them by `yaw`. `validateVehicle` checks `headroom`, `legroom` and `beam`
 * against `RIDER`.
 */
export interface Mount {
  x: number;
  y: number;
  z: number;
  /** Facing, relative to the vehicle's +Z. 0 is forward, Math.PI is aft. */
  yaw: number;
  pose: RiderPose;
  /** Whether this is the seat that makes the vehicle look driven. */
  driver?: boolean;
  /** Clear height above the seat. `Infinity` for an open seat. */
  headroom: number;
  /** Clear depth below it before the shins foul the frame or the floor. */
  legroom: number;
  /**
   * Clear width across the seat, elbows included. `Infinity` for an open-sided
   * vehicle. A rider's elbows need more than a hatchback's interior width
   * allows for two, so every enclosed driver sits on the centreline.
   */
  beam: number;
  /** Whether the seat admits a hat or a headload (`RIDER.headroomHatted`). */
  hats?: boolean;
  /**
   * Where the feet go (crank, stirrup, footrest, pedal box), in the vehicle's
   * frame. Decides the joint angles of an `astride` pose; absent means the feet
   * hang or rest on a footwell floor.
   */
  footrest?: readonly [number, number, number];
  /** Where the hands go (bars, wheel, oar), in the vehicle's frame. Sets a rider's lean. */
  grip?: readonly [number, number, number];
}

export interface TrafficContext extends SceneryContext {
  /**
   * A road wheel: axle along X, centred on the origin, bottom at `y = -radius`.
   * The polygon is normalised to an exactly square `2 * radius` box, so it is
   * as tall as it is long whatever `sides` is.
   */
  wheel(radius: number, width: number, color: number, sides?: number): THREE.Mesh;

  /**
   * A closed lathe over an explicit `[radius, y]` profile, bottom up, for shapes
   * whose waist is above their foot (a balloon envelope). Give the profile a
   * `[0, y]` at each end to cap it; an open lathe is single-sided.
   */
  lathe(profile: readonly (readonly [number, number])[], color: number, sides?: number): THREE.Mesh;

  /**
   * A hexahedron: a box whose top face may differ from its bottom one and whose
   * ends may each be narrowed and lifted. One shape covers a body with
   * tumblehome, a raked greenhouse and a hull with a stem.
   *
   * Zero-area faces are dropped, since they would give NaN normals. A
   * greenhouse built as its own narrower, inset mass gets an ink line all round
   * instead of a coplanar colour patch.
   */
  solid(spec: SolidSpec): THREE.Mesh;

  /**
   * A baked CC0 vehicle (`scripts/build-kit.ts`) facing +Z, centred in X and Z,
   * standing on y = 0 (or `sink` under it), scaled uniformly to `width` across
   * or `length` long, whichever is tighter. The packs draw vehicles as toys, so
   * fitting by width keeps them inside a lane.
   *
   * Throws if the models have not been registered, so a vehicle built before
   * its kit arrived is not cached as refused.
   */
  vehicle(id: string, fit: VehicleFit, paint?: Paint): THREE.Group;

  /**
   * Paint for one variant of a baked vehicle: `body` on the bodywork, glass at
   * `slate` toned by `GLASS_TONE`, every other surface on its nearest palette
   * colour. The bodywork is the largest saturated colour family, or
   * `bodySlots` by name for a pack drawn in greys.
   */
  vehiclePaint(id: string, body: number, bodySlots?: RegExp): Paint;
}

export interface VehicleFit {
  width?: number;
  length?: number;
  /** How far below y = 0 the model's own base goes: a hull's draft. */
  sink?: number;
}

export interface SolidSpec {
  color: number;
  /** Full width at the -Z (aft) end of the bottom face. */
  width: number;
  /** Full width at the +Z (fore) end. Defaults to `width`. 0 is a stem. */
  foreWidth?: number;
  /** Length along Z, centred on the origin. */
  depth: number;
  height: number;
  /** Full width of the top face, aft and fore. Both default to their bottoms. */
  topWidth?: number;
  topForeWidth?: number;
  /** Z of the top face's aft and fore edges. Default -depth/2 and +depth/2. */
  topAft?: number;
  topFore?: number;
  /** Lift of the bottom edge at each end: ground clearance, rocker, a raised bow. */
  aftRise?: number;
  foreRise?: number;
}

export interface Vehicle {
  /** Kebab-case, unique, and the file is named after it: `city-bus.ts`. */
  id: string;
  name: string;
  kind: VehicleKind;
  /**
   * The box every variant must stay inside: `[length, width, height]`. Width
   * decides the carriageway, length whether the road holds it straight.
   */
  size: readonly [number, number, number];
  /** Where riders go. Empty is legal. */
  mounts: readonly Mount[];
  /** One line: what this is and what it is for. */
  note?: string;
  /**
   * Builds one variant, deterministic in `rng` and `style`. The group faces +Z,
   * has its base at y = 0 (or `-draft` for a craft), is centred in X and Z with
   * an identity transform, and takes materials only from `ctx.toon`.
   */
  build(ctx: TrafficContext, rng: Rng, style: TrafficStyle): THREE.Group;
}

/** The seed for one variant: identity, not order (see `scenery/random.ts`). */
export function variantRng(vehicle: Vehicle, style: TrafficStyle, variant: number): Rng {
  return rngFrom(vehicle.id, style.id, variant);
}

/**
 * What is on the road in a region, and what colour it is. Keyed on the same
 * `RegionId` as the scenery kit, but a separate table: a car's paint is not a
 * wall colour.
 */
export interface TrafficStyle {
  id: string;
  name: string;
  /** One line: what you would notice on the road there. */
  note: string;
  /**
   * Body paint. Warm entries: a neutral turned away from the blue hemisphere
   * light goes hueless. The regional signal is saturation rather than hue.
   */
  paint: readonly number[];
  /** Bumpers, sills, tyres, tarpaulins. */
  trim: readonly number[];
  /** Glass. Warm darks. */
  glass: readonly number[];
  /** Chrome, bare metal, galvanised sheet. */
  metal: readonly number[];
  /** Load: crates, sacks, hay, nets. */
  cargo: readonly number[];
  /** What is parked or moving on a street here, by vehicle id. */
  road: readonly Weighted<string>[];
  /** What is moored at a coastal settlement. */
  water: readonly Weighted<string>[];
  /** What is in the air; usually a weight of zero. */
  air: readonly Weighted<string>[];
  /** Vehicles per built plot, roughly. For the placer, not used in this directory. */
  density: number;
}
