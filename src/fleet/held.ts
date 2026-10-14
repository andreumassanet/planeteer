/** Every frame, the vehicle in hand: the driver tells the link where it is, a passenger is carried, and a teleported player leaves it where it was. */
import { PLANET_RADIUS, groundRadius } from '../globe.ts';
import { WATERLINE, founders, isWater } from '../vehicles.ts';
import type { WirePose } from '../craft/contract.ts';
import { AFLOAT } from './models.ts';
import { applyPose, isPose } from './pose.ts';
import type { FleetContext } from './state.ts';
import type { Placing } from './placing.ts';
import type { Drawing } from './drawing.ts';
import type { Coasting } from './coasting.ts';
import type { Seating } from './seating.ts';

export function createHeld(
  ctx: FleetContext,
  placing: Placing,
  drawing: Drawing,
  coasting: Coasting,
  seating: Seating,
) {
  const { options, link, group, drawn, state, point, pose } = ctx;
  const { world, player } = options;
  const { seat, poseOf } = placing;
  const { retire } = drawing;
  const { sinkHeld } = coasting;
  const { keepSeat } = seating;

  /** The last pose driven, which is where the vehicle is left if the player is taken out of it. */
  const lastPose: WirePose = [];

  function syncHeld(dt: number): void {
    // The vehicle in hand: the driver tells the link where it is, and a
    // passenger is carried wherever the driver has it.
    if (state.held !== null && player.ride !== null) keepSeat(dt, state.held);
    if (state.held !== null && player.ride !== null) {
      if (state.heldSeat === 0) {
        player.pose(lastPose);
        link.drive(state.held.id, lastPose, player.velocity);
        if (player.sunk) sinkHeld();
      }
      else if (link.sample(state.held.id, pose)) player.carry(pose);
      else {
        // Nobody driving it now: the driver parked it, or dropped off the
        // relay. The passenger stays in his seat wherever the link last put
        // the vehicle — the driver's own parking place, once it arrives —
        // so the body and the drawn vehicle agree with everyone else's.
        const moved = link.moved.get(state.held.id);
        if (moved !== undefined && isPose(moved.pose)) player.carry(moved.pose);
      }
    } else if (state.held !== null) {
      // The player was put somewhere else — a teleport — and the vehicle
      // stays where it was left: on what is under it, as `leave` would
      // leave it, not in the air it was flying through, under the sea a
      // submarine was diving in, or afloat where a car was going down.
      const entry = state.held;
      state.held = null;
      const model = entry.model;
      let settled: WirePose | null = state.heldSeat === 0 && isPose(lastPose) ? [...lastPose] : null;
      if (settled !== null) point.set(settled[0]!, settled[1]!, settled[2]!).normalize().multiplyScalar(PLANET_RADIUS);
      if (settled !== null && founders(model.kind, model.medium) && isWater(groundRadius(world, point))) {
        entry.site = null;
        retire(entry);
        link.sink(entry.id);
        settled = null;
      } else {
        if (settled !== null) {
          if (AFLOAT.has(model.kind)) {
            point.set(settled[0]!, settled[1]!, settled[2]!).setLength(PLANET_RADIUS + WATERLINE);
            settled[0] = point.x;
            settled[1] = point.y;
            settled[2] = point.z;
          } else seat(model, settled, settled);
        }
        link.release(entry.id, settled);
        group.add(entry.group);
        if (poseOf(entry.id, pose)) applyPose(pose, entry.group);
        drawn.set(entry.id, entry);
        entry.site = null;
        entry.reseat = 0;
      }
      state.scanAge = Infinity;
    }

  }

  return { syncHeld };
}

export type HeldSync = ReturnType<typeof createHeld>;
