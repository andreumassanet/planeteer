import * as THREE from 'three';
import { GROUND_MARKS_GLSL, LUSH_GLSL, PLANET_RADIUS, bindGroundWeather, groundWeatherChunk, groundWeatherGLSL } from './globe.ts';
import { bindNearLights, nearLightsChunk, nearLightsGLSL } from './lights.ts';
import { SCENERY_SCALE, STATURE } from './stature.ts';
import { createToonRamp } from './theme.ts';
import { latOf, lonOf } from './sphere.ts';
import { detail, detailBuild, mayBuild } from './view.ts';
import type { Player } from './player.ts';
import type { GrassGround, GrassSite } from './vegetation.ts';
import { proxyOf } from './warm.ts';
import { WIND, setWind } from './wind.ts';

/**
 * The grass under your feet: a knee-high carpet of single blades round the
 * camera, in clumps, bent by the wind and parted by the player.
 *
 * **No blade is stored anywhere.** Each ring of blades is one draw of an
 * instanced strip with no per-instance buffer at all: the vertex stage takes
 * a blade's root from `gl_InstanceID` on a square grid laid round the camera,
 * snapped to the grid's own spacing so a blade stays where it grew as the
 * camera moves, and every property it has — where in its cell, how tall, which
 * way it faces, which clump it belongs to — is a hash of its cell. So a ring
 * costs its vertex invocations and nothing else: no build, no upload, no
 * memory but a few uniforms, and the same field of grass for every client.
 * Blades past a ring's radius (each with a fade radius of its own, so the edge
 * is a thinning and not a line) and off the screen are collapsed to nothing
 * before anything else is worked out. **The rings overlap on purpose**: the
 * finest is dense and short-lived, and each coarser one is sparser, wider and
 * faces the camera more, so the carpet thins with distance by what the coarse
 * rings add rather than by a seam where one hands over to the next.
 *
 * **Where the ground is and what grows on it is a field baked round the
 * camera** (`Field`): the drawn land's height and whether, how thick, in what
 * colour and how dry the grass is there — `vegetation.ts`'s `GrassGround`,
 * which holds the refusals (the shore, monuments, carriageways, the
 * countryside's fields, a town's paving) that sowed the sward before this.
 * Two fields: a fine one round the player, so a verge stops at a kerb and a
 * lawn at its path, and a coarse one to the last ring. Each is a torus in
 * texel indices, so following the camera costs the row or column it enters
 * and not the whole field again; a line is baked over as many frames as it
 * takes, inside the frame's building allowance (`mayBuild`), and put on the
 * screen only whole.
 *
 * **On a sphere, in a tangent frame.** The blades are worked out in the
 * tangent plane of an anchor near the camera, in the frame every tile and town
 * uses (`across`, `up`, `north`: a proper rotation), and each root is dropped
 * onto the sphere analytically, so a vertex is a few hundred units from the
 * mesh's own origin and float32 holds it to a thousandth. A field's texel is a
 * point of that plane taken to the sphere the same way, so what the bake asked
 * and where the blade stands are one point. The anchor moves only when the
 * camera has gone `FRAME_REACH` from it; a second layer is baked round the new
 * anchor and the two cross-fade (`APPEAR_SECONDS`).
 *
 * **In reference metres.** The rings, the blade and the wind were measured on
 * a figure of life size, and a person here is drawn `STATURE` times life size
 * on the world's `SCENERY_SCALE`: so the vertex stage works in metres of that
 * figure (`METRE`, units a metre) and converts at the ground and at the end,
 * which keeps the grass at the height of the knee of the person walking in it
 * whatever either constant becomes.
 *
 * It has no ink (`outlineParameters.visible`): a pen round every blade is a
 * field of black hair. It takes the shadows, the fog, the ground's weather and
 * the near lamps like the land it grows on, and casts no shadow.
 */

/** Units a metre of the figure the grass was measured against: a person is `STATURE` times life size. */
export const METRE = SCENERY_SCALE * STATURE;

/** One ring of blades, in reference metres. */
interface Ring {
  /** Between two roots on the ring's grid. */
  spacing: number;
  /** Where its last blades go, from the camera along the ground. */
  radius: number;
  /** Rows of the strip under its tip. */
  segments: number;
  /** A blade's width at its widest. */
  width: number;
  /** How much a blade turns to face the camera, 0 to 1. */
  faceCamera: number;
}

/**
 * The rings a quality draws. A ring draws `(ceil(2 radius / spacing) + 1)^2`
 * instances whatever is culled: at `high` 68,121 + 68,121 + 67,081 + 60,516
 * (263,839), at `medium` 37,249 + 40,401 + 37,636 + 30,276 (145,562) and at
 * `low` 17,161 + 18,225 + 22,801 (58,187), most of them collapsed in the
 * vertex stage off the disc or off the screen. In units at `METRE` (2.154)
 * the high rings reach 28, 56, 116 and 237, the medium 26, 54, 108 and 205.
 */
const RINGS: Readonly<Record<GrassQuality, readonly Ring[]>> = {
  high: [
    { spacing: 0.1, radius: 13, segments: 5, width: 0.055, faceCamera: 0.25 },
    { spacing: 0.2, radius: 26, segments: 4, width: 0.085, faceCamera: 0.45 },
    { spacing: 0.42, radius: 54, segments: 3, width: 0.15, faceCamera: 0.8 },
    { spacing: 0.9, radius: 110, segments: 2, width: 0.28, faceCamera: 1 },
  ],
  medium: [
    { spacing: 0.125, radius: 12, segments: 4, width: 0.065, faceCamera: 0.3 },
    { spacing: 0.25, radius: 25, segments: 3, width: 0.1, faceCamera: 0.5 },
    { spacing: 0.52, radius: 50, segments: 3, width: 0.17, faceCamera: 0.85 },
    { spacing: 1.1, radius: 95, segments: 2, width: 0.3, faceCamera: 1 },
  ],
  low: [
    { spacing: 0.17, radius: 11, segments: 4, width: 0.08, faceCamera: 0.35 },
    { spacing: 0.36, radius: 24, segments: 3, width: 0.13, faceCamera: 0.6 },
    { spacing: 0.8, radius: 60, segments: 2, width: 0.26, faceCamera: 1 },
  ],
};

export type GrassQuality = 'low' | 'medium' | 'high';

/**
 * The quality the detail knob (`view.ts`) asks for: the knob starts at 0.5 on
 * every machine and moves itself by the frame rate within [0.25, 2].
 */
function qualityFor(knob: number): GrassQuality {
  return knob < 0.4 ? 'low' : knob < 0.9 ? 'medium' : 'high';
}

/**
 * The two fields, in units a texel and texels a side. The fine one is 192
 * units across round the camera, which holds the first two rings at every
 * quality with the camera up to 40 units off its middle; at 1.5 units a texel
 * a verge ends within a unit of its kerb, against a carriageway of 7.2. The
 * coarse one is 640 across, the widest ring's 237 each way and a lag to spare.
 */
const FINE = { texel: 1.5, size: 128 } as const;
const COARSE = { texel: 5, size: 128 } as const;
/**
 * How much further than the grass itself the bake keeps a texel off a made
 * surface, in texels: the lookup lays a blade up to half a texel past the hull
 * of the texels that grow (`grassLookup`), so half a texel is what keeps a
 * blade off the street: 0.75 units at the fine field and 2.5 at the coarse.
 */
export const GRASS_SPREAD = 0.5;
/** Both fields, for `pnpm seated`, which bakes them headless the way `bakeTexel` does. */
export const GRASS_FIELDS = { fine: FINE, coarse: COARSE } as const;
/** How far the camera may go from the frame's anchor before the grass is laid round a new one. */
const FRAME_REACH = 1500;
/** Past this in one frame the camera has jumped, and what stands round the old place is no use. */
const JUMP = 300;
/**
 * Milliseconds of the frame's building the bake may take; see `mayBuild`.
 *
 * Measured 2026-09-28 headless (Node, on a loaded machine), over Madison,
 * Burgos, the Kenyan highlands and Bavaria: a texel is 4.4 to 8.4 us, nearly
 * all of it `vegetation.ts`'s answer — so a layer's two fields, 32,768 texels, are 170 to 330 ms of work,
 * 65 to 120 frames at this allowance; and 100 units walked is 11,000 to
 * 16,000 texels entering, 33 to 93 ms, a third of a millisecond a frame at a
 * run. A browser is slower than Node at this; `atlas.grass.stats` says by how
 * much. Laying the fields under the folds of the ground (`vegetation.ts`,
 * 2026-09-28) cost a quarter more: 3.6 to 4.5 us a texel over the eight places
 * of `pnpm seated`, on the same loaded machine.
 */
const BUILD_MS = 2.5;
/** Texels between two looks at the clock. */
const TEXEL_BATCH = 16;
/** How long a layer takes to grow in, and the one it replaces to go. */
const APPEAR_SECONDS = 0.6;

/**
 * The colours, measured off the reference. The grass takes its middle from
 * the ground it grows in (the ground's colour, `groundColorAt`), and its root
 * and tip from these as a *lightness* against the reference's middle green —
 * 0.38 and 1.98 of it — with the tip pushed off grey (`TIP_SATURATION`) and
 * warmed (`TIP_WARM`): so a tundra's grass is the tundra's colour, darker at
 * the root and lit at the tip, and not a meadow's pasted on it. A ratio a
 * channel was tried first and is wrong on this palette: its greens carry three
 * times the reference's blue, and the tip's 2.6 on blue turned every lit tip
 * the colour of putty. The dry colours are absolute: straw is straw.
 */
const REFERENCE = {
  root: '#41692c',
  mid: '#74a244',
  tip: '#b9d66c',
  dryRoot: '#ab7f2c',
  dryTip: '#f4cf68',
  translucent: '#f2f59a',
} as const;
/** How far the tip is pushed off grey, and how much warmer it is: a lit blade is a yellower green, not a paler one. */
const TIP_SATURATION = 1.3;
/** The most the tip is lit over the middle. */
const TIP_GAIN_CAP = 1.45;
const TIP_WARM = [1.05, 1, 0.85] as const;
/** How much light a lit blade lets through from behind it, times its own colour. */
const TRANSLUCENCY = 1.4;
/** Wrap on the diffuse term: a blade half turned from the sun is not in shade. */
const WRAP = 0.6;

export interface GrassStats {
  /** Drawing at all this frame. */
  visible: boolean;
  quality: GrassQuality;
  rings: number;
  /** Instances drawn this frame, culled or not: what the vertex stage pays for. */
  instances: number;
  /** Where the frame is anchored, and how far the camera is from it. */
  anchor: string;
  fromAnchor: number;
  /** Texels a side and units a texel, fine and coarse. */
  fine: string;
  coarse: string;
  /** Whether each of the shown layer's fields is on the screen. */
  fineReady: boolean;
  coarseReady: boolean;
  /** Texels of work queued: fills, lines entering, and patches a changed floor dirtied. */
  pending: number;
  /** Texels baked since the world loaded, and the mean cost of one. */
  texels: number;
  microsecondsATexel: number;
  /** Milliseconds the last frame's bake took. */
  lastBakeMs: number;
  /** Milliseconds from a layer's start to both its fields standing, for the last one filled. */
  lastFillMs: number;
  /** Layers laid round a new anchor since the world loaded. */
  anchors: number;
}

export interface GrassFrame {
  camera: THREE.Camera;
  /** The player's feet on foot, a seated vehicle's origin (`Player.position`): what `press` is laid round. */
  player: THREE.Vector3;
  /**
   * What presses the grass apart round `player`, or null for nothing: a body
   * on foot (`length` and `width` 0, the blades parted round a point), a
   * vehicle whose wheels are on the ground (its footprint, half its length
   * along `forward` and half its width, units). Only as far as it is down in
   * the blades: the shader lifts the press off them with the height of
   * `player` over their ground, so a jump, a flight or a deck presses nothing.
   */
  press: { forward: THREE.Vector3; length: number; width: number } | null;
  /** The camera's height over the ground under it. */
  height: number;
  /** The wind where you stand: metres a second, and the bearing it comes *from* (`weather.here()`). */
  wind: { speed: number; from: number };
  /** Out of sight: under the sea, indoors. Nothing is drawn and nothing baked. */
  hidden: boolean;
}

export interface Grass {
  group: THREE.Group;
  stats: GrassStats;
  /** Off hides it and stops the bake. */
  enabled: boolean;
  /** A multiplier on every blade's height, 1 as measured. */
  height: number;
  proxies(): THREE.Object3D[];
  update(frame: GrassFrame): void;
  /** Throws every field away and bakes them again round the camera. */
  rebake(): void;
}

// ---------------------------------------------------------------------------
// The shader
// ---------------------------------------------------------------------------

const GRASS_VERTEX_PARS = /* glsl */ `
uniform vec4 uGRect;
uniform float uGSpacing;
uniform float uGRadius;
uniform float uGWidth;
uniform float uGFaceCam;
uniform float uGRing;
uniform float uGHeight;
uniform vec3 uCameraPos;
uniform vec3 uPlayerPos;
uniform vec4 uPushShape;
uniform float uPushOn;
uniform vec2 uWindDir;
uniform float uWindStrength;
uniform float uTime;
uniform float uAppear;
uniform highp sampler2D uFineData;
uniform sampler2D uFinePaint;
uniform vec4 uFineWindow;
uniform highp sampler2D uCoarseData;
uniform sampler2D uCoarsePaint;
uniform vec4 uCoarseWindow;
uniform float uGRootGain;
uniform float uGTipGain;
uniform vec3 uGDryRoot;
uniform vec3 uGDryTip;
varying vec3 vGrassRoot;
varying vec3 vGrassColour;
varying float vGrassT;
varying float vGrassAO;

const float GRASS_M = ${METRE.toFixed(6)};
const float GRASS_R = ${PLANET_RADIUS.toFixed(1)};

uvec4 grassPcg(uvec4 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.w; v.y += v.z * v.x; v.z += v.x * v.y; v.w += v.y * v.z;
  v ^= v >> 16u;
  v.x += v.y * v.w; v.y += v.z * v.x; v.z += v.x * v.y; v.w += v.y * v.z;
  return v;
}
// Four floats in [0, 1): the top 24 bits, which a float holds exactly.
vec4 vegRand4(uvec4 v) { return vec4(grassPcg(v) >> 8u) * (1.0 / 16777216.0); }
vec2 wbHash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float wbHash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float wbNoise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(wbHash12(i), wbHash12(i + vec2(1.0, 0.0)), u.x), mix(wbHash12(i + vec2(0.0, 1.0)), wbHash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
// Rolling gusts: bands square to the wind, broken by a noise, both carried
// downwind at a speed that rises with it. 0 to 1.
float vegGust(vec2 p) {
  vec2 q = p - uWindDir * uTime * (1.5 + uWindStrength * 5.0);
  float bands = 0.5 + 0.5 * sin(dot(q, uWindDir) * 0.22);
  float n = wbNoise2(q * 0.06);
  return smoothstep(0.45, 0.95, bands * 0.6 + n * 0.55);
}
${LUSH_GLSL}
vec3 grassSaturate(vec3 c, float s) {
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  return max(vec3(0.0), vec3(l) + (c - vec3(l)) * s);
}
int grassWrap(int i, int n) {
  int m = i % n;
  return m < 0 ? m + n : m;
}
// One field at a point of the tangent plane, in units: the ground's height
// over the sphere in units, the density, the dryness, the share of its height
// it stands at (\`fld.w\`, the paint's alpha), and the colour. -1 when
// the point is outside the field's window, 0 inside it where no grass grows,
// 1 where it does. A point grows only where the texels that grow hold at
// least half the weight: a blade then stands at most half a texel past the
// hull of the texels that grow, which the bake has kept half a texel further
// off every kerb, wall and riser than the grass itself keeps
// (\`GRASS_SPREAD\`). Its height is laid between every texel whose ground
// goes on (\`w\`, bare sand or a verge as much as a lawn), and never one
// across a kerb or a riser, which is a height on neither side.
int grassLookup(highp sampler2D data, sampler2D paintMap, vec4 win, vec2 xz, out vec4 fld, out vec3 paint) {
  fld = vec4(0.0);
  paint = vec3(0.0);
  if (win.w < 0.5) return -1;
  vec2 g = xz / win.z - 0.5;
  if (g.x < win.x + 0.5 || g.y < win.y + 0.5 || g.x > win.x + win.w - 2.0 || g.y > win.y + win.w - 2.0) return -1;
  vec2 b = floor(g);
  vec2 f = g - b;
  int n = int(win.w + 0.5);
  int x0 = grassWrap(int(b.x), n);
  int x1 = grassWrap(int(b.x) + 1, n);
  int y0 = grassWrap(int(b.y), n);
  int y1 = grassWrap(int(b.y) + 1, n);
  vec4 a00 = texelFetch(data, ivec2(x0, y0), 0);
  vec4 a10 = texelFetch(data, ivec2(x1, y0), 0);
  vec4 a01 = texelFetch(data, ivec2(x0, y1), 0);
  vec4 a11 = texelFetch(data, ivec2(x1, y1), 0);
  vec4 k = vec4((1.0 - f.x) * (1.0 - f.y), f.x * (1.0 - f.y), (1.0 - f.x) * f.y, f.x * f.y);
  float w00 = k.x * step(1e-4, a00.y);
  float w10 = k.y * step(1e-4, a10.y);
  float w01 = k.z * step(1e-4, a01.y);
  float w11 = k.w * step(1e-4, a11.y);
  float ws = w00 + w10 + w01 + w11;
  if (ws < 0.5) return 0;
  // The height over every texel whose ground goes on, bare or grown.
  vec4 g4 = k * vec4(a00.w, a10.w, a01.w, a11.w);
  fld.x = dot(g4, vec4(a00.x, a10.x, a01.x, a11.x)) / max(g4.x + g4.y + g4.z + g4.w, 1e-4);
  // Thinned toward the edge rather than cut at it.
  fld.y = (a00.y * w00 + a10.y * w10 + a01.y * w01 + a11.y * w11) / ws * smoothstep(0.5, 0.85, ws);
  fld.z = (a00.z * w00 + a10.z * w10 + a01.z * w01 + a11.z * w11) / ws;
  vec4 painted = textureLod(paintMap, (g + 0.5) / float(n), 0.0);
  paint = painted.rgb;
  // How tall, of what grows here: mown on an airstrip, trodden round a camp.
  fld.w = painted.a;
  return 1;
}
// The fine field wherever it has the point, whatever it says there: a street
// the fine field leaves bare is not grown again by the coarse one.
bool grassField(vec2 xz, out vec4 fld, out vec3 paint) {
  int fine = grassLookup(uFineData, uFinePaint, uFineWindow, xz, fld, paint);
  if (fine >= 0) return fine == 1;
  return grassLookup(uCoarseData, uCoarsePaint, uCoarseWindow, xz, fld, paint) == 1;
}
// A point of the tangent plane (units) at a height over the sphere (units),
// on the sphere: along the direction (x, R, z), in the frame's own axes.
vec3 grassGround(vec2 xz, float h) {
  float q = dot(xz, xz) / (GRASS_R * GRASS_R);
  float d = sqrt(1.0 + q);
  float k = (1.0 + h / GRASS_R) / d;
  // r / d - R, written so nothing the size of R is subtracted.
  return vec3(xz.x * k, h / d - GRASS_R * q / (d * (1.0 + d)), xz.y * k);
}
// The rotation that takes the frame's up to the ground's up at a root.
vec3 grassTilt(vec3 o, vec3 n) {
  vec3 v = vec3(n.z, 0.0, -n.x);
  return o + cross(v, o) + cross(v, cross(v, o)) / (1.0 + n.y);
}
`;

const GRASS_VERTEX_MAIN = /* glsl */ `
  vec3 objectNormal = vec3(0.0, 1.0, 0.0);
  vec3 grassLocal = vec3(0.0);
  vGrassRoot = vec3(0.0);
  vGrassColour = vec3(0.0);
  vGrassT = 0.0;
  vGrassAO = 1.0;
  {
    int gw = max(int(uGRect.z + 0.5), 1);
    int gid = gl_InstanceID;
    ivec2 ci = ivec2(int(floor(uGRect.x + 0.5)), int(floor(uGRect.y + 0.5))) + ivec2(gid % gw, gid / gw);
    uvec4 hs = uvec4(uvec2(ci + ivec2(65536)), uint(uGRing) * 7919u + 3u, 17u);
    vec4 r1 = vegRand4(hs);
    vec4 r2 = vegRand4(hs + uvec4(0u, 0u, 0u, 101u));
    vec2 rootXZ = (vec2(ci) + r1.xy) * uGSpacing;
    float dist = distance(rootXZ, uCameraPos.xz);
    float fadeR = uGRadius * mix(0.45, 1.0, r1.z);
    float fade = 1.0 - smoothstep(fadeR - uGRadius * 0.18, fadeR, dist);
    vec4 fld = vec4(0.0);
    vec3 paint = vec3(0.0);
    vec2 xzU = rootXZ * GRASS_M;
    bool known = fade > 0.02 && grassField(xzU, fld, paint);
    float dens = fld.y;
    float keep = smoothstep(r1.w, r1.w + 0.15, dens * 1.3);
    float sc = fade * keep;
    vec3 groundUp = normalize(vec3(xzU.x, GRASS_R, xzU.y));
    vec3 rootL = grassGround(xzU, fld.x);
    float rootY = fld.x / GRASS_M;
    vec4 clipC = projectionMatrix * (modelViewMatrix * vec4(rootL + groundUp * (0.4 * GRASS_M), 1.0));
    bool culled = !known || sc < 0.02 || clipC.w < -2.0 * GRASS_M
      || abs(clipC.x) > clipC.w * 1.04 + 1.6 * GRASS_M || abs(clipC.y) > clipC.w * 1.04 + 2.2 * GRASS_M;
    if (!culled) {
      // The clumps: the nearest of a jittered lattice, which sets a blade's
      // lean away from its clump's middle and thins the clump's edge.
      const float CLUMP = 1.15;
      vec2 cp = rootXZ / CLUMP;
      vec2 ic = floor(cp);
      float best = 1e9;
      vec2 bestPt = ic;
      vec2 bestId = ic;
      for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
        vec2 cell = ic + vec2(float(x), float(y));
        vec2 pt = cell + wbHash22(cell);
        vec2 dd = cp - pt;
        float d2 = dot(dd, dd);
        if (d2 < best) { best = d2; bestPt = pt; bestId = cell; }
      }
      vec2 clumpC = bestPt * CLUMP;
      vec2 ch = wbHash22(bestId + 71.3);
      float clumpD = clamp(sqrt(best), 0.0, 1.0);
      float tuft = smoothstep(r1.w, r1.w + 0.15, dens * mix(1.3, 0.3, clumpD * (1.0 - dens)));
      sc *= tuft / max(keep, 1e-3);
      float dry = fld.z;
      float big = wbNoise2(rootXZ * 0.045 + 3.1);
      float far = smoothstep(5.0, 45.0, dist);
      float h = mix(0.3, 0.62, r2.x) * mix(0.72, 1.3, ch.x) * mix(1.15, 0.78, clumpD);
      h *= mix(0.45, 1.0, smoothstep(0.0, 0.75, dens));
      h *= 0.72 + 0.56 * big;
      h *= 1.0 + dry * 0.4;
      h *= fld.w;
      h *= uGHeight * (1.0 - smoothstep(30.0, 90.0, dist) * 0.35);
      h *= mix(0.15, 1.0, sc) * step(0.02, sc);
      h *= uAppear;
      float w = uGWidth * mix(0.75, 1.3, r2.y) * mix(0.55, 1.0, sc);
      float ang = r2.z * 6.2831853;
      vec2 fdir = vec2(cos(ang), sin(ang));
      vec2 cdir = vec2(cos(ch.y * 6.2831853), sin(ch.y * 6.2831853));
      fdir = normalize(mix(fdir, cdir, 0.4) + vec2(1e-4, 0.0));
      vec2 toCam = uCameraPos.xz - rootXZ;
      toCam /= max(length(toCam), 1e-3);
      if (dot(fdir, toCam) < 0.0) fdir = -fdir;
      fdir = normalize(mix(fdir, toCam, uGFaceCam) + vec2(1e-4, 0.0));
      vec2 side2 = vec2(-fdir.y, fdir.x);
      vec2 away = rootXZ - clumpC;
      float al = length(away);
      vec2 lean = (al > 1e-4 ? away / al : fdir) * (0.1 + 0.32 * r2.w) * h;
      float gust = vegGust(rootXZ);
      vec2 wd = uWindDir;
      float ws = uWindStrength;
      float windAmt = (0.03 + ws * (0.14 + gust * 0.95)) * h;
      float ph = r1.x * 6.2831853 + dot(rootXZ, vec2(0.61, 0.83));
      float flutter = (sin(uTime * (3.0 + r2.x * 2.5) + ph) * 0.6 + sin(uTime * 7.3 + ph * 1.7) * 0.4) * (0.025 + 0.06 * ws) * h;
      vec2 bend = lean + wd * windAmt + side2 * flutter * 0.7 + wd * flutter * 0.5;
      // Parted round what presses on it: pushed straight out of the
      // footprint (a point for a body on foot, a rectangle for wheels,
      // \`uPushShape\`: forward, then half its length and width), and
      // flattened a little. Only as far as the feet are down in it: full
      // from the ground to half the blade, nothing a fifth of a blade over
      // its tip, so a jump lifts the press off it and a floor or a deck over
      // the ground presses nothing.
      vec2 dp = rootXZ - uPlayerPos.xz;
      vec2 pf = uPushShape.xy;
      vec2 ps = vec2(-pf.y, pf.x);
      vec2 pl = vec2(dot(dp, pf), dot(dp, ps));
      vec2 po = pl - clamp(pl, -uPushShape.zw, uPushShape.zw);
      float pd = length(po);
      vec2 pout = pd > 1e-3 ? po / pd : vec2(0.0, pl.y >= 0.0 ? 1.0 : -1.0);
      float over = uPlayerPos.y - rootY;
      float hp = max(h, 0.05);
      float push = uPushOn * (1.0 - smoothstep(0.2, 1.4, pd))
        * (1.0 - smoothstep(hp * 0.5, hp * 1.2, over)) * (1.0 - smoothstep(0.3, 0.8, -over));
      bend = mix(bend, (pf * pout.x + ps * pout.y) * h * 0.95, push * 0.9);
      float bl = min(length(bend), h * 0.95);
      bend = normalize(bend + vec2(1e-5, 0.0)) * bl;
      float tipY = sqrt(max(h * h - bl * bl * 0.9, h * h * 0.03));
      tipY *= 1.0 - push * 0.3;

      // The blade: a quadratic Bezier from the root, p1 = (0.18 bend, 0.7 tip), p2 = (bend, tip).
      float t = position.y;
      float s = 1.0 - t;
      vec2 hB = (2.0 * s * t * 0.18 + t * t) * bend;
      float vB = (2.0 * s * t * 0.7 + t * t) * tipY;
      vec2 hT = (2.0 * (1.0 - 2.0 * t) * 0.18 + 2.0 * t) * bend;
      float vT = (2.0 * (1.0 - 2.0 * t) * 0.7 + 2.0 * t) * tipY;
      float wProf = w * (1.0 - pow(t, 1.35)) * (1.0 + 0.35 * sin(t * 3.14159265));
      vec3 side3 = vec3(side2.x, 0.0, side2.y);
      vec3 off = vec3(hB.x, vB, hB.y) + side3 * (position.x * wProf * 0.5);
      vec3 tangent = normalize(vec3(hT.x, vT, hT.y) + vec3(0.0, 1e-4, 0.0));
      vec3 nrm = normalize(cross(side3, tangent));
      vec3 toEye = vec3(uCameraPos.x - rootXZ.x, uCameraPos.y - rootY, uCameraPos.z - rootXZ.y);
      if (dot(nrm, toEye) < 0.0) nrm = -nrm;
      // Toward the sky, more with distance: a field reads as a soft surface, not a hedge of edges.
      nrm = normalize(mix(nrm, vec3(0.0, 1.0, 0.0), mix(0.5, 0.85, far)));
      grassLocal = rootL + grassTilt(off * GRASS_M, groundUp);
      objectNormal = grassTilt(nrm, groundUp);

      // The colour: the ground's own for the middle, darker at the root and lit at the tip.
      vec3 mid = atlasLush(paint);
      vec3 tipC = grassSaturate(mid * uGTipGain, ${TIP_SATURATION.toFixed(2)}) * vec3(${TIP_WARM.map((v) => v.toFixed(2)).join(', ')});
      vec3 rootC = mix(mid * uGRootGain, mid * 1.08, far);
      vec3 c = mix(rootC, mid, smoothstep(0.0, 0.5, t));
      c = mix(c, tipC, smoothstep(0.35, 1.0, t) * (1.0 - far * 0.35));
      float patchN = wbNoise2(rootXZ * 0.018 + 41.0);
      c = mix(c, c * vec3(1.18, 1.12, 0.72), smoothstep(0.55, 0.85, patchN) * 0.7);
      c = mix(c, c * vec3(0.8, 0.92, 0.95), smoothstep(0.4, 0.15, patchN) * 0.5);
      float hv = (ch.x - 0.5) * 1.1 + (r2.y - 0.5) * 0.5 + (big - 0.5) * 0.9;
      c = mix(c, c * vec3(1.2, 1.08, 0.6), clamp(hv, 0.0, 1.0));
      c = mix(c, c * vec3(0.82, 0.98, 1.08), clamp(-hv, 0.0, 1.0));
      c *= 0.86 + 0.26 * r1.w;
      vec3 dcol = mix(mix(uGDryRoot, uGDryTip, far * 0.5), uGDryTip, smoothstep(0.0, 1.0, t)) * (0.88 + 0.24 * r2.y);
      c = mix(c, dcol, dry);
      c *= 1.0 + gust * (0.15 + ws * 0.45) * t;
      c *= 1.0 + far * 0.12;
      vGrassColour = c;
      vGrassT = t;
      vGrassAO = mix(mix(0.4, 1.0, smoothstep(0.0, 0.8, t)), 1.0, far);
      vGrassRoot = (modelMatrix * vec4(rootL, 1.0)).xyz;
    }
  }
`;

/** The diffuse ramp read with a wrap, so a blade turned half from the sun still takes it. */
const GRASS_GRADIENT = /* glsl */ `
#ifdef USE_GRADIENTMAP
  uniform sampler2D gradientMap;
#endif
vec3 getGradientIrradiance(vec3 normal, vec3 lightDirection) {
  float dotNL = (dot(normal, lightDirection) + ${WRAP.toFixed(2)}) / ${(1 + WRAP).toFixed(2)};
  vec2 coord = vec2(dotNL * 0.5 + 0.5, 0.0);
  #ifdef USE_GRADIENTMAP
    return vec3(texture2D(gradientMap, coord).r);
  #else
    return vec3(clamp(dotNL, 0.0, 1.0));
  #endif
}
`;

/**
 * The toon model's direct term, plus the light through a blade seen against
 * the sun: weighted by how far up the blade, and after the shadow, which has
 * already been taken off `directLight.color`.
 */
const GRASS_LIGHTS = /* glsl */ `
varying vec3 vViewPosition;
uniform vec3 uGTranslucency;
struct ToonMaterial {
  vec3 diffuseColor;
};
void RE_Direct_Toon(const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight) {
  vec3 irradiance = getGradientIrradiance(geometryNormal, directLight.direction) * directLight.color;
  reflectedLight.directDiffuse += irradiance * BRDF_Lambert(material.diffuseColor);
  float back = pow(clamp(dot(geometryViewDir, -directLight.direction), 0.0, 1.0), 3.0);
  reflectedLight.directDiffuse += directLight.color * back * vGrassT * BRDF_Lambert(material.diffuseColor * uGTranslucency);
}
void RE_IndirectDiffuse_Toon(const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight) {
  reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert(material.diffuseColor);
}
#define RE_Direct RE_Direct_Toon
#define RE_IndirectDiffuse RE_IndirectDiffuse_Toon
`;

/** What every ring shares and nobody sets per ring. */
function sharedUniforms(): Record<string, THREE.IUniform> {
  const linear = (hex: string): THREE.Color => new THREE.Color(hex);
  const lightness = (hex: string): number => {
    const colour = linear(hex);
    return 0.2126 * colour.r + 0.7152 * colour.g + 0.0722 * colour.b;
  };
  const mid = lightness(REFERENCE.mid);
  const dryRoot = linear(REFERENCE.dryRoot);
  const dryTip = linear(REFERENCE.dryTip);
  const translucent = linear(REFERENCE.translucent).multiplyScalar(TRANSLUCENCY);
  return {
    // The wind's own objects (`wind.ts`), which the trees read too.
    uTime: WIND.uTime,
    uWindStrength: WIND.uWindStrength,
    uGHeight: { value: 1 },
    uGRootGain: { value: lightness(REFERENCE.root) / mid },
    // Capped: on a ground already as light as this palette's, the reference's
    // full ratio lit every tip to straw.
    uGTipGain: { value: Math.min(TIP_GAIN_CAP, lightness(REFERENCE.tip) / mid) },
    uGDryRoot: { value: new THREE.Vector3(dryRoot.r, dryRoot.g, dryRoot.b) },
    uGDryTip: { value: new THREE.Vector3(dryTip.r, dryTip.g, dryTip.b) },
    uGTranslucency: { value: new THREE.Vector3(translucent.r, translucent.g, translucent.b) },
  };
}

/**
 * One ring's material: the toon material, with the blade built in its vertex
 * stage and the grass's light in its fragment. Every ring's is a program in
 * common (`customProgramCacheKey`); each carries its own uniforms, because a
 * material's uniforms are uploaded when the material changes between draws.
 */
function grassMaterial(uniforms: Record<string, THREE.IUniform>, ramp: THREE.Texture): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({ gradientMap: ramp, side: THREE.DoubleSide });
  material.userData.outlineParameters = { visible: false };
  material.userData.uniforms = uniforms;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    bindGroundWeather(shader.uniforms);
    bindNearLights(shader.uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${GRASS_VERTEX_PARS}`)
      .replace('#include <beginnormal_vertex>', GRASS_VERTEX_MAIN)
      .replace('#include <begin_vertex>', 'vec3 transformed = grassLocal;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nvarying vec3 vGrassRoot;\nvarying vec3 vGrassColour;\nvarying float vGrassT;\nvarying float vGrassAO;\n${GROUND_MARKS_GLSL}\n${groundWeatherGLSL()}\n${nearLightsGLSL()}`,
      )
      .replace('#include <gradientmap_pars_fragment>', GRASS_GRADIENT)
      .replace('#include <lights_toon_pars_fragment>', GRASS_LIGHTS)
      .replace(
        '#include <color_fragment>',
        // The land's own blots over it (`atlasPatches`, `globe.ts`), at the
        // root: a blade is the patch of ground it grows in.
        `#include <color_fragment>\n  diffuseColor.rgb = atlasPatches(diffuseColor.rgb * vGrassColour, vGrassRoot);\n  ${groundWeatherChunk('vGrassRoot')}`,
      )
      // The normal the vertex stage turned toward the camera, on both faces:
      // three turns a back face's round, and a blade seen from behind would
      // step to the shadow band.
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n  normal = normalize(vNormal);\n  nonPerturbedNormal = normal;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${nearLightsChunk('vGrassRoot')}`)
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n  reflectedLight.indirectDiffuse *= vGrassAO;');
  };
  material.customProgramCacheKey = () => 'atlas-grass';
  return material;
}

/**
 * One blade: `segments` rows of two vertices, `x` -1 and +1 across and `y`
 * the share of the way up, `(i / segments)^0.9`, and the tip. The vertex stage
 * bends it; this is only the parameters.
 */
function bladeGeometry(segments: number): THREE.InstancedBufferGeometry {
  const positions: number[] = [];
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) ** 0.9;
    positions.push(-1, t, 0, 1, t, 0);
  }
  positions.push(0, 1, 0);
  const index: number[] = [];
  for (let i = 0; i + 1 < segments; i++) {
    const a = i * 2;
    index.push(a, a + 1, a + 3, a, a + 3, a + 2);
  }
  const last = (segments - 1) * 2;
  index.push(last, last + 1, segments * 2);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.instanceCount = 0;
  return geometry;
}

// ---------------------------------------------------------------------------
// The frame and the fields
// ---------------------------------------------------------------------------

/** A tangent frame: the anchor's up, and `across` and `north` along the ground. */
interface Frame {
  up: THREE.Vector3;
  across: THREE.Vector3;
  north: THREE.Vector3;
  quaternion: THREE.Quaternion;
}

const basis = new THREE.Matrix4();

/**
 * The frame every tile and town builds: +Z toward the pole along the ground,
 * X = Y cross Z. `makeBasis(east, up, north)` is the reflection; this is the
 * rotation, and a reflection here would mirror every blade.
 */
function frameAt(direction: THREE.Vector3, frame: Frame): boolean {
  frame.up.copy(direction).normalize();
  frame.north.set(0, 1, 0).projectOnPlane(frame.up);
  if (frame.north.lengthSq() < 1e-8) frame.north.set(1, 0, 0).projectOnPlane(frame.up);
  frame.north.normalize();
  frame.across.crossVectors(frame.up, frame.north).normalize();
  basis.makeBasis(frame.across, frame.up, frame.north);
  if (basis.determinant() <= 0) return false;
  frame.quaternion.setFromRotationMatrix(basis);
  return true;
}

/** A point of the frame's tangent plane, `(x, z)` in units, as a direction from the planet's centre. */
function directionIn(frame: Frame, x: number, z: number, out: THREE.Vector3): THREE.Vector3 {
  return out
    .copy(frame.up)
    .multiplyScalar(PLANET_RADIUS)
    .addScaledVector(frame.across, x)
    .addScaledVector(frame.north, z)
    .normalize();
}

/** A world point in the frame: `x`, `z` on the tangent plane in units, `y` its height over the sphere. */
function tangentOf(frame: Frame, point: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  const length = point.length();
  const up = point.dot(frame.up) / length;
  if (up <= 1e-6) return out.set(Infinity, 0, Infinity);
  return out.set(
    (PLANET_RADIUS * point.dot(frame.across)) / length / up,
    length - PLANET_RADIUS,
    (PLANET_RADIUS * point.dot(frame.north)) / length / up,
  );
}

/**
 * One field: a window of `size` texels a side on the frame's texel lattice,
 * held as a torus — texel `(I, J)` lives at `(I mod size, J mod size)` — so
 * the window moves by the line it takes on. The data are the ground's height
 * over the sphere in units, the density, the dryness and whether there is
 * ground there at all (a float texture read texel by texel), and the colour
 * (sRGB bytes, filtered) with how tall the grass stands of what it would
 * (`GrassSite.height`) in its alpha.
 */
interface Field {
  texel: number;
  size: number;
  data: Float32Array;
  paint: Uint8Array;
  dataTexture: THREE.DataTexture;
  paintTexture: THREE.DataTexture;
  /** The shader's view of the window: its first texel's indices, units a texel, and the size, or 0 while nothing is valid. */
  window: THREE.Vector4;
  i0: number;
  j0: number;
  valid: boolean;
  /** Patches to bake again in place, in texel indices: `[i0, i1, j0, j1]`, half-open. */
  dirty: number[][];
}

function createField(texel: number, size: number): Field {
  const data = new Float32Array(size * size * 4);
  const paint = new Uint8Array(size * size * 4);
  const dataTexture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.FloatType);
  dataTexture.minFilter = THREE.NearestFilter;
  dataTexture.magFilter = THREE.NearestFilter;
  dataTexture.generateMipmaps = false;
  const paintTexture = new THREE.DataTexture(paint, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  paintTexture.colorSpace = THREE.SRGBColorSpace;
  paintTexture.wrapS = THREE.RepeatWrapping;
  paintTexture.wrapT = THREE.RepeatWrapping;
  paintTexture.minFilter = THREE.LinearFilter;
  paintTexture.magFilter = THREE.LinearFilter;
  paintTexture.generateMipmaps = false;
  return { texel, size, data, paint, dataTexture, paintTexture, window: new THREE.Vector4(0, 0, texel, 0), i0: 0, j0: 0, valid: false, dirty: [] };
}

/** A layer: a frame and its two fields, and the ring meshes that draw from them. */
interface Layer {
  frame: Frame;
  fine: Field;
  coarse: Field;
  group: THREE.Group;
  uniforms: Record<string, THREE.IUniform>;
  /** 0 to 1: how grown in it is. */
  appear: number;
  /** Growing in (the shown layer), going (the one replaced), or neither. */
  shown: boolean;
  /** When its fill began, for `lastFillMs`; negative once reported. */
  began: number;
  /** Whether it has been anchored at all. */
  anchored: boolean;
}

/**
 * A piece of baking: a rectangle of texel indices of one field, column by
 * column, and what to do with the window when it is whole.
 */
interface Job {
  layer: Layer;
  field: Field;
  i0: number;
  i1: number;
  j0: number;
  j1: number;
  /** Texels done, column-major. */
  done: number;
  /** A fill makes the field valid; a shift moves the window by one line; a patch changes nothing but the data. */
  kind: 'fill' | 'shift-i+' | 'shift-i-' | 'shift-j+' | 'shift-j-' | 'patch';
  /** Which gather this job's texels were asked under. */
  gathered: number;
}

/** A footprint's share of the vehicle's box: the wheels stand inside its bumpers and mirrors. */
const PRESS_SHARE = 0.85;

/**
 * What the player presses the grass apart with (`GrassFrame.press`), into
 * `out`: the feet on foot, the footprint of a vehicle on the ground with
 * whatever is under it — a car's, a horse's, a tractor's, and a plane's or a
 * helicopter's standing on its field, which the wash flattens — and nothing
 * swimming, afloat, or in a balloon's basket. Aloft is the shader's to lift:
 * it fades the press with the height over the blades.
 */
export function pressOf(player: Pick<Player, 'state' | 'ride' | 'forward'>, out: NonNullable<GrassFrame['press']>): GrassFrame['press'] {
  out.forward.copy(player.forward);
  if (player.state === 'swim') return null;
  const model = player.ride?.model;
  if (model === undefined) {
    out.length = 0;
    out.width = 0;
    return player.state === 'foot' ? out : null;
  }
  if (model.medium === 'water' || model.kind === 'balloon') return null;
  out.length = (model.size[0] / 2) * PRESS_SHARE;
  out.width = (model.size[1] / 2) * PRESS_SHARE;
  return out;
}

export function createGrass(ground: GrassGround | null): Grass {
  const group = new THREE.Group();
  group.name = 'grass';
  const shared = sharedUniforms();
  // One ramp for every ring: `theme.ts` keeps every ramp it makes, to repaint them with the mood.
  const ramp = createToonRamp(4);

  const stats: GrassStats = {
    visible: false,
    quality: qualityFor(detail()),
    rings: 0,
    instances: 0,
    anchor: '',
    fromAnchor: 0,
    fine: `${FINE.size} x ${FINE.texel}`,
    coarse: `${COARSE.size} x ${COARSE.texel}`,
    fineReady: false,
    coarseReady: false,
    pending: 0,
    texels: 0,
    microsecondsATexel: 0,
    lastBakeMs: 0,
    lastFillMs: 0,
    anchors: 0,
  };

  function createLayer(name: string): Layer {
    const fine = createField(FINE.texel, FINE.size);
    const coarse = createField(COARSE.texel, COARSE.size);
    const layerGroup = new THREE.Group();
    layerGroup.name = name;
    layerGroup.visible = false;
    group.add(layerGroup);
    return {
      frame: { up: new THREE.Vector3(0, 1, 0), across: new THREE.Vector3(), north: new THREE.Vector3(), quaternion: new THREE.Quaternion() },
      fine,
      coarse,
      group: layerGroup,
      uniforms: {
        uCameraPos: { value: new THREE.Vector3() },
        uPlayerPos: { value: new THREE.Vector3() },
        uPushShape: { value: new THREE.Vector4(0, 1, 0, 0) },
        uPushOn: { value: 0 },
        uWindDir: { value: new THREE.Vector2(1, 0) },
        uAppear: { value: 0 },
        uFineData: { value: fine.dataTexture },
        uFinePaint: { value: fine.paintTexture },
        uFineWindow: { value: fine.window },
        uCoarseData: { value: coarse.dataTexture },
        uCoarsePaint: { value: coarse.paintTexture },
        uCoarseWindow: { value: coarse.window },
      },
      appear: 0,
      shown: false,
      began: -1,
      anchored: false,
    };
  }
  let front = createLayer('grass-a');
  let back = createLayer('grass-b');

  // ------------------------------------------------------------------
  // The rings
  // ------------------------------------------------------------------

  interface RingMesh {
    ring: Ring;
    mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.MeshToonMaterial>;
    rect: THREE.Vector4;
  }
  const ringsOf = new Map<Layer, RingMesh[]>();
  let quality: GrassQuality | null = null;

  function buildRings(layer: Layer, wanted: GrassQuality): void {
    for (const old of ringsOf.get(layer) ?? []) {
      layer.group.remove(old.mesh);
      old.mesh.geometry.dispose();
      old.mesh.material.dispose();
    }
    const made: RingMesh[] = RINGS[wanted].map((ring, index) => {
      const rect = new THREE.Vector4();
      const uniforms: Record<string, THREE.IUniform> = {
        ...shared,
        ...layer.uniforms,
        uGRect: { value: rect },
        uGSpacing: { value: ring.spacing },
        uGRadius: { value: ring.radius },
        uGWidth: { value: ring.width },
        uGFaceCam: { value: ring.faceCamera },
        uGRing: { value: index },
      };
      const mesh = new THREE.Mesh(bladeGeometry(ring.segments), grassMaterial(uniforms, ramp));
      mesh.name = `grass-ring-${index}`;
      // Every vertex is placed by the shader; there is nothing for a box to bound.
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      layer.group.add(mesh);
      return { ring, mesh, rect };
    });
    ringsOf.set(layer, made);
  }

  // ------------------------------------------------------------------
  // The bake
  // ------------------------------------------------------------------

  const site: GrassSite = { radius: 0, density: 0, r: 0, g: 0, b: 0, dry: 0, height: 1 };
  const texelDirection = new THREE.Vector3();
  const gatherDirection = new THREE.Vector3();
  const srgb = new THREE.Color();
  /** Bumped at every gather, so a job resumed after another's knows to gather again. */
  let gatherCount = 0;
  let current: Job | null = null;
  let totalMicroseconds = 0;

  /** Writes texel `(I, J)` of a field of a layer. False when the land is not gathered there yet. */
  function bakeTexel(layer: Layer, field: Field, I: number, J: number): boolean {
    const direction = directionIn(layer.frame, (I + 0.5) * field.texel, (J + 0.5) * field.texel, texelDirection);
    if (!ground!.covers(direction)) return false;
    const found = ground!.at(direction, site, field.texel * GRASS_SPREAD);
    const n = field.size;
    const slot = ((((J % n) + n) % n) * n + (((I % n) + n) % n)) * 4;
    if (found === null) {
      field.data[slot] = 0;
      field.data[slot + 1] = 0;
      field.data[slot + 2] = 0;
      field.data[slot + 3] = 0;
      field.paint[slot] = field.paint[slot + 1] = field.paint[slot + 2] = 0;
      field.paint[slot + 3] = 255;
      return true;
    }
    field.data[slot] = found.radius - PLANET_RADIUS;
    field.data[slot + 1] = found.density;
    field.data[slot + 2] = found.dry;
    // The ground goes on here, grass or none: its height is laid between.
    field.data[slot + 3] = 1;
    srgb.setRGB(found.r, found.g, found.b).convertLinearToSRGB();
    field.paint[slot] = Math.round(Math.min(1, Math.max(0, srgb.r)) * 255);
    field.paint[slot + 1] = Math.round(Math.min(1, Math.max(0, srgb.g)) * 255);
    field.paint[slot + 2] = Math.round(Math.min(1, Math.max(0, srgb.b)) * 255);
    // How tall, of what the field grows: mown on a strip, trodden round a camp.
    field.paint[slot + 3] = Math.round(Math.min(1, Math.max(0, found.height)) * 255);
    return true;
  }

  /** Where the field wants its window: centred on the camera's point of the plane. */
  const targetOf = (field: Field, at: THREE.Vector3): [number, number] => [
    Math.floor(at.x / field.texel) - field.size / 2,
    Math.floor(at.z / field.texel) - field.size / 2,
  ];

  function publish(field: Field): void {
    field.dataTexture.needsUpdate = true;
    field.paintTexture.needsUpdate = true;
    field.window.set(field.i0, field.j0, field.texel, field.valid ? field.size : 0);
  }

  /** The job this field needs next, if any, for a camera at `at` in its layer's plane. */
  function jobFor(layer: Layer, field: Field, at: THREE.Vector3, urgentOnly: boolean): Job | null {
    const [ti, tj] = targetOf(field, at);
    const n = field.size;
    const make = (kind: Job['kind'], i0: number, i1: number, j0: number, j1: number): Job => ({ layer, field, i0, i1, j0, j1, done: 0, kind, gathered: -1 });
    if (!field.valid || Math.abs(ti - field.i0) >= n / 2 || Math.abs(tj - field.j0) >= n / 2) {
      field.valid = false;
      field.dirty.length = 0;
      field.i0 = ti;
      field.j0 = tj;
      field.window.w = 0;
      return make('fill', ti, ti + n, tj, tj + n);
    }
    const di = ti - field.i0;
    const dj = tj - field.j0;
    const lag = Math.max(Math.abs(di), Math.abs(dj));
    if (lag >= 2 || (lag === 1 && field.dirty.length === 0)) {
      if (Math.abs(di) >= Math.abs(dj)) {
        return di > 0
          ? make('shift-i+', field.i0 + n, field.i0 + n + 1, field.j0, field.j0 + n)
          : make('shift-i-', field.i0 - 1, field.i0, field.j0, field.j0 + n);
      }
      return dj > 0
        ? make('shift-j+', field.i0, field.i0 + n, field.j0 + n, field.j0 + n + 1)
        : make('shift-j-', field.i0, field.i0 + n, field.j0 - 1, field.j0);
    }
    if (urgentOnly) return null;
    while (field.dirty.length > 0) {
      const [a0, a1, b0, b1] = field.dirty.shift()!;
      const i0 = Math.max(a0!, field.i0);
      const i1 = Math.min(a1!, field.i0 + n);
      const j0 = Math.max(b0!, field.j0);
      const j1 = Math.min(b1!, field.j0 + n);
      if (i0 < i1 && j0 < j1) return make('patch', i0, i1, j0, j1);
    }
    return null;
  }

  function finish(job: Job): void {
    const field = job.field;
    switch (job.kind) {
      case 'fill':
        field.valid = true;
        break;
      case 'shift-i+':
        field.i0++;
        break;
      case 'shift-i-':
        field.i0--;
        break;
      case 'shift-j+':
        field.j0++;
        break;
      case 'shift-j-':
        field.j0--;
        break;
      case 'patch':
        break;
    }
    publish(field);
  }

  /** Works on `job` until it is whole or the frame's allowance is spent; true when whole. */
  function work(job: Job, began: number, allowance: number): boolean {
    const field = job.field;
    const width = job.i1 - job.i0;
    const height = job.j1 - job.j0;
    const total = width * height;
    if (job.gathered !== gatherCount || job.gathered < 0) {
      const cx = ((job.i0 + job.i1) * 0.5) * field.texel;
      const cz = ((job.j0 + job.j1) * 0.5) * field.texel;
      directionIn(job.layer.frame, cx, cz, gatherDirection);
      ground!.gather(gatherDirection, Math.hypot(width, height) * field.texel * 0.5 + field.texel * 2);
      job.gathered = ++gatherCount;
    }
    while (job.done < total) {
      if (!mayBuild(began, allowance, true)) return false;
      const stop = Math.min(total, job.done + TEXEL_BATCH);
      const start = performance.now();
      const from = job.done;
      for (; job.done < stop; job.done++) {
        const I = job.i0 + Math.floor(job.done / height);
        const J = job.j0 + (job.done % height);
        if (!bakeTexel(job.layer, field, I, J)) {
          // The land index is not round here yet: wait for it rather than bake the sea.
          account(job.done - from, start);
          return false;
        }
      }
      account(job.done - from, start);
    }
    finish(job);
    return true;
  }

  function account(count: number, start: number): void {
    if (count <= 0) return;
    const took = (performance.now() - start) * 1000;
    stats.texels += count;
    totalMicroseconds += took;
    stats.microsecondsATexel = Number((totalMicroseconds / stats.texels).toFixed(2));
  }

  /** Every job every field of a layer could want, the urgent first; the first it finds. */
  function nextJob(at: { front: THREE.Vector3; back: THREE.Vector3 }): Job | null {
    // The shown layer's lines first, while they keep up; then a layer being
    // laid round a new anchor; then what a changed floor dirtied.
    const order: [Layer, Field, THREE.Vector3, boolean][] = [];
    if (front.anchored) order.push([front, front.fine, at.front, true], [front, front.coarse, at.front, true]);
    if (back.anchored) order.push([back, back.fine, at.back, false], [back, back.coarse, at.back, false]);
    if (front.anchored) order.push([front, front.fine, at.front, false], [front, front.coarse, at.front, false]);
    for (const [layer, field, point, urgent] of order) {
      const job = jobFor(layer, field, point, urgent);
      if (job !== null) return job;
    }
    return null;
  }

  function pendingTexels(): number {
    let count = 0;
    for (const layer of [front, back]) {
      if (!layer.anchored) continue;
      for (const field of [layer.fine, layer.coarse]) {
        // A fill under way is counted below, by what it has left.
        if (!field.valid && current?.field !== field) count += field.size * field.size;
        for (const [i0, i1, j0, j1] of field.dirty) count += (i1! - i0!) * (j1! - j0!);
      }
    }
    if (current !== null) count += (current.i1 - current.i0) * (current.j1 - current.j0) - current.done;
    return count;
  }

  // ------------------------------------------------------------------
  // Anchoring
  // ------------------------------------------------------------------

  function anchor(layer: Layer, direction: THREE.Vector3): void {
    if (!frameAt(direction, layer.frame)) throw new Error('grass: the tangent frame came out a reflection');
    layer.group.position.copy(layer.frame.up).multiplyScalar(PLANET_RADIUS);
    layer.group.quaternion.copy(layer.frame.quaternion);
    layer.group.updateMatrixWorld(true);
    for (const field of [layer.fine, layer.coarse]) {
      field.valid = false;
      field.dirty.length = 0;
      field.window.w = 0;
    }
    if (current !== null && current.layer === layer) current = null;
    layer.anchored = true;
    layer.shown = false;
    layer.appear = 0;
    layer.began = performance.now();
    stats.anchors++;
  }

  // ------------------------------------------------------------------
  // The frame
  // ------------------------------------------------------------------

  const eye = new THREE.Vector3();
  const eyeDirection = new THREE.Vector3();
  const lastEye = new THREE.Vector3(Infinity, Infinity, Infinity);
  const eyeFront = new THREE.Vector3();
  const eyeBack = new THREE.Vector3();
  const playerAt = new THREE.Vector3();
  const changes: number[] = [];
  let floorsSeen = ground?.floorChanges(0, changes) ?? 0;
  let versionSeen = ground?.version() ?? 0;
  const changedAt = new THREE.Vector3();
  const changedPlane = new THREE.Vector3();
  let lastTime = performance.now();

  /** Marks every texel a changed floor reaches as dirty, in every anchored field. */
  function noteChanges(): void {
    if (ground === null) return;
    changes.length = 0;
    const version = ground.floorChanges(floorsSeen, changes);
    const moved = ground.version() !== versionSeen;
    if (version === floorsSeen && !moved) return;
    floorsSeen = version;
    versionSeen = ground.version();
    const all = moved || changes[0] === -1;
    for (const layer of [front, back]) {
      if (!layer.anchored) continue;
      for (const field of [layer.fine, layer.coarse]) {
        const n = field.size;
        if (all) {
          field.dirty.length = 0;
          field.dirty.push([field.i0, field.i0 + n, field.j0, field.j0 + n]);
          continue;
        }
        for (let c = 0; c + 3 < changes.length; c += 4) {
          changedAt.set(changes[c]!, changes[c + 1]!, changes[c + 2]!).multiplyScalar(PLANET_RADIUS);
          const at = tangentOf(layer.frame, changedAt, changedPlane);
          const reach = changes[c + 3]! + field.texel * 2;
          if (!Number.isFinite(at.x)) continue;
          const i0 = Math.floor((at.x - reach) / field.texel);
          const i1 = Math.ceil((at.x + reach) / field.texel);
          const j0 = Math.floor((at.z - reach) / field.texel);
          const j1 = Math.ceil((at.z + reach) / field.texel);
          if (i1 <= field.i0 || i0 >= field.i0 + n || j1 <= field.j0 || j0 >= field.j0 + n) continue;
          field.dirty.push([i0, i1, j0, j1]);
        }
      }
    }
    // A patch under way was asked of the old answer: start it again.
    if (current !== null && current.kind === 'patch') {
      current.field.dirty.unshift([current.i0, current.i1, current.j0, current.j1]);
      current = null;
    }
  }

  function setLayerUniforms(layer: Layer, frame: GrassFrame, eyeAt: THREE.Vector3): void {
    const metre = METRE;
    (layer.uniforms.uCameraPos!.value as THREE.Vector3).set(eyeAt.x / metre, eyeAt.y / metre, eyeAt.z / metre);
    const player = tangentOf(layer.frame, frame.player, playerAt);
    (layer.uniforms.uPlayerPos!.value as THREE.Vector3).set(player.x / metre, player.y / metre, player.z / metre);
    const press = frame.press;
    layer.uniforms.uPushOn!.value = press === null ? 0 : 1;
    if (press !== null) {
      // The tangent plane's x is `across`, its z `north` (`tangentOf`).
      const fx = press.forward.dot(layer.frame.across);
      const fz = press.forward.dot(layer.frame.north);
      const fl = Math.hypot(fx, fz);
      (layer.uniforms.uPushShape!.value as THREE.Vector4).set(fl > 1e-6 ? fx / fl : 0, fl > 1e-6 ? fz / fl : 1, press.length / metre, press.width / metre);
    }
    // Toward the bearing the wind blows to; `across` is west (see `frameAt`).
    const toward = ((frame.wind.from + 180) * Math.PI) / 180;
    (layer.uniforms.uWindDir!.value as THREE.Vector2).set(-Math.sin(toward), Math.cos(toward));
    layer.uniforms.uAppear!.value = layer.appear * layer.appear * (3 - 2 * layer.appear);
    for (const { ring, mesh, rect } of ringsOf.get(layer) ?? []) {
      const cx = eyeAt.x / metre;
      const cz = eyeAt.z / metre;
      const cells = Math.ceil((2 * ring.radius) / ring.spacing) + 1;
      rect.set(Math.floor((cx - ring.radius) / ring.spacing), Math.floor((cz - ring.radius) / ring.spacing), cells, 0);
      mesh.geometry.instanceCount = layer.group.visible ? cells * cells : 0;
      if (layer.group.visible) stats.instances += cells * cells;
    }
  }

  const grass: Grass = {
    group,
    stats,
    enabled: true,
    height: 1,
    proxies: () => {
      const probe = grassMaterial({ ...shared, ...front.uniforms, uGRect: { value: new THREE.Vector4() }, uGSpacing: { value: 1 }, uGRadius: { value: 1 }, uGWidth: { value: 1 }, uGFaceCam: { value: 0 }, uGRing: { value: 0 } }, ramp);
      return [proxyOf(probe)];
    },

    rebake() {
      front.anchored = false;
      back.anchored = false;
      front.group.visible = back.group.visible = false;
      current = null;
    },

    update(frame) {
      const now = performance.now();
      const dt = Math.min(0.25, (now - lastTime) / 1000);
      lastTime = now;
      stats.instances = 0;
      stats.lastBakeMs = 0;
      // The clock and the strength the whole of the flora moves by: see `wind.ts`.
      setWind(now, frame.wind, frame.player);
      shared.uGHeight!.value = grass.height;

      const wanted = qualityFor(detail());
      if (wanted !== quality) {
        quality = wanted;
        buildRings(front, wanted);
        buildRings(back, wanted);
        stats.quality = wanted;
        stats.rings = RINGS[wanted].length;
      }
      const reach = Math.max(...RINGS[wanted].map((ring) => ring.radius)) * METRE;

      frame.camera.getWorldPosition(eye);
      const jumped = eye.distanceTo(lastEye) > JUMP;
      lastEye.copy(eye);
      // Nothing to see from up there, and nothing to bake for it: the rings
      // are drawn round the camera's point of the ground and the last of them
      // ends at `reach`.
      const low = frame.height < reach * 0.9;
      const near = frame.height < reach * 1.5;
      const active = ground !== null && grass.enabled && !frame.hidden;
      group.visible = active && low;
      stats.visible = group.visible;
      if (!active || !near) {
        stats.pending = pendingTexels();
        return;
      }

      // A new anchor: where there is none, after a jump or a flight (the old
      // one goes at once), and a camera gone `FRAME_REACH` from the old on
      // foot (it stays until the new one stands, and the two cross-fade).
      const direction = eyeDirection.copy(eye).normalize();
      tangentOf(front.frame, eye, eyeFront);
      const fromAnchor = Math.hypot(eyeFront.x, eyeFront.z);
      if (!front.anchored || jumped || !(fromAnchor < FRAME_REACH * 2)) {
        anchor(front, direction);
        front.group.visible = false;
        back.anchored = false;
        back.group.visible = false;
        back.shown = false;
        back.appear = 0;
        if (current !== null && current.layer === back) current = null;
        tangentOf(front.frame, eye, eyeFront);
      }
      stats.fromAnchor = Math.round(Math.hypot(eyeFront.x, eyeFront.z));
      if (!back.anchored && stats.fromAnchor > FRAME_REACH) anchor(back, direction);
      if (back.anchored) tangentOf(back.frame, eye, eyeBack);
      else eyeBack.copy(eyeFront);

      noteChanges();

      // The bake: one job at a time, whole before the next, inside the frame.
      const began = performance.now();
      const allowance = detailBuild(BUILD_MS);
      for (;;) {
        if (current === null) current = nextJob({ front: eyeFront, back: eyeBack });
        if (current === null) break;
        if (!work(current, began, allowance)) break;
        current = null;
      }
      stats.lastBakeMs = Number((performance.now() - began).toFixed(2));

      // A layer is drawn once its fine field stands; one laid round a new
      // anchor takes over once both of its do.
      if (!front.shown && front.fine.valid) {
        front.shown = true;
        front.group.visible = true;
      }
      if (back.anchored && back.fine.valid && back.coarse.valid) {
        const old = front;
        front = back;
        back = old;
        front.shown = true;
        front.group.visible = true;
        // The old one keeps drawing while it goes, and is no longer anchored.
        back.anchored = false;
        back.shown = false;
        current = current !== null && current.layer === back ? null : current;
        tangentOf(front.frame, eye, eyeFront);
        stats.fromAnchor = Math.round(Math.hypot(eyeFront.x, eyeFront.z));
      }
      for (const layer of [front, back]) {
        if (layer.began >= 0 && layer.fine.valid && layer.coarse.valid) {
          stats.lastFillMs = Math.round(performance.now() - layer.began);
          layer.began = -1;
        }
        const growing = layer === front && layer.shown;
        layer.appear = Math.min(1, Math.max(0, layer.appear + (growing ? dt : -dt) / APPEAR_SECONDS));
        if (!growing && layer.appear <= 0) layer.group.visible = false;
      }
      setLayerUniforms(front, frame, eyeFront);
      if (back.group.visible) setLayerUniforms(back, frame, tangentOf(back.frame, eye, eyeBack));

      const up = front.frame.up;
      stats.anchor = `${latOf(up.y).toFixed(3)}, ${lonOf(up.x, up.z).toFixed(3)}`;
      stats.fineReady = front.fine.valid;
      stats.coarseReady = front.coarse.valid;
      stats.pending = pendingTexels();
    },
  };
  return grass;
}
