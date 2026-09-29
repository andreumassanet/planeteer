import type * as THREE from 'three';

/** How glossy paint is against glass's 1. */
const GLOSS_PAINT = 0.55;
/** The sun's highlight, and the sky's reflection, at full gloss. */
const GLOSS_SPECULAR = 0.35;
const GLOSS_SKY = 0.7;

/**
 * A varnish for painted machines: the sky caught along a car's flanks and
 * the sun's highlight on its roof and glass.
 *
 * The toon model has no specular term at all — its outgoing light is diffuse
 * and emission — and a car lit only by its diffuse is a painted block of wood,
 * which is what a toy is and not what a vehicle is. So the varnish is added as
 * emission after the lights: a Schlick fresnel toward the hemisphere light's
 * sky colour, which is what makes a surface read as glossy from any angle, and
 * a broad Blinn-Phong lobe for each directional light, the sun's highlight.
 *
 * How glossy a vertex is comes from its colour, because the models carry no
 * other channel for it: glass (the slate-blue the kit paints every pane) is a
 * mirror, near-black (tyres, trim, rubber) is matte, and paint is between.
 * The highlight is not shadowed — the shadow term is gone by this point — and
 * a car in a building's shade keeps a faint highlight, which nobody reads as
 * wrong.
 *
 * A block of its own, after `<lights_fragment_end>`: what a material that
 * draws a still vehicle among other things (a town's, a wood's) runs for its
 * vehicles' vertices only, so a parked car is varnished as the one driven off.
 */
export const VARNISH_GLSL = /* glsl */ `
  {
    vec3 glossV = normalize(-vViewPosition);
    float glossNV = clamp(dot(normal, glossV), 0.0, 1.0);
    float glossFresnel = 0.04 + 0.96 * pow(1.0 - glossNV, 5.0);
    float glossLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
    // The kit's glass is a cool slate: blue over red, and not dark.
    float glossGlass = smoothstep(0.02, 0.1, diffuseColor.b - diffuseColor.r) * smoothstep(0.05, 0.15, glossLuma);
    float glossAmount = mix(smoothstep(0.02, 0.12, glossLuma) * ${GLOSS_PAINT.toFixed(2)}, 1.0, glossGlass);
    vec3 glossSky = vec3(0.55, 0.7, 0.9);
    #if NUM_HEMI_LIGHTS > 0
      glossSky = hemisphereLights[0].skyColor;
    #endif
    vec3 glossSpecular = vec3(0.0);
    #if NUM_DIR_LIGHTS > 0
      #pragma unroll_loop_start
      // A block of its own a light: three unrolls the loop, and the unrolled
      // copies would otherwise declare the same names twice.
      for (int i = 0; i < NUM_DIR_LIGHTS; i++) {{
        vec3 glossL = directionalLights[i].direction;
        vec3 glossH = normalize(glossL + glossV);
        glossSpecular += directionalLights[i].color * pow(max(dot(normal, glossH), 0.0), mix(24.0, 90.0, glossGlass))
          * step(0.0, dot(normal, glossL));
      }}
      #pragma unroll_loop_end
    #endif
    totalEmissiveRadiance += (glossSpecular * ${GLOSS_SPECULAR.toFixed(2)} + glossSky * glossFresnel * ${GLOSS_SKY.toFixed(2)}) * glossAmount;
  }
`;

/**
 * Varnishes a vertex-coloured toon material, chaining whatever it already
 * does in `onBeforeCompile`. Call once, before the material is cloned (the
 * streamers' dissolve clones chain the source's hook and key).
 */
export function varnish(material: THREE.MeshToonMaterial): THREE.MeshToonMaterial {
  const base = material.onBeforeCompile.bind(material);
  const key = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    base(shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_fragment_end>',
      `#include <lights_fragment_end>\n${VARNISH_GLSL}`,
    );
  };
  material.customProgramCacheKey = () => `${key}|varnish`;
  return material;
}
