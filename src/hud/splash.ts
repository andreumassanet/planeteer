/**
 * The banner under the compass, the one place an arrival is announced: a
 * country crossed into (`badge.ts`) and a landmark reached
 * (`destination.ts`); a town is named by the corner alone. One
 * at a time: a banner that comes while another stands waits its turn, and
 * the same one is never queued twice.
 */
import type { HudCtx } from './ctx.ts';

const SPLASH_HOLD = 4.2;
/** How long a banner stands once another is waiting behind it. */
const SPLASH_HURRY = 2.4;
/** The gap between one banner going and the next coming, seconds. */
const SPLASH_GAP = 0.6;
/** The most that wait; the oldest is let go. */
const MAX_WAITING = 3;

export function splash(ctx: HudCtx, kicker: string, name: string, sub = ''): void {
  const queue = ctx.splashQueue;
  if (queue.some((entry) => entry.kicker === kicker && entry.name === name)) return;
  if (ctx.splashFor > -SPLASH_GAP) {
    queue.push({ kicker, name, sub });
    if (queue.length > MAX_WAITING) queue.shift();
    ctx.splashFor = Math.min(ctx.splashFor, SPLASH_HURRY);
    return;
  }
  show(ctx, kicker, name, sub);
}

function show(ctx: HudCtx, kicker: string, name: string, sub: string): void {
  ctx.splashKicker.textContent = kicker;
  ctx.splashName.textContent = name;
  ctx.splashSub.textContent = sub;
  ctx.splashSub.hidden = sub === '';
  ctx.splash.classList.remove('on');
  // A reflow between, so a banner replacing another plays its entrance again.
  void ctx.splash.offsetWidth;
  ctx.splash.classList.add('on');
  ctx.splashFor = SPLASH_HOLD;
}

export function tickSplash(ctx: HudCtx, dt: number): void {
  if (ctx.splashFor <= -SPLASH_GAP) return;
  const was = ctx.splashFor;
  ctx.splashFor -= dt;
  if (was > 0 && ctx.splashFor <= 0) ctx.splash.classList.remove('on');
  if (ctx.splashFor <= -SPLASH_GAP) {
    const next = ctx.splashQueue.shift();
    if (next !== undefined) show(ctx, next.kicker, next.name, next.sub);
  }
}
