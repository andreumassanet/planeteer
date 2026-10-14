/** The precipitation mesh: its shaders and geometry, and where a drop is in its box. */
import * as THREE from 'three';
import { MAX_DROPS, RAIN_BOX, STREAK, STREAK_WIDTH, mod, mulberry } from './constants.ts';

export const DROP_VERTEX = /* glsl */ `
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

export const DROP_FRAGMENT = /* glsl */ `
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

/** The precipitation mesh and the uniforms its shader reads. */
export function createDropLayer() {
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
  return { uniforms, dropMaterial, drops };
}
