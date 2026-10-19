/** The weather view's tuning, the forced presets, and small helpers. */
import { CLOUD_BASE } from '../clouds.ts';
import type { WeatherKind, WeatherSample } from '../weather.ts';

/** How often the model is asked, in seconds. */
export const SAMPLE_EVERY = 0.25;
/** A move this far between two samples is a jump, and the weather snaps. */
export const JUMP = 1500;

/** The most quads the mesh holds, and how many of them rain and snow use at full strength. */
export const MAX_DROPS = 6000;
export const SNOW_SHARE = 0.55;
/** The box round the camera, in units: about 40 m of rain, 28 of snow. */
export const RAIN_BOX = 50;
export const SNOW_BOX = 36;
/** Metres a second: rain and snow falling, in still air. */
export const RAIN_FALL = 9;
export const SNOW_FALL = 1.1;
/** How much of the wind a drop takes sideways: rain little, snow nearly all. */
export const RAIN_DRIFT = 0.45;
export const SNOW_DRIFT = 0.8;
/** A streak's length and a streak's and a flake's least width, in units. */
export const STREAK = 1.25;
export const STREAK_WIDTH = 0.03;
export const FLAKE = 0.11;
/** A drop's layer, 0 to 2, falls this much faster per layer, so the rain is not one sheet. */
export const LAYER_SPEED = 0.18;
/** Past this far from the frame's anchor the box is re-based; see `rebase`. */
export const REBASE = 4000;

/** How far off a strike is still drawn, and how far its flash and its thunder reach. */
export const STRIKE_REACH = 5000;
/** The least time between two strikes seen, on the machine's clock: see `struckAt`. */
export const STRIKE_GAP_MS = 600;
/**
 * How far a strike lights the scene: fully within `FLASH_NEAR`, fading out
 * by `FLASH_FAR`, about the haze's reach on the ground; past that only
 * `FLASH_DISTANT` of a flash, and only under a storm of one's own.
 */
export const FLASH_NEAR = 700;
export const FLASH_FAR = 2200;
export const FLASH_DISTANT = 0.25;
/** The height the bolt comes out of, over the ground: the deck's base, less its swing. */
export const BOLT_TOP = CLOUD_BASE * 0.85;
export const BOLT_SEGMENTS = 16;
export const BRANCH_SEGMENTS = 6;
export const BOLT_SIDES = 4;
/** The speed of sound, m/s: the thunder's delay is the strike's metres over this. */
export const SOUND_SPEED = 343;

/** Seconds a state takes to follow the model: slow enough that a front arrives, and a storm, whose heart passes in minutes, lingers. */
export const EASE = { cover: 10, precipitation: 8, storm: 15, fog: 12, snow: 5, temperature: 20, wind: 5 } as const;
/** How fast the ground wets and dries, and how fast fresh snow lies and melts. */
export const WETTING = 25;
export const DRYING = 180;
export const SETTLING = 40;
/** Seconds between two reads of the ground's wetness (`wetnessAt`, sixteen model reads), and the ease between them. */
export const WET_SAMPLE_EVERY = 2;
export const WET_EASE = 3;
export const MELTING = 200;

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

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * How grey the weather makes the sky and the haze, 0 to 1, from the cover, the
 * rain and the storm where you stand, fading as you climb through the deck
 * (`above`). The cut of the whole world's sun is `sunCutOf` (`cloud-shade.ts`).
 */
export function overcastOf(weather: { cover?: number; precipitation?: number; storm?: number }, above: number): number {
  return clamp01((weather.cover ?? 0) * 0.3 + (weather.precipitation ?? 0) * 0.4 + (weather.storm ?? 0) * 0.4) * (1 - above);
}

export const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** The share of the way to a target a state moves in `dt` against a time constant. */
export const follow = (dt: number, tau: number): number => 1 - Math.exp(-dt / tau);
export const mod = (x: number, m: number): number => ((x % m) + m) % m;

export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Moves `state` toward `target` by each field's own time constant. */
export function easeState(state: WeatherSample, target: WeatherSample, dt: number): void {
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
}
