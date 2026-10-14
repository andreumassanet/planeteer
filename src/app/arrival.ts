/**
 * Where the player arrives: chosen on the menu or given by a link, the
 * connection to the relay when playing online, and the arrival point carried
 * clear of every landmark.
 */
import * as THREE from 'three';
import { groundRadius, PLANET_RADIUS } from '../globe.ts';
import { encodeAppearance } from '../appearance.ts';
import { heroAppearance } from '../avatar.ts';
import { isWater } from '../vehicles.ts';
import { latLonOf, unitAt } from '../sphere.ts';
import { ARRIVAL_CLEARANCE, clearOfPlans, plannedSite } from '../landmark-ground.ts';
import type { MenuSpawn, Curtain } from '../menu.ts';
import type { Peers } from '../peers.ts';
import type { PlayMode } from '../world-host.ts';
import type { App } from './context.ts';
import { exploreWorld } from './other-worlds.ts';

export interface Arrival {
  spawn: MenuSpawn;
  playMode: PlayMode;
  /** The relay connection; null offline, or with no relay configured. */
  peers: Peers | null;
  /** Where a body is put down for a wanted point. */
  arrivalAt(lat: number, lon: number): { lat: number; lon: number };
  /** Where the player starts. */
  start: { lat: number; lon: number };
  /** The menu's curtain over the dive, lifted by the loop once the ground has built; null for a link. */
  curtain: Curtain | null;
}

/**
 * Carries a wanted point out of every landmark's plan, onto dry ground where
 * possible. A town's own point can lie inside its landmark, and a body put
 * down inside a model cannot get out. Every arrival asks it.
 */
function createArrivalAt(app: App): Arrival['arrivalAt'] {
  const { world } = app;
  const sites = app.placements.map(plannedSite);
  const point = new THREE.Vector3();
  const probe = new THREE.Vector3();
  const dry = (p: { x: number; y: number; z: number }): boolean =>
    !isWater(groundRadius(world, probe.set(p.x, p.y, p.z).multiplyScalar(PLANET_RADIUS)));
  return (lat, lon) => {
    unitAt(lat, lon, point);
    if (!clearOfPlans(point, sites, PLANET_RADIUS, point, ARRIVAL_CLEARANCE, dry)) return { lat, lon };
    return latLonOf(point.normalize());
  };
}

export async function arrive(app: App): Promise<Arrival> {
  const { launch, menu } = app;
  // A journey to another world goes in by its *Explore* as soon as the screen lifts.
  if (launch.awayJourney !== null) {
    const away = launch.awayJourney;
    void exploreWorld(app, away.world, away.name, { body: away.world, region: '', name: away.name, lat: away.lat, lon: away.lon });
  }
  const spawn: MenuSpawn = launch.skipTo !== null
    ? { body: 'earth', region: '', name: 'here', lat: launch.skipTo.lat, lon: launch.skipTo.lon }
    : await menu.choose();
  // Online only when the title (or a remembered choice) says so; offline nothing anywhere sends.
  const playMode: PlayMode = app.title?.mode ?? launch.linkedMode;
  const peers = playMode === 'online' && app.peersUrl !== '' ? app.peersModule.createPeers(app.peersUrl, app.folk) : null;
  if (peers !== null) {
    // Before the first connection, which carries it in its address.
    peers.setLook(encodeAppearance(heroAppearance()));
    app.scene.add(peers.group);
    app.peersLink = peers;
  }
  const arrivalAt = createArrivalAt(app);
  const start = arrivalAt(spawn.lat, spawn.lon);
  // Everything after this is built behind the curtain.
  const curtain = launch.skipTo !== null ? null : await menu.depart();
  return { spawn, playMode, peers, arrivalAt, start, curtain };
}
