/** The console's way to a vehicle: the nearest one, and straight into one from anywhere. */
import * as THREE from 'three';
import { PLANET_RADIUS } from '../globe.ts';
import { latOf, lonOf } from '../sphere.ts';
import { AVATAR_HEIGHT } from '../stature.ts';
import { kindOfModel, modelOfVehicle } from './models.ts';
import { isPose } from './pose.ts';
import type { Boarding } from './boarding.ts';
import type { Drawing } from './drawing.ts';
import type { Placing } from './placing.ts';
import type { FleetSite } from './site-types.ts';
import type { FleetContext } from './state.ts';
import type { Fleet } from './types.ts';

export type Summon = Pick<Fleet, 'nearest' | 'board'>;

/** `update` is the fleet's own frame step, which `board` runs once so the vehicle is built before the seat is claimed. */
export function createSummon(ctx: FleetContext, placing: Placing, drawing: Drawing, boarding: Boarding, update: (dt: number) => void): Summon {
  const { options, models, link, sites, group, drawn, state, point, up, centre, pose } = ctx;
  const { player } = options;
  const { sitePose, poseOf, place } = placing;
  const { build } = drawing;
  const { leave, claim } = boarding;
  const found: FleetSite[] = [];

  function nearest(kind?: Parameters<Fleet['nearest']>[0]): ReturnType<Fleet['nearest']> {
    const here = player.position;
    const from = here.clone().normalize();
    found.length = 0;
    let best: { id: string; lat: number; lon: number; distance: number } | null = null;
    const consider = (id: string, at: THREE.Vector3): void => {
      const distance = at.distanceTo(here);
      if (best !== null && distance >= best.distance) return;
      best = { id, lat: latOf(at.y / at.length()), lon: lonOf(at.x, at.z), distance };
    };
    // Widening rings, so a lone plane two hundred kilometres off is found
    // without working out every town on the planet.
    for (let radius = 1000; radius <= 64000 && best === null; radius *= 2) {
      found.length = 0;
      for (const site of sites.near(from, radius, found)) {
        if ((kind !== undefined && site.kind !== kind) || isPose(link.moved.get(site.id)?.pose)) continue;
        sitePose(site, pose, true);
        consider(site.id, centre.set(pose[0]!, pose[1]!, pose[2]!));
      }
    }
    for (const [id, moved] of link.moved) {
      if (!isPose(moved.pose) || (kind !== undefined && kindOfModel(modelOfVehicle(id)) !== kind)) continue;
      consider(id, centre.set(moved.pose[0]!, moved.pose[1]!, moved.pose[2]!));
    }
    return best;
  }

  async function board(vehicle?: string): Promise<boolean> {
    if (state.held !== null) leave();
    const id = vehicle ?? nearest()?.id;
    if (id === undefined || !poseOf(id, pose)) return false;
    const model = models.get(modelOfVehicle(id));
    if (model === undefined) return false;
    // Beside it, on the side of its first seat, and then the ordinary path in.
    centre.set(pose[0]!, pose[1]!, pose[2]!);
    up.copy(centre).normalize();
    point.set(pose[3]!, pose[4]!, pose[5]!);
    const beside = new THREE.Vector3().crossVectors(up, point).normalize();
    centre.normalize().addScaledVector(beside, (model.size[1] / 2 + AVATAR_HEIGHT * 0.6) / PLANET_RADIUS).normalize();
    player.goTo(latOf(centre.y), lonOf(centre.x, centre.z));
    state.scanAge = Infinity;
    update(0);
    let entry = drawn.get(id);
    if (entry === undefined) {
      entry = build(id, isPose(link.moved.get(id)?.pose) ? null : sites.byId(id)) ?? undefined;
      if (entry === undefined) return false;
      drawn.set(id, entry);
      group.add(entry.group);
      place(entry);
    }
    const seats = link.moved.get(id)?.seats ?? [];
    const free = model.seats.findIndex((_, i) => (seats[i] ?? null) === null);
    if (free < 0) return false;
    return claim(entry, free);
  }

  return { nearest, board };
}
