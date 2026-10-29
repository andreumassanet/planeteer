/** The `Hud` handle the caller holds. */
import { boardingHints, labelOf } from '../controls.ts';
import { h, icon, kbd } from '../ui.ts';
import { arriveAt, setDestination, showLandmark, trackDestination } from './destination.ts';
import { TOAST_HOLD } from './constants.ts';
import type { HudCtx } from './ctx.ts';
import { shortCount } from './format.ts';
import { updateHud } from './frame.ts';
import { applyHidden, renderPause, showHints } from './hints.ts';
import type { Hud } from './types.ts';
import { renderWelcome } from './welcome.ts';
import { showMode } from './player.ts';

export function createHudApi(ctx: HudCtx): Hud {
  const { events, options, pause, perf, prompt, promptIcon, promptKey, promptText, root, toast, toastIcon, toastText, unregister, welcomeGo, welcomeRoot } = ctx;
  return {
    root,
    jump() {
      ctx.jumped = true;
      // The banners belong to the place you left.
      ctx.splashQueue.length = 0;
    },
    setDestination: (entry) => setDestination(ctx, entry),
    trackDestination: (distanceKm, x, y, angle) => trackDestination(ctx, distanceKm, x, y, angle),
    showLandmark: (landmark) => showLandmark(ctx, landmark),
    arriveAt: (name, iso) => arriveAt(ctx, name, iso),
    setMode(next, nextAirborne = false, nextFirstPerson = false, nextStranded = false) {
      const view = (next === 'foot' || next === 'swim') && nextFirstPerson;
      const aloft = (next === 'plane' || next === 'balloon' || next === 'helicopter' || next === 'passenger') && nextAirborne;
      const alone = next === 'passenger' && aloft && nextStranded;
      if (next === ctx.mode && aloft === ctx.flying && view === ctx.firstPerson && alone === ctx.stranded) return;
      // A new way of travelling, a take-off or landing, or being left alone aloft changes what the keys do; looking through your own eyes does not.
      const changed = next !== ctx.mode || aloft !== ctx.flying || alone !== ctx.stranded;
      if (next !== ctx.mode) showMode(ctx, next);
      ctx.mode = next;
      ctx.flying = aloft;
      ctx.firstPerson = view;
      ctx.stranded = alone;
      if (changed) {
        const own = options.hints?.(next, aloft);
        showHints(ctx, own !== undefined ? own : boardingHints(next, aloft, alone));
        options.touch?.setMode(next, aloft || nextAirborne, alone);
      }
    },
    placePrompt(x, y, fade) {
      const floating = x !== null;
      if (floating !== ctx.promptFloating) {
        ctx.promptFloating = floating;
        prompt.classList.toggle('float', floating);
        if (!floating) prompt.style.transform = '';
      }
      if (!floating) return;
      prompt.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, calc(-100% - 10px))`;
      prompt.style.setProperty('--cue-fade', fade.toFixed(2));
    },
    setCompass(reading) {
      ctx.compass.update(reading);
    },
    setCoordinates(lat, lon) {
      const text = `${Math.abs(lat).toFixed(3)}° ${lat >= 0 ? 'N' : 'S'}  ${Math.abs(lon).toFixed(3)}° ${lon >= 0 ? 'E' : 'W'}`;
      if (text === ctx.shownCoords) return;
      ctx.shownCoords = text;
      ctx.coords.textContent = text;
    },
    setSpeed(reading, unit, dt) {
      ctx.speedometer.update(reading, unit, dt);
    },
    showKeys(set) {
      showHints(ctx, set);
    },
    setPrompt(label, iconName = 'sparkle') {
      const key = label === null ? null : `${label}|${iconName}`;
      options.touch?.setUse(label, iconName);
      if (key === ctx.promptShown) return;
      ctx.promptShown = key;
      prompt.classList.toggle('on', label !== null);
      if (label === null) return;
      promptKey.replaceChildren(kbd(labelOf('use')));
      promptIcon.replaceChildren(icon(iconName));
      promptText.textContent = label;
    },
    get hints() {
      return ctx.hintsOn;
    },
    setHints(on) {
      ctx.hintsOn = on;
      if (!on) showHints(ctx, null);
      return ctx.hintsOn;
    },
    get hidden() {
      return ctx.hidden;
    },
    setHidden(next) {
      ctx.hidden = next;
      applyHidden(ctx);
      return ctx.hidden;
    },
    toggleHidden() {
      ctx.hidden = !ctx.hidden;
      applyHidden(ctx);
      return ctx.hidden;
    },
    get clock() {
      return ctx.shownClock;
    },
    toast(text, iconName = 'sparkle') {
      toastText.textContent = text;
      toastIcon.replaceChildren(icon(iconName));
      toast.classList.add('on');
      // Long enough to read a sentence.
      ctx.toastFor = Math.max(TOAST_HOLD, text.length * 0.055);
    },
    setPaused(next, drag = false) {
      if (drag !== ctx.dragLook) {
        ctx.dragLook = drag;
        renderPause(ctx);
      }
      if (next === ctx.paused) return;
      ctx.paused = next;
      pause.classList.toggle('on', next && !ctx.welcoming);
      // A button left focused on a card that has gone would hold every key the world reads.
      if (!next && pause.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
    },
    get welcoming() {
      return ctx.welcoming;
    },
    welcome() {
      renderWelcome(ctx);
      ctx.welcoming = true;
      welcomeRoot.classList.add('on');
      pause.classList.remove('on');
      welcomeGo.focus({ preventScroll: true });
      return new Promise<void>((resolve) => {
        ctx.finishWelcome = resolve;
      });
    },
    setPerformance(on) {
      perf.classList.toggle('on', on);
    },
    showPerformance(stats) {
      const figure = (value: string, unit: string, title: string): HTMLElement =>
        h('b', { title }, value, h('span', { text: unit }));
      perf.replaceChildren(
        figure(String(stats.fps), 'fps', 'Frames drawn per second'),
        figure(stats.frameMs.toFixed(1), 'ms', 'CPU time of an average frame: the updates and the draw'),
        figure(`${Math.round(stats.p95Ms)}/${Math.round(stats.worstMs)}`, 'p95/max', 'Time between frames over the last two seconds: the 95th percentile and the worst, in ms'),
        figure(stats.updateMs.toFixed(1), 'upd', 'Of which updating the world before the draw, in ms'),
        figure(stats.drawMs.toFixed(1), 'draw', 'Of which drawing it, both passes, in ms'),
        figure(shortCount(stats.triangles), 'tris', 'Triangles drawn in a frame, both passes'),
        figure(String(stats.calls), 'calls', 'Draw calls in a frame, both passes'),
      );
    },

    update(countryId, nearby, clockNow, dt, bearing = null) {
      updateHud(ctx, countryId, nearby, clockNow, dt, bearing);
    },

    dispose() {
      events.abort();
      for (const off of unregister.splice(0)) off();
      ctx.finishWelcome?.();
      ctx.finishWelcome = null;
      ctx.welcoming = false;
      document.body.classList.remove('atlas-hud-hidden');
      options.touch?.dispose();
      root.remove();
    },
  };
}
