import * as THREE from 'three';
import { OutlineEffect } from './outline.ts';
import { loadLakes, loadWorld, toLatLon } from './geo.ts';
import { landFlags, PLANET_RADIUS, UNITS_PER_DEGREE, buildLand, groundRadius } from './globe.ts';
import { createInput } from './input.ts';
import { createCameraRig } from './camera.ts';
import { createPlayer } from './player.ts';
import type { PlayerEvent } from './player.ts';
import { actionOf, codeOf, inputBlocked, labelOf, registerModal } from './controls.ts';
import { prepareAvatar } from './avatar.ts';
import { createMonuments, loadPlacements } from './placement.ts';
import { detailRadiusFor, loadPlaces, prominenceRadius, setProminenceRadius } from './places.ts';
import { createBorders } from './borders.ts';
import { createRoads, loadRoads } from './roads.ts';
// From the contract rather than from `./monuments/index.ts`, which is the whole
// registry: see `deferred` in `start()`. `index.ts` re-exports this, and taking
// it from there would drag all eighty-five model files into the first load for
// one function that has nothing to do with them.
import { createContext } from './monuments/contract.ts';
import { setDetailSites, setFlattenSites, shoreDistance } from './terrain.ts';
import { biomeAt } from './biome.ts';
import type { BiomeSample } from './biome.ts';
import { createAudio } from './audio.ts';
import type { Surface } from './audio.ts';
import { BOAT_BOOST, PLANE_CRUISE_HIGH, PLANE_CRUISE_LOW } from './vehicles.ts';
import { SHADOW_COVER, createSky } from './sun.ts';
import { createClouds } from './clouds.ts';
import { createOcean } from './ocean.ts';
import { createCityLights, lightBrightness, setSunDirection } from './lights.ts';
import { clockAt } from './timezone.ts';
import { FOG_COLOR } from './theme.ts';
import { DETAIL_MAX, DETAIL_MIN, autoDetail, autoDetailState, beginFrameBuild, detail, fogFar, sampleFrame, setAutoDetail, setDetail } from './view.ts';
import type { FlagLayer } from './land-flags.ts';
import type { Curtain } from './menu.ts';
import type { TimeOfDay } from './settings.ts';
import type { IconName } from './ui.ts';

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
 * How often the shadow map is redrawn while nothing in the box is moving, in
 * milliseconds. While something is, it is every frame — see the loop.
 */
const SHADOW_STILL_MS = 180;

/** How much of the ground's own height the haze and the streamers count; see the loop. */
const HAZE_ELEVATION = 0.25;

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
 * Building the land is seconds of synchronous work on the main thread — a
 * triangulation, a refinement pass driven by the relief, and about 112 MB of
 * buffers (on the 1:10m outlines, measured headless on 2026-09-13; `BOOT`
 * below budgets 7.5 s for it in a browser, and says that is a guess).
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

/**
 * A card over everything, for the few things the player has to be told before
 * or instead of the world: no WebGL 2, a touch screen, a lost graphics context,
 * a failure. **Built from `index.html`'s own markup and tokens rather than from
 * `ui.ts`**, because the first two are asked before anything is downloaded and
 * the last can be a download that failed — `ui.ts` is in the HUD's chunk, and a
 * card that needs a chunk to say the chunks did not arrive says nothing.
 */
interface NoticeAction {
  label: string;
  primary?: boolean;
  run(): void;
}

let noticeOpen = false;
registerModal(() => noticeOpen);

function notice(title: string, text: string, actions: readonly NoticeAction[]): void {
  const root = document.getElementById('notice');
  const heading = document.getElementById('notice-title');
  const body = document.getElementById('notice-text');
  const row = document.getElementById('notice-actions');
  if (root === null || heading === null || body === null || row === null) {
    // Nowhere to put it, which is only possible if `index.html` lost it.
    alert(`${title}\n\n${text}`);
    return;
  }
  heading.textContent = title;
  body.textContent = text;
  row.replaceChildren(
    ...actions.map((action) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = action.primary === true ? 'n-btn primary' : 'n-btn';
      button.textContent = action.label;
      button.addEventListener('click', () => {
        root.hidden = true;
        noticeOpen = false;
        action.run();
      });
      return button;
    }),
  );
  root.hidden = false;
  noticeOpen = true;
  if (document.pointerLockElement !== null) document.exitPointerLock();
  (row.querySelector('.primary') as HTMLButtonElement | null)?.focus({ preventScroll: true });
}

const reload: NoticeAction = { label: 'Reload', primary: true, run: () => location.reload() };

let failed = false;

/**
 * Something the world cannot go on without has failed. Said wherever the player
 * is — on the loading screen, over the menu or over the world — with a way out.
 *
 * It used to write into the loading screen's status line if the loading screen
 * was in the page, and the loading screen stays in the page for 1.3 seconds
 * after it has faded: an error in that window was written into an invisible
 * element, over a spinner that never stopped. Once is enough; the first failure
 * is the one worth reading.
 */
function fail(error: unknown): void {
  console.error(error);
  if (failed) return;
  failed = true;
  const message = error instanceof Error ? error.message : String(error);
  notice(
    'Something went wrong',
    `atlas stopped: ${message}. Reloading usually fixes it; if it keeps happening, the browser's console says more.`,
    [reload],
  );
}

/**
 * Whether this browser can draw the world at all. Three r182 is WebGL 2 only, and
 * without it the renderer throws a few seconds in, after the data has been
 * downloaded for nothing. The probe's context is handed straight back.
 */
function hasWebGL2(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (gl === null) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/**
 * A phone or a tablet with nothing but a finger. The controls are a keyboard
 * and a mouse, and nothing in the world answers a touch — so the player is
 * told so before the world downloads (7.4 MB of data and models on disk,
 * 2026-09-21) and seconds of building freeze the phone, rather than after.
 * `any-pointer: fine` rather than `pointer: fine`, because a tablet with a
 * mouse plugged in has a coarse primary pointer and a fine one as well.
 */
function touchOnly(): boolean {
  try {
    return matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
  } catch {
    return false;
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
const RESOLUTION_KEY = 'atlas.resolution.v1';
/** `{ volume, on }`: the soundscape's two settings. */
const SOUND_KEY = 'atlas.sound.v1';
/**
 * How far off the water the sea is still heard, in degrees of `shoreDistance`:
 * 0.4 is 110 units, a few streets back from a harbour.
 */
const SEA_EARSHOT = 0.4;
/** Whether the welcome card has been shown on this device. */
const WELCOME_KEY = 'atlas.welcomed.v1';

/**
 * Where the player was, for the menu's "Continue in …": written here, read by
 * `menu.ts`, and **the shape is the contract between the two** — `{ lat, lon,
 * name, iso, savedAt }`, the nearest built town's name, the ISO code of the
 * country underfoot or `''` at sea, and `Date.now()`. Every ten seconds and on
 * `pagehide`, which is the last event a closing tab is sure to deliver.
 */
const LAST_PLACE_KEY = 'atlas.lastPlace.v1';
const LAST_PLACE_MS = 10_000;

/**
 * How many pixels the world is drawn at, per CSS pixel. `auto` is what it
 * always was — the screen's own ratio up to 2, which is where a 4K laptop
 * stops being able to afford a two-pass ink — and the rest are the player's
 * choice between sharpness and frames.
 */
const RESOLUTIONS = [
  ['auto', 'Auto'],
  ['sharp', 'Sharp'],
  ['balanced', 'Balanced'],
  ['fast', 'Fast'],
] as const;
type Resolution = (typeof RESOLUTIONS)[number][0];

function pixelRatioFor(resolution: Resolution): number {
  const screen = globalThis.devicePixelRatio || 1;
  if (resolution === 'sharp') return screen;
  if (resolution === 'balanced') return Math.min(screen, 1.5);
  if (resolution === 'fast') return 1;
  return Math.min(screen, 2);
}

/** The time-lapse's rate: an hour of sky a minute. */
const TIME_LAPSE = 60;

/**
 * A tab left open on the pause card with nobody at it: after this long without
 * a key, a click, a wheel or a move of the mouse, the loop draws at about 30
 * frames a second instead of the display's own rate, and any input brings it
 * back on the next frame. A little under 33.3 ms, so that a 60 Hz display
 * draws every other frame rather than every third.
 */
const IDLE_AFTER_MS = 60_000;
const IDLE_FRAME_MS = 30;
/** How many frame intervals the worst and the 95th percentile are taken over: two seconds at 60 Hz. */
const FRAME_WINDOW = 120;

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

  // Before anything heavy is asked for: a browser that cannot draw the world
  // is told so instead of downloading it, and a touch screen is told honestly
  // what the controls are and allowed to try anyway.
  if (!hasWebGL2()) {
    notice(
      'atlas needs WebGL 2',
      'This browser cannot draw it: WebGL 2 is off or unsupported here. A current Chrome, Edge, Firefox or Safari on a computer will run it, as will turning hardware acceleration back on.',
      [reload],
    );
    return;
  }
  if (touchOnly()) {
    await new Promise<void>((resolve) => {
      notice(
        'atlas needs a keyboard and a mouse',
        'You walk, sail and fly with the keys and look around with the mouse, and nothing here answers a touch yet. It is best on a computer.',
        [{ label: 'Try anyway', primary: true, run: resolve }],
      );
    });
  }

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
    /**
     * The front door: the whole Earth, turned by hand, and the solar system
     * round it. About 32 KB gzipped since the orrery (2026-09-13).
     */
    menu: import('./menu.ts'),
    /** Six quadrupeds behind an eager glob, the way the vehicles arrive. */
    fauna: import('./fauna/index.ts'),
    /** Eighty-five model files behind an eager glob. The largest. */
    monuments: import('./monuments/index.ts'),
    /** With it, the whole scenery kit and the whole traffic kit. */
    settlements: import('./settlements.ts'),
    vegetation: import('./vegetation.ts'),
    life: import('./life.ts'),
    /** The people: the cast dressed by region, standing in towns and walking verges. */
    folk: import('./folk.ts'),
    traffic: import('./traffic/index.ts'),
    /** The scenery contract, for the kit's model registry; it rides with the settlements. */
    scenery: import('./scenery/contract.ts'),
    /**
     * The baked CC0 models (`scripts/build-kit.ts`). The vehicles' file is
     * fetched here, beside the code that draws them, and registered before
     * the first town parks a car; the animals' files arrive a herd at a time.
     */
    kit: import('./kit.ts'),
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
  // Each of them is awaited in its turn below, and a rejection there is a
  // failure of `start()`. But one that fails *now* — a chunk that did not
  // arrive — would sit rejected with nobody listening until its turn came,
  // which the browser reports as an unhandled rejection seconds before the
  // real error. Listening here marks them handled; the `await` still throws.
  for (const chunk of Object.values(deferred) as Promise<unknown>[]) chunk.catch(() => {});
  // Started now, so the vehicles, the flora and the buildings download while
  // the ocean and the land are built rather than after them. A kit that fails
  // to arrive leaves the towns without parked cars and the roads without
  // traffic, and the world otherwise whole — so its failure is caught here, at
  // once, and is a warning rather than the fatal card.
  const vehicleKit = deferred.kit
    .then(async ({ loadModels }) =>
      (await Promise.all([loadModels('traffic/kit.bin'), loadModels('nature/kit.bin'), loadModels('buildings/kit.bin')])).flat(),
    )
    .catch((error: unknown) => {
      console.warn('the model kit did not load', error);
      return [];
    });

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
  // The ratio is set in `resize`, which runs on every resize and on every
  // change of the screen's own ratio — browser zoom, or the window dragged to
  // another monitor — and not only here: set once, it stayed whatever the
  // first screen said for the rest of the session.
  let resolution: Resolution = RESOLUTIONS.some(([value]) => value === readSetting(RESOLUTION_KEY))
    ? (readSetting(RESOLUTION_KEY) as Resolution)
    : 'auto';
  renderer.setPixelRatio(pixelRatioFor(resolution));
  document.body.appendChild(renderer.domElement);
  // A driver reset, a GPU switch, too many tabs: the context goes, and with it
  // every buffer the streamers and the land uploaded. Rather than trust a
  // world half put back by a restore, the answer is a reload, said once.
  renderer.domElement.addEventListener('webglcontextlost', () => {
    if (failed) return;
    failed = true;
    notice(
      'The graphics card stopped drawing',
      'The browser took the WebGL context away — a driver reset, a sleeping laptop or too many tabs can do it. Reload to put the world back.',
      [reload],
    );
  });
  // Frame statistics count both of `outline.render`'s passes: see `stats`.
  renderer.info.autoReset = false;
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
  // `?at=lat,lon` skips the menu and puts you there — the pause card's "Copy
  // link to here" writes exactly that, and `scripts/shot.mjs` has always used
  // it; `?time=ISO` freezes the sun there (`sky.setTime`) and `?height=N`
  // starts the camera that far up, which two are debug surface. The time is
  // set here, before the menu, so a shot of the menu is of a chosen hour and
  // not of whatever hour the machine taking it happens to be.
  const query = new URLSearchParams(location.search);
  if (query.get('time')) sky.setTime(query.get('time'));
  /** Whether the sun follows the real clock: the settings' time-of-day row. */
  let timeLive = !query.get('time');
  let timeFast = false;

  // The hero's body is an authored character in `public/models/cast/`, fetched
  // alongside the world rather than after it; `buildAvatar` needs it by the
  // time the player is made. Without it there is no player, so its failure is
  // the fatal card — at once, rather than after the player has chosen a town.
  const avatarReady = prepareAvatar();
  avatarReady.catch(fail);
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
    // The Resolution setting's ratio, so a resize in the menu keeps it.
    pixelRatio: () => pixelRatioFor(resolution),
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
    // Not at the country and town stages: there the camera is choosing a place
    // on the planet, and a grey disc hanging beside it is a second body to
    // explain.
    if (moonDisc !== undefined) moonDisc.visible = inside && menu.stage !== 'region' && menu.stage !== 'site';
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
    // And when a floor arrives or goes, so a landmark raised before its town
    // is lifted onto the paving when the paving comes.
    (since, into) => settlements.floorChanges(since, into),
  );
  scene.add(monuments.group);
  if (monuments.broken.length > 0) console.warn('monuments that broke the contract:', monuments.broken);
  console.log(`${monuments.missing.length} placed landmarks have no model yet`);

  await stage('settling the country');
  // Every place's anchor is asked for the ground once, here, which is the
  // whole of what this costs before you move: a point-in-polygon query each.
  // The network goes in with them: a town's own tracks leave on the headings
  // its roads actually take, which is the difference between a lane going
  // somewhere and a lane pointing at somewhere.
  const { createSettlements } = await deferred.settlements;
  // A part built before its model has arrived would be cached as refused, so
  // the kit — vehicles and flora — is registered before anything can ask.
  // A kit that fails to arrive leaves the towns without parked cars and the
  // roads without traffic, and the world otherwise whole.
  const [{ registerSceneryModels }, vehicleModels] = await Promise.all([deferred.scenery, vehicleKit]);
  registerSceneryModels(vehicleModels);
  const settlements = createSettlements(world, places.all, {
    context: ctx,
    monuments: placements,
    roads: baked.roads,
  });
  scene.add(settlements.group);
  // Every place on the planet as one buffer of points, lit where the sun is
  // not. It reads the settlements' own anchors rather than asking the terrain
  // again — a point-in-polygon query a place, which the streamer has already
  // paid for — and it exists because the settlement mesh cannot do this job: from the
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
  const { createRigLibrary } = await deferred.kit;
  const { modelMaterial } = await import('./models.ts');
  const inkSource = ctx.toon(ctx.palette.ink);
  const life = createLife(world, places.all, {
    context: ctx,
    roads: baked.roads,
    vehicles: VEHICLES,
    folk,
    // Handed down rather than imported, the same way the vehicles are: `life.ts`
    // stays Node-safe and adding an animal stays one file and nothing else.
    animals: ANIMALS,
    // The animals' baked rigs, a species at a time as herds of it come near.
    rigs: createRigLibrary(
      modelMaterial(inkSource.gradientMap!, inkSource.userData.outlineParameters as { thickness: number; color: [number, number, number] }),
    ),
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
    // The drawn land and the towns' lawns, which the grass under your feet stands on.
    land,
    lawns: settlements,
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
  // Every program the streamers will draw with, compiled while the player
  // chooses, so the first town, landmark or animal is not also a shader link.
  // The skinned twin is the rigs' own material, and a plain `ctx.toon` colour
  // stands for the craft; see `warm.ts`.
  void import('./warm.ts')
    .then(({ proxyOf, warmShaders }) =>
      warmShaders(
        renderer,
        outline,
        scene,
        [settlements, monuments, roads, vegetation, life, { proxies: () => [proxyOf(inkSource)] }],
        modelMaterial(inkSource.gradientMap!, inkSource.userData.outlineParameters as { thickness: number; color: [number, number, number] }),
      ),
    )
    .then((ms) => console.log(`shaders warmed in ${Math.round(ms)} ms`))
    .catch((error: unknown) => console.warn('the shader warm-up failed:', error));
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
  // The ear. Silent and nearly free until a gesture unlocks it — the browser's
  // rule — so every pointer press and key press offers it the unlock, which is
  // idempotent and also resumes a context a hidden tab suspended.
  const audio = createAudio();
  try {
    const saved = JSON.parse(readSetting(SOUND_KEY) ?? 'null') as { volume?: unknown; on?: unknown } | null;
    if (saved !== null && typeof saved.volume === 'number') audio.volume = saved.volume;
    if (saved !== null && typeof saved.on === 'boolean') audio.muted = !saved.on;
  } catch {
    // A mangled setting is the default one.
  }
  const saveSound = (): void => writeSetting(SOUND_KEY, JSON.stringify({ volume: audio.volume, on: !audio.muted }));
  const unlockAudio = (): void => audio.unlock();
  addEventListener('pointerdown', unlockAudio, { capture: true });
  addEventListener('keydown', unlockAudio, { capture: true });
  /** What the foot is on, refreshed a couple of times a second in the loop. */
  let footing: Surface = 'grass';

  await avatarReady;
  const player = createPlayer(world, spawn.lat, spawn.lon, {
    madeHeightAt,
    onStep: (weight) => audio.step(footing, weight),
    // A jump lands at about its take-off speed; stepping off a kerb does not.
    onTouchdown: (speed) => {
      if (speed > 12) audio.cue('land');
    },
    collide: (point, radius, push) => settlements.collide(point, radius, push),
    freeSpotNear: (point, radius, out) => settlements.freeSpotNear(point, radius, out),
    // What the player did or was refused, in words. Only what the strip along
    // the bottom does not already say: a refusal, a landing, and a landing
    // that turned into a boat.
    onEvent: (event: PlayerEvent) => {
      if (event === 'ashore-refused') {
        announce('No shore within reach — sail closer to land', 'boat');
        audio.cue('ui-error');
      }
      else if (event === 'landing') announce(`Landing — ${labelOf('fly')} to go around`, 'plane');
      else if (event === 'go-around') announce('Going around', 'plane');
      else if (event === 'ditched') announce('Down on the water — you are in the boat', 'boat');
    },
  });
  scene.add(player.object);

  const rig = createCameraRig({
    blocks: (point) => settlements.blocksSight(point),
    onViewRefused: () => announce('First person is on foot only', 'eye'),
  });
  // Only when it is asked for: `Number(null)` is 0, so the unguarded test put
  // every ordinary load's walking camera on the ground.
  const heightQuery = query.get('height');
  if (heightQuery !== null && Number.isFinite(Number(heightQuery))) rig.view.height = Number(heightQuery);
  const input = createInput(renderer.domElement, {
    // An embed that may not lock the mouse: say once what works instead.
    onLockRefused: () => announce('This page cannot lock the mouse — drag to look around', 'mouse'),
  });
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
    onShare: shareHere,
    // The card for a new country, and the frontier's jingle with it.
    onArrival: () => audio.cue('frontier'),
    // Inside the welcome card's click, so the lock is still the player's gesture.
    onStart: () => input.lock(),
  });
  document.body.appendChild(hud.root);

  /**
   * How many landmarks are found, counted over the placements that exist. The
   * visited set is whatever `localStorage` has held since the first visit, and
   * an id a later build renamed or removed is still in it: its size could read
   * 86 of 85.
   */
  const foundCount = (): number => placements.reduce((sum, placement) => sum + (monuments.isVisited(placement.id) ? 1 : 0), 0);
  const showCount = (): void => hud.setFound(foundCount(), placements.length);
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
    key: codeOf('map'),
    // A card holding the keyboard — Settings, the welcome, a notice — keeps
    // `M` from opening the map underneath it. Closing is never blocked.
    blocked: () => inputBlocked(),
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

  function announce(text: string, iconName: IconName = 'sparkle'): void {
    hud.toast(text, iconName);
  }
  function showDetail(value: number): void {
    announce(`Render distance ${value.toFixed(2)}×`, 'eye');
  }

  /**
   * "Copy link to here", from the pause card: the address with `?at=` set to
   * where you stand, which is the menu-skipping link `main.ts` has always
   * read. Four decimals is eleven metres of real Earth, under three hundredths
   * of a unit here.
   */
  function shareHere(): void {
    const { lat, lon } = toLatLon(player.position);
    const url = `${location.origin}${location.pathname}?at=${lat.toFixed(4)},${lon.toFixed(4)}`;
    const copied = navigator.clipboard?.writeText(url);
    if (copied === undefined) {
      announce(`Copy this link: ${url}`, 'pin');
      return;
    }
    copied.then(
      () => announce('Link copied — it opens right here', 'pin'),
      () => announce(`Copy this link: ${url}`, 'pin'),
    );
  }

  /**
   * A photo of the world: `P`. The canvas as a PNG, taken in the frame it was
   * drawn — see `frame` — and saved as a download named for where it was taken.
   * The HUD is HTML over the canvas and not in it, so a photo is the world
   * alone without anything having to be hidden for it.
   */
  let photoWanted = false;
  function savePhoto(canvas: HTMLCanvasElement): void {
    const place = places.nearest(player.position).place.name;
    const slug = place.normalize('NFD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'somewhere';
    const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');
    canvas.toBlob((blob) => {
      if (blob === null) {
        announce('The photo could not be saved', 'camera');
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `atlas-${slug}-${stamp}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      announce('Photo saved', 'camera');
    }, 'image/png');
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
  let overlayOn = readSetting(OVERLAY_KEY) !== '0';
  function setOverlay(on: boolean): boolean {
    overlayOn = on;
    writeSetting(OVERLAY_KEY, on ? '1' : '0');
    return on;
  }

  /**
   * The keys that are settings rather than controls, from `controls.ts`'s one
   * table. The detail knob is on the keyboard because the console is not where
   * you are when you find out a number is wrong: `[` and `]` step it by a
   * quarter of itself, which is geometric rather than linear on purpose — the
   * range runs from 0.25 to 6 and a fixed step would be a nudge at the top and a
   * doubling at the bottom — and they repeat while held. The toggles do not: a
   * held `B` flipped the map layer at the keyboard's repeat rate.
   */
  addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (inputBlocked(event)) return;
    const action = actionOf(event.code);
    if (action === 'nearer') showDetail(setDetail(Math.max(DETAIL_MIN, detail() / 1.25)));
    else if (action === 'farther') showDetail(setDetail(Math.min(DETAIL_MAX, detail() * 1.25)));
    if (event.repeat) return;
    if (action === 'flags') announce(setOverlay(!overlayOn) ? 'Flags and borders on' : 'Flags and borders off', 'flag');
    // `H` can turn the strip back on as well as fold it, and what it turns on
    // is remembered the way the settings' switch remembers it.
    else if (action === 'hints') writeSetting(HINTS_KEY, hud.toggleHints() ? '1' : '0');
    else if (action === 'photo') photoWanted = true;
  });

  /**
   * The time of day, from the settings: live, or an hour where you stand. The
   * sky's clock is an offset and a rate (`sky.setTime`, `sky.setRate`), so a
   * chosen hour keeps running from there. The hour is read off the chip, which
   * is the clock the player sees — `clockAt`, the country's own zone or the
   * sun's at sea — so the conversion is the difference between the hour shown
   * and the hour wanted, applied to the sky's instant: "today" in local terms,
   * whatever the zone. Nothing here is remembered.
   */
  const shownMinutes = (): number | null => {
    const [hours, minutes] = hud.clock.split(':').map(Number);
    return hours === undefined || minutes === undefined || !Number.isFinite(hours + minutes) ? null : hours * 60 + minutes;
  };
  const time: TimeOfDay = {
    hour: () => (shownMinutes() ?? 720) / 60,
    live: () => timeLive,
    setHour(hour) {
      const now = shownMinutes();
      if (now === null) return hour;
      const wanted = Math.round(hour * 60) % 1440;
      sky.setTime(sky.state.time.getTime() + (wanted - now) * 60_000);
      timeLive = false;
      return hour;
    },
    setLive() {
      sky.setRate(1);
      sky.setTime(null);
      timeLive = true;
      timeFast = false;
    },
    fast: {
      get: () => timeFast,
      set(on) {
        timeFast = on;
        sky.setRate(on ? TIME_LAPSE : 1);
        if (on) timeLive = false;
        return on;
      },
    },
  };

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
    autoDetail: {
      get: autoDetail,
      set: (on) => setAutoDetail(on),
    },
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
    resolution: {
      get: () => resolution,
      set: (value) => {
        resolution = RESOLUTIONS.find(([option]) => option === value)?.[0] ?? 'auto';
        writeSetting(RESOLUTION_KEY, resolution);
        resize();
        return resolution;
      },
      options: RESOLUTIONS,
    },
    time,
    sound: {
      volume: {
        get: () => audio.volume,
        set: (value) => {
          audio.volume = value;
          saveSound();
          return audio.volume;
        },
        min: 0.05,
        max: 1,
      },
      on: {
        get: () => !audio.muted,
        set: (on) => {
          audio.muted = !on;
          saveSound();
          return on;
        },
      },
    },
    lockTarget: renderer.domElement,
    // One card at a time: the settings over the world map would be two
    // overlays holding the mouse, and the map's keys under a modal card.
    onOpen: () => {
      if (map.open) map.hide();
      audio.cue('ui-open');
    },
    onClose: () => audio.cue('ui-close'),
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
    renderer.setPixelRatio(pixelRatioFor(resolution));
    renderer.setSize(innerWidth, innerHeight);
    rig.resize(innerWidth, innerHeight);
  }
  addEventListener('resize', resize);
  resize();
  /**
   * A change of the screen's own pixel ratio with no resize to announce it:
   * the window dragged onto a monitor of another density. A media query on
   * the current ratio fires once when it stops being true, and is then asked
   * again about the new one.
   */
  const watchRatio = (): void => {
    try {
      matchMedia(`(resolution: ${globalThis.devicePixelRatio || 1}dppx)`).addEventListener(
        'change',
        () => {
          resize();
          watchRatio();
        },
        { once: true },
      );
    } catch {
      // No `matchMedia` change events: the resize listener is all there is.
    }
  };
  watchRatio();

  /**
   * Where the player is, for the menu's "Continue in …" (`LAST_PLACE_KEY`).
   * Plain numbers and strings, so the same record is what a peer would be
   * sent when there are peers.
   */
  function saveLastPlace(): void {
    const { lat, lon } = toLatLon(player.position);
    const id = world.countryAtPoint(player.position);
    writeSetting(
      LAST_PLACE_KEY,
      JSON.stringify({
        lat: Number(lat.toFixed(5)),
        lon: Number(lon.toFixed(5)),
        name: places.nearest(player.position).place.name,
        iso: id > 0 ? world.countries[id - 1]!.iso : '',
        savedAt: Date.now(),
      }),
    );
  }
  setInterval(saveLastPlace, LAST_PLACE_MS);
  addEventListener('pagehide', saveLastPlace);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveLastPlace();
  });

  // Without this the camera starts at the origin, which is the planet's centre,
  // and the first frames render from inside the Earth.
  rig.snap(player, groundAt);
  menu.dispose();


  let previous = performance.now();
  /** When the shadow map was last redrawn, and what stood in the world then. */
  let shadowDrawnAt = -Infinity;
  let shadowStanding = -1;

  /**
   * Rolling frame cost, on `atlas.stats` and the settings' overlay.
   *
   * Worth carrying permanently: `OutlineEffect` draws the scene twice, so the
   * land mesh costs double its triangle count every frame, and terrain relief
   * took that mesh from 301k triangles to 766k in one commit. A number that is
   * always there is how the next such jump gets noticed on the day it lands
   * rather than on someone else's laptop.
   *
   * **It used to report half a frame and time only its draw.** `renderer.info`
   * resets on every `renderer.render` and `outline.render` calls it twice, so
   * the triangles and calls were the ink pass alone; `autoReset` is off now
   * (see the renderer) and the counters are reset once, at the top of the
   * frame, so they are both passes and a shadow redraw when there is one. And
   * `frameMs` was the render call only. It is split now: `updateMs` is
   * everything before the draw — the streamers, above all — `drawMs` is the
   * two passes, and `frameMs` their sum, each a mean over half a second. A mean
   * hides the hitch, so `p95Ms` and `worstMs` are the time *between* frames over
   * the last `FRAME_WINDOW` of them, which is what a stutter is.
   */
  const stats = { fps: 0, frameMs: 0, updateMs: 0, drawMs: 0, p95Ms: 0, worstMs: 0, triangles: 0, calls: 0 };
  let frames = 0;
  let sampledAt = previous;
  let updateSum = 0;
  let drawSum = 0;
  const intervals = new Float32Array(FRAME_WINDOW);
  const sorted = new Float32Array(FRAME_WINDOW);
  let intervalCount = 0;
  let intervalAt = 0;
  /** The welcome card waits for the first arrival: the curtain up, or the first frame of a link. */
  let welcomePending = readSetting(WELCOME_KEY) !== '1' && navigator.webdriver !== true;

  /**
   * One subsystem's update, kept from taking the frame down with it.
   *
   * `requestAnimationFrame(frame)` is the first line of the loop, so a throw
   * never stopped the loop — it stopped everything after the throw, the draw
   * included, every frame: one bad town or tile and the picture froze with
   * sixty errors a second and nothing on the screen to say why. So each of
   * the world's own updates runs here. The first failure is logged with its
   * error; after that it is counted on `atlas.failures`, and the rest of the
   * world — the player, the camera, the draw — carries on around it.
   */
  const failures = new Map<string, number>();
  function guard(name: string, run: () => void): void {
    try {
      run();
    } catch (error) {
      const count = failures.get(name) ?? 0;
      if (count === 0) console.error(`atlas: ${name} failed, and the rest of the world carries on`, error);
      failures.set(name, count + 1);
    }
  }

  // The ear's slow answers, refreshed twice a second in the loop.
  let soundClock = 0;
  const soundPoint = new THREE.Vector3();
  const soundBiome: BiomeSample = { id: 'temperate', warmth: 0, moisture: 0, elevation: 0 };
  let soundCold = false;
  let soundSea = 0;
  let soundWild = 1;
  let soundWildTarget = 1;
  let mapWasOpen = false;

  function frame(now: number): void {
    requestAnimationFrame(frame);
    // **A tab left open on the pause card draws at about 30 frames a second**
    // after a minute with nobody at it: the GPU of a laptop left on a desk is
    // somebody's battery. Any input is back to full rate on the next frame.
    if (!input.looking && now - input.lastActive > IDLE_AFTER_MS && now - previous < IDLE_FRAME_MS) return;
    const frameStart = performance.now();
    renderer.info.reset();
    // Clamped at 0 as well as at a tenth of a second: the first timestamp
    // `requestAnimationFrame` hands over can be earlier than the
    // `performance.now()` taken just before it was asked for, and a negative
    // `dt` runs every chase in this loop backwards for a frame.
    const interval = Math.max(0, now - previous);
    const dt = Math.min(interval / 1000, 0.1);
    if (now > previous) {
      intervals[intervalAt] = now - previous;
      intervalAt = (intervalAt + 1) % FRAME_WINDOW;
      intervalCount = Math.min(FRAME_WINDOW, intervalCount + 1);
    }
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
    guard('city lights', () => cityLights.update(renderer));

    // The ear, after the sky: it wants the hour, the height over the ground and
    // what the foot is on. The slow questions — the biome, the coast, whether
    // this is a town — are asked twice a second; nothing in them moves faster.
    soundClock -= dt;
    if (soundClock <= 0) {
      soundClock = 0.5;
      const at = toLatLon(player.position);
      const inTown = settlements.madeHeightAt(player.position) > 0;
      const unit = soundPoint.copy(player.position).normalize();
      biomeAt(unit.x, unit.y, unit.z, at.lat, at.lon, ground - PLANET_RADIUS, soundBiome);
      soundCold = soundBiome.id === 'ice' || soundBiome.id === 'tundra';
      footing = inTown ? 'paving' : soundCold ? 'snow' : soundBiome.id === 'desert' || soundBiome.id === 'rock' ? 'dirt' : 'grass';
      soundSea = player.vehicle === 'boat' ? 1 : Math.max(0, 1 - shoreDistance(at.lat, at.lon) / SEA_EARSHOT);
      soundWildTarget = inTown ? 0 : 1;
    }
    soundWild += (soundWildTarget - soundWild) * Math.min(1, dt * 0.8);
    const speedNow = player.velocity;
    guard('audio', () => audio.update(dt, {
      mode: player.vehicle,
      speed: speedNow,
      throttle:
        player.vehicle === 'plane'
          ? (speedNow - PLANE_CRUISE_LOW * 0.55) / (PLANE_CRUISE_HIGH - PLANE_CRUISE_LOW * 0.55)
          : player.vehicle === 'boat'
            ? speedNow / BOAT_BOOST
            : 0,
      height: eyeOverGround,
      sea: soundSea,
      daylight: sky.state.daylight,
      wild: soundWild,
      cold: soundCold,
    }));
    if (map.open !== mapWasOpen) {
      mapWasOpen = map.open;
      audio.cue(map.open ? 'ui-open' : 'ui-close');
    }

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
    //
    // **Measured from the ground under the player, with a quarter of that
    // ground's own height added back**, not from the sea. From a camera 15
    // units over a 300-unit plateau the sea-level height opened the haze
    // sqrt(315 / 15), 4.6 times, wider than on the shore below it, and every
    // limit tuned for the shore's haze bound before the haze did: a town at
    // its pixel floor left in clear air. The quarter keeps a summit's view
    // wider than a valley's, as a height should, without the plateau's whole
    // elevation. Every streamer takes this number, so reach and haze stay one
    // question.
    const elevation = Math.max(0, ground - PLANET_RADIUS);
    const altitude = Math.max(1, eyeOverGround + HAZE_ELEVATION * elevation);
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
    // One allowance of building for the whole frame, served in the order the
    // streamers update: near work out of all of it, far work out of its share
    // (`beginFrameBuild` in `view.ts`).
    beginFrameBuild();
    // Before the render, not after: what comes into range this frame should be
    // drawn this frame, not next. It spends a few milliseconds at most — see
    // `BUILD_BUDGET_MS` — and then does nothing until you move again.
    guard('settlements', () => settlements.update(player.position, altitude, rig.camera));
    // After the settlements, because a landmark stands on its town's floor
    // where it has one: a floor raised this frame re-seats it this frame.
    guard('monuments', () => monuments.update(player.position, altitude, rig.camera));
    // After the settlements, because a road is laid over a town's paving where
    // the two meet and the later of two coplanar surfaces is not what decides
    // that — the lift is — but the build budget is served in order and the
    // town under your feet is worth more than the road under them, which is
    // worth more than the wood beside it.
    guard('roads', () => roads.update(player.position, altitude, rig.camera));
    // Last of the streamers, and the one that gives ground back first when a
    // frame is short: a town that has not arrived is a hole in the world, and
    // a tile of grass that has not arrived is grass that arrives next frame.
    guard('vegetation', () => vegetation.update(player.position, altitude, rig.camera));

    // After the roads, because a vehicle drives on one and the road under it
    // should have arrived first — and **on the world's clock rather than the
    // machine's**: every mover is a pure function of `sky.state.time`, so
    // `atlas.sky.setRate(600)` runs the traffic with the sun and `setTime`
    // scrubs it. Seconds, because that is what a speed is in.
    guard('life', () => life.update(player.position, altitude, rig.camera, sky.state.time.getTime() / 1000));
    // The people standing in the towns: their own clock rather than the sky's,
    // because breathing does not speed up when `setRate` runs the sun at 600x.
    townsfolkClock += dt;
    guard('townsfolk', () => townsfolk.update(player.position, dt, townsfolkClock, ++townsfolkFrame));

    // The weather turns with the same clock the sun does, so scrubbing the time
    // scrubs the sky: `atlas.sky.setRate(600)` runs a front past you in seconds.
    guard('clouds', () => clouds.update(sky.state.time, rig.camera.position, fog));

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
    guard('ocean', () => ocean.update(rig.camera.position, oceanLights));

    // Arriving is only an arrival on foot. `recordVisits` is cheap — a distance
    // test per monument — and it only ever fires once per landmark.
    if (player.vehicle === 'foot') {
      for (const place of monuments.recordVisits(player.position)) {
        // Every find gets the jingle, the destination included: the card is
        // what the navigation panel replaces, not the moment.
        audio.cue('landmark');
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
            note: place.note,
            found: foundCount(),
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
    hud.setVehicle(player.vehicle, player.landing, rig.firstPerson);
    hud.setPaused(!input.looking && !map.open && !settings.open, input.dragging);
    // The curtain from the menu's dive comes up once the ground under it has
    // had its build — the towns, the roads, and the wood and grass near you
    // with nothing pending — or after a second and a half whatever they say,
    // so a slow machine is never left looking at cream.
    if (curtain !== null) {
      const waited = now - loopStarted;
      const settled =
        settlements.stats.pending === 0 && roads.stats.pending === 0 && vegetation.stats.nearPending === 0;
      if ((waited > 450 && settled) || waited > 1500) {
        curtain.lift();
        curtain = null;
      }
    }
    // Once per device, after the first arrival: what there is to do here.
    // Remembered as soon as it is shown, so a reload does not show it twice.
    if (welcomePending && curtain === null) {
      welcomePending = false;
      writeSetting(WELCOME_KEY, '1');
      void hud.welcome(placements.length);
    }
    // Where you are, asked once and handed to both the disc and the chip.
    // Every frame, not throttled: `countryAtPoint` is 2 us and the nearest
    // place is a scan of 9,749 dot products, which is another 10 (10.4 us,
    // measured 2026-09-21). The disc frames itself on the first and names the
    // second; the chip's own debounce — a country has to hold before it counts
    // as an arrival — lives in the HUD.
    const standingIn = world.countryAtPoint(player.position);
    const nearbyPlace = places.nearest(player.position);
    guard('minimap', () =>
      minimap.update(player.position, player.forward, {
        country: standingIn,
        place: nearbyPlace,
      }),
    );
    guard('navigation', () => nav.update(dt, player, rig.camera));
    // Costs one branch while it is closed, which is nearly always.
    guard('map', () => map.update(player.position, player.forward));

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
    guard('borders', () =>
      borders.update(overlayFade, (2 * Math.tan(rig.camera.fov * 0.5 * DEG) * eyeOverGround) / innerHeight),
    );
    guard('names', () => names.update(overlayFade, rig.camera, standingIn));

    // The shadow map is redrawn every frame while anything the box holds is
    // moving — the player, who is also the box, a vehicle, a walker, an
    // animated herd, a townsman mid-gesture — and every 180 ms while nothing
    // is, which is a slow crawl of the sun nobody sees. It was 45 ms while the
    // player moved and 180 otherwise, the reference's numbers: at a run (90
    // units a second) the hero's shadow fell four units behind his feet before
    // it snapped back, and a car passing a player who stood still jumped at
    // 5.5 Hz. And **at once when a streamer has changed what stands in the
    // world**, which is one integer compare per group: a town that arrives this
    // frame would otherwise stand shadowless for up to 180 ms. A swap that
    // keeps the count waits for the cadence. Skipped entirely while the fades
    // have the shadow at zero — at night, and from the air — since the map is
    // then drawn into and mixed away in the same frame.
    const standing =
      monuments.group.children.length +
      settlements.group.children.length +
      vegetation.group.children.length +
      life.group.children.length;
    const moving =
      player.velocity > 0 ||
      life.stats.nearestMoving < SHADOW_COVER ||
      townsfolk.stats.nearestMoving < SHADOW_COVER;
    const cadence = moving ? 0 : SHADOW_STILL_MS;
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
    const drawEnd = performance.now();
    // In the same task as the draw, before the browser composites and clears
    // the drawing buffer: `toBlob` copies the canvas as it stands when it is
    // called, so no `preserveDrawingBuffer` is needed for it.
    if (photoWanted) {
      photoWanted = false;
      savePhoto(renderer.domElement);
    }
    updateSum += drawStart - frameStart;
    drawSum += drawEnd - drawStart;
    // The automatic detail knob: the interval and the work of this frame
    // (`sampleFrame` in `view.ts`). Not before the curtain is up.
    if (curtain === null) sampleFrame(interval, drawEnd - frameStart);

    frames++;
    if (now - sampledAt > 500) {
      stats.fps = Math.round((frames * 1000) / (now - sampledAt));
      stats.updateMs = Number((updateSum / frames).toFixed(2));
      stats.drawMs = Number((drawSum / frames).toFixed(2));
      stats.frameMs = Number(((updateSum + drawSum) / frames).toFixed(2));
      if (intervalCount > 0) {
        const span = sorted.subarray(0, intervalCount);
        span.set(intervals.subarray(0, intervalCount));
        span.sort();
        stats.p95Ms = Number(span[Math.min(intervalCount - 1, Math.floor(intervalCount * 0.95))]!.toFixed(1));
        stats.worstMs = Number(span[intervalCount - 1]!.toFixed(1));
      }
      // The last frame's, whole: both passes since the reset at the top.
      stats.triangles = renderer.info.render.triangles;
      stats.calls = renderer.info.render.calls;
      frames = 0;
      updateSum = 0;
      drawSum = 0;
      sampledAt = now;
      if (performanceOn) hud.showPerformance(stats);
    }

    // The clock is the world's own, not the machine's: `sky.setTime` and
    // `setRate` move it, so watching a dawn at ten minutes a second moves the
    // chip too. The zone is the nearest town's when it stands in this country;
    // over water there is no country and `clockAt` falls back to local mean
    // solar time from the longitude, which is the honest answer at sea and is
    // never absent.
    const here = toLatLon(player.position);
    hud.update(
      standingIn,
      nearbyPlace,
      clockAt(
        sky.state.time,
        standingIn > 0 ? world.countries[standingIn - 1]!.iso : '',
        here.lon,
        here.lat,
        nearbyPlace.place,
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
      // Which subsystems have thrown inside the loop, and how many times: see `guard`.
      failures,
      // `atlas.audio.stats`: whether the context is unlocked and running, how
      // many recordings arrived, and how many voices are sounding.
      audio,
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
       * The automatic detail knob (`sampleFrame` in `view.ts`): `atlas.autoDetail()`
       * reads its state — the last window's frame intervals, the display period,
       * the work, its vote and its last step — and `atlas.autoDetail(false)` turns
       * it off, `true` back on. A manual `atlas.detail(n)` or `[`/`]` turns it off.
       */
      autoDetail(on?: boolean) {
        if (on !== undefined) setAutoDetail(on);
        return { ...autoDetailState, on: autoDetail() };
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

start().catch(fail);
