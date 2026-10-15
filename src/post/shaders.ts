/** The post chain's full-screen shaders: the shared vertex stage, the grade, and the ambient occlusion. */
import { SHAFT_GRADE, SHAFT_GRADE_PARS } from '../shafts.ts';

/** A full-screen triangle pair in clip space. */
export const GRADE_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

/**
 * The grade, in the order a colourist applies it: AO, shafts, AgX tone map,
 * split toning and lift, the night's scotopic shift, an S-curve, saturation,
 * a violet vignette and animated grain (which also dithers 8-bit banding).
 * Every number is a uniform, tunable from `atlas.post.uniforms`.
 */
/** The far blur's widest spread, as a share of the frame's height. */
const DOF_RADIUS = 0.0045;
/** Taps in the far blur's disc. */
const DOF_TAPS = 20;

export const GRADE_FRAGMENT = /* glsl */ `
uniform sampler2D tScene;
uniform vec2 resolution;
uniform float uExposure;
uniform float uLookPow;
uniform float uLookSat;
uniform float uSat;
uniform float uContrast;
uniform vec3 uShadowTint;
uniform vec3 uHighTint;
uniform float uVignette;
uniform vec3 uVignetteTint;
uniform float uLift;
uniform float uNight;
uniform float uGrain;
uniform float uFrame;
uniform sampler2D tAO;
uniform float uAO;
uniform vec3 uAOColor;
uniform float uDof;
uniform float uFocus;
${SHAFT_GRADE_PARS}
varying vec2 vUv;

// AgX (Troy Sobotka's), through Rec. 2020 primaries, with a punchy look.
const mat3 toRec2020 = mat3(
  vec3(0.6274, 0.0691, 0.0164),
  vec3(0.3293, 0.9195, 0.0880),
  vec3(0.0433, 0.0113, 0.8956)
);
const mat3 fromRec2020 = mat3(
  vec3(1.6605, -0.1246, -0.0182),
  vec3(-0.5876, 1.1329, -0.1006),
  vec3(-0.0728, -0.0083, 1.1187)
);
vec3 agxContrast(vec3 x) {
  vec3 x2 = x * x;
  vec3 x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
}
vec3 agx(vec3 color) {
  const mat3 inset = mat3(
    vec3(0.856627153315983, 0.137318972929847, 0.11189821299995),
    vec3(0.0951212405381588, 0.761241990602591, 0.0767994186031903),
    vec3(0.0482516061458583, 0.101439036467562, 0.811302368396859)
  );
  const mat3 outset = mat3(
    vec3(1.1271005818144368, -0.1413297634984383, -0.14132976349843826),
    vec3(-0.11060664309660323, 1.157823702216272, -0.11060664309660294),
    vec3(-0.016493938717834573, -0.016493938717834257, 1.2519364065950405)
  );
  const float minEv = -12.47393;
  const float maxEv = 4.026069;
  color = toRec2020 * color;
  color = inset * color;
  color = max(color, 1e-10);
  color = log2(color);
  color = (color - minEv) / (maxEv - minEv);
  color = clamp(color, 0.0, 1.0);
  color = agxContrast(color);
  color = pow(max(color, 0.0), vec3(uLookPow));
  float l = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = l + uLookSat * (color - l);
  color = outset * color;
  color = pow(max(vec3(0.0), color), vec3(2.2));
  color = fromRec2020 * color;
  return clamp(color, 0.0, 1.0);
}
float grainHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// How many pixels across a point at 'distance' is spread: nothing near the
// subject, opening to the whole radius far past it. Only the far field blurs.
float dofSpread(float distance) {
  return smoothstep(uFocus * 4.0, uFocus * 24.0, distance) * uDof * resolution.y * ${DOF_RADIUS};
}
// The far field gathered over a golden-angle disc; a tap counts only where
// its own spread reaches back this far, so a sharp near edge does not bleed
// into the blur behind it.
vec3 dofScene(vec2 uv) {
  vec3 here = texture2D(tScene, uv).rgb;
  if (uDof <= 0.0) return here;
  float spread = dofSpread(shaftDistance(texture2D(tDepth, uv).r));
  if (spread < 0.75) return here;
  vec3 sum = here;
  float weight = 1.0;
  for (int i = 0; i < ${DOF_TAPS}; i++) {
    float r = sqrt((float(i) + 0.5) / ${DOF_TAPS}.0) * spread;
    float a = float(i) * 2.39996;
    vec2 at = uv + vec2(cos(a), sin(a)) * r / resolution;
    float reach = dofSpread(shaftDistance(texture2D(tDepth, at).r));
    float w = smoothstep(r * 0.6, r, reach + 0.5);
    sum += texture2D(tScene, at).rgb * w;
    weight += w;
  }
  return sum / weight;
}

void main() {
  vec3 scene = max(dofScene(vUv), 0.0);
  if (uAO > 0.0) {
    // The AO at half resolution, blurred as it is read: a cross of five taps
    // two of its texels apart is enough to hide the spiral's pattern.
    vec2 t = 2.0 / resolution;
    float ao = texture2D(tAO, vUv).r * 0.4
      + (texture2D(tAO, vUv + vec2(t.x, 0.0)).r + texture2D(tAO, vUv - vec2(t.x, 0.0)).r
      + texture2D(tAO, vUv + vec2(0.0, t.y)).r + texture2D(tAO, vUv - vec2(0.0, t.y)).r) * 0.15;
    // Toward a deep blue rather than black: an occluded corner is in the
    // sky's shade, which is blue.
    scene = mix(scene * mix(uAOColor * 4.0, vec3(1.0), ao), scene, 1.0 - uAO);
  }
${SHAFT_GRADE}
  vec3 c = agx(scene * uExposure);
  // Graded in a perceptual space, where "a touch warmer" means the same
  // thing in the shadows as in the highlights.
  vec3 p = pow(max(c, 0.0), vec3(1.0 / 2.2));
  float l = dot(p, vec3(0.2126, 0.7152, 0.0722));
  p *= mix(uShadowTint, uHighTint, smoothstep(0.08, 0.78, l));
  p += uLift * vec3(0.55, 0.65, 1.0) * (1.0 - smoothstep(0.0, 0.35, l));
  // Night: the eye's scotopic shift toward a desaturated blue, except where
  // something is bright enough to keep its colour — a lamp, a window.
  vec3 scotopic = vec3(l) * vec3(0.74, 0.88, 1.28);
  p = mix(p, scotopic, uNight * 0.5 * (1.0 - smoothstep(0.3, 0.75, l)));
  vec3 s = p * p * (3.0 - 2.0 * p);
  p = mix(p, s, uContrast);
  float l2 = dot(p, vec3(0.2126, 0.7152, 0.0722));
  p = mix(vec3(l2), p, uSat);
  float aspect = resolution.x / max(resolution.y, 1.0);
  vec2 q = (vUv - 0.5) * vec2(aspect, 1.0);
  float vignette = smoothstep(0.35, 1.25, length(q));
  p = mix(p, p * uVignetteTint, vignette * uVignette);
  vec2 px = vUv * resolution;
  float g = grainHash(px + fract(uFrame * 0.6180339) * 311.0) + grainHash(px * 1.37 - fract(uFrame * 0.381966) * 173.0) - 1.0;
  p += g * uGrain * (0.004 + sqrt(max(l2, 0.0)) * 0.012);
  gl_FragColor = vec4(max(p, 0.0), 1.0);
}`;

/**
 * Ambient occlusion from the depth buffer alone (GTAO or SAO would draw the
 * whole scene again for normals). The position comes from depth, the normal
 * from the nearer neighbour on each axis so edges do not bleed, and twelve
 * spiral samples within `uRadius` world units are tested against the
 * hemisphere. Rendered at half resolution, blurred by the grade as it reads
 * it, and faded out by `uFar`, where depth is too coarse to say anything.
 */
export const AO_FRAGMENT = /* glsl */ `
uniform sampler2D tDepth;
uniform vec2 resolution;
uniform mat4 uProjection;
uniform mat4 uProjectionInverse;
uniform float uRadius;
uniform float uIntensity;
uniform float uFar;
varying vec2 vUv;

vec3 viewAt(vec2 uv) {
  float depth = texture2D(tDepth, uv).r;
  vec4 v = uProjectionInverse * vec4(vec3(uv, depth) * 2.0 - 1.0, 1.0);
  return v.xyz / v.w;
}

void main() {
  float depth = texture2D(tDepth, vUv).r;
  if (depth >= 1.0) { gl_FragColor = vec4(1.0); return; }
  vec3 p = viewAt(vUv);
  float distance = -p.z;
  float fade = 1.0 - smoothstep(uFar * 0.5, uFar, distance);
  if (fade <= 0.0) { gl_FragColor = vec4(1.0); return; }
  vec2 texel = 1.0 / resolution;
  vec3 px = viewAt(vUv + vec2(texel.x, 0.0)) - p;
  vec3 nx = p - viewAt(vUv - vec2(texel.x, 0.0));
  vec3 py = viewAt(vUv + vec2(0.0, texel.y)) - p;
  vec3 ny = p - viewAt(vUv - vec2(0.0, texel.y));
  vec3 dx = abs(px.z) < abs(nx.z) ? px : nx;
  vec3 dy = abs(py.z) < abs(ny.z) ? py : ny;
  vec3 n = normalize(cross(dx, dy));
  // The disc on the screen that uRadius in the world covers at this depth.
  float pixels = uRadius * uProjection[1][1] * 0.5 * resolution.y / max(distance, 1e-3);
  if (pixels < 1.0) { gl_FragColor = vec4(1.0); return; }
  float spin = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) * 6.2831853;
  float occlusion = 0.0;
  const int SAMPLES = 12;
  for (int i = 0; i < SAMPLES; i++) {
    float f = (float(i) + 0.5) / float(SAMPLES);
    float angle = spin + float(i) * 2.3999632;
    vec2 offset = vec2(cos(angle), sin(angle)) * sqrt(f) * pixels * texel;
    vec3 d = viewAt(vUv + offset) - p;
    float len = length(d);
    float range = 1.0 - smoothstep(uRadius * 0.6, uRadius * 1.6, len);
    occlusion += max(0.0, dot(n, d) / max(len, 1e-4) - 0.12) * range;
  }
  occlusion = clamp(occlusion / float(SAMPLES) * uIntensity, 0.0, 1.0) * fade;
  gl_FragColor = vec4(vec3(1.0 - occlusion), 1.0);
}`;
