/** The town pins at the site stage: pooled elements keyed on the town, thinned largest-first. */
import * as THREE from 'three';
import { LabelSpace, thinMarks } from '../cartography.ts';
import { LAND_HEIGHT, onSphere } from '../globe.ts';
import { h } from '../ui.ts';
import { MAX_PINS, PIN_SPACING } from './constants.ts';
import type { MenuCtx } from './context.ts';
import { isEnter } from './poses.ts';
import { pickTown, start } from './stages.ts';
import type { MenuRegion } from './types.ts';

/** People in a town for its name to be set a size larger, and larger again. */
const MID_TOWN = 300_000;
const BIG_TOWN = 1_000_000;

export function loadSites(ctx: MenuCtx, next: MenuRegion): void {
  ctx.sites = ctx.sitesOf.get(next.key)?.slice() ?? [];
  // A country with no town in the gazetteer still has to be spawnable; its
  // own label point is on land by construction.
  if (ctx.sites.length === 0) ctx.sites = [{ name: next.name, key: next.key, lat: next.lat, lon: next.lon, weight: 0 }];
  ctx.unitOf = ctx.sites.map((site) => onSphere(site.lon, site.lat, new THREE.Vector3()));
  ctx.projX = new Float32Array(ctx.sites.length);
  ctx.projY = new Float32Array(ctx.sites.length);
  ctx.order = new Int32Array(ctx.sites.length);
  ctx.kept = new Int32Array(ctx.sites.length);
  ctx.keptX = new Float32Array(ctx.sites.length);
  ctx.keptY = new Float32Array(ctx.sites.length);
  releasePins(ctx);
}

export function releasePins(ctx: MenuCtx): void {
  const { freePins, shownPins } = ctx;
  for (const element of shownPins.values()) {
    element.style.display = 'none';
    freePins.push(element);
  }
  shownPins.clear();
}

function takePin(ctx: MenuCtx): HTMLButtonElement {
  const { freePins, pinLayer } = ctx;
  const spare = freePins.pop();
  if (spare !== undefined) return spare;
  const element = h('button', { class: 'm-pin' }, h('i'), h('span'));
  pinLayer.append(element);
  return element;
}

/**
 * Lays the pins out for this frame. The pool is keyed on the town's index, so an
 * element never carries one town one frame and another the next. Thinned
 * largest-first with `thinMarks`.
 */
export function layOutPins(ctx: MenuCtx): void {
  const { camera, freePins, renderer, scratch, scratchB, shownPins } = ctx;
  if (ctx.stage !== 'site' || ctx.flight !== null || ctx.sites.length === 0) {
    releasePins(ctx);
    return;
  }
  const box = renderer.domElement.getBoundingClientRect();
  const cosHorizon = ctx.body.radius / camera.position.distanceTo(ctx.body.centre);
  const camDir = scratchB.copy(camera.position).sub(ctx.body.centre).normalize();

  let count = 0;
  for (let i = 0; i < ctx.sites.length; i++) {
    const unit = ctx.unitOf[i]!;
    if (unit.dot(camDir) <= cosHorizon) continue;
    scratch.copy(unit).multiplyScalar(ctx.body.radius + LAND_HEIGHT).add(ctx.body.centre).project(camera);
    if (scratch.x < -1.05 || scratch.x > 1.05 || scratch.y < -1.05 || scratch.y > 1.05) continue;
    ctx.projX[i] = ((scratch.x + 1) / 2) * box.width;
    ctx.projY[i] = ((1 - scratch.y) / 2) * box.height;
    ctx.order[count++] = i;
  }

  const n = Math.min(MAX_PINS, thinMarks(ctx.order, count, ctx.projX, ctx.projY, PIN_SPACING, ctx.kept, ctx.keptX, ctx.keptY));
  // The picked town and the one under the pointer in the list always stand,
  // whatever the thinning thought of them.
  const force = [ctx.picked, ctx.hotSite];
  let total = n;
  for (const site of force) {
    if (site === null) continue;
    const at = ctx.sites.indexOf(site);
    if (at < 0) continue;
    let present = false;
    for (let i = 0; i < total; i++) if (ctx.kept[i] === at) present = true;
    if (present) continue;
    const unit = ctx.unitOf[at]!;
    if (unit.dot(camDir) <= cosHorizon) continue;
    scratch.copy(unit).multiplyScalar(ctx.body.radius + LAND_HEIGHT).add(ctx.body.centre).project(camera);
    if (Math.abs(scratch.x) > 1.05 || Math.abs(scratch.y) > 1.05) continue;
    ctx.kept[total] = at;
    ctx.keptX[total] = ((scratch.x + 1) / 2) * box.width;
    ctx.keptY[total] = ((1 - scratch.y) / 2) * box.height;
    total++;
  }

  const space = new LabelSpace();
  for (const [at, element] of shownPins) {
    let survives = false;
    for (let i = 0; i < total; i++) {
      if (ctx.kept[i] === at) {
        survives = true;
        break;
      }
    }
    if (survives) continue;
    element.style.display = 'none';
    freePins.push(element);
    shownPins.delete(at);
  }
  // The picked and hot towns claim their label space first.
  const indices = Array.from({ length: total }, (_, i) => i).sort((a, b) => {
    const rank = (i: number): number => (ctx.sites[ctx.kept[i]!] === ctx.picked ? 0 : ctx.sites[ctx.kept[i]!] === ctx.hotSite ? 1 : 2);
    return rank(a) - rank(b);
  });
  for (const i of indices) {
    const at = ctx.kept[i]!;
    const site = ctx.sites[at]!;
    let element = shownPins.get(at);
    if (element === undefined) {
      element = takePin(ctx);
      shownPins.set(at, element);
      element.querySelector('span')!.textContent = site.name;
      element.title = site.name;
      element.style.display = '';
    }
    const x = ctx.keptX[i]!;
    const y = ctx.keptY[i]!;
    // The type by how many live there, so the map reads biggest first.
    const size = site.capital === true || site.weight >= BIG_TOWN ? 'big' : site.weight >= MID_TOWN ? 'mid' : '';
    const em = size === 'big' ? 17 : size === 'mid' ? 14.5 : 13;
    // The name's box, centred over the dot, and the dot's own.
    const width = site.name.length * em * 0.6 + 12;
    const away = !space.fits(x - width / 2, y - 12 - em, width, em + 6);
    if (!away) space.claim(x - width / 2, y - 12 - em, width, em + 6);
    space.claim(x - 6, y - 6, 12, 12);
    const classes = ['m-pin'];
    if (size !== '') classes.push(size);
    if (site.capital === true) classes.push('capital');
    if (away) classes.push('away');
    if (site === ctx.picked) classes.push('picked');
    if (site === ctx.hotSite) classes.push('hot');
    element.className = classes.join(' ');
    element.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  }
}

export function bindPins(ctx: MenuCtx): void {
  const { deps, pinLayer, root, shownPins } = ctx;
  pinLayer.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest('button');
    if (button === null) return;
    for (const [at, element] of shownPins) {
      if (element === button) pickTown(ctx, ctx.sites[at]!);
    }
  });
  // The buttons and pins tick under the pointer as the bodies and the countries do.
  let overControl: Element | null = null;
  root.addEventListener('pointerover', (event) => {
    const control = event.target instanceof Element ? event.target.closest('.m-pin, .ui-btn, .m-crumb, .m-result') : null;
    if (control === overControl) return;
    overControl = control;
    if (control !== null && ctx.chosen === null) deps.sound?.cue('hover');
  });
  pinLayer.addEventListener('dblclick', (event) => {
    const button = (event.target as HTMLElement).closest('button');
    if (button === null || ctx.picked === null) return;
    start(ctx, ctx.picked);
  });
  // Enter on a pin is its click — it picks that town — and Enter on the pin
  // already picked starts there, which is the double-click's job for a mouse.
  pinLayer.addEventListener('keydown', (event) => {
    if (!isEnter(event) || ctx.picked === null) return;
    const button = (event.target as HTMLElement).closest('button');
    if (button === null || button !== shownPins.get(ctx.sites.indexOf(ctx.picked))) return;
    event.preventDefault();
    start(ctx, ctx.picked);
  });
}
