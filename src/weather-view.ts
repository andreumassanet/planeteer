import * as THREE from 'three';
import { PLANET_RADIUS, UNITS_PER_DEGREE, groundWeather } from './globe.ts';
import { LAND_HEIGHT } from './geo.ts';
import { continentalityAt } from './biome.ts';
import { CLOUD_BASE, cloudShadeAt } from './clouds.ts';
import type { CloudShadeSample, Clouds } from './clouds.ts';
import { cloudShade, sunCutOf } from './cloud-shade.ts';
import type { Sky } from './sun.ts';
import { reliefAt } from './terrain.ts';
import { latLonOf, unitAt } from './sphere.ts';
import { setWeatherHaze } from './view.ts';
import { SCENERY_SCALE } from './stature.ts';
import { proxyOf } from './warm.ts';
import {
  STRIKE_CELL,
  STRIKE_ODDS,
  STRIKE_SLOT_MS,
  classify,
  seasonOf,
  strikeCandidate,
  weatherAt,
  weatherSample,
} from './weather.ts';
import type { Strike, WeatherKind, WeatherSample } from './weather.ts';

/**
 * The weather, drawn: what `weather.ts` says, made into rain and snow round
 * the camera, lightning and thunder, a wet or white ground, a grey sky and a
 * closer haze.
 *
 * **Three draw calls at most, and usually one or none.** The precipitation is
 * one mesh of quads that never moves on the CPU: every drop is a fixed seed in
 * a box, and the vertex shader wraps the box round the camera, drops it with
 * the fall and slants it with the wind, so a downpour costs a few uniforms a
 * frame and nothing is allocated. Rain is streaks along the fall, snow is
 * flakes facing you that sway; the same mesh draws either, and the count is a
 * draw range. The bolt is the second mesh, and the third call is its ink hull,
 * drawn only in the quarter-second a strike is showing.
 *
 * **It samples the model four times a second and eases between answers**, so
 * a front arrives over seconds and walking out from under a bank lets the rain
 * off gradually; a jump across the map (`goTo`, a join) snaps instead, so you
 * do not arrive in Singapore with London's drizzle still falling.
 *
 * **Lightning is the model's too**, not a timer here: `strikeCandidate` rolls
 * each cell of the sky once a slot of the clock, and a roll under the storm at
 * the point it names is a strike, at that point, at that instant, for every
 * client. What is local is only what a strike looks and sounds like from where
 * you are: the flash dims with distance, and the thunder arrives at the speed
 * of sound over the real metres between (`SCENERY_SCALE`), so a count of
 * seconds is a distance, the way it is outside.
 */

export interface WeatherHere {
  kind: WeatherKind;
  intensity: number;
  temperatureC: number;
  wind: { speed: number; from: number };
  cover: number;
  precipitation: number;
  snow: number;
  storm: number;
  fog: number;
  /** Snow on the ground: the season's and a fall's, whichever is deeper. */
  lying: number;
  /** The ground's wetness, 0 to 1. */
  wet: number;
  /**
   * How much of the sun the deck's shade takes where you stand, 0 to about
   * two thirds, as it is drawn: the bank between you and the sun
   * (`cloudShadeAt`), times the strength the shaders have this frame.
   */
  shade: number;
  forced: WeatherKind | null;
  enabled: boolean;
}

export interface WeatherView {
  group: THREE.Group;
  /**
   * Once a frame, after the sky: `ground` is the ground's radius under the
   * player, `daylight` the sky's.
   */
  update(dt: number, time: Date, player: THREE.Vector3, ground: number, camera: THREE.Camera, daylight: number): void;
  /** What the weather is where you stand, as it is drawn (eased, forced, or off). */
  here(): WeatherHere;
  /** The model itself at a place and an instant, for the console. */
  at(lat: number, lon: number, when?: Date | number): WeatherSample;
  /** Holds the weather where you stand at a kind until `force(null)`. */
  force(kind: WeatherKind | null): WeatherKind | null;
  /** Off is clear skies: no rain, no storms, no weather haze. The seasons' snow stays; it is the climate. */
  enabled: boolean;
  /** What the ear takes: rain on and round you, and how much of a gale. */
  readonly sound: { rain: number; gale: number };
  /** Called for each strike, with the seconds until its thunder arrives and how loud it is. */
  onThunder: ((delay: number, loudness: number) => void) | null;
  /** The two programs this draws with, for `warm.ts` to compile while the menu is up. */
  proxies(): THREE.Mesh[];
  readonly stats: {
    kind: WeatherKind;
    drops: number;
    snowing: boolean;
    strikes: number;
    pending: number;
    bolt: boolean;
    sampleMs: number;
  };
}

/** How often the model is asked, in seconds. */
const SAMPLE_EVERY = 0.25;
/** A move this far between two samples is a jump, and the weather snaps. */
const JUMP = 1500;

/** The most quads the mesh holds, and how many of them rain and snow use at full strength. */
export const MAX_DROPS = 6000;
const SNOW_SHARE = 0.55;
/** The box round the camera, in units: about 40 m of rain, 28 of snow. */
export const RAIN_BOX = 50;
export const SNOW_BOX = 36;
/** Metres a second: rain and snow falling, in still air. */
const RAIN_FALL = 9;
const SNOW_FALL = 1.1;
/** How much of the wind a drop takes sideways: rain little, snow nearly all. */
const RAIN_DRIFT = 0.45;
const SNOW_DRIFT = 0.8;
/** A streak's length and a streak's and a flake's least width, in units. */
const STREAK = 1.25;
const STREAK_WIDTH = 0.03;
const FLAKE = 0.11;
/** A drop's layer, 0 to 2, falls this much faster per layer, so the rain is not one sheet. */
const LAYER_SPEED = 0.18;
/** Past this far from the frame's anchor the box is re-based; see `rebase`. */
const REBASE = 4000;

/** How far off a strike is still drawn, and how far its flash and its thunder reach. */
const STRIKE_REACH = 5000;
/** The least time between two strikes seen, on the machine's clock: see `struckAt`. */
const STRIKE_GAP_MS = 600;
/**
 * How far a strike lights the scene: fully within `FLASH_NEAR`, fading out
 * by `FLASH_FAR`, about the haze's reach on the ground; past that only
 * `FLASH_DISTANT` of a flash, and only under a storm of one's own.
 */
const FLASH_NEAR = 700;
const FLASH_FAR = 2200;
const FLASH_DISTANT = 0.25;
/** The height the bolt comes out of, over the ground: the deck's base, less its swing. */
const BOLT_TOP = CLOUD_BASE * 0.85;
const BOLT_SEGMENTS = 16;
const BRANCH_SEGMENTS = 6;
const BOLT_SIDES = 4;
/** The speed of sound, m/s: the thunder's delay is the strike's metres over this. */
const SOUND_SPEED = 343;

/** Seconds a state takes to follow the model: slow enough that a front arrives, and a storm, whose heart passes in minutes, lingers. */
const EASE = { cover: 10, precipitation: 8, storm: 15, fog: 12, snow: 5, temperature: 20, wind: 5 } as const;
/** How fast the ground wets and dries, and how fast fresh snow lies and melts. */
const WETTING = 25;
const DRYING = 180;
const SETTLING = 40;
const MELTING = 200;

type Preset = Partial<Pick<WeatherSample, 'cover' | 'depth' | 'precipitation' | 'snow' | 'storm' | 'fog' | 'windSpeed'>>;
/** What `force(kind)` holds the weather at: a sky with no deck behind it. Exported for `pnpm weather`. */
export const PRESETS: Record<WeatherKind, Preset> = {
  clear: { cover: 0, depth: 0, precipitation: 0, snow: 0, storm: 0, fog: 0, windSpeed: 3 },
  cloudy: { cover: 1, depth: 0.3, precipitation: 0, snow: 0, storm: 0, fog: 0.1, windSpeed: 5 },
  fog: { cover: 0.6, depth: 0.2, precipitation: 0, snow: 0, storm: 0, fog: 1, windSpeed: 1 },
  drizzle: { cover: 1, depth: 0.45, precipitation: 0.22, snow: 0, storm: 0, fog: 0.3, windSpeed: 5 },
  rain: { cover: 1, depth: 0.8, precipitation: 0.7, snow: 0, storm: 0, fog: 0.4, windSpeed: 8 },
  storm: { cover: 1, depth: 1, precipitation: 1, snow: 0, storm: 1, fog: 0.5, windSpeed: 17 },
  snow: { cover: 1, depth: 0.8, precipitation: 0.75, snow: 1, storm: 0, fog: 0.55, windSpeed: 4 },
};

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * How grey the weather makes the sky and the haze, 0 to 1, from the cover,
 * the rain and the storm where you stand, fading as you climb through the
 * deck (`above`). Until 2026-09-30 it was also the cut of the whole world's
 * sun; that is `sunCutOf` now (`cloud-shade.ts`).
 */
export function overcastOf(weather: { cover?: number; precipitation?: number; storm?: number }, above: number): number {
  return clamp01((weather.cover ?? 0) * 0.3 + (weather.precipitation ?? 0) * 0.4 + (weather.storm ?? 0) * 0.4) * (1 - above);
}

const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** The share of the way to a target a state moves in `dt` against a time constant. */
const follow = (dt: number, tau: number): number => 1 - Math.exp(-dt / tau);
const mod = (x: number, m: number): number => ((x % m) + m) % m;

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DROP_VERTEX = /* glsl */ `
attribute vec4 seed;
attribute vec2 corner;
uniform vec3 uCamera;
uniform vec3 uEast;
uniform vec3 uUp;
uniform vec3 uNorth;
uniform vec3 uShift;
uniform float uLayer;
uniform float uBox;
uniform vec3 uFall;
uniform float uLength;
uniform float uWidth;
uniform float uSnow;
uniform float uClock;
varying float vFade;
varying vec2 vCorner;
void main() {
  vec3 local = seed.xyz * uBox + uShift;
  local.y -= seed.w * uLayer;
  local = mod(local + 0.5 * uBox, uBox) - 0.5 * uBox;
  // A flake wanders as it falls; a drop does not.
  local.x += uSnow * sin(uClock * 1.3 + seed.x * 40.0) * 0.4;
  local.z += uSnow * cos(uClock * 1.1 + seed.z * 40.0) * 0.4;
  vec3 world = uCamera + uEast * local.x + uUp * local.y + uNorth * local.z;
  vec3 toCamera = uCamera - world;
  float dist = max(length(toCamera), 1e-3);
  toCamera /= dist;
  vec3 fall = normalize(uEast * uFall.x + uUp * uFall.y + uNorth * uFall.z);
  // Looking straight up the fall, a streak has no side: take the frame's east.
  vec3 side = cross(fall, toCamera);
  side = length(side) < 1e-4 ? uEast : normalize(side);
  // A streak lies along the fall; a flake faces you.
  vec3 along = normalize(mix(fall, cross(toCamera, side), uSnow));
  // Never thinner than about a pixel and a half, or the far rain shimmers.
  float width = max(uWidth, dist * 0.0022);
  float length_ = mix(uLength, width, uSnow);
  world += side * corner.x * width + along * (corner.y - 0.5) * length_;
  vFade = (1.0 - smoothstep(0.3 * uBox, 0.5 * uBox, length(local))) * smoothstep(0.5, 1.8, dist);
  vCorner = corner;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}`;

const DROP_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uSnow;
varying float vFade;
varying vec2 vCorner;
void main() {
  float across = 1.0 - abs(vCorner.x);
  float streak = across * mix(0.2, 1.0, vCorner.y);
  float flake = 1.0 - smoothstep(0.45, 1.0, length(vec2(vCorner.x, vCorner.y * 2.0 - 1.0)));
  float alpha = mix(streak, flake, uSnow) * vFade * uOpacity;
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(uColor, alpha);
}`;

/** The drops: `MAX_DROPS` quads, a seed each, built once. */
export function dropGeometry(): THREE.BufferGeometry {
  const seeds = new Float32Array(MAX_DROPS * 4 * 4);
  const corners = new Float32Array(MAX_DROPS * 4 * 2);
  const index = new Uint16Array(MAX_DROPS * 6);
  const random = mulberry(0x5eed);
  for (let i = 0; i < MAX_DROPS; i++) {
    const sx = random();
    const sy = random();
    const sz = random();
    // An integer layer, so the layer's own wrap is a whole box and invisible.
    const layer = Math.floor(random() * 3);
    for (let c = 0; c < 4; c++) {
      const v = i * 4 + c;
      seeds.set([sx, sy, sz, layer], v * 4);
      corners[v * 2] = c === 0 || c === 3 ? -1 : 1;
      corners[v * 2 + 1] = c < 2 ? 0 : 1;
    }
    index.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 4));
  geometry.setAttribute('corner', new THREE.BufferAttribute(corners, 2));
  // Three wants a position to count vertices by; the shader never reads it.
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_DROPS * 4 * 3), 3));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.setDrawRange(0, 0);
  return geometry;
}

/**
 * Where a drop of a given seed is, relative to the camera, in the box's frame:
 * the vertex shader's first three lines, for the headless check.
 */
export function dropOffset(seed: readonly number[], shift: readonly number[], layer: number, box: number, out: number[]): number[] {
  for (let k = 0; k < 3; k++) {
    let v = seed[k]! * box + shift[k]!;
    if (k === 1) v -= seed[3]! * layer;
    out[k] = mod(v + 0.5 * box, box) - 0.5 * box;
  }
  return out;
}

/**
 * The bolt: a jagged square tube from the cloud base to the ground, with one
 * branch, written into a buffer that exists from the start. Each quad is wound
 * outward — checked against its own segment's axis, which is the one fact the
 * construction supplies — because the ink is a back-face hull and an inward
 * quad is a solid black blob. Returns how many quads had to be turned.
 */
export function writeBolt(
  positions: Float32Array,
  base: THREE.Vector3,
  up: THREE.Vector3,
  height: number,
  radius: number,
  seed: number,
): number {
  const random = mulberry(Math.floor(seed * 4294967296));
  const east = new THREE.Vector3().crossVectors(Y, up);
  if (east.lengthSq() < 1e-8) east.set(1, 0, 0);
  east.normalize();
  const north = new THREE.Vector3().crossVectors(up, east);
  const path: THREE.Vector3[] = [];
  let x = 0;
  let z = 0;
  for (let i = 0; i <= BOLT_SEGMENTS; i++) {
    const t = i / BOLT_SEGMENTS;
    if (i > 0 && i < BOLT_SEGMENTS) {
      x += (random() - 0.5) * height * 0.09;
      z += (random() - 0.5) * height * 0.09;
    }
    path.push(new THREE.Vector3().copy(base).addScaledVector(up, height * (1 - t)).addScaledVector(east, x).addScaledVector(north, z));
  }
  const fork = 3 + Math.floor(random() * 5);
  const branch: THREE.Vector3[] = [path[fork]!.clone()];
  const lean = random() * Math.PI * 2;
  for (let i = 1; i <= BRANCH_SEGMENTS; i++) {
    const last = branch[i - 1]!;
    branch.push(
      last
        .clone()
        .addScaledVector(up, -height * 0.055)
        .addScaledVector(east, Math.cos(lean) * height * 0.05 + (random() - 0.5) * height * 0.04)
        .addScaledVector(north, Math.sin(lean) * height * 0.05 + (random() - 0.5) * height * 0.04),
    );
  }
  let at = 0;
  let turned = 0;
  const axis = new THREE.Vector3();
  const u = new THREE.Vector3();
  const w = new THREE.Vector3();
  const ci = new THREE.Vector3();
  const cj = new THREE.Vector3();
  const p = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const n = new THREE.Vector3();
  const write = (v: THREE.Vector3): void => {
    positions[at++] = v.x;
    positions[at++] = v.y;
    positions[at++] = v.z;
  };
  const tube = (points: THREE.Vector3[], r0: number, r1: number): void => {
    for (let s = 0; s + 1 < points.length; s++) {
      const a = points[s]!;
      const b = points[s + 1]!;
      axis.subVectors(b, a).normalize();
      u.copy(Math.abs(axis.dot(up)) < 0.9 ? up : east).projectOnPlane(axis).normalize();
      w.crossVectors(axis, u);
      const ra = r0 + (r1 - r0) * (s / (points.length - 1));
      const rb = r0 + (r1 - r0) * ((s + 1) / (points.length - 1));
      for (let k = 0; k < BOLT_SIDES; k++) {
        const t0 = (k / BOLT_SIDES) * Math.PI * 2;
        const t1 = ((k + 1) / BOLT_SIDES) * Math.PI * 2;
        ci.copy(u).multiplyScalar(Math.cos(t0)).addScaledVector(w, Math.sin(t0));
        cj.copy(u).multiplyScalar(Math.cos(t1)).addScaledVector(w, Math.sin(t1));
        p[0]!.copy(a).addScaledVector(ci, ra);
        p[1]!.copy(a).addScaledVector(cj, ra);
        p[2]!.copy(b).addScaledVector(cj, rb);
        p[3]!.copy(b).addScaledVector(ci, rb);
        e1.subVectors(p[1]!, p[0]!);
        e2.subVectors(p[2]!, p[0]!);
        n.crossVectors(e1, e2);
        const outward = n.dot(ci.add(cj)) > 0;
        if (!outward) turned++;
        const order = outward ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
        for (const o of order) write(p[o]!);
      }
    }
  };
  tube(path, radius, radius * 0.55);
  tube(branch, radius * 0.6, radius * 0.25);
  return turned;
}

/** Vertices the bolt buffer holds: two triangles a side, a side a segment. */
export const BOLT_VERTICES = (BOLT_SEGMENTS + BRANCH_SEGMENTS) * BOLT_SIDES * 6;
const Y = new THREE.Vector3(0, 1, 0);

/**
 * Bakes `continentalityAt` into a 1-degree texture for the ground shader's
 * seasons: 64,800 samples of a bilinear field, a few milliseconds, once.
 */
function continentalTexture(): THREE.DataTexture {
  const width = 360;
  const height = 180;
  const data = new Uint8Array(width * height);
  for (let row = 0; row < height; row++) {
    const lat = -90 + row + 0.5;
    for (let col = 0; col < width; col++) {
      const lon = -180 + col + 0.5;
      data[row * width + col] = Math.round(continentalityAt(lat, lon) * 255);
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RedFormat, THREE.UnsignedByteType);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

export function createWeatherView(sky: Sky, clouds: Clouds): WeatherView {
  const group = new THREE.Group();
  group.name = 'weather';

  groundWeather.atlasContinental.value = continentalTexture();

  const uniforms = {
    uCamera: { value: new THREE.Vector3() },
    uEast: { value: new THREE.Vector3(1, 0, 0) },
    uUp: { value: new THREE.Vector3(0, 1, 0) },
    uNorth: { value: new THREE.Vector3(0, 0, 1) },
    uShift: { value: new THREE.Vector3() },
    uLayer: { value: 0 },
    uBox: { value: RAIN_BOX },
    uFall: { value: new THREE.Vector3(0, -1, 0) },
    uLength: { value: STREAK },
    uWidth: { value: STREAK_WIDTH },
    uSnow: { value: 0 },
    uClock: { value: 0 },
    uColor: { value: new THREE.Color(0.72, 0.77, 0.86) },
    uOpacity: { value: 0.5 },
  };
  const dropMaterial = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: DROP_VERTEX,
    fragmentShader: DROP_FRAGMENT,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  // No ink: a drop is a mark in the air, and a hull round a streak is a black line.
  dropMaterial.userData.outlineParameters = { visible: false };
  const drops = new THREE.Mesh(dropGeometry(), dropMaterial);
  drops.name = 'weather-drops';
  drops.frustumCulled = false;
  drops.renderOrder = 20;
  drops.visible = false;
  group.add(drops);

  const boltPositions = new Float32Array(BOLT_VERTICES * 3);
  const boltGeometry = new THREE.BufferGeometry();
  const boltAttribute = new THREE.BufferAttribute(boltPositions, 3);
  boltAttribute.setUsage(THREE.DynamicDrawUsage);
  boltGeometry.setAttribute('position', boltAttribute);
  const boltMaterial = new THREE.MeshBasicMaterial({ color: 0xf4f1ff, fog: false });
  boltMaterial.userData.outlineParameters = { thickness: 0.004, color: [0.11, 0.02, 0.01] };
  const bolt = new THREE.Mesh(boltGeometry, boltMaterial);
  bolt.name = 'weather-bolt';
  bolt.frustumCulled = false;
  bolt.visible = false;
  group.add(bolt);

  // The eased state, the model's latest answer and the forced one.
  const state = weatherSample();
  const target = weatherSample();
  let wetGround = 0;
  let freshSnow = 0;
  let lying = 0;
  let sampleClock = 0;
  let sampled = false;
  const lastSample = new THREE.Vector3();
  let forced: WeatherKind | null = null;
  let enabled = true;
  let sampleMs = 0;

  // The box's frame and its integrated fall, in double precision.
  const anchor = new THREE.Vector3();
  let anchored = false;
  const offset = [0, 0, 0];
  let layer = 0;
  let clock = 0;
  const relative = new THREE.Vector3();

  // Lightning.
  let slot = Number.NaN;
  const pending: Strike[] = [];
  const candidate: Strike = { lat: 0, lon: 0, at: 0, seed: 0 };
  let strikes = 0;
  let flashAge = Infinity;
  /**
   * When the last strike was seen, on the machine's clock. The strikes are
   * the sky clock's, and under the time-lapse (60 times) a slot of them goes
   * by in a frame or two: the scene flashed at thirty a second and the
   * thunder piled up by the hundred. However fast the sky runs, one strike in
   * `STRIKE_GAP_MS` is seen and heard; the rest pass unseen, as strikes past
   * the haze do.
   */
  let struckAt = -Infinity;
  let flashStrength = 0;
  const strikePoint = new THREE.Vector3();
  const strikeUp = new THREE.Vector3();
  const probe = weatherSample();
  const here = { lat: 0, lon: 0 };
  /** The deck's shade at the player, on the exact field, a sample at a time. */
  const shadeHere: CloudShadeSample = { cover: 0, depth: 0, shade: 0 };

  const sound = { rain: 0, gale: 0 };

  function rebase(camera: THREE.Vector3): void {
    anchor.copy(camera);
    anchored = true;
    const up = uniforms.uUp.value.copy(camera).normalize();
    const east = uniforms.uEast.value.crossVectors(Y, up);
    if (east.lengthSq() < 1e-8) east.set(1, 0, 0);
    east.normalize();
    uniforms.uNorth.value.crossVectors(up, east);
  }

  function sample(time: number, player: THREE.Vector3, ground: number): void {
    const began = performance.now();
    latLonOf(player, here);
    const elevation = Math.max(0, ground - PLANET_RADIUS - LAND_HEIGHT);
    weatherAt(here.lat, here.lon, elevation, time, target);
    cloudShadeAt(player, sky.state.sun, time, shadeHere);
    lying = target.lying;
    if (forced !== null) {
      Object.assign(target, PRESETS[forced]);
      if (forced === 'snow') target.temperatureC = Math.min(target.temperatureC, -3);
      else if (forced === 'rain' || forced === 'storm' || forced === 'drizzle') target.temperatureC = Math.max(target.temperatureC, 6);
      classify(target);
    } else if (!enabled) {
      Object.assign(target, PRESETS.clear);
      classify(target);
    }
    sampleMs = performance.now() - began;
  }

  function strikeStorm(lat: number, lon: number, when: number, player: THREE.Vector3): number {
    if (!enabled) return 0;
    if (forced !== null) {
      // A forced storm has no cells of its own: it is a storm round you.
      if (forced !== 'storm') return 0;
      unitAt(lat, lon, strikePoint).multiplyScalar(PLANET_RADIUS);
      return 0.5 * (1 - smoothstep(600, 1400, strikePoint.distanceTo(player)));
    }
    unitAt(lat, lon, strikeUp);
    weatherAt(lat, lon, Math.max(0, reliefAt(strikeUp.x, strikeUp.y, strikeUp.z)), when, probe);
    return probe.storm;
  }

  /** The strikes due in a slot of the clock, within reach of the player. */
  function schedule(nextSlot: number, now: number, player: THREE.Vector3): void {
    pending.length = 0;
    latLonOf(player, here);
    const reachDegrees = STRIKE_REACH / UNITS_PER_DEGREE;
    const rows = Math.ceil(reachDegrees / STRIKE_CELL);
    const cos = Math.max(0.2, Math.cos((here.lat * Math.PI) / 180));
    const cols = Math.min(Math.ceil(360 / STRIKE_CELL / 2), Math.ceil(reachDegrees / cos / STRIKE_CELL));
    const row0 = Math.floor(here.lat / STRIKE_CELL);
    const col0 = Math.floor(here.lon / STRIKE_CELL);
    for (let r = row0 - rows; r <= row0 + rows; r++) {
      for (let c = col0 - cols; c <= col0 + cols; c++) {
        const roll = strikeCandidate(r, c, nextSlot, candidate);
        if (roll >= STRIKE_ODDS || candidate.at < now || candidate.lat > 90 || candidate.lat < -90) continue;
        const storm = strikeStorm(candidate.lat, candidate.lon, candidate.at, player);
        if (roll < STRIKE_ODDS * storm && pending.length < 8) pending.push({ ...candidate });
      }
    }
  }

  function fire(strike: Strike, camera: THREE.Vector3): void {
    unitAt(strike.lat, strike.lon, strikeUp);
    const ground = PLANET_RADIUS + LAND_HEIGHT + Math.max(0, reliefAt(strikeUp.x, strikeUp.y, strikeUp.z));
    strikePoint.copy(strikeUp).multiplyScalar(ground);
    const distance = strikePoint.distanceTo(camera);
    if (distance > STRIKE_REACH) return;
    const wall = performance.now();
    if (wall - struckAt < STRIKE_GAP_MS) return;
    struckAt = wall;
    strikes++;
    writeBolt(boltPositions, strikePoint, strikeUp, BOLT_TOP, 3 + distance * 0.0012, strike.seed);
    boltAttribute.needsUpdate = true;
    boltGeometry.computeVertexNormals();
    flashAge = 0;
    // A strike lights the whole scene only when it is close enough to be
    // seen: past the haze it is a bolt nobody saw and a white-out from a
    // clear sky, which reads as a fault. Out there it is a faint flicker, and
    // only when the storm is over the player too (`state.storm`).
    const near = 1 - smoothstep(FLASH_NEAR, FLASH_FAR, distance);
    flashStrength = Math.max(near, FLASH_DISTANT * state.storm * (1 - smoothstep(FLASH_FAR, STRIKE_REACH, distance)));
    const metres = distance / SCENERY_SCALE;
    view.onThunder?.(metres / SOUND_SPEED, 1 / (1 + metres / 1400));
  }

  /** The flash's envelope, real seconds after a strike: a blink, a gap, a longer second stroke. */
  function flashAt(age: number): number {
    if (age < 0.07) return 1;
    if (age < 0.13) return 0.12;
    if (age < 0.3) return 0.85 * (1 - (age - 0.13) / 0.17);
    return 0;
  }

  const view: WeatherView = {
    group,
    sound,
    onThunder: null,
    proxies: () => [proxyOf(dropMaterial), proxyOf(boltMaterial)],
    get enabled() {
      return enabled;
    },
    set enabled(on: boolean) {
      enabled = on;
      sampleClock = 0;
    },
    force(kind) {
      forced = kind === null || !(kind in PRESETS) ? null : kind;
      sampleClock = 0;
      sampled = false;
      return forced;
    },
    at(lat, lon, when) {
      const out = weatherSample();
      unitAt(lat, lon, strikeUp);
      const time = when === undefined ? sky.state.time.getTime() : typeof when === 'number' ? when : when.getTime();
      return weatherAt(lat, lon, Math.max(0, reliefAt(strikeUp.x, strikeUp.y, strikeUp.z)), time, out);
    },
    here() {
      const bearing = (Math.atan2(state.windEast, state.windNorth) * 180) / Math.PI;
      return {
        kind: state.kind,
        intensity: Number(state.intensity.toFixed(2)),
        temperatureC: Number(state.temperatureC.toFixed(1)),
        wind: { speed: Number(state.windSpeed.toFixed(1)), from: Math.round(mod(bearing + 180, 360)) },
        cover: Number(state.cover.toFixed(2)),
        precipitation: Number(state.precipitation.toFixed(2)),
        snow: Number(state.snow.toFixed(2)),
        storm: Number(state.storm.toFixed(2)),
        fog: Number(state.fog.toFixed(2)),
        lying: Number(Math.max(lying, freshSnow).toFixed(2)),
        wet: Number(wetGround.toFixed(2)),
        shade: Number((shadeHere.shade * cloudShade.strength).toFixed(2)),
        forced,
        enabled,
      };
    },
    get stats() {
      return {
        kind: state.kind,
        drops: drops.visible ? drops.geometry.drawRange.count / 6 : 0,
        snowing: uniforms.uSnow.value > 0.5,
        strikes,
        pending: pending.length,
        bolt: bolt.visible,
        sampleMs: Number(sampleMs.toFixed(3)),
      };
    },
    update(dt, time, player, ground, camera, daylight) {
      const now = time.getTime();
      const cameraPosition = camera.position;

      // The model, a few times a second; a jump snaps.
      sampleClock -= dt;
      if (sampleClock <= 0) {
        sampleClock = SAMPLE_EVERY;
        const jumped = !sampled || lastSample.distanceTo(player) > JUMP;
        lastSample.copy(player);
        sample(now, player, ground);
        if (jumped) {
          Object.assign(state, target);
          wetGround = target.precipitation > 0.1 && target.snow < 0.5 ? 1 : 0;
          freshSnow = target.precipitation > 0.1 && target.snow >= 0.5 ? 0.8 : 0;
          sampled = true;
        }
      }
      // Ease every frame, so the rain thins smoothly between two samples.
      state.cover += (target.cover - state.cover) * follow(dt, EASE.cover);
      state.depth += (target.depth - state.depth) * follow(dt, EASE.cover);
      state.precipitation += (target.precipitation - state.precipitation) * follow(dt, EASE.precipitation);
      state.storm += (target.storm - state.storm) * follow(dt, EASE.storm);
      state.fog += (target.fog - state.fog) * follow(dt, EASE.fog);
      state.snow += (target.snow - state.snow) * follow(dt, EASE.snow);
      state.temperatureC += (target.temperatureC - state.temperatureC) * follow(dt, EASE.temperature);
      state.windSpeed += (target.windSpeed - state.windSpeed) * follow(dt, EASE.wind);
      state.windEast += (target.windEast - state.windEast) * follow(dt, EASE.wind);
      state.windNorth += (target.windNorth - state.windNorth) * follow(dt, EASE.wind);
      state.wet = target.wet;
      state.lying = target.lying;
      state.permanent = target.permanent;
      classify(state);

      const raining = state.precipitation > 0.05 && state.snow < 0.5;
      const snowing = state.precipitation > 0.05 && state.snow >= 0.5;
      wetGround += ((raining ? 1 : 0) - wetGround) * follow(dt, raining ? WETTING : DRYING);
      const melt = state.temperatureC > 1;
      const settle = snowing ? Math.min(1, state.precipitation * 1.5) : melt ? 0 : freshSnow;
      freshSnow += (settle - freshSnow) * follow(dt, snowing ? SETTLING : MELTING);

      // Above the deck the weather is below you: the rain, the grey and the
      // haze let go on the way through it.
      const altitude = cameraPosition.length() - ground;
      const above = smoothstep(CLOUD_BASE * 0.7, CLOUD_BASE * 1.35, altitude);
      const orbit = smoothstep(2000, 9000, altitude);

      // The sky and the haze, and the sun. A bank's own darkening is the
      // deck's shade's wherever there is a real deck behind the weather
      // (`cloudShade.share`); a forced sky and the weather off have none, and
      // keep the old cut of the whole world's sun (`sunCutOf`).
      cloudShade.weather = enabled && forced === null ? 1 : 0;
      const overcast = overcastOf(state, above);
      sky.weather.overcast = overcast;
      sky.weather.sunCut = sunCutOf(overcast, state.precipitation, state.storm, above, cloudShade.share);
      sky.weather.mist = clamp01(state.fog * 1.2) * (1 - above);
      clouds.setGrey(clamp01(state.precipitation * 0.9 + state.storm * 0.6 + state.cover * state.wet * 0.15) * (1 - orbit));
      setWeatherHaze(enabled || forced !== null ? (1 - 0.1 * state.wet) * (1 - 0.72 * state.fog) : 1);

      // The ground.
      groundWeather.atlasWet.value = wetGround;
      groundWeather.atlasFresh.value = freshSnow;
      groundWeather.atlasSeason.value = seasonOf(now);
      groundWeather.atlasWeatherAt.value.copy(player);

      // The drops.
      const falling = state.precipitation * (1 - above);
      drops.visible = falling > 0.02;
      if (drops.visible) {
        if (!anchored || anchor.distanceTo(cameraPosition) > REBASE) rebase(cameraPosition);
        const snowy = state.snow >= 0.5 ? 1 : 0;
        const box = snowy ? SNOW_BOX : RAIN_BOX;
        const fall = (snowy ? SNOW_FALL : RAIN_FALL) * SCENERY_SCALE;
        const drift = state.windSpeed * SCENERY_SCALE * (snowy ? SNOW_DRIFT : RAIN_DRIFT);
        const east = uniforms.uEast.value;
        const north = uniforms.uNorth.value;
        const up = uniforms.uUp.value;
        const ve = state.windEast * drift;
        const vn = state.windNorth * drift;
        offset[0] = mod(offset[0]! + ve * dt, box);
        offset[1] = mod(offset[1]! - fall * dt, box);
        offset[2] = mod(offset[2]! + vn * dt, box);
        layer = mod(layer + fall * LAYER_SPEED * dt, box);
        clock = (clock + dt) % 3600;
        relative.subVectors(cameraPosition, anchor);
        uniforms.uShift.value.set(
          mod(offset[0]! - relative.dot(east), box),
          mod(offset[1]! - relative.dot(up), box),
          mod(offset[2]! - relative.dot(north), box),
        );
        uniforms.uCamera.value.copy(cameraPosition);
        uniforms.uLayer.value = layer;
        uniforms.uBox.value = box;
        uniforms.uFall.value.set(ve, -fall, vn);
        uniforms.uSnow.value = snowy;
        uniforms.uLength.value = snowy ? FLAKE : STREAK * (1 + 0.5 * state.storm);
        uniforms.uWidth.value = snowy ? FLAKE : STREAK_WIDTH;
        uniforms.uClock.value = clock;
        const light = 0.16 + 0.84 * daylight + 1.6 * sky.weather.flash;
        if (snowy) uniforms.uColor.value.setRGB(0.95 * light, 0.96 * light, 1 * light);
        else uniforms.uColor.value.setRGB(0.7 * light, 0.75 * light, 0.84 * light);
        uniforms.uOpacity.value = snowy ? 0.95 : 0.3 + 0.3 * state.precipitation;
        const count = Math.round(MAX_DROPS * (snowy ? SNOW_SHARE : 1) * Math.min(1, falling * 1.15));
        drops.geometry.setDrawRange(0, count * 6);
      }

      // Lightning: the slot's strikes, then any that are due.
      const nextSlot = Math.floor(now / STRIKE_SLOT_MS);
      if (nextSlot !== slot) {
        slot = nextSlot;
        schedule(nextSlot, now, player);
      }
      for (let i = pending.length - 1; i >= 0; i--) {
        if (pending[i]!.at <= now) {
          fire(pending[i]!, cameraPosition);
          pending.splice(i, 1);
        }
      }
      flashAge += dt;
      const flash = flashAt(flashAge);
      bolt.visible = flash > 0.1;
      sky.weather.flash = flash * flashStrength * (1 - 0.6 * orbit);

      sound.rain = falling * (1 - state.snow);
      sound.gale = clamp01((state.windSpeed - 6) / 14);
    },
  };
  return view;
}
