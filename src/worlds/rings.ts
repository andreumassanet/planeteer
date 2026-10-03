/**
 * Narrow rings in a sky: a sky layer (`SkyLayer` in `contract.ts`) for the
 * ring systems that are a handful of threads rather than Saturn's sheet —
 * Uranus's dark, narrow, nearly opaque ringlets and Neptune's faint dusty
 * ones with their arcs. Saturn's own (`bodies/saturn/sky.ts`) is the same
 * idea with more in it.
 *
 * ## Where
 *
 * As Saturn's: per pixel, the ray from the eye is cut with the ring plane —
 * the equator, `y = 0` in the body-fixed frame — and the distance of that
 * point from the planet's centre says which ring it is, so the arch is the
 * true one for wherever the traveller stands, behind the planet where the
 * planet is in the way, and gone below the horizon from high latitudes.
 *
 * ## How thin
 *
 * A ring two kilometres wide forty thousand away is a tenth of a pixel. Each
 * band is therefore **box-filtered over the pixel's own footprint** in radius
 * (`fwidth`): what a pixel shows is the fraction of it the band covers times
 * the band's depth, so a thread too thin to see is a faint line a pixel
 * wide, the same total darkness as the real one spread over what a screen
 * can draw — and Uranus's sky is the Epsilon ring, three pixels wide
 * overhead, with eight hairlines inside it.
 *
 * ## How lit
 *
 * From the Sun's side a ring is lit by reflection, from the other by what
 * passes through it; a dusty ring (`dusty` toward 1) brightens steeply
 * looking toward the Sun, the forward scattering that made Neptune's rings
 * stand out in Voyager's departing look back. The planet's shadow crosses
 * them. And by day the air between the eye and the rings washes them toward
 * the haze.
 *
 * ## Arcs
 *
 * A band may be clumped into arcs (Neptune's Adams ring): each arc is a span
 * of longitude in a frame that goes round at the band's own `period`, so the
 * arcs keep their order and orbit the planet, and the sky turns under them.
 */

import * as THREE from 'three';
import type { SkyLayer, SkyLayerFactory } from './contract.ts';
import { linearOf } from './terrain.ts';
import { PALETTE } from '../theme.ts';

const DEG = Math.PI / 180;
const J2000_MS = Date.UTC(2000, 0, 1, 12);

export interface ThinRing {
  name: string;
  /** km from the planet's centre. */
  inner: number;
  outer: number;
  /**
   * Normal optical depth as drawn. The real ones are given beside each
   * table; the faint dusty rings are drawn several times their real depth,
   * or no screen would show them at all.
   */
  tau: number;
  /** A `PALETTE` entry. */
  color: number;
  /** 0 a ring of large dark particles, 1 a ring of dust that shines forward. */
  dusty: number;
  /** Clumps in this band: spans of longitude, degrees, at J2000 from the planet's equinox. */
  arcs?: readonly { from: number; to: number; tau: number }[];
}

export interface ThinRingSystem {
  rings: readonly ThinRing[];
  /** The planet's radius, km, that the walkable sphere is drawn at. */
  radiusKm: number;
  /** The sky's air, for the haze over them. */
  air: number;
  /** Sidereal period of the arcs' band, hours, in the sense the planet turns. */
  arcPeriodHours?: number;
}

const f = (v: number): string => {
  const s = (+v.toFixed(6)).toString();
  return s.includes('.') || s.includes('e') ? s : `${s}.0`;
};
const v3 = (hex: number): string => `vec3(${linearOf(hex).map((c) => f(c)).join(', ')})`;

/** The GLSL of a system's rings: their depth and colour at a radius, box-filtered over `w`. */
function ringGlsl(system: ThinRingSystem): string {
  const R = system.radiusKm;
  const lines = system.rings.map((ring) => {
    const arcs = ring.arcs ?? [];
    const clumps =
      arcs.length === 0
        ? f(ring.tau)
        : `(${f(ring.tau)} + ${arcs
            .map((arc) => {
              const from = arc.from * DEG;
              const length = ((((arc.to - arc.from) % 360) + 360) % 360) * DEG;
              return `${f(arc.tau)} * arcAt(lon, ${f(from)}, ${f(length)})`;
            })
            .join(' + ')})`;
    return `  k = cover(r, w, ${f(ring.inner / R)}, ${f(ring.outer / R)});
  t = k * ${clumps};
  tau += t;
  colour += t * ${v3(ring.color)};
  dust += t * ${f(ring.dusty)};`;
  });
  return /* glsl */ `
uniform float uArcTurn;
float cover(float r, float w, float a, float b) {
  return clamp((min(r + 0.5 * w, b) - max(r - 0.5 * w, a)) / w, 0.0, 1.0);
}
float arcAt(float lon, float start, float span) {
  float x = mod(lon - uArcTurn - start, 6.2831853);
  return step(x, span) * smoothstep(0.0, 0.01, x) * smoothstep(0.0, 0.01, span - x);
}
void ringsAt(float r, float w, float lon, out float tau, out vec3 colour, out float dust) {
  tau = 0.0;
  colour = vec3(0.0);
  dust = 0.0;
  float k;
  float t;
${lines.join('\n')}
  colour /= max(tau, 1e-6);
  dust /= max(tau, 1e-6);
}`;
}

const VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const fragment = (rings: string): string => /* glsl */ `
uniform vec3 uUp;
uniform float uLift;
uniform float uC;
uniform vec3 uSun;
uniform float uDay;
uniform float uAir;
uniform float uLight;
uniform vec3 uHaze;
varying vec3 vDir;
${rings}
void main() {
  vec3 d = normalize(vDir);
  vec3 p = uUp * uLift;
  float e = dot(d, uUp);
  float b = dot(p, d);
  float disc = b * b - uC;
  float tPlanet = (b < 0.0 && disc > 0.0) ? -b - sqrt(disc) : 1e9;
  if (abs(d.y) < 1e-5) discard;
  float s = -p.y / d.y;
  if (s <= 0.0 || s > tPlanet) discard;
  vec3 h = p + s * d;
  float r = length(h.xz);
  float w = max(fwidth(r), 1e-6);
  float tau;
  vec3 tint;
  float dust;
  ringsAt(r, w, atan(-h.z, h.x), tau, tint, dust);
  if (tau <= 0.0) discard;
  float mu = max(abs(d.y), 0.015);
  float mu0 = max(abs(uSun.y), 0.02);
  float alpha = 1.0 - exp(-tau / mu);
  float bright;
  if (sign(p.y) == sign(uSun.y)) {
    bright = 0.3 + 0.7 * smoothstep(0.0, 0.14, abs(uSun.y));
  } else {
    float x = tau / mu0;
    bright = clamp(2.4 * x * exp(-x), 0.03, 0.9);
  }
  // Dust shines looking toward the Sun.
  float toward = max(dot(d, uSun), 0.0);
  bright += dust * 3.0 * pow(toward, 6.0);
  float hb = dot(h, uSun);
  float hc = dot(h, h) - 1.0;
  float shade = hb < 0.0 ? smoothstep(-0.03, 0.03, hb * hb - hc) : 0.0;
  vec3 colour = tint * (bright * uLight * (1.0 - 0.95 * shade) + 0.02);
  // The air between: by day it washes the rings toward the haze.
  float haze = uAir * uDay * (0.45 + 0.4 * (1.0 - smoothstep(0.0, 0.3, e)));
  colour = mix(colour, uHaze, haze);
  alpha *= (1.0 - 0.6 * haze) * smoothstep(-0.004, 0.03, e);
  if (alpha < 0.002) discard;
  gl_FragColor = vec4(colour, alpha);
}`;

/** The rings' drawn depth at a radius in planet radii, arcs left out: for their shadow on the traveller. */
function depthAt(system: ThinRingSystem, r: number): number {
  const km = r * system.radiusKm;
  let tau = 0;
  for (const ring of system.rings) if (km >= ring.inner && km <= ring.outer) tau += ring.tau;
  return tau;
}

/** A thin ring system as a sky layer. */
export function thinRings(system: ThinRingSystem): SkyLayerFactory {
  return (radius: number): SkyLayer => {
    const uniforms = {
      uUp: { value: new THREE.Vector3(0, 1, 0) },
      uLift: { value: 1 },
      uC: { value: 0 },
      uSun: { value: new THREE.Vector3(0, 1, 0) },
      uDay: { value: 1 },
      uAir: { value: system.air },
      uLight: { value: 1 },
      uHaze: { value: new THREE.Color().fromArray(linearOf(PALETTE.cream)) },
      uArcTurn: { value: 0 },
    };
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERTEX,
      fragmentShader: fragment(ringGlsl(system)),
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      fog: false,
    });
    material.name = 'world:thin-rings';
    const geometry = new THREE.SphereGeometry(0.97, 48, 24);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'thin-rings';
    mesh.renderOrder = -7;
    mesh.frustumCulled = false;
    return {
      object: mesh,
      update(input) {
        const length = input.observer.length() || radius;
        const lift = length / radius;
        uniforms.uUp.value.copy(input.observer).divideScalar(length);
        uniforms.uLift.value = lift;
        const altitude = (length - radius) / radius;
        uniforms.uC.value = altitude * (2 + altitude);
        uniforms.uSun.value.copy(input.sun);
        uniforms.uDay.value = input.day;
        uniforms.uLight.value = input.light ?? 1;
        if (input.haze !== undefined) uniforms.uHaze.value.copy(input.haze);
        // The arcs' frame: round at their own period from the equinox, less
        // the body's turn, so in body-fixed longitude.
        if (system.arcPeriodHours !== undefined && input.date !== undefined) {
          const hours = (input.date.getTime() - J2000_MS) / 3600000;
          const orbit = (2 * Math.PI * hours) / system.arcPeriodHours;
          uniforms.uArcTurn.value = (orbit - (input.turn ?? 0)) % (2 * Math.PI);
        }
        // The shadow on the traveller: the ray to the Sun cut with the plane.
        const s = input.sun;
        const u = uniforms.uUp.value;
        if (Math.abs(s.y) < 1e-6) return 1;
        const t = (-u.y * lift) / s.y;
        if (t <= 0) return 1;
        const r = Math.hypot(u.x * lift + t * s.x, u.z * lift + t * s.z);
        const tau = depthAt(system, r);
        return tau === 0 ? 1 : Math.exp(-tau / Math.abs(s.y));
      },
      dispose() {
        geometry.dispose();
        material.dispose();
      },
    };
  };
}
