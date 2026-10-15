// The land's material: a toon fill with the ground's marks, the weather, the
// near lights and the flag overlay hooked into its program.

import * as THREE from 'three';
import type { World } from '../geo.ts';
import type { FlagLayer } from '../land-flags.ts';
import { createToonRamp } from '../theme.ts';
import { surfaceQuality } from '../graphics-quality.ts';
import { bindNearLights, nearLightsChunk, nearLightsGLSL } from '../lights.ts';
import { shadeByClouds } from '../cloud-shade.ts';
import { GROUND_MARKS_GLSL, HEX_CELL, LUSH_GLSL } from './ground-marks.ts';
import {
  LAND_GROUND_GLSL, LAND_SURFACE_GLSL, LAND_SURFACE_VERTEX_PARS, followCamera, landBumpChunk, landSurfaceUniforms, landSurfaceVertex,
} from './land-surface.ts';
import { bindGroundWeather, groundWeatherGLSL } from './ground-weather.ts';

/** Outline width: screen space, scaled by distance by `OutlineEffect`. */
const OUTLINE_THICKNESS = 0.005;

/** How much darker a coastal wall is than the ground on top of it; `land-flags.ts` darkens a wall's flag colour by the same amount. */
export const WALL_SHADE = 0.72;

/**
 * The flag overlay, behind a dynamic `import()`: `flags.ts` pulls in all the
 * flag data and this module is in the initial graph.
 *
 * `landFlags(world, land)` returns the layer, one per mesh, which builds itself
 * in slices and answers `setFade`.
 */
export async function landFlags(world: World, mesh: THREE.Mesh): Promise<FlagLayer> {
  const { createFlagLayer } = await import('../land-flags.ts');
  return createFlagLayer(world, mesh);
}

const MOSAIC_GLSL = /* glsl */ `
varying vec3 vAtlasPos;
uniform float atlasMosaic;
uniform float atlasFlag;
${LUSH_GLSL}
${GROUND_MARKS_GLSL}
${LAND_SURFACE_GLSL}
uniform float atlasQuality;`;

/**
 * How fast the mosaic gets out of the flag's way. A flag under a hex tone is a
 * flag printed on canvas, so tone and tilt go to nothing as the wash comes up;
 * at twice the blend they are gone by the time it is half laid.
 */
const MOSAIC_YIELD = 2;

/**
 * Hooks the mosaic, and the flag over it, into the material's own program.
 *
 * After `color_fragment`, so `diffuseColor` holds the vertex colour and the
 * factor multiplies it; after `normal_fragment_begin`, so the lean is on the
 * normal the toon ramp steps. The outline pass builds its own program and the
 * hook moves no vertex, so the hull is unaffected.
 *
 * The cells are tiled in the plane of the position's dominant axis, which on a
 * planet centred at the origin is the local up.
 *
 * The flag is a second colour attribute that is not in the program until it
 * exists (`land-flags.ts` calls `useFlagAttribute` once it is bound): a declared
 * attribute with nothing bound reads stale values. Two programs result, and
 * `customProgramCacheKey` tells them apart.
 *
 * The flag mix is in the square root rather than linear, which approximates the
 * gamma-space blend a painter expects.
 */
function mosaic(material: THREE.MeshToonMaterial): void {
  const surface = landSurfaceUniforms();
  const uniforms = { atlasMosaic: { value: 1 }, atlasFlag: { value: 0 }, ...surface };
  material.userData.uniforms = uniforms;
  followCamera(material, surface);
  /** Flipped once, by `land-flags.ts`, when the attribute is on the geometry. */
  let flagged = false;
  material.onBeforeCompile = (shader) => {
    shader.uniforms['atlasMosaic'] = uniforms.atlasMosaic;
    shader.uniforms['atlasFlag'] = uniforms.atlasFlag;
    Object.assign(shader.uniforms, surface);
    shader.uniforms['atlasQuality'] = surfaceQuality;
    bindGroundWeather(shader.uniforms);
    bindNearLights(shader.uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\nvarying vec3 vAtlasPos;\n${LAND_SURFACE_VERTEX_PARS}${
          flagged ? '\nattribute vec3 flag;\nvarying vec3 vAtlasFlag;' : ''
        }`,
      )
      // World space through `modelMatrix`, which is the identity for this mesh
      // and is one multiply a vertex if it ever stops being.
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\n  vAtlasPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\n  ${landSurfaceVertex('vAtlasPos')}${
          flagged ? '\n  vAtlasFlag = flag;' : ''
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\n${MOSAIC_GLSL}\n${groundWeatherGLSL()}\n${LAND_GROUND_GLSL}\n${nearLightsGLSL()}${flagged ? '\nvarying vec3 vAtlasFlag;' : ''}`,
      )
      // The street lamps' pools past the paving's edge, and the headlights off
      // the carriageway, on the land itself: see `nearLightsChunk`.
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${nearLightsChunk('vAtlasPos')}`)
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
  vec2 atlasPlane = atlasPlaneOf(vAtlasPos);
  // A cell smaller than a pixel is noise, especially when its normal changes
  // the cel band. Fade both tone and tilt before that happens, even with B off.
  float atlasFootprint = max(length(dFdx(atlasPlane)), length(dFdy(atlasPlane)));
  float atlasYield = 1.0 - min(1.0, atlasFlag * ${MOSAIC_YIELD.toFixed(1)});
  float atlasQuiet = atlasYield
    * (1.0 - smoothstep(${(HEX_CELL * 0.4).toFixed(1)}, ${(HEX_CELL * 1.2).toFixed(1)}, atlasFootprint));
  vec2 atlasCell = vec2(0.0);
  // The hex cells are the cel look's grain, and they are off: under a
  // continuous light a tone a cell reads as tiling, not as ground.
  float atlasMark = 0.0 * atlasMosaic * atlasQuiet;
  float atlasTone = atlasMark > 0.0 ? atlasCellTone(atlasPlane, atlasCell) : 1.0;
  // The ground itself (\`atlasLandGround\`, \`land-surface.ts\`): every stage
  // gives way to the flag, the surface's layers to the plain quality too. The
  // footprint is taken here, outside any branch, where it is defined.
  float atlasLocalFoot = max(length(dFdx(vAtlasLocal)), length(dFdy(vAtlasLocal)));
  float atlasBump = 0.0;
  diffuseColor.rgb = atlasLandGround(diffuseColor.rgb, vAtlasPos, vAtlasLocal, vNormal, atlasLocalFoot,
    atlasMosaic * atlasYield, atlasYield, atlasYield * atlasQuality, atlasBump);
  if (atlasMark > 0.0) diffuseColor.rgb *= mix(1.0, atlasTone, atlasMark);${
    flagged
      ? /* glsl */ `
  // The flag, in the square root: a wash is a painting operation. A triangle
  // with no flag of its own carries the land's own colour here, so this is the
  // identity for it at every opacity and needs no mask of its own.
  //
  // Both roots are floored at zero. Under multisampling a triangle smaller than
  // a pixel is shaded at the pixel's centre, outside it, and the varying there
  // is extrapolated and can dip under zero: one NaN pixel from orbit, which
  // the bloom's blur spread into a green or yellow wash over the whole frame.
  if (atlasFlag > 0.0) {
    diffuseColor.rgb = mix(sqrt(max(diffuseColor.rgb, 0.0)), sqrt(max(vAtlasFlag, 0.0)), atlasFlag);
    diffuseColor.rgb *= diffuseColor.rgb;
  }`
      : ''
  }`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        /* glsl */ `#include <normal_fragment_begin>
  {
    // The flag map wants a globe, not a relief: as the flag rises the facet's
    // normal gives way to the sphere's own, so a country reads as one sheet of
    // colour and not a mosaic of lit and unlit hillsides in its own colours.
    // Squared, so the relief holds until the flag is well over half way in.
    if (atlasFlag > 0.0) {
      vec3 atlasSphere = normalize(mat3(viewMatrix) * normalize(vAtlasPos));
      normal = normalize(mix(normal, atlasSphere, atlasFlag * atlasFlag));
    }
    if (atlasMark > 0.0) normal = atlasLeanOf(normal, atlasCell, atlasMark);
  }
  // The near ground's relief, lit: rock beds, cracks, pebbles, ripples.
  ${landBumpChunk('atlasBump', '1.0')}`,
      );
  };
  // Two materials that compile to different programs must not share a cache
  // key, and Three keys on the source plus this.
  material.customProgramCacheKey = () => (flagged ? 'atlas-mosaic-flag' : 'atlas-mosaic');
  material.userData['useFlagAttribute'] = (): void => {
    if (flagged) return;
    flagged = true;
    material.needsUpdate = true;
  };
}

export function toonMaterial(): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: createToonRamp(4) });
  material.userData.outlineParameters = { thickness: OUTLINE_THICKNESS, color: [0.11, 0.02, 0.01] };
  mosaic(material);
  // After the mosaic, whose key moves when the flag arrives: the shade chains
  // the key's function, not its first answer.
  return shadeByClouds(material);
}

/**
 * The land's flagged program, on one triangle, for `warm.ts`: the map layer's
 * first climb switches the land to it (`useFlagAttribute`), and it is the
 * largest program in the world — compiled inside that frame, it was the one
 * hitch the warm-up left. A material of its own, flagged from the start, with
 * the attributes the land carries and the shadow it receives, asks three for
 * the same program by the same source and key, so the switch finds it built.
 */
export function landFlagProxy(): THREE.Mesh {
  const material = toonMaterial();
  (material.userData['useFlagAttribute'] as () => void)();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1e-3, 0, 0, 0, 0, 1e-3]), 3));
  geometry.setAttribute('normal', new THREE.Int8BufferAttribute(new Int8Array([0, 127, 0, 0, 127, 0, 0, 127, 0]), 3, true));
  geometry.setAttribute('color', new THREE.Uint8BufferAttribute(new Uint8Array(9).fill(255), 3, true));
  geometry.setAttribute('flag', new THREE.Uint8BufferAttribute(new Uint8Array(9).fill(255), 3, true));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  return mesh;
}
