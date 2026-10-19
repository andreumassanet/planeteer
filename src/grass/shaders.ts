/** The blade shader: the vertex stage that places and bends every blade from its cell, and the fragment lighting. */
import { LUSH_GLSL } from '../globe.ts';
import { SEASON_GLSL } from '../foliage-season.ts';
import { METRE, TIP_SATURATION, TIP_WARM, WRAP } from './types.ts';

/** The vertex stage's declarations, for a planet of `radius` units. */
export const grassVertexPars = (radius: number): string => /* glsl */ `
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
const float GRASS_R = ${radius.toFixed(1)};

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
${SEASON_GLSL}
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
  // How far a growing texel's ground goes on round it (its edge), less how
  // far off it the point is, square as a town's margins are: past every
  // growing texel's reach is past a lawn's kerb or wall, and nothing grows.
  vec4 a4 = vec4(a00.w, a10.w, a01.w, a11.w);
  vec4 onGround = step(0.5, a4);
  vec4 off = vec4(max(f.x, f.y), max(1.0 - f.x, f.y), max(f.x, 1.0 - f.y), max(1.0 - f.x, 1.0 - f.y)) * win.z;
  vec4 grows = step(1e-4, vec4(a00.y, a10.y, a01.y, a11.y));
  vec4 reach4 = mix(vec4(-1e4), a4 - 1.0 - off, grows);
  float edge = max(max(reach4.x, reach4.y), max(reach4.z, reach4.w));
  if (edge <= 0.0) return 0;
  // The height over every texel whose ground goes on, bare or grown.
  vec4 g4 = k * onGround;
  fld.x = dot(g4, vec4(a00.x, a10.x, a01.x, a11.x)) / max(g4.x + g4.y + g4.z + g4.w, 1e-4);
  // Thinned toward the edge rather than cut at it.
  fld.y = (a00.y * w00 + a10.y * w10 + a01.y * w01 + a11.y * w11) / ws * smoothstep(0.5, 0.85, ws) * smoothstep(0.0, 0.35, edge);
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

/** The blade's year, the land's own (`atlasGroundSeason`), read off the ground's colour; Earth's grass only. */
export const GRASS_SEASON_AT = '      c = atlasGroundSeason(c, mid, (modelMatrix * vec4(rootL, 1.0)).xyz);';

export const GRASS_VERTEX_MAIN = /* glsl */ `
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
${GRASS_SEASON_AT}
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
export const GRASS_GRADIENT = /* glsl */ `
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
export const GRASS_LIGHTS = /* glsl */ `
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
