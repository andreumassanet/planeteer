/** Street lamps, headlights and campfires lit per pixel round the camera. */
import * as THREE from 'three';
import { PALETTE } from '../theme.ts';
import { AVATAR_HEIGHT } from '../stature.ts';
import { DEG, NIGHT_CHUNK, atlasGain, atlasSun } from './night.ts';

/** The farthest reach of the nearest headlights and fires; `setNearLamps` sizes its light field from it. */
export const reaches = { head: 0, fire: 0 };

/**
 * How many street lamps are lit per pixel at once: the nearest this many to the
 * camera, out of every standing town's (`settlements.lampsNear`).
 *
 * A pool written on a vertex is as fine as the floor under it, and the floor is
 * coarse (vertices 4 to 15 units apart against a 14-unit pool), so up close a
 * lamp's pool is a lifted polygon with the floor's own triangles in it. Up
 * close the pixel is asked instead: a disc under every lamp, stepped in two
 * bands the way the sun steps across the ramp, landing on walls as well as on
 * the ground and tinted by the surface it lands on. Past `LAMP_FIELD` the vertex
 * pools take over, where they are a few pixels and read as what they are.
 */
export const NEAR_LAMPS = 24;

/** Where the per-pixel lamps hand back to the vertex pools, in units from the camera. */
export const LAMP_FIELD = 170;

/**
 * The sun's elevation where the player stands, in degrees, above which no near
 * lamp can be lit and none is looked for. `atlasNight` is nothing from
 * `NIGHT_NONE`'s 2 degrees up and every lamp handed over stands well under a
 * degree of arc from the player, so 5 leaves margin, and a frame by day skips
 * both searches.
 */
export const LAMPS_OFF_ABOVE = 5;

/**
 * How far a lamp's light reaches along the ground, in world units, as a pool
 * written on the vertices of the ground it falls on. The reach follows the
 * lamp's own height: `street-lamp.ts` builds a column 4.8 to 5.8 units tall and
 * a road's approach lamp (`roadside.ts`) is 5.4, and light from that height
 * grazing the ground at about 20 degrees stops at roughly two and a half times
 * it. 14 is bounded by the floor it falls on: a town's cell is 8 to 18 units
 * across (`TOWN_PITCH` in `scenery/grid.ts`) and the carriageway 6.0 to 15.0. A
 * pool wider than its own cell has no ground left to be dark, and with only four
 * to nine vertices a cell no reach lights a street and leaves the rest mostly
 * dark.
 *
 * `LAMP_STRENGTH` in `settlements.ts` is 1 rather than the lamp's own instance
 * draw: the head is dimmed by its `raise`, and carrying that into the pool
 * would be the same lottery twice on two surfaces a metre apart.
 */
export const LAMP_POOL = 14;

/** How far one lamp reaches, in world units, per pixel; `LAMP_POOL` is the vertex pools' 14. */
const LAMP_REACH = 17;

/**
 * The colour a lamp lights with: a sodium amber, warmer than a window and
 * further from white, because what it lands on is the surface's colour and the
 * light only tints it (`diffuseColor * LAMP_LIGHT`), where a window is itself
 * the thing shining.
 */
const LAMP_LIGHT = new THREE.Color(PALETTE.gold).lerp(new THREE.Color(PALETTE.white), 0.45);

/** Lamp heads in view space (xyz) and how lit each one is (w), refreshed each frame. */
export const atlasLamps = { value: Array.from({ length: NEAR_LAMPS }, () => new THREE.Vector4()) };
export const atlasLampCount = { value: 0 };

/**
 * Headlights: the vehicle you drive and the nearest few of the traffic's and of
 * other players', each lamp where its model has it, lit through the same
 * per-pixel pools as the street lamps but as cones. `setHeadlights` hands them
 * over each frame, before `setNearLamps`.
 */
export const NEAR_HEADLIGHTS = 8;
/** How far a headlight reaches, in world units, and how wide its cone is. A beam stopped by a wall reaches less (`setHeadlights`). */
export const HEAD_REACH = 48;
const HEAD_INNER = Math.cos(14 * DEG);
const HEAD_OUTER = Math.cos(30 * DEG);
export const atlasHeads = { value: Array.from({ length: NEAR_HEADLIGHTS }, () => new THREE.Vector4()) };
export const atlasHeadDirs = { value: Array.from({ length: NEAR_HEADLIGHTS }, () => new THREE.Vector3()) };
export const atlasHeadCount = { value: 0 };
/**
 * How far from the camera any near lamp or headlight can light a surface: the
 * farthest of them plus its reach, in view units, refreshed with them. A
 * fragment further out is further than a reach from every one of them, so the
 * loops skip it.
 */
export const atlasLightReach = { value: 0 };
export const atlasLampTint = { value: LAMP_LIGHT.clone() };

/**
 * Campfires: the nearest few of the countryside's (`countryside-motion.ts`), lit
 * per pixel beside the lamps as a warm orange pool that breathes with the flame.
 * `setFires` hands them over each frame, before `setNearLamps`.
 */
export const NEAR_FIRES = 4;
/**
 * How far a campfire lights the ground round it: a little over three bodies, the
 * ring of faces round a fire and not the field behind them.
 */
export const FIRE_REACH = AVATAR_HEIGHT * 3.2;
/** The fire's light, an orange warmed towards gold: redder than a sodium lamp. */
const FIRE_LIGHT = new THREE.Color(PALETTE.orange).lerp(new THREE.Color(PALETTE.gold), 0.4);
/** The heart of a flame, gold towards white, drawn brighter than white so it blooms. */
export const FIRE_CORE = new THREE.Color(PALETTE.gold).lerp(new THREE.Color(PALETTE.white), 0.3);
export const atlasFires = { value: Array.from({ length: NEAR_FIRES }, () => new THREE.Vector4()) };
export const atlasFireCount = { value: 0 };
export const atlasFireTint = { value: FIRE_LIGHT.clone() };

/**
 * How bright a fire burns at `time` seconds, 0.7 to 1: two sines out of step and
 * a third, faster and smaller, so no two fires and no two seconds agree. The
 * same sum is written in the glow's shader (`FLICKER_GLSL`).
 */
export function fireFlicker(time: number, phase: number): number {
  return 0.85 + 0.08 * Math.sin(time * 7.3 + phase) + 0.05 * Math.sin(time * 11.9 + phase * 2.3) + 0.02 * Math.sin(time * 23.7 + phase * 4.1);
}
export const FLICKER_GLSL = /* glsl */ `
  float atlasFlicker(float t, float p) {
    return 0.85 + 0.08 * sin(t * 7.3 + p) + 0.05 * sin(t * 11.9 + p * 2.3) + 0.02 * sin(t * 23.7 + p * 4.1);
  }`;
/** How much a lamp lifts the surface it lands on, over its own colour. */
export const LAMP_LIGHT_GAIN = 1.15;

/**
 * The GLSL for the near lamps' light on one fragment, as a banded amount 0..1.
 * `pos` and `n` are the fragment's view-space position and normal. A lamp lights
 * a face by how near it is (squared, so most of the drop is in the first half of
 * the reach) and by how squarely the face looks at it, with a floor of a third
 * so the ground under a lamp's own arm is still lit. The sum is stepped in two
 * bands with a narrow edge each, and a wall takes a little over half what the
 * ground under the same lamp does: a comic's pool of light.
 */
export const LAMP_CHUNK = /* glsl */ `
  uniform vec4 atlasLamps[${NEAR_LAMPS}];
  uniform int atlasLampCount;
  uniform vec4 atlasHeads[${NEAR_HEADLIGHTS}];
  uniform vec3 atlasHeadDirs[${NEAR_HEADLIGHTS}];
  uniform int atlasHeadCount;
  uniform float atlasLightReach;
  uniform vec4 atlasFires[${NEAR_FIRES}];
  uniform int atlasFireCount;
  uniform vec3 atlasFireTint;

  // A campfire's pool on one fragment, banded as the lamps' is: its w is how
  // bright the flame is this frame, so the edge of the pool breathes.
  float atlasFireLight(vec3 pos, vec3 n) {
    float sum = 0.0;
    for (int i = 0; i < ${NEAR_FIRES}; i++) {
      if (i >= atlasFireCount) break;
      vec3 d = atlasFires[i].xyz - pos;
      float dist = length(d);
      if (dist >= ${FIRE_REACH.toFixed(1)}) continue;
      float fall = 1.0 - dist / ${FIRE_REACH.toFixed(1)};
      float facing = max(dot(n, d / max(dist, 1e-3)), 0.0);
      sum += fall * fall * (0.4 + 0.6 * facing) * atlasFires[i].w;
    }
    return 0.5 * smoothstep(0.06, 0.1, sum) + 0.5 * smoothstep(0.3, 0.36, sum);
  }

  float atlasLampLight(vec3 pos, vec3 n, float flatness) {
    float sum = 0.0;
    for (int i = 0; i < ${NEAR_LAMPS}; i++) {
      if (i >= atlasLampCount) break;
      vec3 d = atlasLamps[i].xyz - pos;
      float dist = length(d);
      if (dist >= ${LAMP_REACH.toFixed(1)}) continue;
      float fall = 1.0 - dist / ${LAMP_REACH.toFixed(1)};
      float facing = max(dot(n, d / max(dist, 1e-3)), 0.0);
      sum += fall * fall * (0.34 + 0.66 * facing) * atlasLamps[i].w * mix(0.55, 1.0, flatness);
    }
    for (int i = 0; i < ${NEAR_HEADLIGHTS}; i++) {
      if (i >= atlasHeadCount) break;
      vec3 d = pos - atlasHeads[i].xyz;
      float dist = length(d);
      // The beam's reach rides as the length of its direction: short where a wall stops it.
      float reach = length(atlasHeadDirs[i]);
      if (dist >= reach || dist < 1e-3) continue;
      vec3 ray = d / dist;
      float cone = smoothstep(${HEAD_OUTER.toFixed(4)}, ${HEAD_INNER.toFixed(4)}, dot(ray, atlasHeadDirs[i] / reach));
      float fall = 1.0 - dist / ${HEAD_REACH.toFixed(1)};
      float facing = max(dot(n, -ray), 0.0);
      sum += cone * fall * (0.3 + 0.7 * facing) * atlasHeads[i].w * 0.9;
    }
    return 0.55 * smoothstep(0.07, 0.1, sum) + 0.45 * smoothstep(0.26, 0.31, sum);
  }
`;

/**
 * The near lamps and the headlights for a surface that carries no `atlasLit`
 * bytes of its own (the land, round a town's edge and along every road), so a
 * pool that spills off the paving and a headlight that leaves the carriageway
 * keep lighting what they land on. Three pieces for the material's own
 * `onBeforeCompile`: the uniforms, the declarations, and the statement that adds
 * the light, which wants `normal`, `vViewPosition` and `diffuseColor` in scope
 * (after `<emissivemap_fragment>` in a `MeshToonMaterial`) and a world position
 * whose direction is the local up.
 */
export function bindNearLights(uniforms: Record<string, THREE.IUniform>): void {
  uniforms.atlasSun = atlasSun;
  uniforms.atlasGain = atlasGain;
  uniforms.atlasLamps = atlasLamps;
  uniforms.atlasLampCount = atlasLampCount;
  uniforms.atlasHeads = atlasHeads;
  uniforms.atlasHeadDirs = atlasHeadDirs;
  uniforms.atlasHeadCount = atlasHeadCount;
  uniforms.atlasLightReach = atlasLightReach;
  uniforms.atlasLampTint = atlasLampTint;
  uniforms.atlasFires = atlasFires;
  uniforms.atlasFireCount = atlasFireCount;
  uniforms.atlasFireTint = atlasFireTint;
}

export function nearLightsGLSL(): string {
  return /* glsl */ `
  uniform vec3 atlasSun;
  uniform float atlasGain;
  uniform vec3 atlasLampTint;
  ${NIGHT_CHUNK}
  ${LAMP_CHUNK}`;
}

export function nearLightsChunk(worldPosition: string): string {
  return /* glsl */ `
  if ((atlasLampCount > 0 || atlasHeadCount > 0 || atlasFireCount > 0) && length(vViewPosition) < atlasLightReach) {
    float atlasNearDark = atlasGain * atlasNight(normalize(${worldPosition}), atlasSun);
    if (atlasNearDark > 0.0) {
      totalEmissiveRadiance += (diffuseColor.rgb * ${LAMP_LIGHT_GAIN.toFixed(2)} + 0.06) * atlasLampTint
        * atlasLampLight(-vViewPosition, normal, 1.0) * atlasNearDark * 0.75;
      if (atlasFireCount > 0) {
        totalEmissiveRadiance += (diffuseColor.rgb * ${LAMP_LIGHT_GAIN.toFixed(2)} + 0.05) * atlasFireTint
          * atlasFireLight(-vViewPosition, normal) * atlasNearDark * 0.8;
      }
    }
  }`;
}

export const lampView = new THREE.Vector3();

/**
 * Hands the shaders this frame's near lamps: `heads` is `settlements.lampsNear`'s
 * output (`x, y, z, distance` in world space, nearest first) and `count` how
 * many there are. Each is moved into the camera's view space so the fragment
 * works on small numbers, and fades out over the last fifth of `LAMP_FIELD` so a
 * lamp leaving the list goes out by degrees.
 */
export function setNearLamps(camera: THREE.Camera, heads: Float32Array, count: number): void {
  const n = Math.min(count, NEAR_LAMPS);
  const view = camera.matrixWorldInverse;
  let reach = Math.max(reaches.head, reaches.fire);
  for (let i = 0; i < n; i++) {
    lampView.set(heads[i * 4]!, heads[i * 4 + 1]!, heads[i * 4 + 2]!).applyMatrix4(view);
    const distance = heads[i * 4 + 3]!;
    const fade = 1 - Math.min(1, Math.max(0, (distance - LAMP_FIELD * 0.8) / (LAMP_FIELD * 0.2)));
    atlasLamps.value[i]!.set(lampView.x, lampView.y, lampView.z, fade);
    reach = Math.max(reach, lampView.length() + LAMP_REACH);
  }
  atlasLampCount.value = n;
  // A unit of slack over the exact bound, for the view transform's rounding.
  atlasLightReach.value = reach > 0 ? reach + 1 : 0;
}

const headDir = new THREE.Vector3();

/**
 * Hands the shaders this frame's headlights: `lights` is `x, y, z, dx, dy,
 * dz, strength` in world space, seven floats each, `count` of them; `stops`,
 * when given, how far each beam gets before a wall stops it (`HEAD_REACH` at
 * most). Call before `setNearLamps`, which folds their reach into the lamps'.
 */
export function setHeadlights(camera: THREE.Camera, lights: Float32Array, count: number, stops?: Float32Array): void {
  const n = Math.min(count, NEAR_HEADLIGHTS);
  const view = camera.matrixWorldInverse;
  reaches.head = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 7;
    lampView.set(lights[o]!, lights[o + 1]!, lights[o + 2]!).applyMatrix4(view);
    reaches.head = Math.max(reaches.head, lampView.length() + HEAD_REACH);
    atlasHeads.value[i]!.set(lampView.x, lampView.y, lampView.z, lights[o + 6]!);
    const reach = Math.min(HEAD_REACH, Math.max(1, stops?.[i] ?? HEAD_REACH));
    headDir.set(lights[o + 3]!, lights[o + 4]!, lights[o + 5]!).transformDirection(view);
    atlasHeadDirs.value[i]!.copy(headDir).multiplyScalar(reach);
  }
  atlasHeadCount.value = n;
}
