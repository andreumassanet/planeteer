import * as THREE from 'three';
import { latOf, lonOf } from './sphere.ts';

/**
 * The shade the cloud deck casts on everything the sun lights.
 *
 * It is the deck's own field read a third way: the sky draws the banks of
 * `coverageAt` (`clouds.ts`), the rain falls under them (`weather.ts`), and
 * the shade is that field sampled from each sunlit pixel along the ray to the
 * sun, as far as the sphere the deck sits on, turned back into the deck's
 * frame. A bank's shadow therefore lies where its cloud is, offset down-sun by
 * the deck's height, and drifts with it: `atlasCloudTurn` is all a frame
 * writes.
 *
 * The field is baked, not evaluated: `coverageAt` is about 850 operations a
 * pixel, so it is written once into an equirectangular texture in the deck's
 * frame (`CLOUD_MAP_WIDTH`, `createCloudBake` in `clouds.ts`) in slices under
 * the menu, and a pixel pays one bilinear fetch. The shade fades in over
 * `SHADE_FADE_MS` once the map is uploaded.
 *
 * The term lives where the sun's light is computed. Every sunlit surface is a
 * `MeshToonMaterial` and passes the sun through three's directional loop in
 * `lights_fragment_begin`; `shadeByClouds` swaps that chunk for a copy
 * (`cloudLightsChunk`) in which light 0, the sun (it casts, and three puts
 * casters first), is scaled by `1 - cover * darkness` and its cast shadow is
 * faded out under the cloud. The moon, the ambient and the sky fill are
 * untouched, so it reads as shade: walls, trees, people and cars dim with the
 * ground.
 *
 * It is opt-in, a material at a time. A chunk rewritten for every program would
 * bind a sampler nobody set, which defaults to texture unit 0 and collides
 * with the shadow map's `sampler2DShadow`. So each factory calls
 * `shadeByClouds` on what it makes, before anything clones it, and clones
 * (`fade.ts`'s twins, `woodMaterial`, the player's inkless copy) chain the hook.
 * The uniforms are shared by reference, because a per-material value is only
 * uploaded when the material changes between draws.
 *
 * This file is a leaf: the land (`globe.ts`) and the monuments' context import
 * it, so it imports nothing of the world's. The deck's numbers arrive with the
 * map (`setCloudMap`); the field and its bake stay in `clouds.ts`.
 */

/**
 * The bake's size: the field in the deck's frame, longitude across, latitude
 * up, one byte a texel, 2 MiB. A texel is 52 units of deck at the equator
 * against a finest octave of 112 units. Against the exact field the bilinear
 * lookup has a mean cover error of 0.004; half the size is a quarter of the
 * bake time at three times the error, with facets showing along an edge seen
 * from above.
 */
export const CLOUD_MAP_WIDTH = 2048;
export const CLOUD_MAP_HEIGHT = 1024;

/**
 * The span of the field a byte holds. The shade reads the field only round the
 * cut (`THRESHOLD`, 0.575) and as deep as a bank gets (`DEPTH_SPAN` past it,
 * 0.735), so a byte spread over 0.40 to 0.80 is 0.0016 of the field a step,
 * thirty steps across the soft edge below; outside it the field is clear sky
 * or a bank's heart, and clamps.
 */
export const CLOUD_MAP_LOW = 0.4;
export const CLOUD_MAP_HIGH = 0.8;

/**
 * The shade's soft edge, in the field's units either side of the cut: from
 * `SHADE_EDGE_OUT` under it to `SHADE_EDGE_IN` over it. Over a real bank that
 * is about fifty units of ground, enough to hide the difference between the
 * field's smooth contour and the lumpy row of puffs drawn along it, and it
 * leans outward because the puffs' rims reach past the cut. Wider reads as no
 * edge at all; narrower shows the bake's texels in the edge's line.
 */
export const SHADE_EDGE_OUT = 0.02;
export const SHADE_EDGE_IN = 0.008;

/**
 * How much of the sun's term a cloud takes: `SHADE_RIM` at a bank's edge,
 * rising to `SHADE_HEART` at its deepest (depth 1, `DEPTH_SPAN` past the cut),
 * the raining middle the deck builds as a tower.
 *
 * Compare the cast shadow's 0.65 (`SHADOW_INTENSITY` in `sun.ts`), the same
 * multiply on the same term: a cloud's rim is lighter than that and its heart
 * about as dark, and both stay lighter than shadow plus rim together because
 * under a cloud the cast shadow is gone (`cloudLightsChunk`). Much darker and
 * the patches read as dirt on the land's painted blots (`atlasPatches`); much
 * lighter and they read as a haze.
 */
export const SHADE_RIM = 0.45;
export const SHADE_HEART = 0.66;

/**
 * The sun's elevation the shade fades in over, as sines: from 1.15 degrees
 * under the horizon (the light's own terminator is soft; `theme.ts`'s ramp
 * wraps past it) to 4 degrees over it. Lower than that the ray to the deck
 * runs up to 5,745 units and a shadow is a smear across a province.
 */
export const SHADE_SUN: readonly [number, number] = [Math.sin((-1.15 * Math.PI) / 180), Math.sin((4 * Math.PI) / 180)];

/**
 * The shell the shade is cast into, in units from the planet's radius: from
 * the deepest drawn sea floor to well under the deck's lowest belly (870).
 * Above it a thing is in the cloud or over it (an airliner at its cruise of
 * 1,700); below it is not on the planet at all (the traveller's card draws the
 * cast round the origin). The edges are `SHADE_BAND_SOFT` wide.
 */
export const SHADE_BAND: readonly [number, number] = [-400, 880];
const SHADE_BAND_SOFT = 20;

/** How long the shade takes to come in once its map is uploaded, ms. */
export const SHADE_FADE_MS = 2000;

/**
 * Degrees of arc past the view's own horizon a sunlit point may still be drawn
 * from: mountains stand up to 620 units over the sea and are seen past the
 * horizon of the sea-level sphere. Only for `updateCloudShade`'s night test, a
 * shortcut; the pixels' own gate (`SHADE_SUN`) is the rule.
 */
const NIGHT_MARGIN = (6 * Math.PI) / 180;

/**
 * What the weather takes off the sun everywhere at once, at `sunCut` 1. The
 * number `sun.ts` applies (`1 - SUN_CUT * sunCut`), kept here so `sunScale`
 * and the sky agree.
 */
export const SUN_CUT = 0.72;

/**
 * What a bank's rain and storm still take off the sun everywhere once the
 * bank's own shade is drawn per pixel. The gloom of a downpour is more than
 * the deck's one layer (rain curtains, the anvil), so a little stays global,
 * sized so that under the heart of a real storm the sun's term comes out at
 * 0.28; see `sunScale` and `pnpm weather`.
 */
const BANK_CUT_RAIN = 0.08;
const BANK_CUT_STORM = 0.12;

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

/** A field value as the bake stores it: its place in `CLOUD_MAP_LOW`..`HIGH`, as a byte. */
export function cloudMapByte(field: number): number {
  return Math.round(clamp01((field - CLOUD_MAP_LOW) / (CLOUD_MAP_HIGH - CLOUD_MAP_LOW)) * 255);
}

/**
 * Where a direction of the deck's frame falls on the map, as texture
 * coordinates: longitude across from -180, latitude up from -90, matching the
 * GLSL's `atan(-z, x)` and `asin(y)`, through `sphere.ts`'s one conversion.
 */
export function cloudMapUV(x: number, y: number, z: number, out: { u: number; v: number }): { u: number; v: number } {
  const length = Math.hypot(x, y, z) || 1;
  out.u = (lonOf(x, z) + 180) / 360;
  out.v = (latOf(y / length) + 90) / 180;
  return out;
}

const lookup = { u: 0, v: 0 };
/**
 * The map read as the GPU reads it (bilinear, repeating across the
 * antimeridian, clamped at the poles) at a direction of the deck's frame, as a
 * field value. For the checks, which hold the bake to the field.
 */
export function sampleCloudMap(data: Uint8Array, x: number, y: number, z: number): number {
  cloudMapUV(x, y, z, lookup);
  const fx = lookup.u * CLOUD_MAP_WIDTH - 0.5;
  const fy = lookup.v * CLOUD_MAP_HEIGHT - 0.5;
  const i0 = Math.floor(fx);
  const j0 = Math.floor(fy);
  const tx = fx - i0;
  const ty = fy - j0;
  const wrap = (i: number): number => ((i % CLOUD_MAP_WIDTH) + CLOUD_MAP_WIDTH) % CLOUD_MAP_WIDTH;
  const row = (j: number): number => Math.min(CLOUD_MAP_HEIGHT - 1, Math.max(0, j)) * CLOUD_MAP_WIDTH;
  const a = row(j0);
  const b = row(j0 + 1);
  const c0 = data[a + wrap(i0)]! + (data[a + wrap(i0 + 1)]! - data[a + wrap(i0)]!) * tx;
  const c1 = data[b + wrap(i0)]! + (data[b + wrap(i0 + 1)]! - data[b + wrap(i0)]!) * tx;
  return CLOUD_MAP_LOW + ((c0 + (c1 - c0) * ty) / 255) * (CLOUD_MAP_HIGH - CLOUD_MAP_LOW);
}

/** The shade's cover at a field value: the soft edge round the cut (`SHADE_EDGE_OUT`). */
export function shadeCover(field: number, threshold: number): number {
  return smoothstep(threshold - SHADE_EDGE_OUT, threshold + SHADE_EDGE_IN, field);
}

/** The share of the sun a full cover takes at a depth into the bank, 0 to 1. */
export function shadeDarkness(depth: number): number {
  return SHADE_RIM + (SHADE_HEART - SHADE_RIM) * clamp01(depth);
}

/**
 * Where a point may be shaded at all, 0 to 1: inside `SHADE_BAND` round a
 * planet of radius `planet`, and under a sun `sinElevation` over its horizon
 * (`SHADE_SUN`). The GLSL's gate, term for term.
 */
export function shadeGate(radius: number, sinElevation: number, planet: number): number {
  const low = planet + SHADE_BAND[0];
  const high = planet + SHADE_BAND[1];
  return (
    smoothstep(low - SHADE_BAND_SOFT, low, radius) *
    (1 - smoothstep(high - SHADE_BAND_SOFT, high, radius)) *
    smoothstep(SHADE_SUN[0], SHADE_SUN[1], sinElevation)
  );
}

/**
 * How far along `toSun` (a unit vector) a point at `point` reaches the sphere
 * of radius `deck`, from inside it. The stable root of `|p + t s| = deck`:
 * `(deck - r)(deck + r)` avoids the difference of two squares of sixteen
 * thousand, which loses a thousand-unit gap to rounding in single precision.
 */
export function rayToDeck(point: THREE.Vector3, toSun: THREE.Vector3, deck: number): number {
  const r = point.length();
  const c = (deck - r) * (deck + r);
  const b = point.dot(toSun);
  return c / (b + Math.sqrt(b * b + c));
}

/**
 * The GLSL, declared once per program after `lights_pars_begin`, where the
 * light uniforms are: the shared uniforms and `atlasCloudAt`, the field along
 * the ray to the sun at a world point (cover times the gates and the strength
 * in x, the depth into the bank in y). The deck's own numbers arrive in
 * `atlasCloudDeck` (planet radius, deck radius, cut, depth span) with the map;
 * every other constant is a literal. `ATLAS_CLOUD_SHADE` is defined for code
 * that wants the shade outside the light loop (the sea's glitter, the
 * varnish's highlight) and must compile without it on a material that did not
 * opt in.
 *
 * `textureLod` and not `texture`: the fetch is behind a branch, where
 * derivatives are undefined, and the map has one level anyway.
 */
const DECLARATIONS = /* glsl */ `
#define ATLAS_CLOUD_SHADE
uniform sampler2D atlasCloudMap;
uniform mat3 atlasCloudTurn;
uniform vec3 atlasCloudSun;
uniform vec4 atlasCloudDeck;
uniform vec4 atlasCloudShade;
vec2 atlasCloudAt( vec3 p, vec3 toSun ) {
	if ( atlasCloudShade.x <= 0.0 ) return vec2( 0.0 );
	float r = length( p );
	float b = dot( p, toSun );
	float low = atlasCloudDeck.x + ${SHADE_BAND[0].toFixed(1)};
	float high = atlasCloudDeck.x + ${SHADE_BAND[1].toFixed(1)};
	float gate = smoothstep( low - ${SHADE_BAND_SOFT.toFixed(1)}, low, r )
		* ( 1.0 - smoothstep( high - ${SHADE_BAND_SOFT.toFixed(1)}, high, r ) )
		* smoothstep( ${SHADE_SUN[0].toFixed(5)}, ${SHADE_SUN[1].toFixed(5)}, b / max( r, 1.0 ) );
	if ( gate <= 0.0 ) return vec2( 0.0 );
	float c = ( atlasCloudDeck.y - r ) * ( atlasCloudDeck.y + r );
	vec3 q = normalize( atlasCloudTurn * ( p + toSun * ( c / ( b + sqrt( b * b + c ) ) ) ) );
	vec2 uv = vec2( atan( -q.z, q.x ) * 0.15915494 + 0.5, asin( clamp( q.y, -1.0, 1.0 ) ) * 0.31830989 + 0.5 );
	float field = ${CLOUD_MAP_LOW.toFixed(3)} + textureLod( atlasCloudMap, uv, 0.0 ).r * ${(CLOUD_MAP_HIGH - CLOUD_MAP_LOW).toFixed(3)};
	return vec2(
		smoothstep( atlasCloudDeck.z - ${SHADE_EDGE_OUT.toFixed(4)}, atlasCloudDeck.z + ${SHADE_EDGE_IN.toFixed(4)}, field ) * gate * atlasCloudShade.x,
		clamp( ( field - atlasCloudDeck.z ) / atlasCloudDeck.w, 0.0, 1.0 ) );
}
vec2 atlasCloudOfView( vec3 viewPosition ) {
	if ( atlasCloudShade.x <= 0.0 ) return vec2( 0.0 );
	return atlasCloudAt( cameraPosition + ( vec4( viewPosition, 0.0 ) * viewMatrix ).xyz, atlasCloudSun );
}
`;

/** The three strings the patch finds in three's chunk, exactly. */
const DIRECTIONAL = 'DirectionalLight directionalLight;';
const DIRECTIONAL_SHADOW =
  'getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] )';
const DIRECT = 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
const LOOP_END = '#pragma unroll_loop_end';

/** How many times `needle` is in `haystack`. */
const count = (haystack: string, needle: string): number => haystack.split(needle).length - 1;

let lights: string | null = null;

/**
 * three's `lights_fragment_begin` with the cloud in it, derived from the chunk
 * by exact replacement. It throws if the text has moved, so a three upgrade
 * that rewrote the loop fails loudly instead of drawing the world without its
 * shade; `pnpm weather` asserts it headless.
 *
 * Three edits, all in the directional block:
 *
 * - the cloud at this pixel, once, before the loop (`atlasCloud`, declared at
 *   the top of the chunk because three unrolls the loop);
 * - the cast shadow mixed out under it, for light 0 only;
 * - the sun's colour scaled by `1 - cover * darkness` before `RE_Direct`, so
 *   the ramp, the grass's and the leaves' own light and their translucency all
 *   take it.
 */
export function cloudLightsChunk(): string {
  if (lights !== null) return lights;
  const source = THREE.ShaderChunk.lights_fragment_begin;
  const open = source.indexOf(DIRECTIONAL);
  const close = open < 0 ? -1 : source.indexOf(LOOP_END, open);
  const block = close < 0 ? '' : source.slice(open, close);
  if (open < 0 || close < 0 || count(source, DIRECTIONAL) !== 1 || count(block, DIRECTIONAL_SHADOW) !== 1 || count(block, DIRECT) !== 1) {
    throw new Error(
      "cloud-shade.ts: three's lights_fragment_begin no longer has the directional loop this patches (r182's text). Re-derive the patch from the new chunk.",
    );
  }
  const shaded = block
    .replace(DIRECTIONAL, () => `${DIRECTIONAL}\n\tatlasCloud = atlasCloudOfView( geometryPosition );`)
    .replace(DIRECTIONAL_SHADOW, () => `mix( ${DIRECTIONAL_SHADOW}, 1.0, UNROLLED_LOOP_INDEX == 0 ? atlasCloud.x : 0.0 )`)
    .replace(
      DIRECT,
      () =>
        '#if ( UNROLLED_LOOP_INDEX == 0 )\n' +
        '\t\tdirectLight.color *= 1.0 - atlasCloud.x * ( atlasCloudShade.y + atlasCloudShade.z * atlasCloud.y );\n' +
        `\t\t#endif\n\t\t${DIRECT}`,
    );
  lights = `vec2 atlasCloud = vec2( 0.0 );\n${source.slice(0, open)}${shaded}${source.slice(close)}`;
  return lights;
}

/** What the map is until the bake is uploaded: one clear texel, so the sampler is bound to something real. */
const placeholder = new THREE.DataTexture(new Uint8Array([0]), 1, 1, THREE.RedFormat, THREE.UnsignedByteType);
placeholder.needsUpdate = true;

const uniforms = {
  atlasCloudMap: { value: placeholder as THREE.Texture },
  /** The deck's turn undone: world to the deck's frame, where the map was baked. */
  atlasCloudTurn: { value: new THREE.Matrix3() },
  /** The sun's direction, world space. */
  atlasCloudSun: { value: new THREE.Vector3(0, 1, 0) },
  /** Planet radius, deck radius, the cut, the depth span: zero until the map arrives. */
  atlasCloudDeck: { value: new THREE.Vector4(0, 0, 0, 1) },
  /** Strength (0 skips everything), the rim's darkness, the heart's over the rim's, unused. */
  atlasCloudShade: { value: new THREE.Vector4(0, SHADE_RIM, SHADE_HEART - SHADE_RIM, 0) },
};

/** The patched programs' uniforms, by reference: one upload of each, whatever draws. */
export function bindCloudShade(target: Record<string, THREE.IUniform>): void {
  Object.assign(target, uniforms);
}

const shaded = new WeakSet<THREE.Material>();
let warned = false;

/**
 * Opts a toon material into the cloud's shade, chaining whatever it already
 * does in `onBeforeCompile`, and returns it.
 *
 * Call it before anything clones the material: `Material.copy` leaves the
 * hooks behind, so every clone chains its source's hook and key by hand, and a
 * clone made earlier would chain the unshaded ones. `|clouds` is added to the
 * program cache key so a material whose key did not change is not handed the
 * program it had before; a base on the default key (the text of its hook) has
 * that text taken first.
 */
export function shadeByClouds<T extends THREE.MeshToonMaterial>(material: T): T {
  if (shaded.has(material)) return material;
  shaded.add(material);
  const base = material.onBeforeCompile;
  const baseKey =
    material.customProgramCacheKey === THREE.Material.prototype.customProgramCacheKey
      ? ((text: string) => () => text)(base.toString())
      : material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    base.call(material, shader, renderer);
    const fragment = shader.fragmentShader;
    if (!fragment.includes('#include <lights_pars_begin>') || !fragment.includes('#include <lights_fragment_begin>')) {
      // A hook upstream replaced one of the two anchors: the material draws unshaded
      // and says so once.
      if (!warned) console.warn(`cloud-shade: '${material.name || material.type}' has no light chunks left to shade`);
      warned = true;
      return;
    }
    bindCloudShade(shader.uniforms);
    // Replaced by functions, so nothing in the text is read as a `$` pattern.
    shader.fragmentShader = fragment
      .replace('#include <lights_pars_begin>', () => `#include <lights_pars_begin>\n${DECLARATIONS}`)
      .replace('#include <lights_fragment_begin>', cloudLightsChunk);
  };
  material.customProgramCacheKey = () => `${baseKey()}|clouds`;
  return material;
}

export interface CloudShadeState {
  /** The console's A/B (`atlas.clouds.shadows`), 0 to 1. 0 turns the shade off. */
  shadows: number;
  /**
   * The weather's say, 0 or 1, written by `weather-view.ts`: 0 under a forced
   * sky or with the weather off, which keep the global cut (see `share`).
   */
  weather: number;
  /**
   * How much of a bank's darkening is drawn per pixel rather than by the global
   * cut of the sun: the switch, the fade-in and the weather. `weather-view.ts`
   * blends the sun's cut on it (`sunCutOf`), so the two never both darken the
   * same ground.
   */
  readonly share: number;
  /** What the shader was handed this frame: the share, the menu's veil, the night and the ready fade. */
  readonly strength: number;
  /** Whether the map is uploaded, how much of the bake is done, and what it cost. */
  readonly ready: boolean;
  rows: number;
  bakeMs: number;
}

let readyAt = -1;
let strength = 0;

export const cloudShade: CloudShadeState = {
  shadows: 1,
  weather: 1,
  get share(): number {
    const fade = readyAt < 0 ? 0 : smoothstep(0, SHADE_FADE_MS, performance.now() - readyAt);
    return clamp01(this.shadows) * fade * clamp01(this.weather);
  },
  get strength(): number {
    return strength;
  },
  get ready(): boolean {
    return readyAt >= 0;
  },
  rows: 0,
  bakeMs: 0,
};

/**
 * Hands the shaders the baked field and the deck it was baked against, once,
 * and starts the fade-in.
 */
export function setCloudMap(
  data: Uint8Array,
  deck: { planet: number; base: number; threshold: number; depthSpan: number },
): void {
  const texture = new THREE.DataTexture(data, CLOUD_MAP_WIDTH, CLOUD_MAP_HEIGHT, THREE.RedFormat, THREE.UnsignedByteType);
  texture.magFilter = THREE.LinearFilter;
  // No mipmaps, so the `atan` seam at the antimeridian, where the derivative of
  // `u` is a whole turn, picks no level.
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  uniforms.atlasCloudMap.value = texture;
  uniforms.atlasCloudDeck.value.set(deck.planet, deck.planet + deck.base, deck.threshold, deck.depthSpan);
  readyAt = performance.now();
}

const inverse = new THREE.Quaternion();
const rotation = new THREE.Matrix4();

/**
 * Once a frame, after the deck has turned: the turn undone, the sun, and the
 * strength (the share, the menu's veil, and zero when nothing the camera can
 * see has the sun up, which makes every pixel skip the branch).
 */
export function updateCloudShade(turn: THREE.Quaternion, sun: THREE.Vector3, camera: THREE.Vector3, veil: number): void {
  inverse.copy(turn).invert();
  uniforms.atlasCloudTurn.value.setFromMatrix4(rotation.makeRotationFromQuaternion(inverse));
  uniforms.atlasCloudSun.value.copy(sun);
  const planet = uniforms.atlasCloudDeck.value.x;
  const distance = camera.length();
  let lit = 0;
  if (planet > 0 && distance > 0) {
    // The sun's elevation under the camera, and the arc the camera can see
    // round it: past that every pixel's own gate is closed.
    const elevation = Math.asin(Math.max(-1, Math.min(1, camera.dot(sun) / distance)));
    const reach = Math.acos(Math.min(1, planet / Math.max(planet, distance))) + NIGHT_MARGIN;
    lit = Math.sin(Math.min(Math.PI / 2, elevation + reach)) > SHADE_SUN[0] ? 1 : 0;
  }
  strength = cloudShade.share * clamp01(veil) * lit;
  uniforms.atlasCloudShade.value.x = strength;
}

/**
 * No shade until the next `updateCloudShade`: another world is drawn with
 * Earth's materials, and Earth's deck is not over it.
 */
export function suspendCloudShade(): void {
  strength = 0;
  uniforms.atlasCloudShade.value.x = 0;
}

/**
 * The cut of the whole world's sun (`Sky.weather.sunCut`), from the weather
 * where the player stands.
 *
 * With the shade drawn, a bank darkens per pixel where its shadow falls, and
 * the global cut keeps only a little of the rain's and the storm's gloom
 * (`BANK_CUT_RAIN`). `share` blends from the cut of the whole sun (`overcast`:
 * cover, rain and storm together, up to `SUN_CUT`) to that: 0 before the map,
 * under a forced sky, or with the weather or the shade off; 1 once the shade is
 * in. The ground is darkened by one of the two, never both. `above` is the
 * weather's own fade through the deck.
 */
export function sunCutOf(overcast: number, precipitation: number, storm: number, above: number, share: number): number {
  const bank = clamp01(precipitation * BANK_CUT_RAIN + storm * BANK_CUT_STORM) * (1 - above);
  return overcast + (bank - overcast) * clamp01(share);
}

/**
 * The share of the sun's term that reaches a surface: the global cut and the
 * cloud over it, `cover` 0 to 1 (strength included) at `depth` into its bank.
 * `pnpm weather` holds it to the weather presets.
 */
export function sunScale(sunCut: number, cover: number, depth: number): number {
  return (1 - SUN_CUT * clamp01(sunCut)) * (1 - clamp01(cover) * shadeDarkness(depth));
}
