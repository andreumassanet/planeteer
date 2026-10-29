/** The menu's DOM: the overlay and every element the modules fill and toggle. */
import { createFlagCanvas } from '../flags.ts';
import { h, icon, kbd } from '../ui.ts';

export function buildDom() {
  // Focusable by script only: when a focused control goes away with its stage,
  // focus returns here so `Tab` and the shortcuts keep working.
  const root = h('div', { class: 'atlas-menu', tabindex: -1 });

  const halo = h('div', { class: 'm-halo' });
  const pinLayer = h('div', { class: 'm-pins' });
  const marks = h('div', { class: 'm-marks' }, halo, pinLayer);
  const dipLayer = h('div', { class: 'm-dip' });

  // Where you are, as a title: the path above it, the place itself large.
  const trail = h('nav', { class: 'm-trail', 'aria-label': 'Where you are' });
  const titleFlag = h('span', { class: 'm-title-flag' });
  const titleText = h('span');
  const title = h('h1', { class: 'm-title' }, titleText, titleFlag);
  const crumbs = h('div', { class: 'm-crumbs m-fade m-chrome' }, trail, title);

  const panel = h('div', { class: 'm-panel m-fade m-chrome' });

  const continueLabel = h('span');
  const continueButton = h('button', { class: 'ui-btn primary m-continue m-fade m-chrome' }, icon('play', 16), continueLabel);
  const searchInput = h('input', {
    type: 'search',
    placeholder: 'Search a place, on any world',
    spellcheck: 'false',
    autocomplete: 'off',
    'aria-label': 'Search a country or a town, on any world',
  });
  const results = h('div', { class: 'm-results m-glass', role: 'listbox' });

  const search = h(
    'div',
    { class: 'm-search m-fade' },
    h('label', { class: 'm-search-box m-glass' }, icon('search', 18), searchInput, kbd('/')),
    results,
  );
  // The one way back, always in the same corner and on the same key: a step up
  // the path, and from the system to the title, where the traveller is dressed.
  const backLabel = h('span');
  const leaveButton = h('button', { class: 'm-leave m-fade m-chrome' }, kbd('Esc'), backLabel);

  const topRight = h('div', { class: 'm-top-right m-chrome' }, search);

  const dock = h('div', { class: 'm-dock m-glass m-fade m-chrome' });
  const info = h('div', { class: 'm-info m-glass m-fade m-chrome' });
  const select = h('div', { class: 'm-select m-glass m-fade' });

  const tipFlag = h('span');
  const tipName = h('b');
  const tipSub = h('small');
  const tip = h('div', { class: 'm-tip m-glass' }, tipFlag, h('div', {}, tipName, tipSub));

  const reticleLabel = h('span', { class: 'ui-tag gold' });
  const reticle = h('div', { class: 'm-reticle' }, h('i'), reticleLabel);

  root.append(marks, dipLayer, reticle, crumbs, panel, dock, info, select, topRight, continueButton, leaveButton, tip);
  return {
    root,
    halo,
    pinLayer,
    marks,
    dipLayer,
    trail,
    title,
    titleText,
    titleFlag,
    crumbs,
    panel,
    continueLabel,
    continueButton,
    searchInput,
    results,
    search,
    leaveButton,
    backLabel,
    topRight,
    dock,
    info,
    select,
    tipFlag,
    tipName,
    tipSub,
    tip,
    reticleLabel,
    reticle,
  };
}

export const flag = (key: string, w: number, height: number): HTMLCanvasElement => {
  const canvas = createFlagCanvas(key, w, height);
  canvas.className = 'ui-flag';
  return canvas;
};

export type MenuDom = ReturnType<typeof buildDom>;
