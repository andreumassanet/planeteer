import * as THREE from 'three';
import { GROUND_MARKS_GLSL, LUSH_GLSL, bindGroundWeather, groundWeatherChunk, groundWeatherGLSL } from './globe.ts';
import { bindNearLights, nearLightsChunk, nearLightsGLSL } from './lights.ts';
import { rngFrom } from './scenery/random.ts';
import type { Rng } from './scenery/random.ts';
import { LEAF_ATLAS } from './scenery/tree-forms.ts';
import { createToonRamp } from './theme.ts';
import { WIND, WIND_GLSL } from './wind.ts';

/**
 * The near wood's two materials and the texture its leaves are cut from.
 *
 * **The leaves are cards**: quads with a painted cluster of leaves on them,
 * alpha-tested, both faces drawn, lit by the crown's normal rather than their
 * own (`tree-forms.ts` puts it on every corner). The painting is done here, at
 * runtime, on a canvas — bezier leaves in greys, a needle bough, a palm frond —
 * so there is no asset to ship and the colour is the vertex's: the region's
 * green, shaded by where in the crown the card hangs.
 *
 * **The light is the reference's**: the diffuse ramp read with a wrap, so a
 * card half turned from the sun is not in shade; the light through a leaf seen
 * against the sun, strongest at the crown's rim where the leaves are thinnest;
 * and a little of the sky at a grazing angle. The land's green (`atlasLush`),
 * the ground's weather — snow lies on a crown's top as on a roof — and the
 * near lamps and headlights at night, like the grass under it.
 *
 * **The wind is the grass's** (`wind.ts`): one clock, one strength, one
 * direction and the same gust fronts. A tree bends from its root as the square
 * of the height (the trunk, its limbs and its leaves together, so a card never
 * leaves its twig), sways across the wind on a slower beat, and its cards
 * flutter along their normals and flick with the gusts. The wood's material
 * moves the same way, and so do both shadows (`leafDepthMaterial`,
 * `woodDepthMaterial`): a caster displaced in the light's pass as in the
 * camera's, or the crown's shadow on itself would swim.
 *
 * What a vertex needs is one attribute, `aWind`, four bytes: how high it is
 * over its plant's root as a share of `WIND_REACH`, the plant's phase, how
 * free it is to flutter (0 on the wood), and a number per card.
 */

/** The height `aWind.x` is a share of: the tallest plant a near tile draws, with room. */
export const WIND_REACH = 48;
/** Units of sideways give per unit of height squared: the reference's 0.0035 a square metre, in units. */
const SWAY = 0.0023;
/** How far a leaf flutters, in units per unit of the reference's metres. */
const FLUTTER = 1.3;
/** Wrap on the leaves' diffuse term: a card half turned from the sun still takes it. */
const WRAP = 0.55;
/** The light through a leaf seen against the sun, times its own colour: the reference's `#f4f08a` at 1.2. */
const TRANSLUCENT = new THREE.Color('#f4f08a').multiplyScalar(1.2);
/** The atlas's side, in texels. */
const ATLAS_SIZE = 1024;

// ---------------------------------------------------------------------------
// The atlas
// ---------------------------------------------------------------------------

/**
 * One leaf, drawn along +x from the origin: two bezier halves meeting at the
 * tip, filled in a grey, and a paler midrib. `bulge` fattens it.
 */
function leaf(g: CanvasRenderingContext2D, length: number, width: number, grey: number, bulge: number): void {
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(length * 0.25, -width * (0.9 + bulge), length * (0.7 + bulge * 0.2), -width * 0.8, length, 0);
  g.bezierCurveTo(length * (0.7 + bulge * 0.2), width * 0.8, length * 0.25, width * (0.9 + bulge), 0, 0);
  const v = Math.round(Math.max(0, Math.min(1, grey)) * 255);
  g.fillStyle = `rgb(${v},${v},${v})`;
  g.fill();
  const rib = Math.round(Math.max(0, Math.min(1, grey * 1.1 + 0.04)) * 255);
  g.strokeStyle = `rgba(${rib},${rib},${rib},0.55)`;
  g.lineWidth = Math.max(1, width * 0.12);
  g.beginPath();
  g.moveTo(length * 0.08, 0);
  g.lineTo(length * 0.85, 0);
  g.stroke();
}

/**
 * A round cluster of leaves in a square of `size` at `(x, y)`: `count` leaves
 * scattered in a disc a little over a third of the square, pointing outward
 * with a twist, lighter out and up-left (where the painter's light is), the
 * deep ones drawn first. The greys run from 0.78 to 1 — see `LEAF_TEXTURE_MEAN`.
 */
function cluster(g: CanvasRenderingContext2D, rng: Rng, x: number, y: number, size: number, count: number, length: number, width: number, bulge: number): void {
  const cx = x + size / 2;
  const cy = y + size / 2;
  const spread = size * 0.36;
  const leaves: { x: number; y: number; a: number; l: number; grey: number; d: number }[] = [];
  for (let i = 0; i < count; i++) {
    const d = rng.unit() ** 0.6;
    const a = rng.unit() * Math.PI * 2;
    const lit = 0.5 - 0.5 * (Math.cos(a) * 0.35 + Math.sin(a) * 0.65) * d;
    const grey = 0.78 + 0.22 * Math.min(1, Math.max(0, 0.35 + 0.35 * d + 0.3 * lit + (rng.unit() - 0.5) * 0.25));
    leaves.push({
      x: cx + Math.cos(a) * d * spread,
      y: cy + Math.sin(a) * d * spread,
      a: a + (rng.unit() - 0.5) * 1.3 * (0.4 + d),
      l: length * (0.7 + rng.unit() * 0.6) * (0.8 + 0.3 * d),
      grey,
      d,
    });
  }
  leaves.sort((p, q) => p.d - q.d);
  for (const one of leaves) {
    g.save();
    g.translate(one.x, one.y);
    g.rotate(one.a);
    leaf(g, one.l, width * (one.l / length), one.grey, bulge);
    g.restore();
  }
}

/**
 * A frond in a square of `size`: a stem up the middle from the bottom edge to
 * the top, and `pairs` leaflets either side, longest near the base.
 */
function frond(g: CanvasRenderingContext2D, rng: Rng, x: number, y: number, size: number, pairs: number, length: number, width: number, angle: number, grey: number): void {
  const cx = x + size / 2;
  const bottom = y + size * 0.97;
  const top = y + size * 0.04;
  const stem = Math.round(grey * 210);
  g.strokeStyle = `rgb(${stem},${stem},${stem})`;
  g.lineWidth = size * 0.014;
  g.beginPath();
  g.moveTo(cx, bottom);
  g.lineTo(cx, top);
  g.stroke();
  for (let i = 0; i < pairs; i++) {
    const t = (i + 0.5) / pairs;
    const at = bottom + (top - bottom) * t;
    const l = length * (1 - t * 0.85) * (0.72 + 0.28 * Math.min(1, t * 4)) * (0.88 + rng.unit() * 0.24);
    for (const side of [-1, 1]) {
      g.save();
      g.translate(cx, at);
      g.rotate(side < 0 ? Math.PI + angle : -angle);
      leaf(g, l, width * (0.8 + 0.3 * (1 - t)), grey + (rng.unit() - 0.5) * 0.14 + (1 - t) * 0.05, -0.3);
      g.restore();
    }
  }
}

/**
 * A bough of needles in a square of `size`: a stem up the middle, side twigs
 * off it, and short needles in pairs all along both, angled toward the tip.
 */
function bough(g: CanvasRenderingContext2D, rng: Rng, x: number, y: number, size: number): void {
  const cx = x + size / 2;
  const bottom = y + size * 0.97;
  const top = y + size * 0.05;
  const twigs: [number, number, number, number, number][] = [[cx, bottom, cx, top, 1]];
  for (let i = 0; i < 9; i++) {
    const t = 0.12 + (i / 9) * 0.78;
    const ay = bottom + (top - bottom) * t;
    const side = i % 2 === 0 ? -1 : 1;
    const reach = size * 0.34 * (1 - t * 0.7) * (0.85 + rng.unit() * 0.3);
    twigs.push([cx, ay, cx + side * reach, ay - reach * (0.55 + rng.unit() * 0.3), 0.7]);
  }
  for (const [x0, y0, x1, y1, weight] of twigs) {
    const stem = Math.round(0.62 * 255);
    g.strokeStyle = `rgb(${stem},${stem},${stem})`;
    g.lineWidth = size * 0.012 * weight;
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
    const along = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.floor(along / (size * 0.012));
    const heading = Math.atan2(y1 - y0, x1 - x0);
    g.lineCap = 'round';
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const px = x0 + (x1 - x0) * t;
      const py = y0 + (y1 - y0) * t;
      const needle = size * 0.075 * weight * (1 - t * 0.5) * (0.8 + rng.unit() * 0.4);
      for (const side of [-1, 1]) {
        const a = heading + side * (0.75 + rng.unit() * 0.3);
        const grey = 0.78 + 0.22 * Math.min(1, Math.max(0, 0.35 + 0.4 * t + (rng.unit() - 0.5) * 0.35));
        const v = Math.round(grey * 255);
        g.strokeStyle = `rgb(${v},${v},${v})`;
        g.lineWidth = Math.max(1.5, size * 0.007);
        g.beginPath();
        g.moveTo(px, py);
        g.lineTo(px + Math.cos(a) * needle, py + Math.sin(a) * needle);
        g.stroke();
      }
    }
  }
}

/** A 1x1 white texel: the atlas where there is no canvas, as in the headless checks. */
function blankAtlas(): THREE.Texture {
  const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  texture.needsUpdate = true;
  return texture;
}

let atlas: THREE.Texture | null = null;

/**
 * The leaf atlas, painted once on first ask: four quadrants, where
 * `LEAF_ATLAS` says. Read back off the canvas and handed over as data, with
 * every transparent texel's grey filled from the leaves', because a canvas
 * keeps its colours premultiplied and a clear texel is black: filtered and
 * mipmapped, black round every leaf is a dark rim round every card.
 */
export function leafAtlas(): THREE.Texture {
  if (atlas !== null) return atlas;
  if (typeof document === 'undefined') {
    atlas = blankAtlas();
    return atlas;
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = ATLAS_SIZE;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  if (g === null) {
    atlas = blankAtlas();
    return atlas;
  }
  const half = ATLAS_SIZE / 2;
  const rng = rngFrom('leaf-atlas');
  // The rects are in texture space, v up; the canvas is y down.
  const at = (rect: readonly number[]): [number, number] => [rect[0]! * ATLAS_SIZE, (1 - rect[3]!) * ATLAS_SIZE];
  const [bx, by] = at(LEAF_ATLAS.broadleaf);
  cluster(g, rng.fork('broadleaf'), bx, by, half, 330, half * 0.085, half * 0.034, 0.1);
  const [fx, fy] = at(LEAF_ATLAS.fine);
  cluster(g, rng.fork('fine'), fx, fy, half, 420, half * 0.058, half * 0.028, 0.35);
  const [nx, ny] = at(LEAF_ATLAS.needles);
  bough(g, rng.fork('needles'), nx, ny, half);
  const [px, py] = at(LEAF_ATLAS.frond);
  frond(g, rng.fork('frond'), px, py, half, 28, half * 0.4, half * 0.036, 0.55, 0.88);

  const image = g.getImageData(0, 0, ATLAS_SIZE, ATLAS_SIZE).data;
  const data = new Uint8Array(ATLAS_SIZE * ATLAS_SIZE * 4);
  // A mid grey under the clear texels, the leaves' own, and the rows turned
  // over so v runs up as the rects say.
  const fill = Math.round(0.8 * 255);
  for (let row = 0; row < ATLAS_SIZE; row++) {
    const from = row * ATLAS_SIZE * 4;
    const to = (ATLAS_SIZE - 1 - row) * ATLAS_SIZE * 4;
    for (let i = 0; i < ATLAS_SIZE * 4; i += 4) {
      const alpha = image[from + i + 3]!;
      if (alpha === 0) {
        data[to + i] = data[to + i + 1] = data[to + i + 2] = fill;
        data[to + i + 3] = 0;
      } else {
        data[to + i] = image[from + i]!;
        data[to + i + 1] = image[from + i + 1]!;
        data[to + i + 2] = image[from + i + 2]!;
        data[to + i + 3] = alpha;
      }
    }
  }
  const texture = new THREE.DataTexture(data, ATLAS_SIZE, ATLAS_SIZE);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  atlas = texture;
  return texture;
}

// ---------------------------------------------------------------------------
// The shaders
// ---------------------------------------------------------------------------

/**
 * The wind on a vertex, in the mesh's own space — a tile's tangent frame, y
 * up at the tile's middle, which a plant's own upright is within a fraction of
 * a degree of on a near tile. `normal` is the attribute every program has.
 */
const WIND_VERTEX = /* glsl */ `
attribute vec4 aWind;
${WIND_GLSL}
vec3 atlasWindOffset(vec3 p, vec3 n) {
  float h = aWind.x * ${WIND_REACH.toFixed(1)};
  if (h <= 0.0) return vec3(0.0);
  float phase = aWind.y * 6.2831853;
  float ws = uWindStrength;
  float gust = windGust((modelMatrix * vec4(p, 1.0)).xyz);
  // World to the mesh's own space: its matrix is a rotation and a move.
  vec3 wd = (vec4(uWindWorld, 0.0) * modelMatrix).xyz;
  wd.y = 0.0;
  wd = dot(wd, wd) > 1e-8 ? normalize(wd) : vec3(1.0, 0.0, 0.0);
  vec3 across = vec3(-wd.z, 0.0, wd.x);
  float k = h * h * ${SWAY.toFixed(5)};
  float beat = sin(uTime * 1.05 + phase) * 0.6 + sin(uTime * 2.2 + phase * 1.7) * 0.4;
  vec3 off = wd * k * (ws * (0.45 + gust * 1.1) + beat * (0.1 + 0.3 * ws));
  off += across * k * sin(uTime * 0.83 + phase * 2.1) * (0.05 + 0.12 * ws);
  float r = aWind.w;
  off += n * sin(uTime * (2.6 + r * 3.5) + r * 40.0 + phase) * (0.02 + 0.07 * ws) * aWind.z * ${FLUTTER.toFixed(2)};
  off += wd * aWind.z * gust * ws * 0.1 * ${FLUTTER.toFixed(2)} * sin(uTime * 4.5 + r * 20.0);
  // A bent stem is no longer: what goes sideways comes down a little.
  off.y -= 0.5 * dot(off.xz, off.xz) / max(h, 1.0);
  return off;
}
`;

/** The diffuse ramp read with a wrap. */
const gradientGLSL = (wrap: number): string => /* glsl */ `
#ifdef USE_GRADIENTMAP
  uniform sampler2D gradientMap;
#endif
vec3 getGradientIrradiance(vec3 normal, vec3 lightDirection) {
  float dotNL = (dot(normal, lightDirection) + ${wrap.toFixed(2)}) / ${(1 + wrap).toFixed(2)};
  vec2 coord = vec2(dotNL * 0.5 + 0.5, 0.0);
  #ifdef USE_GRADIENTMAP
    return vec3(texture2D(gradientMap, coord).r);
  #else
    return vec3(clamp(dotNL, 0.0, 1.0));
  #endif
}
`;

/**
 * The toon model's terms, plus the light through a leaf seen against the sun:
 * after the shadow, which is already off `directLight.color`, and strongest
 * where the leaves are thinnest, at the rim (`vLeafRim`).
 */
const LEAF_LIGHTS = /* glsl */ `
varying vec3 vViewPosition;
varying float vLeafRim;
uniform vec3 uLeafTranslucency;
struct ToonMaterial {
  vec3 diffuseColor;
};
void RE_Direct_Toon(const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight) {
  vec3 irradiance = getGradientIrradiance(geometryNormal, directLight.direction) * directLight.color;
  reflectedLight.directDiffuse += irradiance * BRDF_Lambert(material.diffuseColor);
  float back = clamp(dot(-geometryViewDir, directLight.direction), 0.0, 1.0);
  float through = (pow(back, 3.0) * 0.85 + 0.15 * clamp(-dot(geometryNormal, directLight.direction), 0.0, 1.0)) * (0.35 + 0.65 * vLeafRim);
  reflectedLight.directDiffuse += directLight.color * through * BRDF_Lambert(material.diffuseColor * uLeafTranslucency);
}
void RE_IndirectDiffuse_Toon(const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight) {
  reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert(material.diffuseColor);
}
#define RE_Direct RE_Direct_Toon
#define RE_IndirectDiffuse RE_IndirectDiffuse_Toon
`;

/**
 * A card's alpha: raised with the mip level, so a crown does not thin to
 * lace as it recedes (a coarser mip averages leaf and air), and thinned where
 * the card is seen edge-on, where the texture smears into streaks.
 */
const leafAlphaGLSL = (edge: boolean): string => /* glsl */ `
#ifdef USE_MAP
{
  vec2 leafDx = dFdx(vMapUv * ${ATLAS_SIZE.toFixed(1)});
  vec2 leafDy = dFdy(vMapUv * ${ATLAS_SIZE.toFixed(1)});
  float leafMip = max(0.0, 0.5 * log2(max(dot(leafDx, leafDx), dot(leafDy, leafDy))));
  diffuseColor.a *= 1.0 + min(leafMip, 3.0) * 0.3;
  ${edge ? `vec3 leafFace = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
  diffuseColor.a *= smoothstep(0.08, 0.4, abs(dot(leafFace, normalize(vViewPosition))));` : ''}
}
#endif
`;

// ---------------------------------------------------------------------------
// The materials
// ---------------------------------------------------------------------------

/**
 * The leaves: every near tile's cards on the planet in one material, the
 * region's green on the vertices and the grey leaf on the atlas. No ink: a pen
 * round every card is a wood of black hair.
 */
export function leafMaterial(): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({
    vertexColors: true,
    map: leafAtlas(),
    alphaTest: 0.5,
    side: THREE.DoubleSide,
    gradientMap: createToonRamp(4),
  });
  material.userData.outlineParameters = { visible: false };
  const translucency = { value: new THREE.Vector3(TRANSLUCENT.r, TRANSLUCENT.g, TRANSLUCENT.b) };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, WIND);
    shader.uniforms['uLeafTranslucency'] = translucency;
    bindGroundWeather(shader.uniforms);
    bindNearLights(shader.uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${WIND_VERTEX}\nvarying vec3 vLeafWorld;\nvarying float vLeafRim;`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed += atlasWindOffset(transformed, normal);')
      .replace('#include <project_vertex>', '#include <project_vertex>\n  vLeafWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\n  vLeafRim = aWind.z;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vLeafWorld;\n${LUSH_GLSL}\n${GROUND_MARKS_GLSL}\n${groundWeatherGLSL()}\n${nearLightsGLSL()}`)
      .replace('#include <gradientmap_pars_fragment>', gradientGLSL(WRAP))
      .replace('#include <lights_toon_pars_fragment>', LEAF_LIGHTS)
      .replace('#include <map_fragment>', `#include <map_fragment>\n${leafAlphaGLSL(true)}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>\n  diffuseColor.rgb = atlasLush(diffuseColor.rgb);\n  ${groundWeatherChunk('vLeafWorld')}`,
      )
      // The crown's normal on both faces: three turns a back face's round,
      // and the far side of every card would step to the shadow band.
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n  normal = normalize(vNormal);\n  nonPerturbedNormal = normal;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${nearLightsChunk('vLeafWorld')}`)
      .replace(
        '#include <lights_fragment_end>',
        // A little of the sky at a grazing angle: a crown's silhouette is lit.
        '#include <lights_fragment_end>\n  reflectedLight.indirectDiffuse *= 1.0 + 0.7 * pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.5);',
      );
  };
  material.customProgramCacheKey = () => 'atlas-leaves';
  return material;
}

/**
 * The near tiles' solid buffer — trunks and limbs, and whatever else stands
 * on the tile, the boulders and the countryside's pieces — as the far
 * tiles' material (`base`, cloned, its colours and its green kept) with the
 * wind on it. Only what carries a height in `aWind` moves.
 */
export function woodMaterial(base: THREE.MeshToonMaterial): THREE.MeshToonMaterial {
  const material = base.clone();
  material.userData.outlineParameters = base.userData.outlineParameters;
  const inner = base.onBeforeCompile.bind(base);
  material.onBeforeCompile = (shader, renderer) => {
    inner(shader, renderer);
    Object.assign(shader.uniforms, WIND);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${WIND_VERTEX}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed += atlasWindOffset(transformed, normal);');
  };
  const key = base.customProgramCacheKey();
  material.customProgramCacheKey = () => `${key}|wind`;
  return material;
}

/**
 * A caster's depth in the sun's pass, moved by the same wind: the leaves'
 * (their map and alpha test are handed over by three from the drawn
 * material) and the wood's.
 */
function windDepth(key: string, leaves: boolean): THREE.MeshDepthMaterial {
  const material = new THREE.MeshDepthMaterial();
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, WIND);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${WIND_VERTEX}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed += atlasWindOffset(transformed, normal);');
    if (leaves) {
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>\n${leafAlphaGLSL(false)}`);
    }
  };
  material.customProgramCacheKey = () => key;
  return material;
}

let leafDepth: THREE.MeshDepthMaterial | null = null;
let woodDepth: THREE.MeshDepthMaterial | null = null;

export function leafDepthMaterial(): THREE.MeshDepthMaterial {
  leafDepth ??= windDepth('atlas-leaves-depth', true);
  return leafDepth;
}

export function woodDepthMaterial(): THREE.MeshDepthMaterial {
  woodDepth ??= windDepth('atlas-wood-depth', false);
  return woodDepth;
}
