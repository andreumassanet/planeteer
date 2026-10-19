/**
 * What else lights a night sky: the aurora near the magnetic poles, a shooting
 * star now and then, the moon's own glow and its phase.
 *
 * All of it is painted inside passes that already exist: the aurora, the
 * meteor and the glow are terms in the dome's shader (`NIGHT_LIGHTS_GLSL`),
 * and the phase is a hook on the moon disc's own material (`shadeMoonPhase`).
 * No draw call is added. Everything is a pure function of the sky's clock and
 * where the camera stands, so every client sees the same aurora on the same
 * night and the same meteor in the same minute.
 */
import * as THREE from 'three';
import { unitAt } from '../sphere.ts';

/**
 * The geomagnetic north pole (the dipole's axis, IGRF 2025): the aurora's oval
 * is centred on it, not on the geographic pole, which is why it reaches lower
 * over Canada than over Siberia.
 */
const MAGNETIC_POLE = unitAt(80.8, -72.6, new THREE.Vector3());

/**
 * Geomagnetic latitude of the oval's middle, and the band either side of it
 * where the aurora can be seen at all: faint from 52 degrees, overhead at the
 * oval, gone again deep inside the polar cap.
 */
const OVAL_LAT = 67;
const AURORA_FROM: readonly [number, number] = [52, 61];
const AURORA_CAP: readonly [number, number] = [80, 88];

/**
 * Seconds of the sky's clock the aurora's motion repeats over. Every rate in
 * the shader is a whole number of turns in this period, so wrapping the clock
 * here is seamless and the float never loses its precision.
 */
const AURORA_PERIOD = 600;

/** How often a minute holds a shooting star, and how long one lasts, in seconds. */
const METEOR_CHANCE = 0.35;
const METEOR_SECONDS = 0.9;

const DEG = Math.PI / 180;

/** The uniforms the dome reads for these terms. */
export function nightLightUniforms() {
  return {
    aurora: { value: 0 },
    auroraTime: { value: 0 },
    auroraOffset: { value: 0 },
    auroraPole: { value: new THREE.Vector3(0, 1, 0) },
    meteor: { value: 0 },
    meteorPhase: { value: 0 },
    meteorFrom: { value: new THREE.Vector3(0, 1, 0) },
    meteorTo: { value: new THREE.Vector3(0, 1, 0) },
    moonGlow: { value: 0 },
  };
}
export type NightLightUniforms = ReturnType<typeof nightLightUniforms>;

/** A number in [0, 1) from an integer, the same on every client. */
function hash01(n: number, salt: number): number {
  let h = (Math.floor(n) ^ Math.imul(salt, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const north = new THREE.Vector3();
const east = new THREE.Vector3();
const from = new THREE.Vector3();

/** A direction at an azimuth and elevation in the frame `(north, east, up)`. */
function skyAt(azimuth: number, elevation: number, up: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  const c = Math.cos(elevation);
  return out
    .copy(north).multiplyScalar(c * Math.cos(azimuth))
    .addScaledVector(east, c * Math.sin(azimuth))
    .addScaledVector(up, Math.sin(elevation))
    .normalize();
}

/**
 * Writes the uniforms for this frame. `night` is 0 by day and 1 once the sky
 * is dark enough for the faint things (the limit past the Milky Way's start),
 * `overcast` hides all of it behind the deck, `space` is the dome's fade to
 * orbit and `moonUp` how far the lantern is over the horizon.
 */
export function updateNightLights(
  u: NightLightUniforms,
  time: Date,
  up: THREE.Vector3,
  night: number,
  overcast: number,
  space: number,
  moonUp: number,
): void {
  const ms = time.getTime();
  const clear = (1 - THREE.MathUtils.smoothstep(overcast, 0.25, 0.75)) * (1 - space);

  // The aurora: by geomagnetic latitude, on a night's own activity.
  const magnetic = Math.asin(THREE.MathUtils.clamp(up.dot(MAGNETIC_POLE), -1, 1)) / DEG;
  const lat = Math.abs(magnetic);
  u.auroraPole.value.copy(MAGNETIC_POLE).multiplyScalar(magnetic < 0 ? -1 : 1);
  const reach = THREE.MathUtils.smoothstep(lat, AURORA_FROM[0], AURORA_FROM[1]) *
    (1 - THREE.MathUtils.smoothstep(lat, AURORA_CAP[0], AURORA_CAP[1]));
  const day = Math.floor(ms / 86400000);
  const activity = 0.35 + 0.65 * hash01(day, 7);
  u.aurora.value = reach * activity * night * clear;
  u.auroraTime.value = ((ms / 1000) % AURORA_PERIOD + AURORA_PERIOD) % AURORA_PERIOD;
  // The oval in sky units poleward of the observer: low on the horizon from
  // its edge, overhead at its middle, behind you from inside the cap.
  u.auroraOffset.value = (OVAL_LAT - lat) * 0.75;

  // The moon's glow, a halo in the air round the disc.
  u.moonGlow.value = moonUp * night * (1 - 0.7 * THREE.MathUtils.smoothstep(overcast, 0.2, 0.8)) * (1 - space);

  // A shooting star: one minute in about three holds one, at a moment of it.
  const minute = Math.floor(ms / 60000);
  const into = (ms - minute * 60000) / 1000;
  const start = 2 + hash01(minute, 3) * 54;
  const phase = (into - start) / METEOR_SECONDS;
  if (hash01(minute, 1) >= METEOR_CHANCE || phase < 0 || phase > 1 || night * clear <= 0) {
    u.meteor.value = 0;
    return;
  }
  north.copy(MAGNETIC_POLE).addScaledVector(up, -MAGNETIC_POLE.dot(up));
  if (north.lengthSq() < 1e-8) north.set(1, 0, 0).addScaledVector(up, -up.x);
  north.normalize();
  east.crossVectors(north, up);
  const azimuth = hash01(minute, 4) * Math.PI * 2;
  const elevation = (30 + hash01(minute, 5) * 40) * DEG;
  skyAt(azimuth, elevation, up, from);
  u.meteorFrom.value.copy(from);
  const length = (10 + hash01(minute, 6) * 14) * DEG;
  const drift = azimuth + (hash01(minute, 8) - 0.5) * 1.2;
  skyAt(drift, Math.max(4 * DEG, elevation - length), up, u.meteorTo.value);
  u.meteorPhase.value = phase;
  u.meteor.value = night * clear * (0.6 + 0.4 * hash01(minute, 9));
}

/**
 * The dome's terms, read after the gradient: `auroraLight(dir)`,
 * `meteorLight(dir)` and `moonHalo(dir)`, each in the dome's linear units.
 * Needs the dome's `upDir` and `moonDir`.
 */
export const NIGHT_LIGHTS_GLSL = /* glsl */ `
  uniform float aurora;
  uniform float auroraTime;
  uniform float auroraOffset;
  uniform vec3 auroraPole;
  uniform float meteor;
  uniform float meteorPhase;
  uniform vec3 meteorFrom;
  uniform vec3 meteorTo;
  uniform float moonGlow;

  // The curtains hang in a flat layer over the observer, sampled at six
  // heights: green at the foot, violet towards the top, folded along their
  // length and striated by rays, the folds drifting on the sky's clock.
  vec3 auroraLight(vec3 dir) {
    float h = dot(dir, upDir);
    if (aurora <= 0.0 || h < 0.01) return vec3(0.0);
    vec3 n = auroraPole - upDir * dot(auroraPole, upDir);
    n = dot(n, n) > 1e-8 ? normalize(n) : vec3(1.0, 0.0, 0.0);
    vec3 e = cross(n, upDir);
    float t = auroraTime * 0.0104720;
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 6; i++) {
      float k = (float(i) + 0.5) / 6.0;
      float s = (1.0 + 1.5 * k) / h;
      vec2 p = vec2(dot(dir, e), dot(dir, n)) * s;
      float fold = 0.9 * sin(p.x * 0.33 + t * 5.0) + 0.45 * sin(p.x * 0.85 - t * 11.0)
        + 0.22 * sin(p.x * 2.1 + t * 23.0);
      float d1 = p.y - auroraOffset - fold;
      float d2 = p.y - auroraOffset - 2.2 - 0.7 * fold;
      float sheet = exp(-d1 * d1 * 3.0) + 0.45 * exp(-d2 * d2 * 2.0);
      float rays = 0.55 + 0.45 * sin(p.x * 5.5 + 1.6 * sin(p.x * 1.3 + t * 29.0));
      vec3 tint = mix(vec3(0.12, 1.0, 0.42), vec3(0.62, 0.22, 0.95), smoothstep(0.3, 0.95, k));
      acc += tint * sheet * rays * mix(1.0, 0.4, k) * exp(-0.04 * s);
    }
    return acc * (0.03 * aurora * smoothstep(0.01, 0.12, h));
  }

  // A streak from its start towards its end: a bright head, a tail that
  // fades behind it, and the whole flash brightening then gone.
  vec3 meteorLight(vec3 dir) {
    if (meteor <= 0.0) return vec3(0.0);
    vec3 head = normalize(mix(meteorFrom, meteorTo, meteorPhase));
    vec3 tail = normalize(mix(meteorFrom, meteorTo, max(meteorPhase - 0.4, 0.0)));
    vec3 seg = head - tail;
    float len = max(dot(seg, seg), 1e-10);
    float along = clamp(dot(dir - tail, seg) / len, 0.0, 1.0);
    vec3 off = dir - (tail + seg * along);
    float d2 = dot(off, off);
    float flash = smoothstep(0.0, 0.15, meteorPhase) * (1.0 - smoothstep(0.7, 1.0, meteorPhase));
    float core = exp(-d2 / 2.0e-6) * along * along;
    return vec3(0.85, 0.9, 1.0) * (0.75 * meteor * flash * core) * step(0.0, dot(dir, upDir));
  }

  vec3 moonHalo(vec3 dir) {
    if (moonGlow <= 0.0) return vec3(0.0);
    float off = 1.0 - max(dot(dir, moonDir), 0.0);
    return vec3(0.55, 0.6, 0.72) * moonGlow * (0.05 * exp(-off / 0.0025) + 0.012 * exp(-off / 0.03));
  }
`;

/**
 * Shades the moon disc and its maria by the real angle between the sun and the
 * moon: a pixel on the side the sun lights keeps its colour, the far side
 * falls to an earthshine. The lantern sits 22 degrees off the anti-solar point,
 * so what shows is a thin dark limb on one side, the gibbous moon it is.
 */
export function shadeMoonPhase(
  material: THREE.MeshBasicMaterial,
  centre: { value: THREE.Vector3 },
  sunDir: { value: THREE.Vector3 },
): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.moonCentre = centre;
    shader.uniforms.moonSun = sunDir;
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec3 vMoonWorld;\nvoid main() {')
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\n  vMoonWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform vec3 moonCentre;\nuniform vec3 moonSun;\nvarying vec3 vMoonWorld;\nvoid main() {')
      .replace(
        '#include <opaque_fragment>',
        `{
          vec3 moonNormal = normalize(vMoonWorld - moonCentre);
          float moonLit = smoothstep(-0.1, 0.15, dot(moonNormal, moonSun));
          outgoingLight *= mix(0.14, 1.0, moonLit);
        }
        #include <opaque_fragment>`,
      );
  };
  material.customProgramCacheKey = () => 'moon-phase';
}
