import * as THREE from 'three';
import { DITHER_GLSL } from './fade.ts';
import type { OutlineCut } from './outline.ts';

/**
 * What stands between the third-person lens and the body is seen through.
 *
 * A tapered capsule runs from the eye to the middle of the body, `SIGHT_EYE`
 * wide at the lens and `SIGHT_BODY` at the body. A fragment of an opted-in
 * material inside it, nearer than the body and above the knees, is dropped by
 * the same screen door as a fade (`fade.ts`'s dither), its share easing to
 * nothing over a soft rim, so a wall in the way opens a dithered window onto
 * the player instead of the lens jumping in front of it. Nothing behind the
 * body is touched, nor the ground at its feet (the town's paving is in the
 * town's mesh), nor anything without `seeThrough`: the land, the sea, the
 * grass and the people.
 *
 * The test is in view space: a fill reads `vViewPosition` (every toon
 * material has it), the ink's hull its own copy (`OutlineCut`), so the hull
 * drops the pixels its fill drops. The hull's cut reaches `SIGHT_HULL_BEHIND`
 * past the body, because a mesh that straddles it would otherwise show its far
 * side's ink through the hole in its near side.
 *
 * The uniforms are shared by reference, as the cloud shade's are, and written
 * once a frame by the camera rig (`setSight`).
 */

/** The capsule's radius at the body, units, before the wheel's zoom widens it. */
export const SIGHT_BODY = 2.6;
/** Its radius at the lens: whatever grazes the lens goes too. */
export const SIGHT_EYE = 0.9;
/** How far in front of the body's middle the cut stops, units: the body's own depth. */
export const SIGHT_MARGIN = 0.45;
/** How far behind the body the ink's cut reaches; see the head of the file. */
export const SIGHT_HULL_BEHIND = 1.5;
/** Nothing under this height over the feet is dissolved, units: the paving, a kerb, the steps. */
export const SIGHT_FLOOR = 0.85;
/** Where the soft rim starts, as a share of the radius. */
const SIGHT_RIM = 0.55;
/** The soft bands, units: towards the body, and over the floor cut. */
const SIGHT_DEPTH_SOFT = 1.1;
const SIGHT_FLOOR_SOFT = 0.5;

/** x: strength 0..1, y: radius at the body, z: radius at the eye, w: the margin in front of the body. */
const sight = { value: new THREE.Vector4(0, SIGHT_BODY, SIGHT_EYE, SIGHT_MARGIN) };
/** The body's middle, in view space. */
const sightBody = { value: new THREE.Vector3(0, 0, -10) };
/** xyz: the body's up in view space; w: how far under the body's middle the floor cut is. */
const sightUp = { value: new THREE.Vector4(0, 1, 0, 1) };

const SIGHT_UNIFORMS: Record<string, THREE.IUniform> = {
  atlasSight: sight,
  atlasSightBody: sightBody,
  atlasSightUp: sightUp,
};

const f = (n: number): string => n.toFixed(4);

/** The declarations and the share, for any fragment shader. ASCII only. */
const SIGHT_GLSL = /* glsl */ `
uniform vec4 atlasSight;
uniform vec3 atlasSightBody;
uniform vec4 atlasSightUp;
float atlasSightShare(vec3 sightP, float sightBehind) {
  float sightReach = length(atlasSightBody);
  if (atlasSight.x <= 0.0 || sightReach < 1e-3) return 0.0;
  vec3 sightAxis = atlasSightBody / sightReach;
  float sightAlong = dot(sightP, sightAxis);
  float sightBefore = sightReach - sightBehind - sightAlong;
  if (sightAlong <= 0.0 || sightBefore <= 0.0) return 0.0;
  float sightRadius = mix(atlasSight.z, atlasSight.y, clamp(sightAlong / sightReach, 0.0, 1.0));
  float sightAcross = length(sightP - sightAxis * sightAlong);
  float sightRim = 1.0 - smoothstep(${f(SIGHT_RIM)}, 1.0, sightAcross / sightRadius);
  float sightLift = dot(sightP - atlasSightBody, atlasSightUp.xyz) + atlasSightUp.w;
  return atlasSight.x * sightRim
    * smoothstep(0.0, ${f(SIGHT_FLOOR_SOFT)}, sightLift)
    * smoothstep(0.0, ${f(SIGHT_DEPTH_SOFT)}, sightBefore);
}
`;

/** The discard for a fragment at view-space `position`, `behind` units short of the body's middle. */
function sightDiscard(position: string, behind: string): string {
  return `if (atlasSightShare(${position}, ${behind}) > ${DITHER_GLSL}) discard;`;
}

/** The ink's half: the hull drops what its fill drops, and a little past the body. */
const HULL_CUT: OutlineCut = {
  declaration: SIGHT_GLSL,
  discard: sightDiscard('vOutlineView', `atlasSight.w - ${f(SIGHT_HULL_BEHIND)}`),
  uniforms: SIGHT_UNIFORMS,
};

const opted = new WeakSet<THREE.Material>();

/**
 * Teaches a toon material to be seen through. Call it on what a factory makes,
 * before anything clones it: `fade.ts`'s twins chain the hook and copy the
 * ink's parameters, cut and all.
 */
export function seeThrough<T extends THREE.MeshToonMaterial>(material: T): T {
  if (opted.has(material)) return material;
  opted.add(material);
  const base = material.onBeforeCompile;
  const baseKey =
    material.customProgramCacheKey === THREE.Material.prototype.customProgramCacheKey
      ? ((text: string) => () => text)(base.toString())
      : material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    base.call(material, shader, renderer);
    Object.assign(shader.uniforms, SIGHT_UNIFORMS);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', () => `#include <common>\n${SIGHT_GLSL}`)
      .replace(
        '#include <clipping_planes_fragment>',
        () => `#include <clipping_planes_fragment>\n  ${sightDiscard('-vViewPosition', 'atlasSight.w')}`,
      );
  };
  material.customProgramCacheKey = () => `${baseKey()}|sight`;
  const ink = material.userData.outlineParameters as Record<string, unknown> | undefined;
  if (ink !== undefined && ink.visible !== false) material.userData.outlineParameters = { ...ink, cut: HULL_CUT };
  return material;
}

const viewBody = new THREE.Vector3();
const viewUp = new THREE.Vector3();

/**
 * Once a frame, after the lens is placed: the body's middle and its up in
 * world space, the strength (0 turns it off) and the radius at the body.
 */
export function setSight(
  camera: THREE.Camera,
  body: THREE.Vector3,
  up: THREE.Vector3,
  halfHeight: number,
  strength: number,
  radius = SIGHT_BODY,
): void {
  sight.value.x = strength;
  if (strength <= 0) return;
  camera.updateMatrixWorld();
  viewBody.copy(body).applyMatrix4(camera.matrixWorldInverse);
  viewUp.copy(up).transformDirection(camera.matrixWorldInverse);
  sightBody.value.copy(viewBody);
  sightUp.value.set(viewUp.x, viewUp.y, viewUp.z, halfHeight - SIGHT_FLOOR);
  sight.value.y = radius;
}

/** Nothing is seen through until the rig next says so: while something else drives the camera. */
export function clearSight(): void {
  sight.value.x = 0;
}

/** The console's view of it. */
export const sightState = {
  get strength(): number {
    return sight.value.x;
  },
  get radius(): number {
    return sight.value.y;
  },
};
