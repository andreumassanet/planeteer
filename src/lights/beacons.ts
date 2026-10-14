/** Red aviation lights on the tallest landmarks. */
import * as THREE from 'three';
import { PALETTE } from '../theme.ts';
import { NIGHT_CHUNK, atlasGain, atlasSun } from './night.ts';
import { atlasLandmarkTime } from './flood.ts';

/** The most red lights drawn at once: a handful of towers stand at a time. */
export const MAX_BEACONS = 32;
/** A beacon's glow across, in world units, and its floor and ceiling on screen in pixels. */
const BEACON_SIZE = 2.8;
const BEACON_MIN_PIXELS = 2.5;
const BEACON_MAX_PIXELS = 20;
/**
 * An aviation light's red: the palette's `red`, barely towards white so the
 * halo keeps its hue under 1 (the city lights' rule, `POINT_LIGHT`), and a
 * heart further towards white and over 1 so the bloom takes it.
 */
const BEACON_LIGHT = new THREE.Color(PALETTE.red).lerp(new THREE.Color(PALETTE.white), 0.08);
const BEACON_CORE = new THREE.Color(PALETTE.red).lerp(new THREE.Color(PALETTE.white), 0.3);
/**
 * One flash every `BEACON_PERIOD` seconds, and every beacon in step: the
 * medium-intensity obstruction light a tall tower carries flashes twenty to
 * forty times a minute, and two lights on one tower flashing out of step read
 * as a fault. Never quite out (`BEACON_REST`), so a still frame never misses one.
 */
const BEACON_PERIOD = 2;
const BEACON_REST = 0.18;

export interface Beacons {
  points: THREE.Points;
  /** `positions` is xyz in world space, `count` of them. */
  update(positions: Float32Array, count: number): void;
  /** A one-point twin for `warm.ts`. */
  proxy(): THREE.Points;
}

/**
 * The red aviation lights on the landmarks of 150 m and over: one additive
 * point a light, in `createFireGlow`'s manner — depth-tested so the tower's own
 * mast hides the one behind it, un-inked, gated by the terminator at the
 * light's own position and by the master gain, so `atlas.brightness(0)` puts
 * them out with every other light. It is not in the model because
 * `validate` refuses Points in a monument, and rightly: the scene owns what
 * shines.
 */
export function createBeacons(): Beacons {
  const position = new Float32Array(MAX_BEACONS * 3);
  const geometry = new THREE.BufferGeometry();
  const positions = new THREE.BufferAttribute(position, 3);
  positions.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', positions);
  geometry.setDrawRange(0, 0);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Infinity);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib['fog']!),
      atlasSun,
      atlasGain,
      atlasLandmarkTime,
      atlasBeaconLight: { value: BEACON_LIGHT.clone() },
      atlasBeaconCore: { value: BEACON_CORE.clone() },
      screenScale: { value: 450 },
    },
    vertexShader: /* glsl */ `
      uniform vec3 atlasSun;
      uniform float atlasGain;
      uniform float atlasLandmarkTime;
      uniform float screenScale;
      varying float vAlpha;
      #include <common>
      #include <fog_pars_vertex>
      ${NIGHT_CHUNK}
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        float dist = max(-mvPosition.z, 1.0);
        float phase = fract(atlasLandmarkTime / ${BEACON_PERIOD.toFixed(1)});
        float flash = smoothstep(0.0, 0.05, phase) * (1.0 - smoothstep(0.32, 0.46, phase));
        vAlpha = atlasNight(normalize(position), atlasSun) * atlasGain * mix(${BEACON_REST.toFixed(2)}, 1.0, flash);
        gl_PointSize = clamp(${BEACON_SIZE.toFixed(2)} * projectionMatrix[1][1] * screenScale / dist,
          ${BEACON_MIN_PIXELS.toFixed(1)}, ${BEACON_MAX_PIXELS.toFixed(1)});
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 atlasBeaconLight;
      uniform vec3 atlasBeaconCore;
      varying float vAlpha;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        if (vAlpha < 0.004) discard;
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float halo = 1.0 - smoothstep(0.0, 1.0, r);
        float heart = 1.0 - smoothstep(0.0, 0.35, r);
        gl_FragColor = vec4(atlasBeaconLight * halo * halo + atlasBeaconCore * heart * 2.4, vAlpha);
        #ifdef USE_FOG
          // Attenuated by the haze, never mixed towards it: see the city lights.
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
  points.name = 'beacons';
  points.renderOrder = 2;
  points.frustumCulled = false;
  return {
    points,
    update(source, count) {
      const n = Math.min(count, MAX_BEACONS);
      position.set(source.subarray(0, n * 3));
      positions.needsUpdate = true;
      geometry.setDrawRange(0, n);
      material.uniforms.screenScale!.value = (typeof innerHeight === 'number' ? innerHeight : 900) * 0.5;
    },
    proxy() {
      const twin = new THREE.BufferGeometry();
      twin.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
      return new THREE.Points(twin, material);
    },
  };
}
