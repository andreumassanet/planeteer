import * as THREE from 'three';
import { shadeByClouds } from '../cloud-shade.ts';
import { MACHINE_BED } from '../craft/parked.ts';
import { GROUND_MARKS_GLSL, LUSH_GLSL, bindGroundWeather, groundPatchesChunk, groundWeatherChunk, groundWeatherGLSL } from '../globe.ts';
import { VARNISH_GLSL } from '../gloss.ts';
import { lightWindows } from '../lights.ts';
import { createToonRamp } from '../theme.ts';

/**
 * The one material every town on the planet is drawn with.
 *
 * A town is one merged, vertex-coloured mesh and one draw call: merging beats
 * instancing by two orders of magnitude in draw calls (`compare()` measures
 * it), and frustum culling stays per town. Lit windows ride on the vertices too
 * (`lightWindows`), so they need no second mesh.
 *
 * The shader paints the town as the land is painted: the ground's weather and
 * patches on lawns, a little more saturation, and a two-scale brush stroke on
 * the lightness, faded where a pixel covers a stroke. A parked vehicle's
 * vertices (`MACHINE_BED`) keep their colour and take the craft's varnish.
 */

const TOWN_BRUSH_BROAD = 7;
const TOWN_BRUSH_FINE = 1.8;
const TOWN_BRUSH_LIGHT = 0.07;
const TOWN_SATURATION = 1.12;
const TOWN_PAINT = /* glsl */ `{
    diffuseColor.rgb = atlasLush(diffuseColor.rgb);
    float townLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
    diffuseColor.rgb = max(vec3(0.0), vec3(townLuma) + (diffuseColor.rgb - vec3(townLuma)) * ${TOWN_SATURATION.toFixed(2)});
    float townFoot = max(length(dFdx(vAtlasPos)), length(dFdy(vAtlasPos)));
    float townShare = 1.0 - smoothstep(${(TOWN_BRUSH_FINE * 0.3).toFixed(2)}, ${(TOWN_BRUSH_BROAD * 0.5).toFixed(2)}, townFoot);
    if (townShare > 0.0) {
      float townStroke = atlasNoise(vAtlasPos * ${(1 / TOWN_BRUSH_BROAD).toFixed(5)}) * 0.65
        + atlasNoise(vAtlasPos * ${(1 / TOWN_BRUSH_FINE).toFixed(5)} + 3.1) * 0.35;
      diffuseColor.rgb *= 1.0 + (townStroke - 0.5) * ${(TOWN_BRUSH_LIGHT * 2).toFixed(3)} * townShare;
    }
  }`;

/**
 * Whether the fragment is a still vehicle's: its light bytes are `(0,
 * MACHINE_BED)`, which no window and no pool carries. A triangle's corners are
 * all a vehicle's or none, so the varying is exact.
 */
const MACHINE_TEST = /* glsl */ `bool townMachine = vAtlasLit.x < 0.002 && vAtlasLit.y > ${((MACHINE_BED - 0.5) / 255).toFixed(4)};`;

export function townMaterial(): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: createToonRamp(4) });
  // Every town buffer carries `outlineNormal` (see `FlatVariant.outline`).
  material.userData.outlineParameters = { thickness: 0.005, color: [0.11, 0.02, 0.01], outlineNormal: true };
  lightWindows(material);
  const windows = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    windows.call(material, shader, renderer);
    bindGroundWeather(shader.uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vAtlasPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vAtlasPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vAtlasPos;\n${LUSH_GLSL}\n${GROUND_MARKS_GLSL}\n${groundWeatherGLSL()}`)
      // The weather first, so a lawn under snow takes the patches' tone on
      // white. The paint is worked out for every pixel and dropped for a
      // vehicle's, so the brush's derivatives stay out of a branch.
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>\n  ${MACHINE_TEST}\n  vec3 townMachineColour = diffuseColor.rgb;\n  ${groundWeatherChunk('vAtlasPos')}\n  ${groundPatchesChunk('vAtlasPos')}\n  ${TOWN_PAINT}\n  if (townMachine) diffuseColor.rgb = townMachineColour;`,
      )
      // Nor the light the lamps and headlights lay on the town, which no craft takes either.
      .replace('#include <emissivemap_fragment>', 'vec3 townMachineGlow = totalEmissiveRadiance;\n  #include <emissivemap_fragment>')
      .replace('#include <lights_toon_fragment>', 'if (townMachine) totalEmissiveRadiance = townMachineGlow;\n  #include <lights_toon_fragment>')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n  if (townMachine) ${VARNISH_GLSL}`);
  };
  // Last, over the windows and the paint, and before `fadeTwin` clones it.
  return shadeByClouds(material);
}
