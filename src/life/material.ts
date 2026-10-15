/** The materials everything that moves is drawn with. */
import * as THREE from 'three';
import { shadeByClouds } from '../cloud-shade.ts';
import { seeThrough } from '../see-through.ts';
import { varnish } from '../gloss.ts';
import { createToonRamp } from '../theme.ts';

/** Marks a mesh whose colours are its vertices', for `mergeGroup`; never drawn. */
export const PAINTED_MERGE = new THREE.MeshBasicMaterial();
PAINTED_MERGE.userData.atlasPainted = true;

/**
 * Vertex colours on the shared four-band ramp, so a moving car steps through
 * the same cel bands as the town around it. The ink rides each mesh's own
 * `outlineNormal`; the birds opt out, since their buffer is rewritten every
 * frame. Vehicles are varnished (`gloss.ts`); everything is cloud-shaded.
 */
export function moverMaterial(outlineNormal = true): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: createToonRamp(4) });
  material.userData.outlineParameters = { thickness: 0.005, color: [0.11, 0.02, 0.01], outlineNormal };
  return seeThrough(shadeByClouds(outlineNormal ? varnish(material) : material));
}
