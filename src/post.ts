/**
 * The frame after the scene. The world is drawn in linear light into a
 * multisampled half-float target, then gets ambient occlusion, light shafts
 * at a low sun, bloom for whatever is brighter than white, and the grade
 * (`post/shaders.ts`): AgX tone mapping, split toning, a vignette and grain.
 * Materials still write linear colour, and `renderer.toneMapping` stays off
 * because the grade does it.
 */
import * as THREE from 'three';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SHAFT_AIR, SHAFT_GAIN, SHAFT_MIN, SHAFT_NEAR, SHAFT_NEAR_MOST, SHAFT_SHAPE, sunOnScreen } from './shafts.ts';
import { AO_FRAGMENT, GRADE_FRAGMENT, GRADE_VERTEX } from './post/shaders.ts';
import { createShaftPasses } from './post/shaft-passes.ts';

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
  /** How much the far field is blurred, 0 to 1; focused on `shafts.subject`. */
  dof: number;
  /**
   * Whether the frame about to be drawn has a subject to focus on: the world's
   * own frame sets it each time, and a draw spends it, so the menu, a map or
   * another world is never blurred by a subject that is not there.
   */
  focused: boolean;
  /** Whether the chain runs at all; off, the scene is drawn straight to the canvas. */
  enabled: boolean;
  /**
   * Light shafts, set every frame: the unit vector toward the sun, its
   * light's colour, how strong the hour and weather allow, and the hero's
   * distance from the camera (nothing nearer casts a ray). A numeric
   * `override` stands in for `strength`.
   */
  shafts: { direction: THREE.Vector3; color: THREE.Color; strength: number; subject: number; override?: number };
  /** What the last frame ran: `shafts` is 1 when the shaft passes drew. */
  stats: { shafts: number };
}

/** The nearest the far blur focuses, world units: a camera pulled in to the head still keeps the street sharp. */
const DOF_NEAREST = 10;

/** How wide the AO reaches, world units: about a body, the scale of a corner. */
const AO_RADIUS = 4;

/**
 * The linear luminance, before exposure, above which a pixel blooms. A
 * floodlit landmark is capped under it (`FLOOD_CAP` in `lights.ts`), and
 * `pnpm check` compares the cap against this export.
 */
export const BLOOM_THRESHOLD = 0.92;

/** The ambient occlusion pass: a half-resolution target and the full-screen scene that fills it. */
function createAoPass(depth: THREE.DepthTexture, quad: () => THREE.BufferGeometry) {
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedByteType, depthBuffer: false });
  target.texture.name = 'post:ao';
  const uniforms = {
    tDepth: { value: depth },
    resolution: { value: new THREE.Vector2(1, 1) },
    uProjection: { value: new THREE.Matrix4() },
    uProjectionInverse: { value: new THREE.Matrix4() },
    uRadius: { value: AO_RADIUS },
    uIntensity: { value: 1.6 },
    uFar: { value: 260 },
  };
  const material = new THREE.ShaderMaterial({
    name: 'post:ao',
    uniforms,
    vertexShader: GRADE_VERTEX,
    fragmentShader: AO_FRAGMENT,
    depthTest: false,
    depthWrite: false,
  });
  const scene = new THREE.Scene();
  return {
    target,
    uniforms,
    scene,
    /** Adds the quad; called once the grade's quad geometry exists, which it shares. */
    finish(): void {
      const mesh = new THREE.Mesh(quad(), material);
      mesh.frustumCulled = false;
      scene.add(mesh);
    },
  };
}

/** The grade's uniforms at their default look. */
function gradeUniforms(scene: THREE.Texture, ao: THREE.Texture, shafts: THREE.Texture, depth: THREE.Texture | null) {
  return {
    tScene: { value: scene },
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
    tAO: { value: ao },
    uAO: { value: 1 },
    uAOColor: { value: new THREE.Vector3(0.06, 0.07, 0.14) },
    uDof: { value: 0 },
    uFocus: { value: 12 },
    tShafts: { value: shafts },
    tDepth: { value: depth },
    uShafts: { value: 0 },
    uShaftColor: { value: new THREE.Color() },
    uShaftAir: { value: new THREE.Vector2(SHAFT_AIR[0], SHAFT_AIR[1]) },
    uShaftShape: { value: new THREE.Vector2(SHAFT_SHAPE[0], SHAFT_SHAPE[1]) },
    uCamera: { value: new THREE.Vector2(1, 2) },
  };
}

export function createPost(renderer: THREE.WebGLRenderer): Post {
  // Half float wherever the GPU can render to it; eight bits still grade but cannot bloom past white.
  const float = renderer.extensions.has('EXT_color_buffer_float');
  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: float ? THREE.HalfFloatType : THREE.UnsignedByteType,
    samples: 4,
    depthBuffer: true,
  });
  target.texture.name = 'post:scene';
  // The depth the AO and shafts read, resolved from the multisampled buffer.
  target.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
  const ao = createAoPass(target.depthTexture, () => quad.geometry);
  // Compiled now, so the first dusk does not link a program mid-walk.
  const shafts = createShaftPasses(renderer, target.depthTexture, target.texture.type);
  // A scratch target the bloom pass's signature asks for and never writes.
  const scratch = new THREE.WebGLRenderTarget(1, 1, { type: target.texture.type });
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.22, 0.55, BLOOM_THRESHOLD);

  const uniforms = gradeUniforms(target.texture, ao.target.texture, shafts.texture, target.depthTexture);
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
  ao.finish();
  const size = new THREE.Vector2();
  let frame = 0;

  /** The shafts, only while some are on screen: at night, under cloud or facing away, no pass runs. */
  function renderShafts(camera: THREE.Camera): void {
    const lens = camera as THREE.PerspectiveCamera;
    const wanted = post.shafts.override ?? post.shafts.strength;
    const lit = lens.isPerspectiveCamera === true && wanted > 0
      ? wanted * sunOnScreen(camera, post.shafts.direction, shafts.uniforms.uSun.value)
      : 0;
    post.stats.shafts = lit > SHAFT_MIN ? 1 : 0;
    uniforms.uShafts.value = post.stats.shafts * lit;
    if (post.stats.shafts === 1) {
      uniforms.uShaftColor.value.copy(post.shafts.color).multiplyScalar(SHAFT_GAIN);
      uniforms.uCamera.value.set(lens.near, lens.far);
      const subject = Math.min(post.shafts.subject, SHAFT_NEAR_MOST);
      shafts.uniforms.uNear.value.set(subject * SHAFT_NEAR[0], subject * SHAFT_NEAR[1]);
      shafts.render(lens);
    }
  }

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
      // Cooler shadows, a bluer and deeper lift, less colour.
      uniforms.uShadowTint.value.set(0.95 - 0.05 * value, 0.98, 1.06 + 0.06 * value);
      uniforms.uLift.value = 0.012 + 0.018 * value;
      uniforms.uSat.value = 1.18 - 0.2 * value;
    },
    bloom,
    ao: 1,
    dof: 1,
    focused: false,
    enabled: true,
    shafts: { direction: new THREE.Vector3(0, 1, 0), color: new THREE.Color(1, 1, 1), strength: 0, subject: 0 },
    stats: { shafts: 0 },
    render(scene, camera) {
      if (!post.enabled) {
        post.stats.shafts = 0;
        renderer.setRenderTarget(null);
        post.draw(scene, camera);
        return;
      }
      // Sized every frame: the menu resizes the canvas before the world's resize handler exists.
      renderer.getDrawingBufferSize(size);
      if (size.x !== target.width || size.y !== target.height) post.setSize(size.x, size.y);
      renderer.setRenderTarget(target);
      post.draw(scene, camera);
      // The depth reconstruction assumes a perspective camera.
      const occluded = post.ao > 0 && (camera as THREE.PerspectiveCamera).isPerspectiveCamera === true;
      uniforms.uAO.value = occluded ? post.ao : 0;
      if (occluded) {
        ao.uniforms.uProjection.value.copy(camera.projectionMatrix);
        ao.uniforms.uProjectionInverse.value.copy(camera.projectionMatrixInverse);
        renderer.setRenderTarget(ao.target);
        renderer.render(ao.scene, quadCamera);
      }
      renderShafts(camera);
      const lens = camera as THREE.PerspectiveCamera;
      uniforms.uDof.value = lens.isPerspectiveCamera === true && post.focused ? post.dof : 0;
      post.focused = false;
      if (uniforms.uDof.value > 0) {
        uniforms.uCamera.value.set(lens.near, lens.far);
        uniforms.uFocus.value = Math.max(post.shafts.subject, DOF_NEAREST);
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
      // Bloom and AO at half the buffer: both are soft by nature.
      bloom.setSize(Math.max(1, Math.round(size.x / 2)), Math.max(1, Math.round(size.y / 2)));
      ao.target.setSize(Math.max(1, Math.round(size.x / 2)), Math.max(1, Math.round(size.y / 2)));
      ao.uniforms.resolution.value.set(ao.target.width, ao.target.height);
      shafts.setSize(size.x, size.y);
      uniforms.resolution.value.set(size.x, size.y);
      void width;
      void height;
    },
  };
  // For tuning from the console (`atlas.post.uniforms`, `.shaftUniforms`).
  (post as Post & { uniforms: typeof uniforms; target: THREE.WebGLRenderTarget; renderer: THREE.WebGLRenderer }).uniforms = uniforms;
  (post as unknown as { target: THREE.WebGLRenderTarget }).target = target;
  (post as unknown as { renderer: THREE.WebGLRenderer }).renderer = renderer;
  (post as unknown as { shaftUniforms: typeof shafts.uniforms }).shaftUniforms = shafts.uniforms;
  return post;
}
