/** How the roads look: the material, lit after dark, and the colours of each part. */

import * as THREE from 'three';
import type { WorldSpec } from '../contract.ts';
import { PALETTE } from '../../theme.ts';
import { litAtNight } from '../night.ts';

export interface RoadLook {
  grey: THREE.Color;
  pavement: THREE.Color;
  gravel: THREE.Color;
  accent: THREE.Color;
  white: THREE.Color;
  steel: THREE.Color;
  steelDark: THREE.Color;
}

/** The roads' material: faceted vertex colours, with a per-vertex glow the dashes and reflectors use after dark. */
export function createRoadMaterial(gradientMap: THREE.Texture): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  // Faceted as the ground is (`tiles.ts`), so a bank in the ground's colour
  // takes the light the hill beside it does.
  material.defines = { ...material.defines, FLAT_SHADED: '' };
  material.userData.outlineParameters = { visible: false };
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
  material.customProgramCacheKey = () => 'world:roads';
  // Under the lamps and the headlights after dark, as the ground beside it is.
  litAtNight(material);
  return material;
}

/** The town's own street colours (`settlements/`), and a gravel a shade under the carriageway. */
export function roadLook(spec: WorldSpec): RoadLook {
  const style = spec.civilisation?.architecture;
  return {
    grey: new THREE.Color(PALETTE.steel).multiplyScalar(1.25),
    pavement: new THREE.Color(PALETTE.bone).multiplyScalar(1.04),
    gravel: new THREE.Color(PALETTE.steel).multiplyScalar(0.95),
    accent: new THREE.Color(style?.accents[0] ?? PALETTE.gold),
    white: new THREE.Color(PALETTE.white),
    steel: new THREE.Color(PALETTE.steel).multiplyScalar(0.9),
    steelDark: new THREE.Color(PALETTE.steel).multiplyScalar(0.6),
  };
}
