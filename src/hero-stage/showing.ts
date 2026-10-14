/** Bringing the stage up and away, and the flight out of the bridge's window. */
import * as THREE from 'three';
import { AVATAR_HEIGHT } from '../stature.ts';
import { setScenery, wantBridge } from './bridge-room.ts';
import { target } from './camera.ts';
import type { HeroCtx } from './ctx.ts';
import { wave } from './figure.ts';
import { closeScene, openScene } from './lifecycle.ts';
import { refreshName, stopEditing } from './plate.ts';
import { LEAVE, LEAVE_FADE, WAVE_FIRST } from './shots.ts';
import type { StageBackdrop } from './types.ts';

export function show(ctx: HeroCtx, kind: StageBackdrop): void {
  const { backdrop, calm, drawnInsets, drawnShot, plate, root, wantedInsets } = ctx;
  backdrop.className = `hs-backdrop ${kind}`;
  ctx.backdropKind = kind;
  if (kind === 'bridge') wantBridge(ctx);
  setScenery(ctx);
  window.clearTimeout(ctx.closeTimer);
  window.clearTimeout(ctx.fadeTimer);
  if (ctx.leaving !== null) {
    // Called back mid-flight: the camera returns to its framing from wherever it had got to.
    ctx.leaving = null;
    root.classList.remove('leaving');
  }
  if (ctx.showing) return;
  ctx.showing = true;
  refreshName(ctx);
  if (!root.isConnected) document.body.append(root);
  if (!plate.isConnected) root.append(plate);
  plate.classList.remove('away');
  if (ctx.stage === null) {
    // Up from a little further out, so the stage arrives rather than appears;
    // on the bridge only a little, or a narrow screen's camera starts over the ceiling.
    ctx.intro = calm.matches ? 1 : kind === 'bridge' ? 1.12 : 1.35;
    Object.assign(drawnShot, target(ctx));
    Object.assign(drawnInsets, wantedInsets);
  }
  root.classList.add('on');
  ctx.nextWave = ctx.clock + WAVE_FIRST;
  openScene(ctx);
}

export function hide(ctx: HeroCtx): void {
  const { plate, root } = ctx;
  if (!ctx.showing) return;
  ctx.showing = false;
  stopEditing(ctx, true);
  root.classList.remove('on');
  plate.classList.add('away');
  // After the fade, so the figure does not vanish ahead of the screen it stands on.
  window.clearTimeout(ctx.closeTimer);
  ctx.closeTimer = window.setTimeout(() => {
    if (!ctx.showing) closeScene(ctx);
  }, 480);
}

export function leave(ctx: HeroCtx): void {
  const { calm, plate, root, scratch, view, wantedInsets } = ctx;
  const s = ctx.stage;
  const room = ctx.bridge;
  if (!ctx.showing || s === null || room === null || ctx.backdropKind !== 'bridge' || calm.matches || !view.classList.contains('drawn')) {
    hide(ctx);
    return;
  }
  // The bay nearest the middle of the screen, a little to the left of it, where the hero is not.
  let best: (typeof room.bays)[number] | null = null;
  let bestScore = Infinity;
  for (const bay of room.bays) {
    scratch.bay.copy(bay.centre).project(s.camera);
    if (scratch.bay.z > 1 || Math.abs(scratch.bay.x) > 1.1) continue;
    const score = (scratch.bay.x + 0.15) ** 2 + 0.5 * scratch.bay.y ** 2;
    if (score < bestScore) {
      bestScore = score;
      best = bay;
    }
  }
  if (best === null) {
    hide(ctx);
    return;
  }
  ctx.showing = false;
  stopEditing(ctx, true);
  plate.classList.add('away');
  root.classList.add('leaving');
  const from = s.camera.position.clone();
  const out = best.centre.clone().addScaledVector(best.inward, -AVATAR_HEIGHT * 0.6);
  // Up and to the left of the straight line, so the camera passes over the hero's shoulder.
  const via = from.clone().lerp(best.centre, 0.5).add(new THREE.Vector3(-0.4 * AVATAR_HEIGHT, 0.6 * AVATAR_HEIGHT, 0));
  ctx.leaving = {
    at: ctx.clock,
    from,
    aim: scratch.aim.clone(),
    via,
    out,
    look: best.centre.clone().addScaledVector(best.inward, -AVATAR_HEIGHT * 12),
  };
  Object.assign(wantedInsets, { left: 0, right: 0, top: 0, bottom: 0 });
  wave(ctx);
  window.clearTimeout(ctx.closeTimer);
  window.clearTimeout(ctx.fadeTimer);
  ctx.fadeTimer = window.setTimeout(() => root.classList.remove('on'), LEAVE_FADE * 1000);
  ctx.closeTimer = window.setTimeout(() => {
    if (!ctx.showing) closeScene(ctx);
  }, (LEAVE + 0.5) * 1000);
}
