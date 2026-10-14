/**
 * The renderer, the scene and the passes after it: the optional ink outline
 * (`OutlineEffect`) and the post chain (`post.ts`). Also the pixel ratio the
 * player chose, and resizing.
 */
import * as THREE from 'three';
import { OutlineEffect } from '../outline.ts';
import { createPost } from '../post.ts';
import type { Post } from '../post.ts';
import { FOG_COLOR } from '../theme.ts';
import type { CameraRig } from '../camera.ts';
import { contextLost } from './boot.ts';
import { RESOLUTION_KEY, readSetting } from './storage.ts';

/** Pixels per CSS pixel, as the player chooses between sharpness and frame rate. */
export const RESOLUTIONS = [
  ['auto', 'Auto'],
  ['sharp', 'Sharp'],
  ['balanced', 'Balanced'],
  ['fast', 'Fast'],
] as const;
export type Resolution = (typeof RESOLUTIONS)[number][0];

/** `auto` is the screen's ratio capped at 2, past which a 4K laptop cannot afford the passes. */
export function pixelRatioFor(resolution: Resolution): number {
  const screen = globalThis.devicePixelRatio || 1;
  if (resolution === 'sharp') return screen;
  if (resolution === 'balanced') return Math.min(screen, 1.5);
  if (resolution === 'fast') return 1;
  return Math.min(screen, 2);
}

/** The post chain's ink switch: whether it draws through the outline's two passes. */
export interface Ink {
  readonly on: boolean;
  set(on: boolean): void;
}

export interface Graphics {
  renderer: THREE.WebGLRenderer;
  outline: OutlineEffect;
  post: Post;
  scene: THREE.Scene;
  fog: THREE.Fog;
  ink: Ink;
  /** The chosen resolution, as stored. */
  resolution: Resolution;
}

export function createGraphics(): Graphics {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  const stored = readSetting(RESOLUTION_KEY);
  const resolution: Resolution = RESOLUTIONS.some(([value]) => value === stored) ? (stored as Resolution) : 'auto';
  renderer.setPixelRatio(pixelRatioFor(resolution));
  document.body.appendChild(renderer.domElement);
  // A lost context takes every uploaded buffer with it; reload rather than trust a restore.
  renderer.domElement.addEventListener('webglcontextlost', contextLost);
  // Reset once per frame by the loop, so the counters cover both outline passes and any shadow redraw.
  renderer.info.autoReset = false;
  const outline = new OutlineEffect(renderer, { defaultThickness: 0.003, defaultColor: [0.11, 0.02, 0.01] });
  const post = createPost(renderer);
  let inked = false;
  const setInk = (on: boolean): void => {
    inked = on;
    post.draw = on ? (target, camera) => outline.render(target, camera) : (target, camera) => renderer.render(target, camera);
  };
  setInk(false);

  // The sun's shadow map is redrawn on the loop's own cadence, not every
  // frame. It is flagged once here so it exists before the menu's first lit
  // frame: a shadow sampler bound to nothing is undefined behaviour.
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;

  const scene = new THREE.Scene();
  // Its distances are set every frame from altitude.
  const fog = new THREE.Fog(FOG_COLOR, 1, 2);
  scene.fog = fog;

  const ink: Ink = {
    get on() {
      return inked;
    },
    set: setInk,
  };
  return { renderer, outline, post, scene, fog, ink, resolution };
}

/**
 * Keeps the canvas, the post chain and the camera sized to the window, and
 * follows a change of the screen's pixel ratio that comes with no resize
 * (the window dragged to a monitor of another density). Returns `resize`.
 */
export function watchResize(gfx: Graphics, rig: CameraRig): () => void {
  const resize = (): void => {
    gfx.renderer.setPixelRatio(pixelRatioFor(gfx.resolution));
    gfx.renderer.setSize(innerWidth, innerHeight);
    gfx.post.setSize(innerWidth, innerHeight);
    rig.resize(innerWidth, innerHeight);
  };
  addEventListener('resize', resize);
  resize();
  // A media query on the current ratio fires once when it stops matching.
  const watchRatio = (): void => {
    try {
      matchMedia(`(resolution: ${globalThis.devicePixelRatio || 1}dppx)`).addEventListener(
        'change',
        () => {
          resize();
          watchRatio();
        },
        { once: true },
      );
    } catch {
      // No change events: the resize listener is all there is.
    }
  };
  watchRatio();
  return resize;
}
