/** The search: every world's countries and towns, matched on folded names. */
import { fold, h } from '../ui.ts';
import { worldDisc } from '../world-disc.ts';
import { setBody } from './bodies.ts';
import { catalogueOf } from './catalogue.ts';
import type { Entry, MenuCtx } from './context.ts';
import { flag } from './dom.ts';
import { isEnter } from './poses.ts';
import { chooseRegion } from './stages.ts';
import { compact } from './text.ts';
import { EARTH_WORDS, type MenuBody } from './types.ts';

/** The search says what it searches: every world's countries and towns, whichever globe is up. */
export function refreshWords(ctx: MenuCtx): void {
  const { searchInput } = ctx;
  ctx.words = ctx.body.words ?? EARTH_WORDS;
  // Short enough to fit the box beside its key; the label says it whole.
  searchInput.placeholder = 'Search a place, on any world';
  searchInput.setAttribute('aria-label', 'Search a country or a town, on any world');
}

/** Every name the search answers on one body, made on first search and kept. */

function entriesFor(ctx: MenuCtx, of: MenuBody): Entry[] {
  const { entriesOf, home } = ctx;
  const made = entriesOf.get(of.id);
  if (made !== undefined) return made;
  const entries: Entry[] = [];
  // Its own regions' names, and the world's after them when it is not Earth.
  const { regionIndexOf: indexIn } = catalogueOf(ctx, of);
  const where = of === home ? '' : `, ${of.name.replace(/^The /, '')}`;
  const nameIn = (key: string): string => `${of.regions[(indexIn.get(key) ?? 0) - 1]?.name ?? key}${where}`;
  of.regions.forEach((candidate) => {
    if (candidate.rings.length === 0) return;
    const folded = fold(candidate.name);
    const count = catalogueOf(ctx, of).sitesOf.get(candidate.key)?.length ?? 0;
    entries.push({
      of,
      kind: 'country',
      name: candidate.name,
      folded,
      words: folded.split(/[\s\-']+/),
      // Countries rank above towns of the same match; the size is a tie-break.
      weight: 1e12 + count,
      key: candidate.key,
      site: null,
      // A world's region is noted with the world already: it is not said twice.
      sub: `${candidate.note}, ${count.toLocaleString('en')} ${(of.words ?? EARTH_WORDS).sites}${candidate.note.includes(of.name.replace(/^The /, '')) ? '' : where}`,
    });
  });
  for (const site of of.sites) {
    const folded = fold(site.name);
    entries.push({
      of,
      kind: 'town',
      name: site.name,
      folded,
      words: folded.split(/[\s\-']+/),
      weight: site.weight,
      key: site.key,
      site,
      sub: site.weight > 0 ? `${nameIn(site.key)}, ${compact(site.weight)} people` : nameIn(site.key),
    });
  }
  // The other names a town answers to: the row is the town that stands and says which name found it.
  for (const [alias, index] of of.aliases ?? []) {
    const site = of.sites[index];
    if (site === undefined) continue;
    const folded = fold(alias);
    if (folded === fold(site.name)) continue;
    entries.push({
      of,
      kind: 'town',
      alias: true,
      name: site.name,
      folded,
      words: folded.split(/[\s\-']+/),
      weight: site.weight,
      key: site.key,
      site,
      sub: `for ${alias}, in ${nameIn(site.key)}`,
    });
  }
  entriesOf.set(of.id, entries);
  return entries;
}

export function closeResults(ctx: MenuCtx): void {
  const { results } = ctx;
  results.classList.remove('on');
  ctx.found = [];
}

/** Scans the folded names: prefix beats word start beats substring; ties go to the bigger place, and a country beats a town. */
function runSearch(ctx: MenuCtx): void {
  const { home, loaded, searchInput, walkable } = ctx;
  const query = fold(searchInput.value.trim());
  if (query.length === 0) {
    closeResults(ctx);
    return;
  }
  // Every world the menu has made, the one up first among equals: a town on
  // Mars is found from Earth's globe, and Paris from Mars.
  const worlds = new Set<MenuBody>([ctx.body, home, ...walkable.values(), ...loaded.values()]);
  const all = [...worlds].flatMap((of) => entriesFor(ctx, of));
  // A name a town folded in is dropped where a town that stands has it:
  // "Madrid" is Madrid, not the suburb of Bogotá that was called that.
  const standing = new Set(all.filter((entry) => entry.kind === 'town' && entry.alias !== true).map((entry) => entry.folded));
  const scored: { entry: Entry; score: number }[] = [];
  for (const entry of all) {
    if (entry.alias === true && standing.has(entry.folded)) continue;
    let score = 0;
    if (entry.folded.startsWith(query)) score = 3;
    else if (entry.words.some((word) => word.startsWith(query))) score = 2;
    else if (query.length > 2 && entry.folded.includes(query)) score = 1;
    if (score > 0) scored.push({ entry, score });
  }
  scored.sort((a, b) => b.score - a.score || Number(b.entry.of === ctx.body) - Number(a.entry.of === ctx.body) || b.entry.weight - a.entry.weight);
  ctx.found = scored.slice(0, 7).map((item) => item.entry);
  ctx.cursor = 0;
  renderResults(ctx);
}

function renderResults(ctx: MenuCtx): void {
  const { home, results } = ctx;
  results.replaceChildren();
  if (ctx.found.length === 0) {
    results.append(h('div', { class: 'm-empty', text: 'Nothing by that name that is built, on any world — try a bigger town nearby.' }));
  }
  ctx.found.forEach((entry, i) => {
    const row = h(
      'div',
      { class: i === ctx.cursor ? 'm-result on' : 'm-result', role: 'option' },
      // Another world's ball where Earth's flag would be: its nations' banners mean nothing to anyone.
      entry.of === home ? flag(entry.key, 26, 18) : h('span', { class: 'm-result-world' }, worldDisc(entry.of.id, 18)),
      h('div', {}, h('b', { text: entry.name }), h('small', { text: entry.sub })),
      h('span', {
        class: entry.kind === 'country' ? 'ui-tag ink' : 'ui-tag',
        text: entry.kind === 'country' ? (entry.of.words ?? EARTH_WORDS).region : (entry.of.words ?? EARTH_WORDS).site,
      }),
    );
    row.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      pickEntry(ctx, entry);
    });
    row.addEventListener('pointerenter', () => {
      ctx.cursor = i;
      for (const [j, child] of Array.from(results.children).entries()) child.classList.toggle('on', j === i);
    });
    results.append(row);
  });
  results.classList.add('on');
}

function pickEntry(ctx: MenuCtx, entry: Entry): void {
  const { orrery, searchInput } = ctx;
  searchInput.value = '';
  searchInput.blur();
  closeResults(ctx);
  // On another world: its globe is the one up from here, and the flight goes there.
  if (entry.of !== ctx.body) {
    setBody(ctx, entry.of);
    orrery.focus(null);
  }
  const index = ctx.regionIndexOf.get(entry.key) ?? 0;
  if (entry.site !== null) chooseRegion(ctx, index, entry.site);
  else chooseRegion(ctx, index);
}

export function bindSearch(ctx: MenuCtx): void {
  const { home, searchInput } = ctx;
  // Built while the menu opens rather than on the first keystroke.
  entriesFor(ctx, home);

  searchInput.addEventListener('input', () => runSearch(ctx));
  searchInput.addEventListener('focus', () => {
    if (searchInput.value.trim().length > 0) runSearch(ctx);
  });
  searchInput.addEventListener('blur', () => setTimeout(() => closeResults(ctx), 120));
  searchInput.addEventListener('keydown', (event) => {
    if (event.code === 'ArrowDown' || event.code === 'ArrowUp') {
      event.preventDefault();
      if (ctx.found.length === 0) return;
      ctx.cursor = (ctx.cursor + (event.code === 'ArrowDown' ? 1 : ctx.found.length - 1)) % ctx.found.length;
      renderResults(ctx);
    } else if (isEnter(event)) {
      event.preventDefault();
      const entry = ctx.found[ctx.cursor];
      if (entry !== undefined) pickEntry(ctx, entry);
    } else if (event.code === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      searchInput.value = '';
      searchInput.blur();
      closeResults(ctx);
    }
  });
}
