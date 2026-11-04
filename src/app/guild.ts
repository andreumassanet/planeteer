/**
 * The progression, the Explorers' Guild and the Field Guide in Earth's game:
 * the one runtime every world's game builds (`explorers.ts`), made once the
 * session stands, behind dynamic imports (out of the world's first load), and
 * handed Earth's own systems as the host it reads (`ExplorersHost`): the
 * places and their guilds, the passport, the rings, the jobs, the courses,
 * the landmarks, the account and the people near.
 */
import * as THREE from 'three';
import { latLonOf } from '../sphere.ts';
import { PLANET_RADIUS } from '../globe.ts';
import type { App } from './context.ts';
import type { Tick } from './frame/tick.ts';
import type { Explorers, ExplorersHost, ExplorerTraveller } from '../explorers.ts';
import type { ProgressRecords } from '../progress.ts';
import { photoModeOn } from './photo-mode.ts';
import { dressHero, heroAppearance } from '../avatar/hero.ts';

/** How near a course's start, units, the marshal lists it. */
const COURSE_LIST_REACH = 9000;
/** The smallest town the cartographer suggests for a new stamp. */
const SUGGEST_POPULATION = 100000;

export async function createWorldGuild(app: App): Promise<void> {
  const [{ createExplorers }, sites] = await Promise.all([import('../explorers.ts'), import('../guild/sites.ts')]);
  const places = app.places.all;
  const guildIndices = sites.guildPlaces(places);
  app.guildMarks = guildIndices.map((index) => ({ lat: places[index]!.lat, lon: places[index]!.lon, name: places[index]!.name }));

  let accountName: string | null = null;
  void app.account?.load().then((account) => {
    const read = (): void => {
      accountName = account.view.state === 'in' ? account.view.name || 'signed in' : null;
    };
    read();
    account.onChange(read);
  });

  const standing = new THREE.Vector3();
  const traveller: ExplorerTraveller = { position: app.player.position, up: new THREE.Vector3(), forward: new THREE.Vector3(), onFoot: true, afoot: true, inVehicle: false };
  const host: ExplorersHost = {
    radius: PLANET_RADIUS,
    places,
    guildPlaces: guildIndices,
    squares: () => app.settlements.guilds(),
    records: () => ({
      passport: app.passport.data,
      rings: app.thrills.rings.record,
      jobs: app.jobs?.record ?? { done: new Map() },
    }) as ProgressRecords,
    scene: app.scene,
    hudRoot: app.hud.root,
    blocksSight: (point) => app.settlements.blocksSight(point) || app.monuments.blocksSight(point),
    lockTarget: app.renderer.domElement,
    folk: app.folk,
    rigs: app.rigs,
    camera: () => app.rig.camera,
    traveller() {
      const player = app.player;
      traveller.position = player.position;
      traveller.up = player.up;
      traveller.forward = player.forward;
      traveller.onFoot = player.state === 'foot';
      traveller.afoot = player.state === 'foot' && !player.airborne && !photoModeOn();
      traveller.inVehicle = player.state === 'seated';
      return traveller;
    },
    // On a town's floor where there is one, as the jobs' people stand.
    groundAt(direction) {
      const ground = Math.max(app.groundAt(direction), PLANET_RADIUS);
      standing.copy(direction).normalize().multiplyScalar(ground);
      return Math.max(ground, app.walls.madeHeightAt(standing));
    },
    peers: () => app.peersLink,
    cue: (name) => app.sound.audio.cue(name),
    sound: () => (app.sound.audio.output !== null && app.sound.audio.bus !== null ? { context: app.sound.audio.output.context, node: app.sound.audio.bus } : null),
    announce: (text, icon) => app.announce(text, icon),
    mark: (lat, lon, name, landmark) => app.nav.mark(lat, lon, name, landmark),
    setSpots: (spots) => app.minimap.setSpots(spots),
    name: () => app.peersLink?.name ?? app.peersModule.storedName(),
    countryName: (iso) => app.world.countries.find((c) => c.iso === iso)?.name ?? iso,
    stamped: () => new Set(app.passport.data.stamps.map((stamp) => stamp.iso)),
    landmarks() {
      const seen = app.thrills.rings.record.landmarks;
      return app.placements.filter((placement) => !seen.has(placement.id));
    },
    suggestPopulation: SUGGEST_POPULATION,
    openMap: () => app.map.show(),
    openPassport: () => app.passportCard.show(),
    openWardrobe: () => app.traveller.show(),
    appearance: heroAppearance,
    dress: (look) => void dressHero(look),
    account: {
      available: () => app.account !== null,
      signedIn: () => accountName,
      signIn: () => void app.account?.load().then((account) => account.signIn()),
      openAccount: () => app.settings.show('account'),
    },
    jobs: {
      briefs() {
        const jobs = app.jobs;
        if (jobs === undefined) return [];
        return jobs.nearby
          .filter((job) => !jobs.doneToday(job))
          .slice(0, 8)
          .map((job) => ({ id: job.id, kind: job.kind, title: job.title, detail: job.line, distance: jobs.distanceTo(job), tracked: jobs.tracked?.id === job.id }));
      },
      track: (id) => app.jobs?.track(id) ?? false,
      cycle: () => app.jobs?.cycle(),
      spots(out) {
        const jobs = app.jobs;
        if (jobs === undefined) return;
        for (const job of jobs.nearby.slice(0, 12)) {
          if (jobs.doneToday(job)) continue;
          const tracked = jobs.tracked?.id === job.id;
          out.push({ x: job.pickup.x, y: job.pickup.y, z: job.pickup.z, kind: tracked ? 'tracked' : 'job', rim: tracked });
        }
      },
    },
    courses: {
      near() {
        const rings = app.thrills.rings;
        return rings.sites
          .map((site) => ({ site, units: site.at.angleTo(app.player.position) * PLANET_RADIUS }))
          .filter((entry) => entry.units < COURSE_LIST_REACH)
          .sort((a, b) => a.units - b.units)
          .slice(0, 6)
          .map(({ site, units }) => {
            const best = rings.record.courses.get(site.key);
            return { id: site.key, name: site.title, kind: site.kind, units, best: best === undefined ? null : { ms: best.ms, medal: best.medal } };
          });
      },
      lead(id) {
        const rings = app.thrills.rings;
        const site = rings.sites.find((candidate) => candidate.key === id);
        if (site === undefined) return;
        const { lat, lon } = latLonOf((rings.course(site.key)?.[0]?.centre ?? site.at).clone().normalize());
        app.nav.mark(lat, lon, site.title, false);
      },
      best(id) {
        const best = app.thrills.rings.record.courses.get(id);
        return best === undefined ? undefined : { ms: best.ms, medal: best.medal };
      },
    },
  };

  const explorers = await createExplorers(host);
  const { progress } = explorers;
  app.emit = (event) => {
    if (event.t !== 'postcard') {
      progress.emit(event);
      return;
    }
    const had = progress.career.stats.sets.get('postcards')?.has(event.landmark) === true;
    progress.emit(event);
    if (had) return;
    const name = app.placements.find((placement) => placement.id === event.landmark)?.name ?? 'a landmark';
    const count = progress.career.stats.sets.get('postcards')?.size ?? 1;
    app.announce(`Postcard: ${name} · ${count} of ${app.placements.length} collected`, 'camera');
    app.sound.audio.cue('stamp');
  };
  app.unlocked = () => explorers.unlocked();
  app.guild = explorers.guild;
  app.fieldGuide = explorers.fieldGuide;
  runtime = explorers;
  app.account?.attach({ career: progress } as Parameters<NonNullable<App['account']>['attach']>[0]);
  debugOf = () => explorers.debug();
}

let runtime: Explorers | null = null;
/** What the console reaches (`atlas.guild`). */
export let debugOf: () => Record<string, unknown> = () => ({});

/** The phase that runs the guild each frame, before the offers are decided. */
export function createGuildPhase(app: App): (tick: Tick) => void {
  return (tick) => {
    const explorers = runtime;
    if (explorers === null) return;
    app.guard('guild', () => explorers.frame(tick.now / 1000, tick.dt, innerWidth, innerHeight));
  };
}
