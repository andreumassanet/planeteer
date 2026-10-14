/**
 * Another world's sky: its sun at the size and brightness its distance gives
 * it, its day and night on its own rotation, the stars and the other planets
 * where they really are, its moons where their orbits have them, and the light
 * all of it casts.
 *
 * Everything celestial hangs in one group whose rotation is the body's own
 * (`sky/placement.ts`); the group is centred on the camera and scaled inside
 * its far plane, so the sky is always behind everything and never clipped.
 * `sky/build.ts` makes the objects, `sky/lighting.ts` the light, `sky/shaders.ts`
 * the dome and the lit discs.
 */

import * as THREE from 'three';
import type { SkyLayer, WorldSpec } from './contract.ts';
import { lonOf } from '../sphere.ts';
import { buildSkyParts } from './sky/build.ts';
import { fadeStars, reachOf, updateLayers, updateLights } from './sky/lighting.ts';
import { place, sunInertial, updateMoons } from './sky/placement.ts';

export interface SkyState {
  /** Unit vector toward the sun in the world (body-fixed) frame. */
  sun: THREE.Vector3;
  /** 0 night to 1 day, at the observer. */
  day: number;
  /** The sun's elevation at the observer, radians. */
  elevation: number;
  /** Local solar hour at the observer, 0 to 24. */
  hour: number;
  /** Distance from the Sun, au. */
  au: number;
  /** What the layers let through of the Sun, 0 to 1: Saturn's rings' shadow. */
  shade: number;
}

/** A moon (or Earth, from the Moon) as the traveller sees it this frame. */
export interface MoonView {
  name: string;
  /** Unit vector from the traveller, body-fixed frame. */
  direction: THREE.Vector3;
  /** Angular radius as seen, degrees, before the drawing's floor. */
  radiusDeg: number;
  /** The lit fraction of the disc, 0 new to 1 full. */
  lit: number;
}

export interface Sky {
  group: THREE.Group;
  sun: THREE.DirectionalLight;
  ambient: THREE.AmbientLight;
  hemisphere: THREE.HemisphereLight;
  state: SkyState;
  /** The moons (and Earth, from the Moon), as of the last `update`. */
  moons: readonly MoonView[];
  /** The world's own sky layers, made from its spec. */
  layers: readonly SkyLayer[];
  /** The haze colour, for the fog, linear. */
  haze: THREE.Color;
  /**
   * Moves the sky to the instant `date` (plus the clock offset) for an
   * observer at `position`, the camera at `eye`, its far plane `far`.
   */
  update(date: Date, position: THREE.Vector3, eye: THREE.Vector3, far: number): void;
  /** Turns the clock so it is `hour` local solar time at `position` now. */
  setHour(hour: number, date: Date, position: THREE.Vector3): void;
  dispose(): void;
}

export function createSky(spec: WorldSpec, scene: THREE.Scene): Sky {
  const body = spec.body;
  const parts = buildSkyParts(spec, scene);
  const { group, state, uniforms, celestial, overcast, locked, haze } = parts;
  const up = new THREE.Vector3();

  return {
    group,
    sun: parts.sun,
    ambient: parts.ambient,
    hemisphere: parts.hemisphere,
    state,
    moons: parts.views,
    layers: parts.layers,
    haze,
    update(date, position, eye, far) {
      const when = locked ? new Date(date.getTime() + parts.offset * 3600000) : date;
      place(parts, when);
      state.sun.copy(sunInertial).applyQuaternion(celestial.quaternion);
      up.copy(position).normalize();
      const sinE = state.sun.dot(up);
      state.elevation = Math.asin(Math.max(-1, Math.min(1, sinE)));
      // Under a deck the dusk is long: the light comes down from the whole
      // sky, so it goes as the Sun's height over the cloud, not over the hill.
      state.day = overcast ? THREE.MathUtils.smoothstep(sinE, -0.2, 0.3) : THREE.MathUtils.smoothstep(sinE, -0.12, 0.18);
      // The hour is the hour angle: how far round the pole the observer's
      // meridian is from the sun's, in the world's own longitudes (the pole is
      // the world's y, because it is the sky that turns). East of the
      // subsolar meridian it is afternoon on a world that turns eastward, and
      // morning on one that turns the other way.
      const sense = Math.sign(body.rotationHours) || 1;
      let angle = lonOf(up.x, up.z) - lonOf(state.sun.x, state.sun.z);
      angle = ((angle + 540) % 360) - 180;
      state.hour = (((12 + (sense * angle) / 15) % 24) + 24) % 24;

      group.position.copy(eye);
      group.scale.setScalar(far * 0.9);
      uniforms.uUp.value.copy(up);
      uniforms.uSun.value.copy(state.sun);
      uniforms.uDay.value = state.day;

      const reach = reachOf(parts);
      fadeStars(parts);
      updateMoons(parts, position);
      updateLayers(parts, date, when, position, reach);
      updateLights(parts, position, eye, up, sinE, reach);
    },
    setHour(hour, date, position) {
      parts.offset = 0;
      // On a turning world the offset turns the body and leaves the orbit
      // where the date has it, so an hour of local time is a twenty-fourth of
      // a sidereal turn and the step is exact; on a locked one it moves the
      // date by a twenty-fourth of the solar day, which the librations make
      // nearly exact. The loop absorbs the rest and the wrap at midnight.
      const step = locked ? parts.solarDay : Math.abs(body.rotationHours);
      for (let pass = 0; pass < 8; pass++) {
        this.update(date, position, position, 1);
        let delta = hour - state.hour;
        delta = ((delta + 36) % 24) - 12;
        if (Math.abs(delta) < 0.005) break;
        parts.offset += (delta / 24) * step;
      }
    },
    dispose() {
      parts.dome.geometry.dispose();
      (parts.dome.material as THREE.Material).dispose();
      parts.starGeometry.dispose();
      parts.starMaterial.dispose();
      parts.planetGeometry.dispose();
      parts.planetMaterial.dispose();
      parts.sunDisc.geometry.dispose();
      (parts.sunDisc.material as THREE.Material).dispose();
      for (const one of parts.satellites) {
        one.disc.mesh.geometry.dispose();
        (one.disc.mesh.material as THREE.Material).dispose();
      }
      for (const layer of parts.layers) layer.dispose();
      // The halo's drawn texture, and the lights: the sun's shadow map is a
      // 2048-square render target the renderer makes on its first shadow and
      // frees only here.
      parts.halo.material.map?.dispose();
      parts.halo.material.dispose();
      parts.sun.dispose();
      parts.moon.dispose();
      scene.remove(parts.sun, parts.sun.target, parts.moon, parts.moon.target, parts.ambient, parts.hemisphere);
    },
  };
}
