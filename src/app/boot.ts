/**
 * The loading screen and the failure card.
 *
 * Building the land is seconds of synchronous work, so each stage yields once
 * to let the browser paint its label, and the progress bar is driven by a CSS
 * transition (which runs on the compositor) towards the stage's end over an
 * estimated duration.
 */
import { notice } from '../notice.ts';
import type { NoticeAction } from '../notice.ts';

/**
 * Each stage's start and end on the bar, and an estimate of how long it takes
 * in ms. A stage that runs long leaves the bar waiting at 98% of its end.
 */
const BOOT: Record<string, readonly [number, number, number]> = {
  'reading the outlines': [0.01, 0.04, 700],
  'filling the ocean': [0.04, 0.09, 1100],
  'raising the land': [0.09, 0.55, 9000],
  'drawing the frontiers': [0.55, 0.57, 400],
  'setting the weather': [0.57, 0.6, 600],
  'opening the sky': [0.6, 0.62, 450],
  'raising the monuments': [0.62, 0.65, 650],
  'settling the country': [0.65, 0.67, 450],
  'laying the roads': [0.67, 0.68, 200],
  'setting it moving': [0.68, 0.7, 300],
  'planting the country': [0.7, 0.71, 250],
  'packing your bag': [0.71, 0.76, 1000],
  'fuelling the vehicles': [0.76, 0.8, 900],
  'warming up': [0.8, 1, 4000],
};

/** How many smooth frames in a row lift the loading screen, how smooth, and the longest it waits. */
const SETTLED_FRAMES = 20;
const SETTLED_FRAME_MS = 40;
const SETTLED_MAX_MS = 8000;

export const reload: NoticeAction = { label: 'Reload', primary: true, run: () => location.reload() };

let failed = false;

/** Shows a stage on the loading screen and yields so the browser can paint it. */
export async function stage(label: string): Promise<void> {
  const boot = BOOT[label];
  if (boot !== undefined) showBoot(label, boot);
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function showBoot(label: string, [from, to, ms]: readonly [number, number, number]): void {
  const text = document.getElementById('loading-stage');
  const percent = document.getElementById('loading-percent');
  const fill = document.getElementById('loading-fill');
  if (text !== null) text.textContent = label;
  if (percent !== null) percent.textContent = `${Math.round(from * 100)}%`;
  if (fill !== null) {
    fill.style.transitionDuration = `${ms}ms`;
    fill.style.transform = `translateX(${((to * 0.98 - 1) * 100).toFixed(1)}%)`;
  }
}

/**
 * Something the world cannot go on without has failed: a card with a reload,
 * shown over whatever is on screen. Only the first failure is shown.
 */
export function fail(error: unknown): void {
  console.error(error);
  if (failed) return;
  failed = true;
  const message = error instanceof Error ? error.message : String(error);
  notice(
    'Something went wrong',
    `planeteer stopped: ${message}. Reloading usually fixes it; if it keeps happening, the browser's console says more.`,
    [reload],
  );
}

/** The WebGL context was lost; a reload is the only recovery offered. */
export function contextLost(): void {
  if (failed) return;
  failed = true;
  notice(
    'The graphics card stopped drawing',
    'The browser took the WebGL context away — a driver reset, a sleeping laptop or too many tabs can do it. Reload to put the world back.',
    [reload],
  );
}

/** Whether this browser has WebGL 2, which Three r182 requires. The probe context is released. */
export function hasWebGL2(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (gl === null) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolves once `ready` holds and `SETTLED_FRAMES` frames in a row have each
 * taken under `SETTLED_FRAME_MS`, so leftover uploads and shader links are
 * paid under the loading screen. Gives up after `SETTLED_MAX_MS` (a slow
 * machine, or a hidden tab that gets no frames).
 */
export function whenSettled(ready: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();
    let last = start;
    let smooth = 0;
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      resolve();
    };
    const tick = (now: number): void => {
      if (done) return;
      smooth = ready() && now - last < SETTLED_FRAME_MS ? smooth + 1 : 0;
      last = now;
      if (smooth >= SETTLED_FRAMES) finish();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    setTimeout(finish, SETTLED_MAX_MS);
  });
}

/** Fills the bar, fades the loading screen out and removes it. */
export function dismissLoading(): void {
  const loading = document.getElementById('loading');
  if (loading === null) return;
  const fill = document.getElementById('loading-fill');
  const percent = document.getElementById('loading-percent');
  if (fill !== null) {
    fill.style.transitionDuration = '250ms';
    fill.style.transform = 'translateX(0%)';
  }
  if (percent !== null) percent.textContent = '100%';
  setTimeout(() => loading.classList.add('out'), 180);
  setTimeout(() => loading.remove(), 1300);
}
