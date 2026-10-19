import * as THREE from 'three';
import { shadeByClouds } from '../cloud-shade.ts';
import { seeThrough } from '../see-through.ts';
import { MACHINE_BED } from '../craft/parked.ts';
import { GROUND_MARKS_GLSL, LUSH_GLSL, bindGroundWeather, groundPatchesChunk, groundWeatherChunk, groundWeatherGLSL, wetSheenChunk, wetSheenGLSL } from '../globe.ts';
import {
  LAND_GROUND_GLSL, LAND_SURFACE_GLSL, LAND_SURFACE_VERTEX_PARS, landBumpChunk, landSurfaceUniforms, landSurfaceVertex, madeLandChunk,
} from '../globe.ts';
import { VARNISH_GLSL } from '../gloss.ts';
import { lightWindows } from '../lights.ts';
import { surfaceQuality } from '../graphics-quality.ts';
import { createToonRamp } from '../theme.ts';
import { GLASS, LAND_GROUND, ROOM_GLSL, SURFACE_GLSL, townPaintChunk } from '../surfaces.ts';

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

const TOWN_PAINT = townPaintChunk('vAtlasPos');

/** Past this many world units a pixel, no surface is bent: its joints are under a pixel. */
const BUMP_REACH = 0.2;
/** How hard a height's slope bends the normal; 1 is the height as modelled. */
const BUMP_GAIN = 2.2;
/** The steepest a bent normal may lean, as a slope. */
const BUMP_MOST = 2.5;

/**
 * The walls' and roofs' materials (`surfaces.ts`), drawn over the paint. The
 * pixel's footprint is taken before the branch, where its derivatives are defined.
 */
const TOWN_SURFACE = /* glsl */ `
  vec2 townBump = vec2(0.0);
  vec3 townRoomGlow = vec3(1.0);
  {
    vec3 townDx = dFdx(vTownPos);
    vec3 townDy = dFdy(vTownPos);
    float townPx = max(length(townDx), length(townDy));
    vec3 townN = normalize(vTownNormal);
    vec3 townAlong = normalize(vec3(-townN.z, 0.0, townN.x) + vec3(1e-4, 0.0, 0.0));
    // A pane's size in world units: how fast the world moves across it against how fast its corners' share does.
    float paneWidth = length(vec2(dot(townDx, townAlong), dot(townDy, townAlong)))
      / max(length(vec2(dFdx(vPane.x), dFdy(vPane.x))), 1e-5);
    float paneHeight = length(vec2(townDx.y, townDy.y)) / max(length(vec2(dFdx(vPane.y), dFdy(vPane.y))), 1e-5);
    if (atlasQuality <= 0.0 || madeLand) {
    } else if (vSurface > ${(GLASS - 0.5).toFixed(1)}) {
      vec3 look = normalize(vTownPos - vTownEye);
      vec3 into = vec3(dot(look, townAlong), look.y, -dot(look, townN));
      vec2 paneMid = (vTownPos.xz - townAlong.xz * (vPane.x - 0.5) * paneWidth);
      vec2 roomSeed = floor(vec2(paneMid.x + paneMid.y, vTownPos.y - (vPane.y - 0.5) * paneHeight) * 0.5);
      float cover;
      vec3 room = surfRoom(vPane, clamp(paneWidth, 0.3, 12.0), clamp(paneHeight, 0.3, 8.0), into, roomSeed, townRoomGlow, cover);
      // The glass gives back the sky the more it is seen on edge; a curtain is behind no reflection worth drawing.
      float fresnel = (0.05 + 0.55 * pow(1.0 - clamp(into.z, 0.0, 1.0), 5.0)) * (1.0 - cover * 0.7);
      vec3 sky = mix(diffuseColor.rgb * 1.6, vec3(0.62, 0.74, 0.86), 0.45);
      float near = 1.0 - smoothstep(0.35, 1.4, townPx);
      diffuseColor.rgb = mix(diffuseColor.rgb, mix(room, sky, fresnel), near);
      townRoomGlow = mix(vec3(1.0), townRoomGlow, near);
    } else if (vSurface > 0.5) {
      vec2 here = surfPattern(vSurface, vTownPos, townN, diffuseColor.rgb, townPx);
      // The height a pixel over and a pixel up, for the slope the normal is bent by; only where it can show.
      if (townPx < ${BUMP_REACH.toFixed(2)}) {
        float right = surfPattern(vSurface, vTownPos + townDx, townN, diffuseColor.rgb, townPx).y;
        float up = surfPattern(vSurface, vTownPos + townDy, townN, diffuseColor.rgb, townPx).y;
        townBump = vec2(right - here.y, up - here.y) / max(townPx, 1e-4) * ${BUMP_GAIN.toFixed(2)};
        float steep = length(townBump);
        if (steep > ${BUMP_MOST.toFixed(2)}) townBump *= ${BUMP_MOST.toFixed(2)} / steep;
      }
      diffuseColor.rgb *= here.x;
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
    shader.uniforms.atlasQuality = surfaceQuality;
    Object.assign(shader.uniforms, landSurfaceUniforms());
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vAtlasPos;\nattribute float atlasSurface;\nvarying float vSurface;\nvarying vec3 vTownPos;\nvarying vec3 vTownNormal;\nattribute vec2 atlasPane;\nvarying vec2 vPane;\nvarying vec3 vTownEye;\n' + LAND_SURFACE_VERTEX_PARS)
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n  vAtlasPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\n  vSurface = atlasSurface;\n  vTownPos = transformed;\n  vTownNormal = objectNormal;\n  vPane = atlasPane;\n  vTownEye = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;\n  ' + landSurfaceVertex('vAtlasPos'),
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vAtlasPos;\nvarying float vSurface;\nvarying vec3 vTownPos;\nvarying vec3 vTownNormal;\nvarying vec2 vPane;\nvarying vec3 vTownEye;\nuniform float atlasQuality;\n${LUSH_GLSL}\n${GROUND_MARKS_GLSL}\n${groundWeatherGLSL()}\n${LAND_SURFACE_GLSL}\n${LAND_GROUND_GLSL}\n${SURFACE_GLSL}\n${ROOM_GLSL}`)
      // The weather first, so a lawn under snow takes the patches' tone on
      // white. The paint is worked out for every pixel and dropped for a
      // vehicle's, so the brush's derivatives stay out of a branch.
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>\n  ${MACHINE_TEST}\n  vec3 townMachineColour = diffuseColor.rgb;\n  ${madeLandChunk(`abs(vSurface - ${LAND_GROUND.toFixed(1)}) < 0.5`, 'atlasQuality')}\n  ${groundWeatherChunk('vAtlasPos')}\n  ${groundPatchesChunk('vAtlasPos')}\n  ${TOWN_PAINT}\n  ${TOWN_SURFACE}\n  if (townMachine) townBump = vec2(0.0);\n  if (townMachine) diffuseColor.rgb = townMachineColour;\n  // The land's own ground (an edge slope, an outer yard) is the hillside's colour, not the town's paint.\n  if (madeLand) diffuseColor.rgb = madeLandColour;`,
      )
      // Nor the light the lamps and headlights lay on the town, which no craft takes either.
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n  normal = surfBend(-vViewPosition, normal, townBump, faceDirection);\n  ${landBumpChunk('madeLandBump', '1.0')}`)
      .replace('#include <emissivemap_fragment>', 'vec3 townMachineGlow = totalEmissiveRadiance;\n  #include <emissivemap_fragment>')
      .replace('#include <lights_toon_fragment>', 'if (townMachine) totalEmissiveRadiance = townMachineGlow;\n  totalEmissiveRadiance *= townRoomGlow;\n  #include <lights_toon_fragment>')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n  if (townMachine) ${VARNISH_GLSL}`)
      // A wet floor's and a flat roof's sheen and puddles, over the light; never a parked car's.
      .replace('void main() {', `${wetSheenGLSL()}\nvoid main() {`)
      .replace('#include <opaque_fragment>', wetSheenChunk('vAtlasPos', 'townMachine || madeLand'));
  };
  // Last, over the windows and the paint, and before `fadeTwin` clones it.
  return seeThrough(shadeByClouds(material));
}
