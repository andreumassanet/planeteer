import { FONT } from '../ui.ts';
import { type LabelSpace, TAU, inkedText, traceRocket } from '../cartography.ts';
import { uOf, vOf } from '../map-tiles.ts';
import {
  DEG, PADS_FROM, PAD_HEIGHT, PIN_HEAD, PIN_RISE, PIN_SPACING, SQUARE_FROM, TOWN_FLOOR,
} from './constants.ts';
import { ink, paper, red } from './palette.ts';
import type { MapSheet } from './sheet.ts';
import type { SheetTown } from './types.ts';
import { screenX, screenY } from './view.ts';

interface Label {
  text: string;
  x: number;
  y: number;
  font: string;
  fill: string;
  halo: string;
  weight: number;
  align: CanvasTextAlign;
}

interface PadMark {
  x: number;
  y: number;
}

interface TownMark {
  town: SheetTown;
  x: number;
  y: number;
  side: number;
}

/**
 * Label widths are cached by font and text: the names are laid out again on
 * every redraw and most are the same names at the same size.
 */
export function textWidth(s: MapSheet, font: string, text: string): number {
  const { ctx, widths } = s;
  const key = `${font}|${text}`;
  let w = widths.get(key);
  if (w === undefined) {
    if (widths.size > 6000) widths.clear();
    ctx.font = font;
    w = ctx.measureText(text).width;
    widths.set(key, w);
  }
  return w;
}

/** Claims the arrow's and the marker's places, so no name is written through them. */
function claimYouAndMarker(s: MapSheet, space: LabelSpace): void {
  let meX = -1e9;
  let meY = -1e9;
  if (s.me.known) {
    meX = screenX(s, s.me.u);
    meY = screenY(s, s.me.v);
    space.claim(meX - 14, meY - 14, 28, 28);
  }
  s.laidMeX = meX;
  s.laidMeY = meY;

  const mark = s.marker();
  if (mark !== null) {
    const x = screenX(s, uOf(mark.lon));
    const y = screenY(s, vOf(mark.lat));
    space.claim(x - PIN_HEAD * 1.3 - 2, y - (PIN_RISE + PIN_HEAD) * 1.3 - 2, PIN_HEAD * 2.6 + 4, (PIN_RISE + PIN_HEAD) * 1.3 + 4);
  }
}

/** Chooses which landmark pins stand and claims their places. */
function keepPins(s: MapSheet, space: LabelSpace): void {
  const { monuments, keptPins } = s;
  keptPins.length = 0;
  for (let index = 0; index < monuments.length; index++) {
    const monument = monuments[index]!;
    const x = screenX(s, uOf(monument.lon));
    const y = screenY(s, vOf(monument.lat));
    if (x < -30 || x > s.width + 30 || y < -30 || y > s.height + 40) continue;
    let crowded = false;
    for (const pin of keptPins) {
      if (Math.abs(pin.x - x) < PIN_SPACING && Math.abs(pin.y - y) < PIN_SPACING) {
        crowded = true;
        break;
      }
    }
    if (crowded) continue;
    keptPins.push({ index, x, y });
    space.claim(x - PIN_HEAD - 2, y - PIN_RISE - PIN_HEAD - 2, PIN_HEAD * 2 + 4, PIN_RISE + PIN_HEAD + 4);
  }
}

/** The rockets' pads in view, claimed with the pins before any name is laid out. */
function claimPads(s: MapSheet, space: LabelSpace): PadMark[] {
  const padMarks: PadMark[] = [];
  if (s.S / 360 >= PADS_FROM) {
    for (const pad of s.padsOnSheet.values()) {
      const x = screenX(s, pad.u);
      const y = screenY(s, pad.v);
      if (x < -20 || x > s.width + 20 || y < -10 || y > s.height + PAD_HEIGHT + 10) continue;
      padMarks.push({ x, y });
      space.claim(x - PAD_HEIGHT * 0.5, y - PAD_HEIGHT - 2, PAD_HEIGHT, PAD_HEIGHT + 4);
    }
  }
  return padMarks;
}

/** Collects the names that fit: a label is kept only where the space is free. */
function createLabeller(s: MapSheet, space: LabelSpace): {
  labels: Label[];
  tryLabel(text: string, x: number, y: number, font: string, size: number, fill: string, halo: string, align: CanvasTextAlign, spacing?: number): boolean;
} {
  const labels: Label[] = [];
  const tryLabel = (
    text: string,
    x: number,
    y: number,
    font: string,
    size: number,
    fill: string,
    halo: string,
    align: CanvasTextAlign,
    spacing = 0,
  ): boolean => {
    const w = textWidth(s, font, text) + spacing * text.length;
    const left = align === 'center' ? x - w / 2 : align === 'left' ? x : x - w;
    if (left < 4 || left + w > s.width - 4 || y - size < 4 || y + 4 > s.height) return false;
    if (!space.fits(left - 3, y - size * 0.62 - 3, w + 6, size * 1.24 + 6)) return false;
    space.claim(left - 3, y - size * 0.62 - 3, w + 6, size * 1.24 + 6);
    labels.push({ text, x, y, font, fill, halo, weight: 4, align });
    return true;
  };
  return { labels, tryLabel };
}

type TryLabel = ReturnType<typeof createLabeller>['tryLabel'];

function nameLandmarks(s: MapSheet, tryLabel: TryLabel): void {
  if (s.S / 360 < 5) return;
  const pinFont = `800 12.5px ${FONT}`;
  for (const pin of s.keptPins) {
    const monument = s.monuments[pin.index]!;
    tryLabel(monument.name, pin.x + PIN_HEAD + 5, pin.y - PIN_RISE, pinFont, 12.5, ink, paper, 'left');
  }
}

/** Country names, while a country is on the sheet at a size a name fits in. */
function nameCountries(s: MapSheet, tryLabel: TryLabel): void {
  if (s.S / 360 >= 60) return;
  for (const label of s.countryLabels) {
    const px = label.span * s.S;
    if (px < 70 || px > s.width * 2.2) continue;
    const size = Math.round(Math.min(17, Math.max(10.5, 9 + px / 60)));
    const x = screenX(s, label.u);
    const y = screenY(s, label.v);
    if (x < 0 || x > s.width || y < 0 || y > s.height) continue;
    tryLabel(label.text, x, y, `800 ${size}px ${FONT}`, size, 'rgba(30, 6, 3, 0.62)', 'rgba(255, 242, 232, 0.55)', 'center', 1.6);
  }
}

/** The towns, by rank, as many as there is room for above the zoom's floor. */
function nameTowns(s: MapSheet, space: LabelSpace, tryLabel: TryLabel): TownMark[] {
  const pxPerDegree = s.S / 360;
  let floor = 0;
  // Another world has two dozen towns, none of them a megacity: every one is
  // named whenever there is room.
  for (const [upTo, pop] of s.surface === undefined ? TOWN_FLOOR : []) {
    if (pxPerDegree < upTo) {
      floor = pop;
      break;
    }
  }
  const unitsPerPx = (360 / s.S) * s.UNITS_PER_DEG;
  const townMarks: TownMark[] = [];
  let named = 0;
  for (const town of s.towns) {
    const capitalNamed = town.place.capital === true && pxPerDegree >= TOWN_FLOOR[0]![0];
    if (town.place.pop < floor && !capitalNamed) {
      // Below the floor it is not named, but at a street zoom it is still
      // drawn: a square on the sheet where a town stands.
      if (pxPerDegree < 70) continue;
    }
    const x = screenX(s, town.u);
    const y = screenY(s, town.v);
    if (x < -60 || x > s.width + 60 || y < -60 || y > s.height + 60) continue;
    const cosLat = Math.max(0.05, Math.cos(town.place.lat * DEG));
    const side = (town.radius * Math.SQRT2) / (unitsPerPx * cosLat) * 1;
    const canName = town.place.pop >= floor || capitalNamed;
    let labelled = false;
    if (canName && named < 260) {
      const big = town.place.capital === true || town.place.pop >= 1_000_000;
      const size = big ? 13.5 : 12;
      const font = `${big ? 800 : 700} ${size}px ${FONT}`;
      const offset = Math.max(side / 2, 4) + 5;
      labelled = tryLabel(town.place.name, x + offset, y + 4, font, size, ink, paper, 'left');
      if (!labelled && side > 40) labelled = tryLabel(town.place.name, x, y + 4, font, size, ink, paper, 'center');
      if (labelled) named++;
    }
    if (labelled || (side >= SQUARE_FROM && pxPerDegree >= 70)) {
      townMarks.push({ town, x, y, side });
      if (side < SQUARE_FROM) space.claim(x - 5, y - 5, 10, 10);
    }
  }
  return townMarks;
}

/** Paints the town dots, the pads, the labels, back to front, and records what can be pointed at. */
function paintLayout(s: MapSheet, townMarks: TownMark[], padMarks: PadMark[], labels: Label[]): void {
  const { ctx, mapTiles, hits, keptPins } = s;
  ctx.save();
  ctx.lineJoin = 'round';
  for (const mark of townMarks) {
    const { x, y, side, town } = mark;
    // A square the paper draws (every building in it at a street zoom) is
    // left to the paper; only a town too small for it is a dot.
    if (side >= SQUARE_FROM && s.level >= mapTiles.painter.fromLevel) {
      // Drawn by the tiles.
    } else if (side < SQUARE_FROM) {
      const capital = town.place.capital === true;
      ctx.beginPath();
      ctx.arc(x, y, capital ? 4.5 : 3.4, 0, TAU);
      ctx.fillStyle = paper;
      ctx.fill();
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = ink;
      ctx.stroke();
      if (capital) {
        ctx.beginPath();
        ctx.arc(x, y, 1.8, 0, TAU);
        ctx.fillStyle = ink;
        ctx.fill();
      }
    }
    hits.push({ kind: 'town', town, x, y });
  }

  ctx.lineWidth = 1.8;
  for (const pad of padMarks) traceRocket(ctx, pad.x, pad.y, PAD_HEIGHT, paper, red, ink);

  for (const label of labels) {
    ctx.font = label.font;
    ctx.textAlign = label.align;
    ctx.textBaseline = 'middle';
    if ('letterSpacing' in ctx && label.fill.startsWith('rgba')) (ctx as { letterSpacing: string }).letterSpacing = '1.6px';
    inkedText(ctx, label.text, label.x, label.y, label.halo, label.fill, label.weight);
    if ('letterSpacing' in ctx) (ctx as { letterSpacing: string }).letterSpacing = '0px';
  }

  // The pins are drawn over the sheet with the marks; what is pointed at is
  // known here, where they were laid out.
  for (const pin of keptPins) hits.push({ kind: 'pin', index: pin.index, x: pin.x, y: pin.y - PIN_RISE });
  ctx.restore();
}

/** Lays out the pins, the pads and the names, most important first, and paints them. */
export function layoutAndDraw(s: MapSheet, space: LabelSpace): void {
  s.hits.length = 0;
  // You first: nothing is allowed to sit on the arrow.
  claimYouAndMarker(s, space);
  keepPins(s, space);
  const padMarks = claimPads(s, space);
  const { labels, tryLabel } = createLabeller(s, space);
  nameLandmarks(s, tryLabel);
  nameCountries(s, tryLabel);
  const townMarks = nameTowns(s, space, tryLabel);
  paintLayout(s, townMarks, padMarks, labels);
}
