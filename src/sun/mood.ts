/** Blending the moods by the sun's height, the climb into orbit, and the weather over the result. */
import * as THREE from 'three';
import { DAY_MOOD, NIGHT_MOOD, ORBIT_LOOK, TWILIGHT_MOOD } from '../theme.ts';
import type { Mood } from '../theme.ts';
import { SUN_CUT } from '../cloud-shade.ts';
import { DAY_ELEVATION, NIGHT_ELEVATION } from './twilight.ts';

/**
 * The fields the climb overrides, written once so that adding a term to
 * `OrbitLook` cannot be half-applied. Colours and scalars are separate lists
 * because a colour lerps through `Color` and a scalar does not.
 */
const ORBIT_INTENSITIES = [
  'ambientIntensity',
  'hemisphereIntensity',
  'sunIntensity',
  'moonIntensity',
  'rampShadow',
  'rampGamma',
] as const;

const ORBIT_COLORS = ['ambient', 'hemisphereSky', 'hemisphereGround', 'sun', 'moon'] as const;

const OVERCAST_GREY = new THREE.Color(0.52, 0.54, 0.58);
/** Lightning's colour, on the sky and the fill light. */
const FLASH_COLOR = new THREE.Color(0.86, 0.87, 1);
/** Fog's colour by day, before the mood's brightness. */
const MIST_COLOR = new THREE.Color(0.8, 0.81, 0.83);

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** What the weather does to the sky, set by `Sky.weather`. */
export interface SkyWeather {
  overcast: number;
  sunCut: number;
  flash: number;
  mist: number;
}

/** A copy of the day mood to blend into. */
export function createMood(): Mood {
  return { ...DAY_MOOD, rampShadowTint: [...DAY_MOOD.rampShadowTint], rampLightTint: [...DAY_MOOD.rampLightTint] };
}

export function createMoodMixer(mood: Mood, weather: SkyWeather) {
  const mix = new THREE.Color();
  const other = new THREE.Color();
  const greyed = new THREE.Color();
  const colorAt = (a: number, b: number, t: number): number =>
    mix.setHex(a).lerp(other.setHex(b), t).getHex();
  /** A colour taken `t` of the way to the overcast grey at its own brightness, times `dim`. */
  const greyOf = (hex: number, t: number, dim: number): number => {
    mix.setHex(hex);
    const light = (mix.r + mix.g + mix.b) / 3;
    greyed.copy(OVERCAST_GREY).multiplyScalar((light / 0.55) * dim);
    return mix.lerp(greyed, t).getHex();
  };

  function blend(a: Mood, b: Mood, t: number): void {
    mood.skyTop = colorAt(a.skyTop, b.skyTop, t);
    mood.skyHorizon = colorAt(a.skyHorizon, b.skyHorizon, t);
    mood.skyGlow = colorAt(a.skyGlow, b.skyGlow, t);
    mood.glow = lerp(a.glow, b.glow, t);
    mood.stars = lerp(a.stars, b.stars, t);
    mood.fog = colorAt(a.fog, b.fog, t);
    mood.ambient = colorAt(a.ambient, b.ambient, t);
    mood.ambientIntensity = lerp(a.ambientIntensity, b.ambientIntensity, t);
    mood.hemisphereSky = colorAt(a.hemisphereSky, b.hemisphereSky, t);
    mood.hemisphereGround = colorAt(a.hemisphereGround, b.hemisphereGround, t);
    mood.hemisphereIntensity = lerp(a.hemisphereIntensity, b.hemisphereIntensity, t);
    mood.sun = colorAt(a.sun, b.sun, t);
    mood.sunIntensity = lerp(a.sunIntensity, b.sunIntensity, t);
    mood.moon = colorAt(a.moon, b.moon, t);
    mood.moonIntensity = lerp(a.moonIntensity, b.moonIntensity, t);
    mood.rampShadow = lerp(a.rampShadow, b.rampShadow, t);
    mood.rampGamma = lerp(a.rampGamma, b.rampGamma, t);
    const shadowTint = mood.rampShadowTint as [number, number, number];
    const lightTint = mood.rampLightTint as [number, number, number];
    for (let c = 0; c < 3; c++) {
      shadowTint[c] = lerp(a.rampShadowTint[c]!, b.rampShadowTint[c]!, t);
      lightTint[c] = lerp(a.rampLightTint[c]!, b.rampLightTint[c]!, t);
    }
  }

  /** Blends night, twilight and day by the sun's elevation; returns the daylight, 0 to 1. */
  function blendByElevation(elevation: number): number {
    if (elevation <= 0) {
      const t = THREE.MathUtils.smoothstep(elevation, NIGHT_ELEVATION, 0);
      blend(NIGHT_MOOD, TWILIGHT_MOOD, t);
      return t * 0.5;
    }
    const t = THREE.MathUtils.smoothstep(elevation, 0, DAY_ELEVATION);
    blend(TWILIGHT_MOOD, DAY_MOOD, t);
    return 0.5 + t * 0.5;
  }

  /** Takes the light to `ORBIT_LOOK` as the camera climbs; the sky colours keep their local values. */
  function blendToOrbit(orbit: number): void {
    for (const key of ORBIT_INTENSITIES) mood[key] = lerp(mood[key], ORBIT_LOOK[key], orbit);
    for (const key of ORBIT_COLORS) mood[key] = colorAt(mood[key], ORBIT_LOOK[key], orbit);
    const shadowTint = mood.rampShadowTint as [number, number, number];
    const lightTint = mood.rampLightTint as [number, number, number];
    for (let c = 0; c < 3; c++) {
      shadowTint[c] = lerp(shadowTint[c]!, ORBIT_LOOK.rampShadowTint[c]!, orbit);
      lightTint[c] = lerp(lightTint[c]!, ORBIT_LOOK.rampLightTint[c]!, orbit);
    }
  }

  /** The weather over the mood, on the numbers the lights are about to take, so nothing it does outlives the frame. */
  function applyWeather(): void {
    const overcast = weather.overcast;
    const sunCut = weather.sunCut;
    mood.sunIntensity *= 1 - SUN_CUT * sunCut;
    if (overcast > 0) {
      mood.moonIntensity *= 1 - 0.8 * overcast;
      mood.ambientIntensity *= 1 - 0.2 * overcast;
      mood.hemisphereIntensity *= 1 - 0.3 * overcast;
      mood.skyTop = greyOf(mood.skyTop, 0.75 * overcast, 0.8);
      mood.skyHorizon = greyOf(mood.skyHorizon, 0.7 * overcast, 0.85);
      mood.fog = greyOf(mood.fog, 0.65 * overcast, 0.85);
      mood.glow *= 1 - overcast;
    }
    if (weather.mist > 0) {
      mix.setHex(mood.fog);
      const light = Math.max(mix.r, mix.g, mix.b);
      mood.fog = mix.lerp(other.copy(MIST_COLOR).multiplyScalar(Math.min(1, light * 1.25)), 0.6 * weather.mist).getHex();
    }
    if (weather.flash > 0) {
      const f = weather.flash;
      // A blink of fill, not a white-out: a larger gain took every surface past
      // white through the tone map and the bloom.
      mood.ambientIntensity += 0.9 * f;
      mood.ambient = colorAt(mood.ambient, FLASH_COLOR.getHex(), f);
      mood.skyTop = colorAt(mood.skyTop, FLASH_COLOR.getHex(), 0.55 * f);
      mood.skyHorizon = colorAt(mood.skyHorizon, FLASH_COLOR.getHex(), 0.65 * f);
      mood.fog = colorAt(mood.fog, FLASH_COLOR.getHex(), 0.5 * f);
    }
  }

  return { colorAt, blendByElevation, blendToOrbit, applyWeather };
}
