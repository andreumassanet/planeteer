/** The glow on campfire flames, and the campfires' per-pixel light. */
import * as THREE from 'three';
import { NIGHT_CHUNK, atlasGain, atlasSun } from './night.ts';
import { FIRE_CORE, FIRE_REACH, FLICKER_GLSL, LAMP_FIELD, NEAR_FIRES, atlasFireCount, atlasFireTint, atlasFires, fireFlicker, lampView, reaches } from './near-lights.ts';

/** The most campfires whose flames glow at once, nearest first, and how far off one still does. */
export const MAX_FIRE_GLOWS = 16;
export const FIRE_GLOW_REACH = 600;
/** A fire's glow across, in world units, at a full flicker: a little over its ring of stones. */
const FIRE_GLOW_SIZE = 3.4;
/** How many floats a fire takes in `setFires`'s buffer. */
export const FIRE_STRIDE = 5;

/**
 * The glow on the flames themselves: one additive point a fire, its heart
 * drawn brighter than white so the frame's bloom (`post.ts`) takes it, its
 * halo the fire's own orange, both breathing with `atlasFlicker`. Un-inked,
 * depth-tested so a hill hides it, gated by the terminator like the lamps' pools.
 */
function createFireGlow(): { points: THREE.Points; update(fires: Float32Array, count: number, time: number): void } {
  const position = new Float32Array(MAX_FIRE_GLOWS * 3);
  const phase = new Float32Array(MAX_FIRE_GLOWS);
  const geometry = new THREE.BufferGeometry();
  const positions = new THREE.BufferAttribute(position, 3);
  positions.setUsage(THREE.DynamicDrawUsage);
  const phases = new THREE.BufferAttribute(phase, 1);
  phases.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', positions);
  geometry.setAttribute('phase', phases);
  geometry.setDrawRange(0, 0);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Infinity);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib['fog']!),
      atlasSun,
      atlasGain,
      atlasTime: { value: 0 },
      atlasFireTint,
      atlasFireCore: { value: FIRE_CORE.clone() },
      screenScale: { value: 450 },
    },
    vertexShader: /* glsl */ `
      uniform vec3 atlasSun;
      uniform float atlasGain;
      uniform float atlasTime;
      uniform float screenScale;
      attribute float phase;
      varying float vAlpha;
      varying float vFlicker;
      #include <common>
      #include <fog_pars_vertex>
      ${NIGHT_CHUNK}
      ${FLICKER_GLSL}
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        float dist = max(-mvPosition.z, 1.0);
        vFlicker = atlasFlicker(atlasTime, phase);
        vAlpha = atlasNight(normalize(position), atlasSun) * atlasGain
          * (1.0 - smoothstep(${(FIRE_GLOW_REACH * 0.7).toFixed(1)}, ${FIRE_GLOW_REACH.toFixed(1)}, dist));
        gl_PointSize = clamp(${FIRE_GLOW_SIZE.toFixed(2)} * vFlicker * projectionMatrix[1][1] * screenScale / dist, 2.0, 96.0);
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 atlasFireTint;
      uniform vec3 atlasFireCore;
      varying float vAlpha;
      varying float vFlicker;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        if (vAlpha < 0.004) discard;
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float halo = 1.0 - smoothstep(0.0, 1.0, r);
        float heart = 1.0 - smoothstep(0.0, 0.32, r);
        vec3 light = atlasFireTint * halo * halo * 0.5 + atlasFireCore * heart * 2.6 * vFlicker;
        gl_FragColor = vec4(light, vAlpha);
        #ifdef USE_FOG
          gl_FragColor *= 1.0 - smoothstep(fogNear, fogFar, vFogDepth);
        #endif
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    fog: true,
  });
  material.userData.outlineParameters = { visible: false };
  const points = new THREE.Points(geometry, material);
  points.name = 'fire-glow';
  points.renderOrder = 2;
  points.frustumCulled = false;
  return {
    points,
    update(fires, count, time) {
      const n = Math.min(count, MAX_FIRE_GLOWS);
      for (let i = 0; i < n; i++) {
        const o = i * FIRE_STRIDE;
        position[i * 3] = fires[o]!;
        position[i * 3 + 1] = fires[o + 1]!;
        position[i * 3 + 2] = fires[o + 2]!;
        phase[i] = fires[o + 4]!;
      }
      if (n > 0) {
        positions.needsUpdate = true;
        phases.needsUpdate = true;
      }
      geometry.setDrawRange(0, n);
      material.uniforms.atlasTime!.value = time;
      material.uniforms.screenScale!.value = (typeof innerHeight === 'number' ? innerHeight : 900) * 0.5;
    },
  };
}

const fireGlow = createFireGlow();

/** The glow on the near campfires' flames, to add to the scene once. */
export const fireGlows: THREE.Points = fireGlow.points;

/**
 * Hands the shaders this frame's campfires: `fires` is `x, y, z, distance,
 * phase` in world space, `FIRE_STRIDE` floats each, nearest first, `count`
 * of them. The first `NEAR_FIRES` within `LAMP_FIELD` light the ground at
 * `fireFlicker`'s strength, fading out over the field's last fifth as a lamp
 * does; every one of them, up to `MAX_FIRE_GLOWS`, glows. `time` is seconds.
 * Call before `setNearLamps`, which finishes the reach.
 */
export function setFires(camera: THREE.Camera, fires: Float32Array, count: number, time: number): void {
  const view = camera.matrixWorldInverse;
  reaches.fire = 0;
  let lit = 0;
  for (let i = 0; i < count && lit < NEAR_FIRES; i++) {
    const o = i * FIRE_STRIDE;
    const distance = fires[o + 3]!;
    if (distance > LAMP_FIELD) break;
    lampView.set(fires[o]!, fires[o + 1]!, fires[o + 2]!).applyMatrix4(view);
    const fade = 1 - Math.min(1, Math.max(0, (distance - LAMP_FIELD * 0.8) / (LAMP_FIELD * 0.2)));
    atlasFires.value[lit]!.set(lampView.x, lampView.y, lampView.z, fade * fireFlicker(time, fires[o + 4]!));
    reaches.fire = Math.max(reaches.fire, lampView.length() + FIRE_REACH);
    lit++;
  }
  atlasFireCount.value = lit;
  fireGlow.update(fires, count, time);
}
