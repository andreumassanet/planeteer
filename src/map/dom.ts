import { h, icon, kbd } from '../ui.ts';
import { labelOf, onKeyLabels } from '../controls.ts';
import type { WorldMapOptions } from './types.ts';
import { createLegend } from './legend.ts';

/** The overlay's elements. */
export interface MapDom {
  readonly root: HTMLElement;
  readonly sheet: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly marksCanvas: HTMLCanvasElement;
  readonly mctx: CanvasRenderingContext2D;
  readonly unmark: HTMLButtonElement;
  readonly zoomIn: HTMLButtonElement;
  readonly zoomOut: HTMLButtonElement;
  readonly locate: HTMLButtonElement;
  readonly closeButton: HTMLButtonElement;
  readonly scaleText: HTMLElement;
  readonly scaleBar: HTMLElement;
  readonly tip: HTMLElement;
  readonly tipFlag: HTMLElement;
  readonly tipName: HTMLElement;
  readonly tipSub: HTMLElement;
  /** Stops following the key bindings. */
  readonly unlabel: () => void;
}

/** Builds the overlay: the sheet's two canvases, the header, the zoom buttons, the scale, the key legend and the tip. */
export function createDom(options: WorldMapOptions): MapDom {
  const { surface } = options;
  // A dialog to assistive technology, and not a modal one: the world goes on
  // flying under it.
  const root = h('div', { class: 'atlas-map', role: 'dialog', 'aria-label': 'World map' });
  // Focused on opening, so a screen reader says where it is; never by `Tab`.
  const sheet = h('div', { class: 'atlas-map-sheet', tabindex: '-1' });
  const canvas = h('canvas');
  const ctx = canvas.getContext('2d')!;
  // What moves (you, the other players, the route, the pins) is drawn on a
  // second canvas, so a moving arrow does not repaint the tiles and the names.
  const marksCanvas = h('canvas', { class: 'atlas-map-marks', 'aria-hidden': 'true' });
  const mctx = marksCanvas.getContext('2d')!;
  sheet.append(canvas, marksCanvas);

  const legend = createLegend(options);
  const unmark = h('button', { class: 'ui-btn small', type: 'button' }, icon('close', 16), 'Clear marker');
  unmark.hidden = true;
  const head = h(
    'div',
    { class: 'atlas-map-head ui-card' },
    h('div', { class: 'atlas-map-title', text: surface?.name ?? 'The world' }),
    legend,
    unmark,
  );

  const zoomIn = h('button', { class: 'ui-btn icon', type: 'button', 'aria-label': 'Zoom in', text: '+' });
  const zoomOut = h('button', { class: 'ui-btn icon', type: 'button', 'aria-label': 'Zoom out', text: '−' });
  const locate = h('button', { class: 'ui-btn icon', type: 'button', 'aria-label': 'Centre on you' }, icon('walk'));
  const zoomBox = h('div', { class: 'atlas-map-zoom' }, locate, zoomIn, zoomOut);
  const closeButton = h('button', { class: 'ui-btn icon atlas-map-close', type: 'button', 'aria-label': 'Close the map' }, icon('close'));

  const scaleText = h('span');
  const scaleBar = h('b');
  const scale = h('div', { class: 'atlas-map-scale ui-card' }, scaleText, scaleBar);

  const foot = h('div', { class: 'atlas-map-foot ui-card' });
  // The caps from the live bindings, drawn again when a key moves.
  const relabelFoot = (): void => {
    foot.replaceChildren(
      h('span', {}, kbd(labelOf('map')), 'close'),
      h('span', {}, kbd(labelOf('mapIn')), kbd(labelOf('mapOut')), 'zoom'),
      h('span', { class: 'quiet', text: 'drag to move, scroll to zoom, click to place a marker' }),
    );
  };
  relabelFoot();
  const unlabel = onKeyLabels(relabelFoot);

  const tipFlag = h('span');
  const tipName = h('div', { class: 'atlas-map-tip-name' });
  const tipSub = h('div', { class: 'atlas-map-tip-sub' });
  const tip = h('div', { class: 'atlas-map-tip ui-card' }, tipFlag, h('div', {}, tipName, tipSub));

  sheet.append(head, zoomBox, closeButton, scale, foot, tip);
  root.append(sheet);

  return {
    root, sheet, canvas, ctx, marksCanvas, mctx, unmark, zoomIn, zoomOut, locate, closeButton,
    scaleText, scaleBar, tip, tipFlag, tipName, tipSub, unlabel,
  };
}
