/** The blade geometry, the uniforms every ring shares, and a ring's material. */
import * as THREE from 'three';
import { GROUND_MARKS_GLSL, bindGroundWeather, groundWeatherChunk, groundWeatherGLSL } from '../globe.ts';
import { bindNearLights, nearLightsChunk, nearLightsGLSL } from '../lights.ts';
import { shadeByClouds } from '../cloud-shade.ts';
import { WIND } from '../wind.ts';
import { GRASS_GRADIENT, GRASS_LIGHTS, GRASS_VERTEX_MAIN, grassVertexPars } from './shaders.ts';
import { REFERENCE, TIP_GAIN_CAP, TRANSLUCENCY } from './types.ts';

/** What every ring shares and nobody sets per ring. */
export function sharedUniforms(): Record<string, THREE.IUniform> {
  const linear = (hex: string): THREE.Color => new THREE.Color(hex);
  const lightness = (hex: string): number => {
    const colour = linear(hex);
    return 0.2126 * colour.r + 0.7152 * colour.g + 0.0722 * colour.b;
  };
  const mid = lightness(REFERENCE.mid);
  const dryRoot = linear(REFERENCE.dryRoot);
  const dryTip = linear(REFERENCE.dryTip);
  const translucent = linear(REFERENCE.translucent).multiplyScalar(TRANSLUCENCY);
  return {
    // The wind's own objects (`wind.ts`), which the trees read too.
    uTime: WIND.uTime,
    uWindStrength: WIND.uWindStrength,
    uGHeight: { value: 1 },
    uGRootGain: { value: lightness(REFERENCE.root) / mid },
    // Capped: on a ground already as light as this palette's, the reference's
    // full ratio lit every tip to straw.
    uGTipGain: { value: Math.min(TIP_GAIN_CAP, lightness(REFERENCE.tip) / mid) },
    uGDryRoot: { value: new THREE.Vector3(dryRoot.r, dryRoot.g, dryRoot.b) },
    uGDryTip: { value: new THREE.Vector3(dryTip.r, dryTip.g, dryTip.b) },
    uGTranslucency: { value: new THREE.Vector3(translucent.r, translucent.g, translucent.b) },
  };
}

/** Where another world's growth is put back on its ground's hue, and how: the blade's lightness over the ground's colour. */
const PLAIN_AT = 'c *= 0.86 + 0.26 * r1.w;';
const PLAIN_HUE = '      c = paint * (dot(c, vec3(0.2126, 0.7152, 0.0722)) / max(1e-4, dot(paint, vec3(0.2126, 0.7152, 0.0722))));';

/**
 * One ring's material: the toon material, with the blade built in its vertex
 * stage and the grass's light in its fragment. Every ring's is a program in
 * common (`customProgramCacheKey`); each carries its own uniforms, because a
 * material's uniforms are uploaded when the material changes between draws.
 */
export function grassMaterial(uniforms: Record<string, THREE.IUniform>, ramp: THREE.Texture, radius: number, earth: boolean): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({ gradientMap: ramp, side: THREE.DoubleSide });
  material.userData.outlineParameters = { visible: false };
  material.userData.uniforms = uniforms;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    if (earth) bindGroundWeather(shader.uniforms);
    bindNearLights(shader.uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${grassVertexPars(radius)}`)
      // Another world's growth keeps the light and shade of Earth's blades and
      // takes its hue from its own ground alone: the tips' warmth, the lush
      // green and the yellow patches would make a grey regolith olive.
      .replace('#include <beginnormal_vertex>', earth ? GRASS_VERTEX_MAIN : GRASS_VERTEX_MAIN.replace(PLAIN_AT, `${PLAIN_AT}\n${PLAIN_HUE}`))
      .replace('#include <begin_vertex>', 'vec3 transformed = grassLocal;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nvarying vec3 vGrassRoot;\nvarying vec3 vGrassColour;\nvarying float vGrassT;\nvarying float vGrassAO;\n${earth ? `${GROUND_MARKS_GLSL}\n${groundWeatherGLSL()}` : ''}\n${nearLightsGLSL()}`,
      )
      .replace('#include <gradientmap_pars_fragment>', GRASS_GRADIENT)
      .replace('#include <lights_toon_pars_fragment>', GRASS_LIGHTS)
      .replace(
        '#include <color_fragment>',
        // The land's own blots over it (`atlasPatches`, `globe.ts`), at the
        // root: a blade is the patch of ground it grows in.
        earth
          ? `#include <color_fragment>\n  diffuseColor.rgb = atlasPatches(diffuseColor.rgb * vGrassColour, vGrassRoot);\n  ${groundWeatherChunk('vGrassRoot')}`
          : // Another world's has no patches of Earth's land and no weather of Earth's on it.
            '#include <color_fragment>\n  diffuseColor.rgb *= vGrassColour;',
      )
      // The normal the vertex stage turned toward the camera, on both faces:
      // three turns a back face's round, and a blade seen from behind would
      // step to the shadow band.
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n  normal = normalize(vNormal);\n  nonPerturbedNormal = normal;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${nearLightsChunk('vGrassRoot')}`)
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n  reflectedLight.indirectDiffuse *= vGrassAO;');
  };
  material.customProgramCacheKey = () => (earth ? 'atlas-grass' : `atlas-grass:${radius.toFixed(1)}`);
  // Earth's deck shades Earth's blades; another world has no deck of Earth's over it.
  return earth ? shadeByClouds(material) : material;
}

/**
 * One blade: `segments` rows of two vertices, `x` -1 and +1 across and `y`
 * the share of the way up, `(i / segments)^0.9`, and the tip. The vertex stage
 * bends it; this is only the parameters.
 */
export function bladeGeometry(segments: number): THREE.InstancedBufferGeometry {
  const positions: number[] = [];
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) ** 0.9;
    positions.push(-1, t, 0, 1, t, 0);
  }
  positions.push(0, 1, 0);
  const index: number[] = [];
  for (let i = 0; i + 1 < segments; i++) {
    const a = i * 2;
    index.push(a, a + 1, a + 3, a, a + 3, a + 2);
  }
  const last = (segments - 1) * 2;
  index.push(last, last + 1, segments * 2);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.instanceCount = 0;
  return geometry;
}
