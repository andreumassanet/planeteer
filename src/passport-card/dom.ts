/** The passport's DOM skeleton: the book, its chapters' bar over it and its worlds' under it, the tooltip and the dropped stamp. */
import { h, icon } from '../ui.ts';
import { cornerSvg } from './art.ts';

export interface BookDom {
  left: HTMLElement;
  right: HTMLElement;
  /** The two corners: the only things on the paper that turn it. */
  previous: HTMLButtonElement;
  next: HTMLButtonElement;
  book: HTMLElement;
  /** A bookmark for the holder's page and one per visa along the top edge. */
  holderTab: HTMLButtonElement;
  tabs: Map<string, HTMLButtonElement>;
  ribbons: HTMLElement;
  /** A planet per chapter down the right edge, once there is more than Earth. */
  worldTabs: Map<string, HTMLButtonElement>;
  worlds: HTMLElement;
  scaler: HTMLElement;
  fit: HTMLElement;
  panel: HTMLElement;
  tipFlag: HTMLElement;
  tipName: HTMLElement;
  tipCapital: HTMLElement;
  tipStamp: HTMLElement;
  tip: HTMLElement;
  overlay: HTMLElement;
  dropStamp: HTMLElement;
  drop: HTMLElement;
  root: HTMLElement;
}

export function createBookDom(): BookDom {
  const left = h('div', { class: 'p-side left', role: 'group', 'aria-roledescription': 'page' });
  const right = h('div', { class: 'p-side right', role: 'group', 'aria-roledescription': 'page' });
  const previous = h('button', { class: 'p-corner prev', type: 'button', 'aria-label': 'Previous pages', html: cornerSvg('p-corner-prev') });
  const next = h('button', { class: 'p-corner next', type: 'button', 'aria-label': 'Next pages', html: cornerSvg('p-corner-next') });
  const book = h('div', { class: 'p-book' }, left, right, previous, next);
  const holderTab = h('button', { class: 'p-tab holder', type: 'button', 'aria-label': 'The holder' }, h('b', {}, icon('passport', 14), 'Holder'), h('em', { text: 'ATL' }));
  const ribbons = h('nav', { class: 'p-ribbons', 'aria-label': 'Bookmarks' }, holderTab);
  const worlds = h('nav', { class: 'p-worlds', 'aria-label': 'Worlds' });
  const scaler = h('div', { class: 'p-scaler' }, h('div', { class: 'p-cover-back' }), ribbons, worlds, book);
  const fit = h('div', { class: 'p-fit' }, scaler);
  const swipe = h('div', { class: 'p-swipe', text: 'Swipe to turn the page · tap outside to close' });
  const panel = h('div', { class: 'p-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Passport', tabindex: '-1' }, fit, swipe);
  const tipFlag = h('span');
  const tipName = h('b');
  const tipCapital = h('small');
  const tipStamp = h('small');
  const tip = h('div', { class: 'p-tip ui-card', 'aria-hidden': 'true' }, tipFlag, h('div', {}, tipName, tipCapital, tipStamp));
  const overlay = h('div', { class: 'atlas-passport' }, panel, tip);
  const dropStamp = h('div');
  const drop = h('div', { class: 'atlas-stamp-drop', role: 'status' }, dropStamp);
  const root = h('div', {}, overlay, drop);
  return {
    left, right, previous, next, book, holderTab, tabs: new Map(), ribbons, worldTabs: new Map(), worlds, scaler, fit, panel,
    tipFlag, tipName, tipCapital, tipStamp, tip, overlay, dropStamp, drop, root,
  };
}
