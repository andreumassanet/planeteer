/**
 * The creator's tiles: one small picture a frame of the hero wearing a choice, drawn
 * into a corner of the figure's canvas, copied out and kept.
 */
import * as THREE from 'three';
import { type Appearance, coloursOf, encodeAppearance, fitAppearance, wardrobeOf } from '../appearance.ts';
import { paintWith } from '../cast.ts';
import { AVATAR_HEIGHT } from '../stature.ts';
import type { HeroCtx } from './ctx.ts';
import type { Scene } from './scene.ts';
import { PORTRAIT_INK, PORTRAIT_KEEP, PORTRAIT_SIZE, PORTRAITS, TAN } from './shots.ts';
import type { PortraitFrame } from './types.ts';

const portraitKey = (look: Appearance, frame: PortraitFrame): string => `${frame}:${encodeAppearance(look)}`;

function paste(canvas: HTMLCanvasElement, image: ImageData): void {
  if (canvas.width !== image.width) canvas.width = image.width;
  if (canvas.height !== image.height) canvas.height = image.height;
  canvas.getContext('2d')?.putImageData(image, 0, 0);
  canvas.classList.add('drawn');
}

export function portrait(ctx: HeroCtx, look: Appearance, frame: PortraitFrame, canvas: HTMLCanvasElement): void {
  const { portraits, queue } = ctx;
  const key = portraitKey(look, frame);
  canvas.dataset['want'] = key;
  const kept = portraits.get(key);
  if (kept !== undefined) {
    queue.delete(canvas);
    paste(canvas, kept);
    return;
  }
  queue.set(canvas, { key, look: fitAppearance(look), frame });
}

/** One portrait from the queue, drawn in the canvas's corner and copied out. False if none was due. */
export function drawPortrait(ctx: HeroCtx, s: Scene): boolean {
  const { portraits, queue, size } = ctx;
  if (ctx.cast === null) return false;
  for (const [canvas, job] of queue) {
    queue.delete(canvas);
    if (canvas.dataset['want'] !== job.key || !canvas.isConnected) continue;
    const kept = portraits.get(job.key);
    if (kept !== undefined) {
      paste(canvas, kept);
      continue;
    }
    const ratio = s.renderer.getPixelRatio();
    s.renderer.getSize(size);
    const side = PORTRAIT_SIZE / ratio;
    if (size.x < side || size.y < side) {
      queue.set(canvas, job);
      return false;
    }
    const person = ctx.cast.make(wardrobeOf(job.look), paintWith(coloursOf(job.look)), AVATAR_HEIGHT);
    try {
      // A pooled person may come back mid-gesture.
      person.mixer.stopAllAction();
      person.actions.get('Idle_Neutral')?.reset().play();
      person.mixer.update(0.4);
      const framing = PORTRAITS[job.frame];
      s.portraitTable.rotation.y = framing.yaw;
      s.portraitTable.add(person.root);
      const distance = (framing.fill * AVATAR_HEIGHT) / TAN;
      const aim = framing.aim * AVATAR_HEIGHT;
      s.portraitCamera.position.set(0, aim + distance * framing.elev, distance);
      s.portraitCamera.lookAt(0, aim, 0);
      s.portraitCamera.updateMatrixWorld();
      s.renderer.setViewport(0, 0, side, side);
      s.renderer.setScissor(0, 0, side, side);
      s.renderer.setScissorTest(true);
      // The pen is a share of the view, and a tile is a small view: drawn
      // at the world's width its line would be a third of a pixel.
      const material = person.mesh.material as THREE.Material;
      const pen = material.userData['outlineParameters'] as Record<string, unknown> | undefined;
      material.userData['outlineParameters'] = { ...pen, thickness: PORTRAIT_INK };
      try {
        s.outline.render(s.portraitScene, s.portraitCamera);
      } finally {
        if (pen === undefined) delete material.userData['outlineParameters'];
        else material.userData['outlineParameters'] = pen;
      }
      const canvasPixels = s.renderer.domElement;
      const copy = document.createElement('canvas');
      copy.width = copy.height = PORTRAIT_SIZE;
      const context = copy.getContext('2d', { willReadFrequently: true });
      if (context !== null) {
        context.drawImage(canvasPixels, 0, canvasPixels.height - PORTRAIT_SIZE, PORTRAIT_SIZE, PORTRAIT_SIZE, 0, 0, PORTRAIT_SIZE, PORTRAIT_SIZE);
        const image = context.getImageData(0, 0, PORTRAIT_SIZE, PORTRAIT_SIZE);
        if (portraits.size >= PORTRAIT_KEEP) portraits.delete(portraits.keys().next().value!);
        portraits.set(job.key, image);
        paste(canvas, image);
      }
    } finally {
      s.renderer.setScissorTest(false);
      s.renderer.setViewport(0, 0, size.x, size.y);
      s.portraitTable.remove(person.root);
      ctx.cast.release(person);
    }
    return true;
  }
  return false;
}
