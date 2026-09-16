import * as THREE from 'three';
import { OutlineEffect } from './outline.ts';
import { loadLakes, loadWorld, toLatLon } from './geo.ts';
import { landFlags, PLANET_RADIUS, UNITS_PER_DEGREE, buildLand, groundRadius } from './globe.ts';
import { createInput } from './input.ts';
import { createCameraRig } from './camera.ts';
import { createPlayer } from './player.ts';
import { prepareAvatar } from './avatar.ts';
import { createMonuments, loadPlacements } from './placement.ts';
import { detailRadiusFor, loadPlaces, prominenceRadius, setProminenceRadius } from './places.ts';
import { createBorders } from './borders.ts';
import { createRoads, loadRoads } from './roads.ts';
// From the contract rather than from `./monuments/index.ts`, which is the whole
// registry: see `deferred` in `start()`. `index.ts` re-exports this, and taking
// it from there would drag all seventy-seven model files into the first load for
// one function that has nothing to do with them.
import { createContext } from './monuments/contract.ts';
import { setDetailSites, setFlattenSites } from './terrain.ts';
import { createSky } from './sun.ts';
import { createClouds } from './clouds.ts';
import { createOcean } from './ocean.ts';
import { createCityLights, lightBrightness, setSunDirection } from './lights.ts';
import { clockAt } from './timezone.ts';
import { FOG_COLOR } from './theme.ts';
import { DETAIL_MAX, DETAIL_MIN, detail, fogFar, setDetail } from './view.ts';
import type { FlagLayer } from './land-flags.ts';
import type { Curtain } from './menu.ts';

/**
 * Where you wake up: Mallorca.
 *
 * Not sentiment — it is the fastest proof that the world is the right one. The
 * island does not exist in Natural Earth 1:110m at all, and even with the data
 * it could not be drawn while the coast was quantised to the 43.8 km spacing of
 * an icosphere vertex. If you can stand on it, both of those are fixed.
 */
const START = { lat: 39.62, lon: 2.99 };

/**
 * How often the shadow map is redrawn, in milliseconds: while something in the
 * box is moving, and while nothing is. The reference this look is chasing uses
 * exactly these two and they were kept rather than tuned — see the loop.
 */
const SHADOW_MOVING_MS = 45;
const SHADOW_STILL_MS = 180;

/**
 * Where the map layer fades in, in units above the ground under the player.
 *
 * **The whole feature is the fade and not the flag.** A flag laid over the
 * ground you are standing on is a coloured field with no edge in sight: it says
 * nothing, it hides the biome, and it is the reason the old toggle was a
 * curiosity. Laid over a country you can see the shape of, it is a map. So the
 * three marks — the flag, the frontier and the name — are worth exactly what
 * the altitude is worth, and they are wired to it rather than to the key.
 *
 * 500 is above every hill and above the plane's own takeoff, so nothing shows
 * on foot or in the boat and nothing shows in the first seconds of a climb.
 * 2,500 is where a country is a shape rather than a horizon: at 2,500 units the
 * ground horizon is 8,900 units, which is 32 degrees of longitude and about
 * three Frances across the frame. Between them it comes up as a wash rather
 * than as a switch, which is the difference between a map and a mode.
 */
const OVERLAY_LOW = 500;
const OVERLAY_HIGH = 2500;

/**
 * How long a frame may spend building the flag attribute, in milliseconds.
 *
 * It is 11 MB written once, the first time anybody climbs, and it is spent in
 * slices for the same reason `settlements.ts` spends its own build that way: a
 * single 300-millisecond bake in the middle of a climb is a stutter, and the
 * same work at four milliseconds a frame is invisible under a fade that takes
 * seconds to come up anyway.
 */
const FLAG_BUILD_MS = 4;

/** Whether the map layer is wanted at all. `B`, and it survives a reload. */
const OVERLAY_KEY = 'atlas.overlay';

const DEG = Math.PI / 180;

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/**
 * Says what the loading screen is doing, and gives the browser a chance to paint
 * it.
 *
 * Building the land is about a second of synchronous work on the main thread —
 * a triangulation, a refinement pass driven by the relief, and 83 MB of buffers.
 * Without a yield between stages the browser never paints any of the messages,
 * so the screen sits on the first one and then jumps straight to the world,
 * which looks exactly like a hang.
 */
async function stage(label: string): Promise<void> {
  const boot = BOOT[label];
  if (report !== null) report(WORLD[label] ?? 0, label);
  else if (boot !== undefined) showBoot(label, boot);
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * The loading screen's stages: where each starts on the bar, where it ends,
 * and **a guess at how long it takes, in milliseconds — which is a guess and
 * says so.** The bar is handed its next target with that duration as a CSS
 * transition, and the transition runs on the compositor: `buildLand` is
 * seconds of synchronous work, and a bar driven from JavaScript would sit
 * still for all of them. When a stage ends early the next one starts from
 * wherever the bar had got to; when it runs long, the bar waits at 98% of its
 * target rather than claiming work that has not been done.
 */
const BOOT: Record<string, readonly [number, number, number]> = {
  'reading the outlines': [0.02, 0.2, 1800],
  'filling the ocean': [0.2, 0.32, 1500],
  'raising the land': [0.32, 0.8, 7500],
  'drawing the frontiers': [0.8, 0.86, 700],
  'setting the weather': [0.86, 0.95, 900],
  'opening the sky': [0.95, 1, 400],
};

/**
 * And the rest of the build, which happens behind the menu: the share of it
 * done when each stage *starts*, for the pill in the menu's corner.
 */
const WORLD: Record<string, number> = {
  'raising the monuments': 0.04,
  'settling the country': 0.22,
  'laying the roads': 0.45,
  'setting it moving': 0.58,
  'planting the country': 0.76,
  'packing your bag': 0.94,
};

/** Where the stages report once the loading screen is gone: the menu's pill. */
let report: ((fraction: number, label: string) => void) | null = null;

function showBoot(label: string, [from, to, ms]: readonly [number, number, number]): void {
  const text = document.getElementById('loading-stage');
  const percent = document.getElementById('loading-percent');
  const fill = document.getElementById('loading-fill');
  if (text !== null) text.textContent = label;
  if (percent !== null) percent.textContent = `${Math.round(from * 100)}%`;
  if (fill !== null) {
    fill.style.transitionDuration = `${ms}ms`;
    fill.style.transform = `translateX(${((to * 0.98 - 1) * 100).toFixed(1)}%)`;
  }
}

/** Fill the bar, fade the loading screen away, and take it out of the page. */
function dismissLoading(): void {
  const loading = document.getElementById('loading');
  if (loading === null) return;
  const fill = document.getElementById('loading-fill');
  const percent = document.getElementById('loading-percent');
  if (fill !== null) {
    fill.style.transitionDuration = '250ms';
    fill.style.transform = 'translateX(0%)';
  }
  if (percent !== null) percent.textContent = '100%';
  setTimeout(() => loading.classList.add('out'), 180);
  setTimeout(() => loading.remove(), 1300);
}

/**
 * How the menu's weather fades, and where the sky dome stops.
 *
 * The deck fades out while you choose a country and a town and back in on the
 * way up, with this time constant in seconds: long enough to go as the flight
 * down to Earth comes in, rather than switching off in one frame. The dome is a
 * sphere of six radii and the orrery's camera leaves it; outside, its far half
 * would draw as a disc round the planet, so it goes a little before.
 */
const VEIL_LAG = 0.3;
const DOME_EXIT = 5.5;

/**
 * The colour behind the orrery: the sky dome's own `SPACE`, which it writes
 * without a colour-space conversion, so this is those three numbers as sRGB.
 * Leaving the dome is then the same pixel on both sides of its edge.
 */
const SPACE_BACKGROUND = new THREE.Color().setRGB(0.016, 0.024, 0.055, THREE.SRGBColorSpace);

/** The player's own settings the panel remembers, beside the ones `view.ts` and the map layer keep. */
const SENSITIVITY_KEY = 'atlas.sensitivity.v1';
const PERFORMANCE_KEY = 'atlas.performance.v1';
const HINTS_KEY = 'atlas.hints.v1';

function readSetting(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSetting(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Nowhere to remember it. It still works for this session.
  }
}

async function start(): Promise<void> {
  const began = performance.now();

  await stage('reading the outlines');
  // The monuments have to be known before the world is. `terrain.ts` flattens
  // the relief under each one, and both the mesh and the ground under the
  // player's feet are built from that relief — so the sites have to be in place
  // before anything asks it a question. Installing them afterwards throws,
  // deliberately, rather than silently giving the two different answers.
  //
  // The three are **fetched together and installed in order**, which is not the
  // same thing. Nothing about the monuments depends on the places or the roads,
  // so awaiting them one after another spent a round trip apiece for no reason;
  // what has to be sequential is `setFlattenSites` before `setDetailSites`
  // before `loadWorld`, and that is below and unchanged.
  //
  // The win is the latency and not the bytes: the load is bandwidth-bound at any
  // realistic speed, so this buys the gaps between requests — about 50 ms each
  // on a local server and the whole of a round trip on a bad link, which is the
  // connection that needs it. The road network is baked against `places.bin` and
  // stores its ends as indices into it, so `createRoads` still refuses to start
  // if the two disagree about how many places there are.
  const [placements, places, baked, lakes] = await Promise.all([
    loadPlacements(),
    loadPlaces(PLANET_RADIUS),
    loadRoads(),
    loadLakes(),
  ]);
  setFlattenSites(placements);
  // And the settlements ask the same terrain for resolution rather than for
  // level ground: a town lays its floor from the exact relief while the land
  // around it is a triangulation of it, and where the two disagree by more than
  // the floor's lift a triangle edge draws a straight line across the paving.
  setDetailSites(places.all.map((place) => ({ lat: place.lat, lon: place.lon, radius: detailRadiusFor(place.pop) })));
  // The lakes are the fourth file in that flight and they are handed to
  // `loadWorld` rather than fetched by it, for the same reason as the rest:
  // nothing about them depends on the outlines, so a serial `await` would spend
  // a whole round trip on a bad link to learn where Baikal is.
  const world = await loadWorld(UNITS_PER_DEGREE, lakes);

  // Everything below this line arrives while the land is being built.
  //
  // **The stages are the lever.** A module in the initial graph has to be
  // fetched *and parsed* before `start()` runs at all, and the four data files
  // are only asked for after that — so every kilobyte of code the first frame
  // does not need is a kilobyte of delay in front of the fetch it does need.
  // The kits below are none of them wanted before the fifth stage, and the four
  // stages in between are seconds of ocean, land and weather on the main
  // thread. Measured at 250 KB/s, five runs: the initial graph went **403 KB
  // gzipped over twelve chunks to 244 over ten**, the first data request
  // **1,709 ms -> 1,071**, the first frame **12,132 -> 11,408** — and the
  // deferred 167 KB lands inside the build with time to spare. See the trap in
  // `CLAUDE.md` for the same table at 100 KB/s and at full speed.
  //
  // They are fired *here* and not at the top of `start()` on purpose. The
  // download is bandwidth the data files are also spending, and the data files
  // are the serial chain everything else waits on; starting the code first
  // would buy the parse back and pay for it in the fetch. After `loadWorld` the
  // network is idle and the main thread is not, which is exactly the trade.
  //
  // Nothing here is a lazy *feature* — every one of them is awaited a few lines
  // later, in order — so a slow link makes the loading card sit on a stage, not
  // the world arrive without its monuments.
  const deferred = {
    /** The front door: the whole Earth, turned by hand. 7.4 KB gzipped. */
    menu: import('./menu.ts'),
    /** Six quadrupeds behind an eager glob, the way the vehicles arrive. */
    fauna: import('./fauna/index.ts'),
    /** Seventy-seven model files behind an eager glob, 82 KB. The largest. */
    monuments: import('./monuments/index.ts'),
    /** With it, the whole scenery kit and the whole traffic kit. */
    settlements: import('./settlements.ts'),
    vegetation: import('./vegetation.ts'),
    life: import('./life.ts'),
    /** The people: the cast dressed by region, standing in towns and walking verges. */
    folk: import('./folk.ts'),
    traffic: import('./traffic/index.ts'),
    /** The two maps and the chip, which is also where the 232 flags live. */
    minimap: import('./minimap.ts'),
    /**
     * What the maps share, for the chip's arrow. It is already inside the two
     * maps' own chunk, so asking for it here is free — and importing it
     * statically would put a map's worth of parse in front of the first fetch,
     * which is the trap the whole `deferred` arrangement exists to have deleted.
     */
    cartography: import('./cartography.ts'),
    hud: import('./hud.ts'),
    /** The gear's panel. It owns no state, so it can arrive with the HUD. */
    settings: import('./settings.ts'),
    map: import('./map.ts'),
    navigation: import('./navigation.ts'),
    /** The country names over the land, which arrive with the flag under them. */
    names: import('./names.ts'),
  };

  // **`roads.bin` is the network, whole.** It used to arrive as a graph over all
  // 29,545 places and be cut down here at load — only asphalt, nothing crossing
  // scree, no dead end at a village `isShown` does not build, one route put back
  // at each orphaned city — because the bake joined a town to its own unbuilt
  // suburbs and the connectivity had to be reconstructed out of that. The bake
  // joins the **built** towns now (see `builtGraph`), so the file holds exactly
  // what is drawn and there is nothing left to do to it on the way in.
  //
  // The one thing that follows: `roads.bin` is a function of `isShown`, so
  // `atlas.prominence(r)` no longer moves the network at all. It was a reload
  // before and it is a **re-bake** now; `pnpm check` asserts the file against
  // the same `builtGraph`, so a knob left turned fails there.

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  document.body.appendChild(renderer.domElement);
  // Inverted-hull outline: this is what turns crude geometry into a drawing.
  // Without it a monument made of boxes looks like a mistake.
  const outline = new OutlineEffect(renderer, { defaultThickness: 0.003, defaultColor: [0.11, 0.02, 0.01] });

  // Real shadows, from the sun alone, into one map that follows the player —
  // `sun.ts` owns the box, the fades and the bias. `PCFShadowMap`, because r182
  // retired `PCFSoftShadowMap` into it with a warning. **Not updated per
  // frame**: the pass is redrawn on the cadence below, and `outline.render`
  // turns the map off for its ink pass, so only the first of a frame's two
  // passes ever consumes `needsUpdate`. Set once here so the map exists before
  // the first lit frame — the menu draws the same scene, and a `sampler2DShadow`
  // bound to nothing is undefined behaviour rather than "no shadow".
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;

  const scene = new THREE.Scene();
  // Bounds are recomputed every frame from altitude; see the loop below.
  const fog = new THREE.Fog(FOG_COLOR, 1, 2);
  scene.fog = fog;

  // The dome, the sun, the moon and all the fill light, driven by the real
  // clock: where you are standing is what decides whether it is day. It owns
  // the fog's *colour*; the loop below still owns its distances.
  const sky = createSky(scene, fog);
  // `?at=lat,lon` skips the menu — for `scripts/shot.mjs` and anyone who wants
  // a link to a place; `?time=ISO` freezes the sun there (`sky.setTime`) and
  // `?height=N` starts the camera that far up. Debug surface, not a feature.
  // The time is set here, before the menu, so a shot of the menu is of a
  // chosen hour and not of whatever hour the machine taking it happens to be.
  const query = new URLSearchParams(location.search);
  if (query.get('time')) sky.setTime(query.get('time'));

  // The hero's body is an authored character in `public/models/cast/`, fetched
  // alongside the world rather than after it; `buildAvatar` needs it by the
  // time the player is made.
  const avatarReady = prepareAvatar();
  let townsfolkClock = 0;
  let townsfolkFrame = 0;

  await stage('filling the ocean');
  // The water sphere, the shallows along every coast in the world, and the
  // sun's own path on them. Built once and at one resolution everywhere, like
  // the cloud deck and for the same reason: from the plane's ceiling the sea is
  // most of what you are looking at, and a streamer would have given up.
  const ocean = createOcean(world);
  scene.add(ocean.group);

  await stage('raising the land');
  // Kept rather than discarded: the flag layer builds a second colour attribute
  // on this mesh and drives a uniform on its material, so it needs the object
  // and not a lookup.
  const land = buildLand(world);
  scene.add(land);

  await stage('drawing the frontiers');
  // On the ground rather than in the data: the bake keeps only outer rings, so
  // a frontier has to be found by asking what is on the other side of each edge.
  const borders = createBorders(world);
  scene.add(borders.mesh);

  await stage('setting the weather');
  // The one thing in the world that is neither streamed nor placed: a single
  // shell over the whole planet, built once, because from the plane's ceiling
  // the weather is the thing you climbed up to see and a streamer would have
  // given up long before.
  const clouds = createClouds();
  scene.add(clouds.group);

  // Reused per frame so the sea's update allocates nothing. Declared here
  // rather than beside the loop because the menu draws the same world before
  // the loop exists.
  const oceanSun = new THREE.Vector3();
  const oceanMoon = new THREE.Vector3();
  const oceanLights = [
    { direction: oceanSun, color: sky.sun.color, intensity: 0 },
    { direction: oceanMoon, color: sky.moon.color, intensity: 0 },
  ];

  // **The front door, and it opens on a finished sky.** The menu is the real
  // planet — the same scene, the same land, sea and cloud deck, the same sun at
  // the real hour, drawn by the same two-pass `outline.render` — with the rest
  // of the solar system laid out around it by `orrery.ts`. It used to open the
  // moment the land existed, 10 ms after `buildLand`, and the frontiers and the
  // weather then built underneath it: a frozen frame of a planet with no
  // clouds, right after the loading screen, and players who looked for the
  // weather from the menu found none. So it opens after those two stages, which
  // cost well under a second together and are the loading screen's to cover,
  // and everything after them — nine imports and every streamer — still
  // arrives underneath a menu the player is already using.
  await stage('opening the sky');
  const { createMenu, earthBody } = await deferred.menu;
  const menu = createMenu({
    bodies: [earthBody(world, places.all)],
    scene,
    renderer,
    // `outline.render`, not `renderer.render`: a frame here is two passes.
    draw: (target, camera) => outline.render(target, camera),
    fallback: { lat: START.lat, lon: START.lon, name: 'Palma' },
    time: () => sky.state.time,
    sunDirection: () => sky.state.sun,
  });
  document.body.appendChild(menu.root);

  // The sky's own sun and moon discs hang five radii from the camera, which
  // from the orrery is five radii in front of it: two small discs floating in
  // the solar system. The orrery draws the Sun where it actually is, so the
  // disc goes for the menu and comes back with the game; the moon disc goes
  // when the camera leaves the dome, which is where it stops meaning anything.
  const skyDome = scene.getObjectByName('sky');
  const sunDisc = scene.getObjectByName('sun');
  const moonDisc = scene.getObjectByName('moon');
  if (sunDisc !== undefined) sunDisc.visible = false;
  scene.background = SPACE_BACKGROUND;

  // **The menu's own frame, and it is not optional.** Everything the world
  // draws is calibrated for a camera standing on it: the fog closes at the
  // land's horizon, about 1,400 units at eye height, and the menu's camera is
  // anywhere from a few thousand units to a million. Wired without this the
  // globe came back as a flat mauve ball — `fog.far` doing exactly what it
  // says at forty times its own range. The same call gives the menu the real
  // sun, the surf and the weather.
  let veil = 1;
  let veiledAt = performance.now();
  menu.beforeRender = (camera) => {
    const distance = camera.position.length();
    const altitude = Math.max(1, distance - PLANET_RADIUS);
    fog.near = Math.sqrt(2 * PLANET_RADIUS * altitude) * 0.2;
    fog.far = fogFar(altitude, PLANET_RADIUS);
    sky.update(camera.position.clone().setLength(PLANET_RADIUS), camera.position, altitude);
    setSunDirection(sky.state.sun, sky.state.solar.subsolarLon);
    clouds.update(sky.state.time, camera.position, fog);
    // **The weather is there from space and gone while you choose.** The
    // country and town stages are a map you click on, and the deck over it is
    // in the way: a solid cell of stratus over eastern Spain hid which coast
    // Valencia was on, and even veiled it was the thing the user asked to have
    // out of the way. From the system and a planet's card it stays, because
    // there it is most of what makes Earth look like Earth. It fades rather
    // than switching, on the clock of the frames the menu draws.
    const now = performance.now();
    const step = Math.min(0.1, (now - veiledAt) / 1000);
    veiledAt = now;
    const wanted = menu.stage === 'region' || menu.stage === 'site' ? 0 : 1;
    veil += (wanted - veil) * (1 - Math.exp(-step / VEIL_LAG));
    if (Math.abs(wanted - veil) < 0.01) veil = wanted;
    clouds.setVeil(veil);
    const inside = distance < PLANET_RADIUS * DOME_EXIT;
    if (skyDome !== undefined) skyDome.visible = inside;
    if (moonDisc !== undefined) moonDisc.visible = inside;
    // The direction and not the light's position: the sun sits on the shadow
    // box, a few thousand units from the player.
    oceanSun.copy(sky.state.sun);
    oceanMoon.copy(sky.moon.position).normalize();
    oceanLights[0]!.intensity = sky.sun.intensity;
    oceanLights[1]!.intensity = sky.moon.intensity;
    ocean.update(camera.position, oceanLights);
  };
  dismissLoading();
  report = (fraction, label) => menu.progress(fraction, label);

  await stage('raising the monuments');
  // One context for the whole world: monuments and settlements share a material
  // cache, a toon ramp and an outline width, so a house is inked with the same
  // pen as the landmark behind it.
  const ctx = createContext();
  // The registry, handed to `placement.ts` rather than imported by it — see
  // `MonumentKit` there, and `deferred` above for why it is not in the first
  // load. This is the first `await` on any of them and by here the land is up.
  const { MONUMENTS, buildMonument } = await deferred.monuments;
  // **Where a landmark's feet go, which is not always the relief.** 28 of the
  // world's landmark cities have their landmark standing inside them, and a
  // town's floor is a plinth `GROUND_LIFT` over the ground — measured at the
  // Sagrada Familia, the model sat at 16004 with Barcelona's paving at 16007.
  // So `placement.ts` asks the settlements how high the made ground is, exactly
  // as `player.ts` does.
  //
  // **A thunk and not the method, because the monuments are built first.** The
  // stages run monuments then settlements, and reordering them to pass the
  // function directly would move a stage for an argument that is only ever
  // called at `raise` — long after both exist. The one-line closure is the
  // cheap half of that trade.
  const monuments = createMonuments(
    world,
    placements,
    { monuments: MONUMENTS, build: buildMonument },
    ctx,
    (point) => settlements.madeHeightAt(point),
  );
  scene.add(monuments.group);
  if (monuments.broken.length > 0) console.warn('monuments that broke the contract:', monuments.broken);
  console.log(`${monuments.missing.length} placed landmarks have no model yet`);

  await stage('settling the country');
  // The 7,320 anchors are asked for the ground once, here, which is the whole
  // of what this costs before you move: about 30 ms of point-in-polygon.
  // The network goes in with them: a town's own tracks leave on the headings
  // its roads actually take, which is the difference between a lane going
  // somewhere and a lane pointing at somewhere.
  const { createSettlements } = await deferred.settlements;
  const settlements = createSettlements(world, places.all, {
    context: ctx,
    monuments: placements,
    roads: baked.roads,
  });
  scene.add(settlements.group);
  // Every place on the planet as one buffer of points, lit where the sun is
  // not. It reads the settlements' own anchors rather than asking the terrain
  // again — 7,320 point-in-polygon queries the streamer has already paid for —
  // and it exists because the settlement mesh cannot do this job: from the
  // plane's ceiling `settlements.ts` holds no towns at all, which is exactly
  // the altitude a night hemisphere is worth looking at from.
  const cityLights = createCityLights(places.all, settlements.anchors);
  scene.add(cityLights.points);
  if (settlements.broken.length > 0) console.warn('scenery parts that broke the contract:', settlements.broken);
  if (settlements.missing.length > 0) console.warn('region tables name parts that do not exist:', settlements.missing);

  await stage('laying the roads');
  // Nothing is built here either — the whole network at its full detail is more
  // geometry than the land mesh — so this costs one material and a bucket per
  // four degrees of the planet.
  const roads = createRoads(world, places.all, baked);
  scene.add(roads.group);

  await stage('setting it moving');
  // **The last thing built and the last thing updated, because it is the only
  // thing in the world that is not still.** Two finished kits had never been in
  // the world at all — `src/traffic/` and the crowd in `src/scenery/people.ts` —
  // and the crowd is now in two places at once: standing in the towns, merged
  // into their own buffer for no draw call, and *walking* here, which costs one
  // mesh a person and is therefore capped and near. The vehicle registry is
  // handed in rather than imported, so `scripts/check-life.ts` can run the whole
  // of this file in Node.
  // The people are authored characters (`cast.ts`), dressed by `folk.ts`: the
  // townsfolk stand on the spots each town publishes and the walkers are handed
  // to `life.ts`, which draws a verge walker from the cast when it has one.
  const { createFolk, createTownsfolk } = await deferred.folk;
  const folk = createFolk(ctx);
  const townsfolk = createTownsfolk(folk, settlements);
  scene.add(townsfolk.group);
  const { createLife } = await deferred.life;
  const { VEHICLES } = await deferred.traffic;
  const { ANIMALS } = await deferred.fauna;
  const life = createLife(world, places.all, {
    context: ctx,
    roads: baked.roads,
    vehicles: VEHICLES,
    folk,
    // Handed down rather than imported, the same way the vehicles are: `life.ts`
    // stays Node-safe and adding an animal stays one file and nothing else.
    animals: ANIMALS,
  });
  scene.add(life.group);

  await stage('planting the country');
  // Between the towns, which is 99% of the land. It builds nothing here — the
  // whole of it is streamed — so this costs a few kilobytes and one material.
  const { createVegetation } = await deferred.vegetation;
  const vegetation = createVegetation(world, {
    context: ctx,
    places: places.all,
    monuments: placements,
    // The pruned network, the same list the streamer draws: a tree in the
    // carriageway was the last of the three keepouts nobody had asked for.
    roads: baked.roads,
  });
  scene.add(vegetation.group);
  if (vegetation.broken.length > 0) console.warn('scenery parts that broke the contract:', vegetation.broken);
  if (vegetation.missing.length > 0) console.warn('biome tables name plants that do not exist:', vegetation.missing);

  await stage('packing your bag');
  // Everything the world needs is now standing, so the menu stops being a
  // loading screen you cannot leave and becomes a choice. `choose` resolves on
  // a click, on `Enter`, or immediately if the player already picked while the
  // land was building.
  menu.ready();
  report = null;
  const at = query.get('at')?.split(',').map(Number);
  const skipMenu = at !== undefined && at.length === 2 && at.every(Number.isFinite);
  const spawn = skipMenu
    ? { body: 'earth', region: '', name: 'here', lat: at[0]!, lon: at[1]! }
    : await menu.choose();
  // The dive into the town and the curtain over the end of it. Everything below
  // — the player, the rig, the HUD — is built behind the curtain, and the loop
  // lifts it once the town under it has had a moment to stand.
  let curtain: Curtain | null = skipMenu ? null : await menu.depart();
  // Whatever the menu did to the sky, the world gets it back.
  clouds.setVeil(1);
  if (skyDome !== undefined) skyDome.visible = true;
  if (sunDisc !== undefined) sunDisc.visible = true;
  if (moonDisc !== undefined) moonDisc.visible = true;
  scene.background = null;
  /**
   * The ground people made, which is the surface a foot actually stands on.
   *
   * The town's plinth and the road's carriageway, from the two streamers that
   * know what is *standing*; `terrain.ts` is still the one definition of the
   * relief and `player.ts` takes the higher of the two. Both queries answer 0
   * off their own surface, so on open ground this is two cheap rejections and no
   * terrain query at all.
   */
  const madeHeightAt = (point: THREE.Vector3): number =>
    Math.max(settlements.madeHeightAt(point), roads.ribbonHeightAt(point));
  /**
   * And the walls on it. A building is solid to a foot and opaque to the lens,
   * and both answers belong to the settlements for the reason the floor does:
   * only a standing town has walls. The player asks `collide` every frame on
   * foot, moving or not, and `freeSpotNear` whenever that hit something, which
   * is also what makes the spawn and `atlas.goTo` safe: the town at the far end
   * of a jump is raised a few frames later, around wherever you landed, and the
   * first frame it stands puts you on the nearest clear ground outside it.
   */
  await avatarReady;
  const player = createPlayer(world, spawn.lat, spawn.lon, {
    madeHeightAt,
    collide: (point, radius, push) => settlements.collide(point, radius, push),
    freeSpotNear: (point, radius, out) => settlements.freeSpotNear(point, radius, out),
  });
  scene.add(player.object);

  const rig = createCameraRig({ blocks: (point) => settlements.blocksSight(point) });
  if (Number.isFinite(Number(query.get('height')))) rig.view.height = Number(query.get('height'));
  const input = createInput(renderer.domElement);
  const groundAt = (point: THREE.Vector3): number => groundRadius(world, point);

  // The pins are what make the map answer "where is anything", which the
  // coastline alone never did. They cover every placement, including the
  // landmarks nobody has modelled yet — a pin for a place you can walk to and
  // find nothing at is still better than no pin. The gazetteer goes with them
  // because the disc is framed on the country you are in now: it draws the
  // built towns around you, and the one the chip is naming by name.
  const { createMinimap } = await deferred.minimap;
  const minimap = createMinimap(world, {
    monuments: placements,
    places: places.all,
    isVisited: (id) => monuments.isVisited(id),
  });
  document.getElementById('minimap')!.appendChild(minimap.canvas);

  const { bearingTo } = await deferred.cartography;
  const { createHud } = await deferred.hud;
  // The gear and the map on the HUD's bar, and on its pause card. Both are
  // closures over things built a few lines further down, which is safe: they
  // run on a click, long after everything here exists.
  const hud = createHud(world, {
    onSettings: () => settings.toggle(),
    onMap: () => (map.open ? map.hide() : map.show()),
  });
  document.body.appendChild(hud.root);

  const showCount = (): void => hud.setFound(monuments.visited.size, placements.length);
  showCount();

  // Somewhere to go. It picks and it points; it never flies you — the plane's
  // whole design is that speed rides altitude, so crossing an ocean *is* a climb
  // and arriving *is* a descent. An autopilot would fly the one interaction the
  // travel model was built around and leave a loading screen with scenery.
  const { createNavigation } = await deferred.navigation;
  const nav = createNavigation({
    placements,
    minimap,
    hud,
    groundAt,
    isVisited: (id) => monuments.isVisited(id),
    // `Tab` opens on the landmarks of the country you are standing in. Asked
    // here rather than held, because this is the one place that already knows.
    countryHere: () => {
      const id = world.countryAtPoint(player.position);
      return id > 0 ? world.countries[id - 1]!.iso : null;
    },
  });

  // The whole planet on one sheet, behind `M`: names, the visited set, real
  // distances, and a destination you can point at. It binds its own key the way
  // `navigation.ts` binds `Tab`, and it drives `nav` rather than owning a
  // second idea of what a destination is.
  const { createWorldMap } = await deferred.map;
  const map = createWorldMap(world, {
    monuments: placements,
    isVisited: (id) => monuments.isVisited(id),
    target: () => nav.target?.id ?? null,
    onChoose: (id) => nav.select(id),
    onClear: () => nav.clear(),
    lockTarget: renderer.domElement,
  });
  document.body.appendChild(map.root);

  // The names over the land. They are HTML like the rest of the HUD and they
  // ride the same fade the flag and the frontiers do; see `names.ts`.
  const { createCountryNames } = await deferred.names;
  const names = createCountryNames(world);
  // **First in the body**, and `names.ts` says why: the names have to paint
  // behind every card the HUD owns, and the only way past `z-index: auto` is to
  // be earlier in the document than the elements that carry it.
  document.body.insertBefore(names.root, document.body.firstChild);

  /**
   * The detail knob on the keyboard, because the console is not where you are
   * when you find out a number is wrong.
   *
   * `[` and `]` step it by a quarter of itself, which is geometric rather than
   * linear on purpose: the range runs from 0.25 to 6 and a fixed step would be
   * a nudge at the top and a doubling at the bottom. It is deliberately *not*
   * in `input.ts`'s `BINDINGS` — that table is the controls the game teaches on
   * the hint card, and this is a setting.
   */
  function announce(text: string, iconName: 'flag' | 'eye' | 'sparkle' = 'sparkle'): void {
    hud.toast(text, iconName);
  }
  function showDetail(value: number): void {
    announce(`Render distance ${value.toFixed(2)}×`, 'eye');
  }

  /**
   * The map layer — the flag, the frontiers, the names — and whether it is
   * wanted at all.
   *
   * On by default, because the whole thing is invisible until you are 500 units
   * up and a player who never finds `B` should still get the map when they fly.
   * Every read and write of `localStorage` is wrapped, like the visited set's:
   * a private window throws on the *getter*, not on the write.
   */
  let overlayOn = true;
  try {
    overlayOn = localStorage.getItem(OVERLAY_KEY) !== '0';
  } catch {
    overlayOn = true;
  }
  function setOverlay(on: boolean): boolean {
    overlayOn = on;
    try {
      localStorage.setItem(OVERLAY_KEY, on ? '1' : '0');
    } catch {
      // Nowhere to remember it. It still works for this session.
    }
    return on;
  }

  addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.code === 'KeyB') announce(setOverlay(!overlayOn) ? 'Flags and borders on' : 'Flags and borders off', 'flag');
    else if (event.code === 'BracketLeft') showDetail(setDetail(Math.max(DETAIL_MIN, detail() / 1.25)));
    else if (event.code === 'BracketRight') showDetail(setDetail(Math.min(DETAIL_MAX, detail() * 1.25)));
    else if (event.code === 'KeyH' && !event.repeat) hud.toggleHints();
  });

  /**
   * The gear. It owns no state: each row is a getter and a setter over a value
   * that lives where it always did — the detail knob in `view.ts`, the map
   * layer here, the mouse in `input.ts` — and the keys go on working beside it.
   */
  let performanceOn = readSetting(PERFORMANCE_KEY) === '1';
  hud.setPerformance(performanceOn);
  hud.setHints(readSetting(HINTS_KEY) !== '0');
  input.sensitivity = Number(readSetting(SENSITIVITY_KEY) ?? '1') || 1;
  const { createSettings } = await deferred.settings;
  const settings = createSettings({
    detail: { get: detail, set: setDetail, min: DETAIL_MIN, max: DETAIL_MAX },
    flags: { get: () => overlayOn, set: setOverlay },
    sensitivity: {
      get: () => input.sensitivity,
      set: (value) => {
        input.sensitivity = value;
        writeSetting(SENSITIVITY_KEY, value.toFixed(3));
        return input.sensitivity;
      },
      min: 0.3,
      max: 3,
    },
    performance: {
      get: () => performanceOn,
      set: (on) => {
        performanceOn = on;
        hud.setPerformance(on);
        writeSetting(PERFORMANCE_KEY, on ? '1' : '0');
        return on;
      },
    },
    hints: {
      get: () => hud.hints,
      set: (on) => {
        writeSetting(HINTS_KEY, on ? '1' : '0');
        return hud.setHints(on);
      },
    },
    lockTarget: renderer.domElement,
  });
  document.body.appendChild(settings.root);

  /**
   * The flag attribute, which is 11 MB and is therefore not built until the
   * first time the fade asks for it. `land-flags.ts` and the 2,091 lines of
   * flag specs behind it arrive on the same climb, through the dynamic
   * `import()` in `globe.ts`.
   */
  let flagLayer: FlagLayer | null = null;
  let flagAsked = false;
  /** What `atlas.flags(0.4)` set before the layer existed, if anything. */
  let flagCeiling: number | null = null;
  /** The last fade, so `atlas.flags()` can report what is actually on screen. */
  let overlayFade = 0;

  function resize(): void {
    renderer.setSize(innerWidth, innerHeight);
    rig.resize(innerWidth, innerHeight);
  }
  addEventListener('resize', resize);
  resize();

  // Without this the camera starts at the origin, which is the planet's centre,
  // and the first frames render from inside the Earth.
  rig.snap(player, groundAt);
  menu.dispose();


  let previous = performance.now();
  /** When the shadow map was last redrawn, and what stood in the world then. */
  let shadowDrawnAt = -Infinity;
  let shadowStanding = -1;

  /**
   * Rolling frame cost, on `atlas.stats`.
   *
   * Worth carrying permanently: `OutlineEffect` draws the scene twice, so the
   * land mesh costs double its triangle count every frame, and terrain relief
   * took that mesh from 301k triangles to 766k in one commit. A number that is
   * always there is how the next such jump gets noticed on the day it lands
   * rather than on someone else's laptop.
   */
  const stats = { fps: 0, frameMs: 0, triangles: 0, calls: 0 };
  let frames = 0;
  let sampledAt = previous;
  let accumulated = 0;

  function frame(now: number): void {
    requestAnimationFrame(frame);
    const dt = Math.min((now - previous) / 1000, 0.1);
    previous = now;

    // Order matters: the rig decides where you are looking, the player moves
    // relative to that, and only then does the camera chase the result. Chasing
    // first would leave the camera a frame behind its own aim.
    rig.aim(dt, input.state, player);
    player.update(dt, {
      move: input.state.move,
      run: input.state.run,
      jump: input.state.jump,
      heading: rig.steer,
    });
    rig.follow(dt, player, groundAt);
    input.endFrame();

    // After the rig, because the sky needs both where you stand — which decides
    // the hour — and where the camera is, which decides how much of it is left.
    // The third is how high the camera is over the ground *under the player*,
    // which fades the cast shadows out on the way up: sea level would fade
    // them on a mountain top, and the plane is the case they are fading for.
    const ground = groundAt(player.position);
    // How high the *camera* is over the ground under the player. The sun fades
    // its shadows out on it and the map layer fades itself in on it, and both
    // want the same answer: sea level would fade them on a mountain top.
    const eyeOverGround = rig.camera.position.length() - ground;
    sky.update(player.position, rig.camera.position, eyeOverGround);
    // The moods are keyed to the sun's elevation where the *player* stands and
    // every light in the world has to ask that question at its own position
    // instead, or a town on the day side is lit because you happen to be
    // standing on the night one. One direction, published here, resolved per
    // vertex in the shaders. See `src/lights.ts`.
    setSunDirection(sky.state.sun, sky.state.solar.subsolarLon);
    cityLights.update(renderer);

    // Fog follows the camera's altitude. On the ground the horizon is ~930 units
    // out and the haze has to start before that; from the air it is tens of
    // thousands, and that same haze would bury the whole planet.
    //
    // **And it follows the detail knob, which is the half that makes the other
    // half visible.** A knob that admits geometry at eight thousand units while
    // the haze closes at fourteen hundred spends the frame on a wall: nothing
    // the user can see changes, which is exactly the complaint that produced the
    // knob. `detailFog` opens it as the square root rather than linearly — see
    // `view.ts` for why that is a judgement about the look and not arithmetic.
    const altitude = Math.max(1, rig.camera.position.length() - PLANET_RADIUS);
    const horizon = Math.sqrt(2 * PLANET_RADIUS * altitude);
    fog.near = horizon * 0.2;
    // `fogFar` rather than the expression it used to be, because the streamers
    // cap their own reach against the same number and two copies of it is how a
    // forest ends at a distance the haze has already hidden — or, worse, how a
    // forest stops short of it.
    fog.far = fogFar(altitude, PLANET_RADIUS);

    // The near plane rides the camera's distance to the player, for the same
    // reason the fog rides altitude. The far plane sits at ten planet radii, so
    // a fixed near of 5 leaves a 32,000:1 depth range; from orbit the 20 units
    // between a cliff top and the sea then fall inside a single depth step and
    // every coastline starts z-fighting. Nothing is ever drawn closer than the
    // avatar, so near can grow with that distance instead.
    const near = Math.min(500, Math.max(0.5, rig.camera.position.distanceTo(player.position) * 0.15));
    if (Math.abs(near - rig.camera.near) > near * 0.1) {
      rig.camera.near = near;
      rig.camera.updateProjectionMatrix();
    }

    // All three take the camera as well as the player, and the split is the
    // point: the *player* says how far anything is, and the **camera** says
    // whether it is on the screen. Before `view.ts` they admitted by radius from
    // the player alone, which paid for the three hundred degrees behind you and,
    // in the air, for the ground directly underneath — measured over Finland at
    // 3,000 units up, 0 of 48 resident settlements were inside the frame.
    //
    // Before the render, not after: a monument that comes into range this frame
    // should be drawn this frame, not next.
    monuments.update(player.position, altitude, rig.camera);
    // After the monuments, and for the same reason: what comes into range this
    // frame should be drawn this frame. It spends a few milliseconds at most —
    // see `BUILD_BUDGET_MS` — and then does nothing until you move again.
    settlements.update(player.position, altitude, rig.camera);
    // Last of the three streamers, and the one that gives ground back first when
    // a frame is short: a town that has not arrived is a hole in the world, and
    // a tile of grass that has not arrived is grass that arrives next frame.
    vegetation.update(player.position, altitude, rig.camera);
    // After the settlements, because a road is laid over a town's paving where
    // the two meet and the later of two coplanar surfaces is not what decides
    // that — the lift is — but the build budgets are served in order and the
    // town under your feet is worth more than the road on the horizon.
    roads.update(player.position, altitude, rig.camera);

    // After the roads, because a vehicle drives on one and the road under it
    // should have arrived first — and **on the world's clock rather than the
    // machine's**: every mover is a pure function of `sky.state.time`, so
    // `atlas.sky.setRate(600)` runs the traffic with the sun and `setTime`
    // scrubs it. Seconds, because that is what a speed is in.
    life.update(player.position, altitude, rig.camera, sky.state.time.getTime() / 1000);
    // The people standing in the towns: their own clock rather than the sky's,
    // because breathing does not speed up when `setRate` runs the sun at 600x.
    townsfolkClock += dt;
    townsfolk.update(player.position, dt, townsfolkClock, ++townsfolkFrame);

    // The weather turns with the same clock the sun does, so scrubbing the time
    // scrubs the sky: `atlas.sky.setRate(600)` runs a front past you in seconds.
    clouds.update(sky.state.time, rig.camera.position, fog);

    // The surf's clock and the glitter's geometry. Both bodies are offered and
    // the sea takes whichever is doing the lighting, so the path on the water is
    // the sun's by day and the moon's at night. The sun's *direction*, not its
    // position normalised: the light sits on the shadow box beside the player.
    oceanSun.copy(sky.state.sun);
    oceanMoon.copy(sky.moon.position).normalize();
    oceanLights[0]!.color = sky.sun.color;
    oceanLights[0]!.intensity = sky.sun.intensity;
    oceanLights[1]!.color = sky.moon.color;
    oceanLights[1]!.intensity = sky.moon.intensity;
    ocean.update(rig.camera.position, oceanLights);

    // Arriving is only an arrival on foot. `recordVisits` is cheap — a distance
    // test per monument — and it only ever fires once per landmark.
    if (player.vehicle === 'foot') {
      for (const place of monuments.recordVisits(player.position)) {
        // Walking into your own destination is one arrival, not two: the
        // navigation panel turns gold in place and says it better than a card.
        if (place.id !== nav.target?.id) {
          // The country of the landmark rather than the country under your feet:
          // twelve of them stand over water and the Sphinx sits 1.5 units from
          // the Pyramids, so the ground you are on is not reliably theirs.
          const owner = world.countries.find((c) => c.iso === place.iso);
          hud.foundLandmark({
            name: place.name,
            iso: place.iso,
            country: owner?.name ?? place.iso,
            height: place.height,
            year: place.year,
            found: monuments.visited.size,
            total: placements.length,
          });
        }
        showCount();
        // The map draws visited pins differently and skips redraws while you
        // stand still, which is exactly when this fires.
        minimap.invalidate();
      }
    }
    // The HUD's two per-frame questions, both cached on its side: how you are
    // travelling, which decides the keys it shows, and whether the mouse is
    // free with nothing else on the screen, which is the pause card.
    hud.setVehicle(player.vehicle);
    hud.setPaused(document.pointerLockElement !== renderer.domElement && !map.open && !settings.open);
    // The curtain from the menu's dive comes up once the town under it has had
    // its build: when the settlement streamer has nothing pending, or after a
    // second and a half whatever it says, so a slow machine is never left
    // looking at cream.
    if (curtain !== null) {
      const waited = now - loopStarted;
      if ((waited > 450 && settlements.stats.pending === 0) || waited > 1500) {
        curtain.lift();
        curtain = null;
      }
    }
    // Where you are, asked once and handed to both the disc and the chip.
    // Every frame, not throttled: `countryAtPoint` is 2 us and the nearest
    // place is a scan of 9,734 dot products, which is another 7. The disc
    // frames itself on the first and names the second; the chip's own debounce
    // — a country has to hold before it counts as an arrival — lives in the HUD.
    const standingIn = world.countryAtPoint(player.position);
    const nearbyPlace = places.nearest(player.position);
    minimap.update(player.position, player.forward, {
      country: standingIn,
      place: nearbyPlace,
    });
    nav.update(dt, player, rig.camera);
    // Costs one branch while it is closed, which is nearly always.
    map.update(player.position, player.forward);

    // The map layer, all three marks on one number. Nothing here touches a
    // buffer once the flag attribute is built: it is a uniform, an opacity, a
    // width and ten transforms.
    overlayFade = overlayOn ? smoothstep(OVERLAY_LOW, OVERLAY_HIGH, eyeOverGround) : 0;
    if (overlayFade > 0 && !flagAsked) {
      flagAsked = true;
      void landFlags(world, land)
        .then((layer) => {
          if (flagCeiling !== null) layer.setCeiling(flagCeiling);
          flagLayer = layer;
        })
        // The frontiers and the names do not depend on the chunk, so a failed
        // fetch costs the flag and nothing else. It is asked for once.
        .catch((error: unknown) => console.warn('the flag layer did not load:', error));
    }
    if (flagLayer !== null) {
      if (!flagLayer.state.ready) flagLayer.build(FLAG_BUILD_MS);
      flagLayer.setFade(overlayFade);
    }
    // A world width for the frontier that holds a constant *pixel* width, which
    // is the one thing `borders.ts` could not do from the ground. One CSS pixel
    // at the range the ground under the player is at; `renderer.setPixelRatio`
    // is deliberately not in it, because what is being held constant is how
    // wide the line looks and not how many samples it gets.
    borders.update(
      overlayFade,
      (2 * Math.tan(rig.camera.fov * 0.5 * DEG) * eyeOverGround) / innerHeight,
    );
    names.update(overlayFade, rig.camera, standingIn);

    // The shadow map is redrawn on a cadence and not per frame: 45 ms while
    // anything the box holds is moving (the player, who is also the box), 180
    // while you stand — the reference's own numbers, at which a moving shadow
    // is 22 Hz and a standing one is a slow crawl of the sun nobody sees. And
    // **at once when a streamer has changed what stands in the world**, which
    // is one integer compare per group: a town that arrives this frame would
    // otherwise stand shadowless for up to 180 ms. A swap that keeps the count
    // waits for the cadence. Skipped entirely while the fades have the shadow
    // at zero — at night, and from the air — since the map is then drawn into
    // and mixed away in the same frame.
    const standing =
      monuments.group.children.length +
      settlements.group.children.length +
      vegetation.group.children.length +
      life.group.children.length;
    const cadence = player.velocity > 0 ? SHADOW_MOVING_MS : SHADOW_STILL_MS;
    if (sky.state.shadow > 0 && (now - shadowDrawnAt >= cadence || standing !== shadowStanding)) {
      // The light moves only here, in the frame the map is drawn from it — see
      // `Sky.placeShadow`: moved between two redraws it takes every shadow off
      // the screen.
      sky.placeShadow();
      renderer.shadowMap.needsUpdate = true;
      shadowDrawnAt = now;
      shadowStanding = standing;
    }

    const drawStart = performance.now();
    outline.render(scene, rig.camera);
    accumulated += performance.now() - drawStart;

    frames++;
    if (now - sampledAt > 500) {
      stats.fps = Math.round((frames * 1000) / (now - sampledAt));
      stats.frameMs = Number((accumulated / frames).toFixed(2));
      stats.triangles = renderer.info.render.triangles;
      stats.calls = renderer.info.render.calls;
      frames = 0;
      accumulated = 0;
      sampledAt = now;
      if (performanceOn) hud.showPerformance(stats);
    }

    // The clock is the world's own, not the machine's: `sky.setTime` and
    // `setRate` move it, so watching a dawn at ten minutes a second moves the
    // chip too. Over water there is no country and `clockAt` falls back to
    // local mean solar time from the longitude, which is the honest answer at
    // sea and is never absent.
    const here = toLatLon(player.position);
    hud.update(
      standingIn,
      nearbyPlace,
      clockAt(
        sky.state.time,
        standingIn > 0 ? world.countries[standingIn - 1]!.iso : '',
        here.lon,
        here.lat,
      ),
      dt,
      // Which way the town lies, clockwise from where you are facing.
      // `cartography.ts` owns it because the sign of that answer is `setFrame`'s
      // `right = forward x up`, and this project has shipped the other order
      // three times — see *Handedness* in `docs/traps.md`.
      bearingTo(
        player.position,
        player.forward,
        nearbyPlace.place.lat,
        nearbyPlace.place.lon,
      ),
    );
  }

  console.log(`atlas ready in ${Math.round(performance.now() - began)} ms`);
  const loopStarted = performance.now();
  requestAnimationFrame(frame);

  // For poking around from the console: `atlas.goTo(48.86, 2.29)` drops you at
  // the Eiffel Tower without walking across Europe. To see the whole planet:
  // `atlas.rig.view.height = 30000` (it has to clear 1.164 radii for the globe
  // to fit inside a 55 degree lens).
  Object.assign(globalThis, {
    atlas: {
      world,
      player,
      rig,
      scene,
      // `atlas.sky.setTime('2026-09-04T05:20:00Z')` freezes the world at that
      // instant and keeps it running from there; `atlas.sky.setRate(600)` runs
      // ten minutes a second, which is how you watch a dawn without waiting.
      sky,
      input,
      renderer,
      // The effect, not just the renderer: a frame here is two passes, so
      // timing one `renderer.render` measures half the cost. `atlas.outline`
      // plus `gl.finish()` is how the settlement budget was measured, because
      // `stats.frameMs` is a rolling average of frames a hidden tab never ran.
      outline,
      stats,
      hud,
      minimap,
      borders,
      /**
       * The map layer — every country's own flag over its own land, the dashed
       * frontiers between them and the names on top — which fades in with
       * altitude and is `B` on the keyboard.
       *
       * `atlas.flags()` reads it, `atlas.flags(false)` turns the whole thing
       * off and remembers that, and a number sets what a *full* fade blends to
       * (0.94 is the default; `land-flags.ts` carries the study behind it). The
       * fade itself is not settable, because it is the altitude.
       */
      flags(on?: boolean | number) {
        if (typeof on === 'boolean') announce(setOverlay(on) ? 'flags on' : 'flags off');
        else if (typeof on === 'number') {
          flagCeiling = on;
          flagLayer?.setCeiling(on);
          setOverlay(true);
        }
        return {
          enabled: overlayOn,
          fade: Number(overlayFade.toFixed(3)),
          layer: flagLayer === null ? 'not built' : { ...flagLayer.state },
          borders: { ...borders.stats },
          names: { ...names.stats },
        };
      },
      /** The names over the land: how many are drawn and what they were chosen from. */
      names,
      monuments,
      // `atlas.settlements.stats` is the settlement half of `atlas.stats`, and
      // `atlas.settlements.compare('Paris')` is the merged-against-instanced
      // measurement that decided how a town is drawn.
      settlements,
      // `atlas.roads.stats` is tiles, roads and triangles resident;
      // `atlas.roads.degrees()` is the graph's shape and `atlas.roads.all` is
      // every edge in `roads.bin`, which is every edge that is drawn.
      roads,
      // `atlas.life.stats` is what moves: movers by family, the birds drawn,
      // the meshes they cost before the outline doubles them, and the pooled
      // geometry held. `atlas.life.verify()` sweeps the walk cycle and reports
      // the worst distance a foot ends up below the floor, which is the check
      // that pays for the one line copied out of `avatar.ts`.
      life,
      // `atlas.vegetation.stats` counts tiles, plants and triangles by level;
      // `atlas.vegetation.sample(lat, lon, level)` builds one tile and reports
      // what it cost, and `.verify(lat, lon)` builds it twice and compares.
      vegetation,
      // `atlas.clouds.stats` is the deck's cost: cells kept, coverage,
      // triangles, chunks and the build. `atlas.clouds.group.visible = false`
      // is the A/B.
      clouds,
      // `atlas.ocean.stats` is the sea's cost: the sphere's detail and its sag,
      // how many coastal spans the shallows are built from, triangles and MB.
      // `atlas.ocean.group.visible = false` is the A/B.
      ocean,
      // `atlas.lights.points.visible = false` is the A/B for the far field and
      // `atlas.brightness(0)` turns every emitting surface in the world off,
      // windows and lamps included, without touching the geometry.
      lights: cityLights,
      brightness: lightBrightness,
      nav,
      map,
      placements,
      places,
      goTo(lat: number, lon: number) {
        // Never inside a building: `player.goTo` steps clear of any town already
        // standing there, and one raised after the jump pushes you out on its
        // first frame. See the player's options above.
        player.goTo(lat, lon);
        rig.snap(player, groundAt);
        // The chip is debounced against a coastline crossed on foot, and a jump
        // across the planet is the one thing that filter gets wrong: without
        // this it names the country and the town you left for a second, which
        // reads as `countryAt` being broken. See `Hud.jump`.
        hud.jump();
        const id = world.countryAtPoint(player.position);
        return id > 0 ? world.countries[id - 1]!.name : 'Open ocean';
      },
      /**
       * How far the world is built, as one number.
       *
       * `atlas.detail()` reads it and `atlas.detail(4)` sets it, live, with no
       * reload — every streamer notices on its next frame and rescans. It
       * survives a reload in `localStorage`, and `[` and `]` step it from the
       * keyboard so you can find the number your machine likes without going
       * near the console. See `view.ts` for what it scales and why the exponents
       * differ.
       */
      detail(value?: number) {
        if (value !== undefined) showDetail(setDetail(value));
        return detail();
      },
      /**
       * How near a much bigger town has to be before this one is not built,
       * in world units; `PROMINENCE_RADIUS` in `places.ts` carries the study.
       *
       * `atlas.prominence()` reads it and `atlas.prominence(200)` sets it,
       * live: the settlements, the vegetation and the herds rescan on their
       * next frame and the chip stops naming what is no longer there. It is
       * not persisted and it is not the detail knob — how far the world is
       * built is a budget, and which towns exist is not.
       *
       * **The roads do not follow it at all any more**, and that is a real
       * limit rather than a lag: `roads.bin` is a graph over the places
       * `isShown` returns true for at *bake* time, so turning this knob is a
       * re-bake and not a reload, and so are the gates each road arrives
       * by. What is still live is the climb into a gate, because `rampOf`
       * asks `isShown` — `roads.ts` drops its geometry outright when the knob
       * turns, so a ribbon cannot go on ramping up to the paving of a town
       * that is no longer built.
       */
      prominence(radius?: number) {
        if (radius !== undefined) setProminenceRadius(radius);
        return prominenceRadius();
      },
    },
  });
}

start().catch((error: unknown) => {
  console.error(error);
  const loading = document.getElementById('loading');
  const text = document.getElementById('loading-stage');
  if (loading !== null && text !== null) {
    loading.classList.add('failed');
    text.textContent = `Something went wrong: ${String(error)}`;
  } else {
    // Past the loading screen there is nowhere else to say it, so it gets a
    // card of its own rather than a silent console.
    const card = document.createElement('div');
    card.style.cssText =
      'position:fixed;left:50%;top:24px;transform:translateX(-50%);z-index:40;padding:12px 18px;' +
      'background:#fff2e8;border:3px solid #1e0603;border-radius:14px;box-shadow:0 5px 0 #1e0603;' +
      'font:700 14px ui-rounded,system-ui,sans-serif;color:#1e0603';
    card.textContent = `Something went wrong: ${String(error)}`;
    document.body.appendChild(card);
  }
});
