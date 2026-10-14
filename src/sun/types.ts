import * as THREE from 'three';
import type { Mood } from '../theme.ts';
import type { Solar } from './astronomy.ts';

/** What the world is being lit by this frame. On `atlas.sky` for poking at. */
export interface SkyState {
  /** UTC instant the sky is drawn for. */
  time: Date;
  /** Degrees above the player's horizon. Negative is night. */
  elevation: number;
  /** 0 full night, 1 full day. */
  daylight: number;
  /**
   * 0 in the air, 1 out of it: the fade the dome takes to space as the camera
   * climbs, none over the plane's circuit and all of it a third of a radius
   * up. The light shafts go out on it (`shafts.ts`).
   */
  space: number;
  /**
   * Unit vector towards the sun, in world space. Live: the same object every
   * frame. `elevation` is the sun's height where the player stands, but anything
   * that lights itself must ask at its own position (a town on the day side and
   * one on the night side are in the same frame from the air), so this is
   * published for `lights.ts` to compute the terminator per vertex.
   */
  sun: THREE.Vector3;
  solar: Solar;
  /**
   * How much of the sun's cast shadow is on, 0 to 1: the product of the two
   * fades on `SHADOW_INTENSITY`. `main.ts` reads it to skip the shadow pass when
   * there is nothing to draw into it.
   */
  shadow: number;
  /** Unit vector towards the lantern moon (`MOON_OFFSET`), world space. Live. */
  moon: THREE.Vector3;
  /**
   * The J2000 sky in tonight's world: `celestial.ts`'s `equatorialBasis` at
   * `time`, rebuilt every frame. Live. A catalogue direction times this is
   * where that star stands now; `night-sky.ts` carries it as its matrix.
   */
  celestial: THREE.Matrix4;
  /**
   * The faintest star the eye finds at the zenith, as a visual magnitude:
   * the twilight ladder (`twilightLimit`) at `elevation`, less the weather and
   * the lantern moon, going to `SPACE_LIMIT` with the altitude. Below -4 by
   * day, so the sky draws nothing; 6.4 on a clear moonless night.
   */
  limit: number;
}

/**
 * Something drawn in the sky's own frame and on its clock, which `update` hands
 * the finished state to at the end of every frame, so the world's loop and the
 * menu's both drive it without knowing it exists. `night-sky.ts` is the one
 * there is.
 */
export type SkyLayer = (state: SkyState) => void;

/**
 * The dome's uniforms that a layer shares by reference, so a star and the sky
 * behind it never disagree about which way is up, where the limb is or how much
 * air is left: the same objects, written once a frame by `update`.
 */
export interface SkyUniforms {
  upDir: { value: THREE.Vector3 };
  dip: { value: number };
  space: { value: number };
  sunDir: { value: THREE.Vector3 };
  moonDir: { value: THREE.Vector3 };
}

export interface Sky {
  sun: THREE.DirectionalLight;
  moon: THREE.DirectionalLight;
  /**
   * Call once a frame, after the player and the camera have moved.
   *
   * `eyeHeight` is how far the camera is above the ground *under the player*,
   * in units; it fades the cast shadows out on the way up (`SHADOW_EYE_FADE`).
   * The menu passes its camera's altitude, which is 1.47 radii and fades them
   * to nothing.
   */
  update(playerPosition: THREE.Vector3, cameraPosition: THREE.Vector3, eyeHeight: number): void;
  /**
   * Put the sun light where the shadow map wants it: on the player, snapped to
   * the map's own texels, `SHADOW_DISTANCE` up the solar direction as of the last
   * `SHADOW_STEP`.
   *
   * Call it in the frame the shadow map is redrawn, and only then. The map is
   * drawn from the light's position at that moment and the shading looks the map
   * up through the matrix of that same moment; a light that moves between two
   * redraws hands the shader a matrix the map was not drawn for, and no cast
   * shadow appears at all. `update` therefore leaves the light alone while
   * `state.shadow` is on and `main.ts` calls this beside `shadowMap.needsUpdate`.
   * While the shadow is off (night, the air) `update` moves the light itself,
   * since nothing is looked up through it and the terminator still has to track
   * the sun.
   */
  placeShadow(): void;
  state: SkyState;
  /** The blend of the three moods currently on screen. Read-only in practice. */
  mood: Mood;
  /**
   * Debug clock. `setTime('2026-09-04T05:20:00Z')` freezes the world at that
   * instant and keeps it running from there; `setTime(null)` goes back to the
   * real one. `setRate(600)` runs ten minutes a second, which is how you watch a
   * dawn without waiting for one.
   *
   * A time that is not a time is refused and the clock keeps the one it had
   * (`NaN` would reach the sun, the clouds and the traffic, and the chip's
   * formatter would throw every frame). `setTime` returns whether it took the
   * time; `setRate` ignores a rate that is not finite.
   */
  setTime(when: Date | string | number | null): boolean;
  setRate(rate: number): void;
  /**
   * What the weather does to the light, written by `weather-view.ts` and applied
   * on top of the mood each `update`: a multiplier over whatever the moods say,
   * so a storm at night is the night's own dark, darker.
   *
   * `overcast` 0 to 1 greys the sky and the haze and dims the moon and the fill;
   * `sunCut` 0 to 1 takes the sun off the whole world at once (and its shadow
   * with it); `flash` 0 to 1 is lightning, a blink of cold light over everything;
   * `mist` 0 to 1 pales the haze toward the colour of fog. All four fade out of
   * the sky as the camera climbs, which is the weather's own business.
   *
   * The sun's cut is not the overcast. The deck's shade darkens the ground per
   * pixel (`cloud-shade.ts`), so a cut of the whole world on top of it would
   * darken the ground under a bank twice. The sun's cut is the overcast only
   * where there is no deck behind the weather (a forced sky, the weather or the
   * shade switched off) and otherwise a little of the rain's gloom (`sunCutOf`).
   * The sky and the haze still grey with the overcast.
   */
  weather: { overcast: number; sunCut: number; flash: number; mist: number };
  /** See `SkyUniforms`. */
  uniforms: SkyUniforms;
  /** Adds a `SkyLayer`, called at the end of every `update` from then on. */
  attach(layer: SkyLayer): void;
}
