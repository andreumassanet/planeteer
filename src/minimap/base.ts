import { LabelSpace, TAU, inkedText, traceRocket, tracePin } from '../cartography.ts';
import { FONT } from '../ui.ts';
import { MAX_LABELS, PAD_HEIGHT, RIM_WIDTH, SHAPE_BANDS, TOWNS_TILED } from './constants.ts';
import { drawMarkerPin, scaleBar } from './marks.ts';
import { drawRoads } from './roads.ts';
import { layOutPads, layOutPins, layOutTowns } from './layout.ts';
import { cream, gold, ink, red } from './palette.ts';
import { traceRing } from './ring.ts';
import type { MinimapState } from './state.ts';
import { drawTiles } from './tiles.ts';

/** The outlines, the paper's tiles under them and the roads; true when the tiles carried the land. */
function paintLand(m: MinimapState): boolean {
  const { settings, RADIUS, baseCtx, faintInk, borderWidth, levels, ux, uy, uz, view } = m;

  // One pass and a style per ring, rather than a faded pass with a bright one
  // over it: the shapes are painted biggest-first so that an enclave lands on
  // top of the country that swallows it, and repainting the country you are
  // in would put South Africa back over Lesotho.
  m.drawnRings = 0;
  m.drawnPoints = 0;
  // The coarsest set that is still finer than half a pixel here.
  let band = 0;
  while (band + 1 < SHAPE_BANDS.length && view * RADIUS >= SHAPE_BANDS[band + 1]!) band++;
  const level = levels[band]!;
  m.drawnLevel = band;
  // The paper's tiles first, where there is a paper; the rings are then
  // the coast's and the frontiers' ink alone over them.
  const tiled = settings.tiles !== undefined && drawTiles(m);
  for (let s = 0; s < level.shapes.length; s++) {
    const shape = level.shapes[s]!;
    // The ring's own bounding cap against the disc's. One dot product and one
    // cosine per ring, and it is what pays for holding the outlines at full
    // resolution: at 300 units it admits two to six rings out of 2,849.
    const span = shape.radius + view;
    if (span < Math.PI && shape.cx * ux + shape.cy * uy + shape.cz * uz < Math.cos(span)) continue;
    const mine = shape.country === m.country;
    baseCtx.fillStyle = mine ? shape.fill : level.faded[s]!;
    baseCtx.strokeStyle = mine ? ink : faintInk;
    baseCtx.lineWidth = borderWidth * (mine ? 1.8 : 1);
    traceRing(m, shape, !tiled);
    m.drawnRings++;
    m.drawnPoints += shape.points.length / 3;
  }

  // The roads as the disc's own lines only where the paper does not carry them.
  if (!tiled || m.tileLevel < settings.tiles!.painter.fromLevel) drawRoads(m);
  return tiled;
}

/** Claims the places no name may be written on: the arrow, the scale bar, north and every mark. */
function claimSpace(m: MinimapState, towns: number, pins: number, pads: number): LabelSpace {
  const { centre, discRadius, uiScale, keptX, keptY, padKeptX, padKeptY, townKeptX, townKeptY, pinRise, pinHead } = m;

  // The names come last but their space is claimed first, and getting that
  // order wrong is visible rather than theoretical: the marks are painted over
  // the haloes, so a name allowed to start under a neighbour's pin is a name
  // with a hole bitten out of it. `map.ts` learned this as "ffel Tower".
  const space = new LabelSpace();
  // The arrow's own extent and not a pixel more: the town you are standing in
  // is under it, and its name has to be able to sit beside it.
  space.claim(centre - 7 * uiScale, centre - 11 * uiScale, 14 * uiScale, 19 * uiScale);
  // The two marks the disc puts on itself rather than on the world. They are
  // drawn after everything else, so if they are not claimed here they are
  // drawn *through* a name instead of around it.
  const bar = scaleBar(m);
  space.claim(bar.x0 - 4, bar.y - 16 * uiScale, bar.x1 - bar.x0 + 8, 22 * uiScale);
  {
    const northAt = discRadius - RIM_WIDTH - 5 * uiScale;
    space.claim(centre + Math.sin(m.northAngle) * northAt - 7 * uiScale, centre - Math.cos(m.northAngle) * northAt - 7 * uiScale, 14 * uiScale, 14 * uiScale);
  }
  for (let n = 0; n < pins; n++) {
    space.claim(
      keptX[n]! - pinHead - 2,
      keptY[n]! - pinRise - pinHead - 2,
      pinHead * 2 + 4,
      pinRise + pinHead + 4,
    );
  }
  for (let n = 0; n < towns; n++) {
    space.claim(townKeptX[n]! - 4 * uiScale, townKeptY[n]! - 4 * uiScale, 8 * uiScale, 8 * uiScale);
  }
  const padHeight = PAD_HEIGHT * uiScale;
  for (let n = 0; n < pads; n++) {
    space.claim(padKeptX[n]! - padHeight * 0.5, padKeptY[n]! - padHeight - 1, padHeight, padHeight + 2);
  }

  return space;
}

/** Writes the names that fit; returns the slot of the town the chip is naming, or -1. */
function writeNames(m: MinimapState, space: LabelSpace, towns: number, pins: number): number {
  const { monuments, gazetteer, baseCtx, centre, discRadius, uiScale, keptX, keptY, keptPin, townRow, townSlot, townKept, townKeptX, townKeptY, pinRise, pinHead } = m;
  let labels = 0;
  baseCtx.textAlign = 'left';
  baseCtx.textBaseline = 'middle';
  // A name goes above its mark, then below it, then to either side. The town
  // you stand in has your arrow on top of it, so its first try is often taken.
  // `clear` is how far the label stays off (x, y): the half-height of the
  // mark's own claimed box. A label overlapping its own mark fails `fits`
  // against that box and would be dropped.
  const write = (text: string, x: number, y: number, clear: number): void => {
    if (labels >= MAX_LABELS) return;
    const width = baseCtx.measureText(text).width;
    const height = 11 * uiScale;
    const mid = x - width / 2;
    const places: [number, number][] = [
      [mid, y - clear - height],
      [mid, y + clear],
      [x + clear + 2, y - height / 2],
      [x - clear - 2 - width, y - height / 2],
    ];
    for (const [left, top] of places) {
      if (Math.hypot(left - centre, top - centre) > discRadius - 3) continue;
      if (Math.hypot(left + width - centre, top + height - centre) > discRadius - 3) continue;
      if (!space.fits(left, top, width, height)) continue;
      space.claim(left, top, width, height);
      inkedText(baseCtx, text, left, top + height / 2, cream, ink, 3);
      labels++;
      return;
    }
  };

  // The town the chip is naming goes first and the landmarks go next: those
  // are the two questions the disc exists to answer, and everything after
  // them is whatever there is room for.
  const chipTown = m.nearby === null ? -1 : townSlot.get(m.nearby.index) ?? -1;
  // Half the dot's claimed box plus a pixel, and the whole of the pin's plus
  // three: the claims are a few lines up and these clear them.
  const dotClear = 5 * uiScale;
  const pinClear = pinRise + pinHead + 3 * uiScale;
  baseCtx.font = `800 ${(9.5 * uiScale).toFixed(1)}px ${FONT}`;
  // Written here, so the loop below starts after it: `write` tries every
  // side of a dot, and a name whose first side is taken by itself finds
  // another and is drawn twice.
  const chipFirst = towns > 0 && chipTown >= 0 && townKept[0] === chipTown ? 1 : 0;
  if (chipFirst === 1) {
    write(gazetteer[townRow[chipTown]!]!.name, townKeptX[0]!, townKeptY[0]!, dotClear);
  }
  baseCtx.font = `800 ${(9 * uiScale).toFixed(1)}px ${FONT}`;
  for (let n = 0; n < pins; n++) {
    write(monuments[keptPin[n]!]!.name, keptX[n]!, keptY[n]!, pinClear);
  }
  baseCtx.font = `800 ${(9.5 * uiScale).toFixed(1)}px ${FONT}`;
  for (let n = chipFirst; n < towns; n++) {
    write(gazetteer[townRow[townKept[n]!]!]!.name, townKeptX[n]!, townKeptY[n]!, dotClear);
  }
  return chipTown;
}

/** The towns, then the pads, then the landmarks on top, then the marker. */
function paintMarks(m: MinimapState, tiled: boolean, towns: number, pins: number, pads: number, chipTown: number): void {
  const { baseCtx, uiScale, keptX, keptY, padKeptX, padKeptY, townDot, townKept, townKeptX, townKeptY, pinRise, pinHead } = m;
  const padHeight = PAD_HEIGHT * uiScale;
  // The towns, then the landmarks on top of them: a landmark is the rarer
  // mark and the one you are being pointed at.
  baseCtx.lineWidth = Math.max(1, 1.3 * uiScale);
  baseCtx.strokeStyle = ink;
  // A town the paper draws as it stands keeps its name and loses its dot.
  const dotted = !tiled || m.tileLevel < TOWNS_TILED;
  for (let n = towns - 1; n >= 0 && dotted; n--) {
    const k = townKept[n]!;
    baseCtx.beginPath();
    baseCtx.arc(townKeptX[n]!, townKeptY[n]!, townDot[k]! * uiScale, 0, TAU);
    baseCtx.fillStyle = k === chipTown ? gold : cream;
    baseCtx.fill();
    baseCtx.stroke();
  }
  // The pads over the towns and under the landmarks: a rocket stands
  // outside a town, beside its strip, and a landmark is still the mark
  // the disc points at.
  baseCtx.lineWidth = Math.max(1, 1.2 * uiScale);
  baseCtx.lineJoin = 'round';
  for (let n = 0; n < pads; n++) traceRocket(baseCtx, padKeptX[n]!, padKeptY[n]!, padHeight, cream, red, ink);
  baseCtx.lineWidth = Math.max(1, 1.4 * uiScale);
  baseCtx.strokeStyle = ink;
  // Backwards, so the nearest one is painted last; one style for every
  // landmark, and the marker over all of them.
  for (let n = pins - 1; n >= 0; n--) tracePin(baseCtx, keptX[n]!, keptY[n]!, pinRise, pinHead, cream);
  drawMarkerPin(m);
}

/** The land, the towns, the pins, the names, the rim and its mark. */
export function drawBase(m: MinimapState): void {
  const { size, surface, canvas, base, baseCtx, centre, discRadius, dryBody, paperColour, paperAt, ux, uy, uz, fx, fy, fz, rx, ry, rz, scale } = m;
  const began = performance.now();
  if (base.width !== canvas.width || base.height !== canvas.height) {
    base.width = canvas.width;
    base.height = canvas.height;
  }
  baseCtx.setTransform(m.ratio, 0, 0, m.ratio, 0, 0);
  baseCtx.clearRect(0, 0, size, size);

  if (dryBody && surface !== undefined && ux * ux + uy * uy + uz * uz > 0) {
    m.paper = `#${surface.colorAt(paperAt.set(ux, uy, uz).normalize(), paperColour).getHexString()}`;
  }
  baseCtx.beginPath();
  baseCtx.arc(centre, centre, discRadius, 0, TAU);
  baseCtx.fillStyle = m.paper;
  baseCtx.fill();

  baseCtx.save();
  baseCtx.clip();
  baseCtx.lineJoin = 'round';
  const tiled = paintLand(m);

  const towns = layOutTowns(m);
  const pins = layOutPins(m);
  const pads = layOutPads(m);
  m.drawnPlaces = towns;
  m.drawnPins = pins;
  m.drawnPads = pads;
  const space = claimSpace(m, towns, pins, pads);
  const chipTown = writeNames(m, space, towns, pins);
  paintMarks(m, tiled, towns, pins, pads, chipTown);
  baseCtx.restore();


  // Where the paper stood when it was drawn, which is what `draw` moves it
  // from until the next one.
  m.baseUx = ux;
  m.baseUy = uy;
  m.baseUz = uz;
  m.baseFx = fx;
  m.baseFy = fy;
  m.baseFz = fz;
  m.baseRx = rx;
  m.baseRy = ry;
  m.baseRz = rz;
  m.baseScale = scale;
  m.baseMs = performance.now() - began;
}
