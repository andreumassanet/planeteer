// The floor's, the decor's and the clear water's materials.

import * as THREE from 'three';
import { OCEAN_COLOR, PALETTE, createToonRamp } from '../theme.ts';
import { FOAM_GLSL, SURF_COLOR, addGlint, addSeaWindow, paintSea, seaClock } from '../ocean.ts';
import { shadeByClouds } from '../cloud-shade.ts';
import { ABSORB } from './constants.ts';

export const floorUniforms = {
  uFloorTime: { value: 0 },
  uCaustic: { value: 0 },
  uAbove: { value: 1 },
  uDeepTint: { value: new THREE.Color(OCEAN_COLOR).multiplyScalar(0.7) },
  /** What a unit of water keeps of each channel seen from above, as an absorption per unit: red goes first. */
  uAbsorb: { value: new THREE.Vector3(0.11, 0.035, 0.02) },
};

/** The caustics' brightness, and the depth over which they fade (units). */
const CAUSTIC_GAIN = 0.3;
const CAUSTIC_DEPTH = 9;

/**
 * The floor's and the decor's material: toon, flat, unlinked from the pen, with
 * the light moving on it and the blue of the water over it.
 *
 * - The caustics are two layers of warped sines in world space, run at
 *   different rates, their zeros kept as bright lines: the light a swell
 *   focuses onto the sand, strongest in the shallows. By day only (`uCaustic`).
 * - The water over it takes the red first (`uAbsorb`) and then goes to its own
 *   blue over what is deep, applied only while the camera is above the
 *   surface; under it, the haze does it.
 * - The sway is the decor's: each vertex moves by its own `aSway` units across
 *   the current, so a kelp stalk's holdfast stays put and its crown swings.
 */
export function floorMaterial(decor: boolean): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({
    vertexColors: true,
    gradientMap: createToonRamp(4),
    side: decor ? THREE.DoubleSide : THREE.FrontSide,
  });
  // Faceted, as the land is: the toon ramp steps across facets. Three's toon
  // material reads the flag though its type does not list it.
  (material as { flatShading?: boolean }).flatShading = true;
  material.userData.outlineParameters = { visible: false };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, floorUniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute float aDepth;
${decor ? 'attribute float aSway;' : ''}
uniform float uFloorTime;
varying float vFloorDepth;
varying vec3 vFloorWorld;`,
      )
      .replace(
        '#include <begin_vertex>',
        decor
          ? `#include <begin_vertex>
  if (aSway > 0.0) {
    vec3 swayUp = normalize(position);
    vec3 swayEast = normalize(cross(vec3(0.0, 1.0, 0.0), swayUp) + vec3(1e-4, 0.0, 0.0));
    vec3 swayNorth = cross(swayUp, swayEast);
    float swayPhase = uFloorTime * 0.9 + dot(position, vec3(0.13, 0.11, 0.17));
    transformed += (swayEast * sin(swayPhase) + swayNorth * 0.5 * sin(swayPhase * 1.3 + 1.0)) * aSway;
  }`
          : '#include <begin_vertex>',
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
  vFloorDepth = aDepth;
  vFloorWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uFloorTime;
uniform float uCaustic;
uniform float uAbove;
uniform vec3 uDeepTint;
uniform vec3 uAbsorb;
varying float vFloorDepth;
varying vec3 vFloorWorld;
float atlasCausticLayer(vec3 q, float t) {
  vec3 w = q + 0.7 * vec3(sin(q.z * 1.3 + t * 0.6), sin(q.x * 1.1 - t * 0.5), sin(q.y * 1.2 + t * 0.7));
  float s = sin(w.x + t * 0.9) + sin(w.y + t * 0.7) + sin(w.z - t * 0.8);
  return pow(clamp(1.0 - abs(s) / 0.7, 0.0, 1.0), 6.0);
}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
  {
    // Seen from above, the water takes the red first: sand two units down is
    // turquoise-tinged, ten down is teal, and the deep goes to the sea's blue.
    vec3 seaKept = exp(-uAbsorb * vFloorDepth);
    vec3 underWater = mix(uDeepTint, diffuseColor.rgb * seaKept, exp(-vFloorDepth / 16.0));
    diffuseColor.rgb = mix(diffuseColor.rgb, underWater, uAbove);
  }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
  if (uCaustic > 0.001) {
    // Two layers of warped sines, each kept as the thin bright line along
    // its zero, the second finer and slower; where they cross they add, as
    // the net of light under a swell does. Faded as a line grows thinner
    // than a pixel, so from a height the floor is calm rather than noise.
    float cfp = length(fwidth(vFloorWorld));
    float caustic = 0.0;
    float cFade = 1.0 - smoothstep(0.25, 0.9, cfp);
    if (cFade > 0.0) {
      caustic = (atlasCausticLayer(vFloorWorld * 0.6, uFloorTime) * 0.65
        + atlasCausticLayer(vFloorWorld * 1.03 + 3.1, uFloorTime * 0.8 + 1.7) * 0.45) * cFade;
    }
    #ifdef ATLAS_CLOUD_SHADE
    // The sun focused by the swell, so none under a bank (cloud-shade.ts).
    caustic *= 1.0 - atlasCloudAt(vFloorWorld, atlasCloudSun).x;
    #endif
    totalEmissiveRadiance += vec3(0.85, 0.95, 1.0) * caustic * uCaustic * exp(-vFloorDepth / ${CAUSTIC_DEPTH.toFixed(1)}) * ${CAUSTIC_GAIN.toFixed(2)};
  }`,
      );
  };
  material.customProgramCacheKey = () => (decor ? 'atlas-sea-decor' : 'atlas-sea-floor');
  // The floor is lit by the sun through the water, and shaded with it.
  return shadeByClouds(material);
}

export const waterUniforms = {
  uTime: seaClock,
  uFoam: { value: SURF_COLOR.clone() },
  uClarity: { value: 0 },
  uClearFrom: { value: 0 },
  uClearTo: { value: 1 },
  uUnder: { value: new THREE.Color(PALETTE.skyBlue).lerp(new THREE.Color(PALETTE.white), 0.35) },
};

/**
 * The water over the floor: the ribbon's toon, colour, surf and glitter,
 * see-through as far as the water is shallow. From above, the share of the floor
 * that shows is `exp(-path / ABSORB)`, the path being the depth over the cosine
 * of the view, so a grazing look is opaque however shallow (which is what a real
 * sea does and what lets the window's edge be opaque). From below it is the
 * surface lit from above, brighter the more steeply you look up at it.
 */
export function waterMaterial(): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({
    vertexColors: true,
    gradientMap: createToonRamp(4),
    transparent: true,
    depthWrite: true,
    side: THREE.DoubleSide,
  });
  material.userData.outlineParameters = { visible: false };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, waterUniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec2 aShore;
attribute float aDepth;
varying vec2 vWaterShore;
varying float vWaterDepth;
varying vec3 vWaterWorld;`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
  vWaterShore = aShore;
  vWaterDepth = aDepth;
  vWaterWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uTime;
uniform vec3 uFoam;
uniform float uClarity;
uniform float uClearFrom;
uniform float uClearTo;
uniform vec3 uUnder;
varying vec2 vWaterShore;
varying float vWaterDepth;
varying vec3 vWaterWorld;
${FOAM_GLSL}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
  {
    float foam = atlasLace(atlasFoam(vWaterShore.x, vWaterShore.y), atlasWaveChop, atlasWaveFar);
    atlasSeaFoam = foam;
    vec3 toEye = normalize(cameraPosition - vWaterWorld);
    // Through the wave normal, so the floor seen through the surface swims
    // as the waves pass, and the window seen from under it ripples.
    float steep = abs(dot(toEye, atlasWaveN));
    if (gl_FrontFacing) {
      float path = vWaterDepth / max(0.18, steep);
      float nearby = 1.0 - smoothstep(uClearFrom, uClearTo, length(vWaterWorld - uSeaCentre));
      float clear = exp(-path / ${ABSORB.toFixed(1)}) * uClarity * nearby;
      diffuseColor.rgb = mix(diffuseColor.rgb, uFoam, foam);
      diffuseColor.a = max(1.0 - clear, foam);
    } else {
      diffuseColor.rgb = mix(uUnder, uFoam, foam * 0.5);
      diffuseColor.a = 0.5 + 0.4 * (1.0 - steep);
    }
  }`,
      );
  };
  material.customProgramCacheKey = () => 'atlas-sea-water';
  addGlint(material);
  paintSea(material);
  addSeaWindow(material, 'show');
  return shadeByClouds(material);
}
