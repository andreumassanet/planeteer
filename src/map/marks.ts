import * as THREE from 'three';
import { R2D, TAU, inkedText } from '../cartography.ts';
import { PALETTE } from '../theme.ts';
import { FONT, hex } from '../ui.ts';
import { latLonOf, unitAt } from '../sphere.ts';
import { uOf, vOf } from '../map-tiles.ts';
import { PIN_HEAD, PIN_RISE } from './constants.ts';
import { drawCourseBadges, drawShownCourse } from './courses.ts';
import { ink, paper, pink, violet } from './palette.ts';
import type { MapSheet } from './sheet.ts';
import type { MapMarker } from './types.ts';
import { screenX, screenY } from './view.ts';

const routeA = new THREE.Vector3();
const routeB = new THREE.Vector3();
const routeP = new THREE.Vector3();
const routeLatLon = { lat: 0, lon: 0 };

export function drawPin(s: MapSheet, x: number, y: number, fill: string, grow: number): void {
  tracePinMark(s.mctx, x, y, fill, grow);
}

/** A pin standing on (x, y): the sheet's landmarks and marker, and the legend's. */
export function tracePinMark(mctx: CanvasRenderingContext2D, x: number, y: number, fill: string, grow: number): void {
  const rise = PIN_RISE * grow;
  const head = PIN_HEAD * grow;
  mctx.beginPath();
  mctx.moveTo(x, y);
  mctx.lineTo(x - head * 0.72, y - rise + head * 0.35);
  mctx.arc(x, y - rise, head, Math.PI * 0.78, Math.PI * 0.22, false);
  mctx.closePath();
  mctx.fillStyle = fill;
  mctx.fill();
  mctx.lineWidth = 2;
  mctx.strokeStyle = ink;
  mctx.stroke();
  mctx.beginPath();
  mctx.arc(x, y - rise, head * 0.36, 0, TAU);
  mctx.fillStyle = ink;
  mctx.fill();
}

/** The route to the marker: the great circle, dashed. */
export function drawRoute(s: MapSheet, to: MapMarker): void {
  const { mctx, me } = s;
  unitAt(me.lat, me.lon, routeA);
  unitAt(to.lat, to.lon, routeB);
  const angle = routeA.angleTo(routeB);
  if (angle < 1e-5) return;
  const steps = Math.max(8, Math.ceil(angle * R2D));
  const sinA = Math.sin(angle);
  mctx.beginPath();
  let lastU = 0;
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    const a = Math.sin((1 - t) * angle) / sinA;
    const b = Math.sin(t * angle) / sinA;
    routeP.set(routeA.x * a + routeB.x * b, routeA.y * a + routeB.y * b, routeA.z * a + routeB.z * b);
    latLonOf(routeP, routeLatLon);
    let u = uOf(routeLatLon.lon);
    if (k === 0) u = s.cu + (screenX(s, u) - s.width / 2) / s.S;
    else u -= Math.round(u - lastU);
    lastU = u;
    const x = s.width / 2 + (u - s.cu) * s.S;
    const y = screenY(s, vOf(routeLatLon.lat));
    if (k === 0) mctx.moveTo(x, y);
    else mctx.lineTo(x, y);
  }
  mctx.lineCap = 'round';
  mctx.setLineDash([]);
  mctx.strokeStyle = ink;
  mctx.lineWidth = 5;
  mctx.stroke();
  mctx.setLineDash([7, 7]);
  mctx.strokeStyle = violet;
  mctx.lineWidth = 3;
  mctx.stroke();
  mctx.setLineDash([]);
}

export function drawPeers(s: MapSheet): void {
  const { options, RADIUS_KM, mctx, peerHits, me } = s;
  const list = options.peers?.() ?? [];
  const peerLatLon = { lat: 0, lon: 0 };
  mctx.font = `800 12px ${FONT}`;
  mctx.textAlign = 'center';
  mctx.textBaseline = 'middle';
  for (const peer of list) {
    latLonOf(peer, peerLatLon);
    const x = screenX(s, uOf(peerLatLon.lon));
    const y = screenY(s, vOf(peerLatLon.lat));
    if (x < -20 || x > s.width + 20 || y < -20 || y > s.height + 20) continue;
    const grow = s.hover?.kind === 'peer' && s.hover.id === peer.id ? 1.35 : 1;
    mctx.beginPath();
    mctx.arc(x, y, 6 * grow, 0, TAU);
    mctx.fillStyle = pink;
    mctx.fill();
    mctx.lineWidth = 2;
    mctx.strokeStyle = ink;
    mctx.stroke();
    inkedText(mctx, peer.name, x, y - 15, paper, ink, 4);
    unitAt(me.lat, me.lon, routeA);
    const distance = routeA.angleTo(routeB.set(peer.x, peer.y, peer.z).normalize()) * RADIUS_KM;
    peerHits.push({ kind: 'peer', id: peer.id, name: peer.name, x, y, distance });
  }
}

export function drawMe(s: MapSheet, x: number, y: number): void {
  traceYou(s.mctx, x, y, s.me.heading, 1);
}

/** You: a crimson arrow on a pale halo, turned to `heading` clockwise from up. */
export function traceYou(mctx: CanvasRenderingContext2D, x: number, y: number, heading: number, scale: number): void {
  mctx.save();
  mctx.translate(x, y);
  mctx.scale(scale, scale);
  mctx.beginPath();
  mctx.arc(0, 0, 13, 0, TAU);
  mctx.fillStyle = 'rgba(255, 242, 232, 0.35)';
  mctx.fill();
  mctx.rotate(heading);
  mctx.beginPath();
  mctx.moveTo(0, -11);
  mctx.lineTo(8, 8);
  mctx.lineTo(0, 4);
  mctx.lineTo(-8, 8);
  mctx.closePath();
  mctx.fillStyle = hex(PALETTE.crimson);
  mctx.fill();
  mctx.lineJoin = 'round';
  mctx.lineWidth = 2.5;
  mctx.strokeStyle = ink;
  mctx.stroke();
  mctx.restore();
}

/** What stands over the sheet: the route, the course badges, the pins, a shown course, the players and you. */
export function drawMarks(s: MapSheet): void {
  const { marker, mctx, peerHits, keptPins, me } = s;
  const started = performance.now();
  mctx.setTransform(s.ratio, 0, 0, s.ratio, 0, 0);
  mctx.clearRect(0, 0, s.width, s.height);
  mctx.lineJoin = 'round';
  const mark = marker();
  // The route to the marker: the great circle, dashed.
  if (mark !== null && me.known) drawRoute(s, mark);
  drawCourseBadges(s);
  for (const pin of keptPins) {
    const grow = s.hover?.kind === 'pin' && s.hover.index === pin.index ? 1.3 : 1;
    drawPin(s, pin.x, pin.y, paper, grow);
  }
  peerHits.length = 0;
  const course = s.options.courseRing?.() ?? null;
  s.lastCourseRing = course?.next ?? null;
  if (course !== null) drawShownCourse(s, course);
  if (mark !== null) {
    const x = screenX(s, uOf(mark.lon));
    const y = screenY(s, vOf(mark.lat));
    const grow = s.hover?.kind === 'marker' ? 1.5 : 1.3;
    drawPin(s, x, y, violet, grow);
    if (mark.name !== null) {
      mctx.font = `800 12.5px ${FONT}`;
      mctx.textAlign = 'left';
      mctx.textBaseline = 'middle';
      inkedText(mctx, mark.name, x + PIN_HEAD * grow + 5, y - PIN_RISE * grow, paper, ink, 4);
    }
    peerHits.push({ kind: 'marker', x, y: y - PIN_RISE * 1.3 });
  }
  drawPeers(s);
  if (me.known) drawMe(s, screenX(s, me.u), screenY(s, me.v));
  s.marksMs = performance.now() - started;
  s.marksDirty = false;
  s.drawnAt = started;
}
