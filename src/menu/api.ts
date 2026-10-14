/** The `Menu` handle the caller holds: its state as getters, and the choices it awaits. */
import { h } from '../ui.ts';
import { bodyOf, disposeObject, setBody } from './bodies.ts';
import { refreshChrome, refreshContinue } from './chrome.ts';
import type { MenuCtx } from './context.ts';
import { flyTo } from './flight.ts';
import { resize } from './input.ts';
import { lastOf } from './memory.ts';
import { copyPose } from './poses.ts';
import { closeResults } from './search.ts';
import { backToSystem, divePose } from './stages.ts';
import type { Curtain, Menu, MenuSpawn } from './types.ts';
import { verify } from './verify.ts';

export function createApi(ctx: MenuCtx): Menu {
  const { calm, camera, deps, events, fallback, globes, goldRibbon, home, inkRibbon, loaded, orrery, overlayGroup, pose, ribbonGroup, ribbons, root, scene, tip, walkable } = ctx;
  const api: Menu = {
    root,
    camera,
    get stage() {
      return ctx.stage;
    },
    get body() {
      return ctx.body.id;
    },
    get flying() {
      return ctx.flight !== null;
    },
    get beforeRender() {
      return ctx.beforeRender;
    },
    set beforeRender(fn) {
      ctx.beforeRender = fn;
    },
    choose() {
      if (ctx.chosen !== null) return Promise.resolve(ctx.chosen);
      ctx.choice ??= new Promise<MenuSpawn>((resolve) => {
        ctx.resolveChoice = resolve;
      });
      return ctx.choice;
    },
    depart() {
      // Always onto Earth: a spawn on any other body is that world's to land.
      setBody(ctx, home);
      const spawn = ctx.chosen ?? { body: ctx.body.id, region: '', name: fallback.name, lat: fallback.lat, lon: fallback.lon };
      root.classList.add('departing');
      tip.classList.remove('on');
      const to = divePose(ctx, spawn.lat, spawn.lon);
      const curtain = h('div', { class: 'atlas-curtain' });
      document.body.append(curtain);
      deps.sound?.stage(null);
      return new Promise<Curtain>((resolve) => {
        // With less motion asked for there is no dive at all: the curtain
        // closes over wherever the camera already is.
        let seconds = 0;
        if (calm.matches) {
          void curtain.offsetWidth;
          curtain.classList.add('on');
        } else {
          flyTo(ctx, to, () => {});
          seconds = ctx.flight!.duration / 1000;
          setTimeout(() => curtain.classList.add('on'), seconds * 1000 * 0.68);
        }
        setTimeout(() => {
          resolve({
            lift() {
              curtain.classList.add('lifting');
              curtain.classList.remove('on');
              setTimeout(() => curtain.remove(), 1000);
            },
          });
        }, seconds * 1000 * 0.68 + 420);
      });
    },
    verify: () => verify(ctx),
    hold(on) {
      if (ctx.held === on) return;
      ctx.held = on;
      if (on) closeResults(ctx);
      refreshChrome(ctx);
    },
    suspend(on) {
      if (ctx.suspended === on) return;
      ctx.suspended = on;
      root.style.display = on ? 'none' : '';
      deps.sound?.stage(on ? null : ctx.stage);
      if (!on) {
        ctx.last = lastOf(ctx);
        refreshContinue(ctx);
      }
      if (on) {
        ctx.running = false;
      } else if (!ctx.running) {
        ctx.running = true;
        ctx.previous = performance.now();
        resize(ctx);
        requestAnimationFrame(ctx.tick);
      }
    },
    toSystem() {
      // A dive into a world is still a flight when the world takes the screen;
      // a flight refuses the way back, so land it first.
      if (ctx.flight !== null) {
        copyPose(ctx.flight.to, pose);
        ctx.flight = null;
      }
      if (ctx.stage !== 'system') backToSystem(ctx);
    },
    prepare() {
      // One at a time, each in a pause of its own, so a frame is never held
      // by more than one world's build.
      const queue = orrery.bodies.filter((entry) => entry.body.kind !== 'star' && !walkable.has(entry.body.id));
      return new Promise<void>((resolve) => {
        const next = (): void => {
          const entry = queue.shift();
          if (entry === undefined || ctx.disposed) {
            resolve();
            return;
          }
          void bodyOf(ctx, entry).then(() => window.setTimeout(next, 40));
        };
        window.setTimeout(next, 0);
      });
    },
    dispose() {
      ctx.disposed = true;
      for (const { globe } of globes) globe.dispose();
      globes.length = 0;
      ctx.running = false;
      events.abort();
      deps.sound?.dispose();
      scene.remove(ribbonGroup);
      scene.remove(overlayGroup);
      for (const one of loaded.values()) if (one?.overlay !== undefined) disposeObject(one.overlay);
      orrery.holdUpright(null);
      for (const geometry of ribbons.values()) geometry.dispose();
      ribbons.clear();
      inkRibbon.material.dispose();
      goldRibbon.material.dispose();
      orrery.dispose();
      root.remove();
      delete (globalThis as Record<string, unknown>)['atlasMenu'];
    },
  };
  return api;
}
