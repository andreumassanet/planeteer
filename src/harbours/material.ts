/**
 * The one material every harbour is drawn in: the merged vertex colours on
 * the cel ramp, three things more. The boats and buoys bob, by a per-vertex
 * `harbourBob` (amplitude, phase, and the boat's middle across and out),
 * through `atlasVertex`, which the ink's hull applies too so a hull never
 * parts from its boat. The lamps' and the lighthouse's glass glows after dark
 * (`harbourGlow`). And the near lamps and headlights light it, as the land.
 */
import * as THREE from 'three';
import type { MonumentContext } from '../monuments/contract.ts';
import { bindNearLights, nearLightsChunk, nearLightsGLSL } from '../lights.ts';

/** The clock the boats bob to, seconds. */
export const harbourTime = { value: 0 };

const BOB_GLSL = /* glsl */ `uniform float harbourTime;
attribute vec4 harbourBob;

vec3 atlasVertex( vec3 p ) {
  if ( harbourBob.x == 0.0 ) return p;
  float t = harbourTime + harbourBob.y;
  float heave = harbourBob.x * sin( t * 1.1 );
  float roll = harbourBob.x * 0.09 * sin( t * 0.83 + 1.7 );
  float pitch = harbourBob.x * 0.04 * sin( t * 0.61 + 0.4 );
  return p + vec3( 0.0, heave + roll * ( p.x - harbourBob.z ) + pitch * ( p.z - harbourBob.w ), 0.0 );
}`;

/** How bright a lamp's glass is at full night, over its own colour. */
const GLOW = 1.6;

export function harbourMaterial(ctx: MonumentContext): THREE.MeshToonMaterial {
  const inked = ctx.toon(ctx.palette.ink);
  const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: inked.gradientMap });
  const uniforms = { harbourTime };
  material.userData.outlineParameters = {
    ...(inked.userData.outlineParameters as object),
    outlineNormal: true,
    transform: { declaration: BOB_GLSL, uniforms },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    bindNearLights(shader.uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${BOB_GLSL}\nattribute float harbourGlow;\nvarying float vHarbourGlow;\nvarying vec3 vHarbourWorld;`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed = atlasVertex( transformed );')
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\n  vHarbourGlow = harbourGlow;\n  vHarbourWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying float vHarbourGlow;\nvarying vec3 vHarbourWorld;\n${nearLightsGLSL()}`)
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n' +
          `  totalEmissiveRadiance += diffuseColor.rgb * vHarbourGlow * ${GLOW.toFixed(2)} * atlasGain * atlasNight( normalize( vHarbourWorld ), atlasSun );\n` +
          nearLightsChunk('vHarbourWorld'),
      );
  };
  material.customProgramCacheKey = () => 'atlas-harbour';
  return material;
}
