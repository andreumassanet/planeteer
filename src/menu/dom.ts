/** The menu's DOM: the overlay and every element the modules fill and toggle. */
import { createFlagCanvas } from '../flags.ts';
import { h, icon, kbd } from '../ui.ts';
import type { MenuDeps } from './types.ts';

export function buildDom(deps: MenuDeps) {
  // Focusable by script only: when a focused control goes away with its stage,
  // focus returns here so `Tab` and the shortcuts keep working.
  const root = h('div', { class: 'atlas-menu', tabindex: -1 });

  const halo = h('div', { class: 'm-halo' });
  const pinLayer = h('div', { class: 'm-pins' });
  const marks = h('div', { class: 'm-marks' }, halo, pinLayer);
  const dipLayer = h('div', { class: 'm-dip' });

  const brand = h(
    'div',
    { class: 'm-brand m-fade m-chrome' },
    h('div', { class: 'm-wordmark', text: 'planeteer' }),
    h('div', { class: 'm-tagline', text: 'Pick a world to explore.' }),
  );

  const backButton = h('button', { class: 'ui-btn icon', title: 'Back (Esc)', 'aria-label': 'Back' }, icon('back'));
  const trail = h('nav', { class: 'm-trail ui-card', 'aria-label': 'Where you are' });
  const crumbs = h('div', { class: 'm-crumbs m-fade m-chrome' }, backButton, trail);

  const panel = h('div', { class: 'm-panel ui-card m-fade m-chrome' });

  const continueLabel = h('span');
  const continueButton = h('button', { class: 'ui-btn primary m-continue m-fade' }, icon('play', 16), continueLabel);
  const searchInput = h('input', {
    type: 'search',
    placeholder: 'Search a country or a town',
    spellcheck: 'false',
    autocomplete: 'off',
    'aria-label': 'Search a country or a town',
  });
  const results = h('div', { class: 'm-results ui-card', role: 'listbox' });

  const search = h(
    'div',
    { class: 'm-search m-fade' },
    h('label', { class: 'm-search-box ui-card' }, icon('search', 19), searchInput, kbd('/')),
    results,
  );
  // The title is where the traveller is dressed and the way to play chosen; `Esc` over the system goes there too.
  const leaveButton =
    deps.onLeave === undefined
      ? null
      : h('button', { class: 'ui-btn m-leave m-fade', title: 'Your traveller, and online or offline' }, icon('back', 16), 'Main menu', kbd('Esc'));

  const topRight = h('div', { class: 'm-top-right m-chrome' }, search, continueButton, leaveButton);

  const dock = h('div', { class: 'm-dock m-fade m-chrome' });
  const info = h('div', { class: 'm-info ui-card m-fade m-chrome' });
  const backLabel = h('span');
  const back = h('button', { class: 'ui-btn m-back m-fade m-chrome' }, icon('back', 18), backLabel, kbd('Esc'));
  const select = h('div', { class: 'm-select ui-card m-fade' });

  const tipFlag = h('span');
  const tipName = h('b');
  const tipSub = h('small');
  const tip = h('div', { class: 'm-tip ui-card' }, tipFlag, h('div', {}, tipName, tipSub));

  const reticleLabel = h('span', { class: 'ui-tag gold' });
  const reticle = h('div', { class: 'm-reticle' }, h('i'), reticleLabel);

  root.append(marks, dipLayer, reticle, brand, crumbs, panel, dock, info, back, select, topRight, tip);
  return {
    root,
    halo,
    pinLayer,
    marks,
    dipLayer,
    brand,
    backButton,
    trail,
    crumbs,
    panel,
    continueLabel,
    continueButton,
    searchInput,
    results,
    search,
    leaveButton,
    topRight,
    dock,
    info,
    backLabel,
    back,
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
