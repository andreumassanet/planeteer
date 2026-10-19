// The weather on the ground: rain darkening it, snow lying on it.
//
// One uniform set and one GLSL chunk, read by every material that draws ground
// (the land, the sward, a town's floor and roofs, a road's ribbon), so a wet
// street and the wet verge beside it are one shade. The land's vertex colour is
// the climate and never moves; this is a factor over it.
//
// Two kinds of snow:
//  - Lying snow is the season: `lyingSnowAt`, a pure function of where and when.
//    The shader computes it per fragment from the same numbers (generated from
//    `biome.ts`'s table), with continentality read off a 1-degree texture that
//    `weather-view.ts` bakes.
//  - Fresh snow and wet ground are the weather where the player is: `atlasFresh`
//    and `atlasWet`, reaching `WEATHER_REACH` round `atlasWeatherAt`.
// Snow settles only on ground that faces up (`SNOW_FLAT`), and in blots.

import * as THREE from 'three';
import { LAND_HEIGHT } from '../geo.ts';
import { BIOMES, LAPSE_PER_UNIT, SWING, TEMPERATURE_KNOTS, meanTemperature, seasonalSwing } from '../biome.ts';
import { PLANET_RADIUS } from './planet.ts';

export const groundWeather = {
  /** How wet the ground is where the player is, 0 to 1 (`wetnessAt`, eased). */
  atlasWet: { value: 0 },
  /** How hard it is raining there now, 0 to 1: what rings the puddles. */
  atlasRain: { value: 0 },
  /** Seconds, wrapped: the rings' clock. */
  atlasRainClock: { value: 0 },
  atlasFresh: { value: 0 },
  /** `seasonOf`'s northern phase: +1 at the height of the northern summer. */
  atlasSeason: { value: 0 },
  /** `seasonTurn`, radians: the flora's year (`foliage-season.ts`), which tells autumn from spring. */
  atlasSeasonTurn: { value: 0 },
  atlasWeatherAt: { value: new THREE.Vector3() },
  /** The biome's continentality, one texel a degree; see `weather-view.ts`. */
  atlasContinental: { value: blankContinental() },
};

function blankContinental(): THREE.DataTexture {
  const texture = new THREE.DataTexture(new Uint8Array([64, 0, 0, 255]), 1, 1);
  texture.needsUpdate = true;
  return texture;
}

/** How far round the player the weather's own wet and fresh snow reach. */
export const WEATHER_REACH = 3200;
/** How much darker wet ground is. Paving goes darkest in life; one number here. */
const WET_DARK = 0.3;
/** The seasonal snow's band: none at `LIE_WARM` degrees, complete at `LIE_COLD`. */
export const LIE_WARM = 1.5;
export const LIE_COLD = -3.5;
/** How much a surface has to face the sky to hold snow: the cosine band. */
const SNOW_FLAT: [number, number] = [0.55, 0.85];

/** The season's temperature where you stand, less the day: the mean, the height and the year's swing (reversed in the south, damped to nothing across the equator). */
export function seasonalTemperature(lat: number, elevation: number, continental: number, season: number): number {
  const hemisphere = Math.max(-1, Math.min(1, lat / 5));
  return meanTemperature(lat, elevation) + seasonalSwing(lat, continental) * season * hemisphere;
}

/** Lying snow, 0 to 1: the JavaScript twin of `atlasLyingSnow`. */
export function lyingSnowAt(lat: number, elevation: number, continental: number, season: number): number {
  const t = seasonalTemperature(lat, elevation, continental, season);
  const k = Math.max(0, Math.min(1, (t - LIE_WARM) / (LIE_COLD - LIE_WARM)));
  return k * k * (3 - 2 * k);
}

function knotsGLSL(name: string, knots: readonly (readonly [number, number])[]): string {
  const lines = [`float ${name}(float a) {`];
  for (let i = 1; i < knots.length; i++) {
    const [x0, y0] = knots[i - 1]!;
    const [x1, y1] = knots[i]!;
    lines.push(`  if (a <= ${x1.toFixed(1)}) return mix(${y0.toFixed(2)}, ${y1.toFixed(2)}, (a - ${x0.toFixed(1)}) / ${(x1 - x0).toFixed(1)});`);
  }
  lines.push(`  return ${knots[knots.length - 1]![1].toFixed(2)};`, '}');
  return lines.join('\n');
}

const snowLinear = new THREE.Color(BIOMES.ice.color);

/** The chunk's declarations; needs `GROUND_MARKS_GLSL` before it for `atlasNoise`. Built on first use because it reads `PLANET_RADIUS`. */
export function groundWeatherGLSL(): string {
  return /* glsl */ `
uniform float atlasWet;
uniform float atlasFresh;
uniform float atlasSeason;
uniform vec3 atlasWeatherAt;
uniform sampler2D atlasContinental;
${knotsGLSL('atlasMeanNorth', TEMPERATURE_KNOTS.north)}
${knotsGLSL('atlasMeanSouth', TEMPERATURE_KNOTS.south)}
float atlasLyingSnow(vec3 pos) {
  vec3 up = normalize(pos);
  float lat = degrees(asin(clamp(up.y, -1.0, 1.0)));
  float a = abs(lat);
  // The same longitude \`sphere.ts\` takes, atan(-z, x), for the texture only.
  vec2 uv = vec2(atan(-up.z, up.x) / 6.2831853 + 0.5, lat / 180.0 + 0.5);
  float continental = texture2D(atlasContinental, uv).r;
  float height = max(0.0, length(pos) - ${(PLANET_RADIUS + LAND_HEIGHT).toFixed(1)});
  float swing = ${SWING.tropics.toFixed(2)} + ${SWING.range.toFixed(2)} * smoothstep(${SWING.from.toFixed(1)}, ${SWING.to.toFixed(1)}, a)
    * (${SWING.coast.toFixed(3)} + ${(1 - SWING.coast).toFixed(3)} * continental);
  float t = (lat >= 0.0 ? atlasMeanNorth(a) : atlasMeanSouth(a)) - ${LAPSE_PER_UNIT.toFixed(6)} * height
    + swing * atlasSeason * clamp(lat / 5.0, -1.0, 1.0);
  // Reversed as one minus the rising step: GLSL leaves smoothstep undefined
  // for a falling pair of edges.
  return 1.0 - smoothstep(${LIE_COLD.toFixed(2)}, ${LIE_WARM.toFixed(2)}, t);
}
float atlasWeatherNear(vec3 pos) {
  return 1.0 - smoothstep(${(WEATHER_REACH * 0.55).toFixed(1)}, ${WEATHER_REACH.toFixed(1)}, distance(pos, atlasWeatherAt));
}
vec3 atlasWeathered(vec3 colour, vec3 pos, vec3 viewNormal) {
  vec3 up = normalize(pos);
  vec3 worldNormal = normalize((vec4(viewNormal, 0.0) * viewMatrix).xyz);
  float facing = smoothstep(${SNOW_FLAT[0].toFixed(2)}, ${SNOW_FLAT[1].toFixed(2)}, abs(dot(worldNormal, up)));
  float near = atlasWeatherNear(pos);
  float snow = max(atlasLyingSnow(pos), atlasFresh * near);
  // In blots: a thin cover is patches and a deep one is whole. The blot can
  // only take snow away, so where there is none the noise is not asked, and
  // most of the world's ground on most days is that case.
  if (snow > 0.0) snow = clamp(snow * 1.6 - atlasNoise(pos * 0.035) * 0.6, 0.0, 1.0) * facing;
  colour *= 1.0 - ${WET_DARK.toFixed(2)} * atlasWet * near * (1.0 - snow);
  return mix(colour, vec3(${snowLinear.r.toFixed(4)}, ${snowLinear.g.toFixed(4)}, ${snowLinear.b.toFixed(4)}), snow);
}`;
}

/** Hands a program the shared uniforms; call it in the material's `onBeforeCompile`. */
export function bindGroundWeather(uniforms: Record<string, THREE.IUniform>): void {
  Object.assign(uniforms, groundWeather);
}

/**
 * The weathering itself, on `diffuseColor`, at a world position `pos` (a GLSL
 * expression). After `color_fragment`; reads `vNormal`, which every toon
 * material that draws ground has.
 */
export function groundWeatherChunk(pos: string): string {
  return `diffuseColor.rgb = atlasWeathered(diffuseColor.rgb, ${pos}, vNormal);`;
}

/** The sky's share a wet surface reflects at normal incidence, and how much more a puddle does. */
const WET_GLOSS = 0.18;
const PUDDLE_GLOSS = 0.55;
/** A puddle's noise scale (a puddle is a few metres across) and the share of flat ground one covers when soaked. */
const PUDDLE_SCALE = 0.11;
const PUDDLE_COVER = 0.32;
/** How dark the water in a puddle leaves what is under it. */
const PUDDLE_DARK = 0.35;
/** A ripple's cell in units, and how many land in one a second at full rain. */
const RIPPLE_CELL = 0.9;
const RIPPLE_RATE = 1.1;

/**
 * The wet surface's sheen, over the lit colour: a gloss that reflects the sky
 * by a Fresnel term, puddles in the low spots of flat ground, the sun's glint
 * in them, and rings where drops land while it rains. Made surfaces only (the
 * road's ribbon, a town's floor and roofs), and only at full quality: at 0
 * the ground keeps `atlasWeathered`'s darkening alone. Needs
 * `groundWeatherGLSL()` and `atlasQuality` declared before it, and goes just
 * before `void main() {`, after the lights' and the fog's declarations.
 */
export function wetSheenGLSL(): string {
  return /* glsl */ `
uniform float atlasRain;
uniform float atlasRainClock;
float atlasRippleLayer(vec2 p, float seed) {
  vec2 cell = floor(p);
  vec2 f = p - cell;
  float h = atlasHash13(vec3(cell, seed));
  vec2 centre = vec2(0.28) + 0.44 * vec2(h, fract(h * 17.31));
  float t = fract(atlasRainClock * ${RIPPLE_RATE.toFixed(2)} + h * 7.13);
  float r = length(f - centre);
  float ring = 1.0 - smoothstep(0.0, 0.045, abs(r - t * 0.42));
  return ring * (1.0 - t) * step(fract(h * 3.71), atlasRain * 1.2);
}
// The puddle share at a point of flat ground soaked wet.
float atlasPuddle(vec3 pos, float wet) {
  float n = atlasNoise(pos * ${PUDDLE_SCALE.toFixed(3)}) * 0.7 + atlasNoise(pos * ${(PUDDLE_SCALE * 3.1).toFixed(3)}) * 0.3;
  float edge = 1.0 - ${PUDDLE_COVER.toFixed(2)} * smoothstep(0.35, 0.9, wet);
  return smoothstep(edge, edge + 0.04, n);
}
vec3 atlasWetSheen(vec3 lit, vec3 pos, vec3 viewNormal, vec3 viewPos) {
  if (atlasQuality <= 0.0) return lit;
  float wet = atlasWet * atlasWeatherNear(pos);
  if (wet <= 0.01) return lit;
  vec3 up = normalize(pos);
  vec3 worldNormal = normalize((vec4(viewNormal, 0.0) * viewMatrix).xyz);
  float level = smoothstep(0.9, 0.985, dot(worldNormal, up));
  if (level <= 0.0) return lit;
  float puddle = atlasPuddle(pos, wet) * level;
  // vViewPosition is the fragment's position negated, so it already points at the eye.
  vec3 v = normalize(viewPos);
  float ndv = clamp(dot(viewNormal, v), 0.0, 1.0);
  float fresnel = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
  vec3 sky = vec3(0.62, 0.68, 0.74);
  #ifdef USE_FOG
    sky = fogColor;
  #endif
  vec3 a = abs(up);
  vec2 plane = (a.x > a.y && a.x > a.z ? pos.yz : a.y > a.z ? pos.xz : pos.xy) / ${RIPPLE_CELL.toFixed(2)};
  float ripple = atlasRain > 0.02 ? atlasRippleLayer(plane, 1.0) + atlasRippleLayer(plane * 1.37 + 0.5, 2.0) : 0.0;
  float gloss = wet * level * (${WET_GLOSS.toFixed(2)} + ${PUDDLE_GLOSS.toFixed(2)} * puddle) * atlasQuality;
  lit *= 1.0 - ${PUDDLE_DARK.toFixed(2)} * puddle * wet * atlasQuality;
  lit += sky * gloss * (fresnel + 0.35 * ripple * puddle);
  #if NUM_DIR_LIGHTS > 0
    vec3 h = normalize(directionalLights[0].direction + v);
    float glint = pow(max(dot(viewNormal, h), 0.0), 180.0) * step(0.0, dot(viewNormal, directionalLights[0].direction));
    lit += directionalLights[0].color * glint * puddle * wet * (1.0 - atlasRain) * 1.5 * atlasQuality;
  #endif
  return lit;
}`;
}

/** The sheen on the lit colour, put before `#include <opaque_fragment>` (which it carries). Reads `normal` and `vViewPosition`. */
export function wetSheenChunk(pos: string, skip = 'false'): string {
  return `if (!(${skip})) outgoingLight = atlasWetSheen(outgoingLight, ${pos}, normal, vViewPosition);
#include <opaque_fragment>`;
}
