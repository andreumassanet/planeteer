/** The system's labels over each body and the dock along the bottom. */
import { h, icon } from '../ui.ts';
import { worldDisc } from '../world-disc.ts';
import { chooseBody } from './bodies.ts';
import type { MenuCtx } from './context.ts';
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

export function layOutLabels(ctx: MenuCtx): void {
  const { discs, dockItems, halo, labels, marks, orrery } = ctx;
  const quiet = ctx.held || ctx.flight !== null || ctx.chosen !== null || (ctx.stage !== 'system' && ctx.stage !== 'planet');
  marks.classList.toggle('quiet', quiet);
  let haloOn = false;
  for (const disc of discs) {
    const id = disc.entry.body.id;
    const label = labels.get(id)!;
    const hot = id === ctx.hoverBody;
    label.classList.toggle('hot', hot);
    dockItems.get(id)?.classList.toggle('hot', hot);
    // The Sun carries no label: it is the light the rest are seen by.
    const hideThis = quiet || !disc.visible || disc.entry.body.kind === 'star' || (ctx.stage === 'planet' && id === ctx.focusId);
    label.style.display = hideThis ? 'none' : '';
    if (!hideThis) {
      label.style.transform = `translate(${disc.x.toFixed(1)}px, ${(disc.y + disc.r + 10).toFixed(1)}px) translateX(-50%)`;
    }
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
