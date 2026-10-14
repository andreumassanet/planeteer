/**
 * The light shafts' three passes (`shafts.ts`), at a quarter of the buffer
 * each way: the mask of open sky round the sun into `a`, a coarse blur toward
 * the sun into `b`, and a fine one back into `a`, which the grade reads. Two
 * channels, the ray and the unobstructed glow, at the frame's own type: the
 * grade divides one by the other, and both are small enough that eight bits
 * would band.
 */
import * as THREE from 'three';
import { SHAFT_BLUR_FRAGMENT, SHAFT_DECAY, SHAFT_MASK_FRAGMENT, SHAFT_RADIUS, SHAFT_SOFT, SHAFT_TAPS } from '../shafts.ts';
import { GRADE_VERTEX } from './shaders.ts';

export function createShaftPasses(renderer: THREE.WebGLRenderer, depth: THREE.Texture | null, type: THREE.TextureDataType) {
  const options = { type, format: THREE.RGFormat, depthBuffer: false };
  const a = new THREE.WebGLRenderTarget(1, 1, options);
  const b = new THREE.WebGLRenderTarget(1, 1, options);
  a.texture.name = 'post:shafts';
  b.texture.name = 'post:shafts-coarse';
  const uniforms = {
    tDepth: { value: depth },
    tInput: { value: a.texture },
    uTexel: { value: new THREE.Vector2(1, 1) },
    uSun: { value: new THREE.Vector2(0.5, 0.5) },
    uAspect: { value: 1 },
    uCamera: { value: new THREE.Vector2(1, 2) },
    uNear: { value: new THREE.Vector2(0, 1) },
    uRadius: { value: SHAFT_RADIUS },
    uStep: { value: 1 / SHAFT_TAPS },
    uDecay: { value: SHAFT_DECAY },
    uSpread: { value: SHAFT_SOFT },
    uSeed: { value: 0 },
  };
  const pass = (name: string, fragmentShader: string): THREE.Scene => {
    const material = new THREE.ShaderMaterial({
      name,
      uniforms,
      vertexShader: GRADE_VERTEX,
      fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    quad.frustumCulled = false;
    return new THREE.Scene().add(quad);
  };
  const mask = pass('post:shaft-mask', SHAFT_MASK_FRAGMENT);
  const blur = pass('post:shaft-blur', SHAFT_BLUR_FRAGMENT);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  // Compiled against their own target: the program key includes the output
  // colour space, which a target and the canvas do not share.
  const was = renderer.getRenderTarget();
  renderer.setRenderTarget(a);
  renderer.compile(mask, camera);
  renderer.compile(blur, camera);
  renderer.setRenderTarget(was);
  return {
    texture: a.texture,
    uniforms,
    /** Runs the three passes; `uSun` has been written by `sunOnScreen`. */
    render(lens: THREE.PerspectiveCamera): void {
      uniforms.uCamera.value.set(lens.near, lens.far);
      renderer.setRenderTarget(a);
      renderer.render(mask, camera);
      // Coarse: the whole way to the sun, straight at it.
      const decay = uniforms.uDecay.value;
      const spread = uniforms.uSpread.value;
      uniforms.tInput.value = a.texture;
      uniforms.uStep.value = 1 / SHAFT_TAPS;
      uniforms.uSpread.value = 0;
      uniforms.uSeed.value = 0;
      renderer.setRenderTarget(b);
      renderer.render(blur, camera);
      // Fine: one coarse step evenly (filling the gaps between its taps), spread a little to soften the edges.
      uniforms.tInput.value = b.texture;
      uniforms.uStep.value = 1 / (SHAFT_TAPS * SHAFT_TAPS);
      uniforms.uDecay.value = 1;
      uniforms.uSpread.value = spread;
      uniforms.uSeed.value = 37;
      renderer.setRenderTarget(a);
      renderer.render(blur, camera);
      uniforms.uDecay.value = decay;
    },
    setSize(width: number, height: number): void {
      const w = Math.max(1, Math.round(width / 4));
      const h = Math.max(1, Math.round(height / 4));
      a.setSize(w, h);
      b.setSize(w, h);
      uniforms.uTexel.value.set(1 / width, 1 / height);
      uniforms.uAspect.value = width / Math.max(1, height);
    },
  };
}
