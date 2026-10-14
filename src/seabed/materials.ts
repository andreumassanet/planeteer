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
};

/**
 * The floor's and the decor's material: toon, flat, unlinked from the pen, with
 * the light moving on it and the blue of the water over it.
 *
 * - The caustics are three sines in world space, crossed and run at different
 *   rates, their troughs kept as bright lines: the light a swell focuses onto the
 *   sand, strongest in the shallows. By day only (`uCaustic`).
 * - The blue is the water's own tint over what is deep, applied only while the
 *   camera is above the surface; under it, the haze does it.
 * - The sway is the decor's: each vertex moves by its own `aSway` units across
 *   the current, so a kelp stalk's holdfast stays put and its crown swings.
 */
export function floorMaterial(decor: boolean): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({
    vertexColors: true,
    gradientMap: createToonRamp(4),
    side: decor ? THREE.DoubleSide : THREE.FrontSide,
  });
  // Faceted, as the land is: the toon ramp steps across facets, and a smooth
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
varying float vFloorDepth;
varying vec3 vFloorWorld;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
  diffuseColor.rgb = mix(diffuseColor.rgb, uDeepTint, (1.0 - exp(-vFloorDepth / 16.0)) * uAbove);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
  if (uCaustic > 0.001) {
    vec3 cq = vFloorWorld * 0.42;
    float ct = uFloorTime;
    float cw = sin(cq.x + ct * 0.9 + sin(cq.z * 1.3 + ct * 0.6))
      + sin(cq.z + ct * 0.7 + sin(cq.y * 1.1 - ct * 0.5))
      + sin(cq.y + cq.x * 0.5 - ct * 0.8);
    // Thin lines, not wiggles: only the bottom of the troughs, and faint.
    float caustic = pow(clamp(1.0 - abs(cw) / 0.8, 0.0, 1.0), 7.0);
    #ifdef ATLAS_CLOUD_SHADE
    // The sun focused by the swell, so none under a bank (cloud-shade.ts).
    caustic *= 1.0 - atlasCloudAt(vFloorWorld, atlasCloudSun).x;
    #endif
    totalEmissiveRadiance += vec3(0.85, 0.95, 1.0) * caustic * uCaustic * exp(-vFloorDepth / 6.0) * 0.2;
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
    float foam = atlasFoam(vWaterShore.x, vWaterShore.y);
    vec3 toEye = normalize(cameraPosition - vWaterWorld);
    float steep = abs(dot(toEye, normalize(vWaterWorld)));
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
