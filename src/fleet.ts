/**
 * The vehicles you can take: where each one stands until somebody moves it,
 * which of them are built, and how you get in and out.
 *
 * Where they stand is a pure function of the world: `createSiteIndex` decides
 * it from the places, roads, outlines and relief, seeded by the place's index,
 * so every client puts the same vehicle in the same place with nothing on the
 * wire, and a vehicle's id, `<model>:<placeIndex>:<n>`, names the same machine
 * everywhere.
 *
 * What has moved is the link's (`FleetLink` in `craft/contract.ts`): the
 * relay's with other players, `createLocalLink` without.
 *
 * What is built is the near and the seen: a site costs a few numbers until the
 * player is within `REACH` of it, then its model is built as a group of its
 * own, inside the frame's shared build allowance, dissolving in and out, and
 * put back in a pool when the player leaves. This file composes the parts in
 * `fleet/`.
 */
import * as THREE from 'three';
import { stripMaterial } from './craft/airstrip.ts';
import { cabinMaterial, craftMaterial, glassMaterial } from './craft/build.ts';
import { discMaterial } from './craft/motion.ts';
import { fadeTwin } from './fade.ts';
import { isPose } from './fleet/pose.ts';
import { createAirstrips } from './fleet/airstrips.ts';
import { createCandidates } from './fleet/candidates.ts';
import { createBoarding } from './fleet/boarding.ts';
import { createHeld } from './fleet/held.ts';
import { createLeaving } from './fleet/leaving.ts';
import { createSeating } from './fleet/seating.ts';
import { createCollision } from './fleet/collision.ts';
import { createCoasting } from './fleet/coasting.ts';
import { createParking } from './fleet/parking.ts';
import { createDrawing } from './fleet/drawing.ts';
import { createPlacing } from './fleet/placing.ts';
import { createSiteIndex } from './fleet/site-index.ts';
import { createFleetContext } from './fleet/state.ts';
import { createStreaming } from './fleet/streaming.ts';
import { createSummon } from './fleet/summon.ts';
import type { Fleet, FleetOptions, FleetStats } from './fleet/types.ts';

export { writePose } from './player/pose.ts';
export { STRIP_APPROACH, STRIP_BACK, STRIP_DRAWN, STRIP_HALF, STRIP_LENGTH, stripPoint } from './craft/airstrip.ts';
export { FLEET_MODELS, kindOfModel, modelOfVehicle } from './fleet/models.ts';
export { SITE_ROOM, SUBMARINE_SITE_DEPTH, keepsBalloon } from './fleet/site-rules.ts';
export { FIELD_SPREAD, stripKeepouts } from './fleet/strip-rules.ts';
export { createSiteIndex } from './fleet/site-index.ts';
export { distanceToPath } from './fleet/site-world.ts';
export { applyPose, isPose, seatPose } from './fleet/pose.ts';
export { createLocalLink } from './fleet/local-link.ts';
export type { FieldIndex, FieldKeepout, FleetSite, FleetSource, SiteIndex } from './fleet/site-types.ts';
export type { Fleet, FleetEvent, FleetOptions, FleetStats, Prompt } from './fleet/types.ts';

/**
 * The materials the fleet draws with: the airstrips', the propeller discs' and
 * the craft's own, its see-through glass, and the dissolving twin of the craft
 * and glass materials. For the shader warm-up (`warm.ts`).
 */
export const fleetMaterials = (): THREE.Material[] => [
  stripMaterial(),
  discMaterial(),
  craftMaterial(),
  fadeTwin(craftMaterial()),
  cabinMaterial(),
  fadeTwin(cabinMaterial()),
  glassMaterial(),
  fadeTwin(glassMaterial()),
];

export function createFleet(options: FleetOptions): Fleet {
  const { link, player, parked } = options;
  const sites = options.sites ?? createSiteIndex(options);
  const ctx = createFleetContext(options, sites);
  const { group, drawn, bayPose, state } = ctx;
  const placing = createPlacing(ctx);
  const airstrips = createAirstrips(ctx, placing);
  const drawing = createDrawing(ctx, placing);
  const parking = createParking(ctx, placing, drawing);
  const coasting = createCoasting(ctx, placing, parking);
  const leaving = createLeaving(ctx, coasting);
  const seating = createSeating(ctx, placing, drawing, coasting, leaving);
  const held = createHeld(ctx, placing, drawing, coasting, seating);
  const boarding = createBoarding(ctx, drawing, leaving, seating, held);
  const candidates = createCandidates(ctx, airstrips);
  const streaming = createStreaming(ctx, placing, drawing, airstrips, candidates);
  const collision = createCollision(ctx);

  // Something moved, or somebody got in or out: the candidates are stale. And
  // a town's parked car somebody took is the fleet's to draw from now on.
  link.onChange((vehicle) => {
    state.scanAge = Infinity;
    if (link.moved.has(vehicle)) parked?.hide(vehicle);
    // One nobody has any more (sunk and sent home, or forgotten with a relay
    // that started again) goes back to its kerb in the town.
    else if (!bayPose.has(vehicle)) parked?.show?.(vehicle);
    // Gone home from under a passenger (its driver drove it into the water and
    // it sank): the seat is gone, and the passenger is put out where the link
    // last had it, which is in the water.
    if (state.held !== null && state.held.id === vehicle && state.heldSeat !== 0 && player.ride !== null) {
      const now = link.moved.get(vehicle);
      if ((now?.seats[state.heldSeat] ?? null) !== link.self && !isPose(now?.pose)) {
        boarding.leave();
        const gone = drawn.get(vehicle);
        if (gone !== undefined) {
          drawn.delete(vehicle);
          drawing.retire(gone);
        }
      }
    }
  });

  const stats: FleetStats = {
    sites: sites.counts,
    built: 0,
    pooled: 0,
    moved: 0,
    riding: null,
    strips: 0,
    stripsPending: 0,
  };

  function update(dt: number, camera?: THREE.Camera): void {
    drawing.fadeStep();
    boarding.syncHeld(dt);
    coasting.coastOn(dt);
    streaming.frame(dt, camera);
    state.prompt = boarding.findPrompt();
  }

  const summon = createSummon(ctx, placing, drawing, boarding, update);

  return {
    group,
    sites,
    get stats() {
      stats.built = drawn.size + (state.held === null ? 0 : 1);
      stats.pooled = [...ctx.pool.values()].reduce((sum, spares) => sum + spares.length, 0);
      stats.moved = link.moved.size;
      stats.riding = state.held === null ? null : `${state.held.id} seat ${state.heldSeat}`;
      stats.strips = airstrips.strips.size;
      stats.stripsPending = airstrips.pending();
      return stats;
    },
    get prompt() {
      return state.prompt;
    },
    get stranded() {
      if (state.held === null || state.heldSeat === 0 || !player.airborne) return false;
      return (link.moved.get(state.held.id)?.seats[0] ?? null) === null;
    },
    collide: collision.collide,
    freeSpotNear: collision.freeSpotNear,
    eachStanding: collision.eachStanding,
    movedNear: collision.movedNear,
    claimsParked(id) {
      return bayPose.has(id) || link.moved.has(id);
    },
    claimedParked() {
      return [...link.moved.keys(), ...bayPose.keys()];
    },
    update,
    eachDriven(visit) {
      for (const entry of streaming.drivenNow) visit(entry.group, entry.model);
    },
    use: boarding.use,
    current() {
      return state.held === null ? null : { vehicle: state.held.id, seat: state.heldSeat };
    },
    seatFrame(vehicle, seat) {
      const entry = state.held !== null && state.held.id === vehicle ? state.held : drawn.get(vehicle);
      return entry?.seats[seat] ?? null;
    },
    poseOf: placing.poseOf,
    nearest: summon.nearest,
    board: summon.board,
  };
}
