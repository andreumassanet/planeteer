// The waves: a field of plane waves in world space, drawn as a normal rather
// than displaced. Each octave is a 3D direction; on the sphere only its part in
// the tangent plane shows, so the field is seamless over the whole planet and
// needs no frame. Every octave fades out as the pixel grows past an eighth of
// its wavelength, so far water and the planet from orbit are calm, not noise.
//
// A sum of fixed sines is a lattice, and from the air a lattice repeats. So
// every octave's height and phase are bent by a slow noise in world space
// (`atlasSeaNoise`, three scales from 80 to 900 units): the swells come in
// trains and patches, their crests curve, and no two stretches of sea match.
// Two long swells, faded in only as the pixel grows, carry the sea seen from a
// plane once the short waves are gone.
//
// The phases are kept on the CPU in double precision, as cycles, so the shader
// never multiplies a clock: `fract(dot(p, d) / L + phase)` is exact enough at
// the planet's radius.

import * as THREE from 'three';
import { surfaceQuality } from '../graphics-quality.ts';
import { SCENERY_SCALE } from '../stature.ts';
import { FOAM_COLOR } from './water-colour.ts';

interface Octave {
  /** Wavelength, units. */
  length: number;
  /** Peak slope it adds, radians at full weight. */
  slope: number;
  /** Direction in world space; normalised below. */
  dir: readonly [number, number, number];
  /**
   * `swell` crests make the whitecaps, `chop` breaks the surf into lace,
   * `long` is only drawn from the air (see `LONG_FROM`).
   */
  kind: 'long' | 'swell' | 'chop';
  /** Its height's gain and its phase's bend, 0 to 1 each: channels of the slow noise (`nA` 900 units, `nB` 260, `nC` 80). */
  amp: string;
  warp: string;
}

/**
 * Two long swells (69 and 110 m), four swells (16 to 41 m) and four chops (1.3
 * to 6 m). The directions are spread in 3D so that no region of the planet sees
 * them all edge-on; no two octaves read the same pair of noise channels.
 */
const OCTAVES: readonly Octave[] = [
  { length: 140, slope: 0.08, dir: [0.3, -0.78, -0.55], kind: 'long', amp: 'nA.x', warp: 'nA.y' },
  { length: 88, slope: 0.08, dir: [-0.71, 0.05, -0.7], kind: 'long', amp: 'nA.z', warp: 'nB.x' },
  { length: 52, slope: 0.16, dir: [0.62, 0.31, -0.72], kind: 'swell', amp: 'nA.w', warp: 'nB.y' },
  { length: 33, slope: 0.14, dir: [-0.35, 0.71, 0.6], kind: 'swell', amp: 'nB.z', warp: 'nA.x' },
  { length: 21, slope: 0.12, dir: [0.82, -0.45, 0.35], kind: 'swell', amp: 'nB.w', warp: 'nC.x' },
  { length: 13.4, slope: 0.1, dir: [-0.58, -0.62, -0.53], kind: 'swell', amp: 'nC.y', warp: 'nB.z' },
  { length: 7.4, slope: 0.09, dir: [0.12, 0.93, -0.35], kind: 'chop', amp: 'nC.z', warp: 'nA.w' },
  { length: 4.3, slope: 0.08, dir: [-0.9, 0.2, 0.39], kind: 'chop', amp: 'nC.w', warp: 'nB.w' },
  { length: 2.6, slope: 0.07, dir: [0.41, -0.2, 0.89], kind: 'chop', amp: 'nB.x', warp: 'nC.y' },
  { length: 1.6, slope: 0.06, dir: [-0.15, -0.88, 0.45], kind: 'chop', amp: 'nA.y', warp: 'nC.z' },
];

/**
 * The long swells come in between these footprints (units a pixel): off at the
 * surface, where the short waves carry the look, full from a few hundred up.
 */
const LONG_FROM = 0.15;
const LONG_TO = 0.8;
/**
 * Near and from the air: the surface's full look (the toon light's tilt, the
 * hard highlight, the whitecaps) holds while a pixel is under `NEAR_FROM`
 * units and is gone past `NEAR_TO`, about a thousand units up. From the air the
 * normal keeps `AIR_TILT` of its tilt, the toon light `AIR_SHADE` of its share,
 * and the whitecaps `AIR_CAPS`, raised to rarer crests.
 */
const NEAR_FROM = 0.12;
const NEAR_TO = 0.9;
const AIR_TILT = 0.4;
const AIR_SHADE = 0.08;
const AIR_CAPS = 0.12;

/** An octave's height gain over the noise, low to high; the mean is near 1. */
const AMP_LOW = 0.3;
const AMP_HIGH = 1.55;
/** How many cycles the noise may bend an octave's phase, either way. */
const WARP_CYCLES = 0.9;
/** The noise's three scales, units. */
const NOISE_A = 900;
const NOISE_B = 260;
const NOISE_C = 80;

/** Gravity in world units, for the deep-water dispersion `w = sqrt(g k)`. */
const GRAVITY = 9.81 * SCENERY_SCALE;

/** Where an octave starts and finishes fading, as shares of its wavelength per pixel. */
const FADE_FROM = 0.1;
const FADE_TO = 0.3;

/**
 * The surface's knobs, shared by every sea material. `uWavePhase` is written
 * each frame by `updateWaves`; the rest are tuning.
 *
 * - `uWaveSlope`: how far the waves tilt the normal.
 * - `uWaveShade`: the share of that tilt the toon light sees (the reflection,
 *   the glint and the transparency see all of it); more is busier banding.
 * - `uReflectNow`: how much sky a grazing look sees (Schlick's fresnel times
 *   this), written each frame from `waveKnobs.reflect` and the camera's height.
 * - `uWhitecaps`: how much foam the crests carry where the swells meet.
 * - `uSkyTop`, `uSkyHorizon`: the dome's colours, which the water reflects.
 */
export const waveUniforms = {
  uWavePhase: { value: new Float32Array(OCTAVES.length) },
  uWaveSlope: { value: 1.7 },
  uWaveShade: { value: 1.6 },
  uReflectNow: { value: 0.8 },
  uWhitecaps: { value: 0.9 },
  /** The graphics setting: no waves on Standard. */
  atlasQuality: surfaceQuality,
  uWaveFoam: { value: FOAM_COLOR.clone() },
  uSkyTop: { value: new THREE.Color(0x6aa6d8) },
  uSkyHorizon: { value: new THREE.Color(0xbfdcef) },
};

/** Knobs read on the CPU each frame. */
export const waveKnobs = { reflect: 0.8 };

/** How much the reflection keeps at altitude: all of it under `REFLECT_HIGH_FROM`, `REFLECT_HIGH_KEEP` past `REFLECT_HIGH_TO`. */
const REFLECT_HIGH_FROM = 1500;
const REFLECT_HIGH_TO = 12000;
const REFLECT_HIGH_KEEP = 0.3;

/** The sky's colours the water reflects, as the mood has them. */
export interface SeaSky {
  skyTop: number;
  skyHorizon: number;
}

/** Advances the waves to `seconds` and hands the surface the sky and the camera's height. */
export function updateWaves(seconds: number, altitude: number, sky: SeaSky | undefined): void {
  const phase = waveUniforms.uWavePhase.value;
  for (let i = 0; i < OCTAVES.length; i++) {
    const k = (2 * Math.PI) / OCTAVES[i]!.length;
    const cycles = (Math.sqrt(GRAVITY * k) * seconds) / (2 * Math.PI);
    phase[i] = -(cycles - Math.floor(cycles));
  }
  const t = Math.min(1, Math.max(0, (altitude - REFLECT_HIGH_FROM) / (REFLECT_HIGH_TO - REFLECT_HIGH_FROM)));
  waveUniforms.uReflectNow.value = waveKnobs.reflect * (1 - (1 - REFLECT_HIGH_KEEP) * t * t * (3 - 2 * t));
  if (sky !== undefined) {
    waveUniforms.uSkyTop.value.setHex(sky.skyTop);
    waveUniforms.uSkyHorizon.value.setHex(sky.skyHorizon);
  }
}

const f = (x: number): string => x.toFixed(6);

/** One octave's terms, unrolled. */
function octaveGLSL(octave: Octave, i: number): string {
  const [x, y, z] = octave.dir;
  const n = Math.hypot(x, y, z);
  const d = `vec3(${f(x / n)}, ${f(y / n)}, ${f(z / n)})`;
  const amplitude = octave.slope * octave.length;
  const tally =
    octave.kind === 'swell'
      ? `\n      crest += wa * ${f(amplitude)} * e;\n      crestMax += wf * ${f(amplitude)};\n      resolved += wf * ${f(octave.slope)};`
      : octave.kind === 'chop'
        ? `\n      chop += wa * ${f(amplitude)} * e;\n      chopMax += wf * ${f(amplitude)};\n      resolved += wf * ${f(octave.slope)};`
        : '';
  return `
    wf = (1.0 - smoothstep(${f(octave.length * FADE_FROM)}, ${f(octave.length * FADE_TO)}, fp))${octave.kind === 'long' ? ' * longIn' : ''};
    if (wf > 0.0) {
      wa = wf * mix(${f(AMP_LOW)}, ${f(AMP_HIGH)}, smoothstep(0.15, 0.85, ${octave.amp}));
      th = 6.2831853 * fract(dot(p, ${d}) * ${f(1 / octave.length)} + uWavePhase[${i}] + (${octave.warp} - 0.5) * ${f(2 * WARP_CYCLES)});
      e = exp(sin(th) - 1.0);
      grad += ${d} * (wa * ${f(octave.slope)} * e * cos(th));${tally}
    }`;
}

const SLOPE_SUM = OCTAVES.reduce((sum, octave) => sum + (octave.kind === 'long' ? 0 : octave.slope), 0);
/** Past this footprint every octave has faded and the noise is not asked. */
const CALM_FOOTPRINT = Math.max(...OCTAVES.map((octave) => octave.length)) * FADE_TO;

/**
 * The declarations: the uniforms and `atlasWaves`, which takes a world point and
 * its footprint (world units a pixel) and returns the normal's tilt in `xyz`
 * (world space, before projecting onto the tangent plane) and the share of the
 * field resolved here in `w`; `crestOut` is how near the swells are to all
 * peaking at once, 0 to 1, and `chopOut` the same of the short waves. Each octave's crest is `exp(sin - 1)`: sharp tops,
 * broad troughs, as a wind sea has.
 */
export const WAVES_PARS_GLSL = `
uniform float uWavePhase[${OCTAVES.length}];
uniform float uWaveSlope;
uniform float uWaveShade;
uniform float uReflectNow;
uniform float uWhitecaps;
uniform float atlasQuality;
uniform vec3 uWaveFoam;
uniform vec3 uSkyTop;
uniform vec3 uSkyHorizon;
vec4 atlasSeaHash4(vec3 c) {
  vec4 q = fract(c.xyzx * vec4(0.1031, 0.1030, 0.0973, 0.1099));
  q += dot(q, q.wzxy + 33.33);
  return fract((q.xxyz + q.yzzw) * q.zywx);
}
// Value noise, four channels at once, 0 to 1, smooth across its cells.
vec4 atlasSeaNoise(vec3 p) {
  vec3 c = floor(p);
  vec3 u = fract(p);
  u = u * u * (3.0 - 2.0 * u);
  vec4 x00 = mix(atlasSeaHash4(c), atlasSeaHash4(c + vec3(1.0, 0.0, 0.0)), u.x);
  vec4 x10 = mix(atlasSeaHash4(c + vec3(0.0, 1.0, 0.0)), atlasSeaHash4(c + vec3(1.0, 1.0, 0.0)), u.x);
  vec4 x01 = mix(atlasSeaHash4(c + vec3(0.0, 0.0, 1.0)), atlasSeaHash4(c + vec3(1.0, 0.0, 1.0)), u.x);
  vec4 x11 = mix(atlasSeaHash4(c + vec3(0.0, 1.0, 1.0)), atlasSeaHash4(c + vec3(1.0, 1.0, 1.0)), u.x);
  return mix(mix(x00, x10, u.y), mix(x01, x11, u.y), u.z);
}
vec4 atlasWaves(vec3 p, float fp, out float crestOut, out float chopOut) {
  crestOut = 0.0;
  chopOut = 0.45;
  if (fp > ${f(CALM_FOOTPRINT)}) return vec4(0.0);
  vec4 nA = atlasSeaNoise(p * ${f(1 / NOISE_A)});
  vec4 nB = atlasSeaNoise(p * ${f(1 / NOISE_B)} + 17.0);
  vec4 nC = atlasSeaNoise(p * ${f(1 / NOISE_C)} + 41.0);
  float longIn = smoothstep(${f(LONG_FROM)}, ${f(LONG_TO)}, fp);
  vec3 grad = vec3(0.0);
  float crest = 0.0;
  float crestMax = 0.0;
  float chop = 0.0;
  float chopMax = 0.0;
  float resolved = 0.0;
  float wf;
  float wa;
  float th;
  float e;
${OCTAVES.map(octaveGLSL).join('\n')}
  // Over the octaves' plain heights, so a patch of tall swells breaks and a
  // calm one does not.
  crestOut = crestMax > 1e-4 ? crest / crestMax : 0.0;
  chopOut = chopMax > 1e-4 ? chop / chopMax : 0.45;
  crestOut = min(crestOut, 1.0);
  return vec4(grad, resolved / ${f(SLOPE_SUM)});
}
// Breaks a band of foam into lace along the short waves: its thin edge goes
// first, its solid middle stays. Where the chop is not resolved, the band.
float atlasLace(float foam, float chop, float far) {
  float broken = foam * smoothstep(0.2, 0.7, foam + 1.1 * (chop - 0.45));
  return mix(foam, broken, 1.0 - far);
}`;

/**
 * The field at this fragment, run where the colour is settled (`color_fragment`)
 * so a material's own surf can read it: `atlasWaveN` the world normal, `atlasWaveFar`
 * 1 where nothing is resolved, `atlasWaveCrest` the swells' peaking,
 * `atlasWaveChop` the short waves' (for `atlasLace`), `atlasWaveNear` 1 at the
 * surface and 0 from the air (`NEAR_FROM`), and
 * `atlasSeaFoam`, which a material's surf writes for the reflection to spare.
 * `world` is the fragment's world position.
 */
export function wavesFieldGLSL(world: string): string {
  return `
  vec3 atlasWaveUp = normalize(${world});
  vec3 atlasWaveN = atlasWaveUp;
  float atlasWaveFar = 1.0;
  float atlasWaveCrest = 0.0;
  float atlasWaveChop = 0.45;
  float atlasWaveNear = 1.0;
  float atlasSeaFoam = 0.0;
  {
    vec3 wdx = dFdx(${world});
    vec3 wdy = dFdy(${world});
    float fp = max(length(wdx), length(wdy));
    // The plain look and the menu pay for no waves at all.
    vec4 waves = atlasQuality > 0.0 ? atlasWaves(${world}, fp, atlasWaveCrest, atlasWaveChop) : vec4(atlasWaveUp, 0.0);
    vec3 tilt = waves.xyz - atlasWaveUp * dot(waves.xyz, atlasWaveUp);
    atlasWaveNear = 1.0 - smoothstep(${f(NEAR_FROM)}, ${f(NEAR_TO)}, fp);
    atlasWaveN = normalize(atlasWaveUp - tilt * (uWaveSlope * atlasQuality * mix(${f(AIR_TILT)}, 1.0, atlasWaveNear)));
    atlasWaveFar = 1.0 - waves.w;
  }`;
}

/**
 * After the normal: the toon light's share of the tilt, the whitecaps, and the
 * fresnel's darkening of what is lit (its sky is added with the emission).
 */
export const WAVES_NORMAL_GLSL = `
  {
    vec3 waveTilt = (viewMatrix * vec4(atlasWaveN - atlasWaveUp, 0.0)).xyz;
    normal = normalize(normal + waveTilt * (uWaveShade * mix(${f(AIR_SHADE)}, 1.0, atlasWaveNear) * faceDirection));
    float caps = smoothstep(mix(0.93, 0.76, atlasWaveNear), mix(1.0, 0.92, atlasWaveNear), atlasWaveCrest)
      * (1.0 - atlasWaveFar) * uWhitecaps * atlasQuality * mix(${f(AIR_CAPS)}, 1.0, atlasWaveNear);
    diffuseColor.rgb = mix(diffuseColor.rgb, uWaveFoam, caps);
    diffuseColor.a = max(diffuseColor.a, caps);
    atlasSeaFoam = max(atlasSeaFoam, caps);
  }`;

/**
 * The sky the water mirrors: Schlick's fresnel on the wave normal, the dome's
 * horizon to its zenith along the reflected ray, taken off what is lit and
 * added as light of its own. Seen from below, nothing.
 */
export const WAVES_SKY_GLSL = `
  float atlasSeaFresnel = 0.0;
  if (gl_FrontFacing) {
    vec3 skyView = normalize(cameraPosition - vGlintWorld);
    float skyCos = clamp(dot(skyView, atlasWaveN), 0.0, 1.0);
    float skyEdge = 1.0 - skyCos;
    float skyEdge2 = skyEdge * skyEdge;
    atlasSeaFresnel = (0.02 + 0.98 * skyEdge2 * skyEdge2 * skyEdge) * uReflectNow * (1.0 - atlasSeaFoam);
    vec3 skyRay = reflect(-skyView, atlasWaveN);
    float skyUp = clamp(dot(skyRay, atlasWaveUp), 0.0, 1.0);
    vec3 skyColour = mix(uSkyHorizon, uSkyTop, sqrt(skyUp));
    diffuseColor.rgb *= 1.0 - atlasSeaFresnel;
    diffuseColor.a = max(diffuseColor.a, atlasSeaFresnel);
    totalEmissiveRadiance += skyColour * atlasSeaFresnel;
  }`;
