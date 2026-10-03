/**
 * The night on another world, lit as Earth's is: by the street lamps, the
 * lit doorways and the headlights round the traveller, through Earth's own
 * per-pixel pools (`lights.ts`: `setNearLamps`, `setHeadlights`, and
 * `bindNearLights` / `nearLightsGLSL` / `nearLightsChunk` on every surface
 * they land on). Nothing here is a renderer light; a pool is drawn emission
 * on the surface it falls on, stepped in bands, as on Earth.
 *
 * The planet is at the origin, so a surface's world position is its own
 * up, and `atlasNight` in the shader turns the pools on only where the Sun
 * is down — the same terminator Earth's windows keep.
 */

import * as THREE from 'three';
import { LAMPS_OFF_ABOVE, LAMP_FIELD, NEAR_HEADLIGHTS, NEAR_LAMPS, bindNearLights, nearLightsChunk, nearLightsGLSL, setFires, setHeadlights, setNearLamps, setSunDirection } from '../lights.ts';
import { lonOf } from '../sphere.ts';

/**
 * Lights `material` by the near lamps and headlights after dark, on top of
 * whatever its own `onBeforeCompile` already does. Call once, after that.
 */
export function litAtNight(material: THREE.Material): void {
  const own = material.onBeforeCompile;
  const key = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    own.call(material, shader, renderer);
    bindNearLights(shader.uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vNearLit;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvNearLit = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vNearLit;\n${nearLightsGLSL()}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${nearLightsChunk('vNearLit')}`);
  };
  material.customProgramCacheKey = () => `${key.call(material)}:night`;
  material.needsUpdate = true;
}

/** What hands the lights over each frame: the lamps near a point, and the craft whose headlights burn. */
export interface NightSources {
  /** Writes `x, y, z, distance` of the lamps within `LAMP_FIELD` of `point`, nearest first; returns how many. */
  lampsNear(point: THREE.Vector3, out: Float32Array, max: number): number;
  /** Writes `x, y, z, dx, dy, dz, strength` of each headlight burning; returns how many. */
  headlights(out: Float32Array, max: number): number;
}

const lamps = new Float32Array(NEAR_LAMPS * 4);
const heads = new Float32Array(NEAR_HEADLIGHTS * 7);
const none = new Float32Array(0);

/**
 * Each frame, before the render: the Sun's direction for the terminator,
 * and the lamps and headlights near the traveller — none by day, where no
 * pool would show and no search is made.
 */
export function updateNight(camera: THREE.Camera, sun: THREE.Vector3, elevation: number, player: THREE.Vector3, sources: NightSources, time: number): void {
  setSunDirection(sun, lonOf(sun.x, sun.z));
  // Earth's campfires are not here: nothing of them may linger from a visit.
  setFires(camera, none, 0, time);
  if (elevation > (LAMPS_OFF_ABOVE * Math.PI) / 180) {
    setHeadlights(camera, heads, 0);
    setNearLamps(camera, lamps, 0);
    return;
  }
  setHeadlights(camera, heads, sources.headlights(heads, NEAR_HEADLIGHTS));
  setNearLamps(camera, lamps, sources.lampsNear(player, lamps, NEAR_LAMPS));
}

export { LAMP_FIELD };
