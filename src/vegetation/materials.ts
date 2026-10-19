/** The toon materials every tile on the planet shares. */
import * as THREE from 'three';
import { LUSH_GLSL, bindGroundWeather } from '../globe.ts';
import { SEASON_GLSL, farSeasonChunk } from '../foliage-season.ts';
import { shadeByClouds } from '../cloud-shade.ts';
import { seeThrough } from '../see-through.ts';
import { createToonRamp } from '../theme.ts';
import { drawSurfaces } from '../surfaces.ts';
import { MACHINE_BED } from '../craft/parked.ts';
import { VARNISH_GLSL } from '../gloss.ts';

/** The far crowns' year, which a farm's machine is spared (`machineWood`). */
const SEASON_AT = farSeasonChunk('vSeasonWorld');

/**
 * One material for every tile. Colour rides on the vertices and the cel ramp is
 * the coastline's, so a wood steps through the same four bands and follows the
 * sun into night.
 */
export function foliageMaterial(): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: createToonRamp(4) });
  // Every tile carries `outlineNormal`.
  material.userData.outlineParameters = { thickness: 0.005, color: [0.11, 0.02, 0.01], outlineNormal: true };
  // The leaves take the land's own painted green (`atlasLush`), so a wood is the colour of its meadow.
  // And they turn with the year (`foliage-season.ts`), the green vertices only.
  material.onBeforeCompile = (shader) => {
    bindGroundWeather(shader.uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSeasonWorld;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n  vSeasonWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vSeasonWorld;\n${LUSH_GLSL}\n${SEASON_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n  diffuseColor.rgb = atlasLush(diffuseColor.rgb);\n${SEASON_AT}`);
  };
  // A building out in the country (a farmhouse, a barn, a chapel) is drawn as a town's: its walls' materials and the rooms behind its panes.
  drawSurfaces(material, { panes: true });
  material.customProgramCacheKey = () => 'atlas-foliage|surfaces';
  // Applied before `woodMaterial` and `machineWood` chain it, and `fadeTwin` clones it.
  return seeThrough(shadeByClouds(material));
}

/**
 * A near tile's wood material, taught its vehicles: a vertex whose wind
 * carries `MACHINE_BED` in its third byte keeps its colour rather than the
 * land's green and takes the craft's varnish, so a farm's tractor is drawn as
 * the one driven off.
 */
export function machineWood(material: THREE.MeshToonMaterial): THREE.MeshToonMaterial {
  const inner = material.onBeforeCompile.bind(material);
  const key = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    inner(shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vAtlasMachine;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n  vAtlasMachine = step(${((MACHINE_BED - 0.5) / 255).toFixed(4)}, aWind.z);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vAtlasMachine;')
      .replace('diffuseColor.rgb = atlasLush(diffuseColor.rgb);', 'if (vAtlasMachine < 0.5) diffuseColor.rgb = atlasLush(diffuseColor.rgb);')
      .replace(SEASON_AT, `if (vAtlasMachine < 0.5) ${SEASON_AT}`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n  if (vAtlasMachine > 0.5) ${VARNISH_GLSL}`);
  };
  material.customProgramCacheKey = () => `${key}|machine`;
  return material;
}
