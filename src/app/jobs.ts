/**
 * The jobs in the game: made once the session stands (behind a dynamic
 * import, out of the world's first load), handed the world each frame before
 * the offers are decided, and the jobs key.
 */
import * as THREE from 'three';
import { actionOf, inputBlocked } from '../controls.ts';
import { PLANET_RADIUS } from '../globe.ts';
import { isShown } from '../places.ts';
import { regionFor } from '../scenery/regions.ts';
import { isWater } from '../vehicles.ts';
import type { Jobs, JobsFrame, JobsRide } from '../jobs.ts';
import type { App } from './context.ts';
import { photoModeOn } from './photo-mode.ts';
import type { Tick } from './frame/tick.ts';

/** A step longer than this in one frame, units, is a teleport. */
const TELEPORT = 600;

export async function createWorldJobs(app: App): Promise<Jobs> {
  const [{ createJobs }, { createJobPanel }, { deviceJobStore }] = await Promise.all([
    import('../jobs.ts'),
    import('../jobs/panel.ts'),
    import('../jobs/store.ts'),
  ]);
  const places = app.places.all;
  const continentOf = new Map<string, string>(app.world.countries.map((country) => [country.iso, country.continent]));
  const nameOf = new Map<string, string>(app.world.countries.map((country) => [country.iso, country.name]));
  const standing = new THREE.Vector3();
  const jobs = createJobs({
    source: {
      places,
      roads: app.baked.roads,
      shown: (index) => isShown(places[index]!),
      groundAt: app.groundAt,
      isWater,
      radius: PLANET_RADIUS,
      taken: (direction, reach) => app.fleetSites.near(direction, reach, []).some((site) => site.at.angleTo(direction) * PLANET_RADIUS < reach),
    },
    folk: app.folk,
    standAt: (direction) => {
      const ground = Math.max(app.groundAt(direction), PLANET_RADIUS);
      standing.copy(direction).normalize().multiplyScalar(ground);
      return Math.max(ground, app.walls.madeHeightAt(standing));
    },
    regionOf: (place) => regionFor(place.iso, continentOf.get(place.iso) ?? '', place.lat).id,
    stripsNear: (direction, reach, out) => {
      for (const site of app.fleetSites.planesNear(direction, reach, [])) out.push(site);
      return out;
    },
    seatFrame: (vehicle, seat) => app.fleet.seatFrame(vehicle, seat),
    panel: createJobPanel(app.hud.root),
    storage: deviceJobStore(),
    announce: (text, iconName) => app.announce(text, iconName),
    cue: (name) => app.sound.audio.cue(name),
    countryName: (iso) => nameOf.get(iso) ?? iso,
    done: (job, medal, points) => app.emit({ t: 'job', kind: job.kind, medal, points, iso: job.iso, site: job.site }),
  });
  app.scene.add(jobs.group);
  addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
    if (inputBlocked(event) || actionOf(event.code) !== 'jobs' || photoModeOn()) return;
    jobs.cycle();
  });
  return jobs;
}

/** The phase that hands the jobs the world, before the offers are decided. */
export function createJobsPhase(app: App): (tick: Tick) => void {
  const { player, fleet, townsfolk, rig } = app;
  const crowns = new Map<string, THREE.Vector3>();
  const lastAt = new THREE.Vector3().copy(player.position);
  const givers: { key: string; crown: THREE.Vector3 }[] = [];
  const ride: JobsRide = { vehicle: '', kind: 'hatchback' as JobsRide['kind'], medium: 'road', seats: 1, driving: false };
  const frame: JobsFrame = {
    now: 0,
    dt: 0,
    position: player.position,
    ride: null,
    speed: 0,
    airborne: false,
    height: 0,
    givers,
    camera: rig.camera,
    width: 0,
    height2d: 0,
  };

  return (tick) => {
    const jobs = app.jobs;
    if (jobs === undefined) return;
    givers.length = 0;
    // Only on foot is anybody asked, so only then are they gathered.
    if (player.state === 'foot' && !player.airborne) {
      for (const key of townsfolk.standingKeys()) {
        let crown = crowns.get(key);
        if (crown === undefined) {
          if (crowns.size > 300) crowns.clear();
          crown = new THREE.Vector3();
          crowns.set(key, crown);
        }
        if (townsfolk.crownOf(key, crown)) givers.push({ key, crown });
      }
    }
    const held = fleet.current();
    const model = player.state === 'seated' ? player.ride?.model ?? null : null;
    if (held !== null && model !== null) {
      ride.vehicle = held.vehicle;
      ride.kind = model.kind;
      ride.medium = model.medium;
      ride.seats = model.seats.length;
      ride.driving = held.seat === 0;
      frame.ride = ride;
    } else frame.ride = null;
    // A step past `TELEPORT` in one frame is a jump across the map, not travel.
    frame.teleported = lastAt.distanceTo(player.position) > TELEPORT;
    lastAt.copy(player.position);
    frame.now = tick.now;
    frame.dt = tick.dt;
    frame.speed = frame.ride === null ? player.velocity : player.speed;
    frame.airborne = player.airborne;
    frame.height = player.position.length() - Math.max(tick.ground, PLANET_RADIUS);
    frame.width = innerWidth;
    frame.height2d = innerHeight;
    app.guard('jobs', () => jobs.frame(frame));
  };
}
