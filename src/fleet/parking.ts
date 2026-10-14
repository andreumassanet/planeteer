/** Where a vehicle that was let go of ends up: parked where it stopped, or gone under water and home to its site. */
import * as THREE from 'three';
import { PLANET_RADIUS, groundRadius } from '../globe.ts';
import { WATERLINE, founders, isWater } from '../vehicles.ts';
import type { WirePose } from '../craft/contract.ts';
import { writePose } from '../player/pose.ts';
import { applyPose } from './pose.ts';
import type { Drawing } from './drawing.ts';
import type { Placing } from './placing.ts';
import type { FleetContext } from './state.ts';

export function createParking(ctx: FleetContext, placing: Placing, drawing: Drawing) {
  const { options, link, drawn, state, point, up } = ctx;
  const { world, player, onEvent } = options;
  const { seat } = placing;
  const { retire } = drawing;
  const sunkAt = new THREE.Vector3();
  const coastPose: WirePose = new Array(9).fill(0);

  /** The vehicle going on alone has gone under: it is gone from here and back at its site, for everyone. */
  function sinkCoast(): void {
    const c = state.coast;
    if (c === null) return;
    state.coast = null;
    sunkAt.copy(c.position);
    link.sink(c.entry.id);
    if (drawn.get(c.entry.id) === c.entry) {
      drawn.delete(c.entry.id);
      retire(c.entry);
    }
    state.scanAge = Infinity;
    onEvent?.('sank', c.entry.model, sunkAt);
  }

  /**
   * The vehicle at the controls has gone under (`Player.sunk`): the body is put
   * out swimming at the surface, the vehicle is gone from under the water and
   * back at its site, for everyone (`FleetLink.sink`).
   */
  function sinkHeld(): void {
    if (state.held === null) return;
    const entry = state.held;
    sunkAt.copy(player.position);
    if (player.leave() === null) return;
    state.held = null;
    entry.site = null;
    retire(entry);
    link.sink(entry.id);
    state.scanAge = Infinity;
    onEvent?.('sank', entry.model, sunkAt);
  }

  /** The vehicle going on alone, parked where it is now. */
  function finishCoast(): void {
    const c = state.coast;
    if (c === null) return;
    // Still aloft (a balloon left at altitude falls for longer than `COAST_MAX`,
    // and a second vehicle taken ends the first one's coast): it comes down
    // where it is, under if the water cannot float it, else on the ground below.
    // It is never parked in the air.
    point.copy(c.position).normalize().multiplyScalar(PLANET_RADIUS);
    if (c.flying && founders(c.entry.model.kind, c.entry.model.medium) && isWater(groundRadius(world, point))) {
      c.position.setLength(PLANET_RADIUS + WATERLINE);
      sinkCoast();
      return;
    }
    state.coast = null;
    up.copy(c.position).normalize();
    c.forward.projectOnPlane(up).normalize();
    writePose(c.position, c.forward, up, coastPose);
    // Parked as a parked one stands, on its wheels, so the reseat that
    // follows (`RESEAT_SECONDS`) finds it already there.
    seat(c.entry.model, coastPose, coastPose);
    link.release(c.entry.id, coastPose.slice(0, 9));
    if (drawn.get(c.entry.id) === c.entry) applyPose(coastPose, c.entry.group);
    state.scanAge = Infinity;
  }

  return { sinkCoast, sinkHeld, finishCoast, coastPose };
}

export type Parking = ReturnType<typeof createParking>;
