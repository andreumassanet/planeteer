import * as THREE from 'three';
import { OutlineEffect } from './outline.ts';
import { createPost } from './post.ts';
import { loadLakes, loadWorld, toLatLon } from './geo.ts';
import { SCENERY_SCALE } from './stature.ts';
import { groundRadius, landFlagProxy, landFlags, PLANET_RADIUS, UNITS_PER_DEGREE, buildLand } from './globe.ts';
import { drawnRadius, landProbeOf } from './land-probe.ts';
import { createInput } from './input.ts';
import { createCameraRig } from './camera.ts';
import { createPlayer } from './player.ts';
import type { PlayerEvent } from './player.ts';
import { actionOf, inputBlocked, labelOf } from './controls.ts';
import { notice } from './notice.ts';
import type { NoticeAction } from './notice.ts';
import type { PlayMode, WorldSettings, WorldsModule } from './world-host.ts';
import { AVATAR_HEIGHT, dressHero, heroAppearance, prepareAvatar, wardrobeCast } from './avatar.ts';
import { decodeAppearance, encodeAppearance } from './appearance.ts';
import { LANDMARK_RANGE, createMonuments, loadPlacements } from './placement.ts';
import { loadPlaces, terrainSiteOf, prominenceRadius, setProminenceRadius } from './places.ts';
import { createBorders } from './borders.ts';
import { courseOf, coursePoint, createRoads, emptyCourse, loadRoads } from './roads.ts';

/** Points along each road the minimap traces it by: enough for a bend at a street's scale. */
const MINIMAP_ROAD_SAMPLES = 24;
/**
 * Milliseconds either map may spend working out the strips and the rockets'
 * pads it is about to show (`padsWithin`): one a paper or a frame, the rest
 * left for the next ask. A pad's first search averaged 4.8 ms in `pnpm
 * fleet` (2026-10-04), so one can run over; the streamer works out the ones
 * round the player whatever the maps ask.
 */
const MAP_PADS_MS = 1;
/** The pads one ask of either map found, before they are handed on. */
const mapPads: LaunchPad[] = [];
import { createRailNetwork, joinFields, loadRails, railFields } from './rails.ts';
// From the contract rather than from `./monuments/index.ts`, which is the whole
// registry: see `deferred` in `start()`. `index.ts` re-exports this, and taking
// it from there would drag all eighty-five model files into the first load for
// one function that has nothing to do with them.
import { createContext } from './monuments/contract.ts';
import { reliefAt, setDetailSites, setFlattenSites, shoreDistance } from './terrain.ts';
import { biomeAt, biomeSample } from './biome.ts';
import type { BiomeSample } from './biome.ts';
import { createAudio } from './audio.ts';
import { BENCH_REACH } from './bench.ts';
import type { Bench } from './bench.ts';
import type { Rocket, RocketSound } from './rocket.ts';
import type { LaunchPad } from './launch-pads.ts';
import type { HintSet } from './controls.ts';
import type { OtherVisitor } from './effects.ts';
import type { FeatureKind } from './countryside.ts';
import type { Soundscape, Surface } from './audio.ts';
import type { Music, MusicMoment } from './music.ts';
import { PLANE_CRUISE_HIGH, PLANE_CRUISE_LOW, isWater, topSpeedOf } from './vehicles.ts';
import { SHADOW_COVER, createSky } from './sun.ts';
import { loadStars } from './celestial.ts';
import type { NightSky } from './night-sky.ts';
import { createClouds } from './clouds.ts';
import { suspendCloudShade } from './cloud-shade.ts';
import { createWeatherView } from './weather-view.ts';
import { weatherAt, weatherSample } from './weather.ts';
import { createOcean, seaHull } from './ocean.ts';
import { shaftLight, shaftStrength } from './shafts.ts';
import { proxyOf, warmShaders } from './warm.ts';
import { FIRE_GLOW_REACH, FIRE_STRIDE, LAMPS_OFF_ABOVE, LAMP_FIELD, MAX_FIRE_GLOWS, NEAR_HEADLIGHTS, NEAR_LAMPS, createCityLights, fireGlows, floodTuning, lightBrightness, setFires, setHeadlights, setNearLamps, setSunDirection } from './lights.ts';
import { clockAt } from './timezone.ts';
import { FOG_COLOR } from './theme.ts';
import { DETAIL_MAX, DETAIL_MIN, autoDetail, autoDetailState, beginFrameBuild, clearHazeAt, detail, endFrameBuild, fogFar, sampleFrame, setAutoDetail, setDetail, skipFrame } from './view.ts';
import type { FlagLayer } from './land-flags.ts';
import type { Curtain, MenuBody, MenuBodyModule, MenuSpawn } from './menu.ts';
import type { SettingsOptions, TimeOfDay } from './settings.ts';
import type { IconName } from './ui.ts';
import type { Where } from './talk.ts';
import { latLonOf, latOf, lonOf, unitAt } from './sphere.ts';
import { ARRIVAL_CLEARANCE, clearOfPlans, plannedSite } from './landmark-ground.ts';
import { EMOTE_INTERVAL_MS, cleanHonk, cleanHonkOn } from '../server/src/limits.ts';
import type { Emote, Honk } from '../server/src/limits.ts';
import { createHornChorus, createHornKey } from './horn.ts';
import { HEADLIGHTS_OF, HORN_OF, LAMPS_LIKE } from './craft/contract.ts';
import type { CraftKind, CraftModel, Lamp } from './craft/contract.ts';
import { COCKPIT_NEAR } from './craft/body.ts';
import { SUB_DRY } from './craft/submarine.ts';

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
 * The lowest altitude the haze and the streamers are handed, in units.
 *
 * Twenty is where the walking camera used to stand over the ground — fifteen
 * over a pivot five up — and it is the height every reach and the haze on foot
 * were measured at. The camera stands at a person's eye now (2026-09-24,
 * `camera.ts`), three units up, and handing that on would have closed the haze
 * and every streamer's reach to a third, a town at the end of the street
 * dissolving into fog. What you can see from the ground is the same as it
 * was; only where you see it from has moved.
 */
const STREAM_FLOOR = 20;

/**
 * The render distance in words a player reads as a distance: where the haze
 * closes on foot in clear air at that setting (`clearHazeAt` in `view.ts`),
 * in metres at the scale everything made is built to (`SCENERY_SCALE`), which
 * is the scale a walker judges by. The map's kilometres are the planet's and
 * not this: the planet's distances are drawn at about 1:500 of a walker's.
 */
function renderDistanceWords(value: number): string {
  const metres = clearHazeAt(value, PLANET_RADIUS) / SCENERY_SCALE;
  return metres < 1000 ? `${Math.round(metres / 10) * 10} m` : `${(metres / 1000).toFixed(1)} km`;
}
/**
 * How near a moving car has to be, past its own half-length, for `E` with
 * nothing to take to say that somebody is driving it: about the reach `E`
 * asks of a seat.
 */
const TRAFFIC_BESIDE = AVATAR_HEIGHT * 0.8;
/**
 * How far another player's horn carries, in units: past this it is not heard.
 * Twice the reach of the traffic's, which is a car kept waiting in the next
 * street; a horn somebody means to be heard is louder.
 */
const HORN_REACH = 240;

/**
 * How high over the ground the player may be and still keep the drawn land
 * gathered round him (`land-probe.ts`). Under it a plane on its approach finds
 * the index ready for the landing; over it, at cruise, a gather every 400
 * units flown would be for nothing, and the ground is asked of the relief.
 */
const PROBE_CEILING = 1500;

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
    `planeteer stopped: ${message}. Reloading usually fixes it; if it keeps happening, the browser's console says more.`,
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
 * A phone, a tablet with nothing but a finger, or a screen too small for the
 * card language. The controls are a keyboard and a mouse, nothing in the world
 * answers a touch, and the HUD, the map and the cards are laid out for a
 * computer's screen — so the player is told so before the world downloads
 * (7.4 MB of data and models on disk, 2026-09-21) and seconds of building
 * freeze the phone, rather than after. `any-pointer: fine` rather than
 * `pointer: fine`, because a tablet with a mouse plugged in has a coarse
 * primary pointer and a fine one as well. Never to an automated browser,
 * whose window may be any size it was given.
 */
function smallOrTouch(): boolean {
  if (navigator.webdriver) return false;
  try {
    const touch = matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
    return touch || innerWidth < 760 || Math.min(innerWidth, innerHeight) < 480;
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
/** Whether the wakes, the smoke and the dust are drawn: `'0'` off, anything else on. */
const EFFECTS_KEY = 'atlas.effects.v1';
/** Whether a crash shakes the lens: `'1'` or `'0'`; unset follows the system's reduced-motion preference. */
const SHAKE_KEY = 'atlas.shake.v1';
/** `'0'` when the weather is off: clear skies. */
const WEATHER_KEY = 'atlas.weather.v1';
/** `{ volume, on }`: the music's, apart from the sound's. */
const MUSIC_KEY = 'atlas.music.v1';
/** `{ voices, chat }`: whether the townsfolk's lines are said aloud, and whether a chat line blips. */
const VOICES_KEY = 'atlas.voices.v1';
/**
 * How far off the water the sea is still heard, in degrees of `shoreDistance`:
 * 0.4 is 110 units, a few streets back from a harbour.
 */
const SEA_EARSHOT = 0.4;

/**
 * How near somebody has to stand to be talked to, centre to centre: about two
 * metres; how far you can walk off before they stop talking; and how near the
 * water, in degrees of `shoreDistance`, a town is to say it lives by it (about
 * thirteen real km).
 */
const TALK_REACH = AVATAR_HEIGHT * 1.3;
/**
 * How long after sitting down the others are told: the step onto the bench's
 * spot has to reach them first, or their copy of the body sees it moving and
 * stands it back up.
 */
const SIT_ANNOUNCE_MS = 700;
const TALK_LEAVE = AVATAR_HEIGHT * 4;
const TALK_COAST = 0.12;
/**
 * The vehicles a townsperson points out, and how near one has to stand to be
 * worth it: 800 units, about 630 m at `SCENERY_SCALE`, a few minutes' walk and
 * far enough to reach a big city's plane field from its middle.
 */
const TALK_CRAFT = ['plane', 'balloon', 'boat'] as const;

/** The HUD's icon for each kind of vehicle. */
const KIND_ICON: Readonly<Record<CraftKind, IconName>> = {
  car: 'car', van: 'car', bus: 'car', tractor: 'car', jeep: 'car', tuktuk: 'car',
  boat: 'boat', sailboat: 'boat', jetski: 'jetski',
  plane: 'plane', balloon: 'balloon', helicopter: 'heli',
  bicycle: 'bike', motorbike: 'moto', horse: 'horse', submarine: 'sub',
};
/** What each kind sounds like (`Soundscape.mode` in `audio.ts`): a tuk-tuk is a motorbike's engine in a box. */
const SOUND_OF: Readonly<Record<CraftKind, Soundscape['mode']>> = {
  car: 'car', van: 'car', jeep: 'car', bus: 'heavy', tractor: 'heavy', tuktuk: 'motorbike',
  bicycle: 'bicycle', motorbike: 'motorbike', horse: 'horse',
  boat: 'boat', jetski: 'jetski', sailboat: 'sail', submarine: 'boat',
  plane: 'plane', balloon: 'balloon', helicopter: 'helicopter',
};
/** And what the music takes it for: on the road, at sea, or in the sky. */
const MUSIC_OF: Readonly<Record<CraftKind, MusicMoment['mode']>> = {
  car: 'car', van: 'car', jeep: 'car', bus: 'car', tractor: 'car', tuktuk: 'car',
  bicycle: 'car', motorbike: 'car', horse: 'car',
  boat: 'boat', jetski: 'boat', sailboat: 'boat', submarine: 'boat',
  plane: 'plane', balloon: 'balloon', helicopter: 'plane',
};
const TALK_CRAFT_REACH = 800;
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
/**
 * Set for one load by Earth's *Solar system* button: the page comes back
 * straight to the planets, past the title, in the way of playing chosen
 * last. Session storage, so it is this tab's and is gone with it.
 */
const TO_SYSTEM_KEY = 'atlas.toSystem';
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
/**
 * How far from a player the map's *join* puts you: two bodies to their north,
 * near enough to see them and far enough not to stand in them.
 */
const JOIN_OFFSET = AVATAR_HEIGHT * 2;

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
      'planeteer needs WebGL 2',
      'This browser cannot draw it: WebGL 2 is off or unsupported here. A current Chrome, Edge, Firefox or Safari on a computer will run it, as will turning hardware acceleration back on.',
      [reload],
    );
    return;
  }
  if (smallOrTouch()) {
    await new Promise<void>((resolve) => {
      notice(
        'Made for a large screen',
        'planeteer is played on a computer, with a keyboard and a mouse. On a phone or a small window it is cramped and slow, and nothing here answers a touch yet.',
        [{ label: 'Continue anyway', primary: true, escape: true, run: resolve }],
      );
    });
  }

  // `?world=<id>` stands you on another world straight away — the Moon, Mars,
  // a giant's cloud deck — with none of Earth loaded: `src/worlds/` makes its
  // own renderer, and leaving reloads without the parameter. One `import()`,
  // so the worlds stay out of this file's graph (`scripts/check-worlds.ts`).
  const otherWorld = new URLSearchParams(location.search).get('world');
  if (otherWorld !== null && otherWorld !== '' && otherWorld !== 'earth') {
    try {
      const { standalone } = await import('./worlds/index.ts');
      await standalone(otherWorld, dismissLoading);
    } catch (error) {
      fail(error);
    }
    return;
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
  // The railway, which nothing waits on: a world whose `rails.bin` did not
  // come, or came from another bake, has no trains and is otherwise whole.
  const railsLoad = loadRails().catch((error: unknown) => {
    console.warn('the railway did not load', error);
    return null;
  });
  // And the stars, for the same reason and on the same terms: a world whose
  // `stars.bin` did not come has nights with no stars in them and is
  // otherwise whole. 43 KB, asked for beside the railway and wanted only at
  // 'opening the sky', so it is off the chain everything else waits on.
  const starsLoad = loadStars().catch((error: unknown) => {
    console.warn('the stars did not load', error);
    return null;
  });
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
  setDetailSites(places.all.map(terrainSiteOf));
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
  // deferred 167 KB lands inside the build with time to spare.
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
    /** The blades under your feet, drawn round the camera from what the vegetation says grows there. */
    grass: import('./grass.ts'),
    /** The wakes, the smoke, the dust and a crash's debris; made with the streamers. */
    effects: import('./effects.ts'),
    /** Fireflies, butterflies, gulls, a fish, leaves: the small life round the camera. */
    ambient: import('./ambient.ts'),
    /** The sea floor near the player, the clear water over it, and what swims in it. */
    sea: import('./seabed.ts'),
    seaLife: import('./sea-life.ts'),
    /** The book of stamps and the card that shows it. */
    passport: import('./passport.ts'),
    passportCard: import('./passport-card.ts'),
    /** What turns, shines and smokes in the country the vegetation's tiles plan. */
    countryMotion: import('./countryside-motion.ts'),
    life: import('./life.ts'),
    /** The people: the cast dressed by region, standing in towns and walking verges. */
    folk: import('./folk.ts'),
    /** What they say when spoken to; the words themselves arrive on the first conversation. */
    talk: import('./talk.ts'),
    chat: import('./chat.ts'),
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
    /** Who is playing, held on `Tab`. */
    playerList: import('./player-list.ts'),
    /** The country names over the land, which arrive with the flag under them. */
    names: import('./names.ts'),
    /** The other players, if a relay is configured; see `server/`. */
    peers: import('./peers.ts'),
    /**
     * The stars and the planets at night (`night-sky.ts`), with the planets'
     * astronomy (`system/orbits.ts`), which the menu shares. Attached to the
     * sky the moment it and `stars.bin` have both come; see `nightSky` below.
     */
    nightSky: import('./night-sky.ts'),
    /** The traveller's card, which the menu opens before anything else is built. */
    traveller: import('./traveller.ts'),
    /** What the menu sounds like: its ticks, its dives and the hum of space. */
    menuSound: import('./menu-sound.ts'),
    /** The title screen in front of the menu: online or offline, and the traveller, large. */
    title: import('./title.ts'),
    /**
     * The vehicles you can take: their models, where they stand, and the
     * relay's half of who has moved which. Built once the player is.
     */
    craft: import('./craft/index.ts'),
    /** What flies that nobody flies: airliners, circuits, helicopters, balloons, an airship. */
    airTraffic: import('./air-traffic.ts'),
    /** The railway drawn and run: the track near the eye, the stations, the trains. */
    railway: import('./railway.ts'),
    passingSound: import('./passing-sound.ts'),
    fleet: import('./fleet.ts'),
    fleetSync: import('./fleet-sync.ts'),
    /** The rockets on their pads beside half the airstrips, and `rocket.ts` with them. */
    launchPads: import('./launch-pads.ts'),
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
  // The frame after the scene: bloom, the tone map and the grade (`post.ts`).
  // The scene goes into it without ink: the painted look is soft light and
  // atmosphere, and a black line round everything fights both. The ink's two
  // passes are still one switch away (`atlas.ink(true)`).
  const post = createPost(renderer);
  let inked = false;
  const setInk = (on: boolean): void => {
    inked = on;
    post.draw = on ? (target, camera) => outline.render(target, camera) : (target, camera) => renderer.render(target, camera);
  };
  setInk(false);

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
  const wantedTime = query.get('time');
  // A `?time=` that is not a date is refused by the sky, which keeps the real
  // clock — and then the clock is still live, and the settings say so.
  const timeTaken = wantedTime !== null && wantedTime !== '' && sky.setTime(wantedTime);
  if (wantedTime && !timeTaken) console.warn(`atlas: ?time=${wantedTime} is not a date; the sky keeps the real clock`);
  /** Whether the sun follows the real clock: the settings' time-of-day row. */
  let timeLive = !timeTaken;
  let timeFast = false;

  // **The night sky**, attached whenever its code and its catalogue have both
  // come, and waited for by nothing: the menu opens on whatever sky there is,
  // and the stars join it — in practice before it opens, since both were asked
  // for seconds earlier. Its program is compiled before the points join the
  // scene, so neither the menu's first frame nor the first dusk is a link.
  // `sky.attach` is what drives it from then on: every `sky.update`, in the
  // menu and in the world alike.
  let nightSky: NightSky | null = null;
  /** Whether the menu has the sky: the stars are calmer and the planets are the orrery's. */
  let menuSky = true;
  const setMenuSky = (on: boolean): void => {
    menuSky = on;
    if (nightSky !== null) nightSky.menu = on;
  };
  Promise.all([deferred.nightSky, starsLoad])
    .then(async ([{ createNightSky }, catalogue]) => {
      if (catalogue === null) return;
      const night = createNightSky(catalogue, sky);
      night.menu = menuSky;
      await renderer.compileAsync(night.points, new THREE.PerspectiveCamera(), scene);
      scene.add(night.points);
      sky.attach(night.update);
      nightSky = night;
    })
    .catch((error: unknown) => console.warn('the night sky did not start', error));

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
  /**
   * The ground under a foot, a wheel and the lens: the drawn land round the
   * player, the relief past it (`drawnRadius`). One probe for the mesh, which
   * the grass, the fleet and the foot all read; the loop keeps it gathered
   * round the player while he is near the ground.
   */
  const landProbe = landProbeOf(land);
  const groundAt = (point: THREE.Vector3): number => drawnRadius(world, landProbe, point);

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
  // And the weather the deck carries: the rain, the snow and the lightning
  // round the camera, the wet and the white on the ground. A pure function of
  // place and time (`weather.ts`), so it needs nothing from the relay.
  const weather = createWeatherView(sky, clouds);
  scene.add(weather.group);

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
  // The other players. `VITE_PEERS_URL` is the relay's address, set in the
  // host's environment for a build; in development it is the relay's own
  // `wrangler dev` (`pnpm peers`), and with neither the world is single-player.
  const peersUrl: string =
    import.meta.env.VITE_PEERS_URL ?? (import.meta.env.DEV ? 'ws://localhost:8787/ws' : '');
  const peersModule = await deferred.peers;
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
  const voices = { voices: true, chat: true };
  try {
    const saved = JSON.parse(readSetting(VOICES_KEY) ?? 'null') as { voices?: unknown; chat?: unknown } | null;
    if (saved !== null && typeof saved.voices === 'boolean') voices.voices = saved.voices;
    if (saved !== null && typeof saved.chat === 'boolean') voices.chat = saved.chat;
  } catch {
    // As the sound's.
  }
  const saveVoices = (): void => writeSetting(VOICES_KEY, JSON.stringify(voices));
  // The music: `music.ts` and its synthesis are fetched on the gesture that
  // opens the sound, and only if the music is on, so none of it is in the
  // first load. Its settings live here until it arrives.
  const musicSettings = { volume: 0.6, on: true };
  try {
    const saved = JSON.parse(readSetting(MUSIC_KEY) ?? 'null') as { volume?: unknown; on?: unknown } | null;
    if (saved !== null && typeof saved.volume === 'number') musicSettings.volume = Math.min(1, Math.max(0, saved.volume));
    if (saved !== null && typeof saved.on === 'boolean') musicSettings.on = saved.on;
  } catch {
    // A mangled setting is the default one.
  }
  const saveMusic = (): void => writeSetting(MUSIC_KEY, JSON.stringify(musicSettings));
  let music: Music | null = null;
  let musicLoading = false;
  /** A style asked for from the console before the music arrived. */
  let musicAsked: string | null = null;
  const musicMoment: MusicMoment = {
    mode: 'foot', height: 0, iso: '', continent: '', lat: 0, lon: 0, daylight: 1, town: false, place: 0, hour: 12,
  };
  function loadMusic(): void {
    const out = audio.output;
    if (music !== null || musicLoading || !musicSettings.on || out === null) return;
    musicLoading = true;
    import('./music.ts')
      .then(({ createMusic }) => {
        music = createMusic(out.context, out.node, musicSettings);
        if (musicAsked !== null) music.play(musicAsked);
      })
      .catch(() => {
        // No music is silence, never an error on the player's screen; the next gesture tries again.
        musicLoading = false;
      });
  }
  weather.onThunder = (delay, loudness) => audio.thunder(delay, loudness);
  weather.enabled = readSetting(WEATHER_KEY) !== '0';
  const unlockAudio = (): void => {
    audio.unlock();
    loadMusic();
  };
  addEventListener('pointerdown', unlockAudio, { capture: true });
  addEventListener('keydown', unlockAudio, { capture: true });
  // The sound's and the music's rows, which both settings cards show: the
  // title screen's, before the world is built, and the world's own.
  const soundRows: NonNullable<SettingsOptions['sound']> = {
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
    voices: {
      get: () => voices.voices,
      set: (on) => {
        voices.voices = on;
        saveVoices();
        return on;
      },
    },
    chat: {
      get: () => voices.chat,
      set: (on) => {
        voices.chat = on;
        saveVoices();
        return on;
      },
    },
  };
  const musicRows: NonNullable<SettingsOptions['music']> = {
    volume: {
      get: () => musicSettings.volume,
      set: (value) => {
        musicSettings.volume = Math.min(1, Math.max(0, value));
        if (music !== null) music.volume = musicSettings.volume;
        saveMusic();
        return musicSettings.volume;
      },
      min: 0.05,
      max: 1,
    },
    on: {
      get: () => musicSettings.on,
      set: (on) => {
        musicSettings.on = on;
        if (music !== null) music.on = on;
        else loadMusic();
        saveMusic();
        return on;
      },
    },
  };
  /** The connection, once there is one: the card below is made long before it. */
  let peersLink: import('./peers.ts').Peers | null = null;
  // **The traveller's creator**, opened from the title, the planet menu and
  // Settings, on the hero's stage that the title shares. Every change dresses
  // the hero at once (`dressHero`, which keeps it on this device) and goes to
  // the other players as a code beside the name. The name, on the plate over
  // the hero's head, is the relay's rename, or, before there is a connection,
  // what the first one will send.
  const { createTraveller, createHeroStage } = await deferred.traveller;
  const travellerName = {
    get: (): string => peersLink?.name ?? peersModule.storedName(),
    set: (name: string): string => (peersLink === null ? peersModule.storeName(name) : peersLink.rename(name)),
  };
  const heroStage = createHeroStage({ appearance: heroAppearance, cast: wardrobeCast, name: travellerName });
  document.body.appendChild(heroStage.root);
  /** The title screen, made below unless a link skips every menu. */
  let title: import('./title.ts').Title | null = null;
  const traveller = createTraveller({
    appearance: {
      get: heroAppearance,
      set: (appearance) => {
        dressHero(appearance).catch((error: unknown) => console.warn('atlas: the new clothes did not arrive', error));
        peersLink?.setLook(encodeAppearance(appearance));
      },
    },
    stage: heroStage,
    lockTarget: renderer.domElement,
    // The title, when it is up, steps aside for the creator and takes the stage back after.
    onOpen: () => {
      audio.cue('ui-open');
      title?.aside(true);
    },
    onClose: () => {
      audio.cue('ui-close');
      title?.aside(false);
    },
  });
  document.body.appendChild(traveller.root);
  const { createMenu, earthBody } = await deferred.menu;
  const { createMenuSound } = await deferred.menuSound;
  const { createTitle, storedPlayMode } = await deferred.title;
  // Through the effects' master and, for the hum, the music's own switch
  // and volume, so both settings hold the menu as they hold the world.
  const menuSound = createMenuSound(audio, musicSettings);
  const menu = createMenu({
    // The aliases are the famous names the bake folded into a neighbour —
    // Kobe into Osaka, Manila into Quezon City — so the search answers them.
    bodies: [earthBody(world, places.all, places.aliases())],
    scene,
    renderer,
    // `outline.render`, not `renderer.render`: a frame here is two passes.
    draw: (target, camera) => post.render(target, camera),
    // The Resolution setting's ratio, so a resize in the menu keeps it.
    pixelRatio: () => pixelRatioFor(resolution),
    fallback: { lat: START.lat, lon: START.lon, name: 'Palma' },
    time: () => sky.state.time,
    sunDirection: () => sky.state.sun,
    sound: menuSound,
    // Every other walkable body's globe, made the first time its *Explore* is
    // pressed: its nations, their frontiers and colours, its settlements.
    loadBody: (id, centre, drawnRadius) => loadMenuBody(id, centre, drawnRadius),
    // Every other body's *Explore*, and a settlement chosen on its globe: a
    // world of its own, from `src/worlds/`.
    exploreBody: (id, name, spawn) => exploreWorld(id, name, spawn),
    // `Esc` over the solar system, or its *Main menu*: back to the title screen.
    onLeave: () => {
      if (title === null || title.open) return;
      menu.hold(true);
      title.show();
    },
  });
  document.body.appendChild(menu.root);

  // `?at=lat,lon` skips every menu and lands there. A latitude past a pole is
  // a point on the far side of it, not a typo worth landing on: such a link
  // gets the menus.
  const at = query.get('at')?.split(',').map(Number);
  const skipMenu = at !== undefined && at.length === 2 && at.every(Number.isFinite) && Math.abs(at[0]!) <= 90 && Math.abs(at[1]!) <= 360;
  /**
   * How a link that skips the title plays: the way chosen last time on this
   * device, online if never — and offline in an automated browser, which has
   * no business on the relay.
   */
  const linkedMode: PlayMode = navigator.webdriver ? 'offline' : (storedPlayMode() ?? 'online');
  let toSystem = false;
  try {
    toSystem = sessionStorage.getItem(TO_SYSTEM_KEY) === '1';
    sessionStorage.removeItem(TO_SYSTEM_KEY);
  } catch {
    // No storage, no shortcut: the title as ever.
  }

  // **The settings, before the world.** The world's own card is made with the
  // player, so the title screen has one of its own over the same values: the
  // ones the world reads when it is built are kept in storage, the rest are
  // the live objects. It never answers the settings key; the world's does.
  const { createSettings } = await deferred.settings;
  const storedToggle = (key: string, fallback: boolean): { get(): boolean; set(on: boolean): boolean } => ({
    get: () => (fallback ? readSetting(key) !== '0' : readSetting(key) === '1'),
    set: (on) => {
      writeSetting(key, on ? '1' : '0');
      return on;
    },
  });
  /**
   * The rows every card shares with the walkable worlds' own (`WorldSettings`
   * in `world-host.ts`): what they turn is kept in storage or is the live
   * object, so a world's card and this one move the same values.
   */
  const sharedSettings: WorldSettings = {
    sensitivity: {
      get: () => Number(readSetting(SENSITIVITY_KEY) ?? '1') || 1,
      set: (value) => {
        writeSetting(SENSITIVITY_KEY, value.toFixed(3));
        return value;
      },
      min: 0.3,
      max: 3,
    },
    performance: storedToggle(PERFORMANCE_KEY, false),
    hints: storedToggle(HINTS_KEY, true),
    resolution: {
      get: () => resolution,
      set: (value) => {
        resolution = RESOLUTIONS.find(([option]) => option === value)?.[0] ?? 'auto';
        writeSetting(RESOLUTION_KEY, resolution);
        // The menu sizes the renderer, and asks for the ratio on a resize.
        dispatchEvent(new Event('resize'));
        return resolution;
      },
      options: RESOLUTIONS,
    },
    sound: soundRows,
    music: musicRows,
  };
  const frontSettings = createSettings({
    ...sharedSettings,
    key: false,
    detail: { get: detail, set: setDetail, min: DETAIL_MIN, max: DETAIL_MAX },
    detailDistance: renderDistanceWords,
    autoDetail: { get: autoDetail, set: (on) => setAutoDetail(on) },
    flags: storedToggle(OVERLAY_KEY, true),
    weather: {
      get: () => weather.enabled,
      set: (on) => {
        weather.enabled = on;
        writeSetting(WEATHER_KEY, on ? '1' : '0');
        return on;
      },
    },
    lockTarget: null,
    onOpen: () => audio.cue('ui-open'),
    onClose: () => audio.cue('ui-close'),
  });
  // Over the title (`z-index` 10), which the world's card never has to be.
  frontSettings.root.style.zIndex = '12';
  document.body.appendChild(frontSettings.root);

  // **The title screen**: the game's name, how to play — online or offline —
  // and the traveller, large, in front of the solar system. The menu behind
  // waits (`hold`) until a way to play is chosen. Made too when Earth's
  // *Solar system* comes straight back to the planets, and kept hidden, so
  // `Esc` there still reaches it to change the way to play or the look.
  if (!skipMenu) {
    title = createTitle({
      stage: heroStage,
      online: peersUrl !== '',
      customise: () => traveller.show(),
      settings: () => frontSettings.show(),
      covered: () => traveller.open || frontSettings.open,
      sound: { hover: () => menuSound.cue('hover'), select: () => menuSound.cue('select') },
      onChoose: () => menu.hold(false),
    });
    if (!toSystem) {
      menu.hold(true);
      title.show();
    }
  }
  // Every other world's globe made while the title is up, so picking one
  // on the menu never waits for it.
  if (!skipMenu) menu.prepare();

  /**
   * A walkable body's `MenuBody` from `src/system/menu-body.ts`, which reads
   * its geography (`system/geography.ts`) — imported only when asked, so none
   * of `src/system/` is in Earth's first load. Its nations' banners are
   * registered with the flags as it comes, so the menu's cards can draw them.
   * `null` where there is no such module or no such body, and *Explore* then
   * goes straight to the world.
   */
  async function loadMenuBody(id: string, centre: THREE.Vector3, drawnRadius: number): Promise<MenuBody | null> {
    const load = import.meta.glob<MenuBodyModule>('./system/menu-body.ts')['./system/menu-body.ts'];
    if (load === undefined) return null;
    const module = await load();
    module.installBanners();
    return module.menuWorldOf(id, centre, drawnRadius);
  }

  /**
   * *Explore* on any body but Earth and the Sun: `src/worlds/index.ts`'s
   * `enterWorld` (`world-host.ts` is the contract), imported only when asked,
   * with the menu suspended under it until the world hands the screen back.
   * The glob is empty while that module does not exist, which is the notice.
   * `spawn` is the settlement chosen on the body's globe, or the place
   * remembered from the last visit, and the world lands there.
   */
  async function exploreWorld(id: string, name: string, spawn?: MenuSpawn): Promise<void> {
    menu.suspend(true);
    let left = false;
    const back = (to?: 'system'): void => {
      if (left) return;
      left = true;
      // The world's engine and wind let go: the menu's is a quiet ear.
      audio.update(0, { mode: 'menu', speed: 0, throttle: 0, height: 0, sea: 0, daylight: 1, wild: 0, cold: true });
      menu.suspend(false);
      if (to === 'system') menu.toSystem();
    };
    try {
      const load = import.meta.glob<WorldsModule>('./worlds/index.ts')['./worlds/index.ts'];
      if (load === undefined) throw new Error('there is no src/worlds/index.ts');
      const worlds = await load();
      if (typeof worlds.enterWorld !== 'function') throw new Error('src/worlds/index.ts has no enterWorld');
      // The menu's frame hands the shade back on the way out (`clouds.update`).
      suspendCloudShade();
      await worlds.enterWorld(id, {
        renderer,
        draw: (target, camera) => post.render(target, camera),
        pixelRatio: () => pixelRatioFor(resolution),
        sound: () => audio.output,
        appearance: heroAppearance,
        cast: wardrobeCast,
        name: () => peersModule.storedName(),
        mode: title?.mode ?? linkedMode,
        time: () => sky.state.time,
        exit: back,
        arrival: spawn === undefined
          ? null
          : { settlement: spawn.site ?? null, lat: spawn.lat, lon: spawn.lon, name: spawn.name, region: spawn.region },
        peersUrl,
        settings: sharedSettings,
        cue: (cue) => audio.cue(cue),
        traveller,
        step: (weight) => audio.step('dirt', weight),
        countries: world.countries,
        soundscape: (dt, scape) => audio.update(dt, scape),
        music: (moment) => {
          if (music === null) {
            loadMusic();
            return;
          }
          if (moment !== null) music.observe(moment);
          music.update();
        },
      });
    } catch (error) {
      console.warn(`atlas: ${name} cannot be explored yet`, error);
      back();
      notice('Coming soon', `${name} cannot be walked on yet. Earth can, and the rest of the solar system is on its way.`, [
        { label: 'Back to the planets', primary: true, escape: true, run: () => {} },
      ]);
    }
  }

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
  /**
   * The flag attribute, which is 11 MB and is therefore not built until the
   * first time a fade asks for it — the menu's country stage or the climb.
   * `land-flags.ts` and the 2,091 lines of flag specs behind it arrive with it,
   * through the dynamic `import()` in `globe.ts`.
   */
  let flagLayer: FlagLayer | null = null;
  let flagAsked = false;
  /** What `atlas.flags(0.4)` set before the layer existed, if anything. */
  let flagCeiling: number | null = null;
  function askFlags(): void {
    if (flagAsked) return;
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
    // No weather over the menu's globe: its sky is the whole planet's. The
    // deck's shade stays where the deck does, and goes with the veil below.
    sky.weather.overcast = sky.weather.sunCut = sky.weather.flash = sky.weather.mist = 0;
    clouds.setGrey(0);
    // Nor light shafts: the orrery's space is depth 1 everywhere, which the
    // shafts' mask would read as open sky round the sun (`shafts.ts`).
    post.shafts.strength = 0;
    // **The weather is there from space and gone while you choose.** The
    // country and town stages are a map you click on, and the deck over it is
    // in the way: a solid cell of stratus over eastern Spain hid which coast
    // Valencia was on, and even veiled it was in the way. From the system and a
    // planet's card it stays, because there it is most of what makes Earth look
    // like Earth. It fades rather than switching, on the clock of the frames
    // the menu draws.
    const now = performance.now();
    const step = Math.min(0.1, (now - veiledAt) / 1000);
    veiledAt = now;
    const wanted = menu.stage === 'region' || menu.stage === 'site' ? 0 : 1;
    veil += (wanted - veil) * (1 - Math.exp(-step / VEIL_LAG));
    if (Math.abs(wanted - veil) < 0.01) veil = wanted;
    clouds.setVeil(veil);
    // Over another body's globe Earth's sky is not the sky: the camera is
    // round the Moon or Mars, and Earth is a planet in the frame like any other.
    const inside = distance < PLANET_RADIUS * DOME_EXIT && menu.body === 'earth';
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
  report = (fraction, label) => {
    menu.progress(fraction, label);
    title?.progress(fraction, label);
  };

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
    // The drawn land, which a landmark stands on under its plan.
    land,
  );
  scene.add(monuments.group);
  // Their red lights after dark, one draw for all of them (`landmark-lights.ts`).
  scene.add(monuments.night.beacons);
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
    // The drawn land, which the trees round a town's edge stand on.
    land,
  });
  scene.add(settlements.group);
  // Every place on the planet as one buffer of points, lit where the sun is
  // not. It reads the settlements' own anchors rather than asking the terrain
  // again — a point-in-polygon query a place, which the streamer has already
  // paid for — and it exists because the settlement mesh cannot do this job: from the
  // plane's ceiling `settlements.ts` holds no towns at all, which is exactly
  // the altitude a night hemisphere is worth looking at from.
  const cityLights = createCityLights(places.all, settlements.anchors);
  const nearLamps = new Float32Array(NEAR_LAMPS * 4);
  // Headlights, seven floats each (see `setHeadlights`), and the scratch that
  // fills them without allocating.
  const headlights = new Float32Array(NEAR_HEADLIGHTS * 7);
  let headlightCount = 0;
  const headAt = new THREE.Vector3();
  const headDown = new THREE.Vector3();
  /**
   * A vehicle whose headlamps may be lit this frame: where its model's origin
   * is and its model's +X, +Y and +Z, its lamps (`CraftModel.lamps`, the
   * kind's count of them, `HEADLIGHTS_OF`), how they are scaled onto it —
   * `across` in X, `along` up and ahead, 1 for a craft and the traffic's own
   * size over the craft's for a vehicle of the traffic — how bright, and how
   * far it is from the camera. Kept in a pool and reused, frame after frame.
   */
  interface LampSource {
    origin: THREE.Vector3;
    side: THREE.Vector3;
    up: THREE.Vector3;
    ahead: THREE.Vector3;
    lamps: readonly Lamp[];
    across: number;
    along: number;
    strength: number;
    distance: number;
  }
  const lampPool: LampSource[] = Array.from({ length: 64 }, () => ({
    origin: new THREE.Vector3(),
    side: new THREE.Vector3(),
    up: new THREE.Vector3(),
    ahead: new THREE.Vector3(),
    lamps: [],
    across: 1,
    along: 1,
    strength: 0,
    distance: 0,
  }));
  /** The pool's sources in use this frame, the player's own first and then by distance. */
  const lampSources: LampSource[] = [];
  const lampSource = (distance: number): LampSource | null => {
    if (distance > LAMP_FIELD || lampSources.length >= lampPool.length) return null;
    const source = lampPool[lampSources.length]!;
    source.distance = distance;
    lampSources.push(source);
    return source;
  };
  /** A source's axes off a posed object's world matrix, its scale taken out. */
  const lampFrame = (source: LampSource, matrix: THREE.Matrix4): void => {
    const e = matrix.elements;
    source.origin.setFromMatrixPosition(matrix);
    source.side.set(e[0]!, e[1]!, e[2]!).normalize();
    source.up.set(e[4]!, e[5]!, e[6]!).normalize();
    source.ahead.set(e[8]!, e[9]!, e[10]!).normalize();
  };
  const byLampDistance = (a: LampSource, b: LampSource): number => a.distance - b.distance;
  const pushHeadlight = (at: THREE.Vector3, dir: THREE.Vector3, strength: number): void => {
    if (headlightCount >= NEAR_HEADLIGHTS) return;
    const o = headlightCount * 7;
    headlights[o] = at.x; headlights[o + 1] = at.y; headlights[o + 2] = at.z;
    headlights[o + 3] = dir.x; headlights[o + 4] = dir.y; headlights[o + 5] = dir.z;
    headlights[o + 6] = strength;
    headlightCount++;
  };
  /** Every lamp of one vehicle, on the model where it has them, or none if they do not all fit. */
  const pushLamps = (source: LampSource): void => {
    if (headlightCount + source.lamps.length > NEAR_HEADLIGHTS) return;
    headDown.copy(source.ahead).addScaledVector(source.up, -0.12).normalize();
    for (const [x, y, z] of source.lamps) {
      headAt.copy(source.origin)
        .addScaledVector(source.side, x * source.across)
        .addScaledVector(source.up, y * source.along)
        .addScaledVector(source.ahead, z * source.along);
      pushHeadlight(headAt, headDown, source.strength);
    }
  };
  /** How bright a model's headlamps are lit, or 0 where it has none. */
  const headlampsOf = (model: CraftModel): number =>
    model.lamps === undefined || model.lamps.length === 0 ? 0 : HEADLIGHTS_OF[model.kind].strength;
  /**
   * The traffic's vehicles, with the lamps of the craft that stands in for
   * each (`LAMPS_LIKE`) scaled onto its own box: across by its width, up and
   * ahead by its length, from the bottom of its model. A little dimmer than a
   * player's, as they always were.
   */
  /**
   * Whether a moving road vehicle is right beside the player: within its own
   * half-length and `TRAFFIC_BESIDE` of him, which is how near `E` is asked
   * of a seat. Every one of them has somebody at the wheel (`glazeTraffic`),
   * and none can be taken.
   */
  let besideTraffic = false;
  const visitBeside = (mesh: THREE.Object3D, halfLength: number): void => {
    if (!besideTraffic && mesh.position.distanceTo(player.position) < halfLength + TRAFFIC_BESIDE) besideTraffic = true;
  };
  function trafficBeside(): boolean {
    besideTraffic = false;
    life.eachRoadVehicle(visitBeside);
    return besideTraffic;
  }

  const visitTraffic = (mesh: THREE.Object3D, halfLength: number, halfWidth: number, vehicle: string, bottom: number): void => {
    const like = LAMPS_LIKE[vehicle];
    const model = like === undefined ? undefined : craftModels.get(like);
    if (model === undefined) return;
    const strength = headlampsOf(model);
    if (strength === 0) return;
    const source = lampSource(mesh.position.distanceTo(rig.camera.position));
    if (source === null) return;
    lampFrame(source, mesh.matrixWorld);
    source.origin.addScaledVector(source.up, bottom);
    source.lamps = model.lamps!;
    source.across = halfWidth / (model.size[1] / 2);
    source.along = halfLength / (model.size[0] / 2);
    source.strength = strength * 0.8;
  };
  /** The vehicles other players drive, lit as their drivers see them lit. */
  const visitDriven = (group: THREE.Object3D, model: CraftModel): void => {
    const strength = headlampsOf(model);
    if (strength === 0) return;
    group.updateWorldMatrix(true, false);
    headAt.setFromMatrixPosition(group.matrixWorld);
    const source = lampSource(headAt.distanceTo(rig.camera.position));
    if (source === null) return;
    lampFrame(source, group.matrixWorld);
    source.lamps = model.lamps!;
    source.across = 1;
    source.along = 1;
    source.strength = strength;
  };
  // The campfires near the camera, as `setFires` reads them, and the glow on their flames.
  const fires = new Float32Array(MAX_FIRE_GLOWS * FIRE_STRIDE);
  scene.add(fireGlows);
  scene.add(cityLights.points);
  if (settlements.broken.length > 0) console.warn('scenery parts that broke the contract:', settlements.broken);
  if (settlements.missing.length > 0) console.warn('region tables name parts that do not exist:', settlements.missing);

  await stage('laying the roads');
  // Nothing is built here either — the whole network at its full detail is more
  // geometry than the land mesh — so this costs one material and a bucket per
  // four degrees of the planet.
  const roads = createRoads(world, places.all, baked);
  // A road's bank is stood on where it comes out of the land that is drawn.
  roads.setGround(groundAt);
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
  const { createFolk, createTownsfolk, isWoman, isYoung, PERSON_RADIUS } = await deferred.folk;
  const folk = createFolk(ctx);
  const townsfolk = createTownsfolk(folk, settlements);
  scene.add(townsfolk.group);
  const { createTalk } = await deferred.talk;
  // Said aloud while the voices are on and the sound is open; `audio` and the
  // setting are declared below, and asked only when a line is shown.
  const talk = createTalk({
    voice: () => (voices.voices && audio.output !== null && audio.bus !== null ? { context: audio.output.context, node: audio.bus } : null),
  });
  // Where the vehicles you can take stand, which is a function of the world
  // alone and costs nothing until asked: built this early so the herds here
  // and the wood below keep off a plane's airstrip and a balloon's field. The
  // fleet itself, which needs the player, takes the same index further down.
  const { createSiteIndex, fleetMaterials } = await deferred.fleet;
  const fleetSites = createSiteIndex({ world, places: places.all, roads: baked.roads, monuments: placements });
  // The railway's lines, baked against these places and these roads or not
  // at all; and the ground they take, which everything that keeps off a
  // field keeps off too: the wood, the countryside's plans and the herds.
  const railData = await railsLoad;
  const railNetwork =
    railData !== null && railData.places === places.all.length && railData.roads === baked.roads.length
      ? createRailNetwork(railData.lines, places.all, world)
      : null;
  if (railData !== null && railNetwork === null) console.warn('rails.bin was baked against other places or roads: run `pnpm rails`');
  const railGround = railNetwork === null ? null : railFields(railNetwork);
  // The rockets' pads beside half the airstrips, which keep off the railway
  // (it was baked without them) and which everything else keeps off in turn.
  const { createLaunchPads, createPadIndex } = await deferred.launchPads;
  const padIndex = createPadIndex({ world, sites: fleetSites, rails: railGround });
  const takenGround = joinFields(joinFields(fleetSites, padIndex), railGround);
  /** What both maps ask the pads by: `MAP_PADS_MS` of working out an ask, the rest left for the next. */
  const padsForMaps = (direction: THREE.Vector3, radius: number, out: { push(...pads: LaunchPad[]): unknown }): boolean => {
    const until = performance.now() + MAP_PADS_MS;
    mapPads.length = 0;
    const done = padIndex.padsWithin(direction, radius, mapPads, () => performance.now() < until);
    out.push(...mapPads);
    return done;
  };
  // Nothing beside a road stands on the track where a line crosses it.
  if (railGround !== null) {
    const taken: { at: THREE.Vector3; radius: number }[] = [];
    const takenAt = new THREE.Vector3();
    roads.setTaken((point, footprint) => {
      taken.length = 0;
      return railGround.fieldsNear(takenAt.copy(point).normalize(), footprint, taken).length > 0;
    });
  }
  const { createLife } = await deferred.life;
  const { VEHICLES } = await deferred.traffic;
  const { ANIMALS } = await deferred.fauna;
  const { createRigLibrary } = await deferred.kit;
  const { modelMaterial } = await import('./models.ts');
  const inkSource = ctx.toon(ctx.palette.ink);
  // The rockets standing near the player, on the ramp the world is drawn with.
  const launchPads = createLaunchPads({ world, pads: padIndex, gradientMap: inkSource.gradientMap!, land });
  scene.add(launchPads.group);
  const streetPush = new THREE.Vector3();
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
    fields: takenGround,
    // The drawn land, which a herd's animals stand on.
    land,
    // A vehicle driving through a town rides its floor and keeps out of its
    // walls; the answers are the standing towns', the ones the player gets.
    streets: {
      floorAt: (direction) => settlements.madeHeightAt(direction),
      blocked: (point, radius) => settlements.collide(point, radius, streetPush),
    },
  });
  scene.add(life.group);

  // The railway: the track and the stations stand at once, the trains once
  // the Train Kit's models have come.
  const { createRailway } = await deferred.railway;
  const railway = railNetwork === null
    ? null
    : createRailway({
        world,
        places: places.all,
        roads: baked.roads,
        network: railNetwork,
        material: modelMaterial(inkSource.gradientMap!, inkSource.userData.outlineParameters as { thickness: number; color: [number, number, number] }),
        drawnGround: groundAt,
      });
  if (railway !== null) {
    scene.add(railway.group);
    deferred.kit
      .then(({ loadModels }) => loadModels('rail/kit.bin'))
      .then((models) => railway.setKit(new Map(models.map((model) => [model.name, model]))))
      .catch((error: unknown) => console.warn('the trains did not load', error));
  }

  await stage('planting the country');
  // Between the towns, which is 99% of the land. It builds nothing here — the
  // whole of it is streamed — so this costs a few kilobytes and one material.
  const { createVegetation } = await deferred.vegetation;
  const vegetation = createVegetation(world, {
    context: ctx,
    places: places.all,
    monuments: placements,
    // The pruned network, the same list the streamer draws: a tree in the
    // carriageway is what the last of the three keepouts is for.
    roads: baked.roads,
    // The drawn land and the towns' lawns, which the grass under your feet stands on.
    land,
    lawns: settlements,
    // And the fields the light planes and balloons stand in, so no tree grows
    // through a wing, and the railway's ballast and stations.
    fields: takenGround,
  });
  scene.add(vegetation.group);
  // The herds keep off the farms, mills and fields the vegetation plans, as they keep off a road.
  life.setCountry(vegetation.countryside);
  if (vegetation.broken.length > 0) console.warn('scenery parts that broke the contract:', vegetation.broken);
  if (vegetation.missing.length > 0) console.warn('biome tables name plants that do not exist:', vegetation.missing);
  // The grass: the vegetation says where it grows and on what (`grass`); this draws it.
  const { createGrass, pressOf } = await deferred.grass;
  const grass = createGrass(vegetation.grass);
  /** What the player parts the grass with, rewritten a frame (`pressOf`). */
  const grassPress = { forward: new THREE.Vector3(), length: 0, width: 0 };
  scene.add(grass.group);

  // What moving leaves behind it — wakes, smoke, dust, a crash's debris — in
  // three pools and at most four draw calls; see `effects.ts`. Made here so
  // its programs are warmed with the streamers'.
  const { createEffects, crashStrength } = await deferred.effects;
  const effects = createEffects();
  effects.enabled = readSetting(EFFECTS_KEY) !== '0';
  scene.add(effects.group);

  // The sails, blades and wheels turning near you, a lighthouse's beam after
  // dark, the smoke off a campfire: two meshes and the effects' puffs, fed
  // by the vegetation tiles that hold the mills, lighthouses and camps.
  const { createCountryMotion } = await deferred.countryMotion;
  const countryMotion = createCountryMotion(ctx);
  scene.add(countryMotion.group);
  effects.setSmokers(countryMotion.smokers);
  const countryEye = new THREE.Vector3();

  // The small life round the camera — fireflies at night, butterflies and
  // pollen by day, gulls over a coast, a fish off the shore, leaves coming off
  // the trees and lying under them — in three draw calls; see `ambient.ts`.
  // The *Effects* switch carries it. The ground and the made floors are the
  // same two questions the player's foot asks, and the leaves come off the
  // crowns the near wood and the near towns draw.
  const { createAmbient } = await deferred.ambient;
  const ambient = createAmbient({
    groundAt: (point) => groundAt(point),
    madeHeightAt: (point) => madeHeightAt(point),
    meadowAt: (direction) => (vegetation.countryside?.meadowAt(direction) ?? null) !== null,
    crownsNear: (point, range, visit) => {
      vegetation.crownsNear(point, range, visit);
      settlements.crownsNear(point, range, visit);
    },
    splash: (point, reach) => effects.splashAt(point, reach),
  });
  ambient.enabled = effects.enabled;
  scene.add(ambient.group);

  // The sea floor round the player, and the water over it as clear as it is
  // shallow, near a coast and low; and what swims there: schools over the
  // reef and the kelp, a shark or a turtle, dolphins passing, a whale far
  // out. See `seabed.ts` and `sea-life.ts`. The swimmers go with the
  // *Effects* switch, as the small life does; the floor is the sea's.
  const { createSea } = await deferred.sea;
  const sea = createSea(world);
  scene.add(sea.group);
  const { createSeaLife } = await deferred.seaLife;
  const seaLife = createSeaLife({ splash: (point, reach) => effects.splashAt(point, reach) });
  seaLife.enabled = effects.enabled;
  scene.add(seaLife.group);
  /** What the swimmers are told each frame, filled in place. */
  const seaLifeFrame = {
    camera: new THREE.Vector3(),
    seconds: 0,
    diver: null as THREE.Vector3 | null,
    screw: null as THREE.Vector3 | null,
    screwSpeed: 0,
  };
  /** What the floor is told each frame, filled in place (the player and the rig are made further down). */
  const seaFrame: Parameters<typeof sea.update>[1] = { player: new THREE.Vector3(), camera: new THREE.Vector3(), daylight: 1, fog };
  let oceanHidden = false;
  const diverHead = new THREE.Vector3();
  const subScrew = new THREE.Vector3();
  const eachSeaLife = (visit: (life: import('./sea-floor.ts').TileLife) => void): void => sea.eachLife(visit);
  /**
   * The ground the camera is kept over. Under the surface — a diver's, a
   * submarine's — the water is not a floor and the sea floor is; everywhere
   * else it is the land, or the sea's surface over the sea, as it always was.
   */
  const cameraGroundAt = (point: THREE.Vector3): number => {
    const ground = groundAt(point);
    if (player.depth <= 0.3 || ground > PLANET_RADIUS + 0.5) return ground;
    return sea.floorAt(point);
  };

  await stage('packing your bag');
  // Everything the world needs is now standing, so the menu stops being a
  // loading screen you cannot leave and becomes a choice. `choose` resolves on
  // a click, on `Enter`, or immediately if the player already picked while the
  // land was building.
  menu.ready();
  title?.ready();
  report = null;
  // Every program the streamers will draw with, compiled while the player
  // chooses, so the first town, landmark or animal is not also a shader link.
  // The skinned twin is the rigs' own material, a plain `ctx.toon` colour
  // stands for the craft, and the fleet adds its airstrips' and propeller
  // discs'; see `warm.ts`.
  void warmShaders(
    renderer,
    outline,
    scene,
    [settlements, monuments, roads, vegetation, grass, life, effects, ambient, sea, seaLife, countryMotion, weather, { proxies: () => [proxyOf(inkSource), landFlagProxy(), ...fleetMaterials().map((material) => proxyOf(material))] }],
    modelMaterial(inkSource.gradientMap!, inkSource.userData.outlineParameters as { thickness: number; color: [number, number, number] }),
  )
    .then((ms) => console.log(`shaders warmed in ${Math.round(ms)} ms`))
    .catch((error: unknown) => console.warn('the shader warm-up failed:', error));
  // The vehicles' code and models, before the world takes the sky back from
  // the menu below: the menu draws while anything here is awaited, and its
  // frame hides the dome whenever its camera is out past it, so an await
  // after that hand-back left the world with no sky.
  const { createFleet, createLocalLink } = await deferred.fleet;
  const { createFleetSync } = await deferred.fleetSync;
  const craftModels = await deferred.craft
    .then(({ loadCraft }) => loadCraft())
    .catch((error: unknown) => {
      console.warn('the vehicles did not load', error);
      return new Map();
    });
  // The sky's traffic, a timetable read round the player; the takeable craft
  // lend it their light plane, helicopter and balloon.
  const { createAirTraffic } = await deferred.airTraffic;
  const { keepsBalloon } = await deferred.fleet;
  const airWeather = weatherSample();
  const airProbe = new THREE.Vector3();
  const airTraffic = createAirTraffic({
    craft: craftModels,
    source: {
      places: places.all,
      ground: (direction) => groundRadius(world, airProbe.copy(direction).multiplyScalar(PLANET_RADIUS)),
      strips: fleetSites,
      keepsBalloon,
      wind(lat, lon, timeMs) {
        unitAt(lat, lon, airProbe);
        weatherAt(lat, lon, Math.max(0, reliefAt(airProbe.x, airProbe.y, airProbe.z)), timeMs, airWeather);
        const calm = (airWeather.kind === 'clear' || airWeather.kind === 'cloudy') && airWeather.windSpeed < 8;
        return { east: airWeather.windEast, north: airWeather.windNorth, speed: airWeather.windSpeed, calm };
      },
    },
  });
  scene.add(airTraffic.group);
  const passingSound = (await deferred.passingSound).createPassingSound();
  const passingVoices: Parameters<typeof passingSound.update>[1] = {};
  if (railway !== null) railway.onHorn = (near) => passingSound.horn(audio.bus, near);
  const spawn = skipMenu
    ? { body: 'earth', region: '', name: 'here', lat: at[0]!, lon: at[1]! }
    : await menu.choose();
  // The other players, on the relay chosen above, wearing what the card chose
  // — only when the title screen said online (or a link remembered it). Made
  // here, once the choice is final; it opens its socket on the loop's first
  // update. Offline there is no `peers` at all, so nothing anywhere sends:
  // the fleet keeps its local link, the chat is local, and Tab says offline.
  const playMode: PlayMode = title?.mode ?? linkedMode;
  const peers = playMode === 'online' && peersUrl !== '' ? peersModule.createPeers(peersUrl, folk) : null;
  if (peers !== null) {
    // Before the first connection, which carries it in its address.
    peers.setLook(encodeAppearance(heroAppearance()));
    scene.add(peers.group);
    peersLink = peers;
  }
  /**
   * Where a body is put down for a wanted point: carried out of every
   * landmark's plan (`clearOfPlans`), onto dry ground where a ray out of it
   * finds some. Every arrival asks it — the start, a link's `?at=`, `/goto`,
   * `/home`, `/tp`, the map's join and the console's `goTo` — because a
   * town's own point can stand inside its landmark, and a body put down in a
   * model has no way out. The walls of a town, a wood or a vehicle are the
   * player's `freeSpotNear`, which `goTo` asks too, and once they stand.
   */
  const arrivalSites = placements.map(plannedSite);
  const arrivalPoint = new THREE.Vector3();
  const arrivalProbe = new THREE.Vector3();
  const dryArrival = (p: { x: number; y: number; z: number }): boolean =>
    !isWater(groundRadius(world, arrivalProbe.set(p.x, p.y, p.z).multiplyScalar(PLANET_RADIUS)));
  function arrivalAt(lat: number, lon: number): { lat: number; lon: number } {
    unitAt(lat, lon, arrivalPoint);
    if (!clearOfPlans(arrivalPoint, arrivalSites, PLANET_RADIUS, arrivalPoint, ARRIVAL_CLEARANCE, dryArrival)) return { lat, lon };
    return latLonOf(arrivalPoint.normalize());
  }
  const start = arrivalAt(spawn.lat, spawn.lon);
  // The dive into the town and the curtain over the end of it. Everything below
  // — the player, the rig, the HUD — is built behind the curtain, and the loop
  // lifts it once the town under it has had a moment to stand.
  let curtain: Curtain | null = skipMenu ? null : await menu.depart();
  // Whatever the menu did to the sky, the world gets it back.
  clouds.setVeil(1);
  setMenuSky(false);
  if (skyDome !== undefined) skyDome.visible = true;
  if (sunDisc !== undefined) sunDisc.visible = true;
  if (moonDisc !== undefined) moonDisc.visible = true;
  scene.background = null;
  /**
   * The ground people made, which is the surface a foot actually stands on.
   *
   * The town's plinth, the road's carriageway and a monument's steps and
   * plinth, from the streamers that know what is *standing*; `terrain.ts` is
   * still the one definition of the relief and `player.ts` takes the higher of
   * the two. Every query answers 0 off its own surface, so on open ground this
   * is three cheap rejections and no terrain query at all.
   */
  const madeHeightAt = (point: THREE.Vector3): number =>
    Math.max(settlements.madeHeightAt(point), roads.ribbonHeightAt(point), monuments.madeHeightAt(point), railway?.bedHeightAt(point) ?? 0);
  /**
   * And the walls on it. A building is solid to a foot and opaque to the lens,
   * and both answers belong to the settlements for the reason the floor does:
   * only a standing town has walls. The player asks `collide` every frame on
   * foot, moving or not, and `freeSpotNear` whenever that hit something, which
   * is also what makes the spawn and `atlas.goTo` safe: the town at the far end
   * of a jump is raised a few frames later, around wherever you landed, and the
   * first frame it stands puts you on the nearest clear ground outside it.
   */
  /** What the foot is on, refreshed a couple of times a second in the loop. */
  let footing: Surface = 'grass';

  /** The fleet's vehicles as walls, once the fleet is up; see `Fleet.collide`. */
  let vehicleWalls: ((point: THREE.Vector3, radius: number, push: THREE.Vector3) => boolean) | null = null;
  /** And the nearest spot clear of them; see `Fleet.freeSpotNear`. */
  let vehicleSpot: ((point: THREE.Vector3, radius: number, out: THREE.Vector3) => boolean) | null = null;
  const vehiclePush = new THREE.Vector3();
  /**
   * Everything still that is a wall: a town's buildings, a monument's own
   * walls and the trunks, boulders and farm buildings of the near wood. Each
   * knows only its own, so the pushes are summed and a free spot is asked of
   * each in turn.
   */
  const stillWalls = [settlements, monuments, vegetation, launchPads] as const;
  const stillPush = new THREE.Vector3();
  const freeFrom = new THREE.Vector3();
  const freeTo = new THREE.Vector3();
  /**
   * The nearest spot clear of every still wall and every vehicle standing. A
   * spot one source finds may stand in another's — a door freed onto a tree,
   * or a body put down beside a car that arrived where it stood — so each is
   * asked from where the last one put the body, until a whole round moves it
   * no more; four rounds, then whatever the last answer was.
   */
  const freeOfWalls = (point: THREE.Vector3, radius: number, out: THREE.Vector3): boolean => {
    freeFrom.copy(point);
    let moved = false;
    for (let round = 0; round < 4; round++) {
      let again = false;
      for (const source of stillWalls) {
        if (!source.freeSpotNear(freeFrom, radius, freeTo)) continue;
        freeFrom.copy(freeTo);
        again = moved = true;
      }
      if (vehicleSpot !== null && vehicleSpot(freeFrom, radius, freeTo)) {
        freeFrom.copy(freeTo);
        again = moved = true;
      }
      if (!again) break;
    }
    if (moved) out.copy(freeFrom);
    return moved;
  };

  await avatarReady;
  landProbe.prime(unitAt(start.lat, start.lon, new THREE.Vector3()));
  const player = createPlayer(world, start.lat, start.lon, {
    groundAt,
    madeHeightAt: (point) => madeHeightAt(point),
    // The sea floor, which a diver and a submarine stop on.
    seaFloorAt: (point) => sea.floorAt(point),
    onStep: (weight) => {
      audio.step(footing, weight);
      effects.step(weight);
    },
    // A jump lands at about its take-off speed; stepping off a kerb does not.
    onTouchdown: (speed) => {
      if (speed > 12) audio.cue('land');
      effects.touchdown(speed);
    },
    // The towns' walls and parked cars, the monuments' own walls, the near
    // wood's trunks, boulders and farm buildings, every vehicle standing
    // about, and the people: a townsman standing or strolling and a walker on
    // the verge are solid too, each a body `PERSON_RADIUS` wide. A person gives no way, being
    // where their town or their route puts them; the body walking into them is
    // the one pushed out. So is an animal of a near herd, by its own length
    // and width, and it bolts (`life.collide`).
    collide: (point, radius, push) => {
      let hit = settlements.collide(point, radius, push);
      for (let i = 1; i < stillWalls.length; i++) {
        if (!stillWalls[i]!.collide(point, radius, stillPush)) continue;
        if (hit) push.add(stillPush);
        else push.copy(stillPush);
        hit = true;
      }
      if (vehicleWalls !== null && vehicleWalls(point, radius, vehiclePush)) {
        if (hit) push.add(vehiclePush);
        else push.copy(vehiclePush);
        hit = true;
      }
      // A train's cars and a station's hall.
      if (railway !== null && railway.collide(point, radius, vehiclePush)) {
        if (hit) push.add(vehiclePush);
        else push.copy(vehiclePush);
        hit = true;
      }
      const folkHit = townsfolk.collide(point, radius, push);
      const walkerHit = life.collide(point, radius, PERSON_RADIUS, push);
      return hit || folkHit || walkerHit;
    },
    // And a balloon or a plane higher than that: only the buildings whose
    // roofs are still over it.
    collideAloft: (point, radius, push) => {
      const roof = settlements.collideAloft(point, radius, push);
      if (!launchPads.collideAloft(point, radius, vehiclePush)) return roof;
      if (roof) push.add(vehiclePush);
      else push.copy(vehiclePush);
      return true;
    },
    freeSpotNear: (point, radius, out) => freeOfWalls(point, radius, out),
    // What the player did or was refused, in words. Only what the strip along
    // the bottom does not already say: a landing refused, and why.
    onEvent: (event: PlayerEvent, strength: number) => {
      effects.event(event, strength);
      const rotor = player.ride?.model.kind === 'helicopter';
      if (event === 'water-refused') {
        announce(rotor ? 'A helicopter cannot set down on water — find land' : 'A plane cannot land on water — find a field', rotor ? 'heli' : 'plane');
        audio.cue('ui-error');
      } else if (event === 'steep-refused') {
        announce('Too steep to land here — find flatter ground', rotor ? 'heli' : 'plane');
        audio.cue('ui-error');
      } else if (event === 'landed' || event === 'foundered') audio.cue('land');
      // A car into a wall: the landing's thud, which is the one knock the
      // sound has, and the lens knocked with it.
      else if (event === 'crashed') {
        audio.cue('land');
        rig.shake(crashStrength(strength));
      }
    },
  });
  scene.add(player.object);

  // The vehicles you can take. A relay, when there is one, says who has moved
  // what and who sits where, and every client agrees on the rest because the
  // sites are a function of the world (`fleet.ts`); with none, the local link
  // keeps what you moved on this machine. A craft kit that fails to load
  // leaves the world with nothing to drive and otherwise whole.
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
    madeHeightAt,
    land,
    // What stands still until it is taken: the towns' parked cars and the
    // bicycles in their racks, and the farms' tractors.
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
    // What a vehicle nobody is driving any more runs into: the still walls
    // only, since the fleet's own are asked of it by the fleet.
    collide: (point, radius, push) => {
      let hit = false;
      push.set(0, 0, 0);
      for (const source of stillWalls) {
        if (!source.collide(point, radius, stillPush)) continue;
        push.add(stillPush);
        hit = true;
      }
      return hit;
    },
    onEvent: (event, model, at) => {
      const iconName: IconName = modeIcon(model?.kind ?? null);
      if (event === 'bailed') {
        // Out of something under way.
        audio.cue('ui-click');
      } else if (event === 'wrecked') {
        if (at !== undefined) effects.crashAt(at, rig.heading, 0.8);
        if (at !== undefined && at.distanceTo(player.position) < 400) audio.cue('land');
      } else if (event === 'foundered' || event === 'sank') {
        // Into the water, and under it: a splash, and the last of it.
        const reach = model === null ? 3 : Math.max(model.size[0], model.size[1]) * (event === 'sank' ? 0.4 : 0.75);
        if (at !== undefined) effects.splashAt(at, reach);
        if (event === 'foundered' && at !== undefined && at.distanceTo(player.position) < 400) audio.cue('land');
      } else if (event === 'leave-refused') {
        // Aloft is a jump now (`bailed`); the one refusal left is a
        // submarine under the surface.
        announce(model?.kind === 'submarine' ? 'Surface before getting out' : 'Nobody gets out here', iconName);
        audio.cue('ui-error');
      } else if (event === 'taken') {
        announce('Somebody else just took that seat', iconName);
        audio.cue('ui-error');
      } else if (event === 'boarded') audio.cue('ui-confirm');
      else if (event === 'left') audio.cue('ui-click');
    },
  });
  scene.add(fleet.group);
  vehicleWalls = (point, radius, push) => fleet.collide(point, radius, push);
  vehicleSpot = (point, radius, out) => fleet.freeSpotNear(point, radius, out);
  // What the traffic stops for and the herds keep off, besides each other: the
  // player, whatever he drives, every vehicle standing about, and the people
  // of a town's streets. A car kept waiting by the player sounds its horn,
  // quieter the further off it is.
  {
    const folkPush = new THREE.Vector3();
    life.setInTheWay({
      each(visit) {
        const model = player.ride?.model;
        visit(player.position, model === undefined ? PERSON_RADIUS : (model.size[0] + model.size[1]) / 4, true);
        fleet.eachStanding(visit);
        // A train over a level crossing: the traffic waits for it to pass.
        railway?.eachCar(visit);
      },
      people: (point, radius) => townsfolk.collide(point, radius, folkPush.set(0, 0, 0)),
      parked: (point, radius) => fleet.movedNear(point, radius),
      horn: (at) => audio.horn(Math.max(0, 1 - at.distanceTo(player.position) / 120)),
    });
  }
  // The wakes and trails of everything else under way: the vehicles other
  // players drive, and the boats of the traffic. The visitors are made once,
  // so a frame hands them over without making anything.
  {
    let visitOther: OtherVisitor = () => {};
    const driven = (object: THREE.Object3D, model: CraftModel): void => visitOther(object, model.kind, model);
    const boat = (object: THREE.Object3D): void => visitOther(object, 'boat', null);
    effects.setOthers((visit) => {
      visitOther = visit;
      fleet.eachDriven(driven);
      life.eachBoat(boat);
      airTraffic.eachFlyer(visitOther);
    });
  }
  // A town built from here on leaves out a parked car the fleet has, and one
  // already standing folds it away (`hideParked`, through the fleet).
  settlements.setParkedTaken((id) => fleet.claimsParked(id));
  vegetation.setParkedTaken((id) => fleet.claimsParked(id));
  for (const id of fleet.claimedParked()) {
    settlements.hideParked(id);
    vegetation.hideParked(id);
  }
  if (peers !== null && fleetSync !== null) peers.useSeats(fleet, (id) => fleetSync.seatOf(id));

  const rig = createCameraRig({
    blocks: (point) => settlements.blocksSight(point) || monuments.blocksSight(point) || vegetation.blocksSight(point) || launchPads.blocksSight(point),
  });
  // A crash shakes the lens unless the player said not to, or the system asks
  // for less motion and the player has not said either way.
  const shakeSaved = readSetting(SHAKE_KEY);
  rig.shakes = shakeSaved === null ? !matchMedia('(prefers-reduced-motion: reduce)').matches : shakeSaved === '1';
  // Only when it is asked for: `Number(null)` is 0, so the unguarded test put
  // every ordinary load's walking camera on the ground.
  const heightQuery = query.get('height');
  if (heightQuery !== null && Number.isFinite(Number(heightQuery))) rig.view.height = Number(heightQuery);
  const input = createInput(renderer.domElement, {
    // An embed that may not lock the mouse: say once what works instead.
    onLockRefused: () => announce('This page cannot lock the mouse — drag to look around', 'mouse'),
  });

  // The pins are what make the map answer "where is anything", which the
  // coastline alone never did. They cover every placement, including the
  // landmarks nobody has modelled yet — a pin for a place you can walk to and
  // find nothing at is still better than no pin. The gazetteer goes with them
  // because the disc draws the built towns around you, and the one the chip
  // is naming by name; and the roads, each traced once along its own course
  // (`courseOf`), the first time the disc is drawn.
  const { createMinimap } = await deferred.minimap;
  const minimap = createMinimap(world, {
    monuments: placements,
    places: places.all,
    roads: () => {
      const course = emptyCourse();
      const at = new THREE.Vector3();
      return baked.roads.map((road) => {
        courseOf(road, places.all, course);
        const samples = MINIMAP_ROAD_SAMPLES;
        const line = new Float32Array(samples * 3);
        for (let k = 0; k < samples; k++) {
          coursePoint(course, k / (samples - 1), at);
          line[k * 3] = at.x;
          line[k * 3 + 1] = at.y;
          line[k * 3 + 2] = at.z;
        }
        return line;
      });
    },
    // The rockets' pads, a millisecond of working out a paper: the disc
    // asks again until every pad on it is known.
    pads: padsForMaps,
  });
  document.getElementById('minimap')!.appendChild(minimap.canvas);

  const { bearingTo, EARTH_KM } = await deferred.cartography;
  /**
   * Who `E` would talk to, decided with the prompt so that the key does what
   * the prompt said; and what a conversation is told about where it is.
   */
  let talkOffer: string | null = null;
  /** The bench `E` would sit you on, this frame. */
  let benchOffer: Bench | null = null;
  let engaged = false;
  const talkCrown = new THREE.Vector3();
  const talkLandmark = new THREE.Vector3();
  const talkNorth = new THREE.Vector3(0, 1, 0);
  const talkHere = new THREE.Vector3();
  const talkSites: ReturnType<typeof fleetSites.near> = [];
  function startTalk(key: string): void {
    const here = toLatLon(player.position);
    const index = world.countryAtPoint(player.position);
    const country = index > 0 ? world.countries[index - 1]! : null;
    const nearby = places.nearest(player.position);
    const hour = Number.parseInt(clockAt(sky.state.time, country?.iso ?? '', here.lon, here.lat, nearby.place), 10);
    // The nearest landmark, by the angle between it and here.
    let landmark: Where['landmark'] = null;
    let nearest = Infinity;
    for (const placement of placements) {
      const angle = unitAt(placement.lat, placement.lon, talkLandmark).angleTo(player.position);
      if (angle >= nearest) continue;
      nearest = angle;
      landmark = { name: placement.name, km: angle * EARTH_KM, bearing: bearingTo(player.position, talkNorth, placement.lat, placement.lon) ?? 0 };
    }
    // The vehicles still standing at their sites near enough to point at,
    // the nearest of each kind: one search of the site index, whose towns
    // near a townsperson are already worked out.
    const craft: Where['craft'][number][] = [];
    talkSites.length = 0;
    fleetSites.near(talkHere.copy(player.position).normalize(), TALK_CRAFT_REACH, talkSites);
    for (const kind of TALK_CRAFT) {
      let best: (typeof talkSites)[number] | null = null;
      let bestAngle = TALK_CRAFT_REACH / PLANET_RADIUS;
      for (const site of talkSites) {
        if (site.kind !== kind || fleet.claimsParked(site.id)) continue;
        const angle = site.at.angleTo(talkHere);
        if (angle < bestAngle) [best, bestAngle] = [site, angle];
      }
      if (best !== null) {
        craft.push({ kind, bearing: bearingTo(player.position, talkNorth, latOf(best.at.y), lonOf(best.at.x, best.at.z)) ?? 0 });
      }
    }
    talk.start(key, {
      iso: country?.iso ?? '',
      countryName: country?.name ?? '',
      town: nearby.place.name,
      population: nearby.place.pop,
      capital: nearby.place.capital === true,
      coastal: shoreDistance(here.lat, here.lon) < TALK_COAST,
      warmth: soundBiome.warmth,
      biome: soundBiome.id,
      elevation: soundBiome.elevation,
      hour: Number.isFinite(hour) ? hour : 12,
      landmark,
      craft,
      young: isYoung(key),
      woman: isWoman(key),
    });
    engaged = townsfolk.engage(key, player.position);
    // And the traveller turns to them, as they turn to the traveller: a
    // conversation held over a shoulder reads as nobody talking to anybody.
    // Not from a bench, whose seat faces one way.
    if (!player.sitting && townsfolk.crownOf(key, talkCrown)) {
      talkCrown.sub(player.position).projectOnPlane(player.up);
      if (talkCrown.lengthSq() > 1e-4) player.forward.copy(talkCrown.normalize());
    }
    audio.cue('ui-open');
  }
  const { createHud } = await deferred.hud;
  // The gear and the map on the HUD's bar, and on its pause card. Both are
  // closures over things built a few lines further down, which is safe: they
  // run on a click, long after everything here exists.
  const hud = createHud(world, {
    onSettings: () => settings.toggle(),
    onMap: () => (map.open ? map.hide() : map.show()),
    // The card for a new country, and the frontier's jingle with it. The
    // passport takes it as a candidate and stamps it once you are down in it.
    // A new country is a stamp in the passport's book and nothing on the
    // screen or in the ears: a card and a jingle at every frontier walked
    // along were noise by the third.
    onArrival: (id) => {
      const country = world.countries[id - 1];
      if (country !== undefined) passport.arrived(country.iso, country.name);
    },
    onPassport: () => passportCard.toggle(),
    // Off Earth and out to the planets. Earth's game is built once behind the
    // menu, so the way back to the menu is the page's own start, past the
    // title, under a curtain.
    leave: { label: 'Solar system', run: () => toSolarSystem() },
    // Inside the welcome card's click, so the lock is still the player's gesture.
    onStart: () => input.lock(),
    // The clock's icon: the weather where you stand, as it is drawn.
    weather: () => weather.here().kind,
  });
  document.body.appendChild(hud.root);

  // The passport: a stamp for every country you come down in, a page of them
  // a continent, behind `J` and the pause card.
  const { createPassport } = await deferred.passport;
  const { createPassportCard } = await deferred.passportCard;
  const passport = createPassport();
  /**
   * The world map put away under the book, one card at a time as Settings
   * and the chat do. A closure filled in once the map exists, below: the book
   * answers `J` from here on and the map is made a few awaits later.
   */
  let mapGivesWay = (): void => {};
  const passportCard = createPassportCard({
    passport,
    countries: world.countries,
    // The other worlds' chapters, one visa a world, read off their geography
    // when the book first opens — `src/system/` stays out of the first load.
    chapters: () => import('./system/geography.ts').then((module) => module.chaptersOf()),
    // The holder's page: the name the others see, and the look they see.
    holder: () => ({ name: peersLink?.name ?? peersModule.storedName(), appearance: heroAppearance() }),
    // It falls open at the visa of the country underfoot.
    here: () => passportMoment.iso,
    lockTarget: renderer.domElement,
    // A book, and it sounds like one: its cover, a page a turn — a riffle
    // for a bookmark that skips several — and the stamp's thump.
    onOpen: () => {
      mapGivesWay();
      audio.cue('book-open');
    },
    onClose: () => audio.cue('book-close'),
    onTurn: (leaves) => {
      audio.cue('page');
      if (leaves > 1) window.setTimeout(() => audio.cue('page'), 90);
    },
    onThud: () => audio.cue('stamp'),
  });
  document.body.appendChild(passportCard.root);
  passport.onStamp = (stamp) => passportCard.celebrate(stamp);
  const passportMoment: import('./passport.ts').PassportMoment = {
    iso: '', aloft: false, mode: 'foot', time: new Date(0), lat: 0, lon: 0,
    town: { index: -1, name: '', iso: '', inside: false },
  };

  // The player's own marker, put down on the map behind `M`. It points and it
  // never flies you — the plane's whole design is that speed rides altitude,
  // so crossing an ocean *is* a climb and arriving *is* a descent.
  const { createNavigation } = await deferred.navigation;
  const nav = createNavigation({
    minimap,
    hud,
    groundAt,
    countryAt: (lat, lon) => {
      const id = world.countryAt(lat, lon);
      return id > 0 ? world.countries[id - 1]!.iso : null;
    },
  });

  // The whole planet on one sheet, behind `M`: names, real distances, and a
  // marker you can put down anywhere. It binds its own key, and it drives `nav`
  // rather than owning a second idea of where the marker is.
  const { createWorldMap } = await deferred.map;
  /**
   * A jump to anywhere, which the console, the chat and the map's players
   * all make. Never inside a landmark: `arrivalAt` carries the point out of
   * every plan first. Never inside a building: `player.goTo` steps clear of any town already
   * standing there, and one raised after the jump pushes you out on its first
   * frame. See the player's options above.
   */
  const jumpPoint = new THREE.Vector3();
  function jumpTo(wantedLat: number, wantedLon: number): void {
    const { lat, lon } = arrivalAt(wantedLat, wantedLon);
    // The land under the far end, gathered now rather than over the next few
    // frames: a foot that arrives on the relief rises onto the drawn land when
    // it comes, by up to a few units.
    landProbe.prime(unitAt(lat, lon, jumpPoint));
    player.goTo(lat, lon);
    rig.snap(player, groundAt);
    // The chip is debounced against a coastline crossed on foot, and a jump
    // across the planet is the one thing that filter gets wrong: without this
    // it names the country and the town you left for a second, which reads as
    // `countryAt` being broken. See `Hud.jump`.
    hud.jump();
  }

  /** Beside another player, `JOIN_OFFSET` to their north: the map's *join* and the chat's `/tp`. */
  function joinPeer(id: string): boolean {
    const at = peers?.positionOf(id) ?? null;
    if (at === null) return false;
    const { lat, lon } = toLatLon(at);
    jumpTo(Math.min(89.9, lat + JOIN_OFFSET / UNITS_PER_DEGREE), lon);
    return true;
  }

  /**
   * A wave or a dance: on the hero at once, and to the others at most once a
   * second, the relay's own pace (`EMOTE_INTERVAL_MS`).
   */
  let gesturedAt = -Infinity;
  function tellGesture(name: Emote): void {
    const now = performance.now();
    if (now - gesturedAt >= EMOTE_INTERVAL_MS && peers?.send({ t: 'emote', e: name }) === true) gesturedAt = now;
  }
  function gesture(name: Emote): boolean {
    if (!player.emote(name)) return false;
    tellGesture(name);
    return true;
  }

  /**
   * **A bench is somewhere to sit** (`bench.ts`): the towns' beside their
   * lamps, the countryside's by the roads and the lighthouses and the
   * stations' under their canopies (`railway.benchesNear`), whichever
   * sitter's spot is nearest inside `BENCH_REACH`. Sitting is the `sit`
   * gesture on the wire, sent once the body has settled on the seat: sent
   * with the step onto the spot, the others' copy of it would see a body
   * moving and stand it straight back up.
   */
  const benchesHere: Bench[] = [];
  const benchUp = new THREE.Vector3();
  function nearestBench(): { bench: Bench; distance: number } | null {
    benchesHere.length = 0;
    settlements.benchesNear(player.position, BENCH_REACH + 2, benchesHere);
    vegetation.countryside?.benchesNear(benchUp.copy(player.position).normalize(), BENCH_REACH + 2, benchesHere);
    railway?.benchesNear(player.position, BENCH_REACH + 2, benchesHere);
    let best: Bench | null = null;
    let bestDistance = BENCH_REACH;
    for (const bench of benchesHere) {
      const distance = bench.position.angleTo(player.position) * PLANET_RADIUS;
      if (distance < bestDistance) [best, bestDistance] = [bench, distance];
    }
    return best === null ? null : { bench: best, distance: bestDistance };
  }
  /** The rocket `E` would put you in, this frame (`launchPads.offer`), decided with the prompt. */
  let rocketOffer: Rocket | null = null;
  /** The keys in a rocket on its pad: the other worlds' (`ROCKET_KEYS` in `worlds/shell.ts`). */
  const rocketKeys: HintSet = {
    id: 'rocket',
    once: false,
    sticky: true,
    hints: [
      { keys: ['jump'], label: 'Hold to launch' },
      { keys: ['use'], label: 'Get out' },
    ],
  };
  const rocketOut = new THREE.Vector3();
  function boardRocket(rocket: Rocket): void {
    launchPads.board(rocket, player.object);
    if (launchPads.riding === null) return;
    hud.showKeys(rocketKeys);
    rocketKeysUp = true;
    audio.cue('ui-confirm');
  }
  /** Out of the rocket on its pad, a step from its door; nothing once it has lifted. */
  function leaveRocket(): void {
    if (!launchPads.leave(rocketOut)) return;
    const at = toLatLon(rocketOut);
    player.goTo(at.lat, at.lon);
    rig.snap(player, groundAt);
    hud.showKeys(null);
    rocketKeysUp = false;
    audio.cue('ui-click');
    rocketHeld = false;
  }
  /**
   * The cream that comes down over the end of a launch the player rides, as
   * it does in the other worlds; under it the page goes to the solar system
   * the way Earth's *Solar system* button takes it (`toSolarSystem`).
   */
  let rocketCurtain: HTMLDivElement | null = null;
  let rocketGone = false;
  /** `Space` held for the player from the console (`atlas.rockets.ignite`), until he is out. */
  let rocketHeld = false;
  /** The way out the rockets roar through, made once the sound is open and handed over the same every frame. */
  let rocketSound: RocketSound | null = null;
  const rocketSoundOf = (): RocketSound | null => {
    if (rocketSound === null && audio.output !== null && audio.bus !== null) rocketSound = { context: audio.output.context, node: audio.bus };
    return rocketSound;
  };
  /** Whether the rocket's keys are on the strip: from boarding until out, or until it leaves the pad. */
  let rocketKeysUp = false;

  let sitTimer = 0;
  function sitDown(bench: Bench): void {
    if (!player.sitOn(bench.position, bench.facing, bench.sink)) return;
    audio.cue('ui-toggle');
    window.clearTimeout(sitTimer);
    sitTimer = window.setTimeout(() => {
      if (player.sitting) tellGesture('sit');
    }, SIT_ANNOUNCE_MS);
  }

  const map = createWorldMap(world, {
    monuments: placements,
    places: places.all,
    roads: baked.roads,
    marker: () => nav.marker,
    onMark: (lat, lon, name, landmark) => nav.mark(lat, lon, name, landmark),
    onUnmark: () => nav.clear(),
    lockTarget: renderer.domElement,
    // A card holding the keyboard — Settings, the welcome, a notice — keeps
    // `M` from opening the map underneath it. Closing is never blocked.
    blocked: () => inputBlocked(),
    // The rockets' pads at a street zoom, worked out as the minimap's are.
    pads: padsForMaps,
    ...(peers === null
      ? {}
      : {
          peers: () => peers.marks,
          // Beside them rather than on them: `JOIN_OFFSET` to their north,
          // on the ground under wherever they are, the sea or the sky included.
          onJoin: (id: string) => void joinPeer(id),
        }),
  });
  document.body.appendChild(map.root);
  mapGivesWay = () => {
    if (map.open) map.hide(false);
  };

  // Who is playing, held on `Tab`: yourself first, then everyone the relay has
  // told us of, each with the flag of the country they stand in and what they
  // are doing, from the state on the wire and the seat the fleet says they hold.
  const { createPlayerList, describeDoing } = await deferred.playerList;
  const { kindOfModel, modelOfVehicle } = await deferred.fleet;
  const listPoint = new THREE.Vector3();
  const isoAtPoint = (point: THREE.Vector3): string | null => {
    const id = world.countryAtPoint(point);
    return id > 0 ? world.countries[id - 1]!.iso : null;
  };
  const doingOf = (state: string, seat: { vehicle: string; seat: number } | null): ReturnType<typeof describeDoing> =>
    describeDoing(state, seat === null ? null : kindOfModel(modelOfVehicle(seat.vehicle)), seat?.seat === 0);
  const playerList = createPlayerList({
    rows: () => [
      {
        id: peers?.id ?? 'you',
        name: peers?.name || peersModule.storedName() || 'Traveller',
        iso: isoAtPoint(player.position),
        doing: doingOf(player.state, fleet.current()),
        you: true,
      },
      ...[...(peers?.marks ?? [])]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((mark) => ({
          id: mark.id,
          name: mark.name,
          iso: isoAtPoint(listPoint.set(mark.x, mark.y, mark.z)),
          doing: doingOf(mark.state, fleetSync?.seatOf(mark.id) ?? null),
        })),
    ],
    online: () => (peers?.online ?? null) !== null,
    countryName: (iso) => world.countries.find((country) => country.iso === iso)?.name,
  });
  document.body.appendChild(playerList.root);

  // The names over the land. They are HTML like the rest of the HUD and they
  // ride the same fade the flag and the frontiers do; see `names.ts`.
  const { createCountryNames } = await deferred.names;
  const names = createCountryNames(world);
  // **First in the body**, and `names.ts` says why: the names have to paint
  // behind every card the HUD owns, and the only way past `z-index: auto` is to
  // be earlier in the document than the elements that carry it.
  document.body.insertBefore(names.root, document.body.firstChild);

  /** The HUD's icon for a kind of vehicle, and a neutral one for none. */
  function modeIcon(kind: CraftKind | null): IconName {
    return kind === null ? 'sparkle' : KIND_ICON[kind];
  }
  function announce(text: string, iconName: IconName = 'sparkle'): void {
    hud.toast(text, iconName);
  }
  function showDetail(value: number): void {
    announce(`Render distance ${renderDistanceWords(value)} (${value.toFixed(2)}×)`, 'eye');
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
   * Every read and write of `localStorage` is wrapped: a private window
   * throws on the *getter*, not on the write.
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
    // `H` puts the whole overlay away for a clear look, and brings it back.
    // Not remembered: a reload with nothing on the screen looks broken.
    else if (action === 'hud') announce(hud.toggleHidden() ? `Everything hidden · ${labelOf('hud')} brings it back` : 'Everything back', 'eye');
    else if (action === 'photo') photoWanted = true;
    else if ((action === 'wave' || action === 'dance') && !gesture(action)) announce('Only standing on the ground', 'walk');
    else if (action === 'horn') {
      const voice = hornInHand();
      if (voice !== null) hornKey.press(voice, performance.now());
    }
  });

  /**
   * The horn, at the controls of anything that has one (`HORN_OF`), held for
   * as long as its key is (`horn.ts`): heard here at once, and by the others
   * from the start the relay passes on to the stop. A passenger has no horn
   * to press, and nor has anybody while a card holds the keyboard.
   */
  const hornInHand = (): Honk | null => {
    const ride = player.ride;
    if (ride === null || ride.seat !== 0 || inputBlocked()) return null;
    return HORN_OF[ride.model.kind];
  };
  const hornKey = createHornKey((voice, near) => audio.holdHorn(voice, near), (message) => {
    peers?.send({ ...message });
  });
  addEventListener('keyup', (event) => {
    if (actionOf(event.code) === 'horn') hornKey.release(performance.now());
  });
  // A key let go while the window is somewhere else never says so.
  addEventListener('blur', () => hornKey.release(performance.now()));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hornKey.release(performance.now());
      hornChorus.stopAll();
    }
  });
  // Other players' horns, quieter the further off, out of earshot at
  // `HORN_REACH`, held while their keys are and let go when they leave.
  const hornChorus = createHornChorus((voice, near) => audio.holdHorn(voice, near));
  const hornNear = (id: string): number | null => {
    const from = peers?.positionOf(id) ?? null;
    return from === null ? null : 1 - from.distanceTo(player.position) / HORN_REACH;
  };
  peers?.onMessage((message) => {
    if (typeof message.id !== 'string') return;
    if (message.t === 'bye') {
      hornChorus.stop(message.id);
      return;
    }
    if (message.t !== 'honk') return;
    const voice = cleanHonk(message.k);
    const on = cleanHonkOn(message.on);
    const near = hornNear(message.id);
    if (voice === '' || on === null || near === null) return;
    hornChorus.hear(message.id, voice, on, performance.now(), near);
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
      if (sky.setTime(sky.state.time.getTime() + (wanted - now) * 60_000)) timeLive = false;
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
  const settings = createSettings({
    detail: { get: detail, set: setDetail, min: DETAIL_MIN, max: DETAIL_MAX },
    detailDistance: renderDistanceWords,
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
    effects: {
      get: () => effects.enabled,
      set: (on) => {
        effects.enabled = on;
        ambient.enabled = on;
        seaLife.enabled = on;
        writeSetting(EFFECTS_KEY, on ? '1' : '0');
        return on;
      },
    },
    weather: {
      get: () => weather.enabled,
      set: (on) => {
        weather.enabled = on;
        writeSetting(WEATHER_KEY, on ? '1' : '0');
        return on;
      },
    },
    shake: {
      get: () => rig.shakes,
      set: (on) => {
        rig.shakes = on;
        writeSetting(SHAKE_KEY, on ? '1' : '0');
        return on;
      },
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
    sound: soundRows,
    music: musicRows,
    lockTarget: renderer.domElement,
    // One card at a time: the settings over the world map would be two
    // overlays holding the mouse, and the map's keys under a modal card.
    onOpen: () => {
      if (map.open) map.hide(false);
      audio.cue('ui-open');
    },
    onClose: () => audio.cue('ui-close'),
  });
  document.body.appendChild(settings.root);

  // The chat, and the commands typed into it: the world's own verbs, handed
  // over as closures so that `chat.ts` and its words stay out of the first load.
  const { createChat } = await deferred.chat;
  const chatPoint = new THREE.Vector3();
  let gazetteer: import('./chat-core.ts').Gazetteer | null = null;
  const countryOf = (point: THREE.Vector3) => {
    const id = world.countryAtPoint(point);
    return id > 0 ? world.countries[id - 1]! : null;
  };
  const chat = createChat({
    peers,
    name: () => peers?.name || peersModule.storedName(),
    here: () => {
      const { lat, lon } = toLatLon(player.position);
      const country = countryOf(player.position);
      const nearby = places.nearest(player.position);
      return { iso: country?.iso ?? '', country: country?.name ?? '', town: nearby.place.name, near: nearby.near, lat, lon };
    },
    whereIs: ({ x, y, z }) => {
      chatPoint.set(x, y, z);
      const nearby = places.nearest(chatPoint);
      return { country: countryOf(chatPoint)?.name ?? '', town: nearby.place.name, near: nearby.near };
    },
    countryName: (iso) => world.countries.find((country) => country.iso === iso)?.name ?? iso,
    gazetteer: () => (gazetteer ??= { places: places.all, aliases: places.aliases(), countries: world.countries }),
    jumpTo,
    home: () => ({ lat: spawn.lat, lon: spawn.lon, name: places.nearest(unitAt(spawn.lat, spawn.lon, chatPoint)).place.name }),
    joinPlayer: joinPeer,
    time,
    // Held where you stand until `auto` hands it back to the model.
    weather: (wanted) => {
      weather.force(wanted === 'auto' ? null : wanted);
      return true;
    },
    emote: gesture,
    photo: () => {
      photoWanted = true;
    },
    sound: () => (voices.chat && audio.output !== null && audio.bus !== null ? { context: audio.output.context, node: audio.bus } : null),
    lockTarget: renderer.domElement,
    onOpen: () => {
      if (map.open) map.hide(false);
    },
  });

  /** The last fade, so `atlas.flags()` can report what is actually on screen. */
  let overlayFade = 0;

  function resize(): void {
    renderer.setPixelRatio(pixelRatioFor(resolution));
    renderer.setSize(innerWidth, innerHeight);
    post.setSize(innerWidth, innerHeight);
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
  function toSolarSystem(): void {
    saveLastPlace();
    try {
      sessionStorage.setItem(TO_SYSTEM_KEY, '1');
    } catch {
      // Without it the page comes back to the title, which is still the way in.
    }
    const cover = document.createElement('div');
    cover.style.cssText = 'position:fixed;inset:0;z-index:40;opacity:0;transition:opacity 0.35s ease;background:radial-gradient(circle at 50% 42%,#fff2e8 0 35%,#fde6e1 100%)';
    document.body.appendChild(cover);
    void cover.offsetWidth;
    cover.style.opacity = '1';
    // Every parameter kept but the one that skips the menu.
    const next = new URL(location.href);
    next.searchParams.delete('at');
    window.setTimeout(() => location.assign(next.toString()), 380);
  }
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
  title?.dispose();
  frontSettings.hide();
  frontSettings.root.remove();


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
  /** The landmark whose card came up last, until you walk off from it. */
  let landmarkHere: string | null = null;

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
  /**
   * What each guarded subsystem costs a frame, in milliseconds, smoothed over
   * about a second: `atlas.timings()`. Two clock reads a subsystem a frame,
   * which is nothing next to what any of them does.
   */
  const timings = new Map<string, number>();
  function guard(name: string, run: () => void): void {
    const began = performance.now();
    try {
      run();
      const spent = performance.now() - began;
      const was = timings.get(name);
      timings.set(name, was === undefined ? spent : was + (spent - was) * 0.05);
    } catch (error) {
      const count = failures.get(name) ?? 0;
      if (count === 0) console.error(`atlas: ${name} failed, and the rest of the world carries on`, error);
      failures.set(name, count + 1);
    }
  }

  // The ear's slow answers, refreshed twice a second in the loop.
  let soundClock = 0;
  /** The slow questions have been asked again, and the music has not heard them. */
  let musicDue = false;
  const soundPoint = new THREE.Vector3();
  const soundBiome: BiomeSample = biomeSample();
  /** What the small life is told each frame, filled in place (`ambient.ts`). */
  const ambientFrame = {
    player: player.position, cameraHeight: 0, time: sky.state.time, daylight: 1, afloat: false,
  };
  const ambientWeather = () => weather.here();
  let soundCold = false;
  let soundSea = 0;
  let soundWild = 1;
  let soundWildTarget = 1;
  let mapWasOpen = false;

  /** What the soundscape is handed each frame (`audio.update`), filled in place. */
  const soundscape: Soundscape = { mode: 'foot', speed: 0, throttle: 0, height: 0, sea: 0, daylight: 1, wild: 0, cold: false, rain: 0, gale: 0, underwater: 0 };

  function frame(now: number): void {
    requestAnimationFrame(frame);
    // **A tab left open on the pause card draws at about 30 frames a second**
    // after a minute with nobody at it: the GPU of a laptop left on a desk is
    // somebody's battery. Any input is back to full rate on the next frame.
    const idle = !input.looking && now - input.lastActive > IDLE_AFTER_MS;
    if (idle && now - previous < IDLE_FRAME_MS) return;
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
    // In a rocket the lens is the launch's and the body is in it: no aim, no walk.
    const inRocket = launchPads.riding;
    if (inRocket === null) rig.aim(dt, input.state, player);
    // `E`, before the player moves: on with the conversation you are in, or
    // to the person nearer than any seat, or into the vehicle beside you, or
    // out of the one you are in, so this frame already drives or walks.
    if (input.state.use) {
      if (inRocket !== null) leaveRocket();
      else if (talk.open) {
        talk.next();
        audio.cue(talk.open ? 'ui-click' : 'ui-close');
      } else if (talkOffer !== null) startTalk(talkOffer);
      else if (player.sitting) player.stand();
      else if (benchOffer !== null) sitDown(benchOffer);
      else if (rocketOffer !== null) boardRocket(rocketOffer);
      else if (fleet.prompt === null && fleet.current() === null && player.mode === 'foot' && trafficBeside()) {
        // Nothing to take, and a car beside you with its driver at the wheel:
        // say so, calmly, rather than leave the key doing nothing.
        announce('Someone is driving that one', modeIcon('car'));
      } else fleet.use();
    }
    // The drawn land round the player, while the ground is near enough to
    // matter: a slice a frame when he has moved on. Not at cruise, where it
    // would gather again every 400 units for nothing.
    if (player.position.length() - groundAt(player.position) < PROBE_CEILING) landProbe.prepare(player.position);
    if (launchPads.riding === null) {
      player.update(dt, {
        move: input.state.move,
        run: input.state.run,
        jump: input.state.jump,
        heading: rig.steer,
      });
      // The sea kept out of the submarine the player is in (`seaHull`), round
      // the axis of its cabin's own lining, so the waterline does not run
      // through the cabin while it floats at the surface.
      {
        const ride = player.ride;
        const cabin = ride?.model.kind === 'submarine' ? player.object.getObjectByName('cabin') : undefined;
        if (ride !== null && cabin?.parent != null) {
          // In the frame the hull is built in, which the springs carry; the
          // seats say where `finish` has centred it.
          const frame = cabin.parent;
          frame.updateWorldMatrix(true, false);
          const front = ride.model.seats[0]!.z;
          SUB_DRY.stations.forEach(([z, r], i) => {
            seaHull.uHull.value[i]!.set(0, SUB_DRY.y, front + z).applyMatrix4(frame.matrixWorld);
            seaHull.uHullR.value.setComponent(i, r);
          });
        } else seaHull.uHullR.value.set(0, 0, 0, 0);
      }
      rig.follow(dt, player, cameraGroundAt);
    } else launchPads.frame(rig.camera, dt);
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
    // After the sky, whose clock and daylight it reads, and before the haze
    // below, which it closes in rain and fog (`setWeatherHaze` in `view.ts`).
    // What it does to the light is applied by the sky's next `update`.
    guard('weather', () => weather.update(dt, sky.state.time, player.position, ground, rig.camera, sky.state.daylight));

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
      // Snow on the ground is snow underfoot, the season's or a fall's.
      soundCold = soundBiome.id === 'ice' || soundBiome.id === 'tundra' || weather.here().lying > 0.5;
      footing = inTown ? 'paving' : soundCold ? 'snow' : soundBiome.id === 'desert' || soundBiome.id === 'rock' ? 'dirt' : 'grass';
      soundSea = player.state === 'swim' || player.ride?.model.medium === 'water'
        ? 1
        : Math.max(0, 1 - shoreDistance(at.lat, at.lon) / SEA_EARSHOT);
      soundWildTarget = inTown ? 0 : 1;
      // A road is paved as a town is, for the dust off a wheel.
      effects.setGround(inTown || madeHeightAt(player.position) > 0, soundBiome.id);
      if (music !== null) {
        // Where the music thinks you are: the country (0 is the sea), the
        // town, the hour a raga keeps to, and the nearest place, which seeds it.
        const index = world.countryAtPoint(player.position);
        const country = index > 0 ? world.countries[index - 1]! : null;
        const nearby = places.nearest(player.position);
        musicMoment.iso = country?.iso ?? '';
        musicMoment.continent = country?.continent ?? '';
        musicMoment.lat = at.lat;
        musicMoment.lon = at.lon;
        musicMoment.town = inTown;
        musicMoment.place = nearby.index;
        musicMoment.hour = Number.parseInt(clockAt(sky.state.time, musicMoment.iso, at.lon, at.lat, nearby.place), 10);
        musicDue = true;
      }
    }
    soundWild += (soundWildTarget - soundWild) * Math.min(1, dt * 0.8);
    const speedNow = player.velocity;
    // What is heard is the vehicle, whoever drives it: a passenger hears the
    // engine too.
    const soundKind = player.ride?.model.kind ?? null;
    const soundMode = soundKind === null ? (player.state === 'swim' ? 'swim' : 'foot') : SOUND_OF[soundKind];
    if (music !== null) {
      const tune = music;
      if (musicDue) {
        musicDue = false;
        musicMoment.mode = soundKind === null ? (player.state === 'swim' ? 'swim' : 'foot') : MUSIC_OF[soundKind];
        musicMoment.height = eyeOverGround;
        musicMoment.daylight = sky.state.daylight;
        guard('music', () => tune.observe(musicMoment));
      }
      guard('music', () => tune.update());
    }
    // One record, written over each frame: `audio.update` reads it and keeps nothing of it.
    soundscape.mode = soundMode;
    soundscape.speed = speedNow;
    soundscape.throttle =
      soundMode === 'plane'
        ? player.airborne
          ? (speedNow - PLANE_CRUISE_LOW * 0.55) / (PLANE_CRUISE_HIGH - PLANE_CRUISE_LOW * 0.55)
          : speedNow / PLANE_CRUISE_LOW
        : soundKind !== null
          ? speedNow / topSpeedOf(soundKind)
          : 0;
    soundscape.height = eyeOverGround;
    soundscape.sea = soundSea;
    soundscape.daylight = sky.state.daylight;
    soundscape.wild = soundWild;
    soundscape.cold = soundCold;
    // The rain's drum is on the surface, not under it.
    soundscape.rain = sea.underwater ? 0 : weather.sound.rain;
    soundscape.gale = weather.sound.gale;
    soundscape.underwater = sea.underwater ? 1 : 0;
    guard('audio', () => audio.update(dt, soundscape));
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
    // the player can see changes, which is exactly the failure that produced
    // the knob. `detailFog` opens it linearly, anchored at the default, so a
    // step of the setting is a step of what you see (`view.ts`).
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
    // Floored at `STREAM_FLOOR`: on foot the lens is at eye level now, three
    // units off the ground, and the horizon from there is a third of the one
    // the haze and every streamer's reach were tuned against.
    const altitude = Math.max(STREAM_FLOOR, eyeOverGround + HAZE_ELEVATION * elevation);
    const horizon = Math.sqrt(2 * PLANET_RADIUS * altitude);
    // `fogFar` rather than the expression it used to be, because the streamers
    // cap their own reach against the same number and two copies of it is how a
    // forest ends at a distance the haze has already hidden — or, worse, how a
    // forest stops short of it.
    fog.far = fogFar(altitude, PLANET_RADIUS);
    // The near edge follows the far one in when the weather closes it: a fog
    // that kept the clear day's near edge would be a wall, not a fog.
    fog.near = Math.min(horizon * 0.2, fog.far * 0.3);

    // The near plane rides the camera's distance to the player, for the same
    // reason the fog rides altitude. The far plane sits at ten planet radii, so
    // a fixed near of 5 leaves a 32,000:1 depth range; from orbit the 20 units
    // between a cliff top and the sea then fall inside a single depth step and
    // every coastline starts z-fighting. Nothing is ever drawn closer than the
    // avatar, so near can grow with that distance instead.
    //
    // **In first person in a seat it is held at `COCKPIT_NEAR`**: the eye is
    // inside a cabin now (`craft/cabin.ts`), the roof's lining a third of a
    // unit over it and the wheel and the hands two thirds of one ahead, while
    // the rule above, reading the eye's height over the vehicle's origin,
    // gives 0.43 and cut the lining open over the head. A tenth of the depth
    // range is the price, which at the ground's haze is a few units at 3 km.
    const inCab = rig.firstPerson && player.ride !== null;
    const near = inCab ? COCKPIT_NEAR : Math.min(500, Math.max(0.25, rig.camera.position.distanceTo(player.position) * 0.15));
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
    guard('monuments', () => monuments.update(player.position, altitude, rig.camera, sky.state.time));
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
    // Round the camera, after the vegetation, whose keepouts it asks; not
    // under the sea, and nothing from the air.
    guard('grass', () =>
      grass.update({
        camera: rig.camera,
        player: player.position,
        press: pressOf(player, grassPress),
        height: eyeOverGround,
        wind: weather.here().wind,
        hidden: sea.underwater,
      }),
    );
    guard('country', () => countryMotion.update(dt, rig.camera.getWorldPosition(countryEye), vegetation));

    // After the roads, because a vehicle drives on one and the road under it
    // should have arrived first — and **on the world's clock rather than the
    // machine's**: every mover is a pure function of `sky.state.time`, so
    // `atlas.sky.setRate(600)` runs the traffic with the sun and `setTime`
    // scrubs it. Seconds, because that is what a speed is in.
    guard('life', () => life.update(player.position, altitude, rig.camera, sky.state.time.getTime() / 1000));
    guard('air', () =>
      airTraffic.update({
        dt,
        seconds: sky.state.time.getTime() / 1000,
        camera: rig.camera,
        player: player.position,
        altitude,
        fogFar: fog.far,
        daylight: sky.state.daylight,
      }),
    );
    if (railway !== null) {
      guard('railway', () =>
        railway.update({ dt, seconds: sky.state.time.getTime() / 1000, camera: rig.camera, player: player.position, fogFar: fog.far }),
      );
    }
    // The streamers' building ends here, and what it cost is what the next
    // frame's far work is charged with (`endFrameBuild` in `view.ts`).
    endFrameBuild();
    passingVoices.prop = airTraffic.passing.prop;
    passingVoices.rotor = airTraffic.passing.rotor;
    passingVoices.jet = airTraffic.passing.jet;
    passingVoices.rail = railway?.passing ?? null;
    guard('passing', () => passingSound.update(audio.bus, passingVoices));
    // The people standing in the towns: their own clock rather than the sky's,
    // because breathing does not speed up when `setRate` runs the sun at 600x.
    townsfolkClock += dt;
    guard('townsfolk', () => townsfolk.update(player.position, dt, townsfolkClock, ++townsfolkFrame));
    // The conversation, after whoever is in it has moved: it ends when they
    // are gone or you have walked off or got into something, and otherwise
    // holds them facing you with the bubble over their head.
    guard('talk', () => {
      const speaker = talk.with;
      if (speaker === null) {
        if (engaged) townsfolk.engage(null);
        engaged = false;
        return;
      }
      if (
        player.mode !== 'foot' ||
        !townsfolk.crownOf(speaker, talkCrown) ||
        talkCrown.distanceTo(player.position) > TALK_LEAVE
      ) {
        talk.close();
        townsfolk.engage(null);
        engaged = false;
        return;
      }
      engaged = townsfolk.engage(speaker, player.position);
      talk.place(talkCrown, rig.camera, innerWidth, innerHeight);
    });
    // The vehicles after everything they stand on, and before the other
    // players, who may be sitting in one of them.
    guard('fleet', () => fleet.update(dt, rig.camera));
    // The rockets beside the airstrips: streamed round the player, lit by
    // `Space` held in the one he is in, now and then by nobody; and the
    // curtain over the end of his launch, and the solar system under it.
    guard('rockets', () => {
      launchPads.update({
        dt,
        player: player.position,
        listener: rig.camera.position,
        hold: input.state.climb || rocketHeld,
        effects,
        sound: rocketSoundOf(),
      });
      const ride = launchPads.riding;
      // Off the pad `E` gets nobody out: the keys it offered go with the clamps.
      if (rocketKeysUp && ride !== null && ride.state !== 'boarded') {
        rocketKeysUp = false;
        hud.showKeys(null);
      }
      if (ride === null || ride.curtain <= 0) return;
      if (rocketCurtain === null) {
        rocketCurtain = document.createElement('div');
        rocketCurtain.style.cssText = 'position:fixed;inset:0;z-index:40;pointer-events:none;background:radial-gradient(circle at 50% 42%,#fff2e8 0 35%,#fde6e1 100%)';
        document.body.appendChild(rocketCurtain);
      }
      rocketCurtain.style.opacity = ride.curtain.toFixed(3);
      if (ride.curtain >= 1 && !rocketGone) {
        rocketGone = true;
        toSolarSystem();
      }
    });
    if (peers !== null) guard('peers', () => peers.update(dt, player));
    // A horn held is let go with the seat or the keyboard, and others' follow their players.
    guard('horns', () => {
      const now = performance.now();
      hornKey.update(now, hornInHand());
      hornChorus.update(now, hornNear);
    });
    // After everything that moves, so a wake starts where the boat now is.
    guard('effects', () => effects.update(dt, player, rig.camera));
    ambientFrame.cameraHeight = eyeOverGround;
    ambientFrame.time = sky.state.time;
    ambientFrame.daylight = sky.state.daylight;
    ambientFrame.afloat = player.state === 'swim' || player.ride?.model.medium === 'water';
    guard('ambient', () => ambient.update(dt, ambientFrame, ambientWeather));

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
    // After the fog is set, which under the surface it takes over, and after
    // the ocean, whose window it opens.
    guard('sea', () => {
      seaFrame.player = player.position;
      seaFrame.camera = rig.camera.position;
      seaFrame.daylight = sky.state.daylight;
      sea.update(dt, seaFrame);
      // Under the surface the sphere and the ribbon are seen from inside,
      // where their fills are culled and their ink is not: the pen would
      // draw the whole underside of the sea as a black ceiling. So they go
      // while the camera is down, and the water drawn over the floor, which
      // has no ink, is the surface seen from below.
      if (sea.underwater !== oceanHidden) {
        oceanHidden = sea.underwater;
        ocean.group.visible = !oceanHidden;
        // Nor does it rain under the sea: the drops are a box round the lens,
        // drawn without the fog, and fell round a diver as they did ashore.
        weather.group.visible = !oceanHidden;
      }
    });
    guard('sea life', () => {
      seaLifeFrame.camera.copy(rig.camera.position);
      seaLifeFrame.seconds = sky.state.time.getTime() / 1000;
      const diving = player.state === 'swim' && player.depth > 0.6;
      seaLifeFrame.diver = diving
        ? diverHead.copy(player.position).addScaledVector(player.forward, AVATAR_HEIGHT * 0.3).addScaledVector(player.up, -player.sink * 0.5)
        : null;
      const sub = player.ride?.model.kind === 'submarine' && player.depth > 1.2 ? player.ride.model : null;
      seaLifeFrame.screw = sub !== null ? subScrew.copy(player.position).addScaledVector(player.forward, -sub.size[0] * 0.5) : null;
      seaLifeFrame.screwSpeed = sub !== null ? player.velocity : 0;
      seaLife.update(dt, seaLifeFrame, eachSeaLife);
    });

    // A landmark says what it is as you walk up to it, out of a vehicle — on
    // foot or swimming up to a lighthouse — quietly and once each time you
    // come: nothing is counted and nothing is kept. Walking off half as far
    // again lets it say so the next time. A distance test per monument.
    if (player.state !== 'seated') {
      const near = monuments.landmarkNear(player.position);
      if (near !== null && near.id !== landmarkHere) {
        landmarkHere = near.id;
        // The country of the landmark rather than the country under your feet:
        // the Sphinx sits 1.5 units from the Pyramids, and a few stand on a
        // shore, so the ground you are on is not reliably theirs.
        const owner = world.countries.find((c) => c.iso === near.iso);
        hud.showLandmark({
          name: near.name,
          iso: near.iso,
          country: owner?.name ?? near.iso,
          height: near.height,
          year: near.year,
          note: near.note,
        });
      } else if (near === null && landmarkHere !== null && monuments.landmarkNear(player.position, LANDMARK_RANGE * 1.5) === null) {
        landmarkHere = null;
      }
    }
    // The HUD's two per-frame questions, both cached on its side: how you are
    // travelling, which decides the keys it shows, and whether the mouse is
    // free with nothing else on the screen, which is the pause card.
    hud.setMode(player.mode, player.airborne, rig.firstPerson, fleet.stranded);
    const offer = fleet.prompt;
    // Somebody to talk to wins over a seat when they are the nearest.
    const afoot = !talk.open && player.mode === 'foot' && !player.airborne;
    const talker = afoot ? townsfolk.nearest(player.position, TALK_REACH) : null;
    const talkGap = talker === null ? Infinity : talker.distance - PERSON_RADIUS;
    talkOffer = talker !== null && (offer === null || talkGap < offer.gap) ? talker.key : null;
    // A bench nearer than any seat, with nobody to talk to.
    const bench = talk.open || talkOffer !== null || player.sitting || player.mode !== 'foot' || player.airborne ? null : nearestBench();
    benchOffer = bench !== null && (offer === null || bench.distance < offer.gap) ? bench.bench : null;
    // A parked rocket nearer than any of those: the worlds' prompt.
    const rocketNear = talkOffer !== null || benchOffer !== null || talk.open || !afoot || player.sitting ? null : launchPads.offer(player.position);
    rocketOffer = rocketNear !== null && (offer === null || rocketNear.gap < offer.gap) ? rocketNear.rocket : null;
    const riding = launchPads.riding;
    if (riding !== null) hud.setPrompt(riding.state === 'boarded' ? 'Get out' : null, 'walk');
    else if (talk.open) hud.setPrompt(null);
    else if (talkOffer !== null) hud.setPrompt('Talk', 'talk');
    else if (player.sitting) hud.setPrompt('Stand up', 'walk');
    else if (benchOffer !== null) hud.setPrompt('Sit', 'seat');
    else if (rocketOffer !== null) hud.setPrompt('Board the rocket', 'sparkle');
    else hud.setPrompt(offer === null ? null : offer.label, modeIcon(offer?.model.kind ?? null));
    hud.setPaused(!input.looking && !map.open && !settings.open && !traveller.open && !chat.open && !passportCard.open, input.dragging);
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
      void hud.welcome();
    }
    // Where you are, asked once and handed to both the disc and the chip.
    // Every frame, not throttled: `countryAtPoint` is 2 us and the nearest
    // place is a scan of 9,749 dot products, which is another 10 (10.4 us,
    // measured 2026-09-21). The disc frames itself on the first and names the
    // second; the chip's own debounce — a country has to hold before it counts
    // as an arrival — lives in the HUD.
    const standingIn = world.countryAtPoint(player.position);
    const nearbyPlace = places.nearest(player.position);
    if (peers !== null) minimap.setPeers(peers.marks);
    guard('minimap', () =>
      minimap.update(player.position, player.forward, {
        country: standingIn,
        place: nearbyPlace,
      }, rig.heading),
    );
    guard('navigation', () => nav.update(dt, player, rig.camera));
    guard('players', () => playerList.update(dt));
    // Costs one branch while it is closed, which is nearly always.
    guard('map', () => map.update(player.position, player.forward));

    // The map layer, all three marks on one number. Nothing here touches a
    // buffer once the flag attribute is built: it is a uniform, an opacity, a
    // width and ten transforms.
    overlayFade = overlayOn ? smoothstep(OVERLAY_LOW, OVERLAY_HIGH, eyeOverGround) : 0;
    if (overlayFade > 0) askFlags();
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
    // animated herd, a townsman mid-gesture, a player waving or dancing, the
    // near wood in the wind — and
    // every 180 ms while nothing is, which is a slow crawl of the sun nobody
    // sees. It was 45 ms while the
    // player moved and 180 otherwise, the reference's numbers: at the run of
    // the time (90 units a second) the hero's shadow fell four units behind his feet before
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
      life.group.children.length +
      launchPads.group.children.length +
      (railway?.group.children.length ?? 0);
    const moving =
      player.velocity > 0 ||
      player.emoting !== null ||
      life.stats.nearestMoving < SHADOW_COVER ||
      townsfolk.stats.nearestMoving < SHADOW_COVER ||
      (railway !== null && railway.stats.nearestMoving < SHADOW_COVER) ||
      (peers !== null && peers.nearestMoving < SHADOW_COVER) ||
      // A rocket lighting or climbing, its own shadow going up the pad.
      launchPads.stats.nearestMoving < SHADOW_COVER ||
      // The wood round you, in the wind (`foliage.ts`): its shadows move with it.
      vegetation.stats.swaying;
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

    // The near street lamps, lit per pixel: in view space, so after the
    // camera has settled for the frame. See `NEAR_LAMPS` in `src/lights.ts`.
    guard('near lamps', () => {
      rig.camera.updateMatrixWorld();
      headlightCount = 0;
      if (sky.state.daylight < 0.6) {
        // Your own first, then whatever else is nearest the camera: the
        // traffic, and the vehicles other players drive. The lamps are each
        // model's own, lit as its kind says (`HEADLIGHTS_OF`).
        lampSources.length = 0;
        const ride = player.ride;
        const own = ride !== null && ride.seat === 0 ? headlampsOf(ride.model) : 0;
        if (own > 0) {
          const source = lampSource(-1)!;
          source.origin.copy(player.position);
          source.up.copy(player.up);
          source.ahead.copy(player.forward);
          source.side.crossVectors(player.up, player.forward).normalize();
          source.lamps = ride!.model.lamps!;
          source.across = 1;
          source.along = 1;
          source.strength = own;
        }
        life.eachRoadVehicle(visitTraffic);
        fleet.eachDriven(visitDriven);
        lampSources.sort(byLampDistance);
        // A vehicle whose lamps do not all fit is passed over, and a
        // bicycle's one lamp may still fit behind it.
        for (const source of lampSources) pushLamps(source);
      }
      setHeadlights(rig.camera, headlights, headlightCount);
      // The campfires near the camera light the ground round them after dark,
      // and their flames glow (`setFires`).
      const fireCount = sky.state.elevation > LAMPS_OFF_ABOVE ? 0 : countryMotion.fires(fires, MAX_FIRE_GLOWS, FIRE_GLOW_REACH);
      setFires(rig.camera, fires, fireCount, now / 1000);
      // By day no lamp is lit, so none is looked for (`LAMPS_OFF_ABOVE`).
      if (sky.state.elevation > LAMPS_OFF_ABOVE) setNearLamps(rig.camera, nearLamps, 0);
      else {
        const townLamps = settlements.lampsNear(rig.camera.position, LAMP_FIELD, nearLamps);
        const roadLamps = roads.lampsNear(rig.camera.position, LAMP_FIELD, nearLamps, townLamps);
        // And the lamps round a landmark's square, which light its paving.
        setNearLamps(rig.camera, nearLamps, monuments.lampsNear(rig.camera.position, LAMP_FIELD, nearLamps, roadLamps));
      }
    });

    // The light through the air at a low sun (`shafts.ts`): the real sun, its
    // light as the mood and the weather leave it, and as strong as the hour,
    // the grey, the haze and the climb allow. Under the sea there is no sky.
    // Nothing nearer than the hero casts a ray, so his distance goes too.
    post.shafts.direction.copy(sky.state.sun);
    post.shafts.subject = rig.camera.position.distanceTo(player.position);
    shaftLight(sky.sun, post.shafts.color);
    post.shafts.strength = shaftStrength({
      elevation: sky.state.elevation,
      overcast: sky.weather.overcast,
      mist: sky.weather.mist,
      space: sky.state.space,
      underwater: sea.underwater,
    });

    // The sheet behind `M` is opaque and covers the window, so the world under
    // it is not drawn: that frame goes to painting the map's tiles instead.
    const underMap = map.open;
    const drawStart = performance.now();
    if (!underMap) post.render(scene, rig.camera);
    const drawEnd = performance.now();
    // In the same task as the draw, before the browser composites and clears
    // the drawing buffer: `toBlob` copies the canvas as it stands when it is
    // called, so no `preserveDrawingBuffer` is needed for it.
    // A frame under the map draws nothing, and the buffer it would copy is
    // whatever the browser left there.
    if (photoWanted) {
      photoWanted = false;
      if (underMap) announce('Close the map to take a photo', 'camera');
      else savePhoto(renderer.domElement);
    }
    updateSum += drawStart - frameStart;
    drawSum += drawEnd - drawStart;
    // The automatic detail knob: the interval and the work of this frame
    // (`sampleFrame` in `view.ts`). Not before the curtain is up.
    // Nor while the map is up: a frame with no draw would read as headroom.
    // Nor while the loop idles on the pause card at half rate on purpose.
    if (curtain === null && !underMap && !idle) sampleFrame(interval, drawEnd - frameStart);
    else if (curtain === null) skipFrame();

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
    // never absent. Guarded like the world's own updates: `Intl` throws on a
    // date it cannot format, and a throw here would be one every frame.
    const here = toLatLon(player.position);
    guard('hud', () => hud.update(
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
      // three times.
      bearingTo(
        player.position,
        player.forward,
        nearbyPlace.place.lat,
        nearbyPlace.place.lon,
      ),
    ));
    // The passport, after the chip: a candidate from the HUD's arrival is
    // stamped once you are down in its country, and a town counts once you
    // are inside it.
    guard('passport', () => {
      passportMoment.iso = standingIn > 0 ? world.countries[standingIn - 1]!.iso : '';
      passportMoment.aloft = player.airborne;
      passportMoment.mode = player.mode;
      passportMoment.time = sky.state.time;
      passportMoment.lat = here.lat;
      passportMoment.lon = here.lon;
      passportMoment.town.index = nearbyPlace.index;
      passportMoment.town.name = nearbyPlace.place.name;
      passportMoment.town.iso = nearbyPlace.place.iso;
      passportMoment.town.inside = nearbyPlace.inside;
      passport.observe(passportMoment);
    });
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
      // `atlas.peers.stats`: the relay's state, our id, who is connected.
      peers,
      // `atlas.chat.show('/help')` opens it with that typed; `atlas.chat.stats`
      // counts the lines held, heard and said, and who is muted.
      chat,
      player,
      /**
       * How you look: `atlas.traveller.show()` opens the card,
       * `atlas.traveller.code()` is what the others are sent, and
       * `atlas.traveller.wear('a1...')` dresses the hero in a code — one off
       * `/sheets/cast.html`, say — as the card would.
       */
      traveller: {
        show: () => traveller.show(),
        code: () => encodeAppearance(heroAppearance()),
        wear: (code: string) => {
          const appearance = decodeAppearance(code);
          if (appearance === null) return false;
          void dressHero(appearance);
          peers?.setLook(encodeAppearance(appearance));
          return true;
        },
      },
      /**
       * The vehicles: `atlas.fleet.stats` (sites worked out by kind, built,
       * moved, what you are in), `atlas.fleet.nearest('boat')` for the nearest
       * launch, and `atlas.fleet.board(id)` to be put beside one and in it —
       * with no id, the nearest of anything. `atlas.fleet.sites.all()` works
       * out the whole planet's, which takes seconds.
       */
      fleet,
      /**
       * The rockets beside half the airstrips: `atlas.rockets.pads.padsNear(dir, r, [])`
       * says where they stand, `.standing()` the ones built round you,
       * `.board()` gets in the nearest as `E` does, `.launch()` lights the
       * nearest nobody is in, and `.stats` the streamer.
       */
      rockets: {
        pads: padIndex,
        standing: () => launchPads.standing(),
        get stats() {
          return launchPads.stats;
        },
        board: (rocket?: Rocket) => {
          const nearest = rocket ?? launchPads.standing().sort((a, b) => a.position.distanceTo(player.position) - b.position.distanceTo(player.position))[0];
          if (nearest !== undefined) boardRocket(nearest);
        },
        launch: (rocket?: Rocket) => {
          const nearest = rocket ?? launchPads.standing().filter((one) => one.state === 'parked').sort((a, b) => a.position.distanceTo(player.position) - b.position.distanceTo(player.position))[0];
          return nearest?.autolaunch() ?? false;
        },
        leave: () => leaveRocket(),
        /** Holds `Space` for the player in the rocket he is in: the launch, through to the solar system. */
        ignite: () => (rocketHeld = launchPads.riding !== null),
      },
      rig,
      scene,
      // `atlas.sky.setTime('2026-09-04T05:20:00Z')` freezes the world at that
      // instant and keeps it running from there; `atlas.sky.setRate(600)` runs
      // ten minutes a second, which is how you watch a dawn without waiting.
      // `atlas.sky.state.limit` is the faintest magnitude the night shows now.
      sky,
      /**
       * The stars and the planets, or `null` before they have come:
       * `atlas.night.stats` is how many stars were drawn and at what limit,
       * and each planet's magnitude; `atlas.night.points.visible = false` is
       * the A/B switch. See `night-sky.ts`.
       */
      get night() {
        return nightSky;
      },
      input,
      renderer,
      // The effect, not just the renderer: a frame here is two passes, so
      // timing one `renderer.render` measures half the cost. `atlas.outline`
      // plus `gl.finish()` is how the settlement budget was measured, because
      // `stats.frameMs` is a rolling average of frames a hidden tab never ran.
      outline,
      /**
       * The frame after the scene: `atlas.post.exposure`, `.bloom.strength`,
       * `.uniforms` for the grade. `atlas.post.shafts.override = 0` takes the
       * light shafts out of a dusk and `delete atlas.post.shafts.override` puts
       * them back; `atlas.post.stats.shafts` says whether they drew.
       */
      post,
      /** The ink's two passes: `atlas.ink(true)` puts the outlines back, `atlas.ink()` reads it. */
      ink(on?: boolean) {
        if (on !== undefined) setInk(on);
        return inked;
      },
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
      air: airTraffic,
      railway,
      // `atlas.townsfolk.stats`: the people standing in the near towns, how
      // many are animated this frame and how many are strolling.
      townsfolk,
      // `atlas.talk.script('<key>', where)` is a conversation's lines without
      // the bubble; `atlas.talk.with` is who you are talking to.
      talk,
      // `atlas.effects.stats`: the puffs, foam discs and debris alive, what a
      // full pool refused, the other vehicles followed, the draw calls and the
      // update's cost. `atlas.effects.burst('crash' | 'splash' | 'dust' |
      // 'ripple')` makes one where you stand; `.enabled = false` is the A/B.
      effects,
      // Which subsystems have thrown inside the loop, and how many times: see `guard`.
      failures,
      // `atlas.timings()`: milliseconds a frame each guarded subsystem costs,
      // smoothed, the dearest first.
      timings: () => Object.fromEntries([...timings].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, Number(v.toFixed(3))])),
      // `atlas.audio.stats`: whether the context is unlocked and running, how
      // many recordings arrived, and how many voices are sounding.
      audio,
      // `atlas.music.stats`: the style, whether a piece is playing or the
      // music is resting, the phrase, the voices and when it next changes.
      // `atlas.music.play('japan')` forces a style for review (it starts at
      // once), `atlas.music.play()` hands it back to the map, and
      // `atlas.music.styles` lists them.
      music: {
        get stats() {
          return music?.stats ?? { loaded: false, loading: musicLoading, on: musicSettings.on };
        },
        get styles() {
          return ['iberia', 'latin', 'brazil', 'andes', 'north-america', 'atlantic-folk', 'nordic', 'east-europe', 'mediterranean', 'maghreb', 'middle-east', 'sub-saharan', 'south-asia', 'east-asia', 'japan', 'southeast-asia', 'oceania', 'polar', 'sea', 'sky'];
        },
        play(style?: string | null): string {
          if (music !== null) return music.play(style);
          musicAsked = style ?? null;
          loadMusic();
          return audio.output === null
            ? 'The sound is not open yet: click in the world once, then ask again.'
            : musicSettings.on ? 'Loading the music; it will start in a moment.' : 'Music is off in Settings.';
        },
      },
      // `atlas.vegetation.stats` counts tiles, plants and triangles by level;
      // `atlas.vegetation.sample(lat, lon, level)` builds one tile and reports
      // what it cost, and `.verify(lat, lon)` builds it twice and compares.
      vegetation,
      // `atlas.grass.stats`: the rings, the fields and what their bake costs;
      // `atlas.grass.enabled = false` is the A/B, `atlas.grass.height` a multiplier.
      grass,
      // `atlas.countryside.stats` is what the country between the towns holds
      // standing and what turns in it; `atlas.countryside.find('windmill')`
      // is the nearest one to you (`farm`, `turbines`, `lighthouse`, `shrine`,
      // `stones`, `ruin`, `camp`, `fishing`, `oasis`, `cairn`), and
      // `atlas.countryside.plan()` what the cell you stand in holds.
      countryside: {
        get stats() {
          return { ...vegetation.stats.country, motion: countryMotion.stats };
        },
        find: (kind: FeatureKind, reach = 4) => {
          const here = toLatLon(player.position);
          return vegetation.countryside?.find(kind, here.lat, here.lon, reach) ?? null;
        },
        plan: () => {
          const here = toLatLon(player.position);
          const plan = vegetation.countryside?.planAt(here.lat, here.lon);
          return plan === undefined ? null : { key: plan.key, kind: plan.kind, region: plan.style.id, pieces: plan.pieces.map((piece) => piece.part), fields: plan.fields.map((field) => field.crop), fences: plan.lines.length, meadows: plan.meadows.length };
        },
        motion: countryMotion,
      },
      // `atlas.clouds.stats` is the deck's cost: cells kept, coverage,
      // triangles, chunks and the build. `atlas.clouds.group.visible = false`
      // is the A/B. `atlas.clouds.shadows = 0` takes the deck's shade off
      // the ground and puts back the old cut of the whole world's sun under a
      // bank (`cloud-shade.ts`), 1 is the shade; `atlas.clouds.shade` is its
      // bake's progress and cost and the strength the shaders have.
      clouds,
      // `atlas.weather.here()`: what the weather is where you stand — its kind,
      // how strong, the temperature, the wind, the deck's shade on you
      // (`shade`, the share of the sun it takes). `force('storm' | 'rain' |
      // 'snow' | 'fog' | 'drizzle' | 'cloudy' | 'clear')` holds it there and
      // `force(null)` hands it back to the model; `at(lat, lon, when?)` asks
      // the model anywhere; `.enabled = false` is clear skies; `.stats`.
      weather,
      // `atlas.ambient.stats`: the fireflies, motes, butterflies, leaves, fish
      // and gulls drawn this frame, the cells in range, what has sent the
      // insects in (`quiet`), the autumn here, and the update's cost;
      // `atlas.ambient.snapshot()` every creature's position, sorted.
      ambient,
      // `atlas.sea.stats`: the sea floor near you — whether it is drawn, the
      // window the opaque sea steps aside in, tiles standing and building, the
      // decor, whether the camera is under the surface; `.enabled = false` is
      // the sea as it was. `atlas.seaLife.stats` counts the fish, the sharks,
      // rays and turtles, the dolphins and the whales drawn this frame, and
      // `atlas.seaLife.snapshot()` lists where each is.
      sea,
      seaLife,
      // `atlas.passport.data` is the book; `atlas.passport.show()` opens the
      // card, `atlas.passport.celebrate(atlas.passport.data.stamps[0])` drops
      // a stamp again, `atlas.passport.clear()` empties it on this device.
      passport: {
        get data() {
          return passport.data;
        },
        show: () => passportCard.show(),
        celebrate: (stamp: import('./passport.ts').Stamp) => passportCard.celebrate(stamp),
        clear: () => passport.clear(),
      },
      // `atlas.ocean.stats` is the sea's cost: the sphere's detail and its sag,
      // how many coastal spans the shallows are built from, triangles and MB.
      // `atlas.ocean.group.visible = false` is the A/B.
      ocean,
      // `atlas.lights.points.visible = false` is the A/B for the far field and
      // `atlas.brightness(0)` turns every emitting surface in the world off,
      // windows and lamps included, without touching the geometry.
      // `atlas.lights.flood` is the landmarks' floodlight, live: `.gain.value`
      // over every flood, `.cap.value` the per-channel ceiling (keep it under
      // the bloom's 0.92), `.warm.value` and `.cool.value` the two tints.
      // `atlas.monuments.night.sparkle = true` holds the Eiffel Tower's
      // sparkle on for review (`null` hands it back to Paris's clock), and
      // `atlas.monuments.night.stats` counts the red lights and plaza lamps.
      lights: Object.assign(cityLights, { flood: floodTuning }),
      brightness: lightBrightness,
      nav,
      map,
      placements,
      places,
      goTo(lat: number, lon: number) {
        jumpTo(lat, lon);
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
