import * as THREE from 'three';
import { latLonOf } from '../sphere.ts';
import { uOf, vOf } from '../map-tiles.ts';
import { DEG, LATE_FRAME_MS, MAX_FPS, RELAYOUT_PX, TILE_BUDGET_MS, TILE_BUSY_MS } from './constants.ts';
import { draw } from './draw-sheet.ts';
import { drawMarks } from './marks.ts';
import { askPads } from './pads.ts';
import type { MapSheet } from './sheet.ts';
import { renderTip } from './tip.ts';
import { warm } from './tiles.ts';
import { busy, screenX, screenY } from './view.ts';

const interval = 1000 / MAX_FPS;
const meLatLon = { lat: 0, lon: 0 };

function onScreen(s: MapSheet, x: number, y: number): boolean {
  return x > -40 && x < s.width + 40 && y > -40 && y < s.height + 40;
}

/** Every frame: follows the player, tops up the paper, and redraws what changed. */
export function updateSheet(s: MapSheet, position: THREE.Vector3, forward: THREE.Vector3): void {
  const { options, marker, mapTiles, unmark, me } = s;
  // Where you are is tracked while the sheet is closed too, so it opens on you.
  latLonOf(position, meLatLon);
  me.lat = meLatLon.lat;
  me.lon = meLatLon.lon;
  me.u = uOf(me.lon);
  me.v = vOf(Math.max(-89.999, Math.min(89.999, me.lat)));
  me.known = true;
  const now = performance.now();
  const gap = s.lastUpdateAt === 0 ? 0 : now - s.lastUpdateAt;
  s.lastUpdateAt = now;
  if (!s.showing) {
    warm(s, now);
    return;
  }

  // The heading as a screen angle, clockwise from up: north and east at
  // this point, from the one conversion in `sphere.ts`, differentiated.
  const lon = me.lon * DEG;
  const lat = me.lat * DEG;
  const east = forward.x * -Math.sin(lon) + forward.z * -Math.cos(lon);
  const north =
    forward.x * -Math.sin(lat) * Math.cos(lon) + forward.y * Math.cos(lat) + forward.z * Math.sin(lat) * Math.sin(lon);
  if (Math.abs(east) + Math.abs(north) > 1e-6) me.heading = Math.atan2(east, north);

  // The pads under a street zoom, a millisecond of working out a frame.
  if (askPads(s)) s.dirty = true;
  // Less painting in a frame that came late or while a hand moves the
  // sheet: the parents stand in, and the drag keeps its pace.
  mapTiles.pump(busy(s) || gap > LATE_FRAME_MS ? TILE_BUSY_MS : TILE_BUDGET_MS);
  // A tile painted since the last draw, by this sheet or by the disc's.
  if (mapTiles.version !== s.drawnVersion) s.dirty = true;
  // The first still frame after a drag or a zoom, with the fine filter.
  if (s.drawnBusy && !busy(s)) s.dirty = true;
  // The marker keeps the names off it, so a new one is a redraw.
  const mark = marker();
  const markKey = mark === null ? '' : `${mark.lat},${mark.lon}`;
  if (markKey !== s.lastMarker) {
    s.lastMarker = markKey;
    unmark.hidden = mark === null;
    s.dirty = true;
  }

  const meX = screenX(s, me.u);
  const meY = screenY(s, me.v);
  // The names keep clear of you; once you have moved far enough from
  // where they were laid out, they are laid out again.
  if ((onScreen(s, meX, meY) || onScreen(s, s.laidMeX, s.laidMeY)) && Math.max(Math.abs(meX - s.laidMeX), Math.abs(meY - s.laidMeY)) > RELAYOUT_PX) {
    s.dirty = true;
  }
  const moving =
    Math.abs(meX - s.lastMeX) > 0.5 || Math.abs(meY - s.lastMeY) > 0.5 || Math.abs(me.heading - s.lastHeading) > 0.02;
  const peersMoving = (options.peers?.().length ?? 0) > 0;
  if ((moving || peersMoving) && now - s.drawnAt >= interval) s.marksDirty = true;
  if (s.dirty) draw(s);
  if (!s.marksDirty) return;
  s.lastMeX = meX;
  s.lastMeY = meY;
  s.lastHeading = me.heading;
  drawMarks(s);
  if (s.hover !== null) renderTip(s);
}
