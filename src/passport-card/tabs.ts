/** The bookmarks along the top and the planets down the right edge. */
import { PALETTE } from '../theme.ts';
import { h } from '../ui.ts';
import { worldOf } from '../passport.ts';
import { PER_PAGE } from './constants.ts';
import { worldDisc } from './art.ts';
import type { BookDom } from './dom.ts';
import { updateCorners } from './sizing.ts';
import { chapterAt, countOf, spreadOfPage, stampsByIso, visaOf } from './model.ts';
import type { BookModel } from './model.ts';

/** Builds a bookmark a visa and a planet a chapter, for the visas and chapters as they stand. */
export function rebuildTabs(model: BookModel, dom: BookDom, turn: (to: number) => void, signal: AbortSignal): void {
  const { tabs, worldTabs, ribbons, holderTab, worlds } = dom;
  tabs.clear();
  for (const visa of model.visas) {
    const tab = h('button', { class: 'p-tab', type: 'button' });
    tab.style.setProperty('--tab', visa.dye);
    tab.addEventListener('click', () => {
      const first = model.firstPageOf.get(visa.key);
      if (first !== undefined) {
        model.pendingHalf = first % 2;
        turn(spreadOfPage(first));
      }
    }, { signal });
    tabs.set(visa.key, tab);
  }
  ribbons.replaceChildren(holderTab, ...tabs.values());
  worldTabs.clear();
  if (model.chapters.length > 0) {
    const all = [
      { body: 'earth', name: 'Earth', color: PALETTE.skyBlue as number },
      ...model.chapters.map((chapter) => ({ body: chapter.body, name: chapter.name, color: chapter.color ?? PALETTE.white })),
    ];
    for (const world of all) {
      const tab = h('button', { class: 'p-world', type: 'button', html: worldDisc(world.body, world.color) });
      tab.addEventListener('click', () => {
        const start = model.chapterStart.get(world.body);
        if (start !== undefined) turn(world.body === 'earth' ? 0 : spreadOfPage(start));
      }, { signal });
      worldTabs.set(world.body, tab);
    }
  }
  worlds.replaceChildren(...worldTabs.values());
  worlds.hidden = worldTabs.size === 0;
}

/** Refreshes the bookmarks' counts and current marks, the planets', and the corners, for the spread on show. */
export function updateChrome(model: BookModel, dom: BookDom, hideTip: () => void): void {
  const stamped = stampsByIso(model);
  const chapter = chapterAt(model, model.spread);
  dom.holderTab.setAttribute('aria-current', String(model.spread === 0));
  for (const [key, tab] of dom.tabs) {
    const visa = visaOf(model, key)!;
    // Only the chapter you are in stands up along the top; the holder's is the book's.
    tab.hidden = visa.chapter !== chapter;
    const [got, all] = visa.tally?.() ?? [countOf(visa, stamped), visa.entries.length];
    const first = model.firstPageOf.get(key) ?? -1;
    const parts = model.partsOf.get(key) ?? Math.max(1, Math.ceil(visa.entries.length / PER_PAGE));
    const from = visa.chapter === 'earth' ? spreadOfPage(first) : spreadOfPage(model.chapterStart.get(visa.chapter) ?? first);
    const open = !tab.hidden && first >= 0 && from <= model.spread && model.spread <= spreadOfPage(first + parts - 1);
    tab.replaceChildren(h('b', { text: visa.title }), h('em', { text: `${got}/${all}` }));
    tab.setAttribute('aria-label', `${visa.title}: ${got} of ${all} ${visa.tally === undefined ? 'stamped' : visa.key === 'courses' ? 'run' : 'collected'}`);
    tab.setAttribute('aria-current', String(open));
  }
  for (const [body, tab] of dom.worldTabs) {
    const name = body === 'earth' ? 'Earth' : model.chapters.find((each) => each.body === body)?.name ?? body;
    const got = model.passport.data.stamps.filter((stamp) => worldOf(stamp.iso) === body).length;
    tab.setAttribute('aria-current', String(body === chapter));
    tab.setAttribute('aria-label', `${name}: ${got} stamped`);
    tab.title = `${name} · ${got} stamped`;
  }
  hideTip();
  updateCorners(model, dom);
}
