/**
 * Saturn's own sky: the rings, arching from horizon to horizon, and the
 * aurora over the poles. A **sky layer** — one mesh on the sky's unit sphere
 * and a shader — because the engine's sky (`worlds/sky.ts`) draws a sun, the
 * stars and the planets and nothing that belongs to one world only.
 *
 * ## The rings, where they really are
 *
 * The rings are not painted on the dome; they are **found** there, per pixel:
 * the ray from the eye along the pixel is cut with the ring plane — the
 * equator, `y = 0` in the body-fixed frame the world is drawn in — and the
 * distance of that point from the planet's centre says which ring it is. So
 * the arch is the true one for wherever the traveller stands, with its
 * parallax: from 35 N the inner edge of the C ring stands four degrees over
 * the southern horizon and the outer edge of the A ring thirty-four; from
 * 24 N they are eighteen and fifty; on the equator the rings are edge
 * on, a thread through the zenith; past about 50 degrees the inner rings sink
 * under the horizon and from the Hexagon none of them can be seen at all.
 * All of that falls out of the geometry and none of it is a rule.
 *
 * The radii are NASA's ring fact sheet, kilometres from the centre, divided by
 * the body's own `radiusKm` — the 58,232 km mean radius the deck is drawn at
 * — so they sit at their true distance in space over the drawn sphere (in
 * equatorial radii, which is how they are usually quoted, the C ring is
 * 1.24–1.53, the B 1.53–1.95, the Cassini Division 1.95–2.03 and the A ring
 * 2.03–2.27). Each band carries its **normal optical depth**, and the
 * opacity a pixel sees is `1 - exp(-tau / mu)` for a ray crossing the plane at
 * `mu`, the cosine of its angle to the pole: the B ring is opaque, the C ring
 * and the Cassini Division are veils, and every ring thickens toward the
 * horizon, where a ray crosses it slantwise.
 *
 * And it is lit as rings are lit:
 *
 * - **from the side the Sun is on**, a ring is bright by reflection; seen
 *   **from the other side** it glows only where light gets *through* it —
 *   `x e^-x` of its slant depth to the Sun — so the dense B ring goes dark and
 *   the thin C ring and the Cassini Division shine, which is the inversion
 *   every Cassini picture of the unlit face shows;
 * - **the planet's shadow** falls across them, a dark wedge on the side away
 *   from the Sun, sharpest at dusk and dawn;
 * - and **their shadow falls on the planet**: `update` returns how much of
 *   the Sun reaches the traveller through them, which on the deck is a band of
 *   shade near the equator in the winter hemisphere.
 *
 * The edges of the C, B and A rings and the Cassini Division are inked a
 * pixel wide, the way the pen draws every other edge in this project.
 *
 * ## The aurora
 *
 * Saturn's aurorae are rings of their own, round each pole at about 75
 * degrees and a thousand to two thousand kilometres up. Here they are a shell
 * between those heights, marched in four steps along the ray, folded into
 * curtains that drift, and seen only at night: overhead from the Hexagon, a
 * glow low in the north from the Ribbon, nothing from the tropics. Mostly
 * ultraviolet in life; what the eye would see is the faint pink and violet of
 * hydrogen, and that is what is drawn.
 *
 * Every colour is a `PALETTE` entry, linearised.
 */

import * as THREE from 'three';
import { PALETTE } from '../../../theme.ts';
import { linearOf } from '../../terrain.ts';
import { SATURN } from '../../../system/bodies/saturn.ts';
import type { SkyLayer } from '../../contract.ts';

/** One band of ring, km from the planet's centre (NASA's Saturnian rings fact sheet). */
export interface RingBand {
  name: string;
  inner: number;
  outer: number;
  /** Normal optical depth at the inner and outer edge, interpolated between. */
  tau: readonly [number, number];
  color: number;
}

/**
 * The rings, inside out. The B ring is split in three because its optical
 * depth is: thinner at the inner edge, opaque in the core. The Encke Gap is
 * the space between the two pieces of the A ring; the Keeler Gap and the
 * faint D, E and G rings are not drawn. The F ring is a thread 300 km wide.
 */
export const RINGS: readonly RingBand[] = [
  { name: 'C ring', inner: 74658, outer: 92000, tau: [0.05, 0.13], color: PALETTE.tan },
  { name: 'B ring, inner', inner: 92000, outer: 99000, tau: [0.9, 1.7], color: PALETTE.sand },
  { name: 'B ring', inner: 99000, outer: 115000, tau: [2.4, 2.7], color: PALETTE.cream },
  { name: 'B ring, outer', inner: 115000, outer: 117580, tau: [1.9, 1.4], color: PALETTE.cream },
  { name: 'Cassini Division', inner: 117580, outer: 122170, tau: [0.1, 0.16], color: PALETTE.slate },
  { name: 'A ring', inner: 122170, outer: 133423, tau: [0.62, 0.5], color: PALETTE.blush },
  { name: 'A ring, outside the Encke Gap', inner: 133745, outer: 136775, tau: [0.45, 0.32], color: PALETTE.blush },
  { name: 'F ring', inner: 140030, outer: 140330, tau: [0.5, 0.5], color: PALETTE.white },
];

/** The edges the pen draws: the C ring's inner, the B ring's outer, the A ring's two. */
const INKED_KM = [74658, 117580, 122170, 136775] as const;

const RADIUS_KM = SATURN.radiusKm;

/**
 * The rings' normal optical depth at a distance from the centre, in planet
 * radii: the bands above, hard-edged. The shader's version is generated from
 * the same table and softened by a pixel; this one is for the shadow on the
 * traveller and for anyone checking the numbers.
 */
export function ringDepth(r: number): number {
  const km = r * RADIUS_KM;
  for (const band of RINGS) {
    if (km < band.inner || km > band.outer) continue;
    const t = (km - band.inner) / (band.outer - band.inner);
    return band.tau[0] + (band.tau[1] - band.tau[0]) * t;
  }
  return 0;
}

/**
 * How much direct sunlight reaches a point through the rings, 0 to 1. `p` is
 * the point in planet radii (body-fixed), `sun` the unit vector to the Sun.
 * The ray toward the Sun is cut with the ring plane; if it crosses inside
 * the rings, the light is cut by `exp(-tau / mu0)`.
 */
export function ringShade(px: number, py: number, pz: number, sun: { x: number; y: number; z: number }): number {
  if (Math.abs(sun.y) < 1e-6) return 1;
  const t = -py / sun.y;
  if (t <= 0) return 1;
  const r = Math.hypot(px + t * sun.x, pz + t * sun.z);
  const tau = ringDepth(r);
  return tau === 0 ? 1 : Math.exp(-tau / Math.abs(sun.y));
}

/** The arch's elevation over the horizon, degrees, toward the equator on the meridian, for a ring radius. */
export function archElevation(lat: number, r: number): number {
  const a = (Math.abs(lat) * Math.PI) / 180;
  const vx = r - Math.cos(a);
  const vy = -Math.sin(a);
  const up = vx * Math.cos(a) + vy * Math.sin(a);
  return (Math.asin(up / Math.hypot(vx, vy)) * 180) / Math.PI;
}

const glslFloat = (v: number): string => (Number.isInteger(v) ? `${v}.0` : `${v}`);
const glslVec3 = (hex: number): string => `vec3(${linearOf(hex).map((c) => glslFloat(+c.toFixed(5))).join(', ')})`;

/** The depth and colour of the rings at radius `r`, softened by `w`: generated from `RINGS`. */
const RING_GLSL = /* glsl */ `
float bandOf(float r, float a, float b, float w) {
  return smoothstep(a - w, a + w, r) * (1.0 - smoothstep(b - w, b + w, r));
}
void ringAt(float r, float w, out float tau, out vec3 colour) {
  tau = 0.0;
  colour = vec3(0.0);
  float weight = 0.0;
  float k;
  float t;
${RINGS.map((band) => {
  const a = band.inner / RADIUS_KM;
  const b = band.outer / RADIUS_KM;
  return `  k = bandOf(r, ${glslFloat(+a.toFixed(6))}, ${glslFloat(+b.toFixed(6))}, w);
  t = clamp((r - ${glslFloat(+a.toFixed(6))}) / ${glslFloat(+(b - a).toFixed(6))}, 0.0, 1.0);
  tau += k * mix(${glslFloat(band.tau[0])}, ${glslFloat(band.tau[1])}, t);
  colour += k * ${glslVec3(band.color)};
  weight += k;`;
}).join('\n')}
  colour /= max(weight, 1e-4);
}
float inkAt(float r, float w) {
  float ink = 0.0;
${INKED_KM.map((km) => `  ink = max(ink, 1.0 - smoothstep(0.6 * w, 1.6 * w, abs(r - ${glslFloat(+(km / RADIUS_KM).toFixed(6))})));`).join('\n')}
  return ink;
}`;

const VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const FRAGMENT = /* glsl */ `
uniform vec3 uUp;
uniform float uLift;
uniform float uC;
uniform vec3 uSun;
uniform float uDay;
uniform float uAir;
uniform float uLight;
uniform float uTime;
uniform vec3 uHaze;
uniform vec3 uInk;
uniform vec3 uAuroraLow;
uniform vec3 uAuroraHigh;
varying vec3 vDir;
${RING_GLSL}

// A shell of glow between two heights over the deck, folded into curtains,
// round each pole at 72 to 80 degrees: four steps along the ray.
float auroraAt(vec3 p, vec3 d, float b) {
  float c1 = uLift * uLift - 1.015 * 1.015;
  float c2 = uLift * uLift - 1.035 * 1.035;
  float t1 = -b + sqrt(max(b * b - c1, 0.0));
  float t2 = -b + sqrt(max(b * b - c2, 0.0));
  float glow = 0.0;
  for (int i = 0; i < 4; i++) {
    float s = mix(t1, t2, (float(i) + 0.5) / 4.0);
    vec3 q = p + s * d;
    float lat = abs(q.y) / length(q);
    float oval = smoothstep(0.951, 0.966, lat) * (1.0 - smoothstep(0.978, 0.988, lat));
    float a = atan(q.z, q.x);
    float fold = 0.5 + 0.5 * sin(a * 23.0 + uTime * 0.21 + 2.6 * sin(a * 5.0 - uTime * 0.09));
    glow += oval * fold * (1.0 - float(i) * 0.2);
  }
  return glow * 0.25;
}

void main() {
  vec3 d = normalize(vDir);
  vec3 p = uUp * uLift;
  float e = dot(d, uUp);
  float b = dot(p, d);
  // The planet in the way: the ray meets the deck before it meets anything.
  float disc = b * b - uC;
  float tPlanet = (b < 0.0 && disc > 0.0) ? -b - sqrt(disc) : 1e9;

  vec3 colour = vec3(0.0);
  float alpha = 0.0;

  if (abs(d.y) > 1e-5) {
    float t = -p.y / d.y;
    if (t > 0.0 && t < tPlanet) {
      vec3 h = p + t * d;
      float r = length(h.xz);
      float w = max(fwidth(r), 2e-5);
      float tau;
      vec3 tint;
      ringAt(r, w, tau, tint);
      if (tau > 0.0) {
        // Ringlets: three ripples of the depth, each faded out before it
        // is finer than a pixel, or the far rings shimmer.
        float grain = 0.22 * sin(r * 233.0) * (1.0 - smoothstep(0.15, 0.45, w * 233.0 / 6.2832))
                    + 0.16 * sin(r * 709.0 + 1.3) * (1.0 - smoothstep(0.15, 0.45, w * 709.0 / 6.2832))
                    + 0.10 * sin(r * 1693.0 + 0.4) * (1.0 - smoothstep(0.15, 0.45, w * 1693.0 / 6.2832));
        tau *= 1.0 + grain;
        float mu = max(abs(d.y), 0.015);
        float mu0 = max(abs(uSun.y), 0.02);
        alpha = 1.0 - exp(-tau / mu);
        float bright;
        if (sign(p.y) == sign(uSun.y)) {
          bright = 0.3 + 0.75 * smoothstep(0.0, 0.14, abs(uSun.y));
        } else {
          float x = tau / mu0;
          bright = clamp(2.4 * x * exp(-x), 0.05, 0.95);
        }
        // The planet's shadow on the rings.
        float hb = dot(h, uSun);
        float hc = dot(h, h) - 1.0;
        float shade = hb < 0.0 ? smoothstep(-0.03, 0.03, hb * hb - hc) : 0.0;
        colour = tint * (bright * uLight * (1.0 - 0.92 * shade) + 0.05);
      }
      float ink = inkAt(r, w);
      colour = mix(colour, uInk, ink * 0.6);
      alpha = max(alpha, ink * 0.55);
      // Into the haze toward the horizon, as everything far off is.
      float haze = (1.0 - smoothstep(0.0, 0.3, e)) * uAir * (0.25 + 0.5 * uDay);
      colour = mix(colour, uHaze, haze);
      alpha *= smoothstep(-0.004, 0.03, e);
    }
  }

  // The aurora, behind the rings and only by night, from high latitudes.
  float night = 1.0 - smoothstep(0.1, 0.6, uDay);
  if (night > 0.0 && abs(uUp.y) > 0.8 && e > -0.02) {
    float glow = auroraAt(p, d, b) * night * smoothstep(0.8, 0.88, abs(uUp.y));
    vec3 hue = mix(uAuroraLow, uAuroraHigh, smoothstep(0.0, 0.5, e));
    colour = colour * alpha + hue * glow * (1.0 - alpha);
    alpha = clamp(alpha + glow * (1.0 - alpha), 0.0, 1.0);
    colour /= max(alpha, 1e-4);
  }

  if (alpha < 0.002) discard;
  gl_FragColor = vec4(colour, alpha);
}`;

// The layer's shape is the engine's (`SkyLayer` in `worlds/contract.ts`),
// re-exported here for whoever imported it from Saturn first.
export type { SkyLayer, SkyLayerInput } from '../../contract.ts';

/**
 * Saturn's rings and aurora as a sky layer. `radius` is the walkable radius
 * in world units (`surfaceRadiusOf(radiusKm)`), `air` the spec's `sky.air`.
 */
export function createSaturnSky(radius: number, air: number): SkyLayer {
  const uniforms = {
    uUp: { value: new THREE.Vector3(0, 1, 0) },
    uLift: { value: 1 },
    uC: { value: 0 },
    uSun: { value: new THREE.Vector3(0, 1, 0) },
    uDay: { value: 1 },
    uAir: { value: air },
    uLight: { value: 1 },
    uTime: { value: 0 },
    uHaze: { value: new THREE.Color().fromArray(linearOf(PALETTE.cream)) },
    uInk: { value: new THREE.Color().fromArray(linearOf(PALETTE.ink)) },
    uAuroraLow: { value: new THREE.Color().fromArray(linearOf(PALETTE.pink)) },
    uAuroraHigh: { value: new THREE.Color().fromArray(linearOf(PALETTE.violet)) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    fog: false,
  });
  material.name = 'world:saturn-rings';
  const geometry = new THREE.SphereGeometry(0.97, 48, 24);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'saturn-rings';
  // After the dome, the stars, the planets and the Sun's disc: a ring in
  // front of the Sun hides it.
  mesh.renderOrder = -7;
  mesh.frustumCulled = false;

  return {
    object: mesh,
    update(input) {
      const length = input.observer.length() || radius;
      const lift = length / radius;
      uniforms.uUp.value.copy(input.observer).divideScalar(length);
      uniforms.uLift.value = lift;
      // |p|^2 - 1 taken in double precision, where the altitude is not lost.
      const altitude = (length - radius) / radius;
      uniforms.uC.value = altitude * (2 + altitude);
      uniforms.uSun.value.copy(input.sun);
      uniforms.uDay.value = input.day;
      uniforms.uTime.value = input.time;
      uniforms.uLight.value = input.light ?? 1;
      if (input.haze !== undefined) uniforms.uHaze.value.copy(input.haze);
      const u = uniforms.uUp.value;
      return ringShade(u.x * lift, u.y * lift, u.z * lift, input.sun);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
