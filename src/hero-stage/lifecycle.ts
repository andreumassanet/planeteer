/**
 * Opening and closing the figure's renderer. The context is lost on purpose when
 * the stage goes, so a game that has started holds no second one for it.
 */
import * as THREE from 'three';
import { setScenery } from './bridge-room.ts';
import type { HeroCtx } from './ctx.ts';
import { redress } from './figure.ts';
import { buildScene } from './scene.ts';

export function openScene(ctx: HeroCtx): void {
  const { options, wait } = ctx;
  if (ctx.stage !== null) return;
  try {
    ctx.stage = buildScene(ctx);
  } catch (error) {
    // No WebGL for a second context: the cards work without the figure.
    console.warn('stage: no figure', error);
    wait.textContent = '';
    return;
  }
  ctx.stage.last = performance.now();
  ctx.stage.frame = requestAnimationFrame(ctx.tick);
  setScenery(ctx);
  wait.hidden = ctx.cast !== null;
  options
    .cast()
    .then((loaded) => {
      ctx.cast = loaded;
      wait.hidden = true;
      if (ctx.stage !== null) redress(ctx, ctx.stage, options.appearance());
    })
    .catch((error: unknown) => {
      console.warn('stage: the wardrobe did not load', error);
      wait.textContent = 'The wardrobe did not arrive.';
    });
}

export function closeScene(ctx: HeroCtx): void {
  const { queue, root, view } = ctx;
  const s = ctx.stage;
  if (s === null) return;
  cancelAnimationFrame(s.frame);
  // The room outlives the renderer: the next one uploads it again.
  if (ctx.bridge !== null && ctx.bridge.group.parent === s.scene) s.scene.remove(ctx.bridge.group);
  view.classList.remove('drawn');
  root.classList.remove('leaving');
  ctx.standingFrames = 0;
  ctx.leaving = null;
  if (s.person !== null && ctx.cast !== null) ctx.cast.release(s.person);
  for (const mesh of s.plinth) {
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  }
  s.renderer.dispose();
  // Handed back now: browsers cap the contexts a page may hold, and the world holds one.
  s.renderer.forceContextLoss();
  s.renderer.domElement.remove();
  ctx.stage = null;
  ctx.gesture = null;
  ctx.headRest = null;
  queue.clear();
}
