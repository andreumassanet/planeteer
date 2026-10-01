import * as THREE from 'three';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

/**
 * The frame after the scene: the light graded into a picture.
 *
 * The world is lit in linear light into a half-float target, multisampled,
 * and three things happen to it on the way to the screen:
 *
 * - **Bloom**: whatever is brighter than white spills a soft halo — the sun's
 *   path on the sea, a lit window, a lamp, the rim of a cloud at dusk.
 * - **Tone mapping and the grade**: AgX compresses the highlights instead of
 *   clipping them, then a look is laid over it — shadows a touch cooler and
 *   highlights a touch warmer (split toning), a lift of the blacks toward blue
 *   so nothing is ever pitch black, a soft S-curve, a little saturation, and a
 *   vignette tinted violet rather than black. This is where a painting's
 *   atmosphere comes from, and it costs one full-screen pass.
 * - **Grain**: a fine, animated noise under a byte, which also dithers the
 *   gradients of the sky and the haze that eight bits would band.
 *
 * Nothing the world draws needs to know: every material still writes linear
 * colour, and `renderer.toneMapping` stays off because the grade does it.
 */
export interface Post {
  /** Draws `scene` from `camera` through the whole chain onto the canvas. */
  render(scene: THREE.Scene, camera: THREE.Camera): void;
  /** Call on every resize and change of pixel ratio. */
  setSize(width: number, height: number): void;
  /** How the scene itself is drawn into the target: the renderer's, or the ink's two passes. */
  draw: (scene: THREE.Scene, camera: THREE.Camera) => void;
  /** Exposure before the tone map; 1 is neutral. */
  exposure: number;
  /** How far toward night the grade has gone, 0 to 1: bluer, flatter and less saturated. */
  night: number;
  bloom: UnrealBloomPass;
  /** How much of the ambient occlusion is laid on, 0 to 1. */
  ao: number;
  /** Whether the chain runs at all; off, the scene is drawn straight to the canvas. */
  enabled: boolean;
}

/**
 * The grade, in the order a colourist would apply it. Every number is a
 * uniform so it can be tuned against a frame from the console
 * (`atlas.post.uniforms`).
 */
const GRADE_FRAGMENT = /* glsl */ `
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

void main() {
  vec3 scene = max(texture2D(tScene, vUv).rgb, 0.0);
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

/** How wide the AO looks, in world units: about a body, which is the scale of a corner. */
const AO_RADIUS = 4;

/**
 * The luminance, in the scene's linear light before the exposure, over which
 * the bloom takes a pixel. Exported because what is *meant* not to bloom is
 * decided elsewhere against it: a floodlit landmark is capped under it
 * (`FLOOD_CAP` in `lights.ts`) and `pnpm check` holds the cap to this number
 * rather than to a copy of it.
 */
export const BLOOM_THRESHOLD = 0.92;

const GRADE_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

/**
 * Ambient occlusion from the depth buffer alone: the soft dark where a wall
 * meets the ground, under a tree, between two houses, round a foot in the
 * grass. It is the difference between a thing standing on the ground and a
 * thing pasted over it, and the soft light made that difference more visible,
 * not less — the ink used to draw it.
 *
 * **Depth alone**, because the alternative (GTAO, SAO) draws the whole scene
 * a second time for its normals, and this scene is millions of triangles. The
 * position is reconstructed from depth, the normal from the neighbouring
 * positions (the nearer of each pair, so an edge does not bleed across), and
 * twelve samples on a spiral a disc of `uRadius` world units wide are tested
 * against the hemisphere over that normal. Half resolution; the grade blurs
 * it as it reads it. Faded out with distance (`uFar`), where a pixel is metres
 * across and the depth too coarse to say anything.
 */
const AO_FRAGMENT = /* glsl */ `
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

export function createPost(renderer: THREE.WebGLRenderer): Post {
  // Half float where the card can render to it, which is every WebGL2 desktop
  // in practice; eight bits otherwise, which still grades but cannot bloom
  // anything past white.
  const float = renderer.extensions.has('EXT_color_buffer_float');
  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: float ? THREE.HalfFloatType : THREE.UnsignedByteType,
    samples: 4,
    depthBuffer: true,
  });
  target.texture.name = 'post:scene';
  // The depth the AO reads, resolved from the multisampled buffer.
  target.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
  const aoTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedByteType, depthBuffer: false });
  aoTarget.texture.name = 'post:ao';
  const aoUniforms = {
    tDepth: { value: target.depthTexture },
    resolution: { value: new THREE.Vector2(1, 1) },
    uProjection: { value: new THREE.Matrix4() },
    uProjectionInverse: { value: new THREE.Matrix4() },
    uRadius: { value: AO_RADIUS },
    uIntensity: { value: 1.6 },
    uFar: { value: 260 },
  };
  const aoMaterial = new THREE.ShaderMaterial({
    name: 'post:ao',
    uniforms: aoUniforms,
    vertexShader: GRADE_VERTEX,
    fragmentShader: AO_FRAGMENT,
    depthTest: false,
    depthWrite: false,
  });
  // A scratch target the bloom pass's signature asks for and never writes.
  const scratch = new THREE.WebGLRenderTarget(1, 1, { type: target.texture.type });

  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.22, 0.55, BLOOM_THRESHOLD);

  const uniforms = {
    tScene: { value: target.texture },
    resolution: { value: new THREE.Vector2(1, 1) },
    uExposure: { value: 1.4 },
    uLookPow: { value: 1.12 },
    uLookSat: { value: 1.3 },
    uSat: { value: 1.18 },
    uContrast: { value: 0.22 },
    uShadowTint: { value: new THREE.Vector3(0.95, 0.98, 1.06) },
    uHighTint: { value: new THREE.Vector3(1.035, 1, 0.95) },
    uVignette: { value: 0.38 },
    uVignetteTint: { value: new THREE.Vector3(0.62, 0.6, 0.72) },
    uLift: { value: 0.012 },
    uNight: { value: 0 },
    uGrain: { value: 1 },
    uFrame: { value: 0 },
    tAO: { value: aoTarget.texture },
    uAO: { value: 1 },
    uAOColor: { value: new THREE.Vector3(0.06, 0.07, 0.14) },
  };
  const grade = new THREE.ShaderMaterial({
    name: 'post:grade',
    uniforms,
    vertexShader: GRADE_VERTEX,
    fragmentShader: GRADE_FRAGMENT,
    depthTest: false,
    depthWrite: false,
  });
  const quadScene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), grade);
  quad.frustumCulled = false;
  quadScene.add(quad);
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const aoScene = new THREE.Scene();
  const aoQuad = new THREE.Mesh(quad.geometry, aoMaterial);
  aoQuad.frustumCulled = false;
  aoScene.add(aoQuad);
  const size = new THREE.Vector2();
  let frame = 0;

  const post: Post = {
    draw: (scene, camera) => renderer.render(scene, camera),
    get exposure() {
      return uniforms.uExposure.value;
    },
    set exposure(value: number) {
      uniforms.uExposure.value = value;
    },
    get night() {
      return uniforms.uNight.value;
    },
    set night(value: number) {
      uniforms.uNight.value = value;
      // The night's grade: cooler shadows, bluer and deeper lift, less colour.
      uniforms.uShadowTint.value.set(0.95 - 0.05 * value, 0.98, 1.06 + 0.06 * value);
      uniforms.uLift.value = 0.012 + 0.018 * value;
      uniforms.uSat.value = 1.18 - 0.2 * value;
    },
    bloom,
    ao: 1,
    enabled: true,
    render(scene, camera) {
      if (!post.enabled) {
        renderer.setRenderTarget(null);
        post.draw(scene, camera);
        return;
      }
      // Sized to the drawing buffer on every frame, not only on a resize: the
      // menu resizes the canvas itself before the world's own handler exists,
      // and a target left at its birth size draws the screen from one pixel.
      renderer.getDrawingBufferSize(size);
      if (size.x !== target.width || size.y !== target.height) post.setSize(size.x, size.y);
      renderer.setRenderTarget(target);
      post.draw(scene, camera);
      // Only through a perspective lens: the reconstruction assumes one.
      const occluded = post.ao > 0 && (camera as THREE.PerspectiveCamera).isPerspectiveCamera === true;
      uniforms.uAO.value = occluded ? post.ao : 0;
      if (occluded) {
        aoUniforms.uProjection.value.copy(camera.projectionMatrix);
        aoUniforms.uProjectionInverse.value.copy(camera.projectionMatrixInverse);
        renderer.setRenderTarget(aoTarget);
        renderer.render(aoScene, quadCamera);
      }
      if (bloom.enabled && bloom.strength > 0) bloom.render(renderer, scratch, target, 0, false);
      uniforms.uFrame.value = frame = (frame + 1) % 1000;
      renderer.setRenderTarget(null);
      renderer.render(quadScene, quadCamera);
    },
    setSize(width, height) {
      renderer.getDrawingBufferSize(size);
      target.setSize(size.x, size.y);
      scratch.setSize(size.x, size.y);
      // The bloom works at half the buffer and down from there: the halo is
      // soft by nature, and a full-size first level is the most expensive
      // step of the pass for nothing an eye can see.
      bloom.setSize(Math.max(1, Math.round(size.x / 2)), Math.max(1, Math.round(size.y / 2)));
      aoTarget.setSize(Math.max(1, Math.round(size.x / 2)), Math.max(1, Math.round(size.y / 2)));
      aoUniforms.resolution.value.set(aoTarget.width, aoTarget.height);
      uniforms.resolution.value.set(size.x, size.y);
      void width;
      void height;
    },
  };
  (post as Post & { uniforms: typeof uniforms; target: THREE.WebGLRenderTarget; renderer: THREE.WebGLRenderer }).uniforms = uniforms;
  (post as unknown as { target: THREE.WebGLRenderTarget }).target = target;
  (post as unknown as { renderer: THREE.WebGLRenderer }).renderer = renderer;
  return post;
}
