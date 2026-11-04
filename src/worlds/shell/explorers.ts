/**
 * The progression, the Explorers' Guild, the Field Guide, the banner, the
 * trails and the companion on a walked world: Earth's one runtime
 * (`explorers.ts`), handed this world's game as its host, and the traveller
 * read each frame into the same events Earth's are (`createTravellerReader`).
 * The level and the quests are the page's one progression, so they carry
 * from Earth to Mars and back.
 *
 * What a world has not got is answered with nothing: no jobs, no courses,
 * and the conversations say so; the cartographer suggests the world's own
 * landmarks and towns, and the map they open is this world's.
 */

import * as THREE from 'three';
import { WALK_SPEED } from '../../avatar/gait.ts';
import type { Explorers, ExplorersHost, ExplorerTraveller } from '../../explorers.ts';
import type { Folk } from '../../folk.ts';
import type { Hud } from '../../hud.ts';
import type { WorldMap } from '../../map.ts';
import type { Minimap } from '../../minimap.ts';
import { modelMaterial } from '../../models.ts';
import { createRigLibrary } from '../../kit.ts';
import type { Navigation } from '../../navigation.ts';
import type { Passport } from '../../passport.ts';
import type { PassportCard } from '../../passport-card.ts';
import type { Peers } from '../../peers.ts';
import type { MoveMode, ProgressEvent } from '../../progress/events.ts';
import { createTravellerReader } from '../../progress/traveller.ts';
import type { TravellerReading } from '../../progress/traveller.ts';
import { deviceStore, readRecord } from '../../rings/store.ts';
import { deviceJobStore, readJobs } from '../../jobs/store.ts';
import { SCENERY_SCALE } from '../../stature.ts';
import type { Cue } from '../../audio.ts';
import { worldGuildTowns } from '../town-grid.ts';
import type { ShellWorld } from './types.ts';

/** Above this a walk is a run, as a share of the walking speed: Earth's. */
const RUNNING = 1.2;
/** The smallest town the cartographer suggests for a new stamp. */
const SUGGEST_POPULATION = 50000;

export interface WorldExplorers {
  /** The runtime, once it has loaded; null before. */
  readonly runtime: Explorers | null;
  /** Tells the progression something with a name happened: a talk, a photo, a wave, a stamp. */
  emit(event: ProgressEvent): void;
  /** Every frame, after the world has moved. */
  update(dt: number): void;
  /** The guild's walls: pushes a body of `radius` at `position` out of its people. */
  collide(position: THREE.Vector3, radius: number): boolean;
  dispose(): void;
}

export function createWorldExplorers(deps: {
  world: ShellWorld;
  hud: Hud;
  nav: Navigation;
  map: WorldMap;
  minimap: Minimap;
  passport: Passport;
  passportCard: PassportCard;
  peers: Peers | null;
  folk: Folk;
  cue: (name: Cue) => void;
  travellerName(): string;
  countryName(iso: string): string;
  isoAt(lat: number, lon: number): string;
}): WorldExplorers {
  const { world, hud, nav, map, minimap, passport, passportCard, peers, folk, cue } = deps;
  const { host, spec, player, rig, geography } = world;
  const R = world.surface.radius;
  const places = geography.places;
  const towns = new Map(spec.body.settlements.map((town, index) => [town.id, index]));
  const guildPlaces = worldGuildTowns(spec).map((id) => towns.get(id)!).filter((index) => index !== undefined);
  // Earth's rings and jobs as their stores hold them: the level counts them on every world.
  const rings = readRecord(deviceStore());
  const jobs = readJobs(deviceJobStore());
  const landmarks = spec.landmarks.map((mark) => ({ id: mark.id, name: mark.name, lat: mark.lat, lon: mark.lon, iso: deps.isoAt(mark.lat, mark.lon) }));
  const ink = world.ctx.toon(world.ctx.palette.ink);
  const rigs = createRigLibrary(modelMaterial(ink.gradientMap!, ink.userData.outlineParameters as { thickness: number; color: [number, number, number] }));
  const traveller: ExplorerTraveller = { position: player.position, up: new THREE.Vector3(), forward: player.facing, onFoot: true, afoot: true, inVehicle: false };

  const explorersHost: ExplorersHost = {
    radius: R,
    places,
    guildPlaces,
    squares: () => world.settlements.guilds(places),
    records: () => ({ passport: passport.data, rings, jobs }),
    scene: world.scene,
    hudRoot: hud.root,
    lockTarget: host.renderer.domElement,
    folk,
    rigs,
    camera: () => rig.camera,
    traveller() {
      const inRocket = world.riding() !== null;
      traveller.position = player.position;
      traveller.up.copy(player.position).normalize();
      traveller.forward = player.facing;
      traveller.onFoot = player.craft === null && !inRocket;
      traveller.afoot = traveller.onFoot && !player.airborne;
      traveller.inVehicle = player.craft !== null || inRocket;
      return traveller;
    },
    groundAt: (direction) => R + world.groundAt(direction),
    peers: () => peers,
    cue,
    sound: () => host.sound(),
    announce: (text, icon) => hud.toast(text, icon ?? 'sparkle'),
    mark: (lat, lon, name, landmark) => nav.mark(lat, lon, name, landmark),
    setSpots: (spots) => minimap.setSpots(spots),
    name: () => deps.travellerName(),
    countryName: (iso) => deps.countryName(iso),
    stamped: () => new Set(passport.data.stamps.map((stamp) => stamp.iso)),
    landmarks: () => landmarks,
    suggestPopulation: SUGGEST_POPULATION,
    openMap: () => map.show(),
    openPassport: () => passportCard.show(),
    openWardrobe: () => host.traveller?.show(),
    appearance: () => host.appearance(),
  };

  let runtime: Explorers | null = null;
  let disposed = false;
  /** What happened before the runtime arrived, told once it has. */
  const early: ProgressEvent[] = [{ t: 'world', id: spec.id }];
  // A chunk cut off on the way is asked for again, twice, a little later each time.
  const arrive = (tries: number): Promise<typeof import('../../explorers.ts')> =>
    import('../../explorers.ts').catch((error: unknown) =>
      tries > 0 ? new Promise((resolve) => setTimeout(resolve, 2000 * (3 - tries))).then(() => arrive(tries - 1)) : Promise.reject(error));
  void arrive(2)
    .then(({ createExplorers }) => createExplorers(explorersHost))
    .then((made) => {
      if (disposed) {
        made.dispose();
        return;
      }
      runtime = made;
      for (const event of early.splice(0)) made.emit(event);
    })
    .catch((error: unknown) => console.warn('worlds: the guild and the progression did not load', error));

  function emit(event: ProgressEvent): void {
    if (runtime !== null) runtime.emit(event);
    else if (early.length < 32) early.push(event);
  }

  // The traveller, read each frame into Earth's events.
  const read = createTravellerReader(emit, SCENERY_SCALE);
  const rides = new WeakMap<object, number>();
  let rideCount = 0;
  const reading: TravellerReading = {
    position: player.position, mode: null, airborne: false, leaping: false, ride: null, rideKind: '', canopy: false,
    mapOpen: false, sitting: false, towns: passport.data.towns, depth: 0, altitude: null, speed: null, rocketFlying: false,
  };
  function modeNow(): MoveMode | null {
    const craft = player.craft;
    if (craft !== null) return craft.kind === 'rover' ? 'drive' : 'fly';
    if (player.airborne) return null;
    return player.velocity.length() > WALK_SPEED * RUNNING ? 'run' : 'walk';
  }

  const push = new THREE.Vector3();
  return {
    get runtime() {
      return runtime;
    },
    emit,
    update(dt) {
      const craft = player.craft;
      if (craft !== null && !rides.has(craft)) rides.set(craft, ++rideCount);
      reading.position = player.position;
      reading.mode = modeNow();
      reading.airborne = player.airborne;
      reading.leaping = craft === null && player.vertical > 0 && !player.parachute;
      reading.ride = craft === null ? null : `craft:${rides.get(craft)}`;
      reading.rideKind = craft?.kind ?? '';
      reading.canopy = player.canopy;
      reading.mapOpen = map.open;
      reading.towns = passport.data.towns;
      reading.altitude = craft !== null && craft.kind !== 'rover' ? Math.max(0, craft.position.length() - R - world.groundAt(craft.position)) : null;
      reading.speed = craft === null ? null : craft.speed;
      reading.rocketFlying = world.riding()?.state === 'flying';
      read(dt, reading);
      runtime?.frame(performance.now() / 1000, dt, innerWidth, innerHeight);
    },
    collide(position, radius) {
      const people = runtime?.guild.people;
      if (people === undefined) return false;
      push.set(0, 0, 0);
      if (!people.collide(position, radius, push)) return false;
      const keep = position.length();
      position.add(push).setLength(keep);
      return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      runtime?.dispose();
      runtime = null;
    },
  };
}
