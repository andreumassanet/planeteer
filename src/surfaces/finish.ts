import type * as THREE from 'three';
import { GROUND_MARKS_GLSL } from '../globe.ts';
import { SURFACE_QUALITY_GLSL, bindSurfaceQuality } from './material.ts';

/**
 * The finish of what is drawn whole rather than built: a machine's paint and
 * a person's clothes, skin and hair. Both are worked out in the mesh's own
 * frame from the `position` attribute (a skinned body's bind pose, so the
 * weave does not swim as it walks), scaled to world units by the mesh's own
 * transform, and fade where a pixel covers more than they can show. Both
 * scale with `atlasQuality`: at 0 the colour is as drawn.
 */

/** The world size of a unit of the mesh's own frame: the model matrix's first column, the mesh being scaled uniformly. */
const FINISH_VERTEX = /* glsl */ `
  vFinishPos = position * length(modelMatrix[0].xyz);
  vFinishNormal = normal;`;

/** A machine's paint over its vertex colour; leaves `finishGloss`, how much of a clear coat it has. */
const PAINT_CHUNK = /* glsl */ `
  float finishGloss = 0.0;
  {
    vec3 finishDx = dFdx(vFinishPos);
    vec3 finishDy = dFdy(vFinishPos);
    float finishPx = max(length(finishDx), length(finishDy));
    if (atlasQuality > 0.0) {
      vec3 p = vFinishPos;
      float luma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
      // The kit's glass is a cool slate (as the varnish reads it); near-black is tyres and rubber trim.
      float glass = smoothstep(0.02, 0.1, diffuseColor.b - diffuseColor.r) * smoothstep(0.05, 0.15, luma);
      float rubber = 1.0 - smoothstep(0.03, 0.08, luma);
      float paint = (1.0 - glass) * (1.0 - rubber);
      // Metallic flake, a speck a few millimetres across, and the orange peel of the coat.
      float flake = atlasHash13(floor(p * 55.0)) - 0.5;
      float peel = atlasNoise(p * 5.0) - 0.5;
      float tone = 1.0 + (flake * 0.09 * (1.0 - smoothstep(0.004, 0.02, finishPx)) + peel * 0.05) * paint;
      // Rubber: worn darker and matte, with a grain seen close.
      float grain = (atlasNoise(p * 28.0) - 0.5) * (1.0 - smoothstep(0.02, 0.06, finishPx));
      tone *= 1.0 + (grain * 0.3 - 0.1) * rubber;
      // Road dust thickest at the sills and the wheels, and patchy.
      float dust = (1.0 - smoothstep(0.1, 1.3, p.y)) * (0.45 + 0.55 * atlasNoise(p * 1.6 + 7.0)) * (1.0 - glass);
      vec3 coloured = diffuseColor.rgb * tone;
      coloured = mix(coloured, coloured * vec3(0.8, 0.74, 0.64) + vec3(0.07, 0.06, 0.045), dust * 0.5);
      diffuseColor.rgb = mix(diffuseColor.rgb, coloured, atlasQuality);
      finishGloss = paint * (1.0 - dust * 0.7) * atlasQuality;
    }
  }`;

/** The clear coat: a tight highlight of the sun over the varnish's broad one. */
const CLEARCOAT_CHUNK = /* glsl */ `
  #if NUM_DIR_LIGHTS > 0
  {
    vec3 coatV = normalize(-vViewPosition);
    vec3 coatL = directionalLights[0].direction;
    vec3 coatH = normalize(coatL + coatV);
    vec3 coatLight = directionalLights[0].color;
    #ifdef ATLAS_CLOUD_SHADE
      coatLight *= 1.0 - atlasCloud.x;
    #endif
    float coatLobe = pow(max(dot(normal, coatH), 0.0), 260.0) * step(0.0, dot(normal, coatL));
    totalEmissiveRadiance += coatLight * coatLobe * 0.5 * finishGloss;
  }
  #endif`;

/**
 * A person's finish by `atlasRole` (`cast/template.ts`): 1 skin, 2 hair, 3
 * cloth, 4 shoes, 5 a pack; 0 (an eye) is left alone.
 */
const CLOTH_CHUNK = /* glsl */ `
  {
    vec3 finishDx = dFdx(vFinishPos);
    vec3 finishDy = dFdy(vFinishPos);
    float finishPx = max(length(finishDx), length(finishDy));
    if (atlasQuality > 0.0 && vFinishRole > 0.5) {
      vec3 p = vFinishPos;
      vec3 a = abs(vFinishNormal);
      // The plane the weave is laid in: the one the face is most nearly in.
      vec2 uv = (a.x > a.y && a.x > a.z) ? p.zy : (a.z > a.y ? p.xy : p.xz);
      float tone = 1.0;
      if (vFinishRole < 1.5) {
        tone = 1.0 + (atlasNoise(p * 9.0) - 0.5) * 0.07 + (atlasNoise(p * 40.0) - 0.5) * 0.03 * (1.0 - smoothstep(0.01, 0.04, finishPx));
      } else if (vFinishRole < 2.5) {
        // Strands along the fall of the hair.
        float strands = atlasNoise(vec3(p.x * 70.0, p.y * 5.0, p.z * 70.0));
        tone = 1.0 + (strands - 0.5) * 0.28 * (1.0 - smoothstep(0.008, 0.03, finishPx)) + (atlasNoise(p * 6.0) - 0.5) * 0.08;
      } else if (vFinishRole < 3.5 || vFinishRole > 4.5) {
        // A plain weave, the threads a few centimetres apart at this scale, over the cloth's broad mottle and wear.
        vec2 thread = uv * 70.0;
        float weave = sin(thread.x * 3.14159) * sin(thread.y * 3.14159);
        float mottle = atlasNoise(p * 3.5) - 0.5;
        float slub = atlasNoise(vec3(uv.x * 140.0, uv.y * 8.0, 3.0)) - 0.5;
        float close = 1.0 - smoothstep(0.006, 0.025, finishPx);
        tone = 1.0 + weave * 0.07 * close + slub * 0.08 * close + mottle * 0.08;
      } else {
        // Leather, scuffed, darker at the sole.
        tone = 1.0 + (atlasNoise(p * 18.0) - 0.5) * 0.12 - (1.0 - smoothstep(0.0, 0.12, p.y)) * 0.18;
      }
      diffuseColor.rgb *= mix(1.0, tone, atlasQuality);
    }
  }`;

function hook(material: THREE.Material, vertexDeclarations: string, vertexBody: string, fragmentDeclarations: string, colour: string, lights: string): void {
  const before = material.onBeforeCompile.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    before(shader, renderer);
    bindSurfaceQuality(shader.uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${vertexDeclarations}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${vertexBody}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${fragmentDeclarations}\n${SURFACE_QUALITY_GLSL}\n${GROUND_MARKS_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${colour}`);
    if (lights !== '') shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${lights}`);
  };
  const key = material.customProgramCacheKey();
  material.customProgramCacheKey = () => `${key}|finish`;
}

/**
 * A painted machine's finish: flake and orange peel in its paint, grain in
 * its rubber, road dust towards its sills and wheels, and a clear coat's
 * tight highlight. Its own frame's y is up from the ground it stands on.
 * Call before the material is cloned.
 */
export function finishPaint(material: THREE.Material): void {
  hook(
    material,
    'varying vec3 vFinishPos;\nvarying vec3 vFinishNormal;',
    FINISH_VERTEX,
    'varying vec3 vFinishPos;\nvarying vec3 vFinishNormal;',
    PAINT_CHUNK,
    CLEARCOAT_CHUNK,
  );
}

/**
 * A person's finish: the weave and mottle of their clothes, strands in their
 * hair, the skin's faint variation and the shoes' leather, by the `atlasRole`
 * each vertex carries. Call before the material is cloned.
 */
export function finishCloth(material: THREE.Material): void {
  hook(
    material,
    'varying vec3 vFinishPos;\nvarying vec3 vFinishNormal;\nattribute float atlasRole;\nvarying float vFinishRole;',
    `${FINISH_VERTEX}\n  vFinishRole = atlasRole;`,
    'varying vec3 vFinishPos;\nvarying vec3 vFinishNormal;\nvarying float vFinishRole;',
    CLOTH_CHUNK,
    '',
  );
}
