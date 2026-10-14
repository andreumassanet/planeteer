/** One frame of the stage. */
import * as THREE from 'three';
import { encodeAppearance } from '../appearance.ts';
import { AVATAR_HEIGHT } from '../stature.ts';
import { standing } from './bridge-room.ts';
import { aimHead, placeCamera, target } from './camera.ts';
import type { HeroCtx } from './ctx.ts';
import { redress, wave } from './figure.ts';
import { drawPortrait } from './portraits.ts';
import { DOLLY, LOOK_LAG, LOOK_TURN, PLATE_AT, SHOTS, SWAY, TAN, WAVE_EVERY } from './shots.ts';

export function draw(ctx: HeroCtx, now: number): void {
  const { calm, drawnInsets, drawnShot, options, plate, pointer, scratch, size, view, wait, wantedInsets } = ctx;
  const s = ctx.stage;
  if (s === null) return;
  s.frame = requestAnimationFrame(ctx.tick);
  const dt = Math.min(0.1, Math.max(0, (now - s.last) / 1000));
  s.last = now;
  ctx.clock += dt;
  const appearance = options.appearance();
  if (ctx.cast !== null && encodeAppearance(appearance) !== s.worn) redress(ctx, s, appearance);

  // The framing, eased; under reduced motion it cuts.
  const ease = calm.matches ? 1 : 1 - Math.exp(-dt / DOLLY);
  const aimed = target(ctx);
  for (const key of ['aim', 'fill', 'width', 'elev'] as const) drawnShot[key] += (aimed[key] - drawnShot[key]) * ease;
  for (const key of ['left', 'right', 'top', 'bottom'] as const) drawnInsets[key] += (wantedInsets[key] - drawnInsets[key]) * ease;
  ctx.intro += (1 - ctx.intro) * (calm.matches ? 1 : 1 - Math.exp(-dt / 0.5));

  // Which way the hero faces.
  if (ctx.behaviour === 'title') {
    if (ctx.dragging === null) {
      const wantedLook = (pointer.x - 0.5) * 2 * LOOK_TURN + (calm.matches ? 0 : Math.sin(ctx.clock * 0.4) * SWAY);
      ctx.look += (wantedLook - ctx.look) * (1 - Math.exp(-dt / LOOK_LAG));
      ctx.turn *= Math.exp(-dt / 2.5);
    }
    s.turntable.rotation.y = ctx.turn + ctx.look;
    if (ctx.clock >= ctx.nextWave) {
      wave(ctx);
      ctx.nextWave = ctx.clock + WAVE_EVERY;
    }
  } else {
    const facing = SHOTS[ctx.current].yaw + ctx.handTurn;
    const lag = ctx.dragging !== null ? 0.06 : 0.35;
    ctx.turn += (facing - ctx.turn) * (calm.matches ? 1 : 1 - Math.exp(-dt / lag));
    ctx.look += (0 - ctx.look) * (1 - Math.exp(-dt / LOOK_LAG));
    s.turntable.rotation.y = ctx.turn + ctx.look;
  }

  if (ctx.gesture !== null) {
    const duration = ctx.gesture.action.getClip().duration;
    const t = ctx.clock - ctx.gesture.at;
    if (t >= duration) {
      ctx.gesture.action.stop();
      ctx.gesture.idle.setEffectiveWeight(1);
      ctx.gesture = null;
    } else {
      const g = THREE.MathUtils.smoothstep(t, 0, 0.25) * (1 - THREE.MathUtils.smoothstep(t, duration - 0.35, duration));
      ctx.gesture.action.setEffectiveWeight(g);
      ctx.gesture.idle.setEffectiveWeight(1 - g);
    }
  }
  if (s.person !== null) {
    const head = s.person.bones.get('Head');
    if (head !== undefined && ctx.headRest !== null) head.quaternion.copy(ctx.headRest);
    s.person.mixer.update(dt);
  }

  const width = view.clientWidth;
  const height = view.clientHeight;
  if (width <= 0 || height <= 0) return;
  s.renderer.getSize(size);
  if (size.x !== width || size.y !== height) s.renderer.setSize(width, height, false);
  placeCamera(ctx, s, width, height);
  aimHead(ctx, s, dt);
  drawPortrait(ctx, s);
  if (ctx.bridge !== null && ctx.bridge.group.parent === s.scene) ctx.bridge.update(ctx.clock, (height * s.renderer.getPixelRatio()) / (2 * TAN));
  s.outline.render(s.scene, s.camera);
  // Shown once everything stands and has been drawn twice, so no program compiles in sight.
  if (standing(ctx, s) && ++ctx.standingFrames >= 2 && !view.classList.contains('drawn')) {
    view.classList.add('drawn');
    wait.hidden = true;
  }

  // The plate over the crown.
  scratch.crown.set(0, (s.person?.height ?? AVATAR_HEIGHT) * PLATE_AT, 0).project(s.camera);
  const x = ((scratch.crown.x + 1) / 2) * width;
  const y = Math.max(54, ((1 - scratch.crown.y) / 2) * height);
  plate.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, calc(-100% - 12px))`;
}
