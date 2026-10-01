import type * as THREE from 'three';
import { SKY_DISTANCE } from './sun.ts';
import { DAY_MOOD } from './theme.ts';

/**
 * Light shafts at a low sun: the crepuscular rays, the "god rays" through a
 * gap in the clouds, a wood, a ridge, a line of masts or a town's roofs at
 * dawn and at dusk.
 *
 * **Depth alone, and the scene is never drawn again.** `post.ts` already
 * resolves the depth of every frame for its ambient occlusion, and everything
 * that can hide the sun is in it: the land and the sea, the towns, the leaf
 * cards (alpha-tested, so a crown writes depth with its holes in it) and the
 * cloud deck (alpha to coverage, so it writes depth where it is drawn). The
 * sky is not in it — the dome draws last and pins itself to the far plane, and
 * both discs hang at `SKY_DISTANCE` — so a pixel further than half that is
 * sky and everything nearer is in the way (`SHAFT_SKY`). Three's own god-rays
 * example draws the scene a second time for a mask, which on this scene is
 * millions of triangles for one effect; and a volumetric pass marched through
 * the shadow map would see nothing the rays are about, because the map covers
 * 170 units round the player and the land never casts into it (`sun.ts`).
 *
 * So the pass is screen space, GPU Gems 3 chapter 13 at a quarter of the
 * buffer: a mask of open sky round the sun on the screen, blurred toward the
 * sun twice — coarse taps the whole way, then fine ones over one coarse step,
 * which is `SHAFT_TAPS` squared samples for twice `SHAFT_TAPS` reads — and
 * laid over the frame as light in the air before the tone map, so AgX rolls
 * it off like any other highlight and the bloom never sees it.
 *
 * **Light in the air, not a filter.** What a shaft is, is the air between the
 * eye and the thing seen being lit, and how much of it there is scales with
 * how far away that thing is: the rays show over the far hills and the sky
 * between trunks, not on the trunk beside you or the hero's back
 * (`SHAFT_AIR`). And nothing within `SHAFT_NEAR` of the lens casts one, which
 * is where the hero stands: his silhouette against a low sun throwing rays
 * across half the frame is the look this pass must never have.
 *
 * This file is the model — when there are shafts and where the sun is on the
 * screen, both pure and checked headless in `scripts/check-weather.ts` — and
 * the two programs; `post.ts` runs them.
 */

/**
 * Degrees of sun elevation the shafts rise over: none from a sun four degrees
 * under the horizon, full from one a degree over it. Twilight rays fan up
 * from a sun that has already set — the sky round it is still lit and the
 * clouds and the ridge still cut it into rays — so the fade starts under the
 * horizon rather than at it.
 */
export const SHAFT_RISE: readonly [number, number] = [-4, 1];

/**
 * Degrees the shafts fall from full to `SHAFT_FLOOR` over as the sun climbs.
 * A low sun is a long path through the air and the rays are its whole look; a
 * high one leaves a little, which is the rays through a canopy seen looking
 * up at midday.
 */
export const SHAFT_HIGH: readonly [number, number] = [6, 35];
export const SHAFT_FLOOR = 0.35;

/**
 * The overcast band the shafts go out over: the cast shadow's own
 * (`smoothstep(overcast, 0.3, 0.8)` in `sun.ts`), so rays and shadows come and
 * go together. A whole deck with no rain reads only 0.3 (`weather-view.ts`),
 * which keeps its rays: where the deck is solid the mask already says so.
 */
export const SHAFT_OVERCAST: readonly [number, number] = [0.3, 0.8];

/**
 * Mist is what the rays are made of, up to a point: a morning haze makes them
 * stronger by up to `SHAFT_MIST_GAIN`, and a fog that hides the sun takes them
 * away over this band.
 */
export const SHAFT_MIST: readonly [number, number] = [0.7, 1];
export const SHAFT_MIST_GAIN = 0.5;

/**
 * How far past the frame's edge the sun can be and still cast rays into it,
 * in normalised device coordinates on the larger axis: full to 1.1, none by
 * 1.8. A sun just over the top of the frame, or under its bottom at dusk while
 * you look at the clouds, still lights the air in it.
 */
export const SHAFT_EDGE: readonly [number, number] = [1.1, 1.8];

/**
 * Units past which a pixel is sky. **Derived, not chosen**: the discs hang at
 * `SKY_DISTANCE` and the dome at the far plane, and the furthest ground ever in
 * view is 35,800 units off (the far limb from the plane's ceiling, `sun.ts`),
 * so half of `SKY_DISTANCE` is past the one and short of the other with room
 * either side. If `SKY_DISTANCE` or the ceiling moves, `pnpm weather` says so.
 */
export const SHAFT_SKY = SKY_DISTANCE / 2;

/**
 * Nothing nearer the lens than the hero casts a ray: open up to this multiple
 * of his distance from it (`Post.shafts.subject`), wholly counted from the
 * second. On foot he stands 12 to 14 units in front of the camera
 * (`WALK_FRAMING` in `camera.ts`), and a low sun behind his head threw his
 * whole silhouette down the frame as a dark fan. In your own eyes he is the
 * eye's height away and the cut is nothing.
 */
export const SHAFT_NEAR: readonly [number, number] = [1.1, 1.6];
/**
 * Units past which the hero's distance stops pushing the cut out: from far
 * back or from the plane's circuit he is a speck, and what stands near him
 * should cast.
 */
export const SHAFT_NEAR_MOST = 80;

/**
 * Units of air in front of a pixel over which its shaft light comes in: none
 * on something this near, all of it from the second on. See the note on the
 * file: the light is the air's, and there is little air in front of the hero.
 */
export const SHAFT_AIR: readonly [number, number] = [40, 1500];

/** How far the open sky round the sun lights the mask, in screen heights. */
export const SHAFT_RADIUS = 0.25;

/** Taps per blur pass. Two passes, so `SHAFT_TAPS` squared samples along each ray. */
export const SHAFT_TAPS = 24;

/**
 * Weight kept per coarse tap on the way to the sun. None is lost: the glow's
 * share of the way already thins a ray as it leaves the sun — a pixel twice as
 * far from it has half as many of its taps inside `SHAFT_RADIUS` — so a decay
 * on top would only shorten the rays. Kept as a knob for tuning against a
 * frame (`atlas.post.shaftUniforms.uDecay`).
 */
export const SHAFT_DECAY = 1;

/**
 * The shape of the light, as two powers: of the glow an open sky would give
 * (`reach`: under 1 carries the rays further from the sun), and of the share
 * of it that gets through (`contrast`: over 1 darkens a half-lit ray more than
 * a lit one, which is what makes a ray read as a ray rather than as haze).
 */
export const SHAFT_SHAPE: readonly [number, number] = [0.75, 2];

/**
 * How soft a ray's edge is: the fine blur spreads its taps across the ray by
 * this share of the distance to the sun, so an edge straight through the sun
 * is a penumbra that widens away from it rather than a ruled line.
 */
export const SHAFT_SOFT = 0.15;

/**
 * The shafts' light at full strength, as a share of the sun's own colour in
 * the linear, pre-exposure frame.
 */
export const SHAFT_GAIN = 0.8;

/** Below this strength times on-screen fade the passes do not run at all. */
export const SHAFT_MIN = 0.002;

export interface ShaftInput {
  /** Degrees of sun above the player's horizon (`SkyState.elevation`). */
  elevation: number;
  /** 0 to 1, the weather's grey (`Sky.weather.overcast`). */
  overcast: number;
  /** 0 to 1, the weather's haze (`Sky.weather.mist`). */
  mist: number;
  /** 0 to 1, how far the camera has climbed out of the air (`SkyState.space`). */
  space: number;
  /** Under the sea there is no sky to be lit by. */
  underwater: boolean;
}

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * How strong the shafts are, 0 to about 1.3: 1 is a clear sky and a sun under
 * `SHAFT_HIGH`'s first degree. Everything in it is a fade, so a day scrubbed
 * at any rate never pops — `pnpm weather` walks one at Palma in two-second
 * steps through `sun.ts` itself.
 */
export function shaftStrength(input: ShaftInput): number {
  if (input.underwater) return 0;
  const rise = smoothstep(SHAFT_RISE[0], SHAFT_RISE[1], input.elevation);
  const low = SHAFT_FLOOR + (1 - SHAFT_FLOOR) * (1 - smoothstep(SHAFT_HIGH[0], SHAFT_HIGH[1], input.elevation));
  const sun = 1 - smoothstep(SHAFT_OVERCAST[0], SHAFT_OVERCAST[1], input.overcast);
  const mist = Math.min(1, Math.max(0, input.mist));
  const air = (1 + SHAFT_MIST_GAIN * mist) * (1 - smoothstep(SHAFT_MIST[0], SHAFT_MIST[1], mist));
  return rise * low * sun * air * (1 - Math.min(1, Math.max(0, input.space)));
}

/** The camera as far as `sunOnScreen` needs it; a three `Camera` is one. */
export interface ShaftCamera {
  matrixWorldInverse: { elements: ArrayLike<number> };
  projectionMatrix: { elements: ArrayLike<number> };
}

/**
 * Where the sun is on the screen, and how much of it counts: writes its
 * texture coordinates into `outUv` and returns 1 while it is inside the frame,
 * fading to 0 by `SHAFT_EDGE` outside it, and 0 behind the camera.
 *
 * A direction, not a point: `dir` goes through the view's rotation only
 * (`w = 0`), which is what a sun at infinity is. The camera's matrices are as
 * of its last render. Nothing allocates.
 */
export function sunOnScreen(camera: ShaftCamera, dir: { x: number; y: number; z: number }, outUv: { x: number; y: number }): number {
  const v = camera.matrixWorldInverse.elements;
  const x = v[0]! * dir.x + v[4]! * dir.y + v[8]! * dir.z;
  const y = v[1]! * dir.x + v[5]! * dir.y + v[9]! * dir.z;
  const z = v[2]! * dir.x + v[6]! * dir.y + v[10]! * dir.z;
  const p = camera.projectionMatrix.elements;
  const clipX = p[0]! * x + p[4]! * y + p[8]! * z;
  const clipY = p[1]! * x + p[5]! * y + p[9]! * z;
  const clipW = p[3]! * x + p[7]! * y + p[11]! * z;
  if (!(clipW > 1e-6)) {
    outUv.x = 0.5;
    outUv.y = 0.5;
    return 0;
  }
  const ndcX = clipX / clipW;
  const ndcY = clipY / clipW;
  outUv.x = ndcX * 0.5 + 0.5;
  outUv.y = ndcY * 0.5 + 0.5;
  return 1 - smoothstep(SHAFT_EDGE[0], SHAFT_EDGE[1], Math.max(Math.abs(ndcX), Math.abs(ndcY)));
}

/**
 * The shafts' light: the sun's colour and brightness as the mood and the
 * weather have left them, over its full-day intensity, so a dusk's rays are
 * the dusk's orange and a greyed sun's are grey. Written into `out`.
 */
export function shaftLight(sun: THREE.DirectionalLight, out: THREE.Color): THREE.Color {
  return out.copy(sun.color).multiplyScalar(sun.intensity / DAY_MOOD.sunIntensity);
}

const float = (x: number): string => (Number.isInteger(x) ? x.toFixed(1) : String(x));

/** View distance from a depth-buffer value, for a perspective camera's `near, far`. */
const DISTANCE_GLSL = /* glsl */ `
float shaftDistance(float depth) {
  return uCamera.x * uCamera.y / (uCamera.y - (uCamera.y - uCamera.x) * depth);
}`;

/**
 * The mask, at a quarter of the buffer: how much of the pixel is open sky, as
 * four depth taps spread over its 4x4 block of the full buffer — one tap would
 * flicker on every leaf, wire and dithered cloud rim as it crosses a quarter
 * texel — times a falloff round the sun on the screen; and in green the
 * falloff alone, what the pixel would give if nothing stood in the way. Both
 * go through the same blurs, so the grade can tell a ray from a glow.
 */
export const SHAFT_MASK_FRAGMENT = /* glsl */ `
uniform sampler2D tDepth;
uniform vec2 uTexel;
uniform vec2 uSun;
uniform float uAspect;
uniform vec2 uCamera;
uniform vec2 uNear;
uniform float uRadius;
varying vec2 vUv;
${DISTANCE_GLSL}
float shaftOpen(vec2 uv) {
  float z = shaftDistance(texture2D(tDepth, uv).r);
  return max(step(${float(SHAFT_SKY)}, z), 1.0 - smoothstep(uNear.x, uNear.y, z));
}
void main() {
  vec2 o = 1.5 * uTexel;
  float open = 0.25 * (shaftOpen(vUv - o) + shaftOpen(vUv + o)
    + shaftOpen(vUv + vec2(o.x, -o.y)) + shaftOpen(vUv + vec2(-o.x, o.y)));
  float r = length((vUv - uSun) * vec2(uAspect, 1.0));
  float glow = 1.0 - smoothstep(0.0, uRadius, r);
  gl_FragColor = vec4(open * glow, glow, 0.0, 1.0);
}`;

/**
 * One radial blur toward the sun: `SHAFT_TAPS` taps, `uStep` of the way to it
 * apart, each `uDecay` of the last, started a per-pixel fraction of a step
 * along (interleaved gradient noise, the AO's) so the steps are a fine static
 * grain and not a stack of ghost copies of every occluder.
 */
export const SHAFT_BLUR_FRAGMENT = /* glsl */ `
uniform sampler2D tInput;
uniform vec2 uSun;
uniform float uAspect;
uniform float uStep;
uniform float uDecay;
uniform float uSpread;
uniform float uSeed;
varying vec2 vUv;
void main() {
  vec2 delta = (uSun - vUv) * uStep;
  // Across the ray, as long as the way to the sun: a spread that widens with it.
  vec2 toward = (uSun - vUv) * vec2(uAspect, 1.0);
  vec2 across = vec2(-toward.y, toward.x) / vec2(uAspect, 1.0) * uSpread;
  float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy + uSeed, vec2(0.06711056, 0.00583715))));
  vec2 uv = vUv + delta * jitter;
  vec2 sum = vec2(0.0);
  float total = 0.0;
  float w = 1.0;
  for (int i = 0; i < ${SHAFT_TAPS}; i++) {
    float side = fract(float(i) * 0.618034 + jitter) - 0.5;
    sum += texture2D(tInput, uv + across * side).rg * w;
    total += w;
    w *= uDecay;
    uv += delta;
  }
  gl_FragColor = vec4(sum / total, 0.0, 1.0);
}`;

/** What the grade declares for the shafts. */
export const SHAFT_GRADE_PARS = /* glsl */ `
uniform sampler2D tShafts;
uniform sampler2D tDepth;
uniform float uShafts;
uniform vec3 uShaftColor;
uniform vec2 uShaftAir;
uniform vec2 uShaftShape;
uniform vec2 uCamera;
${DISTANCE_GLSL}`;

/** The shafts laid over the linear frame, before the exposure and the tone map. */
export const SHAFT_GRADE = /* glsl */ `
  if (uShafts > 0.0) {
    vec2 ray = texture2D(tShafts, vUv).rg;
    float through = clamp(ray.x / max(ray.y, 1e-4), 0.0, 1.0);
    float z = shaftDistance(texture2D(tDepth, vUv).r);
    float air = smoothstep(uShaftAir.x, uShaftAir.y, z);
    float reach = uShafts * air * pow(max(ray.y, 0.0), uShaftShape.x);
    scene += uShaftColor * (reach * pow(through, uShaftShape.y));
  }`;
