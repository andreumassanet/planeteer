// What the sea's materials share: the surf's clock and foam, the window the sea
// floor is seen through, the glint of the light's path, and the painted look.
// Each is a hook chained onto a material's `onBeforeCompile` and a suffix on its
// program cache key.

import * as THREE from 'three';
import { DITHER_GLSL } from '../fade.ts';
import {
  FOAM_PERIOD,
  FOAM_PERIOD_2,
  FOAM_REACH,
  FOAM_STRENGTH,
  FOAM_SWING,
  FOAM_WAVELENGTH,
  FOAM_WAVELENGTH_2,
  LIFT_COAST,
} from './constants.ts';
import { FOAM_COLOR } from './water-colour.ts';
import { apronReachAt } from '../terrain.ts';
import { WAVES_NORMAL_GLSL, WAVES_PARS_GLSL, WAVES_SKY_GLSL, waveUniforms, wavesFieldGLSL } from './waves.ts';

/** The surf's clock, shared by the ribbon and the water laid over the sea floor near the player. */
export const seaClock: THREE.IUniform<number> = { value: 0 };

/**
 * The surf as a GLSL function, `atlasFoam(shore, phase)`: how much foam a point
 * `shore` units from the coast and `phase` units along it wears, 0 to
 * `FOAM_STRENGTH`. Two swells run along the shoreline at different rates, so the
 * surf is a phase travelling down a beach; the wash is solid to two thirds of
 * its reach and feathers out over the last third. `shore` is counted from the
 * coastline and the wash from where the apron goes under the water drawn at
 * the coast (`apronReachAt`). Reads `uTime`, which must be `seaClock`; declared
 * once per shader, after `uTime`.
 */
export const FOAM_GLSL = `
float atlasFoam(float shore, float phase) {
  shore -= ${apronReachAt(LIFT_COAST).toFixed(2)};
  float a = sin(phase * ${(2 * Math.PI / FOAM_WAVELENGTH).toFixed(8)} - uTime * ${(2 * Math.PI / FOAM_PERIOD).toFixed(6)});
  float b = sin(phase * ${(2 * Math.PI / FOAM_WAVELENGTH_2).toFixed(8)} + uTime * ${(2 * Math.PI / FOAM_PERIOD_2).toFixed(6)} + 1.7);
  float reach = ${FOAM_REACH.toFixed(1)} + ${FOAM_SWING.toFixed(1)} * clamp(0.5 + 0.34 * a + 0.16 * b, 0.0, 1.0);
  return (1.0 - smoothstep(reach * 0.45, reach, shore)) * ${FOAM_STRENGTH.toFixed(2)};
}`;

/** The wash's colour, for a surface that draws the surf with `FOAM_GLSL`. */
export const SURF_COLOR: THREE.Color = FOAM_COLOR;

/**
 * The window the sea floor is seen through. The water sphere and the ribbon are
 * opaque; round the player, `seabed.ts` lays a floor and a clear water surface
 * of its own, and inside this disc the sphere and the ribbon step aside. Over
 * the last `band` units the two hand over by the screen door (`DITHER_GLSL`),
 * so there is no seam of double water and no gap. A radius of 0 is no window.
 * The sphere is inked and a see-through fill would show its hull's far side, so
 * both stay opaque and are simply not drawn inside the window.
 */
export const seaWindow = {
  uSeaCentre: { value: new THREE.Vector3() },
  uSeaRadius: { value: 0 },
  uSeaBand: { value: 1 },
};

/**
 * The hull the sea stays out of: round the axis of the submarine the player is
 * in, through four stations (`uHull`), `uHullR` across at each, a frustum
 * between each pair and open at both ends; a first radius of 0 is none. Inside
 * the hull the sphere and the ribbon are not drawn (`addSeaWindow`'s `hide`).
 */
export const seaHull = {
  uHull: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
  uHullR: { value: new THREE.Vector4() },
};

/** The window's cut, as GLSL: 1 inside, 0 outside, the band a ramp between. `world` is the fragment's world position. */
export function seaWindowGLSL(world: string): string {
  return `(uSeaRadius > 0.0 ? 1.0 - smoothstep(uSeaRadius - uSeaBand, uSeaRadius, length((${world}) - uSeaCentre)) : 0.0)`;
}

/** Adds the window to a material: `hide` for the sphere and the ribbon, `show` for the water drawn there instead. */
export function addSeaWindow(material: THREE.Material, mode: 'hide' | 'show'): void {
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    Object.assign(shader.uniforms, seaWindow);
    if (mode === 'hide') Object.assign(shader.uniforms, seaHull);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSeaWindow;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n  vSeaWindow = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vSeaWindow;
uniform vec3 uSeaCentre;
uniform float uSeaRadius;
uniform float uSeaBand;${mode === 'hide' ? '\nuniform vec3 uHull[4];\nuniform vec4 uHullR;\nbool inHull(vec3 p, vec3 a, vec3 b, float ra, float rb) {\n  vec3 axis = b - a;\n  float t = dot(p - a, axis) / dot(axis, axis);\n  return t > 0.0 && t < 1.0 && length(p - (a + axis * t)) < mix(ra, rb, t);\n}' : ''}`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
  {
    float seaCut = ${seaWindowGLSL('vSeaWindow')};
    float seaDoor = ${DITHER_GLSL};
    if (${mode === 'hide' ? 'seaDoor < seaCut' : 'seaDoor >= seaCut'}) discard;
  }${
          mode === 'hide'
            ? `
  if (uHullR.x > 0.0 && (inHull(vSeaWindow, uHull[0], uHull[1], uHullR.x, uHullR.y) || inHull(vSeaWindow, uHull[1], uHull[2], uHullR.y, uHullR.z) || inHull(vSeaWindow, uHull[2], uHull[3], uHullR.z, uHullR.w))) discard;`
            : ''
        }`,
      );
  };
  const key = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `${key()}+window-${mode}`;
}

/**
 * How tightly the glitter path clings to the mirror direction: the RMS slope of
 * the waves, 0.20 radians (about 11.5 degrees, a moderate sea). A Gaussian on
 * the angle rather than `pow(align, n)`, whose fat tail ran the midday path to
 * the limb; the tail decides the path's shape, compact at noon and a streak to
 * the horizon at dusk.
 */
const GLITTER_SLOPE = 0.20;
/** The lobe's slope where the drawn waves already carry most of it. */
const RESOLVED_SLOPE = 0.11;
/** The highlight on a resolved wave face: the cosine it starts and is full at, and its brightness against a speck. */
const SHEEN_FROM = 0.9975;
const SHEEN_TO = 0.9992;
const SHEEN_STRENGTH = 0.7;

/**
 * The light's path on the water, drawn by the water's own shader: a Gaussian
 * lobe on the angle between the surface normal and the half vector, multiplied
 * by a sparkle field fixed in world space and drifting slowly, thresholded into
 * specks. Far off, where a speck would be under a pixel, the specks give way to
 * the lobe as a soft band.
 */
export const glintUniforms = {
  uGlintDir: { value: new THREE.Vector3(0, 1, 0) },
  uGlintTint: { value: new THREE.Color() },
  uGlintStrength: { value: 0 },
  uGlintTime: { value: 0 },
};

/** How big one sparkle cell is, in world units, near the camera. */
const GLINT_CELL = 1.6;
/** Where the specks have handed over to the soft band, in units from the eye. */
const GLINT_BAND_FROM = 250;
const GLINT_BAND_TO = 900;

/** How much further from grey `paintSea` takes the water, and how much deeper. */
const SEA_SATURATION = 1.45;
const SEA_LIGHT = 0.88;

/**
 * The painted sea: every water surface's colour pushed off grey and a shade
 * deeper, before the foam is laid on it. One function, so the sphere, the
 * shallows and the clear water round the player stay one sea. Chains the
 * material's own hook; the foam mixed in by the hooks before this one keeps its white.
 */
export function paintSea(material: THREE.MeshToonMaterial): void {
  const previous = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
  {
    float seaLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
    diffuseColor.rgb = max(vec3(0.0), vec3(seaLuma) + (diffuseColor.rgb - vec3(seaLuma)) * ${SEA_SATURATION.toFixed(2)}) * ${SEA_LIGHT.toFixed(2)};
  }`,
    );
  };
  material.customProgramCacheKey = () => `${key}|sea`;
}

/**
 * Adds the light on the water to a material: the waves (`waves.ts`) tilting its
 * normal, the sky it mirrors by the fresnel, and the sun's (or moon's) path,
 * all read off the one wave normal. The field is settled at `color_fragment`,
 * so a material's own surf, chained before this, can read `atlasWaveN`,
 * `atlasWaveCrest` and `atlasWaveFar` and writes `atlasSeaFoam`.
 */
export function addGlint(material: THREE.MeshToonMaterial): void {
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    Object.assign(shader.uniforms, glintUniforms, waveUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGlintWorld;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n  vGlintWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vGlintWorld;
uniform vec3 uGlintDir;
uniform vec3 uGlintTint;
uniform float uGlintStrength;
uniform float uGlintTime;
${WAVES_PARS_GLSL}
vec3 atlasGlintHash3(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
// One speck a cell: a disc at a random spot, kept only where the lobe is
// strong enough for this cell's draw.
float atlasGlintSpeck(vec3 world, float octave, vec3 drift, float lobe) {
  float size = ${GLINT_CELL.toFixed(2)} * octave;
  vec3 p = world / size + drift;
  vec3 cell = floor(p);
  vec3 h = atlasGlintHash3(cell);
  if (h.x > lobe * 0.85) return 0.0;
  vec3 centre = cell + 0.25 + 0.5 * atlasGlintHash3(cell + 17.0);
  float r = 0.1 + 0.12 * h.y;
  return 1.0 - smoothstep(r * 0.7, r, length(p - centre));
}`,
      )
      .replace('#include <color_fragment>', `#include <color_fragment>${wavesFieldGLSL('vGlintWorld')}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>${WAVES_NORMAL_GLSL}`)
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>${WAVES_SKY_GLSL}
  if (uGlintStrength > 0.001) {
    // The waves the eye resolves near the surface carry their own slope, so
    // the lobe narrows to what is left unresolved; from the air and past them
    // it is the whole sea's.
    vec3 gUp = gl_FrontFacing ? atlasWaveN : atlasWaveUp;
    vec3 gView = normalize(cameraPosition - vGlintWorld);
    vec3 gHalf = normalize(gView + uGlintDir);
    float gCos = clamp(dot(gHalf, gUp), 0.0, 1.0);
    float gTheta = acos(gCos);
    float gSlope = mix(${RESOLVED_SLOPE.toFixed(3)}, ${GLITTER_SLOPE.toFixed(3)}, max(atlasWaveFar, 1.0 - atlasWaveNear));
    float gLobe = exp(-gTheta * gTheta / (2.0 * gSlope * gSlope));
    // The sun's own image on a wave face the eye resolves: a hard-edged
    // highlight that rides the waves, a cel band rather than a gradient.
    float gSheen = smoothstep(${SHEEN_FROM.toFixed(5)}, ${SHEEN_TO.toFixed(5)}, gCos) * (1.0 - atlasWaveFar) * (1.0 - atlasSeaFoam) * atlasWaveNear * atlasWaveNear;
    if (gLobe > 0.01 || gSheen > 0.0) {
      float gDist = length(cameraPosition - vGlintWorld);
      // Round specks, one at a random place in each cell of a lattice fixed
      // to the sea, the cells growing with distance in octaves so a speck
      // keeps its size on screen; two octaves cross-fade so no band shows
      // where one hands to the next. The drift is the swell moving.
      // Octaves go below one near the eye too, so a nearby speck is as small
      // on screen as one at forty. Past the band the specks are not drawn.
      float gFar = smoothstep(${GLINT_BAND_FROM.toFixed(1)}, ${GLINT_BAND_TO.toFixed(1)}, gDist);
      float gSpecks = 0.0;
      if (gFar < 1.0) {
        float gLevel = log2(max(0.125, gDist / 40.0));
        float gOctave = exp2(floor(gLevel));
        float gBlend = fract(gLevel);
        vec3 gDrift = vec3(uGlintTime * 0.35, 0.0, uGlintTime * 0.21);
        gSpecks = mix(atlasGlintSpeck(vGlintWorld, gOctave, gDrift, gLobe),
          atlasGlintSpeck(vGlintWorld, gOctave * 2.0, gDrift, gLobe), gBlend);
      }
      float gGlint = max(mix(gSpecks, gLobe * gLobe * 0.4, gFar), gSheen * ${SHEEN_STRENGTH.toFixed(2)});
      #ifdef ATLAS_CLOUD_SHADE
      // The glitter is the sun's own image, and under a bank it goes with the
      // sun: the deck's shade along the glitter's light (cloud-shade.ts), on
      // a material that opted in.
      gGlint *= 1.0 - atlasCloudAt(vGlintWorld, uGlintDir).x;
      #endif
      totalEmissiveRadiance += mix(uGlintTint, vec3(1.0), 0.5) * (gGlint * uGlintStrength * 1.4);
    }
  }`,
      );
  };
  const key = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `${key()}+glint`;
}
