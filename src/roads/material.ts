import * as THREE from 'three';
import { shadeByClouds } from '../cloud-shade.ts';
import { dissolveGLSL } from '../fade.ts';
import {
  GROUND_MARKS_GLSL, LAND_GROUND_GLSL, LAND_SURFACE_GLSL, LAND_SURFACE_VERTEX_PARS, LUSH_GLSL, bindGroundWeather, groundPatchesChunk,
  groundWeatherChunk, groundWeatherGLSL, wetSheenChunk, wetSheenGLSL, landBumpChunk, landSurfaceUniforms, landSurfaceVertex, madeLandChunk,
} from '../globe.ts';
import { lightWindows } from '../lights.ts';
import { FLOOR, SURFACE_GLSL, SURFACE_QUALITY_GLSL, bindSurfaceQuality, surfaceDetailChunk, townPaintChunk } from '../surfaces.ts';
import { createToonRamp } from '../theme.ts';
import { LAYER_DEPTH } from './overlap.ts';

/**
 * The ribbon's material and the roadside's. The ribbon has no ink hull (a road
 * is a mark on the ground, not an object on it), is pushed back per depth
 * layer after projection, carries the gate lights after dark, dissolves at its
 * class's reach, and paints its surface by what each vertex is (`roadMark`):
 * the carriageway, the pavement and the paint take the town floor's own
 * patterns (`FLOOR`) in the plane of the town at their end (`roadSurf`), and
 * near a town its paint (`townPaintChunk`), so a road and the street it runs
 * into are one surface.
 */

/**
 * What a ribbon vertex is, for the paint (`roadMark.x`); `roadMark.y` says
 * where across it lies: the carriageway -1 to 1 edge to edge; a shoulder or
 * pavement 0 at the carriageway and 1 at the top's edge; the bank 0 at the top
 * and 1 at the toe, -1 down the skirt; the painted lines; a bridge's girder.
 */
export const MARK_ROAD = 0;
export const MARK_SHOULDER = 1;
export const MARK_BANK = 2;
export const MARK_PAINT = 3;
export const MARK_GIRDER = 4;
export const MARK_WALK = 5;

/** The share of a class's reach a road dissolves over, at its far end. */
const REACH_FADE = 0.15;
/** A reach no distance on the planet reaches: what the dissolve reads with fades off. */
export const NO_REACH = 1e9;

/** What a bank's worn top is scuffed towards: packed earth. */
const BANK_SCUFF = 0xbaa076;

/** A colour as a GLSL `vec3` of its linear components. */
const vec3Of = (hex: number): string => {
  const c = new THREE.Color(hex);
  return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`;
};

/**
 * The ribbon's normals, softened toward the local up: the carriageway and
 * shoulders a quarter of the way, the bank a third, so a climbing road does
 * not show each piece as a facet. `modelMatrix` is a translation only, so the
 * object normal is the world one. `vRoadLean` (how far the face leans off the
 * level) is what the paint reads a steep bank by.
 */
const ROAD_NORMAL_GLSL = /* glsl */ `
  {
    vec3 roadUp = normalize((modelMatrix * vec4(position, 1.0)).xyz);
    float roadKind = floor(roadMark.x + 0.5);
    float roadSoft = roadKind == ${MARK_BANK}.0 ? 0.33 : roadKind == ${MARK_GIRDER}.0 ? 0.0 : 0.25;
    vRoadLean = 1.0 - abs(dot(objectNormal, roadUp));
    objectNormal = normalize(mix(objectNormal, roadUp, roadSoft));
  }`;

/**
 * The ribbon's surface paint over the vertex colour, by mark: a broad tone,
 * a stroke and a near-eye grain everywhere (each fading as a pixel covers it);
 * worn wheel tracks and a ragged edge on the carriageway; gravel speckle on
 * the shoulder; on the bank, how worn its top is (`roadScuff`); paint worn
 * through near the eye.
 */
const ROAD_PAINT_GLSL = /* glsl */ `
  float roadKind = floor(vRoadMark.x + 0.5);
  float roadAcross = vRoadMark.y;
  float roadScuff = 0.0;
  {
    float roadFoot = max(length(dFdx(vRoadWorld)), length(dFdy(vRoadWorld)));
    float roadNear = 1.0 - smoothstep(0.08, 0.35, roadFoot);
    float roadMid = 1.0 - smoothstep(0.7, 2.8, roadFoot);
    float roadBroad = atlasNoise(vRoadWorld * ${(1 / 23).toFixed(6)});
    float roadStroke = roadMid > 0.0 ? atlasNoise(vRoadWorld * ${(1 / 5.5).toFixed(6)} + 3.7) : 0.5;
    float roadGrain = roadNear > 0.0 ? atlasNoise(vRoadWorld * ${(1 / 0.7).toFixed(6)} + 11.3) : 0.5;
    vec3 roadEarth = ${vec3Of(0xbaa076)};
    float roadFar = 1.0 - smoothstep(3.0, 12.0, roadFoot);
    float roadTone = 1.0 + (roadBroad - 0.5) * 0.2 * roadFar + (roadStroke - 0.5) * 0.12 * roadMid;
    if (roadKind == ${MARK_ROAD}.0) {
      float t = abs(roadAcross);
      float track = 1.0 - smoothstep(0.035, 0.1, abs(abs(t - 0.5) - 0.236));
      diffuseColor.rgb *= roadTone * (1.0 + (roadGrain - 0.5) * 0.14 * roadNear);
      // A track is a third of a unit wide: gone before a pixel covers it.
      diffuseColor.rgb *= 1.0 - 0.11 * track * (0.75 + 0.5 * roadStroke) * (1.0 - smoothstep(0.08, 0.3, roadFoot));
      float rag = smoothstep(0.93, 1.0, t + (roadStroke - 0.5) * 0.1 * roadMid + (roadGrain - 0.5) * 0.06 * roadNear);
      diffuseColor.rgb = mix(diffuseColor.rgb, roadEarth * roadTone, rag * 0.8);
    } else if (roadKind == ${MARK_SHOULDER}.0) {
      float pebble = smoothstep(0.62, 0.8, roadGrain) * roadNear;
      diffuseColor.rgb *= roadTone * (1.0 + (roadGrain - 0.5) * 0.24 * roadNear) * (1.0 - 0.18 * pebble);
    } else if (roadKind == ${MARK_BANK}.0) {
      // The bank is the land's own ground (\`madeLand\`), in the land's colour
      // under it, so it meets the field on no line; it is scuffed only along its
      // top, and the skirt (across -1) is the field come up a sag.
      float skirt = roadAcross < -0.5 ? 1.0 : 0.0;
      float roadOut = max(roadAcross, skirt);
      roadScuff = 0.5 * (1.0 - smoothstep(0.0, 0.14, roadOut + (roadStroke - 0.5) * 0.25 + (roadBroad - 0.5) * 0.15));
    } else if (roadKind == ${MARK_PAINT}.0) {
      float wear = roadStroke * 0.55 + roadGrain * 0.45;
      // A town's line is worn by its pattern, not holed: near one, nothing is dropped.
      if (roadNear > 0.5 && wear < 0.3 && vRoadSurf.z < 0.5) discard;
      diffuseColor.rgb *= 0.9 + 0.1 * roadStroke;
    } else {
      diffuseColor.rgb *= roadTone * (1.0 + (roadGrain - 0.5) * 0.08 * roadNear);
    }
  }`;

/**
 * Near a town (`vRoadSurf.z`, 1 at its kerb), the top is painted as the town
 * paints its streets: its weather, patches and paint over the vertex colour,
 * in place of the road's own wear. Then the floor's pattern over the top, by
 * mark: asphalt, slabs or paint, in the town's plane.
 */
const ROAD_TOWN_GLSL = /* glsl */ `
  float roadCode = 0.0;
  {
    float roadKind = floor(vRoadMark.x + 0.5);
    roadCode = roadKind == ${MARK_ROAD}.0 ? ${FLOOR.asphalt}.0 : roadKind == ${MARK_WALK}.0 ? ${FLOOR.slabs}.0 : roadKind == ${MARK_PAINT}.0 ? ${FLOOR.paint}.0 : 0.0;
  }
  if (roadCode > 0.5 && vRoadSurf.z > 0.0) {
    vec3 roadOwn = diffuseColor.rgb;
    diffuseColor.rgb = roadBase;
    ${groundWeatherChunk('vRoadWorld')}
    ${groundPatchesChunk('vRoadWorld')}
    ${townPaintChunk('vRoadWorld')}
    diffuseColor.rgb = mix(roadOwn, diffuseColor.rgb, vRoadSurf.z);
  }
  vec3 roadPlane = vec3(vRoadSurf.x, 0.0, vRoadSurf.y);
  ${surfaceDetailChunk('roadCode', 'roadPlane', 'vec3(0.0, 1.0, 0.0)', 'roadBump')}`;

/**
 * The ribbon's material. `reach` holds each class's reach (x lane, y road,
 * z trunk), set per scan; a fragment dissolves over the last `REACH_FADE` of
 * its class's reach from the camera. `OutlineEffect` ignores the hook, which
 * is fine because the ribbon has no hull.
 */
export function createRoadMaterial(): { material: THREE.MeshToonMaterial; reach: { value: THREE.Vector3 } } {
  const material = new THREE.MeshToonMaterial({
    vertexColors: true,
    gradientMap: createToonRamp(4),
  });
  material.userData.outlineParameters = { visible: false };
  // Chained after `lightWindows`' own hook; both only append to the chunks they match.
  lightWindows(material);
  const lit = material.onBeforeCompile;
  const reach = { value: new THREE.Vector3(NO_REACH, NO_REACH, NO_REACH) };
  material.onBeforeCompile = (shader, renderer) => {
    lit(shader, renderer);
    shader.uniforms['roadReach'] = reach;
    bindGroundWeather(shader.uniforms);
    bindSurfaceQuality(shader.uniforms);
    Object.assign(shader.uniforms, landSurfaceUniforms());
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float roadLayer;\nattribute float roadClass;\nattribute vec2 roadMark;\nattribute vec3 roadSurf;\nuniform vec3 roadReach;\nvarying vec3 vRoadWorld;\nvarying float vRoadReach;\nvarying vec2 vRoadMark;\nvarying float vRoadLean;\nvarying vec3 vRoadSurf;\n' + LAND_SURFACE_VERTEX_PARS,
      )
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n${ROAD_NORMAL_GLSL}`)
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>\n\tgl_Position.z += roadLayer * ${LAYER_DEPTH.toExponential(3)} * gl_Position.w;` +
          '\n\tvRoadWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;' +
          '\n\tvRoadReach = roadClass < 0.5 ? roadReach.x : roadClass < 1.5 ? roadReach.y : roadReach.z;' +
          '\n\tvRoadMark = vec2(roadMark.x, roadMark.y / 127.0);' +
          '\n\tvRoadSurf = roadSurf;\n\t' + landSurfaceVertex('vRoadWorld'),
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nvarying vec3 vRoadWorld;\nvarying float vRoadReach;\nvarying vec2 vRoadMark;\nvarying float vRoadLean;\nvarying vec3 vRoadSurf;\n${SURFACE_QUALITY_GLSL}\n${GROUND_MARKS_GLSL}\n${LUSH_GLSL}\n${groundWeatherGLSL()}\n${LAND_SURFACE_GLSL}\n${LAND_GROUND_GLSL}\n${SURFACE_GLSL}`,
      )
      // The paint, then the weather; on the bank, the land's own patches and brush.
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>\n  vec3 roadBase = diffuseColor.rgb;\n  vec3 vAtlasPos = vRoadWorld;\n` +
          `  ${madeLandChunk(`abs(vRoadMark.x - ${MARK_BANK.toFixed(1)}) < 0.5`, 'atlasQuality')}\n` +
          `${ROAD_PAINT_GLSL}\n  ${groundWeatherChunk('vRoadWorld')}\n${ROAD_TOWN_GLSL}\n` +
          `  if (madeLand) diffuseColor.rgb = mix(madeLandColour, ${vec3Of(BANK_SCUFF)}, roadScuff);`,
      )
      // A wet carriageway's sheen and puddles, over the light (`wetSheenGLSL`).
      .replace('void main() {', `${wetSheenGLSL()}\nvoid main() {`)
      .replace('#include <opaque_fragment>', wetSheenChunk('vRoadWorld', 'madeLand'))
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>\n  normal = surfBend(-vViewPosition, normal, roadBump, faceDirection);\n  ${landBumpChunk('madeLandBump', '1.0')}`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        '#include <clipping_planes_fragment>\n' +
          `float roadFade = 1.0 - smoothstep(vRoadReach * ${(1 - REACH_FADE).toFixed(3)}, vRoadReach, distance(vRoadWorld, cameraPosition));\n` +
          dissolveGLSL('roadFade'),
      );
  };
  material.customProgramCacheKey = () => 'roads:layers:lit:fade:paint:floor:land';
  shadeByClouds(material);
  return { material, reach };
}

/**
 * The roadside's material: inked, since a pole stands on the ground, with its
 * lamp heads lit as windows. It receives shadows and casts none.
 */
export function createPropsMaterial(): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({
    vertexColors: true,
    gradientMap: createToonRamp(4),
  });
  lightWindows(material);
  shadeByClouds(material);
  return material;
}
