/**
 * The light the sky casts. It falls as the distance to the 0.18 power, floored
 * at 0.62 (Mars 0.93 of Earth's, Jupiter 0.74, Neptune 0.62): the inverse-square
 * law is real and a screen cannot show it, and at a steeper power the outer
 * worlds read as murk rather than as far away. The sun's disc shrinks truly,
 * which is the cue a player reads distance from. `SkySpec.exposure` is the
 * planet file's lever.
 *
 * Where there is no air the sky at noon is the same black as at midnight. Under
 * an overcast (`SkySpec.overcast`, Venus) the light comes down from the whole
 * dome and follows the hidden Sun's height for day and night.
 *
 * A world's own sky layers (Saturn's rings and aurora) return how much of the
 * Sun reaches the traveller through them, which dims the light.
 */

import * as THREE from 'three';
import { NIGHT_MOOD } from '../../theme.ts';
import { MOON_OFFSET, SUN_SHADOW } from '../../sun.ts';
import { DEG } from './build.ts';
import type { SkyParts } from './build.ts';

/** The world's pole, which the moon's lantern is turned about, as Earth's is (`sun.ts`). */
const POLE = new THREE.Vector3(0, 1, 0);
const moonward = new THREE.Vector3();

/** How much light reaches the world from its distance from the Sun, times the planet file's exposure. */
export function reachOf(parts: SkyParts): number {
  return Math.min(1.4, Math.max(0.62, Math.pow(parts.state.au, -0.18))) * parts.spec.sky.exposure;
}

/** Fades the stars and planets in the daylight of an air. */
export function fadeStars(parts: SkyParts): void {
  const fade = Math.max(1 - parts.spec.sky.air * parts.state.day * 1.3, 0.06);
  parts.starMaterial.opacity = fade;
  parts.planetMaterial.opacity = fade;
}

/** Runs the layers one step; they hand back how much of the Sun they let through. */
export function updateLayers(parts: SkyParts, date: Date, when: Date, position: THREE.Vector3, reach: number): void {
  const { state, layers, haze } = parts;
  const ms = date.getTime();
  if (Number.isFinite(parts.lastMs)) parts.elapsed += Math.min(1, Math.max(0, (ms - parts.lastMs) / 1000));
  parts.lastMs = ms;
  let through = 1;
  for (const layer of layers) {
    through *= layer.update({
      observer: position,
      sun: state.sun,
      day: state.day,
      time: parts.elapsed,
      haze,
      light: Math.min(1.2, Math.max(0.35, reach * 1.6)),
      date: when,
      turn: parts.turn - parts.equinox,
    });
  }
  state.shade = through;
}

/** The sun's, the sky's and the moon's lights for the observer at `position`, the camera at `eye`. */
export function updateLights(parts: SkyParts, position: THREE.Vector3, eye: THREE.Vector3, up: THREE.Vector3, sinE: number, reach: number): void {
  const { state, sun, ambient, hemisphere, moon, horizon, haze } = parts;
  const sky = parts.spec.sky;
  const through = state.shade;
  if (parts.overcast) {
    // The light comes down from the deck: overhead, soft, and mostly fill.
    sun.position.copy(position).addScaledVector(up, SUN_SHADOW.distance);
    sun.intensity = 0.9 * reach * state.day;
    // A light through a cloud deck throws no edge.
    sun.shadow.intensity = 0;
    ambient.intensity = 0.12 + 0.4 * state.day * reach;
    hemisphere.intensity = 0.08 + 0.7 * state.day;
  } else {
    sun.position.copy(position).addScaledVector(state.sun, SUN_SHADOW.distance);
    sun.intensity = 2.6 * reach * THREE.MathUtils.smoothstep(sinE, -0.04, 0.1) * through;
    // Faded as Earth's: with a low sun, and with the eye climbing away.
    const elevationDeg = state.elevation / DEG;
    const eyeHeight = Math.max(0, eye.length() - position.length());
    sun.shadow.intensity =
      SUN_SHADOW.intensity *
      THREE.MathUtils.smoothstep(elevationDeg, SUN_SHADOW.sunFade[0], SUN_SHADOW.sunFade[1]) *
      (1 - THREE.MathUtils.smoothstep(eyeHeight, SUN_SHADOW.eyeFade[0], SUN_SHADOW.eyeFade[1]));
    // Fill: the air scatters light into the shade, and an airless world's
    // shade is lit only by the ground. Night keeps a floor so the ground is
    // there to walk on.
    ambient.intensity = 0.1 + (0.24 + 0.2 * sky.air) * state.day * reach;
    hemisphere.intensity = 0.06 + 0.36 * state.day * (0.4 + sky.air * 0.6);
  }
  sun.target.position.copy(position);
  moonward.copy(state.sun).negate().applyAxisAngle(POLE, MOON_OFFSET);
  moon.position.copy(position).addScaledVector(moonward, SUN_SHADOW.distance);
  moon.target.position.copy(position);
  // Under a deck the whole sky glows a little instead.
  moon.intensity = NIGHT_MOOD.moonIntensity * (1 - state.day) * (parts.overcast ? 0.4 : 1);
  hemisphere.position.copy(up);
  haze.copy(horizon).multiplyScalar(0.12 + 0.88 * state.day);
}
