/** The cards: the region panel, a country's town list, a body's facts and the town about to start. */
import type { OrreryBody } from '../orrery.ts';
import { periodOf } from '../system/index.ts';
import { clockAt } from '../timezone.ts';
import { isTouch } from '../touch.ts';
import { h, icon, kbd, km, people } from '../ui.ts';
import { chooseBody, exploreFrom } from './bodies.ts';
import { regionName } from './catalogue.ts';
import { LIST_LENGTH } from './constants.ts';
import type { MenuCtx } from './context.ts';
import { flag } from './dom.ts';
import { isEnter } from './poses.ts';
import { chooseRegion, pickTown, start } from './stages.ts';
import { compact, dayLength, distanceText, kindOf, lightText, ordinal, sighting, skyText, yearLength } from './text.ts';
import type { MenuRegion } from './types.ts';

function surprise(ctx: MenuCtx): void {
  // Weighted by the square root of the population, so a capital is likelier
  // than a village and a village is still possible.
  let total = 0;
  for (const site of ctx.body.sites) total += Math.sqrt(Math.max(1, site.weight));
  let remaining = Math.random() * total;
  for (const site of ctx.body.sites) {
    remaining -= Math.sqrt(Math.max(1, site.weight));
    if (remaining > 0) continue;
    chooseRegion(ctx, ctx.regionIndexOf.get(site.key) ?? 0, site);
    return;
  }
}

export function fillRegionPanel(ctx: MenuCtx): void {
  const { panel } = ctx;
  const surpriseButton = h('button', { class: 'm-ghost' }, icon('dice', 16), 'Surprise me');
  surpriseButton.addEventListener('click', () => surprise(ctx));
  panel.replaceChildren(
    h('p', { class: 'm-prompt', text: `${isTouch() ? 'Tap' : 'Click'} a ${ctx.words.region} on the globe, or search.` }),
    surpriseButton,
  );
}

export function fillSitePanel(ctx: MenuCtx, next: MenuRegion): void {
  const { panel, rowOf } = ctx;
  const all = ctx.sitesOf.get(next.key) ?? [];
  const list = h('div', { class: 'm-list', role: 'list' });
  rowOf.clear();
  for (const site of all.slice(0, LIST_LENGTH)) {
    // The capital is said, not marked with a dot nobody was given the key to.
    const row = h(
      'button',
      { class: 'm-row', role: 'listitem' },
      h('span', { text: site.name }),
      site.capital === true ? h('em', { text: 'capital' }) : null,
      site.weight > 0 ? h('small', { text: compact(site.weight) }) : null,
    );
    row.addEventListener('click', () => pickTown(ctx, site, true));
    row.addEventListener('dblclick', () => start(ctx, site));
    // Enter picks a row by being its click; on the row already picked it
    // starts there, as a double-click does.
    row.addEventListener('keydown', (event) => {
      if (!isEnter(event) || ctx.picked !== site) return;
      event.preventDefault();
      start(ctx, site);
    });
    row.addEventListener('pointerenter', () => (ctx.hotSite = site));
    row.addEventListener('pointerleave', () => {
      if (ctx.hotSite === site) ctx.hotSite = null;
    });
    rowOf.set(site, row);
    list.append(row);
  }
  if (all.length > LIST_LENGTH) {
    list.append(h('div', { class: 'm-more', text: `and ${(all.length - LIST_LENGTH).toLocaleString('en')} smaller ${ctx.words.sites} on the map` }));
  }
  const count = all.length;
  const towns = count === 1 ? `one ${ctx.words.site}` : `${count.toLocaleString('en')} ${ctx.words.sites}`;
  // The name and the flag are the title over this panel.
  panel.replaceChildren(h('div', { class: 'm-country-sub', text: `${next.note} · ${towns}` }), list);
}

export function fillInfo(ctx: MenuCtx, entry: OrreryBody): void {
  const { deps, home, info, orrery, time, walkable } = ctx;
  const b = entry.body;
  // Computed for the sky's own clock, the one the orrery is laid out for, so
  // the card and the diagram behind it describe the same instant.
  const seen = sighting(b, time());
  const facts: [string, string][] = [
    ['From Earth now', distanceText(seen.km)],
    ['Its light takes', lightText(seen.km)],
    [b.kind === 'star' ? 'Turns once in' : 'A day', dayLength(b.rotationHours)],
  ];
  if (b.orbit !== null) facts.push(['A year', yearLength(periodOf(b.orbit))]);
  facts.push(['Radius', km(b.radiusKm)]);
  facts.push(['Gravity', `${(b.gravity / 9.807).toFixed(b.gravity > 50 ? 0 : 2)} g`]);
  if (b.orbit === null) facts.push(['Axial tilt', `${b.tiltDeg.toFixed(1)}°`]);

  // A line about where to look. The Sun gets none.
  const lines: HTMLElement[] = [];
  if (b.kind !== 'star') lines.push(h('div', { class: 'm-line' }, icon('eye'), skyText(seen)));

  const others = orrery.bodies.filter((candidate) => !walkable.has(candidate.body.id));
  const at = others.indexOf(entry);
  const next = others[(at + 1) % others.length]!;
  const nextButton = h('button', { class: 'ui-btn' }, `Next: ${next.body.name.replace(/^The /, '')}`, icon('next', 18));
  nextButton.addEventListener('click', () => chooseBody(ctx, next.body.id));
  const short = b.name.replace(/^The /, '');
  const explore = b.kind !== 'star' && deps.exploreBody !== undefined;
  const earthButton = h('button', { class: explore ? 'ui-btn' : 'ui-btn primary' }, icon('globe', 18), explore ? 'Earth' : 'Go to Earth');
  earthButton.addEventListener('click', () => chooseBody(ctx, home.id));
  const exploreButton = explore ? h('button', { class: 'ui-btn primary' }, icon('play', 16), `Explore ${short}`) : null;
  exploreButton?.addEventListener('click', () => void exploreFrom(ctx, entry, exploreButton));

  const what =
    b.kind === 'star' ? 'The star at the centre'
      : b.kind === 'moon' ? 'Earth\'s own moon'
        : `${kindOf(entry)}, ${ordinal(entry.order)} from the Sun`;
  // The name is the title on the left.
  info.replaceChildren(
    h('div', { class: 'm-info-sub', text: what }),
    h('p', { text: b.blurb }),
    h(
      'div',
      { class: 'm-facts' },
      ...facts.map(([name, value]) => h('div', { class: 'm-fact' }, h('small', { text: name }), h('b', { text: value }))),
    ),
    ...(lines.length > 0 ? [h('div', { class: 'm-lines' }, ...lines)] : []),
    h('div', { class: 'm-actions' }, exploreButton, earthButton, nextButton),
  );
}

export function fillSelect(ctx: MenuCtx): void {
  const { select, time } = ctx;
  if (ctx.chosen !== null) {
    select.replaceChildren(
      h(
        'div',
        {},
        h('div', { class: 'm-select-name', text: ctx.chosen.name === '' ? 'Back where you left off' : `Landing in ${ctx.chosen.name}` }),
        h('div', { class: 'm-select-sub', text: ctx.chosen.region || 'Earth' }),
      ),
    );
    return;
  }
  if (ctx.picked === null) return;
  const site = ctx.picked;
  const startButton = h('button', { class: 'ui-btn primary big' }, 'Start here', kbd('⏎'));
  startButton.addEventListener('click', () => start(ctx, site));
  // What it is, then how many live there and what time it is for them.
  const region = regionName(ctx, site.key);
  const details = [site.capital === true ? `Capital of ${region}` : region];
  if (site.weight > 0) details.push(people(site.weight));
  details.push(`${ctx.body.clock?.(site, time()) ?? clockAt(time(), site.key, site.lon, site.lat)} local time`);
  select.replaceChildren(
    flag(site.key, 44, 30),
    h('div', {}, h('div', { class: 'm-select-name', text: site.name }), h('div', { class: 'm-select-sub', text: details.join(', ') })),
    startButton,
  );
}
