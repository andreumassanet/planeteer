/**
 * Standing on another world: `enterWorld(bodyId, host)`.
 *
 * The planet menu's *Explore* calls it with the page's renderer and frame
 * (`world-host.ts`), having suspended itself, and gets the screen back through
 * `host.exit()` once the world has stopped its loop and taken its DOM away;
 * `?world=<id>` calls `standalone`, which makes a renderer and a host of its
 * own and leaves by reloading without the parameter. Either way the world is
 * its own scene, its own loop and its own lights: nothing of Earth's world is
 * touched, and nothing here is in Earth's first load (`main.ts` reaches this
 * file through one `import()`; `scripts/check-worlds.ts` holds it).
 *
 * **And the game around it is Earth's**, the same modules built the same way
 * (`shell.ts`): the HUD, the minimap, the map, the chat, the players, the
 * settings, the passport, the marker, the bubble, the others online. A world
 * is a different place, never a different game.
 *
 * The pieces, each its own file:
 *
 * - `terrain.ts` — the one definition of the ground's height and colour;
 * - `tiles.ts` — the ground drawn, a cube-sphere quadtree, `decor.ts` on it,
 *   and the nations' colour over it from the air;
 * - `frontiers.ts` — the borders on the ground, from `system/geography.ts`;
 * - `surface.ts` — the world as the shared UI sees it (`planet.ts`);
 * - `sky.ts` — the sun, the stars, the planets, the light, day and night;
 * - `settlements.ts` and `architecture.ts` — the towns, merged and solid;
 * - `aliens.ts` — the people walking them; `glyphs.ts` and `speech.ts` —
 *   what they say and how it is written and heard;
 * - `player.ts`, `camera.ts`, `craft.ts` — the traveller, the lens, the craft;
 *   `arrival.ts` — where the traveller comes down and the craft wait;
 * - `ambient.ts` — dust devils, motes, streaks, glints, lightning and haze;
 * - `shell.ts` — the game around all of it.
 *
 * Debugging: `window.atlasWorld` — `.goTo(lat, lon)`, `.hour(h)`, `.stats()`,
 * `.spec`, `.terrain`, `.geography`, `.player`, `.rig`, `.leave()`; `.ufos()`
 * lists the parked saucers nearest first and `.toUfo(k)` walks you to one.
 */

import * as THREE from 'three';
import type { WorldHost } from '../world-host.ts';
import type { WorldSpec } from './contract.ts';
import { loadWorldSpec } from './registry.ts';
import { createTerrain } from './terrain.ts';
import { createGround } from './tiles.ts';
import { createDecor } from './decor.ts';
import { createOutposts } from './outposts.ts';
import { createSky } from './sky.ts';
import { arrivalOf, createSettlements } from './settlements.ts';
import type { Site } from './settlements.ts';
import { createCrowd } from './aliens.ts';
import type { KeepClear } from './aliens.ts';
import { createCraft, disposeCraft } from './craft.ts';
import type { Craft } from './craft.ts';
import { BODY_RADIUS, createWorldPlayer } from './player.ts';
import { createWorldRig } from './camera.ts';
import { createAmbient } from './ambient.ts';
import { createFrontiers } from './frontiers.ts';
import { surfaceOf } from './surface.ts';
import { createShell } from './shell.ts';
import { capitalOf, padOf, parkingOf, siteAt, ufoParkingOf } from './arrival.ts';
import type { UfoProbe } from './arrival.ts';
import type { CraftSpot } from './settlements.ts';
import { UFO_RADIUS } from './ufo.ts';
import { geographyOf } from '../system/geography.ts';
import { createSceneryContext } from '../scenery/contract.ts';
import { createInput } from '../input.ts';
import { buildAvatar, heroAppearance, prepareAvatar, wardrobeCast } from '../avatar.ts';
import { randomAppearance } from '../appearance.ts';
import { rngFrom } from '../scenery/random.ts';
import { DAY_MOOD, createToonRamp, setToonMood } from '../theme.ts';
import { createPost } from '../post.ts';
import { latLonOf, unitAt } from '../sphere.ts';
import { createEffects } from '../effects.ts';
import { beginFrameBuild, detailScale, endFrameBuild, sampleFrame, skipFrame } from '../view.ts';
import type { EffectsSubject } from '../effects.ts';
import { PAD_RADIUS, ROCKET_CLEAR, ROCKET_HEIGHT, ROCKET_REACH, ROCKET_WALL, createRocket, disposeRockets } from '../rocket.ts';
import type { Rocket } from '../rocket.ts';
import { newSample } from './terrain.ts';
import { createSkyships } from './skyships.ts';
import { createRoads } from './roads.ts';
import { swardOf } from './sward.ts';
import { createGrass } from '../grass.ts';
import { createTraffic } from './traffic.ts';
import type { TrafficRover } from './traffic.ts';
import { LAMP_FIELD, litAtNight, updateNight } from './night.ts';
import type { NightSources } from './night.ts';
import { createPassingSound } from '../passing-sound.ts';
import { PALETTE } from '../theme.ts';

/** The finest the ground splits whatever the render distance: past this a tile costs more than it shows. */
const GROUND_DETAIL_MAX = 4;
/** How long a frame may spend building ground tiles, ms, at the detail knob's 1. */
const GROUND_BUDGET = 5;
/** A town's rocket is built inside this, units from the traveller, and let go past the second. */
const ROCKET_BUILD = 1400;
const ROCKET_DROP = 1900;
/**
 * How often a pad nobody is at launches on its own, on average, seconds a
 * pad: with the three or four pads in sight from a town, one goes up every
 * minute or so.
 */
const AUTO_LAUNCH = 240;
/** Nearer than this to the traveller a pad waits for them rather than launching. */
const AUTO_QUIET = 90;
/** The skyships' passing voices, shared by every visit; see `buildWorld`. */
let sharedPassing: ReturnType<typeof createPassingSound> | null = null;

export async function enterWorld(bodyId: string, host: WorldHost): Promise<void> {
  const spec = await loadWorldSpec(bodyId);
  await prepareAvatar();
  const world = buildWorld(spec, host);
  world.start();
}

/**
 * `?world=<id>`: the world straight from the address bar, with a renderer,
 * a frame and a host of its own. `ready` is called once it is drawing, which is
 * when the loading card can go. `&site=<settlement>` lands in that town, and
 * without it in the capital; `&at=lat,lon` stands there.
 */
export async function standalone(bodyId: string, ready: () => void): Promise<void> {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  // As Earth's: a shadow map redrawn when the frame asks for it.
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  document.body.appendChild(renderer.domElement);
  const post = createPost(renderer);
  addEventListener('resize', () => {
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(innerWidth, innerHeight);
  });
  let sound: { context: AudioContext; node: AudioNode } | null = null;
  const open = (): void => {
    if (sound === null) {
      const context = new AudioContext();
      const node = context.createGain();
      node.gain.value = 0.8;
      node.connect(context.destination);
      sound = { context, node };
    }
    if (sound.context.state === 'suspended') void sound.context.resume();
  };
  addEventListener('pointerdown', open, { capture: true });
  addEventListener('keydown', open, { capture: true });
  const host: WorldHost = {
    renderer,
    draw: (scene, camera) => post.render(scene, camera),
    pixelRatio: () => Math.min(devicePixelRatio, 2),
    sound: () => sound,
    appearance: heroAppearance,
    cast: wardrobeCast,
    name: () => '',
    mode: 'offline',
    time: () => new Date(),
    exit: () => {
      const url = new URL(location.href);
      for (const key of ['world', 'hour', 'site', 'at']) url.searchParams.delete(key);
      location.href = url.toString();
    },
  };
  await enterWorld(bodyId, host);
  ready();
}

interface World {
  start(): void;
}

function buildWorld(spec: WorldSpec, host: WorldHost): World {
  const body = spec.body;
  const renderer = host.renderer;
  const query = new URLSearchParams(location.search);
  setToonMood(DAY_MOOD);
  const gradientMap = createToonRamp(4);
  const ctx = createSceneryContext();

  const terrain = createTerrain(spec);
  const R = terrain.radius;
  const geography = geographyOf(body);
  const surface = surfaceOf(terrain, geography);
  const scene = new THREE.Scene();
  scene.name = `world:${spec.id}`;
  const fog = new THREE.Fog(0xffffff, 1, 2);
  scene.fog = spec.sky.air > 0 ? fog : null;

  const sky = createSky(spec, scene);
  scene.add(sky.group);
  const political = geography.world;
  const nationPoint = new THREE.Vector3();
  // What stands between the towns, merged into the ground's tiles and a wall.
  const outposts = createOutposts(spec, terrain);
  const ground = createGround(terrain, {
    gradientMap,
    decorate: createDecor(spec, terrain, ctx, outposts),
    retire: (key) => outposts.retire(key),
    nations: {
      at: (x, y, z) => political.countryAtPoint(nationPoint.set(x, y, z)),
      colors: geography.countries.map((country) => country.color ?? 0x808080),
    },
  });
  // The lamps and the headlights light the ground after dark (`night.ts`).
  litAtNight(ground.material);
  scene.add(ground.group);
  const frontiers = createFrontiers(geography, terrain);
  scene.add(frontiers.group);
  const settlements = createSettlements(spec, terrain, ctx, gradientMap);
  scene.add(settlements.group);
  // The roads between the towns, on the drawn ground.
  const roads = createRoads(spec, terrain, settlements.sites, settlements.network, gradientMap);
  scene.add(roads.group);
  // Earth's grass, grown from this world's ground: what gives it a nap underfoot (`sward.ts`).
  const swardGround = swardOf(spec, terrain);
  const sward = swardGround === null ? null : createGrass(swardGround, { radius: R, earth: false });
  if (sward !== null) scene.add(sward.group);
  const swardPress = { forward: new THREE.Vector3(), length: 0, width: 0 };
  // And the rovers that drive them.
  // Their drivers near (`traffic.ts`): bodies of the cast, each dressed by
  // its rover's own seed, the traveller's own cast and nothing new to load.
  const traffic = createTraffic(spec, roads, ctx, gradientMap, (look) => buildAvatar(randomAppearance(rngFrom('worlds', spec.id, 'driver', look))));
  scene.add(traffic.group);
  // The arrival and the parked craft are kept clear of people; filled in
  // below, once both are placed, and read only when a town is peopled.
  const keepClear = new Map<string, KeepClear[]>();
  const crowd = createCrowd(spec, settlements, ctx, gradientMap, (site) => keepClear.get(site.id) ?? []);
  scene.add(crowd.group);
  const ambient = createAmbient(spec.ambient, spec.id, spec.wind);
  scene.add(ambient.group);
  // Earth's own effects: the dust off a foot and a landing, and a rocket's
  // fire and smoke.
  const effects = createEffects();
  scene.add(effects.group);
  // Where somebody lives, their craft cross the sky, heard as Earth's are.
  const skyships = spec.civilisation === null ? null : createSkyships(ctx, gradientMap, PALETTE.white, PALETTE.violet);
  if (skyships !== null) scene.add(skyships.group);
  // One for the page: its voices are made once and kept, and a second world
  // visited would otherwise start a second set under the first.
  const passing = (sharedPassing ??= createPassingSound());
  let passingBus: GainNode | null = null;

  /**
   * What lights the night round the traveller: the towns' lamps and
   * doorways, and the headlights of the craft being driven — two lamps at
   * its nose, a little apart, aimed down the way it is going.
   */
  /** What the traffic gives way to: the traveller, and the craft standing about. */
  const blockers: THREE.Vector3[] = [];
  const headUp = new THREE.Vector3();
  const headSide = new THREE.Vector3();
  const headAt = new THREE.Vector3();
  const headAim = new THREE.Vector3();
  /** The headlights written so far this frame, seven floats each (`burn`). */
  let headCount = 0;
  /** Two lamps at a craft's nose, a little apart, aimed down the way it is going, while `out` has room. */
  function burn(out: Float32Array, max: number, position: THREE.Vector3, heading: THREE.Vector3, radius: number, down: number): void {
    headUp.copy(position).normalize();
    headSide.crossVectors(heading, headUp).normalize();
    headAim.copy(heading).addScaledVector(headUp, -down).normalize();
    for (let side = -1; side <= 1; side += 2) {
      if (headCount >= max) return;
      headAt.copy(position).addScaledVector(heading, radius * 0.8).addScaledVector(headSide, side * radius * 0.3).addScaledVector(headUp, 1.3);
      const at = headCount * 7;
      out[at] = headAt.x;
      out[at + 1] = headAt.y;
      out[at + 2] = headAt.z;
      out[at + 3] = headAim.x;
      out[at + 4] = headAim.y;
      out[at + 5] = headAim.z;
      out[at + 6] = 1;
      headCount++;
    }
  }
  /** The traffic, nearest the traveller first, and each one's distance: kept, not made a frame. */
  const nearRovers: TrafficRover[] = [];
  const roverAway = new Map<TrafficRover, number>();
  const byAway = (a: TrafficRover, b: TrafficRover): number => roverAway.get(a)! - roverAway.get(b)!;
  let lampScratch = new Float32Array(64);
  const lampOrder: number[] = [];
  const nightSources: NightSources = {
    // The towns' lamps and the outposts', each up to `max`, merged nearest
    // first: filled one after the other, a near outpost's door lost its
    // place to the far lamps of a town.
    lampsNear(point, out, max) {
      if (lampScratch.length < max * 8) lampScratch = new Float32Array(max * 8);
      const towns = settlements.lampsNear(point, lampScratch, max);
      const all = outposts.lampsNear(point, lampScratch, towns, max * 2);
      const order = lampOrder;
      order.length = 0;
      for (let k = 0; k < all; k++) order.push(k);
      order.sort((a, b) => lampScratch[a * 4 + 3]! - lampScratch[b * 4 + 3]!);
      const n = Math.min(max, all);
      for (let k = 0; k < n; k++) {
        const from = order[k]! * 4;
        out[k * 4] = lampScratch[from]!;
        out[k * 4 + 1] = lampScratch[from + 1]!;
        out[k * 4 + 2] = lampScratch[from + 2]!;
        out[k * 4 + 3] = lampScratch[from + 3]!;
      }
      return n;
    },
    headlights(out, max) {
      headCount = 0;
      const craft = player.craft;
      // A saucer aloft shines straight down from under its belly, where its
      // beam is; a lander aloft down ahead of it; anything else down the road.
      if (craft !== null && craft.kind === 'ufo' && craft.airborne) burn(out, max, craft.position, craft.heading, craft.radius * 0.25, 6);
      else if (craft !== null) burn(out, max, craft.position, craft.heading, craft.radius, craft.kind === 'lander' && craft.airborne ? 0.9 : 0.12);
      // Then the traffic's, nearest first: by their distances, taken once.
      const near = nearRovers;
      near.length = 0;
      for (const rover of traffic.rovers) near.push(rover);
      roverAway.clear();
      for (const rover of near) roverAway.set(rover, rover.position.distanceToSquared(player.position));
      near.sort(byAway);
      for (const rover of near) {
        if (headCount >= max || rover.position.distanceTo(player.position) > LAMP_FIELD * 1.5) break;
        burn(out, max, rover.position, rover.heading, rover.radius, 0.12);
      }
      return headCount;
    },
  };

  /** What a foot stands on: the drawn ground, or a town's platform or a road's top over it. */
  const skyways = spec.ground === 'cloud-deck';
  /** How far under a skyway's top a body must be to pass under it rather than stand on it. */
  const UNDER_SKYWAY = 2.5;
  const groundAt = (point: THREE.Vector3): number => {
    const length = point.length() || 1;
    const x = point.x / length;
    const y = point.y / length;
    const z = point.z / length;
    const floor = settlements.floorAt(x, y, z);
    let road = roads.surfaceAt(x, y, z);
    const land = terrain.groundAt(x, y, z);
    // A skyway over a deck is a roof from below, as a bridge's deck is on
    // Earth (`ribbonHeightAt`): a body under it stays on the clouds.
    if (road !== null && skyways && length - R < road - UNDER_SKYWAY) road = null;
    return Math.max(land, floor ?? land, road ?? land);
  };

  const avatar = buildAvatar(host.appearance());
  scene.add(avatar.group);
  const crafts: Craft[] = [];
  /** The towns' rockets standing, by town: built as the traveller comes near (`streamRockets`). */
  const rockets = new Map<string, Rocket>();
  const collide = (position: THREE.Vector3, radius: number): boolean => {
    let moved = settlements.collide(position, radius);
    if (outposts.collide(position, radius)) moved = true;
    for (const craft of crafts) {
      if (craft === player.craft) continue;
      const d = position.distanceTo(craft.position);
      const min = craft.radius + radius;
      if (d < min && d > 1e-6) {
        const keep = position.length();
        position.sub(craft.position).setLength(min).add(craft.position).setLength(keep);
        moved = true;
      }
    }
    // A rocket and its tower are a wall, as a parked craft is.
    for (const rocket of rockets.values()) {
      const d = position.distanceTo(rocket.position);
      const min = ROCKET_WALL + radius;
      if (d < min && d > 1e-6) {
        const keep = position.length();
        position.sub(rocket.position).setLength(min).add(rocket.position).setLength(keep);
        moved = true;
      }
    }
    return moved;
  };
  const player = createWorldPlayer(
    {
      radius: R,
      gravity: body.gravity,
      groundAt,
      collide,
      // Earth's feet: a footfall a heel strike, and a landing after a jump.
      onStep: (weight) => {
        host.step?.(weight);
        effects.step(weight);
      },
      onTouchdown: (speed) => {
        if (speed > 12) host.cue?.('land');
        effects.touchdown(speed);
      },
    },
    avatar,
  );
  const rig = createWorldRig(settlements.blocks);

  // **Where the traveller comes down** (`arrival.ts`): the town chosen in the
  // menu, on its own arrival; a remembered place, or `?at=`, as found — a
  // town's arrival if it is in one; `&site=`; else the capital.
  const arrival = host.arrival ?? null;
  const byId = (id: string | null): Site | null => (id === null ? null : settlements.sites.find((site) => site.id === id) ?? null);
  const at = query.get('at')?.split(',').map(Number);
  const linked = at !== undefined && at.length === 2 && at.every(Number.isFinite) ? { lat: at[0]!, lon: at[1]! } : null;
  let spawnSite: Site | null = null;
  const start = new THREE.Vector3();
  const look = new THREE.Vector3();

  /** Stands the traveller at its arrival in `site`, looking in at the square. */
  function standIn(site: Site): void {
    const point = arrivalOf(site);
    settlements.toWorld(site, point.x, 0, point.z, start);
    look.copy(site.origin).sub(start);
    player.place(start.normalize(), look);
  }

  /**
   * Stands the traveller at `lat`, `lon`. A town's own point — what `/goto`
   * and the map hand over, which is its square, where its centrepiece stands
   * — is taken to its arrival; anywhere else, a place remembered included,
   * is stood on as found, facing north as Earth's `goTo` does, and pushed
   * clear of any wall once the town round it stands (`settle`).
   */
  function standAt(lat: number, lon: number): Site | null {
    unitAt(lat, lon, start);
    const site = siteAt(settlements.sites, R, start);
    if (site !== null && !site.landmark && start.angleTo(site.dir) * R < site.plaza + 2) {
      standIn(site);
      return site;
    }
    look.set(0, 1, 0).addScaledVector(start, -start.y);
    if (look.lengthSq() < 1e-8) look.set(1, 0, 0);
    player.place(start, look);
    return site;
  }

  if (arrival !== null && arrival.settlement !== null && byId(arrival.settlement) !== null) {
    spawnSite = byId(arrival.settlement);
    standIn(spawnSite!);
  } else if (arrival !== null) spawnSite = standAt(arrival.lat, arrival.lon);
  else if (linked !== null) spawnSite = standAt(linked.lat, linked.lon);
  else {
    spawnSite = byId(query.get('site')) ?? capitalOf(spec, settlements.sites);
    if (spawnSite !== null) standIn(spawnSite);
    else standAt(0, 0);
  }
  rig.heading.copy(player.facing);
  const home = (() => {
    const { lat, lon } = latLonOf(player.position);
    return { lat, lon, name: spawnSite?.name ?? arrival?.name ?? body.name };
  })();
  if (spawnSite !== null) {
    const point = arrivalOf(spawnSite);
    keepClear.set(spawnSite.id, [{ x: point.x, z: point.z, r: 12 }]);
  }

  const padAt = new THREE.Vector3();
  const ufoAt = new THREE.Vector3();
  /** A town's roads within `within` of a point in its frame (`padOf`, `ufoParkingOf`). */
  const roadNear = (site: Site) => (x: number, z: number, within: number): boolean => roads.near(settlements.toWorld(site, x, 0, z, padAt), within).length > 0;
  /** What `ufoParkingOf` asks of the ground round a town, in its frame. */
  const ufoProbe = (site: Site): UfoProbe => ({
    road: roadNear(site),
    other: (x, z) => {
      const found = siteAt(settlements.sites, R, settlements.toWorld(site, x, 0, z, ufoAt));
      return found !== null && found !== site;
    },
    // The land and a deck town's platform, never a road's top: what a road
    // has built so far is not a pure function of the world.
    ground: (x, z) => {
      const n = settlements.toWorld(site, x, 0, z, ufoAt).normalize();
      const land = terrain.groundAt(n.x, n.y, n.z);
      return Math.max(land, settlements.floorAt(n.x, n.y, n.z) ?? land);
    },
  });
  /** The town whose saucer waits among the arrival's craft, off its corner, if one does. */
  let arrivalUfo: Site | null = null;

  // The craft: in the town you came down in, on its avenues and past its
  // edge (`parkingOf`) — a saucer off a corner of its square, as the towns
  // park theirs (`ufoParkingOf`), where one is clear — out in the open, round you.
  spec.vehicles.forEach((vehicle, k) => {
    const kind = typeof vehicle === 'string' ? vehicle : vehicle.kind;
    const flies = kind === 'lander' || kind === 'aerostat' || kind === 'ufo';
    const where = new THREE.Vector3();
    const heading = new THREE.Vector3();
    const cornered =
      kind === 'ufo' && spawnSite !== null && spawnSite.town !== null && !spawnSite.landmark
        ? ufoParkingOf(spec, spawnSite, padOf(spawnSite, spec.vehicles.length, roadNear(spawnSite)).corner, ufoProbe(spawnSite), true)
        : null;
    if (cornered !== null && spawnSite !== null) {
      arrivalUfo = spawnSite;
      settlements.toWorld(spawnSite, cornered.x, 0, cornered.z, where);
      settlements.toWorld(spawnSite, cornered.ahead.x, 0, cornered.ahead.z, heading);
      heading.sub(where);
    } else if (spawnSite !== null && !spawnSite.landmark) {
      const spot = parkingOf(spawnSite, k, flies);
      settlements.toWorld(spawnSite, spot.x, 0, spot.z, where);
      settlements.toWorld(spawnSite, spot.ahead.x, 0, spot.ahead.z, heading);
      heading.sub(where);
    } else {
      const up = player.position.clone().normalize();
      const side = new THREE.Vector3().crossVectors(player.facing, up).normalize();
      where.copy(player.position).addScaledVector(side, 14 + k * 14).addScaledVector(player.facing, 6);
      heading.copy(player.facing);
      // Never inside the landmark the traveller arrived at: out past its
      // ground, each a little further round than the last.
      if (spawnSite !== null) {
        const out = where.clone().sub(spawnSite.origin);
        out.addScaledVector(spawnSite.dir, -out.dot(spawnSite.dir));
        const least = spawnSite.radius + 8 + k * 6;
        if (out.length() < least) {
          if (out.lengthSq() < 1e-6) out.copy(side);
          where.copy(spawnSite.origin).addScaledVector(out.normalize(), least);
        }
      }
    }
    where.setLength(R + groundAt(where));
    const up = where.clone().normalize();
    heading.addScaledVector(up, -heading.dot(up)).normalize();
    // Nothing lies about under a saucer off a corner, as under the towns' own.
    if (cornered !== null) terrain.keepBare(where.x, where.y, where.z, UFO_RADIUS + 4);
    const craft = createCraft(vehicle, ctx, gradientMap, where, heading, spec.wind);
    craft.update(0, null, groundAt, 1, R);
    scene.add(craft.object);
    crafts.push(craft);
    if (spawnSite !== null && !spawnSite.landmark) {
      const local = craft.position.clone().sub(spawnSite.origin).applyQuaternion(spawnSite.quaternion.clone().invert());
      keepClear.get(spawnSite.id)?.push({ x: local.x, z: local.z, r: craft.radius + 3 });
    }
  });

  /**
   * **Every town has a launch pad**, past its edge on an avenue the craft do
   * not take (`parkingOf`, one slot past theirs), so wherever the traveller
   * is there is a way off the world within a walk; kept clear of people.
   */
  const pads = new Map<string, { site: Site; x: number; z: number; ahead: { x: number; z: number } }>();
  /** What a parked craft keeps of the people walking past it, units: a rover's half-length and a step. */
  const PARKED_CLEAR = 6;
  const padAhead = new THREE.Vector3();
  const padUp = new THREE.Vector3();
  const padSide = new THREE.Vector3();
  const padOther = new THREE.Vector3();
  const padProbe = new THREE.Vector3();
  /**
   * The saucers parked off the towns' corners (`ufoParkingOf`), by town: a
   * craft to take like the town's own (`streamCraft`), after them in its list.
   */
  const ufoSpots = new Map<string, CraftSpot[]>();
  for (const site of settlements.sites) {
    if (site.landmark) continue;
    const spot = padOf(site, spec.vehicles.length, roadNear(site));
    pads.set(site.id, { site, ...spot });
    const clear = keepClear.get(site.id) ?? [];
    clear.push({ x: spot.x, z: spot.z, r: ROCKET_CLEAR });
    keepClear.set(site.id, clear);
    // Nothing lies about on it, or under the camera that watches it go.
    settlements.toWorld(site, spot.x, 0, spot.z, padAt);
    terrain.keepBare(padAt.x, padAt.y, padAt.z, ROCKET_CLEAR + ROCKET_HEIGHT * 1.6);
    // The town the traveller came down in has its saucer among the arrival's craft.
    const ufo = site === arrivalUfo ? null : ufoParkingOf(spec, site, spot.corner, ufoProbe(site));
    if (ufo !== null) {
      ufoSpots.set(site.id, [{ vehicle: { kind: 'ufo', name: 'the saucer', livery: ufo.livery }, x: ufo.x, y: 0, z: ufo.z, yaw: Math.atan2(ufo.ahead.x - ufo.x, ufo.ahead.z - ufo.z) }]);
      clear.push({ x: ufo.x, z: ufo.z, r: UFO_RADIUS + 3 });
      // Nothing lies about under it, and no outpost is planned on it.
      settlements.toWorld(site, ufo.x, 0, ufo.z, ufoAt);
      terrain.keepBare(ufoAt.x, ufoAt.y, ufoAt.z, UFO_RADIUS + 4);
    }
  }
  /** Everything a town keeps to take: its own craft, then its saucer. */
  const spotsOf = (site: Site): readonly CraftSpot[] => {
    const ufo = ufoSpots.get(site.id);
    return ufo === undefined ? settlements.craftAt(site) : [...settlements.craftAt(site), ...ufo];
  };
  // The craft standing in a town are kept clear of its people, as the pads are.
  for (const site of settlements.sites) {
    const spots = settlements.craftAt(site);
    if (spots.length === 0) continue;
    const clear = keepClear.get(site.id) ?? [];
    for (const spot of spots) clear.push({ x: spot.x, z: spot.z, r: PARKED_CLEAR });
    keepClear.set(site.id, clear);
  }
  /** The pads near enough built, the far ones let go. */
  function streamRockets(from: THREE.Vector3): void {
    for (const [id, pad] of pads) {
      const away = from.distanceTo(pad.site.origin);
      const standing = rockets.get(id);
      if (standing === undefined && away < ROCKET_BUILD * Math.max(1, settlements.reach)) {
        settlements.toWorld(pad.site, pad.x, 0, pad.z, padAt);
        settlements.toWorld(pad.site, pad.ahead.x, 0, pad.ahead.z, padAhead);
        // On the highest ground under the pad: its drum reaches down to the rest.
        padUp.copy(padAt).normalize();
        padSide.set(padUp.y, -padUp.x, 0);
        if (padSide.lengthSq() < 1e-8) padSide.set(1, 0, 0);
        padSide.normalize();
        padOther.crossVectors(padUp, padSide);
        let seat = groundAt(padAt);
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          padProbe.copy(padAt).addScaledVector(padSide, Math.cos(a) * PAD_RADIUS).addScaledVector(padOther, Math.sin(a) * PAD_RADIUS);
          seat = Math.max(seat, groundAt(padProbe));
        }
        padAt.setLength(R + seat);
        padAhead.sub(padAt);
        const rocket = createRocket(padAt, padUp, padAhead, gradientMap);
        scene.add(rocket.object);
        rockets.set(id, rocket);
      } else if (standing !== undefined && away > ROCKET_DROP * Math.max(1, settlements.reach) && standing !== riding) {
        standing.dispose();
        rockets.delete(id);
      }
    }
  }
  streamRockets(player.position);

  /**
   * **Every vehicle in the world can be taken**, as on Earth: the cars on a
   * town's main streets, the ship on its pad and a landmark's own rover are
   * craft (`settlements.craftAt`), the engine's models at the engine's sizes,
   * built while their town stands and let go with it — unless the traveller
   * has moved one, which stays where it was left.
   */
  const standingCraft = new Map<string, Craft[]>();
  /** The craft nobody has touched, which stand still and are not updated. */
  const still = new Set<Craft>();
  const spotAt = new THREE.Vector3();
  const spotAhead = new THREE.Vector3();
  /** Which town spot each streamed craft came from, and the spots whose craft the traveller took. */
  const spotOf = new WeakMap<Craft, string>();
  const takenSpots = new Set<string>();
  function streamCraft(): void {
    for (const site of settlements.sites) {
      const have = standingCraft.get(site.id);
      if (site.mesh !== null && have === undefined) {
        const made: Craft[] = [];
        for (const [index, spot] of spotsOf(site).entries()) {
          // A spot whose craft the traveller has taken stays empty: that craft
          // is wherever it was left, and two of it would stand otherwise.
          if (takenSpots.has(`${site.id}:${index}`)) continue;
          settlements.toWorld(site, spot.x, spot.y, spot.z, spotAt);
          settlements.toWorld(site, spot.x + Math.sin(spot.yaw), spot.y, spot.z + Math.cos(spot.yaw), spotAhead).sub(spotAt);
          spotAt.setLength(R + groundAt(spotAt));
          const craft = createCraft(spot.vehicle, ctx, gradientMap, spotAt, spotAhead.normalize(), spec.wind);
          craft.update(0, null, groundAt, player.gravity, R);
          scene.add(craft.object);
          crafts.push(craft);
          still.add(craft);
          made.push(craft);
          spotOf.set(craft, `${site.id}:${index}`);
        }
        standingCraft.set(site.id, made);
      } else if (site.mesh === null && have !== undefined) {
        for (const craft of have) {
          if (!still.has(craft) || craft === player.craft) {
            const spot = spotOf.get(craft);
            if (spot !== undefined) takenSpots.add(spot);
            continue;
          }
          still.delete(craft);
          crafts.splice(crafts.indexOf(craft), 1);
          disposeCraft(craft);
        }
        standingCraft.delete(site.id);
      }
    }
  }

  /** The rocket the traveller is in, or null. */
  let riding: Rocket | null = null;

  function rocketInReach(): Rocket | null {
    let found: Rocket | null = null;
    let best = Infinity;
    for (const rocket of rockets.values()) {
      if (rocket.state !== 'parked') continue;
      const d = rocket.position.distanceTo(player.position);
      if (d < ROCKET_REACH && d < best) [found, best] = [rocket, d];
    }
    return found;
  }

  function boardRocket(rocket: Rocket): void {
    if (player.craft !== null) player.leave();
    rocket.board(player.avatar.group);
    riding = rocket;
  }

  const stepOut = new THREE.Vector3();
  function leaveRocket(): void {
    if (riding === null || !riding.leave(stepOut)) return;
    const facing = stepOut.clone().sub(riding.position);
    riding = null;
    player.place(stepOut, facing);
    rig.snap(player, groundAt, R, terrain.high);
  }

  function craftInReach(): Craft | null {
    let found: Craft | null = null;
    let best = Infinity;
    for (const craft of crafts) {
      const d = craft.position.distanceTo(player.position);
      if (d < craft.reach && d < best) [found, best] = [craft, d];
    }
    // Not the traffic's: a rover on the road has its driver at the wheel, as
    // a car on Earth's has (`traffic.ts`), and `E` beside one says so.
    return found;
  }

  const input = createInput(renderer.domElement);

  // The first frame's ground and towns, before anything is drawn.
  const size = new THREE.Vector2();
  renderer.getSize(size);
  rig.resize(size.x, size.y);
  const noInput = { move: { x: 0, y: 0 }, look: { x: 0, y: 0 }, zoom: 0, run: false, jump: false, climb: false, dive: false, use: false, view: false };
  function settle(): void {
    rig.aim(0, noInput, player);
    player.update(0, noInput, rig.steer);
    rig.snap(player, groundAt, R, terrain.high);
    settlements.prime(rig.camera.position);
    // The roads round the traveller, so a skyway under their feet is there
    // to stand on before they are put down (`roads.surfaceAt` knows only
    // what has been built).
    roads.update(player.position, 1);
    // A town raised round the traveller may put a wall where they stand: out
    // of it, and back on the ground.
    for (let k = 0; k < 8 && collide(player.position, BODY_RADIUS); k++) continue;
    player.place(player.position, player.facing);
  }
  settle();
  ground.prime(rig.camera.position);

  let running = true;
  const shell = createShell({
    host,
    spec,
    geography,
    surface,
    terrain,
    scene,
    ctx,
    player,
    rig,
    sky,
    ground,
    frontiers,
    settlements,
    crowd,
    crafts,
    input,
    roadLines: () => roads.lines(),
    groundAt,
    craftInReach,
    occupiedInReach: () => traffic.occupiedNear(player.position),
    jumpTo(lat, lon) {
      if (player.craft !== null) player.leave();
      // Out of a rocket too: on its pad it is a step out; gone up, it is put back.
      if (riding !== null && !riding.leave(stepOut)) riding.reset();
      riding = null;
      standAt(lat, lon);
      rig.heading.copy(player.facing);
      settle();
    },
    home,
    leave: () => leave('system'),
    rocketInReach,
    riding: () => riding,
    boardRocket,
    leaveRocket,
  });

  // The clock: the real one, local solar time where you stand, as the menu's
  // was when the town was chosen; `?hour=` turns it, and so do the settings
  // and `/time` from there.
  const wantedHour = Number(query.get('hour'));
  if (query.get('hour') !== null && Number.isFinite(wantedHour)) sky.setHour(wantedHour, shell.date(), player.position);
  sky.update(shell.date(), player.position, rig.camera.position, rig.camera.far);

  let last = performance.now();
  /**
   * The cream that comes down over the end of a launch, as Earth's dive into a
   * town ends under one, and is lifted off the solar system once the menu is
   * back under it.
   */
  const curtain = document.createElement('div');
  curtain.style.cssText = 'position:fixed;inset:0;z-index:20;pointer-events:none;opacity:0;display:none;background:radial-gradient(circle at 50% 42%,#fff2e8 0 35%,#fde6e1 100%)';
  document.body.appendChild(curtain);
  const up = new THREE.Vector3();
  const effectsSubject: EffectsSubject = {
    get position() {
      return player.position;
    },
    get forward() {
      return player.facing;
    },
    get up() {
      return up.copy(player.position).normalize();
    },
    get state() {
      return player.craft === null && riding === null ? 'foot' : 'seated';
    },
    get airborne() {
      return player.airborne;
    },
    grounded: true,
    ride: null,
  };
  let dustAt = 0;
  /**
   * What the craft raise off the ground, as Earth's vehicles do: a ship low
   * over it blows a ring of dust out from under its hull, thicker the nearer
   * it is (`THRUST_DUST`), and a rover under way throws a little off its back
   * wheels — the traveller's own and the traffic's near them.
   */
  const THRUST_DUST = 24;
  const DUST_NEAR = 160;
  let thrustClock = 0;
  let wheelClock = 0;
  const dustPoint = new THREE.Vector3();
  const dustSide = new THREE.Vector3();
  function raiseDust(dt: number): void {
    thrustClock -= dt;
    wheelClock -= dt;
    const thrust = thrustClock <= 0;
    const wheels = wheelClock <= 0;
    if (thrust) thrustClock = 0.09;
    if (wheels) wheelClock = 0.16;
    const visit = (craft: Craft): void => {
      if (craft.position.distanceTo(player.position) > DUST_NEAR) return;
      if (thrust && (craft.kind === 'lander' || craft.kind === 'ufo') && craft.airborne) {
        const ground = R + groundAt(craft.position);
        const clearance = craft.position.length() - ground;
        if (clearance > THRUST_DUST) return;
        const near = 1 - clearance / THRUST_DUST;
        const up = dustSide.copy(craft.position).normalize();
        dustPoint.copy(up).multiplyScalar(ground);
        effects.dustAt(dustPoint, craft.radius * (1 + clearance / THRUST_DUST), Math.round(2 + 5 * near));
      } else if (wheels && craft.kind === 'rover' && !craft.airborne && Math.abs(craft.speed) > 7) {
        dustPoint.copy(craft.position).addScaledVector(craft.heading, -craft.radius * 0.8 * Math.sign(craft.speed));
        dustPoint.setLength(R + groundAt(dustPoint));
        effects.dustAt(dustPoint, 1.4, Math.abs(craft.speed) > 16 ? 3 : 2);
      }
    };
    if (player.craft !== null) visit(player.craft);
    for (const rover of traffic.rovers) visit(rover.craft);
  }
  const dustSample = newSample();
  const dustColor = new THREE.Color();
  const paler = new THREE.Color(0xffffff);
  const scratchUnit = new THREE.Vector3();

  function frame(now: number): void {
    if (!running) return;
    requestAnimationFrame(frame);
    const interval = now - last;
    const dt = Math.min(0.1, Math.max(0, interval / 1000));
    last = now;
    const began = performance.now();
    // The frame's one build allowance, as Earth's loop opens it (`view.ts`).
    beginFrameBuild();
    // **Earth's render distance** (`view.ts`), one knob for every world: as a
    // multiple of its default it is how finely the ground splits, how far
    // the towns are built and the pads stand, and how far the haze opens —
    // linearly, the curve Earth's haze follows (`detailScale`, `detailFog`).
    const reachScale = detailScale();
    ground.detail = Math.min(GROUND_DETAIL_MAX, Math.max(0.5, reachScale));
    settlements.reach = reachScale;
    // Earth's renderer counts both of a frame's passes by hand (`autoReset`
    // off); counted here per frame the same way, for `atlasWorld.stats()`.
    renderer.info.reset();
    const state = input.state;

    // A craft just boarded: touched now, and a rover off the road is the traveller's.
    const boarded = player.craft;
    if (boarded !== null) {
      still.delete(boarded);
      if (!crafts.includes(boarded)) {
        traffic.take(boarded);
        scene.add(boarded.object);
        crafts.push(boarded);
      }
    }
    if (riding === null) {
      rig.aim(dt, state, player);
      player.update(dt, state, rig.steer);
    }
    for (const craft of crafts) if (craft !== player.craft && !still.has(craft)) craft.update(dt, null, groundAt, player.gravity, R);
    streamCraft();
    renderer.getSize(size);
    rig.resize(size.x, size.y);
    const ride = riding;
    if (ride === null) rig.follow(dt, player, groundAt, R, terrain.high);
    else {
      // In the rocket: the body rides in it and the lens is the launch's.
      player.position.copy(ride.seat);
      ride.frame(rig.camera, dt);
    }
    const eye = rig.camera.position;

    // The pads: streamed in round the traveller, lit by whoever holds
    // `Space` in one, and now and then by nobody.
    streamRockets(player.position);
    const sound = host.sound();
    for (const rocket of rockets.values()) {
      const mine = rocket === ride;
      if (!mine && rocket.state === 'parked' && rocket.position.distanceTo(player.position) > AUTO_QUIET && Math.random() < dt / AUTO_LAUNCH) rocket.autolaunch();
      rocket.update(dt, mine && state.climb, eye, effects, sound);
    }
    if (ride !== null) {
      curtain.style.opacity = ride.curtain.toFixed(3);
      curtain.style.display = ride.curtain > 0 ? '' : 'none';
      if (ride.curtain >= 1) {
        leave('system');
        return;
      }
    }
    ambient.eachDevil((base, upward, color, height, carry) => effects.whirl(carry, base, upward, height, color, dt));
    raiseDust(dt);
    effects.update(dt, effectsSubject, rig.camera);
    if (skyships !== null) {
      skyships.update(dt, player.position, groundAt, R);
      const bus = sound?.node;
      passingBus = bus instanceof GainNode ? bus : null;
      passing.update(passingBus, skyships.nearest);
    }
    if (dustAt-- <= 0) {
      // The dust a foot raises is the ground's own colour, a little paler.
      dustAt = 30;
      const unit = scratchUnit.copy(player.position).normalize();
      terrain.sample(unit.x, unit.y, unit.z, dustSample);
      dustColor.setRGB(dustSample.r, dustSample.g, dustSample.b, THREE.LinearSRGBColorSpace).lerp(paler, 0.25);
      effects.setDust(dustColor.getHex());
    }

    ground.time += dt;
    ground.update(eye, GROUND_BUDGET * ground.detail);
    settlements.update(eye);
    roads.update(eye, reachScale);
    blockers.length = 0;
    blockers.push(player.position);
    for (const craft of crafts) if (craft !== player.craft) blockers.push(craft.position);
    traffic.update(dt, player.position, blockers);
    if (sward !== null) {
      // Parted by a body on foot, or by a craft's footprint while it is down in it.
      const craft = player.craft;
      let press: typeof swardPress | null = swardPress;
      if (craft === null) {
        swardPress.forward.copy(player.facing);
        swardPress.length = 0;
        swardPress.width = 0;
      } else if (craft.airborne) press = null;
      else {
        swardPress.forward.copy(craft.heading);
        swardPress.length = craft.radius;
        swardPress.width = craft.radius * 0.6;
      }
      const wind = spec.wind;
      sward.update({
        camera: rig.camera,
        player: player.position,
        press,
        height: rig.altitude,
        wind: { speed: (wind?.speed ?? 0) * (spec.sky.air > 0 ? 1 : 0), from: (((wind?.toward ?? 0) + 180) % 360) },
        hidden: riding !== null,
      });
    }
    // The streamers' building ends here; what it cost is what the next
    // frame's far work is charged with, as on Earth (`endFrameBuild`).
    endFrameBuild();
    crowd.update(dt, player.position, eye);
    ambient.update(dt, player.position, eye, groundAt, R);
    sky.update(shell.date(), player.position, eye, rig.camera.far);
    // Lamps glow by day and blaze by night.
    settlements.glow = 0.5 + 1.6 * (1 - Math.min(1, Math.max(0, sky.state.day)));
    // And light what is round them, as the headlights of what is driven do.
    rig.camera.updateMatrixWorld();
    updateNight(rig.camera, sky.state.sun, sky.state.elevation, player.position, nightSources, ground.time);
    if (scene.fog !== null) {
      const reach = Math.sqrt(2 * R * ((riding === null ? rig.altitude : riding.height) + 400));
      // Thicker air, nearer haze; and never past the far plane, or the
      // skyline is cut off before it has faded.
      // And further with the render distance, as Earth's haze is.
      fog.far = Math.min(rig.camera.far, Math.max(600, reach * (0.55 + (1 - spec.sky.air) * 1.5) * reachScale));
      fog.near = fog.far * 0.12;
      fog.color.copy(sky.haze);
    }

    shell.update(dt);
    const drawFrom = performance.now();
    // Earth's renderer redraws its shadow map only when asked (`autoUpdate`
    // off); a world's is small enough to redraw every frame.
    renderer.shadowMap.needsUpdate = true;
    host.draw(scene, rig.camera);
    const drawTo = performance.now();
    shell.drawn(drawFrom - began, drawTo - drawFrom);
    // And it turns itself by the frame rate as it does on Earth.
    if (interval < 250) sampleFrame(interval, drawTo - began);
    else skipFrame();
    input.endFrame();
  }

  function leave(to?: 'system'): void {
    if (!running) return;
    running = false;
    for (const rocket of rockets.values()) rocket.dispose();
    rockets.clear();
    skyships?.dispose();
    roads.dispose();
    traffic.dispose();
    // Every craft of this world, the one being driven too; the grass's own
    // buffers, materials and fields; the canopy's shape (its materials are
    // the craft kit's, shared with Earth's).
    if (player.craft !== null) player.leave();
    for (const craft of crafts) disposeCraft(craft);
    crafts.length = 0;
    if (sward !== null) {
      sward.group.removeFromParent();
      sward.group.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.isMesh !== true) return;
        mesh.geometry.dispose();
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          const uniforms = material.userData.uniforms as Record<string, THREE.IUniform> | undefined;
          for (const uniform of Object.values(uniforms ?? {})) if ((uniform.value as THREE.Texture | null)?.isTexture === true) (uniform.value as THREE.Texture).dispose();
          material.dispose();
        }
      });
    }
    scene.getObjectByName('parachute')?.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh === true) mesh.geometry.dispose();
    });
    // The passing voices let go as the world does.
    passing.update(passingBus, { jet: null, rotor: null });
    disposeRockets(gradientMap);
    // Lifted once the menu is drawing under it again.
    if (curtain.style.display !== 'none') {
      curtain.style.transition = 'opacity 0.9s ease';
      window.setTimeout(() => (curtain.style.opacity = '0'), 120);
      window.setTimeout(() => curtain.remove(), 1200);
    } else curtain.remove();
    shell.dispose();
    input.dispose();
    ground.dispose();
    frontiers.dispose();
    settlements.dispose();
    crowd.dispose();
    ambient.dispose();
    sky.dispose();
    // The pools' buffers, materials and the ramps they each made.
    effects.dispose();
    // The traveller back to the cast's pool, as the drivers went (`traffic.dispose`).
    avatar.dispose();
    // What was drawn with the scenery context is gone by now: its ramp and
    // materials last. The outposts and the decor's variants are arrays, never
    // uploaded, and the rig holds no listener: both go with this closure.
    ctx.dispose();
    gradientMap.dispose();
    delete (globalThis as Record<string, unknown>)['atlasWorld'];
    host.exit(to);
  }

  /** The saucers parked off the towns' corners, nearest first: the town, where, and how far, for the console. */
  function listUfos(): { site: string; lat: number; lon: number; away: number }[] {
    const out: { site: string; lat: number; lon: number; away: number }[] = [];
    const here = player.position.clone().setLength(R);
    for (const [id, spots] of ufoSpots) {
      const site = byId(id)!;
      for (const spot of spots) {
        settlements.toWorld(site, spot.x, 0, spot.z, ufoAt);
        const { lat, lon } = latLonOf(ufoAt);
        out.push({ site: site.name, lat, lon, away: Math.round(ufoAt.setLength(R).distanceTo(here)) });
      }
    }
    return out.sort((a, b) => a.away - b.away);
  }

  Object.assign(globalThis, {
    atlasWorld: {
      spec,
      terrain,
      geography,
      surface,
      player,
      rig,
      sky,
      settlements,
      crowd,
      frontiers,
      ground,
      hud: shell.hud,
      leave,
      /** The pads standing round the traveller; `.board(rocket)` gets in the nearest as `E` does. */
      rockets: () => [...rockets.values()],
      skyships,
      roads,
      crafts,
      traffic,
      sward,
      outposts,
      board: (rocket?: Rocket) => {
        const nearest = rocket ?? [...rockets.values()].sort((a, b) => a.position.distanceTo(player.position) - b.position.distanceTo(player.position))[0];
        if (nearest !== undefined) boardRocket(nearest);
      },
      goTo(lat: number, lon: number) {
        standAt(lat, lon);
        shell.hud.jump();
      },
      ufos: listUfos,
      /** Stands the traveller a few paces from the `k`th nearest parked saucer (`ufos()`), facing it. */
      toUfo(k = 0) {
        const one = listUfos()[k];
        if (one === undefined) return;
        unitAt(one.lat, one.lon, ufoAt);
        const up = ufoAt.clone();
        const side = new THREE.Vector3(up.y, -up.x, 0.2).cross(up).normalize();
        start.copy(ufoAt).multiplyScalar(R).addScaledVector(side, UFO_RADIUS + 8);
        look.copy(ufoAt).multiplyScalar(R).sub(start);
        player.place(start.normalize(), look);
        rig.heading.copy(player.facing);
        settle();
        shell.hud.jump();
      },
      hour(h: number) {
        sky.setHour(h, shell.date(), player.position);
      },
      stats: () => ({
        ground: { ...ground.stats },
        frontiers: { ...frontiers.stats },
        towns: { ...settlements.stats },
        crowd: { ...crowd.stats },
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        hour: sky.state.hour,
        au: sky.state.au,
      }),
    },
  });

  return {
    start() {
      last = performance.now();
      requestAnimationFrame(frame);
    },
  };
}
