/** The HUD's per-frame update: the clock, the countdowns and the timers. */
import type { Nearby } from '../places.ts';
import { icon, type IconName } from '../ui.ts';
import { updateBadge } from './badge.ts';
import { WEATHER_EVERY, WEATHER_ICON } from './constants.ts';
import type { HudCtx } from './ctx.ts';

function updateClock(ctx: HudCtx, clockNow: string, dt: number): void {
  const { clock, clockIcon, clockText, options } = ctx;
  options.touch?.frame(ctx.hidden || ctx.welcoming || ctx.sheetOpen);
  // The weather is asked about once a second and is only ever an icon.
  ctx.weatherFor -= dt;
  if (ctx.weatherFor <= 0 && options.weather !== undefined) {
    ctx.weatherFor = WEATHER_EVERY;
    try {
      ctx.weatherKind = options.weather();
    } catch {
      ctx.weatherKind = null;
    }
  }
  if (clockNow !== ctx.shownClock) {
    ctx.shownClock = clockNow;
    clockText.textContent = clockNow;
    clock.classList.toggle('on', clockNow !== '');
  }
  // Day is 06:00 to 20:00 on the clock the badge shows, not by the sun.
  const hour = Number(ctx.shownClock.slice(0, 2));
  const night = !(hour >= 6 && hour < 20);
  const clockIconName: IconName = (ctx.weatherKind !== null ? WEATHER_ICON[ctx.weatherKind] : undefined) ?? (night ? 'moon' : 'sun');
  if (clockIconName !== ctx.shownClockIcon) {
    ctx.shownClockIcon = clockIconName;
    clockIcon.replaceChildren(icon(clockIconName));
    clock.title = ctx.weatherKind === null || ctx.weatherKind === 'clear' ? 'Local time' : `Local time · ${ctx.weatherKind}`;
  }
}

function tickArrived(ctx: HudCtx, dt: number): void {
  const { destination } = ctx;
  if (ctx.arrivedFor > 0) {
    ctx.arrivedFor -= dt;
    if (ctx.arrivedFor <= 0) destination.classList.remove('on', 'arrived');
  }
}

function tickTimers(ctx: HudCtx, dt: number): void {
  const { found, hintsCard, place, toast } = ctx;
  if (ctx.bumpFor > 0) {
    ctx.bumpFor -= dt;
    if (ctx.bumpFor <= 0) place.classList.remove('bump');
  }
  if (ctx.foundFor > 0) {
    ctx.foundFor -= dt;
    if (ctx.foundFor <= 0) found.classList.remove('in');
  }
  if (ctx.toastFor > 0) {
    ctx.toastFor -= dt;
    if (ctx.toastFor <= 0) toast.classList.remove('on');
  }
  // The keys of the moment go only while the game has the mouse.
  if (ctx.hintSet !== null && !ctx.hintSet.sticky && ctx.paused === false) {
    ctx.hintFor -= dt;
    if (ctx.hintFor <= 0) {
      ctx.hintSet = null;
      hintsCard.classList.remove('on');
    }
  }
}

/** One frame of the HUD: the clock, the arrival countdown, the badge's debounce, then the timers. */
export function updateHud(ctx: HudCtx, countryId: number, nearby: Nearby | null, clockNow: string, dt: number, bearing: number | null): void {
  updateClock(ctx, clockNow, dt);
  tickArrived(ctx, dt);
  updateBadge(ctx, countryId, nearby, dt, bearing);
  tickTimers(ctx, dt);
}
