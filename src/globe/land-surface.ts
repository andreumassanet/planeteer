// What the land is made of under the biome's colour: rock on steep faces with
// its strata and cracks, earth and scree on the slopes below them, a wet band
// and shingle or rippled sand at the shore, and the grain that a near ground
// has. All of it is the land's own fragment stage, and none of it is in
// `groundColorAt`: the biome stays the colour of the ground, and this is what
// the ground's shape and the camera's nearness do to it.
//
// The near grain is noise on a lattice fixed to the world, evaluated from a
// camera-relative point (`vAtlasLocal`, the world position less
// `atlasDetailOrigin`), because a world position on this planet is sixteen
// thousand units long and a float's fraction of it is a few hundredths of a
// unit. The origin snaps to `DETAIL_SNAP`, so every frequency with a whole
// number of cycles in it puts its lattice where the world's is.

import * as THREE from 'three';
import { LAND_HEIGHT } from '../geo.ts';
import { SHORE_LIP } from '../terrain.ts';
import { PALETTE } from '../theme.ts';
import { PLANET_RADIUS } from './planet.ts';
import { BRUSH_BROAD, BRUSH_FINE, BRUSH_LIGHT, MACRO_BROAD, PATCH_FINE, noise3 } from './ground-marks.ts';
import { SEASON_GLSL } from '../foliage-season.ts';

const DEG = Math.PI / 180;

/** The snap of the detail's origin, units. Every `atlasNoiseNear` frequency times this must be whole. */
export const DETAIL_SNAP = 256;

/** Rock starts on faces this steep, degrees, and covers them from `ROCK_FULL`. `MAX_SLOPE` (30) is where the wood gives up. */
const ROCK_FROM = 33;
const ROCK_FULL = 45;
/** Earth and scree: the slopes under the rock, from `EARTH_FROM` to the rock. */
const EARTH_FROM = 17;
const EARTH_FULL = 27;
/** High ground bares at gentler slopes: the thresholds fall by `ALPINE_DROP` degrees between these heights over the shelf. */
const ALPINE_FROM = 260;
const ALPINE_TO = 600;
const ALPINE_DROP = 11;

/** One rock bed, units of height; beds run in groups of three for a coarser rhythm. */
const STRATA = 2.6;
/** How far the beds wander up and down across a face, units. */
const STRATA_WARP = 14;

/** The shore: the ramp from the shelf down to the lip, and the wet band over the water. */
const SHORE_TOP = LAND_HEIGHT;
const WET_BAND = 2.2;
const WET_DARK = 0.3;
/** How far a shore that is not sand goes to grey shingle. */
const SHINGLE = 0.35;

/** The bump's depth, units: the rock's beds and grain, the scree's pebbles, the soil's grain, the sand's ripples. */
const BUMP_ROCK = 0.32;
const BUMP_PEBBLE = 0.06;
const BUMP_SOIL = 0.02;
const BUMP_RIPPLE = 0.03;
/** Sand ripples: crest to crest, units, and the world direction they run across. */
const RIPPLE = 0.9;
const RIPPLE_DIR = new THREE.Vector3(0.62, 0.31, -0.72).normalize();

const linear = (hex: number): THREE.Color => new THREE.Color(hex);
const rockLight = linear(PALETTE.bone).lerp(linear(PALETTE.tan), 0.45);
const rockDark = linear(PALETTE.brown).lerp(linear(PALETTE.slate), 0.4).multiplyScalar(0.8);
const earth = linear(PALETTE.brown).lerp(linear(PALETTE.clay), 0.35);
const shingle = linear(PALETTE.steel).lerp(linear(PALETTE.bone), 0.55);
const vec = (c: THREE.Color): string => `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`;
const oneMinusCos = (degrees: number): number => 1 - Math.cos(degrees * DEG);
/** The bands as leans, one minus the cosine to the up. */
const ROCK_LEAN = [oneMinusCos(ROCK_FROM), oneMinusCos(ROCK_FULL)] as const;
const EARTH_LEAN = [oneMinusCos(EARTH_FROM), oneMinusCos(EARTH_FULL)] as const;
const ALPINE_LEAN = oneMinusCos(ROCK_FROM) - oneMinusCos(ROCK_FROM - ALPINE_DROP);
/** How far the ragged edge moves a lean, either way, at its noise's extremes (times one half). */
const RAGGED = 0.09;
/** The ragged edge's noise, per unit. */
const RAGGED_FREQUENCY = 0.03;

const smooth = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** `atlasLean`'s twin, with the ragged edge at its nearest, as the ground under a walker has it. */
export function leanOf(normal: THREE.Vector3, point: THREE.Vector3): number {
  const length = point.length();
  const slope = 1 - normal.dot(point) / length;
  const ragged = noise3(point.x * RAGGED_FREQUENCY, point.y * RAGGED_FREQUENCY, point.z * RAGGED_FREQUENCY) - 0.5;
  const alpine = smooth(LAND_HEIGHT + ALPINE_FROM, LAND_HEIGHT + ALPINE_TO, length - PLANET_RADIUS);
  return slope + ragged * RAGGED + alpine * ALPINE_LEAN;
}

/**
 * How much of the land at `point` (world units) is drawn as rock, 0 to 1, for
 * a face of world normal `normal` (unit): `atlasRockOf(atlasLean(...))`. The
 * grass thins by it, so no blade stands on a cliff the land draws.
 */
export function rockAt(normal: THREE.Vector3, point: THREE.Vector3): number {
  return smooth(ROCK_LEAN[0], ROCK_LEAN[1], leanOf(normal, point));
}

/**
 * The detail's uniforms, one set for every material that draws the land's
 * ground (the land, a town's edge slopes), moved by the land's `followCamera`.
 * Any snapped origin puts the lattice where the world's is, so a material
 * drawn before the land in a frame is exact with the last frame's.
 */
const shared: Record<string, THREE.IUniform> = { atlasDetailOrigin: { value: new THREE.Vector3() }, atlasRipplePhase: { value: 0 } };
export function landSurfaceUniforms(): Record<string, THREE.IUniform> {
  return shared;
}

/**
 * Snaps the detail's origin under the camera before each draw of the land. The
 * ripples' phase at the origin is taken here in doubles, since the shader's
 * floats cannot hold it.
 */
export function followCamera(material: THREE.Material, uniforms: Record<string, THREE.IUniform>): void {
  const origin = uniforms['atlasDetailOrigin']!.value as THREE.Vector3;
  const phase = uniforms['atlasRipplePhase']!;
  material.onBeforeRender = (_renderer, _scene, camera) => {
    const e = camera.matrixWorld.elements;
    const x = Math.round(e[12]! / DETAIL_SNAP) * DETAIL_SNAP;
    const y = Math.round(e[13]! / DETAIL_SNAP) * DETAIL_SNAP;
    const z = Math.round(e[14]! / DETAIL_SNAP) * DETAIL_SNAP;
    if (x === origin.x && y === origin.y && z === origin.z) return;
    origin.set(x, y, z);
    const cycles = origin.dot(RIPPLE_DIR) / RIPPLE;
    phase.value = (cycles - Math.floor(cycles)) * Math.PI * 2;
  };
}

/** The vertex stage's declarations. */
export const LAND_SURFACE_VERTEX_PARS = /* glsl */ `
uniform vec3 atlasDetailOrigin;
varying vec3 vAtlasLocal;`;

/** The vertex stage's statement, after the world position `world` (a GLSL expression) is known. */
export function landSurfaceVertex(world: string): string {
  return `vAtlasLocal = ${world} - atlasDetailOrigin;`;
}

/** The fragment stage's declarations; needs `GROUND_MARKS_GLSL` before it. */
export const LAND_SURFACE_GLSL = /* glsl */ `
uniform vec3 atlasDetailOrigin;
uniform float atlasRipplePhase;
varying vec3 vAtlasLocal;
// Value noise on the world's lattice at frequency s, from the camera-relative
// point: the cell is split off the small number and the origin's whole cells
// added after, so the fraction keeps its precision.
float atlasNoiseNear(vec3 local, float s, float seed) {
  vec3 p = local * s;
  vec3 c = floor(p);
  vec3 f = p - c;
  vec3 i = c + atlasDetailOrigin * s + seed;
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(atlasHash13(i), atlasHash13(i + vec3(1, 0, 0)), f.x),
        mix(atlasHash13(i + vec3(0, 1, 0)), atlasHash13(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(atlasHash13(i + vec3(0, 0, 1)), atlasHash13(i + vec3(1, 0, 1)), f.x),
        mix(atlasHash13(i + vec3(0, 1, 1)), atlasHash13(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
// How far a face leans, as one minus the cosine to the up, with the ragged
// edge and the high ground's softening added; \`leanOf\` is its twin.
float atlasLean(float slope, float height, float ragged) {
  float alpine = smoothstep(${(LAND_HEIGHT + ALPINE_FROM).toFixed(1)}, ${(LAND_HEIGHT + ALPINE_TO).toFixed(1)}, height);
  return slope + ragged * ${RAGGED.toFixed(3)} + alpine * ${ALPINE_LEAN.toFixed(4)};
}
// The share of rock on a face of that lean; \`rockAt\` is its twin.
float atlasRockOf(float lean) {
  return smoothstep(${ROCK_LEAN[0].toFixed(4)}, ${ROCK_LEAN[1].toFixed(4)}, lean);
}
// The layers over the biome's colour at world position pos, with the face's
// world normal and the pixel's footprint in units. Writes the bump's height,
// units, which the normal stage turns into a tilt.
vec3 atlasLandSurface(vec3 colour, vec3 pos, vec3 local, vec3 worldNormal, float foot, out float bump) {
  bump = 0.0;
  vec3 up = normalize(pos);
  float height = length(pos) - ${PLANET_RADIUS.toFixed(1)};
  float slope = 1.0 - dot(worldNormal, up);
  float green = clamp((colour.g - max(colour.r, colour.b)) / max(colour.g, 1e-3) * 4.0, 0.0, 1.0);
  // A ragged edge between the layers, gone before a pixel covers it.
  float ragged = foot < 16.0 ? (atlasNoise(pos * ${RAGGED_FREQUENCY.toFixed(3)}) - 0.5) * (1.0 - smoothstep(4.0, 16.0, foot)) : 0.0;
  float lean = atlasLean(slope, height, ragged);
  float rock = atlasRockOf(lean);
  float soil = smoothstep(${EARTH_LEAN[0].toFixed(4)}, ${EARTH_LEAN[1].toFixed(4)}, lean) * (1.0 - rock);

  // Near: what a pixel can still resolve, by scale.
  float fine = 1.0 - smoothstep(0.04, 0.16, foot);
  float mid = 1.0 - smoothstep(0.25, 1.0, foot);

  // The shore: a wet band over the water, and shingle where it is not sand.
  float shore = 1.0 - smoothstep(${(SHORE_TOP - 6).toFixed(1)}, ${SHORE_TOP.toFixed(1)}, height);
  if (shore > 0.0) {
    // Sand is warm and light; a green, grey or dark shore is shingle.
    float sandy = smoothstep(0.12, 0.3, colour.r - colour.b) * smoothstep(0.3, 0.5, dot(colour, vec3(0.2126, 0.7152, 0.0722))) * (1.0 - green);
    colour = mix(colour, ${vec(shingle)}, ${SHINGLE.toFixed(2)} * shore * (1.0 - sandy) * (1.0 - rock));
    if (mid > 0.0) {
      float pebble = smoothstep(0.6, 0.72, atlasNoiseNear(local, 3.0, 11.0));
      colour *= 1.0 + pebble * 0.18 * mid * shore * (1.0 - sandy);
      bump += pebble * ${BUMP_PEBBLE.toFixed(3)} * shore * (1.0 - sandy);
      float wave = atlasNoiseNear(local, 0.5, 3.0) * 3.0;
      float ripple = sin(dot(local, vec3(${RIPPLE_DIR.x.toFixed(4)}, ${RIPPLE_DIR.y.toFixed(4)}, ${RIPPLE_DIR.z.toFixed(4)})) * ${((2 * Math.PI) / RIPPLE).toFixed(5)} + atlasRipplePhase + wave);
      bump += ripple * ${BUMP_RIPPLE.toFixed(3)} * sandy * shore * fine;
      colour *= 1.0 + ripple * 0.04 * sandy * shore * fine;
    }
    float wet = 1.0 - smoothstep(${(SHORE_LIP + 0.3).toFixed(2)}, ${(SHORE_LIP + WET_BAND).toFixed(2)}, height);
    colour *= 1.0 - ${WET_DARK.toFixed(2)} * wet;
  }

  // Earth and scree on the slopes, a share of the biome kept so a red land's earth is red.
  if (soil > 0.0) {
    vec3 dirt = mix(${vec(earth)}, colour, 0.35);
    if (foot < 6.0) dirt *= 1.0 + (atlasNoise(pos * 0.11 + 4.0) - 0.5) * 0.2 * (1.0 - smoothstep(1.5, 6.0, foot));
    colour = mix(colour, dirt, soil * mix(0.75, 1.0, green));
  }

  // Rock: beds of height, warped across the face, each its own shade, a darker
  // line under each ledge and cracks across them near.
  if (rock > 0.0) {
    float bedShare = 1.0 - smoothstep(${(STRATA * 0.25).toFixed(2)}, ${(STRATA * 0.8).toFixed(2)}, foot);
    // The beds' warp only where a bed can be told from the next.
    float warp = bedShare > 0.0
      ? (atlasNoise(pos * 0.011) - 0.5) * ${STRATA_WARP.toFixed(1)} + (atlasNoise(pos * 0.047 + 9.0) - 0.5) * 3.0
      : 0.0;
    float s = (height + warp) / ${STRATA.toFixed(2)};
    float bed = floor(s);
    float within = s - bed;
    float tone = atlasHash13(vec3(bed, 7.0, 3.0)) * 0.55 + atlasHash13(vec3(floor(bed / 3.0), 1.0, 9.0)) * 0.45;
    tone = mix(0.55, tone, bedShare);
    vec3 stone = mix(${vec(rockDark)}, ${vec(rockLight)}, tone);
    // Some of the biome stays in it: a desert's rock is warm, a tundra's grey.
    stone = mix(stone, colour, 0.25);
    float ledge = (1.0 - smoothstep(0.0, 0.14, within)) * (1.0 - smoothstep(${(STRATA * 0.06).toFixed(3)}, ${(STRATA * 0.25).toFixed(3)}, foot));
    stone *= 1.0 - 0.32 * ledge;
    float rockBump = (smoothstep(0.82, 1.0, within) - within) * ${STRATA.toFixed(2)} * 0.4 * mid;
    if (fine > 0.0) {
      float grain = atlasNoiseNear(local, 1.5, 21.0) * 0.6 + atlasNoiseNear(local, 6.0, 5.0) * 0.4;
      // A noise's contour, thin, and only where a second noise lets it run, so cracks are a few short lines rather than a net.
      float crack = (1.0 - smoothstep(0.0, 0.012, abs(atlasNoiseNear(local, 0.5, 31.0) - 0.5)))
        * smoothstep(0.6, 0.75, atlasNoiseNear(local, 0.125, 47.0));
      stone *= (1.0 + (grain - 0.5) * 0.22 * fine) * (1.0 - 0.3 * crack * fine);
      rockBump += ((grain - 0.5) * 0.35 - crack * 0.5) * fine;
    }
    colour = mix(colour, stone, rock);
    bump += rockBump * ${BUMP_ROCK.toFixed(3)} * rock;
  }

  // The soil's grain and the scree's pebbles, near.
  if (fine > 0.0) {
    float grain = atlasNoiseNear(local, 6.0, 41.0);
    colour *= 1.0 + (grain - 0.5) * 0.1 * fine * (1.0 - rock);
    bump += (grain - 0.5) * ${BUMP_SOIL.toFixed(3)} * (1.0 - rock);
    float pebble = smoothstep(0.64, 0.74, atlasNoiseNear(local, 3.0, 51.0)) * soil;
    colour = mix(colour, colour * 1.2 + 0.02, pebble * fine * 0.6);
    bump += pebble * ${BUMP_PEBBLE.toFixed(3)};
  }
  bump *= fine * 0.5 + mid * 0.5;
  return colour;
}`;

/**
 * The land's ground whole, in the land's order: the painted green, the lie of
 * the land and the blots, the surface's layers, the weather, the brush. The
 * land draws with it, and so does any made face that is the land's own ground
 * (a town's edge slope), so the two meet as one hillside. Each stage has its
 * share (0 to 1): \`marks\` the lie and the blots, \`brush\` the stroke,
 * \`surface\` the layers; \`foot\` is the pixel's footprint, units, taken
 * outside any branch. Needs \`LUSH_GLSL\`, \`GROUND_MARKS_GLSL\`,
 * \`LAND_SURFACE_GLSL\` and \`groundWeatherGLSL()\` before it.
 */
export const LAND_GROUND_GLSL = /* glsl */ `
${SEASON_GLSL}
vec3 atlasLandGround(vec3 colour, vec3 pos, vec3 local, vec3 viewNormal, float foot, float marks, float brush, float surface, out float bump) {
  bump = 0.0;
  colour = atlasLush(colour);
  colour = atlasGroundSeason(colour, colour, pos);
  float macroShare = marks * step(1e-4, atlasQuality) * (1.0 - smoothstep(${(MACRO_BROAD * 0.08).toFixed(1)}, ${(MACRO_BROAD * 0.3).toFixed(1)}, foot));
  float blotShare = marks * (1.0 - smoothstep(${(PATCH_FINE * 0.1).toFixed(1)}, ${(PATCH_FINE * 0.4).toFixed(1)}, foot));
  if (macroShare > 0.0) colour = mix(colour, atlasMacro(colour, pos), macroShare);
  if (blotShare > 0.0) colour = mix(colour, atlasBlots(colour, pos), blotShare);
  if (surface > 0.0) {
    vec3 worldNormal = normalize((vec4(viewNormal, 0.0) * viewMatrix).xyz);
    float layered;
    colour = mix(colour, atlasLandSurface(colour, pos, local, worldNormal, foot, layered), surface);
    bump = layered * surface;
  }
  colour = atlasWeathered(colour, pos, viewNormal);
  float brushShare = brush * (1.0 - smoothstep(${(BRUSH_BROAD * 0.15).toFixed(2)}, ${(BRUSH_BROAD * 0.6).toFixed(2)}, foot));
  if (brushShare > 0.0) {
    float stroke = atlasNoise(pos * ${(1 / BRUSH_BROAD).toFixed(6)}) * 0.6
      + atlasNoise(pos * ${(1 / BRUSH_FINE).toFixed(6)} + 7.3) * 0.4;
    colour *= 1.0 + (stroke - 0.5) * ${(BRUSH_LIGHT * 2).toFixed(3)} * brushShare;
  }
  return colour;
}`;

/**
 * A made surface whose faces may be the land's own ground (`test`, a GLSL
 * boolean): its colour worked out from the vertex colour by `atlasLandGround`
 * at full shares, the surface's layers at `quality`. After `color_fragment`,
 * before anything changes `diffuseColor`; declares `madeLand`, `madeLandColour`
 * and `madeLandBump`, which the material puts back over its own paint and
 * hands `landBumpChunk`. Reads `vAtlasPos` and `vAtlasLocal`.
 */
export function madeLandChunk(test: string, quality: string): string {
  return /* glsl */ `
  bool madeLand = ${test};
  float madeLandFoot = max(length(dFdx(vAtlasLocal)), length(dFdy(vAtlasLocal)));
  float madeLandBump = 0.0;
  vec3 madeLandColour = diffuseColor.rgb;
  if (madeLand) madeLandColour = atlasLandGround(diffuseColor.rgb, vAtlasPos, vAtlasLocal, vNormal, madeLandFoot, 1.0, 1.0, ${quality}, madeLandBump);`;
}

/**
 * The bump as a tilt of the view-space `normal`, from the height's change
 * across the pixel's neighbours and the surface's own (Mikkelsen's surface
 * gradient). In uniform control flow; `amount` scales the height.
 */
export function landBumpChunk(height: string, amount: string): string {
  return /* glsl */ `{
    float atlasBx = dFdx(${height}) * ${amount};
    float atlasBy = dFdy(${height}) * ${amount};
    vec3 atlasSigmaX = dFdx(-vViewPosition);
    vec3 atlasSigmaY = dFdy(-vViewPosition);
    vec3 atlasR1 = cross(atlasSigmaY, normal);
    vec3 atlasR2 = cross(normal, atlasSigmaX);
    float atlasDet = dot(atlasSigmaX, atlasR1) * faceDirection;
    vec3 atlasGrad = sign(atlasDet) * (atlasBx * atlasR1 + atlasBy * atlasR2);
    // A face seen nearly on edge has a determinant whose square underflows, and its normalize is a NaN.
    vec3 atlasBent = abs(atlasDet) * normal - atlasGrad;
    float atlasSize = dot(atlasBent, atlasBent);
    if (atlasSize > 1e-20) normal = atlasBent * inversesqrt(atlasSize);
  }`;
}
