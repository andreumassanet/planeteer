/** The system's labels over each body and the dock along the bottom. */
import { h, icon } from '../ui.ts';
import { worldDisc } from '../world-disc.ts';
import { chooseBody } from './bodies.ts';
import type { Disc, MenuCtx } from './context.ts';
import { distanceText, lightText, sighting } from './text.ts';

export function bindBodies(ctx: MenuCtx): void {
  const { deps, dock, dockItems, labels, marks, orrery, time, walkable } = ctx;
  for (const entry of orrery.bodies) {
    const id = entry.body.id;
    const enterable = walkable.has(id);
    const explorable = enterable || (deps.exploreBody !== undefined && entry.body.kind !== 'star');
    // Out of the tab order: every label has a dock item that does the same.
    // The Sun is named but goes nowhere.
    const inert = entry.body.kind === 'star';
    const label = h(
      'button',
      { class: inert ? 'm-label inert' : explorable ? 'm-label walk' : 'm-label', 'aria-label': entry.body.name, tabindex: -1 },
      entry.body.name,
      explorable ? icon('chevron') : null,
    );
    label.addEventListener('click', () => chooseBody(ctx, id));
    label.addEventListener('pointerenter', () => (ctx.hoverBody = id));
    label.addEventListener('pointerleave', () => (ctx.hoverBody = null));
    marks.append(label);
    labels.set(id, label);

    const disc = worldDisc(id);
    // Earth says it can be explored; every other body says how far away it is today, as the light's travel time.
    let tag: HTMLElement;
    let title: string;
    if (enterable) {
      tag = h('span', { class: 'ui-tag ink' }, icon('play'), 'Explore');
      title = `${entry.body.name}: explore it`;
    } else {
      const seen = sighting(entry.body, time());
      tag = h('span', { class: 'm-dock-sub', text: lightText(seen.km, 'light-min') });
      title = `${entry.body.name}: ${distanceText(seen.km)} from Earth right now`;
    }
    const item = h(
      'button',
      { class: inert ? 'm-dock-item ui-card inert' : enterable ? 'm-dock-item ui-card walk' : 'm-dock-item ui-card', title, ...(inert ? { tabindex: -1, 'aria-disabled': 'true' } : {}) },
      disc,
      h('span', { class: 'm-dock-name', text: entry.body.name.replace(/^The /, '') }),
      tag,
    );
    item.addEventListener('click', () => chooseBody(ctx, id));
    item.addEventListener('pointerenter', () => (ctx.hoverBody = id));
    item.addEventListener('pointerleave', () => (ctx.hoverBody = null));
    // The keyboard lights the planet as the pointer does.
    item.addEventListener('focus', () => (ctx.hoverBody = id));
    item.addEventListener('blur', () => {
      if (ctx.hoverBody === id) ctx.hoverBody = null;
    });
    dock.append(item);
    dockItems.set(id, item);
  }
}

/** Gap, px, kept between two labels, and between a label and its disc. */
const LABEL_GAP = 6;

/** Each label's last measured size, so a hidden one (which measures zero) keeps its own. */
const sizes = new WeakMap<HTMLElement, { w: number; h: number }>();

function labelSize(label: HTMLElement): { w: number; h: number } {
  if (label.offsetWidth > 0) sizes.set(label, { w: label.offsetWidth, h: label.offsetHeight });
  return sizes.get(label) ?? { w: 96, h: 26 };
}

interface Placed {
  x: number;
  y: number;
  w: number;
  h: number;
}

function overlaps(a: Placed, list: Placed[]): boolean {
  for (const b of list) {
    if (a.x < b.x + b.w + LABEL_GAP && b.x < a.x + a.w + LABEL_GAP && a.y < b.y + b.h + LABEL_GAP && b.y < a.y + a.h + LABEL_GAP) return true;
  }
  return false;
}

/**
 * Where each label goes: under its disc, else over it, right or left of it;
 * the hovered body first, then the nearest. A label that fits nowhere is
 * hidden, since the dock names every body anyway; the discs are kept clear
 * too, so a label never covers another body's pick target.
 */
function placeLabels(ctx: MenuCtx, shown: Disc[]): Map<string, Placed | null> {
  const placed: Placed[] = [];
  const result = new Map<string, Placed | null>();
  // Every visible disc is an obstacle a label must not cover.
  const discBoxes: { id: string; box: Placed }[] = [];
  for (const disc of ctx.discs) {
    if (!disc.visible) continue;
    const r = Math.max(disc.r, 6);
    discBoxes.push({ id: disc.entry.body.id, box: { x: disc.x - r, y: disc.y - r, w: r * 2, h: r * 2 } });
  }
  const order = [...shown].sort((a, b) => {
    const hotA = a.entry.body.id === ctx.hoverBody ? 0 : 1;
    const hotB = b.entry.body.id === ctx.hoverBody ? 0 : 1;
    return hotA - hotB || a.depth - b.depth;
  });
  for (const disc of order) {
    const id = disc.entry.body.id;
    const label = ctx.labels.get(id)!;
    const size = labelSize(label);
    const w = size.w;
    const h = size.h;
    const r = Math.max(disc.r, 4);
    const options: Placed[] = [
      { x: disc.x - w / 2, y: disc.y + r + 8, w, h },
      { x: disc.x - w / 2, y: disc.y - r - 8 - h, w, h },
      { x: disc.x + r + 8, y: disc.y - h / 2, w, h },
      { x: disc.x - r - 8 - w, y: disc.y - h / 2, w, h },
    ];
    const others = discBoxes.filter((entry) => entry.id !== id).map((entry) => entry.box);
    const spot = options.find((option) => !overlaps(option, placed) && !overlaps(option, others)) ?? null;
    // The hovered body is always named, even over a neighbour.
    const chosen: Placed | null = spot ?? (id === ctx.hoverBody ? options[0]! : null);
    if (chosen !== null) placed.push(chosen);
    result.set(id, chosen);
  }
  return result;
}

export function layOutLabels(ctx: MenuCtx): void {
  const { discs, dockItems, halo, labels, marks, orrery } = ctx;
  const quiet = ctx.held || ctx.flight !== null || ctx.chosen !== null || (ctx.stage !== 'system' && ctx.stage !== 'planet');
  marks.classList.toggle('quiet', quiet);
  let haloOn = false;
  const shown: Disc[] = [];
  for (const disc of discs) {
    const id = disc.entry.body.id;
    // The Sun carries no label: it is the light the rest are seen by.
    const hideThis = quiet || !disc.visible || disc.entry.body.kind === 'star' || (ctx.stage === 'planet' && id === ctx.focusId);
    if (!hideThis) shown.push(disc);
  }
  const spots = placeLabels(ctx, shown);
  for (const disc of discs) {
    const id = disc.entry.body.id;
    const label = labels.get(id)!;
    const hot = id === ctx.hoverBody;
    label.classList.toggle('hot', hot);
    dockItems.get(id)?.classList.toggle('hot', hot);
    const spot = spots.get(id) ?? null;
    label.style.display = spot === null ? 'none' : '';
    if (spot !== null) label.style.transform = `translate(${spot.x.toFixed(1)}px, ${spot.y.toFixed(1)}px)`;
    if (hot && !quiet && disc.visible && !(ctx.stage === 'planet' && id === ctx.focusId)) {
      const size = Math.max(disc.r, 9) + 9;
      halo.style.width = `${size * 2}px`;
      halo.style.height = `${size * 2}px`;
      halo.style.transform = `translate(${(disc.x - size).toFixed(1)}px, ${(disc.y - size).toFixed(1)}px)`;
      haloOn = true;
    }
  }
  halo.classList.toggle('on', haloOn);
  orrery.highlight(quiet ? null : ctx.hoverBody ?? (ctx.stage === 'planet' ? ctx.focusId : null));
}
