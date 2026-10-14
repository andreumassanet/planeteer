import { EARTH_KM, LabelSpace, TAU } from '../cartography.ts';
import { PALETTE } from '../theme.ts';
import { hex, km } from '../ui.ts';
import { SHEET_HEIGHT, latOfV, uOf, vOf } from '../map-tiles.ts';
import { traceOutlines } from '../map-outline.ts';
import { DEG, LANES_FROM, PLANET_ZOOM, ROADS_FROM } from './constants.ts';
import { prepareRings, prepareRoads, traceRoad } from './data.ts';
import { layoutAndDraw } from './layout.ts';
import { ink, oceanHex } from './palette.ts';
import type { MapSheet } from './sheet.ts';
import { drawTiles } from './tiles.ts';
import { screenX, screenY } from './view.ts';

export function drawGraticule(s: MapSheet): void {
  const { ctx } = s;
  const pxPerDegree = s.S / 360;
  if (pxPerDegree > 40) return;
  const step = pxPerDegree < 6 ? 30 : pxPerDegree < 16 ? 15 : 5;
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 242, 232, 0.14)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let lon = -180; lon < 180; lon += step) {
    const x = screenX(s, uOf(lon));
    if (x < 0 || x > s.width) continue;
    ctx.moveTo(x, Math.max(0, screenY(s, 0)));
    ctx.lineTo(x, Math.min(s.height, screenY(s, SHEET_HEIGHT)));
  }
  for (let lat = -90 + step; lat < 90; lat += step) {
    const y = screenY(s, vOf(lat));
    if (y < 0 || y > s.height) continue;
    ctx.moveTo(0, y);
    ctx.lineTo(s.width, y);
  }
  ctx.stroke();
  ctx.restore();
}

export function drawOutlines(s: MapSheet): void {
  const { ctx } = s;
  const sheetRings = prepareRings(s);
  const coast = new Path2D();
  const frontier = new Path2D();
  // Thinned to the zoom (`map-outline.ts`), and at the planet's own zoom by
  // a little more than a pixel: the whole world across one screen is tens of
  // thousands of segments of coast, and a line a pixel wide shows nothing
  // of the ones a pixel and a half apart.
  traceOutlines(sheetRings, { cu: s.cu, cv: s.cv, S: s.S, width: s.width, height: s.height }, coast, frontier, s.S < PLANET_ZOOM ? 1.5 : 0.8);
  const pxPerDegree = s.S / 360;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(30, 6, 3, 0.42)';
  ctx.lineWidth = pxPerDegree < 8 ? 0.8 : 1.3;
  ctx.setLineDash(pxPerDegree < 8 ? [] : [5, 4]);
  ctx.stroke(frontier);
  ctx.setLineDash([]);
  ctx.strokeStyle = ink;
  ctx.lineWidth = pxPerDegree < 4 ? 1 : pxPerDegree < 30 ? 1.5 : 2.2;
  ctx.stroke(coast);
  ctx.restore();
}

export function drawRoads(s: MapSheet): void {
  const { options, RADIUS_KM, mapTiles, ctx } = s;
  // From the paper's own zoom the tiles carry them, at their width.
  if (s.level >= mapTiles.painter.fromLevel) return;
  // The thresholds are Earth's degrees; on a smaller body a degree is
  // fewer kilometres, so its roads come up at the same scale in kilometres.
  const pxPerDegree = ((s.S / 360) * EARTH_KM) / RADIUS_KM;
  // Another world's roads are a handful of lines and are drawn at every zoom.
  const from = options.courses !== undefined ? 0 : ROADS_FROM;
  if (pxPerDegree < from || (options.roads === undefined && options.courses === undefined)) return;
  const all = prepareRoads(s);
  const uLeft = s.cu - s.width / 2 / s.S;
  const uRight = s.cu + s.width / 2 / s.S;
  const vTop = s.cv - s.height / 2 / s.S;
  const vBottom = s.cv + s.height / 2 / s.S;
  const lanes = pxPerDegree >= LANES_FROM;
  const widthOf = [lanes ? 1.6 : 0, 2.4, 3.4];
  // Roads widen with the zoom from this scale, so a far sheet keeps them hairlines.
  const gainFrom = options.courses !== undefined ? ROADS_FROM / 4 : ROADS_FROM;
  const zoomGain = Math.min(1.8, Math.max(1, Math.log2(pxPerDegree / gainFrom) * 0.35 + 1));
  const paths = [new Path2D(), new Path2D(), new Path2D()];
  for (const road of all) {
    if (widthOf[road.cls] === 0) continue;
    if (road.v1 < vTop || road.v0 > vBottom) continue;
    let wrap = 0;
    if (road.u1 < uLeft) wrap = 1;
    else if (road.u0 > uRight) wrap = -1;
    if (road.u1 + wrap < uLeft || road.u0 + wrap > uRight) continue;
    if (road.u === null) traceRoad(s, road);
    const path = paths[road.cls] ?? paths[0]!;
    const originX = s.width / 2 + (wrap - s.cu) * s.S;
    const originY = s.height / 2 - s.cv * s.S;
    for (let k = 0; k < road.u!.length; k++) {
      const x = originX + road.u![k]! * s.S;
      const y = originY + road.v![k]! * s.S;
      if (k === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    }
  }
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // Casing first under all three classes, so a junction is one piece of
  // road rather than three lines crossing.
  ctx.strokeStyle = 'rgba(30, 6, 3, 0.55)';
  for (let c = 0; c < 3; c++) {
    if (widthOf[c] === 0) continue;
    ctx.lineWidth = widthOf[c]! * zoomGain + 2;
    ctx.stroke(paths[c]!);
  }
  const fills = [hex(PALETTE.cream), hex(PALETTE.white), hex(PALETTE.apricot)];
  for (let c = 0; c < 3; c++) {
    if (widthOf[c] === 0) continue;
    ctx.strokeStyle = fills[c]!;
    ctx.lineWidth = widthOf[c]! * zoomGain;
    ctx.stroke(paths[c]!);
  }
  ctx.restore();
}

export function drawScale(s: MapSheet): void {
  const { RADIUS_KM, scaleText, scaleBar } = s;
  const lat = latOfV(s.cv);
  const kmPerPx = ((TAU * RADIUS_KM) / s.S) * Math.max(0.05, Math.cos(lat * DEG));
  const raw = kmPerPx * 110;
  const power = 10 ** Math.floor(Math.log10(raw));
  const nice = [1, 2, 5, 10].map((m) => m * power).filter((value) => value <= raw).pop() ?? power;
  scaleText.textContent = nice >= 1 ? km(nice) : `${Math.round(nice * 1000)} m`;
  scaleBar.style.width = `${Math.round(nice / kmPerPx)}px`;
}

/** The sheet: the tiles, the lines, the towns and the names. */
export function draw(s: MapSheet): void {
  const { ctx } = s;
  const started = performance.now();
  ctx.setTransform(s.ratio, 0, 0, s.ratio, 0, 0);
  ctx.fillStyle = oceanHex;
  ctx.fillRect(0, 0, s.width, s.height);
  drawTiles(s);
  drawGraticule(s);
  drawOutlines(s);
  drawRoads(s);
  layoutAndDraw(s, new LabelSpace());
  drawScale(s);
  s.drawMs = performance.now() - started;
  s.dirty = false;
  s.marksDirty = true;
}
