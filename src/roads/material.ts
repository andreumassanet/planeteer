import * as THREE from 'three';
import { shadeByClouds } from '../cloud-shade.ts';
import { dissolveGLSL } from '../fade.ts';
import {
  GROUND_MARKS_GLSL, LUSH_GLSL, bindGroundWeather, groundBrushChunk, groundPatchesChunk, groundWeatherChunk, groundWeatherGLSL,
} from '../globe.ts';
import { lightWindows } from '../lights.ts';
import { createToonRamp } from '../theme.ts';
import { LAYER_DEPTH } from './overlap.ts';

/**
 * The ribbon's material and the roadside's. The ribbon has no ink hull (a road
 * is a mark on the ground, not an object on it), is pushed back per depth
 * layer after projection, carries the gate lights after dark, dissolves at its
 * class's reach, and paints its surface by what each vertex is (`roadMark`).
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
 * the shoulder; the land's own green on the bank, scuffed along its top and
 * bare where steeper than `BANK_GRADE`; paint worn through near the eye.
 */
const ROAD_PAINT_GLSL = /* glsl */ `
  float roadKind = floor(vRoadMark.x + 0.5);
  float roadAcross = vRoadMark.y;
  float roadBank = roadKind == ${MARK_BANK}.0 ? 1.0 : 0.0;
  {
    float roadFoot = max(length(dFdx(vRoadWorld)), length(dFdy(vRoadWorld)));
    float roadNear = 1.0 - smoothstep(0.08, 0.35, roadFoot);
    float roadMid = 1.0 - smoothstep(0.7, 2.8, roadFoot);
    float roadBroad = atlasNoise(vRoadWorld * ${(1 / 23).toFixed(6)});
    float roadStroke = roadMid > 0.0 ? atlasNoise(vRoadWorld * ${(1 / 5.5).toFixed(6)} + 3.7) : 0.5;
    float roadGrain = roadNear > 0.0 ? atlasNoise(vRoadWorld * ${(1 / 0.7).toFixed(6)} + 11.3) : 0.5;
    vec3 roadEarth = ${vec3Of(0xbaa076)};
    vec3 roadBare = ${vec3Of(0x8c7152)};
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
      // The skirt (across -1) is the field's own ground come up a sag: never bare.
      float skirt = roadAcross < -0.5 ? 1.0 : 0.0;
      float roadOut = max(roadAcross, skirt);
      diffuseColor.rgb = mix(diffuseColor.rgb, atlasLush(diffuseColor.rgb), smoothstep(0.05, 0.3, roadOut));
      // Scuffed only along the top, bare only where steeper than the graded bank.
      float scuff = 1.0 - smoothstep(0.0, 0.14, roadOut + (roadStroke - 0.5) * 0.25 + (roadBroad - 0.5) * 0.15);
      diffuseColor.rgb = mix(diffuseColor.rgb, roadEarth, scuff * 0.5);
      diffuseColor.rgb = mix(diffuseColor.rgb, roadBare * roadTone, smoothstep(0.3, 0.55, vRoadLean) * 0.8 * (1.0 - skirt));
    } else if (roadKind == ${MARK_PAINT}.0) {
      float wear = roadStroke * 0.55 + roadGrain * 0.45;
      if (roadNear > 0.5 && wear < 0.3) discard;
      diffuseColor.rgb *= 0.9 + 0.1 * roadStroke;
    } else {
      diffuseColor.rgb *= roadTone * (1.0 + (roadGrain - 0.5) * 0.08 * roadNear);
    }
  }`;

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
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float roadLayer;\nattribute float roadClass;\nattribute vec2 roadMark;\nuniform vec3 roadReach;\nvarying vec3 vRoadWorld;\nvarying float vRoadReach;\nvarying vec2 vRoadMark;\nvarying float vRoadLean;',
      )
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n${ROAD_NORMAL_GLSL}`)
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>\n\tgl_Position.z += roadLayer * ${LAYER_DEPTH.toExponential(3)} * gl_Position.w;` +
          '\n\tvRoadWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;' +
          '\n\tvRoadReach = roadClass < 0.5 ? roadReach.x : roadClass < 1.5 ? roadReach.y : roadReach.z;' +
          '\n\tvRoadMark = vec2(roadMark.x, roadMark.y / 127.0);',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nvarying vec3 vRoadWorld;\nvarying float vRoadReach;\nvarying vec2 vRoadMark;\nvarying float vRoadLean;\n${GROUND_MARKS_GLSL}\n${LUSH_GLSL}\n${groundWeatherGLSL()}`,
      )
      // The paint, then the weather; on the bank, the land's own patches and brush.
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>\n${ROAD_PAINT_GLSL}\n  ${groundWeatherChunk('vRoadWorld')}\n` +
          `  {\n    vec3 roadUnpainted = diffuseColor.rgb;\n    ${groundPatchesChunk('vRoadWorld')}\n    ${groundBrushChunk('vRoadWorld')}\n` +
          `    diffuseColor.rgb = mix(roadUnpainted, diffuseColor.rgb, roadBank);\n  }`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        '#include <clipping_planes_fragment>\n' +
          `float roadFade = 1.0 - smoothstep(vRoadReach * ${(1 - REACH_FADE).toFixed(3)}, vRoadReach, distance(vRoadWorld, cameraPosition));\n` +
          dissolveGLSL('roadFade'),
      );
  };
  material.customProgramCacheKey = () => 'roads:layers:lit:fade:paint';
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
