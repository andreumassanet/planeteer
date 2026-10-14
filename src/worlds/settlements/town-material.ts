/** The material every town is drawn with: toned vertex colours plus a per-vertex glow. */

import * as THREE from 'three';
import { litAtNight } from '../night.ts';

export interface TownMaterial {
  material: THREE.MeshToonMaterial;
  /** Scales every vertex's glow; the loop turns it up after dark. */
  glowUniform: { value: number };
}

export function createTownMaterial(gradientMap: THREE.Texture): TownMaterial {
  const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap });
  material.name = 'world:towns';
  material.userData.outlineParameters = { thickness: 0.004, color: [0.11, 0.02, 0.01], outlineNormal: true };
  // Glow is a per-vertex weight laid on as emission in the vertex's own colour,
  // scaled by one uniform; past the tone map's white it blooms.
  const glowUniform = { value: 0.6 };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGlow = glowUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aGlow;\nvarying float vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uGlow;\nvarying float vGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * vGlow * uGlow;');
  };
  material.customProgramCacheKey = () => 'world:towns';
  // And the lamps and doorways round the traveller light it after dark (`night.ts`).
  litAtNight(material);
  return { material, glowUniform };
}
