import type * as THREE from 'three';
import { GROUND_MARKS_GLSL } from '../globe.ts';
import { surfaceQuality } from '../graphics-quality.ts';
import { GLASS } from './codes.ts';
import { SURFACE_GLSL } from './patterns.ts';
import { ROOM_GLSL } from './room.ts';

/** Past this many world units a pixel, no surface is bent: its joints are under a pixel. */
export const BUMP_REACH = 0.2;
/** How hard a height's slope bends the normal; 1 is the height as modelled. */
export const BUMP_GAIN = 2.2;
/** The steepest a bent normal may lean, as a slope. */
export const BUMP_MOST = 2.5;

/** The quality's uniform, declared once in a fragment stage that draws detail. */
export const SURFACE_QUALITY_GLSL = 'uniform float atlasQuality;';

/** Binds `surfaceQuality` as `atlasQuality`, shared by reference so a switch reaches every program. */
export function bindSurfaceQuality(uniforms: Record<string, THREE.IUniform>): void {
  uniforms.atlasQuality = surfaceQuality;
}

/** What a pane's room is drawn from: the corners' share (`atlasPane`), the eye in the mesh's frame, and the room's light out. */
export interface PaneNames {
  pane: string;
  eye: string;
  glow: string;
}

/**
 * The room behind a pane (`ROOM_GLSL`) at `pos`, over the glass's own colour,
 * with the sky the glass gives back on edge. `glow` is left the tint the lit
 * window's light takes from the room. Inside the chunk's own braces, where the
 * derivatives are taken.
 */
function glassBranch(pos: string, names: PaneNames): string {
  const { pane, eye, glow } = names;
  return /* glsl */ `
      vec3 surfAlong = normalize(vec3(-surfN.z, 0.0, surfN.x) + vec3(1e-4, 0.0, 0.0));
      vec3 surfLook = normalize(${pos} - ${eye});
      vec3 surfInto = vec3(dot(surfLook, surfAlong), surfLook.y, -dot(surfLook, surfN));
      vec2 surfPaneMid = ${pos}.xz - surfAlong.xz * (${pane}.x - 0.5) * surfPaneWidth;
      vec2 surfRoomSeed = floor(vec2(surfPaneMid.x + surfPaneMid.y, ${pos}.y - (${pane}.y - 0.5) * surfPaneHeight) * 0.5);
      float surfCover;
      vec3 surfRoomColour = surfRoom(${pane}, clamp(surfPaneWidth, 0.3, 12.0), clamp(surfPaneHeight, 0.3, 8.0), surfInto, surfRoomSeed, ${glow}, surfCover);
      // The glass gives back the sky the more it is seen on edge; a curtain is behind no reflection worth drawing.
      float surfFresnel = (0.05 + 0.55 * pow(1.0 - clamp(surfInto.z, 0.0, 1.0), 5.0)) * (1.0 - surfCover * 0.7);
      vec3 surfSky = mix(diffuseColor.rgb * 1.6, vec3(0.62, 0.74, 0.86), 0.45);
      float surfNear = (1.0 - smoothstep(0.35, 1.4, surfPx)) * atlasQuality;
      diffuseColor.rgb = mix(diffuseColor.rgb, mix(surfRoomColour, surfSky, surfFresnel), surfNear);
      ${glow} = mix(vec3(1.0), ${glow}, surfNear);`;
}

/**
 * The pattern of the surface `code` names, drawn over `diffuseColor` at
 * `pos` (world units, +y up) with the face's `normal`, and the slope its
 * height bends the normal by, left in `bump` for `surfBend`. With `panes`, a
 * `GLASS` vertex is drawn as the room behind it (and `ROOM_GLSL` is needed).
 * Needs `SURFACE_GLSL` and `SURFACE_QUALITY_GLSL`; at quality 0 the colour and
 * the normal are as drawn. The pixel's footprint is taken before the branch,
 * where its derivatives are defined.
 */
export function surfaceDetailChunk(code: string, pos: string, normal: string, bump: string, panes?: PaneNames): string {
  const glass = panes === undefined
    ? ''
    : /* glsl */ `
    // A pane's size in world units: how fast the world moves across it against how fast its corners' share does.
    vec3 surfAcross = normalize(vec3(-${normal}.z, 0.0, ${normal}.x) + vec3(1e-4, 0.0, 0.0));
    float surfPaneWidth = length(vec2(dot(surfDx, surfAcross), dot(surfDy, surfAcross)))
      / max(length(vec2(dFdx(${panes.pane}.x), dFdy(${panes.pane}.x))), 1e-5);
    float surfPaneHeight = length(vec2(surfDx.y, surfDy.y)) / max(length(vec2(dFdx(${panes.pane}.y), dFdy(${panes.pane}.y))), 1e-5);
    if (${code} > ${(GLASS - 0.5).toFixed(1)}) {
      if (atlasQuality > 0.0) {
        vec3 surfN = normalize(${normal});${glassBranch(pos, panes)}
      }
    } else`;
  return /* glsl */ `
  vec2 ${bump} = vec2(0.0);${panes === undefined ? '' : `
  vec3 ${panes.glow} = vec3(1.0);`}
  {
    vec3 surfDx = dFdx(${pos});
    vec3 surfDy = dFdy(${pos});
    float surfPx = max(length(surfDx), length(surfDy));${glass}
    if (${code} > 0.5 && atlasQuality > 0.0) {
      vec3 surfN = normalize(${normal});
      vec2 surfHere = surfPattern(${code}, ${pos}, surfN, diffuseColor.rgb, surfPx);
      // The height a pixel over and a pixel up, for the slope the normal is bent by; only where it can show.
      if (surfPx < ${BUMP_REACH.toFixed(2)}) {
        float surfRight = surfPattern(${code}, ${pos} + surfDx, surfN, diffuseColor.rgb, surfPx).y;
        float surfUp = surfPattern(${code}, ${pos} + surfDy, surfN, diffuseColor.rgb, surfPx).y;
        ${bump} = vec2(surfRight - surfHere.y, surfUp - surfHere.y) / max(surfPx, 1e-4) * ${BUMP_GAIN.toFixed(2)};
        float surfSteep = length(${bump});
        if (surfSteep > ${BUMP_MOST.toFixed(2)}) ${bump} *= ${BUMP_MOST.toFixed(2)} / surfSteep;
      }
      diffuseColor.rgb *= mix(1.0, surfHere.x, atlasQuality);
      ${bump} *= atlasQuality;
    }
  }`;
}

/**
 * Draws a merged buffer's `atlasSurface` bytes on `material`, in the mesh's
 * own frame: chained after whatever hook it already has, before the lights'
 * chunks read the colour. With `panes`, its `atlasPane` corners and the
 * rooms behind its glass. The caller keys the program
 * (`customProgramCacheKey`), since three keys it on the hook's source.
 */
export function drawSurfaces(material: THREE.Material, options: { panes?: boolean } = {}): void {
  const before = material.onBeforeCompile.bind(material);
  const panes = options.panes === true;
  const paneNames: PaneNames = { pane: 'vSurfPane', eye: 'vSurfEye', glow: 'surfRoomGlow' };
  material.onBeforeCompile = (shader, renderer) => {
    before(shader, renderer);
    bindSurfaceQuality(shader.uniforms);
    const vertexPanes = panes ? '\nattribute vec2 atlasPane;\nvarying vec2 vSurfPane;\nvarying vec3 vSurfEye;' : '';
    const fragmentPanes = panes ? `\nvarying vec2 vSurfPane;\nvarying vec3 vSurfEye;\n${ROOM_GLSL}` : '';
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\nattribute float atlasSurface;\nvarying float vSurfCode;\nvarying vec3 vSurfPos;\nvarying vec3 vSurfNormal;${vertexPanes}`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\n  vSurfCode = atlasSurface;\n  vSurfPos = transformed;\n  vSurfNormal = objectNormal;${
          // The eye in the mesh's frame, the mesh scaled uniformly: a transpose, not an inverse, on every vertex of a wood.
          panes ? '\n  vSurfPane = atlasPane;\n  mat3 surfTurn = mat3(modelMatrix);\n  vSurfEye = transpose(surfTurn) * (cameraPosition - modelMatrix[3].xyz) / dot(surfTurn[0], surfTurn[0]);' : ''
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nvarying float vSurfCode;\nvarying vec3 vSurfPos;\nvarying vec3 vSurfNormal;\n${SURFACE_QUALITY_GLSL}\n${GROUND_MARKS_GLSL}\n${SURFACE_GLSL}${fragmentPanes}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>\n${surfaceDetailChunk('vSurfCode', 'vSurfPos', 'vSurfNormal', 'surfBump', panes ? paneNames : undefined)}`,
      )
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n  normal = surfBend(-vViewPosition, normal, surfBump, faceDirection);');
  };
}
