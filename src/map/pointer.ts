import { SHEET_HEIGHT, latOfV, lonOfU } from '../map-tiles.ts';
import { latLonOf } from '../sphere.ts';
import { courseSitesOf } from './courses.ts';
import { CLICK_SLOP, DOUBLE_MS, SETTLE_MS } from './constants.ts';
import { hide } from './lifecycle.ts';
import type { MapSheet } from './sheet.ts';
import { pickAt, renderTip, sameHit } from './tip.ts';
import type { Hit } from './types.ts';
import { centreOnMe, clampView, zoomAt } from './view.ts';

/** Drag to move, pinch and wheel to zoom, click to mark: the pointer's half of the map. */
export function attachPointer(s: MapSheet): void {
  const { canvas, sheet, fingers, signal } = s;
  const spread = (): number => {
    const [a, b] = [...fingers.values()];
    return a === undefined || b === undefined ? 0 : Math.hypot(a.x - b.x, a.y - b.y);
  };

  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    canvas.setPointerCapture(event.pointerId);
    if (event.pointerType === 'touch') {
      fingers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (fingers.size >= 2) {
        // A second finger makes it a pinch, and the first one's press no click and no drag.
        s.press = null;
        sheet.classList.remove('drag');
        s.pinchSpread = spread();
        return;
      }
    }
    s.press = { id: event.pointerId, x: event.clientX, y: event.clientY, cu: s.cu, cv: s.cv, moved: false };
  }, { signal });

  canvas.addEventListener('pointermove', (event) => {
    const finger = fingers.get(event.pointerId);
    if (finger !== undefined) {
      finger.x = event.clientX;
      finger.y = event.clientY;
      if (fingers.size >= 2) {
        const now = spread();
        if (s.pinchSpread > 0 && now > 0) {
          const [a, b] = [...fingers.values()];
          zoomAt(s, now / s.pinchSpread, (a!.x + b!.x) / 2 - s.canvasX, (a!.y + b!.y) / 2 - s.canvasY);
          s.busyUntil = performance.now() + SETTLE_MS;
        }
        s.pinchSpread = now;
        return;
      }
    }
    if (s.press !== null && event.pointerId === s.press.id) {
      const dx = event.clientX - s.press.x;
      const dy = event.clientY - s.press.y;
      if (!s.press.moved && Math.hypot(dx, dy) > CLICK_SLOP) {
        s.press.moved = true;
        sheet.classList.add('drag');
        s.hover = null;
        renderTip(s);
      }
      if (s.press.moved) {
        // Only the view is written here: the sheet is drawn once, in the
        // next frame's `update`, however many moves the pointer sent.
        s.cu = s.press.cu - dx / s.S;
        s.cv = s.press.cv - dy / s.S;
        clampView(s);
        s.dirty = true;
        s.busyUntil = performance.now() + SETTLE_MS;
        return;
      }
    }
    const next = pickAt(s, event.clientX, event.clientY);
    sheet.classList.toggle('point', next !== null && next.kind !== 'town');
    if (!sameHit(next, s.hover)) {
      s.hover = next;
      s.marksDirty = true;
    }
    renderTip(s);
  }, { signal });

  const release = (event: PointerEvent): void => {
    if (fingers.delete(event.pointerId)) s.pinchSpread = spread();
    if (s.press === null || event.pointerId !== s.press.id) return;
    const wasDrag = s.press.moved;
    s.press = null;
    sheet.classList.remove('drag');
    if (wasDrag || event.type === 'pointercancel') return;
    // The second click of a double: the first is cancelled and the double zooms.
    if (s.pendingClick !== 0) {
      clearTimeout(s.pendingClick);
      s.pendingClick = 0;
      return;
    }
    const hit = pickAt(s, event.clientX, event.clientY);
    const x = event.clientX - s.canvasX;
    const y = event.clientY - s.canvasY;
    s.pendingClick = window.setTimeout(() => {
      s.pendingClick = 0;
      if (s.showing) click(s, hit, x, y);
    }, DOUBLE_MS);
  };


  canvas.addEventListener('pointerup', release, { signal });
  canvas.addEventListener('pointercancel', release, { signal });

  canvas.addEventListener('pointerleave', () => {
    if (s.press !== null) return;
    s.hover = null;
    renderTip(s);
    s.marksDirty = true;
  }, { signal });
}

export function click(s: MapSheet, hit: Hit | null, x: number, y: number): void {
  const { options, monuments, onMark, onUnmark } = s;
  if (hit?.kind === 'peer') {
    if (options.onJoin === undefined) return;
    hide(s, true);
    options.onJoin(hit.id);
    return;
  }
  if (hit?.kind === 'marker') onUnmark();
  else if (hit?.kind === 'pin') {
    const monument = monuments[hit.index]!;
    onMark(monument.lat, monument.lon, monument.name, true);
  } else if (hit?.kind === 'course') {
    const site = courseSitesOf(s)[hit.index];
    if (site !== undefined) {
      // The start, where a run begins, not the town it is named for.
      const at = latLonOf(options.courseStart?.(site.key) ?? site.at);
      onMark(at.lat, at.lon, site.title, false);
    }
  } else if (hit?.kind === 'town') {
    onMark(hit.town.place.lat, hit.town.place.lon, hit.town.place.name, false);
  } else {
    const v = Math.max(0, Math.min(SHEET_HEIGHT, s.cv + (y - s.height / 2) / s.S));
    onMark(latOfV(v), lonOfU(s.cu + (x - s.width / 2) / s.S), null, false);
  }
  s.hover = null;
  renderTip(s);
  s.marksDirty = true;
  s.dirty = true;
}

/** The wheel, the double click and the overlay's buttons. */
export function attachControls(s: MapSheet): void {
  const { onUnmark, canvas, unmark, zoomIn, zoomOut, locate, closeButton, signal } = s;
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    // Lines and pages are a mouse; pixels are a trackpad and come in many small steps.
    const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaMode === 2 ? event.deltaY * 400 : event.deltaY;
    zoomAt(s, Math.exp(-delta * 0.0022), event.clientX - s.canvasX, event.clientY - s.canvasY);
    s.busyUntil = performance.now() + SETTLE_MS;
    s.hover = null;
    renderTip(s);
  }, { signal, passive: false });

  canvas.addEventListener('dblclick', (event) => {
    clearTimeout(s.pendingClick);
    s.pendingClick = 0;
    zoomAt(s, 2, event.clientX - s.canvasX, event.clientY - s.canvasY);
  }, { signal });

  // A click on a button leaves the focus where it was: a focused button on
  // this dialog would hold every key the plane under the map is flown by
  // (`inputBlocked`), and `Tab` with it.
  for (const button of [zoomIn, zoomOut, locate, unmark, closeButton]) button.addEventListener('mousedown', (event) => event.preventDefault(), { signal });
  closeButton.addEventListener('click', () => hide(s), { signal });
  unmark.addEventListener('click', () => {
    onUnmark();
    s.marksDirty = true;
    s.dirty = true;
  }, { signal });
  zoomIn.addEventListener('click', () => zoomAt(s, 2, s.width / 2, s.height / 2), { signal });
  zoomOut.addEventListener('click', () => zoomAt(s, 0.5, s.width / 2, s.height / 2), { signal });
  locate.addEventListener('click', () => centreOnMe(s), { signal });
}
