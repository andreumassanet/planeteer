import * as THREE from 'three';
import { latOf, lonOf } from './sphere.ts';

/**
 * The shade the cloud deck casts on everything the sun lights.
 *
 * **It is the deck's own field and nothing else.** The sky draws the banks of
 * `coverageAt` (`clouds.ts`) and the rain falls under them (`weather.ts`); the
 * shade is the same field read a third way: from each sunlit pixel along the
 * ray to the sun, as far as the sphere the deck sits on, turned back into the
 * deck's own frame. So a bank's shadow lies where its cloud is, offset down-sun
 * by the deck's height — straight under it at noon in the tropics, a long way
 * off at an evening sun — and drifts with it, because the deck is a rigid turn
 * of a field that never changes: `atlasCloudTurn` is the whole of what a frame
 * writes.
 *
 * **Baked, not evaluated.** `coverageAt` is ten value-noise lookups of eight
 * hashes each, about 850 operations a pixel; the field is fixed in the deck's
 * frame, so it is written once into an equirectangular texture in that frame
 * (`CLOUD_MAP_WIDTH`, `clouds.ts`'s `createCloudBake`) and a pixel pays one
 * bilinear fetch. The bake is 0.6 s of the main thread and is spent in slices
 * under the menu, like the flag layer's (`FLAG_BUILD_MS` in `main.ts`), and the
 * shade fades in over `SHADE_FADE_MS` once it is uploaded.
 *
 * **One term, where the sun's light is computed.** Every sunlit surface in the
 * world is a `MeshToonMaterial`, and every one of them — the grass's and the
 * leaves' own `RE_Direct` included — passes the sun through three's directional
 * loop in `lights_fragment_begin`: the light's colour, times the shadow, into
 * the ramp. `shadeByClouds` swaps that chunk for a copy (`cloudLightsChunk`) in
 * which light 0, the sun (it casts, and three puts casters first), is scaled
 * by `1 - cover * darkness` and its cast shadow is faded out under the cloud,
 * the way a shadow goes when the sun does. The moon, light 1, is untouched,
 * and so are the ambient and the sky's fill: what a cloud takes is the direct
 * sun and nothing else, which is also why it reads as shade rather than as
 * dirt — the walls, the trees, the people and the cars dim with the ground,
 * and their shadows go.
 *
 * **Opt-in, a material at a time, and never global.** A chunk rewritten for
 * every program would bind a sampler nobody set, which defaults to texture
 * unit 0 and collides there with the shadow map's `sampler2DShadow` — a draw
 * that fails with `INVALID_OPERATION` — and it would reach the traveller's
 * card, the review sheets and the sky. So each factory calls `shadeByClouds`
 * on what it makes, before anything clones it, and the clones (`fade.ts`'s
 * twins, `woodMaterial`, the player's inkless copy) chain the hook with the
 * rest. The uniforms are this module's, bound by reference, the way
 * `bindNearLights` shares the lamps: a per-material value would be uploaded
 * only when the material changes between draws (see `fade.ts`).
 *
 * **A leaf.** The land (`globe.ts`) and the monuments' context opt in, and
 * both are imported by the modules the deck's own file imports, so this file
 * may import nothing of the world's: the deck's numbers arrive as a uniform
 * with the map (`setCloudMap`), and the field and its bake stay in `clouds.ts`.
 */

/**
 * The bake's size: the field in the deck's frame, longitude across, latitude
 * up, one byte a texel, 2 MiB.
 *
 * A texel is 52 units of deck at the equator against a field whose finest
 * octave is 112 units long, and the texture is read bilinearly. Measured
 * headless on 2026-09-30 over 60,000 directions, the lookup against the exact
 * field: a mean error in the shade's cover of 0.004, none over 0.25, and 0.4%
 * of the directions on the other side of the cut — all of them within a few
 * units of it. Half the size is a quarter of the bake (0.15 s) at three times
 * the error, with the texels showing as facets along an edge seen from above.
 */
export const CLOUD_MAP_WIDTH = 2048;
export const CLOUD_MAP_HEIGHT = 1024;

/**
 * The span of the field a byte holds. The shade reads the field only round
 * the cut (`THRESHOLD`, 0.575) and as deep as a bank gets (`DEPTH_SPAN` past
 * it, 0.735), so a byte spread over 0.40 to 0.80 is 0.0016 of the field a
 * step, thirty steps across the soft edge below; everything outside it is
 * clear sky or a bank's heart, and clamps.
 */
export const CLOUD_MAP_LOW = 0.4;
export const CLOUD_MAP_HIGH = 0.8;

/**
 * The shade's soft edge, in the field's units either side of the cut: from
 * `SHADE_EDGE_OUT` under it to `SHADE_EDGE_IN` over it. Over a real bank's
 * edge that is about fifty units of ground (32 to 143, the median 54, over
 * 1,500 crossings on 2026-09-30) — a cloud's shadow has no hard edge, and
 * this one hides the difference between the field's smooth contour and the
 * lumpy row of puffs drawn along it — and it leans outward, because the
 * puffs' rims reach past the cut (7% of the open sky is under a rim,
 * `clouds.ts`): at the cut itself the cover is 0.78.
 *
 * It was twice as wide at first (0.035 and 0.015, a hundred units), and on the
 * ground that read as no edge at all: a bank's shadow came in over the whole
 * width of a view as a change in the weather, where the eye wants a line to
 * see a shadow by. Narrower than this and the bake's texels start to show in
 * the edge's line (a 0.25 error in the cover at 0.3% of the planet, against
 * 0.04% here).
 */
export const SHADE_EDGE_OUT = 0.02;
export const SHADE_EDGE_IN = 0.008;

/**
 * How much of the sun's term a cloud takes: `SHADE_RIM` at a bank's edge,
 * rising to `SHADE_HEART` at its deepest (depth 1, `DEPTH_SPAN` past the
 * cut), which is the raining middle the deck builds as a tower.
 *
 * **Measured against the cast shadow's 0.65** (`SHADOW_INTENSITY` in
 * `sun.ts`), which is the same multiply on the same term: a shadow keeps a
 * third of the sun plus all of the sky's fill, which is why it is a cool paint
 * and not a black. A cloud's rim is lighter than that and its heart about as
 * dark — a thin cloud is a veil, a thunderhead is a shadow the size of a town
 * — and both stay lighter than the shadow plus the rim together, because under
 * a cloud the cast shadow is gone (`cloudLightsChunk`). Tuned by eye on the
 * CPU renderer at Palma, Paris and London on 2026-09-30: much darker and the
 * patches read as dirt on the land's own painted blots (`atlasPatches`), much
 * lighter and they read as a haze nobody could place.
 */
export const SHADE_RIM = 0.45;
export const SHADE_HEART = 0.66;

/**
 * The sun's elevation the shade fades in over, as sines: from 1.15 degrees
 * under the horizon — the light's own terminator is soft (`theme.ts`'s ramp
 * wraps past it) — to 4 degrees over it. Lower than that the ray to the deck
 * runs up to 5,745 units and a bank's shadow is a smear across a province, on
 * a light that has already gone orange and weak.
 */
export const SHADE_SUN: readonly [number, number] = [Math.sin((-1.15 * Math.PI) / 180), Math.sin((4 * Math.PI) / 180)];

/**
 * The shell the shade is cast into, in units from the planet's radius: from
 * the deepest drawn sea floor to well under the deck's lowest belly (870).
 * Above it a thing is in the cloud or over it — an airliner at its cruise of
 * 1,700 — and below it is not on the planet at all: the traveller's card and
 * the review sheets draw the cast round the origin, with lights of their own.
 * The edges are `SHADE_BAND_SOFT` wide.
 */
export const SHADE_BAND: readonly [number, number] = [-400, 880];
const SHADE_BAND_SOFT = 20;

/** How long the shade takes to come in once its map is uploaded, ms. */
export const SHADE_FADE_MS = 2000;

/**
 * Degrees of arc past the view's own horizon a sunlit point may still be
 * drawn from: mountains stand up to 620 units over the sea and are seen past
 * the horizon of the sea-level sphere. Only for `updateCloudShade`'s night
 * test, which is a shortcut: the pixels' own gate (`SHADE_SUN`) is the rule.
 */
const NIGHT_MARGIN = (6 * Math.PI) / 180;

/**
 * What the weather takes off the sun everywhere at once, at `sunCut` 1. The
 * number `sun.ts` applies (`1 - SUN_CUT * sunCut`), here so that `sunScale`
 * and the sky cannot disagree about it.
 */
export const SUN_CUT = 0.72;

/**
 * What a bank's rain and its storm still take off the sun everywhere, once
 * the bank's own shade is drawn per pixel. The gloom of a downpour is more
 * than the deck's one layer — rain curtains, the anvil over the deck — and a
 * little of it stays global, sized so that under the heart of a real storm
 * the sun's term comes out where the old global cut put it: 0.28, see
 * `sunScale` and `pnpm weather`.
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
 * coordinates: longitude across from -180, latitude up from -90 — the GLSL's
 * `atan(-z, x)` and `asin(y)`, through `sphere.ts`'s one conversion.
 */
export function cloudMapUV(x: number, y: number, z: number, out: { u: number; v: number }): { u: number; v: number } {
  const length = Math.hypot(x, y, z) || 1;
  out.u = (lonOf(x, z) + 180) / 360;
  out.v = (latOf(y / length) + 90) / 180;
  return out;
}

const lookup = { u: 0, v: 0 };
/**
 * The map read as the GPU reads it — bilinear, repeating across the
 * antimeridian and clamped at the poles — at a direction of the deck's frame,
 * as a field value. For the checks, which hold the bake to the field.
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
 * `(deck - r)(deck + r)` is the one term that must not be the difference of
 * two squares of sixteen thousand, which in the shader's single precision
 * loses the whole of a thousand-unit gap to rounding.
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
 * the ray to the sun at a world point — its cover times the gates and the
 * strength in x, the depth into the bank in y. Every constant but the deck's
 * own is a literal; the deck's arrive in `atlasCloudDeck` (planet radius, deck
 * radius, cut, depth span) with the map, because this file may not import
 * them (see the header). `ATLAS_CLOUD_SHADE` is defined for the code that
 * wants the shade outside the light loop — the sea's glitter, the varnish's
 * highlight — and has to compile without it on a material that did not opt in.
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
 * three's `lights_fragment_begin` with the cloud in it, derived from the
 * chunk itself by exact replacement — so it is r182's text and nothing else,
 * and **it throws if the text has moved**, which is what a three upgrade that
 * rewrote the loop must do rather than draw the world without its shade. `pnpm
 * weather` asserts it headless.
 *
 * Three edits, all in the directional block:
 *
 * - the cloud at this pixel, once, before the loop: `atlasCloud`, declared at
 *   the top of the chunk rather than in the loop, which three unrolls — the
 *   copies would declare it once a light (`gloss.ts` has the same note);
 * - the cast shadow mixed out under it, for light 0 only (after unrolling,
 *   `0 == 0 ? atlasCloud.x : 0.0`, which the compiler folds);
 * - the sun's colour scaled by `1 - cover * darkness`, before `RE_Direct`, so
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

/** The declarations, for the checks' lint. */
export const CLOUD_SHADE_GLSL = DECLARATIONS;

// ---------------------------------------------------------------------------
// The shared uniforms
// ---------------------------------------------------------------------------

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
 * **Before anything clones it.** `Material.copy` leaves the hooks behind, so
 * every clone in this world chains its source's hook and key by hand — the
 * fade twins (`fade.ts`), `woodMaterial`, the player's inkless copy — and a
 * clone made before this call would chain the unshaded ones.
 *
 * `|clouds` on the key, over the base's own: three keys a program on its
 * parameters plus that string, and a material whose key did not change would
 * be handed the program of the one it was before. A base on the default key,
 * which is the text of its hook, has that text taken now — after this call
 * the hook is this one's, the same text for every material wrapped.
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
      // A hook upstream replaced one of the two anchors: the material draws
      // as it did, unshaded, and says so once.
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

/** Whether `material` was opted in, for the checks. */
export const isShadedByClouds = (material: THREE.Material): boolean => shaded.has(material);

// ---------------------------------------------------------------------------
// The state, a frame at a time
// ---------------------------------------------------------------------------

export interface CloudShadeState {
  /** The console's A/B (`atlas.clouds.shadows`), 0 to 1. 0 is the world as it was. */
  shadows: number;
  /**
   * The weather's say, 0 or 1, written by `weather-view.ts`: 0 under a forced
   * sky or with the weather off, which keep the old global cut (see `share`).
   */
  weather: number;
  /**
   * How much of a bank's darkening is being drawn per pixel rather than by the
   * old cut of the whole world's sun: the switch, the fade-in and the weather.
   * `weather-view.ts` blends the sun's cut on it (`sunCutOf`), so the two
   * never both darken the same ground.
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
  // No mipmaps, so the `atan` seam at the antimeridian, where the derivative
  // of `u` is a whole turn, picks no level: there is only one.
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
 * strength — the share (see `CloudShadeState`), the menu's veil, and zero when
 * nothing the camera can see has the sun up, which is the branch every pixel
 * then takes for free.
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

// ---------------------------------------------------------------------------
// The sun's budget
// ---------------------------------------------------------------------------

/**
 * The cut of the whole world's sun (`Sky.weather.sunCut`), from the weather
 * where the player stands.
 *
 * The old cut was `overcast` — cover, rain and storm together — and it took up
 * to `SUN_CUT` of the sun off every surface on the screen whenever a bank was
 * overhead, sunlit hills a league off included. With the shade drawn, the bank
 * does its own darkening, per pixel and where its shadow actually falls, and
 * the global cut keeps only a little of the rain's and the storm's gloom
 * (`BANK_CUT_RAIN`). `share` blends from the one to the other — 0 before the
 * map, under a forced sky, with the weather or the shade off; 1 once the shade
 * is in — so the ground is darkened by one of the two and never by both.
 * `above` is the weather's own fade through the deck.
 */
export function sunCutOf(overcast: number, precipitation: number, storm: number, above: number, share: number): number {
  const bank = clamp01(precipitation * BANK_CUT_RAIN + storm * BANK_CUT_STORM) * (1 - above);
  return overcast + (bank - overcast) * clamp01(share);
}

/**
 * The share of the sun's term that reaches a surface: the global cut and the
 * cloud over it, `cover` 0 to 1 (strength included) at `depth` into its bank.
 * The number `pnpm weather` holds to the weather presets, so that a storm
 * overhead is the dark it was before the shade and never that dark twice.
 */
export function sunScale(sunCut: number, cover: number, depth: number): number {
  return (1 - SUN_CUT * clamp01(sunCut)) * (1 - clamp01(cover) * shadeDarkness(depth));
}
