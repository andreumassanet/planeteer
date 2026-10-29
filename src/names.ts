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
import { COUNTRY_YELLOW, STYLE, TOWN_WHITE } from './names/style.ts';
import { createTownPlacer } from './names/towns.ts';
import type { LayerFades } from './map-layer.ts';
import type { Place } from './places.ts';
import { MAX_TOWNS } from './names/constants.ts';

export interface CountryNames {
  root: HTMLElement;
  /** Paint the currently visible names over a photo canvas. */
  drawTo(context: CanvasRenderingContext2D, scale: number): void;
  /**
   * The countries' names on `fades.country` and the towns' on `fades.town`
   * (`map-layer.ts`); `here` is the 1-based country index under the player,
   * or 0; `reach` is where the haze closes, past which no town is named.
   * Every frame, over arrays that were made once.
   */
  update(fades: LayerFades, camera: THREE.PerspectiveCamera, here: number, reach?: number): void;
  /** Names on screen, and how many the frame had to choose from. On `atlas.names`. */
  stats: { drawn: number; candidates: number; towns: number };
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
  /** The gazetteer whose built towns are named, and how high the ground stands under one (a unit vector). */
  towns?: { all: readonly Place[]; groundAt(unit: THREE.Vector3): number };
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

  const towns = options.towns === undefined ? null : createTownPlacer(options.towns.all, RADIUS, options.towns.groundAt);
  // A name, a star for a capital, on a stem over a dot; a slot keeps its row while it can.
  const townPool: { element: HTMLElement; name: HTMLElement; star: HTMLElement; row: number }[] = [];
  if (towns !== null) {
    for (let i = 0; i < MAX_TOWNS; i++) {
      const element = document.createElement('div');
      element.className = 'atlas-town';
      element.hidden = true;
      const star = document.createElement('span');
      star.className = 'atlas-town-star';
      star.textContent = '\u2605';
      const name = document.createElement('span');
      const label = document.createElement('div');
      label.className = 'atlas-town-name';
      label.append(star, name);
      element.appendChild(label);
      root.insertBefore(element, root.firstChild);
      townPool.push({ element, name, star, row: -1 });
    }
  }
  let townsShown = 0;

  const stats = { drawn: 0, candidates: 0, towns: 0 };

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

  function updateTowns(fade: number, camera: THREE.PerspectiveCamera, reach: number): void {
    if (towns === null) return;
    if (fade <= MIN_FADE) towns.kept.length = 0;
    else towns.place(fade, camera, width, height, reach);
    const kept = towns.kept;
    kept.forEach((placed, i) => {
      const slot = townPool[i]!;
      slot.element.hidden = false;
      if (slot.row !== placed.row) {
        slot.row = placed.row;
        slot.name.textContent = placed.place.name;
        slot.star.hidden = !placed.capital;
        slot.element.classList.toggle('capital', placed.capital);
      }
      slot.element.style.fontSize = `${placed.size.toFixed(1)}px`;
      slot.element.style.opacity = placed.opacity.toFixed(3);
      slot.element.style.transform = `translate(${placed.x.toFixed(1)}px, ${placed.y.toFixed(1)}px)`;
    });
    for (let i = kept.length; i < townsShown; i++) {
      townPool[i]!.element.hidden = true;
      townPool[i]!.row = -1;
    }
    townsShown = kept.length;
    stats.towns = townsShown;
  }

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
      context.shadowColor = 'rgba(30, 6, 3, 0.35)';
      context.shadowBlur = 6;
      context.shadowOffsetY = 2;
      context.fillStyle = TOWN_WHITE;
      for (const placed of towns?.kept ?? []) {
        context.globalAlpha = placed.opacity;
        context.font = `800 ${placed.size}px ${FONT}`;
        context.strokeText(placed.place.name, placed.x, placed.y - 15 - placed.size / 2);
        context.fillText(placed.place.name, placed.x, placed.y - 15 - placed.size / 2);
      }
      context.fillStyle = COUNTRY_YELLOW;
      for (const placed of placer.kept) {
        context.globalAlpha = placed.opacity;
        context.font = `900 ${placed.size}px ${FONT}`;
        const text = placed.label.text.toUpperCase();
        context.strokeText(text, placed.x, placed.y);
        context.fillText(text, placed.x, placed.y);
      }
      context.restore();
    },
    update(fades: LayerFades, camera: THREE.PerspectiveCamera, here: number, reach = Infinity): void {
      updateTowns(fades.town, camera, reach);
      const fade = fades.country;
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
