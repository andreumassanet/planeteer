/**
 * The country's name, in big letters, over the country.
 *
 * It is HTML, not geometry: a `div` with a `transform` at the screen position
 * a projection hands back, the same trick as the HUD's chip and cards. It is
 * not a label engine; `names/placer.ts` holds the rules: only what the eye
 * could reach (in front of the camera, inside the viewport, on the near side
 * of the horizon), ten at most nearest the middle first, size by the square
 * root of the area (the country under the player a fifth larger), and a fade
 * on the same number as the country fill, so `B` and the altitude drive all
 * three marks together.
 *
 * The names are `NAME_LONG` from Natural Earth out of `world.countries`, at
 * the bake's own label point, which is on land by construction.
 */
import * as THREE from 'three';
import type { World } from './geo.ts';
import { PALETTE } from './theme.ts';
import { PLANET_RADIUS, UNITS_PER_DEGREE } from './globe.ts';
import { FONT, hex } from './ui.ts';
import { MAX_LABELS, MIN_FADE } from './names/constants.ts';
import { buildLabels } from './names/labels.ts';
import { createPlacer } from './names/placer.ts';
import { STYLE } from './names/style.ts';

export interface CountryNames {
  root: HTMLElement;
  /** Paint the currently visible names over a photo canvas. */
  drawTo(context: CanvasRenderingContext2D, scale: number): void;
  /**
   * `fade` is the flag's own; `here` is the 1-based country index under the
   * player, or 0. Every frame, over arrays that were made once.
   */
  update(fade: number, camera: THREE.PerspectiveCamera, here: number): void;
  /** Names on screen, and how many the frame had to choose from. On `atlas.names`. */
  stats: { drawn: number; candidates: number };
  /** Takes the layer off the page and lets go of its listener. */
  dispose(): void;
}

/**
 * Another body than Earth: its sea-level radius in units, and how high the
 * ground stands over it under a label point (a unit vector). Earth's are
 * `PLANET_RADIUS` and the shelf, `LAND_HEIGHT`, everywhere.
 */
export interface NamesOptions {
  radius?: number;
  heightAt?(unit: THREE.Vector3): number;
}

export function createCountryNames(world: World, options: NamesOptions = {}): CountryNames {
  const RADIUS = options.radius ?? PLANET_RADIUS;
  const UNITS_PER_DEG = options.radius === undefined ? UNITS_PER_DEGREE : (RADIUS * Math.PI) / 180;
  const abort = new AbortController();
  const root = document.createElement('div');
  root.className = 'atlas-names';
  const style = document.createElement('style');
  style.textContent = STYLE;
  root.appendChild(style);

  const labels = buildLabels(world, RADIUS, UNITS_PER_DEG, options.heightAt);
  const placer = createPlacer(labels, RADIUS);

  // The pool: made once, and a frame only writes the elements' transforms
  // (creating nodes at 60 Hz is layout thrash).
  const pool: HTMLElement[] = [];
  for (let i = 0; i < MAX_LABELS; i++) {
    const element = document.createElement('div');
    element.className = 'atlas-name';
    element.hidden = true;
    root.appendChild(element);
    pool.push(element);
  }

  const stats = { drawn: 0, candidates: 0 };

  // The viewport is read on a resize rather than every frame: asking the
  // element for it forces a layout after the HUD has written its text.
  let width = innerWidth;
  let height = innerHeight;
  addEventListener(
    'resize',
    () => {
      width = innerWidth;
      height = innerHeight;
    },
    { signal: abort.signal },
  );

  /** How many of the pool are visible, so a frame only touches what changed. */
  let shown = 0;
  const hideFrom = (from: number): void => {
    for (let i = from; i < shown; i++) pool[i]!.hidden = true;
    shown = from;
  };

  return {
    root,
    stats,
    dispose() {
      abort.abort();
      root.remove();
    },
    drawTo(context, scale): void {
      context.save();
      context.scale(scale, scale);
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.lineJoin = 'round';
      context.lineWidth = 3;
      context.strokeStyle = hex(PALETTE.ink);
      context.fillStyle = hex(PALETTE.cream);
      context.shadowColor = 'rgba(30, 6, 3, 0.35)';
      context.shadowBlur = 6;
      context.shadowOffsetY = 2;
      for (const placed of placer.kept) {
        context.globalAlpha = placed.opacity;
        context.font = `800 ${placed.size}px ${FONT}`;
        context.strokeText(placed.label.text, placed.x, placed.y);
        context.fillText(placed.label.text, placed.x, placed.y);
      }
      context.restore();
    },
    update(fade: number, camera: THREE.PerspectiveCamera, here: number): void {
      if (fade <= MIN_FADE) {
        hideFrom(0);
        stats.drawn = 0;
        stats.candidates = 0;
        return;
      }
      placer.place(fade, camera, here, width, height);
      stats.candidates = placer.candidates;
      const kept = placer.kept;
      kept.forEach((placed, i) => {
        const element = pool[i]!;
        element.hidden = false;
        if (element.textContent !== placed.label.text) element.textContent = placed.label.text;
        element.style.fontSize = `${placed.size.toFixed(1)}px`;
        element.style.opacity = placed.opacity.toFixed(3);
        element.style.transform =
          `translate(-50%, -50%) translate(${placed.x.toFixed(1)}px, ${placed.y.toFixed(1)}px)`;
      });
      hideFrom(kept.length);
      shown = kept.length;
      stats.drawn = shown;
    },
  };
}
