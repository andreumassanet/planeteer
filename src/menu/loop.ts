/** The frame loop: the camera's step, what is under the pointer, the sound's cues, then the draw. */
import { placeGlobes } from './bodies.ts';
import { refreshChrome } from './chrome.ts';
import { DRAG_LAG, DRIFT, IDLE_BEFORE_DRIFT } from './constants.ts';
import type { MenuCtx } from './context.ts';
import { flag } from './dom.ts';
import { applyPose, blend, focusPose, globePose, systemPose } from './flight.ts';
import { inChrome } from './input.ts';
import { layOutLabels } from './labels.ts';
import { bodyAt, projectDiscs, regionUnder } from './picking.ts';
import { layOutPins } from './pins.ts';
import { clamp01, copyPose, type Orbit } from './poses.ts';
import { ribbonWidth, showRibbon } from './ribbon-view.ts';

function chase(orbit: Orbit, target: Orbit, k: number): void {
  orbit.azimuth += (target.azimuth - orbit.azimuth) * k;
  orbit.elevation += (target.elevation - orbit.elevation) * k;
  orbit.distance += (target.distance - orbit.distance) * k;
}

function stepCamera(ctx: MenuCtx, now: number, dt: number): void {
  const { calm, focus, focusWant, pose, sys, sysWant, view, want } = ctx;
  if (ctx.flight !== null) {
    const t = ctx.flight.duration <= 0 ? 1 : clamp01((now - ctx.flight.began) / ctx.flight.duration);
    const k = t * t * (3 - 2 * t);
    const kt = 1 - (1 - k) ** 2.4;
    blend(ctx, ctx.flight.from, ctx.flight.to, k, kt, pose);
    if (t >= 1) {
      copyPose(ctx.flight.to, pose);
      const done = ctx.flight.done;
      ctx.flight = null;
      done();
      refreshChrome(ctx);
    }
  } else {
    const k = 1 - Math.exp(-dt / DRAG_LAG);
    if (ctx.stage === 'system') {
      if (!ctx.dragging && !calm.matches && (now - ctx.lastTouched) / 1000 > IDLE_BEFORE_DRIFT) sysWant.azimuth += DRIFT * dt;
      chase(sys, sysWant, k);
      systemPose(ctx, sys, pose);
    } else if (ctx.stage === 'planet') {
      chase(focus, focusWant, k);
      focusPose(ctx, focus, pose);
    } else {
      // Longitude wraps, and a chase that does not know it takes the long
      // way round the planet once per session, in front of the player.
      let delta = want.lon - view.lon;
      while (delta > 180) delta -= 360;
      while (delta < -180) delta += 360;
      view.lon += delta * k;
      view.lat += (want.lat - view.lat) * k;
      view.dist += (want.dist - view.dist) * k;
      globePose(ctx, view.lat, view.lon, view.dist, pose);
    }
  }
  applyPose(ctx, pose);
  placeGlobes(ctx);
}

function fitDepthRange(ctx: MenuCtx): void {
  const { camera, orrery } = ctx;
  // The near plane rides the gap to the nearest thing (a fifth of the height over
  // the ground, or a third of the way to the nearest planet), so a cliff top and the
  // sea are not one depth step apart; the far plane reaches the outermost ring.
  let gap = Infinity;
  for (const entry of orrery.bodies) {
    // Not the body the globe stages are about, nor one faded out of the frame.
    if (entry.body.id === ctx.body.id || entry.opacity <= 0.01) continue;
    const extent = entry.radius * (entry.body.id === 'saturn' ? 2.3 : 1);
    gap = Math.min(gap, camera.position.distanceTo(entry.position) - extent);
  }
  const near = Math.max(1, Math.min((camera.position.distanceTo(ctx.body.centre) - ctx.body.radius) * 0.2, gap * 0.3));
  const far = camera.position.distanceTo(orrery.sun.position) + orrery.extent * 1.05;
  if (Math.abs(near - camera.near) > near * 0.1 || Math.abs(far - camera.far) > far * 0.05) {
    camera.near = near;
    camera.far = far;
    camera.updateProjectionMatrix();
  }
}

function readPointer(ctx: MenuCtx): void {
  const { dock, root, tip, tipFlag, tipName, tipSub } = ctx;
  // What is under the pointer.
  const free = !ctx.dragging && ctx.flight === null && ctx.chosen === null && ctx.pointer.x >= 0;
  projectDiscs(ctx);
  if ((ctx.stage === 'system' || ctx.stage === 'planet') && free) {
    const overDock = document.elementFromPoint(ctx.pointer.x, ctx.pointer.y)?.closest('.m-dock-item, .m-label') != null;
    // A dock item the keyboard is on keeps its planet lit, wherever the
    // resting mouse happens to be.
    const active = document.activeElement;
    const keyed = active !== null && dock.contains(active) && active.matches(':focus-visible');
    if (!overDock && !keyed) ctx.hoverBody = bodyAt(ctx, ctx.pointer.x, ctx.pointer.y);
    root.style.cursor = ctx.hoverBody !== null ? 'pointer' : '';
  } else if (ctx.stage === 'region' || ctx.stage === 'site') {
    root.style.cursor = '';
  }
  if ((ctx.stage === 'region' || ctx.stage === 'site') && free && !inChrome(document.elementFromPoint(ctx.pointer.x, ctx.pointer.y))) {
    const index = regionUnder(ctx, ctx.pointer.x, ctx.pointer.y);
    const showing = ctx.stage === 'region' ? index : index !== ctx.regionIndex ? index : 0;
    if (ctx.stage === 'region' && index !== ctx.hoverIndex) {
      ctx.hoverIndex = index;
      showRibbon(ctx, index > 0 ? ctx.body.regions[index - 1]! : null);
    }
    if (showing > 0) {
      const next = ctx.body.regions[showing - 1]!;
      if (tipName.textContent !== next.name) {
        tipName.textContent = next.name;
        tipFlag.replaceChildren(flag(next.key, 30, 20));
        const count = ctx.sitesOf.get(next.key)?.length ?? 0;
        tipSub.textContent = `${next.note} · ${count.toLocaleString('en')} ${ctx.words.sites} · click to explore`;
      }
      tip.classList.add('on');
      tip.style.transform = `translate(${ctx.pointer.x + 16}px, ${ctx.pointer.y + 16}px)`;
    } else {
      tip.classList.remove('on');
    }
  } else {
    tip.classList.remove('on');
    if (ctx.stage === 'region' && ctx.hoverIndex !== 0 && ctx.flight === null && !ctx.dragging) {
      ctx.hoverIndex = 0;
      showRibbon(ctx, null);
    }
  }
}

function soundCues(ctx: MenuCtx): void {
  const { deps } = ctx;
  // A tick for each new thing under the pointer — a body, a dock item, a
  // country, a town in the list — and the stage for the hum under it all.
  const hovered =
    ctx.stage === 'system' || ctx.stage === 'planet'
      ? ctx.hoverBody
      : ctx.stage === 'region'
        ? ctx.hoverIndex > 0 ? `region:${ctx.hoverIndex}` : null
        : ctx.hotSite !== null ? `site:${ctx.hotSite.name}` : null;
  if (hovered !== ctx.lastHovered) {
    ctx.lastHovered = hovered;
    if (hovered !== null && ctx.chosen === null) deps.sound?.cue('hover');
  }
  if (ctx.stage !== ctx.heardStage && ctx.chosen === null) {
    ctx.heardStage = ctx.stage;
    deps.sound?.stage(ctx.stage);
  }
  deps.sound?.update();
}

function dragReticle(ctx: MenuCtx): void {
  const { renderer, reticle, reticleLabel } = ctx;
  // While the globe is dragged at the site stage, say which country letting
  // go will choose.
  if (ctx.dragging && ctx.stage === 'site' && ctx.dragged > 4) {
    const box = renderer.domElement.getBoundingClientRect();
    const index = regionUnder(ctx, box.left + box.width / 2, box.top + box.height / 2);
    if (index > 0 && index !== ctx.regionIndex) {
      const text = `Let go to explore ${ctx.body.regions[index - 1]!.name}`;
      if (reticleLabel.textContent !== text) reticleLabel.textContent = text;
      reticle.classList.add('on');
    } else {
      reticle.classList.remove('on');
    }
  }
}

/** One frame: the camera, the pointer, the sound, the labels and pins, then the world's own draw. */
export function frame(ctx: MenuCtx, now: number): void {
  if (!ctx.running) return;
  requestAnimationFrame(ctx.tick);
  // The first timestamp can be earlier than the `performance.now()` taken before it;
  // a negative `dt` runs every chase backwards.
  const dt = Math.max(0, Math.min((now - ctx.previous) / 1000, 0.1));
  ctx.previous = now;

  ctx.orrery.update(ctx.time(), ctx.camera, ctx.renderer.domElement.clientHeight, dt);
  stepCamera(ctx, now, dt);
  fitDepthRange(ctx);
  ribbonWidth(ctx);
  readPointer(ctx);
  soundCues(ctx);
  dragReticle(ctx);
  layOutLabels(ctx);
  layOutPins(ctx);

  ctx.beforeRender?.(ctx.camera);
  ctx.draw(ctx.scene, ctx.camera);
}
