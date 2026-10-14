/** Pointer, wheel and keyboard on the overlay, and the window's size. */
import * as THREE from 'three';
import { modalOpen } from '../controls.ts';
import { onSphere } from '../globe.ts';
import { chooseBody } from './bodies.ts';
import { refreshChrome } from './chrome.ts';
import { DEG, MAX_LAT, MIN_ALTITUDE, WHEEL_LINE, WHEEL_MAX, WHEEL_ZOOM } from './constants.ts';
import type { MenuCtx } from './context.ts';
import { bodyById, orbitDistance, pixelsPerUnit } from './flight.ts';
import { bodyAt, pointAt } from './picking.ts';
import { isEnter } from './poses.ts';
import { chooseRegion, followCentre, goBack, start, touch } from './stages.ts';

/**
 * Whether the keyboard is on nothing in particular (the page, the canvas or
 * the overlay) rather than a control. Enter belongs to the focused control.
 */
function focusIsFree(ctx: MenuCtx): boolean {
  const active = document.activeElement;
  return active === null || active === document.body || active === document.documentElement
    || active === ctx.root || active === ctx.renderer.domElement;
}

export const inChrome = (target: EventTarget | null): boolean =>
  (target as HTMLElement | null)?.closest('button, input, .ui-card, a') != null;

export function bindInput(ctx: MenuCtx): void {
  const { continueButton, focusWant, orrery, reticle, root, rowOf, searchInput, signal, sysWant, view, want } = ctx;
  let lastX = 0;
  let lastY = 0;

  root.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || ctx.chosen !== null) return;
    if (inChrome(event.target)) return;
    touch(ctx);
    ctx.dragging = true;
    ctx.dragged = 0;
    lastX = event.clientX;
    lastY = event.clientY;
    root.classList.add('dragging');
    try {
      root.setPointerCapture(event.pointerId);
    } catch {
      /* a synthetic pointer has no capture to take */
    }
  }, { signal });

  root.addEventListener('pointermove', (event) => {
    ctx.pointer = { x: event.clientX, y: event.clientY };
    if (!ctx.dragging) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    ctx.dragged += Math.abs(dx) + Math.abs(dy);
    touch(ctx);
    if (ctx.flight !== null) return;
    if (ctx.stage === 'system') {
      sysWant.azimuth -= dx * 0.0055;
      sysWant.elevation = Math.max(5 * DEG, Math.min(84 * DEG, sysWant.elevation + dy * 0.0045));
    } else if (ctx.stage === 'planet') {
      focusWant.azimuth -= dx * 0.0065;
      focusWant.elevation = Math.max(-70 * DEG, Math.min(70 * DEG, focusWant.elevation + dy * 0.0055));
    } else {
      // 1:1 with the ground under the middle of the frame: dragging right moves the
      // ground east, so the camera goes west. `verify()` checks both signs.
      const perDegree = pixelsPerUnit(ctx, Math.max(1, view.dist - ctx.body.radius)) * ctx.body.radius * DEG;
      want.lon -= dx / perDegree;
      want.lat = Math.max(-MAX_LAT, Math.min(MAX_LAT, want.lat + dy / perDegree));
    }
  }, { signal });

  const endDrag = (event: PointerEvent): void => {
    if (!ctx.dragging) return;
    ctx.dragging = false;
    root.classList.remove('dragging');
    reticle.classList.remove('on');
    try {
      if (root.hasPointerCapture(event.pointerId)) root.releasePointerCapture(event.pointerId);
    } catch {
      /* see `pointerdown` */
    }
    if (ctx.flight !== null || ctx.chosen !== null) return;
    // A drag that moved is a drag; four pixels is a hand resting on a button.
    if (ctx.dragged > 4) {
      if (ctx.stage === 'site') followCentre(ctx);
      return;
    }
    if (ctx.stage === 'system' || ctx.stage === 'planet') {
      const id = bodyAt(ctx, event.clientX, event.clientY);
      if (id !== null && id !== ctx.focusId) chooseBody(ctx, id);
      return;
    }
    const at = pointAt(ctx, event.clientX, event.clientY);
    const index = at === null ? 0 : ctx.body.regionAt(at.lat, at.lon);
    const near = at === null ? undefined : onSphere(at.lon, at.lat, new THREE.Vector3());
    if (ctx.stage === 'region') {
      chooseRegion(ctx, index, undefined, near);
    } else if (index > 0 && index !== ctx.regionIndex) {
      chooseRegion(ctx, index, undefined, near);
    } else if (index === 0 && ctx.picked !== null) {
      ctx.picked = null;
      for (const row of rowOf.values()) row.classList.remove('picked');
      refreshChrome(ctx);
    }
  };
  root.addEventListener('pointerup', endDrag, { signal });
  root.addEventListener('pointercancel', endDrag, { signal });
  root.addEventListener('pointerleave', () => {
    ctx.pointer = { x: -1, y: -1 };
  }, { signal });

  root.addEventListener('wheel', (event) => {
    if (ctx.chosen !== null || inChrome(event.target)) return;
    event.preventDefault();
    touch(ctx);
    if (ctx.flight !== null) return;
    const unit = event.deltaMode === 1 ? WHEEL_LINE : event.deltaMode === 2 ? innerHeight : 1;
    const pixels = Math.max(-WHEEL_MAX, Math.min(WHEEL_MAX, event.deltaY * unit));
    const step = Math.exp(pixels * WHEEL_ZOOM);
    if (ctx.stage === 'system') {
      sysWant.distance = Math.max(orrery.extent * 0.4, Math.min(orrery.extent * 3.5, sysWant.distance * step));
    } else if (ctx.stage === 'planet') {
      const entry = bodyById(ctx, ctx.focusId);
      const reach = entry.radius * (entry.body.id === 'saturn' ? 1.9 : 1);
      focusWant.distance = Math.max(reach * 1.6, Math.min(reach * 10, focusWant.distance * step));
    } else {
      const floor = ctx.stage === 'site' ? ctx.body.radius + MIN_ALTITUDE : orbitDistance(ctx.body.radius) * 0.55;
      const ceiling = orbitDistance(ctx.body.radius) * 1.5;
      want.dist = Math.max(floor, Math.min(ceiling, want.dist * step));
    }
  }, { signal, passive: false });

  addEventListener('keydown', (event) => {
    if (ctx.chosen !== null) return;
    // The title holds the keyboard while it is up, and the cards over it with it.
    if (ctx.held || ctx.suspended || ctx.exploring !== null) return;
    // Nor behind a card over everything: a notice of a lost graphics context,
    // the traveller's card. `Esc` there is the card's, and went back a stage.
    if (modalOpen()) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (document.activeElement === searchInput) return;
    touch(ctx);
    if (event.code === 'Escape') {
      event.preventDefault();
      goBack(ctx);
    } else if (isEnter(event)) {
      if (!focusIsFree(ctx)) return;
      event.preventDefault();
      if (ctx.stage === 'site' && ctx.picked !== null) start(ctx, ctx.picked);
      else if (ctx.stage === 'system') continueButton.click();
    } else if (event.key === '/') {
      event.preventDefault();
      searchInput.focus();
    } else if (event.key.length === 1 && /\p{L}/u.test(event.key) && ctx.stage !== 'planet') {
      // Typing a name anywhere starts the search: the input takes the key.
      searchInput.focus();
    }
  }, { signal });
}

export function resize(ctx: MenuCtx): void {
  const { camera, deps, renderer } = ctx;
  // Sized here because `main.ts` does not size the renderer until its loop starts.
  // The ratio is re-read on every resize: browser zoom and another screen change it.
  renderer.setPixelRatio(deps.pixelRatio?.() ?? Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}

/** Sizes the renderer to the window now and on every resize or change of screen density. */
export function bindViewport(ctx: MenuCtx): void {
  const { signal } = ctx;
  addEventListener('resize', () => resize(ctx), { signal });
  resize(ctx);

  // A window moved to a screen of another density does not always resize; the
  // media query for the current ratio fires then, and is asked again for the new one.
  let density: MediaQueryList | null = null;
  const watchDensity = (): void => {
    density?.removeEventListener('change', onDensity);
    density = matchMedia(`(resolution: ${devicePixelRatio}dppx)`);
    density.addEventListener('change', onDensity, { signal });
  };
  function onDensity(): void {
    resize(ctx);
    watchDensity();
  }
  watchDensity();
}
