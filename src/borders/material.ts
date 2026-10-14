import * as THREE from 'three';
import { PLANET_RADIUS } from '../globe.ts';
import { createToonRamp } from '../theme.ts';
import { shadeByClouds } from '../cloud-shade.ts';
import { NEAR_CUT, WIDTH } from './constants.ts';

/**
 * The frontier's material and its width uniform. The vertex stage places each
 * corner (`across` times the width) and answers the horizon, and the fragment
 * stage discards what is behind the limb or too close to the eye.
 */
export function createBorderMaterial(): { material: THREE.MeshToonMaterial; width: { value: number } } {
  const material = new THREE.MeshToonMaterial({
    vertexColors: true,
    gradientMap: createToonRamp(4),
    // Blended but filed with the opaque world: with no depth test a mark is
    // seen wherever it is drawn last, and a transparent material draws after
    // the cloud deck, so the dashes would run across the clouds. In the opaque
    // list the mesh sorts at `CLOUD_ORDER - 1`, over the land and under the
    // deck. `CustomBlending` keeps the fade, because the renderer switches
    // `NormalBlending` off on an opaque material.
    transparent: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.SrcAlphaFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
  });
  // No ink hull: the line is ink, and the outline pass builds its own program
  // that would not move this mesh's corners.
  material.userData.outlineParameters = { visible: false };

  const width = { value: WIDTH };
  material.onBeforeCompile = (shader) => {
    shader.uniforms['atlasBorder'] = width;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
attribute vec3 across;
uniform float atlasBorder;
varying float vAtlasHorizon;
varying float vAtlasEye;`,
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
  // The corner, placed. A straight step in the tangent plane and not an arc
  // along the sphere: at the widest this line ever gets, the difference is
  // 21^2 / 8R = 0.003 units, and the depth test is off anyway.
  transformed += across * atlasBorder;
  vec3 atlasWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
  float atlasEyeLength = max(length(cameraPosition), 1.0);
  // Positive on the near side of the horizon. The occluder is the sea sphere's
  // own radius, so a border on a shelf 20 units up is held a little past the
  // true limb, which is the right way to be wrong: it disappears behind the
  // planet's edge rather than in front of it.
  vAtlasHorizon = dot(normalize(atlasWorld), cameraPosition / atlasEyeLength)
    - ${PLANET_RADIUS.toFixed(1)} / atlasEyeLength;
  vAtlasEye = distance(atlasWorld, cameraPosition);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nvarying float vAtlasHorizon;\nvarying float vAtlasEye;`,
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
  if (vAtlasHorizon < 0.0 || vAtlasEye < ${NEAR_CUT.toFixed(1)}) discard;`,
      );
  };
  material.customProgramCacheKey = () => 'atlas-border';
  // Lit like the ground it is drawn on, so under a bank's shade with it
  // (`cloud-shade.ts`).
  shadeByClouds(material);
  return { material, width };
}
