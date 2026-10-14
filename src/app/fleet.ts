/**
 * The vehicles a player takes, and how they meet the rest of the world: the
 * relay (or the local link) says who moved what, the towns and farms hand
 * over their parked vehicles, and the traffic gives way to all of it.
 */
import * as THREE from 'three';
import type { CraftModel } from '../craft/contract.ts';
import type { Fleet, FleetEvent } from '../fleet.ts';
import type { FleetSync } from '../fleet-sync.ts';
import type { OtherVisitor } from '../effects.ts';
import type { App } from './context.ts';
import { modeIcon } from './craft-kinds.ts';

export async function createWorldFleet(app: App): Promise<{ fleet: Fleet; fleetSync: FleetSync | null }> {
  const { deferred, world, places, baked, placements, fleetSites, craftModels, player, walls, land, settlements, vegetation, peers } = app;
  const { createFleet, createLocalLink } = await deferred.fleet;
  const { createFleetSync } = await deferred.fleetSync;
  const fleetSync = peers === null ? null : createFleetSync(peers);
  const fleet = createFleet({
    world,
    places: places.all,
    roads: baked.roads,
    monuments: placements,
    sites: fleetSites,
    models: craftModels,
    link: fleetSync ?? createLocalLink(),
    player,
    madeHeightAt: walls.madeHeightAt,
    land,
    // The towns' parked cars and racked bicycles, and the farms' tractors.
    parked: {
      near: (viewer, radius, out) => {
        settlements.parkedNear(viewer, radius, out);
        vegetation.parkedNear(viewer, radius, out);
      },
      hide: (id) => {
        settlements.hideParked(id);
        vegetation.hideParked(id);
      },
      show: (id) => settlements.showParked(id),
      paintOf: (id) => settlements.parkedPaint(id),
    },
    collide: walls.collideStill,
    onEvent: (event, model, at) => onFleetEvent(app, event, model, at),
  });
  app.scene.add(fleet.group);
  walls.setFleet(fleet);
  return { fleet, fleetSync };
}

function onFleetEvent(app: App, event: FleetEvent, model: CraftModel | null, at: THREE.Vector3 | undefined): void {
  const { audio } = app.sound;
  const { effects, player } = app;
  const iconName = modeIcon(model?.kind ?? null);
  if (event === 'bailed') {
    audio.cue('ui-click');
  } else if (event === 'wrecked') {
    if (at !== undefined) effects.crashAt(at, app.rig.heading, 0.8);
    if (at !== undefined && at.distanceTo(player.position) < 400) audio.cue('land');
  } else if (event === 'foundered' || event === 'sank') {
    const reach = model === null ? 3 : Math.max(model.size[0], model.size[1]) * (event === 'sank' ? 0.4 : 0.75);
    if (at !== undefined) effects.splashAt(at, reach);
    if (event === 'foundered' && at !== undefined && at.distanceTo(player.position) < 400) audio.cue('land');
  } else if (event === 'leave-refused') {
    // Getting out aloft is a jump; the only refusal is a submarine under the surface.
    app.announce(model?.kind === 'submarine' ? 'Surface before getting out' : 'Nobody gets out here', iconName);
    audio.cue('ui-error');
  } else if (event === 'taken') {
    app.announce('Somebody else just took that seat', iconName);
    audio.cue('ui-error');
  } else if (event === 'boarded') audio.cue('ui-confirm');
  else if (event === 'left') audio.cue('ui-click');
}

/**
 * What the traffic stops for and the herds keep off (the player, standing
 * vehicles, trains on a crossing, townsfolk), the wakes of others' vehicles,
 * and the parked vehicles the fleet has already claimed.
 */
export function wireFleet(app: App): void {
  const { life, player, fleet, fleetSync, railway, townsfolk, effects, airTraffic, settlements, vegetation, peers, personRadius } = app;
  const { audio } = app.sound;
  const folkPush = new THREE.Vector3();
  life.setInTheWay({
    each(visit) {
      const model = player.ride?.model;
      visit(player.position, model === undefined ? personRadius : (model.size[0] + model.size[1]) / 4, true);
      fleet.eachStanding(visit);
      railway?.eachCar(visit);
    },
    people: (point, radius) => townsfolk.collide(point, radius, folkPush.set(0, 0, 0)),
    parked: (point, radius) => fleet.movedNear(point, radius),
    // A car kept waiting by the player honks, quieter the further off.
    horn: (at) => audio.horn(Math.max(0, 1 - at.distanceTo(player.position) / 120)),
  });
  // The visitors are made once, so a frame hands them over without allocating.
  let visitOther: OtherVisitor = () => {};
  const driven = (object: THREE.Object3D, model: CraftModel): void => visitOther(object, model.kind, model);
  const boat = (object: THREE.Object3D): void => visitOther(object, 'boat', null);
  effects.setOthers((visit) => {
    visitOther = visit;
    fleet.eachDriven(driven);
    life.eachBoat(boat);
    airTraffic.eachFlyer(visitOther);
  });
  // A town built from now on leaves out a parked car the fleet has; one already standing folds it away.
  settlements.setParkedTaken((id) => fleet.claimsParked(id));
  vegetation.setParkedTaken((id) => fleet.claimsParked(id));
  for (const id of fleet.claimedParked()) {
    settlements.hideParked(id);
    vegetation.hideParked(id);
  }
  if (peers !== null && fleetSync !== null) peers.useSeats(fleet, (id) => fleetSync.seatOf(id));
}
