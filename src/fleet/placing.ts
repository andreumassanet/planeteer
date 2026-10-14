/** Where a vehicle stands: the ground under its wheels, and the pose of a site, a moved vehicle or the one in hand. */
import * as THREE from 'three';
import { PLANET_RADIUS } from '../globe.ts';
import { drawnRadius, landProbeOf } from '../land-probe.ts';
import { WATERLINE } from '../vehicles.ts';
import { isAirKind } from '../craft/contract.ts';
import type { CraftModel, WirePose } from '../craft/contract.ts';
import { writePose } from '../player/pose.ts';
import { AFLOAT } from './models.ts';
import { applyPose, isPose, seatPose } from './pose.ts';
import type { FleetSite } from './site-types.ts';
import type { Drawn, FleetContext } from './state.ts';

export interface Placing {
  /** The drawn land under a point, as a radius; null when the fleet was given no land mesh. */
  readonly probe: ReturnType<typeof landProbeOf> | null;
  /** The drawn land's radius under a point, or the relief's where the index does not reach. */
  landAt(at: THREE.Vector3): number;
  /** The same along a direction. */
  surface(direction: THREE.Vector3): number;
  /** What a wheel stands on: the land, or a road or a town's floor over it. */
  standingAt(at: THREE.Vector3): number;
  /**
   * A vehicle set down where it stands (`seatPose`): on the land for a craft
   * that flies, on whatever is made over it for anything on wheels or legs.
   */
  seat(model: CraftModel, from: WirePose, out: WirePose): WirePose;
  /**
   * Where a site's vehicle stands: its origin on the surface its kind stands
   * on, seated on it by its wheels unless `level` (for `nearest`, which wants
   * only where it is and asks it of every site for thousands of units round).
   */
  sitePose(site: FleetSite, out: WirePose, level?: boolean): WirePose;
  /** Where a vehicle is now: in hand, driven, moved, at its kerb or at its site. False if nothing knows. */
  poseOf(vehicle: string, out: WirePose): boolean;
  /** Stands a built vehicle at its pose. */
  place(entry: Drawn): void;
}

export function createPlacing(ctx: FleetContext): Placing {
  const { options, models, link, sites, bayPose, state, point, up, pose } = ctx;
  const { world, player, madeHeightAt } = options;

  /** The drawn land round the player: the one probe of the mesh, which the loop keeps gathered while the player is near the ground. */
  const probe = options.land === undefined ? null : landProbeOf(options.land);

  const landAt = (at: THREE.Vector3): number => drawnRadius(world, probe, at);
  const surface = (direction: THREE.Vector3): number => landAt(point.copy(direction).multiplyScalar(PLANET_RADIUS));
  const standingAt = (at: THREE.Vector3): number => {
    const land = landAt(at);
    const made = madeHeightAt?.(at) ?? 0;
    return made > land ? made : land;
  };

  function seat(model: CraftModel, from: WirePose, out: WirePose): WirePose {
    return seatPose(from, model.size, model.kind, isAirKind(model.kind) ? landAt : standingAt, out);
  }

  function sitePose(site: FleetSite, out: WirePose, level = false): WirePose {
    let radius: number;
    point.copy(site.at).multiplyScalar(PLANET_RADIUS);
    if (AFLOAT.has(site.kind)) radius = PLANET_RADIUS + WATERLINE;
    else {
      radius = landAt(point);
      if (!isAirKind(site.kind)) {
        point.setLength(radius);
        radius = Math.max(radius, madeHeightAt?.(point) ?? 0);
      }
    }
    point.copy(site.at).multiplyScalar(radius);
    writePose(point, site.forward, up.copy(site.at), out);
    const model = level || AFLOAT.has(site.kind) ? undefined : models.get(site.model);
    return model === undefined ? out : seat(model, out, out);
  }

  function poseOf(vehicle: string, out: WirePose): boolean {
    if (state.held !== null && state.held.id === vehicle) {
      player.pose(out);
      return true;
    }
    if (link.sample(vehicle, out)) return true;
    const moved = link.moved.get(vehicle);
    if (moved !== undefined && isPose(moved.pose)) {
      for (let i = 0; i < 9; i++) out[i] = moved.pose[i]!;
      return true;
    }
    const kerb = bayPose.get(vehicle);
    if (kerb !== undefined) {
      for (let i = 0; i < 9; i++) out[i] = kerb[i]!;
      return true;
    }
    const site = sites.byId(vehicle);
    if (site === null) return false;
    sitePose(site, out);
    return true;
  }

  function place(entry: Drawn): void {
    if (!poseOf(entry.id, pose)) return;
    applyPose(pose, entry.group);
  }

  return { probe, landAt, surface, standingAt, seat, sitePose, poseOf, place };
}
