import * as THREE from 'three';
import { SCENERY_SCALE, STATURE } from './stature.ts';

/**
 * The wind the plants move in: one clock, one strength and one direction for
 * the grass (`grass.ts`) and the trees (`foliage.ts`), so a gust that lays the
 * meadow over is the gust that bends the wood behind it.
 *
 * The uniforms are shared objects: a material that moves with the wind puts
 * these very objects in its `shader.uniforms`, and `setWind` writes them once a
 * frame. The weather (`weather.ts`) says how hard it blows and from where at
 * the player; that is the whole input, and nothing about it is sent.
 */

/** The clock the wind runs on wraps here, so a shader's float time keeps its precision. */
export const WIND_TIME_WRAP = 1800;
/** Metres a second of wind at which the strength is 1: a fresh breeze. */
export const WIND_FULL = 12;
/** Units a metre the wind was measured in: a person is `STATURE` times life size, and so is a leaf's flutter. */
const WIND_METRE = SCENERY_SCALE * STATURE;

export const WIND = {
  /** Seconds, wrapped at `WIND_TIME_WRAP`. */
  uTime: { value: 0 },
  /** 0.08 in a calm to 1.6 in a gale; see `WIND_FULL`. */
  uWindStrength: { value: 0.3 },
  /** Where the wind blows *to*, in world space, in the tangent plane at the player. */
  uWindWorld: { value: new THREE.Vector3(1, 0, 0) },
  /** Square to it in the same plane: the axis a gust's front runs along. */
  uWindAcross: { value: new THREE.Vector3(0, 0, 1) },
} satisfies Record<string, THREE.IUniform>;

const north = new THREE.Vector3();
const east = new THREE.Vector3();
const up = new THREE.Vector3();

/**
 * This frame's wind: `now` in milliseconds, the weather's wind where the
 * player stands (metres a second, and the bearing it comes *from*), and where
 * that is. East is `north x up`, the way `sphere.ts` turns: a hand-written
 * `up x north` is west, and the wood would lean into the wind.
 */
export function setWind(now: number, wind: { speed: number; from: number }, at: THREE.Vector3): void {
  WIND.uTime.value = (now / 1000) % WIND_TIME_WRAP;
  WIND.uWindStrength.value = Math.min(1.6, Math.max(0.08, wind.speed / WIND_FULL));
  up.copy(at).normalize();
  north.set(0, 1, 0).projectOnPlane(up);
  if (north.lengthSq() < 1e-8) north.set(1, 0, 0).projectOnPlane(up);
  north.normalize();
  east.crossVectors(north, up).normalize();
  const toward = ((wind.from + 180) * Math.PI) / 180;
  WIND.uWindWorld.value.copy(north).multiplyScalar(Math.cos(toward)).addScaledVector(east, Math.sin(toward)).normalize();
  WIND.uWindAcross.value.crossVectors(up, WIND.uWindWorld.value).normalize();
}

/**
 * The uniforms and the gust, for a vertex stage working in world space.
 *
 * `windGust` is the grass's gust (`vegGust` in `grass.ts`) taken off the
 * grass's tangent plane and onto the world's: bands square to the wind, broken
 * by a noise, both carried downwind at a speed that rises with it; 0 to 1.
 * The coordinates are metres of the figure along and across the wind, so the
 * fronts are as wide over a wood as over a meadow.
 */
export const WIND_GLSL = /* glsl */ `
uniform float uTime;
uniform float uWindStrength;
uniform vec3 uWindWorld;
uniform vec3 uWindAcross;
float windHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float windNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(windHash(i), windHash(i + vec2(1.0, 0.0)), u.x), mix(windHash(i + vec2(0.0, 1.0)), windHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float windGust(vec3 world) {
  // Wrapped a few kilometres, so a float keeps the fronts' detail on a planet
  // sixteen thousand units across; a seam every 4 km of wind is nothing seen.
  vec2 p = mod(vec2(dot(world, uWindAcross), dot(world, uWindWorld)) / ${WIND_METRE.toFixed(4)}, 4096.0);
  vec2 q = p - vec2(0.0, uTime * (1.5 + uWindStrength * 5.0));
  float bands = 0.5 + 0.5 * sin(q.y * 0.22);
  float n = windNoise(q * 0.06);
  return smoothstep(0.45, 0.95, bands * 0.6 + n * 0.55);
}
`;

const gustHash = (x: number, y: number): number => {
  // `windHash`, in doubles where the shader has floats: the same fronts, a
  // hair apart in where their noise breaks.
  let a = (x * 0.1031) % 1;
  let b = (y * 0.1031) % 1;
  let c = a;
  if (a < 0) a += 1;
  if (b < 0) b += 1;
  if (c < 0) c += 1;
  const d = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33);
  a += d;
  b += d;
  c += d;
  const v = ((a + b) * c) % 1;
  return v < 0 ? v + 1 : v;
};

/**
 * `windGust` for the CPU, at a world point and the uniforms' own clock: what
 * a leaf in the air is pushed by (`ambient.ts`), so it is carried off by the
 * front that lays the grass under it over. 0 to 1.
 */
export function windGustAt(world: THREE.Vector3): number {
  const across = WIND.uWindAcross.value;
  const toward = WIND.uWindWorld.value;
  const px = ((world.dot(across) / WIND_METRE) % 4096 + 4096) % 4096;
  const py = ((world.dot(toward) / WIND_METRE) % 4096 + 4096) % 4096;
  const qx = px;
  const qy = py - WIND.uTime.value * (1.5 + WIND.uWindStrength.value * 5);
  const bands = 0.5 + 0.5 * Math.sin(qy * 0.22);
  const nx = qx * 0.06;
  const ny = qy * 0.06;
  const ix = Math.floor(nx);
  const iy = Math.floor(ny);
  const fx = nx - ix;
  const fy = ny - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const bottom = gustHash(ix, iy) + (gustHash(ix + 1, iy) - gustHash(ix, iy)) * ux;
  const top = gustHash(ix, iy + 1) + (gustHash(ix + 1, iy + 1) - gustHash(ix, iy + 1)) * ux;
  const n = bottom + (top - bottom) * uy;
  const t = Math.min(1, Math.max(0, (bands * 0.6 + n * 0.55 - 0.45) / 0.5));
  return t * t * (3 - 2 * t);
}
