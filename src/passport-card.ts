/**
 * The passport: a book you hold, open on spreads of two pages that turn. The
 * first spread holds the holder's page with a portrait; each continent has a
 * visa with every one of its countries, the ones you have come down in
 * stamped in their own ink and the rest an empty grey outline. Under the
 * pointer a stamp names the country, its capital and when and how it was
 * stamped.
 *
 * The card is a modal over the world that holds the keyboard
 * (`registerModal`) while it is up and owns no data: the book is
 * `passport.ts`'s and the portrait is the traveller's look (`appearance.ts`).
 * The passport key (`N`), the HUD button and `Esc` open and close it. The book is designed at one
 * size (`SHEET_W` by `SHEET_H`) and scaled to the window; with reduced motion
 * a leaf turns at once.
 *
 * A stamp is an SVG in one ink, the country's flag colour (`flagColor`), with
 * a band of the flag's colours; its shape and tilt come from a hash of the
 * country code. `celebrate` drops a new stamp onto the screen with a thump.
 *
 * One book, a chapter a world: every other world the caller hands in
 * (`chapters`, see `planet.ts`) follows Earth's with a frontispiece and a visa
 * of its nations, reached by planet tabs on the cover's right edge. A nation's
 * stamp is a round seal with its banner in the middle.
 *
 * Given the rings (`rings`), Earth's chapter closes on two more visas: the
 * landmarks' rings, a gold ring stamped for each one flown through, and the
 * course log, each kind's courses run with the best time and medal.
 *
 * The parts live in `passport-card/`: `model.ts` (data and page questions),
 * `pages.ts`, `leaf.ts`, `rings-model.ts`, `rings-pages.ts`, `rings-style.ts`,
 * `turning.ts`, `tabs.ts`, `tip.ts`, `sizing.ts`, `dom.ts`,
 * `stamp-svg.ts`, `seal-svg.ts`, `art.ts`, `style.ts`, `constants.ts`.
 */
import { actionOf, holdFocus, inputBlocked, labelOf, registerModal } from './controls.ts';
import type { Appearance } from './appearance.ts';
import { loadCountryFacts } from './country-facts.ts';
import { ensureStyle, installUi } from './ui.ts';
import { isTouch } from './touch.ts';
import type { Passport, Stamp } from './passport.ts';
import type { PassportChapter } from './planet.ts';
import type { PassportRings } from './passport-card/rings-model.ts';
import { createBookDom } from './passport-card/dom.ts';
import { createBookModel, layoutModel, newestSpread, openingSpread, otherWorlds, spreads } from './passport-card/model.ts';
import { pagesOf } from './passport-card/pages.ts';
import { resize } from './passport-card/sizing.ts';
import { createStampDrop } from './passport-card/stamp-drop.ts';
import { RINGS_STYLE } from './passport-card/rings-style.ts';
import { STYLE } from './passport-card/style.ts';
import { rebuildTabs, updateChrome } from './passport-card/tabs.ts';
import { createTip } from './passport-card/tip.ts';
import { createTurner } from './passport-card/turning.ts';

export { stampSvg } from './passport-card/stamp-svg.ts';
export { sealSvg } from './passport-card/seal-svg.ts';
export type { PassportRings } from './passport-card/rings-model.ts';

export interface PassportCardOptions {
  passport: Passport;
  /** Every country on the planet, for the continents' pages. */
  countries: readonly { iso: string; name: string; continent: string }[];
  /** Who holds the book: the name the others see, and the look they see it on. */
  holder?(): { name: string; appearance: Appearance };
  /** The country the holder is standing in, by code, or `''`: the book opens at its visa. */
  here?(): string;
  /** Where to hand the pointer back to, if it was locked when the card opened. */
  lockTarget?: HTMLElement | null;
  onOpen?(): void;
  onClose?(): void;
  /** A leaf has been turned: `leaves` is how many it stood for (a bookmark can skip several). */
  onTurn?(leaves: number): void;
  /** A new stamp has just hit the page. */
  onThud?(): void;
  /**
   * The other worlds' chapters, in the order the book takes them after
   * Earth's: an array, or a function asked on the first opening (or the first
   * stamp) that may answer later — Earth hands a dynamic import here, so the
   * worlds' data stays out of its first load.
   */
  chapters?: readonly PassportChapter[] | (() => readonly PassportChapter[] | Promise<readonly PassportChapter[]>);
  /**
   * The rings (`rings.ts`): asked each time a page of them is laid, null
   * while there are none yet. Given, Earth's chapter gains two visas after
   * its continents, the landmarks' rings and the log of the courses run.
   */
  rings?: () => PassportRings | null;
}

export interface PassportCard {
  /** The card and the stamp that drops: add it to the page once. */
  root: HTMLElement;
  readonly open: boolean;
  show(options?: { relock?: boolean }): void;
  hide(): void;
  toggle(): void;
  /** Drops a new stamp onto the screen. */
  celebrate(stamp: Stamp): void;
  /** Closes it, takes it off the page and lets go of its keys. */
  dispose(): void;
}

export function createPassportCard(options: PassportCardOptions): PassportCard {
  installUi();
  ensureStyle('atlas-passport', STYLE + RINGS_STYLE);
  /** Every listener the card adds goes with it on `dispose`. */
  const events = new AbortController();
  const { signal } = events;
  const model = createBookModel(options);
  const dom = createBookDom();
  const { overlay, panel, root, hint, holderTab } = dom;
  const tip = createTip(model, dom, signal);
  const turner = createTurner(model, dom, options, signal, () => updateChrome(model, dom, tip.hide));

  let showing = false;
  let relock = false;
  let disposed = false;
  let previousFocus: HTMLElement | null = null;
  let chaptersAsked = false;
  const unregisterModal = registerModal(() => showing);

  holderTab.addEventListener('click', () => {
    model.pendingHalf = 1;
    turner.turn(0);
  }, { signal });

  /** Lays the chapters in and the book out again, round the spread on show. */
  function applyChapters(list: readonly PassportChapter[]): void {
    model.chapters = otherWorlds(list);
    layoutModel(model);
    rebuildTabs(model, dom, turner.turn, signal);
    if (!showing) return;
    turner.settle();
    model.pages = pagesOf(model, options);
    model.spread = Math.min(spreads(model) - 1, model.turned ? model.spread : openingSpread(model, options.here?.() ?? ''));
    turner.showSpread();
    resize(model, dom);
  }

  /** Asks for the chapters once, the first time the book is opened or stamped. */
  function askChapters(): void {
    if (chaptersAsked) return;
    chaptersAsked = true;
    const given = options.chapters;
    if (given === undefined || Array.isArray(given)) return;
    try {
      const answer = (given as () => readonly PassportChapter[] | Promise<readonly PassportChapter[]>)();
      if (answer instanceof Promise) {
        answer.then((list) => {
          if (!disposed) applyChapters(list);
        }).catch(() => undefined);
      } else applyChapters(answer);
    } catch {
      // No chapters: the book is Earth's alone.
    }
  }

  // An array is in hand already: the book is laid out with it from the start.
  if (Array.isArray(options.chapters)) model.chapters = otherWorlds(options.chapters as readonly PassportChapter[]);
  layoutModel(model);
  rebuildTabs(model, dom, turner.turn, signal);
  model.pages = pagesOf(model, options);

  function show(opening: { relock?: boolean } = {}): void {
    if (showing || disposed) return;
    showing = true;
    model.turned = false;
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const target = options.lockTarget ?? null;
    relock = opening.relock ?? (target !== null && document.pointerLockElement === target);
    options.onOpen?.();
    if (document.pointerLockElement != null && typeof document.exitPointerLock === 'function') document.exitPointerLock();
    // The capitals for the tooltips; fetched once.
    if (model.facts === null) {
      void loadCountryFacts()
        .then((loaded) => {
          model.facts = loaded;
        })
        .catch(() => undefined);
    }
    askChapters();
    model.pages = pagesOf(model, options);
    model.spread = Math.min(spreads(model) - 1, openingSpread(model, options.here?.() ?? ''));
    // On the first spread, the holder's page rather than the notice inside the cover.
    model.half = model.spread === 0 ? 1 : 0;
    turner.showSpread();
    const key = labelOf('passport');
    hint.textContent = isTouch() ? 'Tap a corner to turn the page · tap outside to close' : `← → turn the page · ${key} or Esc to close`;
    resizeBook();
    addEventListener('resize', resizeBook, { signal });
    if (!root.isConnected) document.body.append(root);
    overlay.classList.add('on');
    panel.focus({ preventScroll: true });
  }

  function resizeBook(): void {
    resize(model, dom);
  }

  function hide(): void {
    if (!showing) return;
    showing = false;
    turner.settle();
    tip.hide();
    removeEventListener('resize', resizeBook);
    overlay.classList.remove('on');
    options.onClose?.();
    const target = options.lockTarget ?? null;
    if (relock && target !== null && typeof target.requestPointerLock === 'function') {
      // Chrome refuses a lock asked for too soon after one was released; that rejection is noise.
      try {
        const request: unknown = target.requestPointerLock();
        if (request instanceof Promise) request.catch(() => {});
      } catch {
        // The card is closed either way.
      }
    }
    (document.activeElement as HTMLElement | null)?.blur?.();
    if (!relock && previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    previousFocus = null;
  }

  // A lock granted while the card is up is handed straight back, as the settings card does.
  document.addEventListener('pointerlockchange', () => {
    if (showing && document.pointerLockElement != null && typeof document.exitPointerLock === 'function') document.exitPointerLock();
  }, { signal });
  // Outside the book is outside the passport; on the book, only its corners and bookmarks answer.
  overlay.addEventListener('pointerdown', (event) => {
    if (event.target === overlay) hide();
  }, { signal });
  addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (showing) {
      if (event.code === 'Escape' || actionOf(event.code) === 'passport') {
        event.preventDefault();
        // Not the menu's Escape as well, which would go back a stage behind the card.
        event.stopImmediatePropagation();
        hide();
      } else if (event.code === 'ArrowRight' || event.code === 'PageDown') {
        event.preventDefault();
        turner.turn(model.spread + 1);
      } else if (event.code === 'ArrowLeft' || event.code === 'PageUp') {
        event.preventDefault();
        turner.turn(model.spread - 1);
      } else if (event.code === 'Home') {
        event.preventDefault();
        turner.turn(0);
      } else if (event.code === 'End') {
        event.preventDefault();
        turner.turn(newestSpread(model));
      } else {
        holdFocus(event, panel);
      }
      return;
    }
    if (event.repeat || actionOf(event.code) !== 'passport' || inputBlocked(event)) return;
    event.preventDefault();
    show();
  }, { signal });

  const stampDrop = createStampDrop({
    model,
    dom,
    onThud: () => options.onThud?.(),
    askChapters,
    isDisposed: () => disposed,
    refresh() {
      if (!showing) return;
      turner.settle();
      model.pages = pagesOf(model, options);
      model.spread = Math.min(model.spread, spreads(model) - 1);
      turner.showSpread();
    },
  });

  return {
    root,
    get open() {
      return showing;
    },
    show,
    hide,
    toggle: () => (showing ? hide() : show()),
    celebrate: stampDrop.celebrate,
    dispose() {
      hide();
      disposed = true;
      stampDrop.dispose();
      events.abort();
      unregisterModal();
      root.remove();
    },
  };
}
