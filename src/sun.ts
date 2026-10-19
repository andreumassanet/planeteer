/**
 * The real sun at the real time, and the sky it lights.
 *
 * `createSky` owns the dome, the sun and moon discs and the fill lights, and
 * drives them from the clock: the astronomy is NOAA's low-precision solar
 * position (`sun/astronomy.ts`), the moods come from `theme.ts` blended by the
 * sun's height where the player stands (`sun/mood.ts`), and the sun casts the
 * one shadow (`sun/shadow.ts`).
 */
import * as THREE from 'three';
import { PLANET_RADIUS } from './globe.ts';
import { setToonMood } from './theme.ts';
import { equatorialBasis, GALACTIC } from './celestial.ts';
import { directionOf, solarPosition, sunElevation, sunUniform } from './sun/astronomy.ts';
import { SKY_DISTANCE } from './sun/discs.ts';
import { createMood, createMoodMixer, lerp } from './sun/mood.ts';
import type { SkyWeather } from './sun/mood.ts';
import { WHITE, createDiscs, createDome, createLights } from './sun/scene.ts';
import {
  SHADOW_EYE_FADE, SHADOW_INTENSITY, SHADOW_SUN_FADE, createShadowPlacer,
} from './sun/shadow.ts';
import {
  MILKY_WAY_LIMITS, MIST_LIMIT, MOON_LIMIT, MOON_OFFSET, MOON_WASH, NORTH, OVERCAST_LIMIT, SPACE_LIMIT, twilightLimit,
} from './sun/twilight.ts';
import type { Sky, SkyLayer, SkyState } from './sun/types.ts';
import { shadeMoonPhase, updateNightLights } from './sun/night-lights.ts';

export { sunUniform, solarPosition, sunDirection } from './sun/astronomy.ts';
export type { Solar } from './sun/astronomy.ts';
export { SKY_DISTANCE } from './sun/discs.ts';
export { SHADOW_COVER, SUN_SHADOW, castSunShadow } from './sun/shadow.ts';
export { MOON_OFFSET, twilightLimit } from './sun/twilight.ts';
export type { Sky, SkyLayer, SkyState, SkyUniforms } from './sun/types.ts';

/** The furthest a `Date` reaches either side of 1970, ms. */
const MAX_DATE_MS = 8.64e15;
/** The fastest the sky's clock may be made to run, either way. */
const MAX_RATE = 1e7;


export function createSky(scene: THREE.Scene, fog: THREE.Fog): Sky {
  const { uniforms } = createDome(scene);
  const { ambient, hemisphere, sun, moon } = createLights(scene);
  const { moonDisc, moonMaterial, mareMaterial, sunDisc, sunMaterial } = createDiscs(scene);

  const solarDirection = new THREE.Vector3(0, 1, 0);
  const moonDirection = new THREE.Vector3(0, -1, 0);
  shadeMoonPhase(moonMaterial, { value: moonDisc.position }, uniforms.sunDir);
  shadeMoonPhase(mareMaterial, { value: moonDisc.position }, uniforms.sunDir);
  const up = new THREE.Vector3(0, 1, 0);
  const cameraUp = new THREE.Vector3(0, 1, 0);
  const weather: SkyWeather = { overcast: 0, sunCut: 0, flash: 0, mist: 0 };
  const placer = createShadowPlacer(sun);
  const { shadowFocus, placeShadow } = placer;

  const mood = createMood();
  const mixer = createMoodMixer(mood, weather);
  const state: SkyState = {
    time: new Date(),
    elevation: 90,
    daylight: 1,
    space: 0,
    sun: solarDirection,
    solar: { declination: 0, subsolarLon: 0, equationOfTime: 0 },
    shadow: 0,
    moon: moonDirection,
    celestial: new THREE.Matrix4(),
    limit: twilightLimit(90),
  };
  const layers: SkyLayer[] = [];
  /** Said once: a mirrored sky would say it every frame. */
  let warnedMirror = false;

  // The clock, as an offset and a rate rather than a stored instant, so a
  // scrubbed time keeps running instead of freezing the world at one minute.
  let anchor = Date.now();
  let anchorReal = anchor;
  let rate = 1;
  let lastShadow = -1;
  let lastGamma = -1;

  function update(playerPosition: THREE.Vector3, cameraPosition: THREE.Vector3, eyeHeight: number): void {
    // One `Date` and one solar record, written in place: this runs every frame
    // and the position is asked once, not once for the record and again for the
    // direction.
    const time = state.time;
    // Held inside what a `Date` can hold: past +-8.64e15 ms it is an Invalid Date
    // and NaN would reach the sun, the clouds and the traffic. Only a console's
    // rate gets there.
    time.setTime(Math.max(-MAX_DATE_MS, Math.min(MAX_DATE_MS, anchor + (Date.now() - anchorReal) * rate)));
    directionOf(solarPosition(time, state.solar), solarDirection);
    placer.stepLight(time);

    // Where you stand is what decides whether it is day. The camera only gets a
    // vote on which way the horizon runs.
    up.copy(playerPosition).normalize();
    cameraUp.copy(cameraPosition).normalize();
    const elevation = sunElevation(solarDirection, up);
    state.elevation = elevation;

    state.daylight = mixer.blendByElevation(elevation);
    // Fades over the plane's own climb: still sky over its circuit at 320 units,
    // wholly space a third of a radius up, which is about where the horizon stops
    // being a line and becomes a limb.
    const distance = cameraPosition.length();
    const orbit = THREE.MathUtils.smoothstep(
      distance - PLANET_RADIUS,
      PLANET_RADIUS * 0.04,
      PLANET_RADIUS * 0.35,
    );
    state.space = orbit;

    /**
     * From orbit the light goes to `ORBIT_LOOK` whatever the local hour, and the
     * sky colours do not. Ambient fill and a raised ramp floor are the air around
     * you, correct standing in the Sahara at noon; seen from the ceiling they would
     * light the night hemisphere as flatly as the day one and leave no terminator
     * to look at. The sky keeps the local colours because what is left of it up
     * there is the halo around the limb, and at dawn that halo is the dawn.
     *
     * The target is its own record and not `NIGHT_MOOD`, because every number in a
     * mood is a ground number (the moon at 0.6 is why night down there is a second
     * look rather than a dimmer one). `theme.ts`'s `ORBIT_LOOK` carries the
     * reasoning.
     */
    mixer.blendToOrbit(orbit);

    // The weather over the mood (see `Sky.weather`), on the numbers the lights are
    // about to take, so nothing it does outlives the frame. The sun takes its own
    // cut, which the deck's shade has taken over from the overcast.
    mixer.applyWeather();

    sunUniform.value.copy(solarDirection);
    sun.color.setHex(mood.sun);
    sun.intensity = mood.sunIntensity;

    // Two fades and a product: no shadow from a sun on the horizon, and none
    // from the air, where the box cannot cover what the camera sees.
    state.shadow =
      THREE.MathUtils.smoothstep(elevation, SHADOW_SUN_FADE[0], SHADOW_SUN_FADE[1]) *
      (1 - THREE.MathUtils.smoothstep(eyeHeight, SHADOW_EYE_FADE[0], SHADOW_EYE_FADE[1])) *
      // No sun through a bank: the shadow goes as the sun does, the whole world's
      // with the sun's cut and under the deck's shade a pixel at a time
      // (`cloudLightsChunk`).
      (1 - THREE.MathUtils.smoothstep(weather.sunCut, 0.3, 0.8));
    sun.shadow.intensity = SHADOW_INTENSITY * state.shadow;
    // The light is placed by `placeShadow` in the frame the map is redrawn. With
    // the shadow off nothing is looked up through the map, so the light follows
    // the sun, by its steps, every frame.
    shadowFocus.copy(playerPosition);
    if (state.shadow === 0) placeShadow();
    // The moon lights the hemisphere the sun does not, so the terminator seen
    // from the air is warm on one side and cool on the other rather than warm
    // and empty.
    moonDirection.copy(solarDirection).negate().applyAxisAngle(NORTH, MOON_OFFSET);
    moon.position.copy(moonDirection).multiplyScalar(PLANET_RADIUS * 4);
    moon.color.setHex(mood.moon);
    moon.intensity = mood.moonIntensity;

    // Both discs ride the camera, which is what makes them read as distant: a
    // bearing is all either of them is. The depth is not camera-relative (see
    // `SKY_DISTANCE`), so the planet still eclipses them both.
    sunDisc.position.copy(cameraPosition).addScaledVector(solarDirection, SKY_DISTANCE);
    moonDisc.position.copy(cameraPosition).addScaledVector(moonDirection, SKY_DISTANCE);
    // The maria have to face you. `NORTH` is the roll reference rather than the
    // local up: the moon's declination is the sun's negated, so the bearing is
    // never within 66 degrees of the pole and the case that would degenerate cannot
    // arise.
    moonDisc.up.copy(NORTH);
    moonDisc.lookAt(cameraPosition);
    // The sun is the brightest thing in the frame at every hour, so its colour is
    // the mood's sunlight taken half way to white: a low sun goes orange with the
    // light it casts without going as dim as the light does (see `Mood.sun`).
    sunMaterial.color.setHex(mood.sun).lerp(WHITE, 0.45);
    moonMaterial.color.setHex(mood.moon).lerp(WHITE, 0.72);
    mareMaterial.color.copy(moonMaterial.color).multiplyScalar(0.84);

    ambient.color.setHex(mood.ambient);
    ambient.intensity = mood.ambientIntensity;
    hemisphere.color.setHex(mood.hemisphereSky);
    hemisphere.groundColor.setHex(mood.hemisphereGround);
    hemisphere.intensity = mood.hemisphereIntensity;
    hemisphere.position.copy(cameraUp);

    fog.color.setHex(mood.fog);
    uniforms.top.value.setHex(mood.skyTop);
    uniforms.horizon.value.setHex(mood.skyHorizon);
    uniforms.glowColor.value.setHex(mood.skyGlow);
    uniforms.sunDir.value.copy(solarDirection);
    uniforms.upDir.value.copy(cameraUp);
    uniforms.moonDir.value.copy(moonDirection);
    uniforms.glow.value = mood.glow;
    uniforms.space.value = orbit;
    uniforms.dip.value = -Math.sqrt(Math.max(0, 1 - (PLANET_RADIUS / distance) ** 2));

    // The stars' frame and how deep into them the night reaches (see
    // `TWILIGHT_LADDER`).
    equatorialBasis(time, state.celestial);
    if (!warnedMirror && state.celestial.determinant() <= 0) {
      // A reflection would put every constellation back to front and rising in the
      // west, and it would render. Say so rather than draw it quietly.
      warnedMirror = true;
      console.warn('sky: the celestial basis is a reflection', state.celestial.determinant());
    }
    uniforms.galactic.value.setFromMatrix4(state.celestial).transpose().premultiply(GALACTIC);
    const moonUp = THREE.MathUtils.smoothstep(moonDirection.dot(up), -0.05, 0.2);
    const dark = twilightLimit(elevation) - OVERCAST_LIMIT * THREE.MathUtils.smoothstep(weather.overcast, 0.2, 0.7) - MIST_LIMIT * weather.mist;
    state.limit = lerp(dark - MOON_LIMIT * moonUp, SPACE_LIMIT, orbit);
    // `NIGHT_MOOD.stars` is the art's say, the ladder the sky's and the moon the
    // lantern's; above the air, only the altitude's. It goes before the camera
    // leaves the dome (`DOME_EXIT` in `main.ts`), so that edge is not a pop.
    const deep = THREE.MathUtils.smoothstep(dark, MILKY_WAY_LIMITS[0], MILKY_WAY_LIMITS[1]);
    uniforms.milky.value =
      Math.max(mood.stars * deep * (1 - MOON_WASH * moonUp), orbit) *
      (1 - THREE.MathUtils.smoothstep(distance, PLANET_RADIUS * 4.5, PLANET_RADIUS * 5.5));

    updateNightLights(
      uniforms, time, cameraUp, THREE.MathUtils.smoothstep(dark, 3.2, 5.2), weather.overcast, orbit, moonUp,
    );

    // Five 4x1 textures: cheap, but an upload, and the ramp moves by a hundredth of
    // a step a minute. Gate it.
    if (Math.abs(mood.rampShadow - lastShadow) > 0.002 || Math.abs(mood.rampGamma - lastGamma) > 0.01) {
      lastGamma = mood.rampGamma;
      lastShadow = mood.rampShadow;
      setToonMood(mood);
    }

    for (const layer of layers) layer(state);
  }
  return {
    sun,
    moon,
    state,
    mood,
    update,
    placeShadow,
    weather,
    uniforms,
    attach(layer) {
      layers.push(layer);
    },
    setTime(when) {
      const next = when === null ? Date.now() : new Date(when).getTime();
      if (!Number.isFinite(next)) return false;
      anchor = next;
      anchorReal = Date.now();
      // The real clock runs at the real rate.
      if (when === null) rate = 1;
      return true;
    },
    setRate(next) {
      if (!Number.isFinite(next)) return;
      next = Math.max(-MAX_RATE, Math.min(MAX_RATE, next));
      anchor = anchor + (Date.now() - anchorReal) * rate;
      anchorReal = Date.now();
      rate = next;
    },
  };
}
