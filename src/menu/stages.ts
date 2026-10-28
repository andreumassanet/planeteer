/**
 * Moving between the globe stages (region, site), back out, and starting: the
 * dive into the chosen town or into another world.
 */
import * as THREE from 'three';
import { toLatLon } from '../geo.ts';
import { onSphere } from '../globe.ts';
import { h } from '../ui.ts';
import { setBody } from './bodies.ts';
import { fillRegionPanel, fillSelect, fillSitePanel } from './cards.ts';
import { regionName } from './catalogue.ts';
import { refreshChrome } from './chrome.ts';
import { DEG, DEPART_HEIGHT, FOV, MAX_CAP, MAX_LAT, MIN_ALTITUDE, REGION_FILL } from './constants.ts';
import type { MenuCtx } from './context.ts';
import { flyTo, globePose, orbitDistance, systemPose } from './flight.ts';
import { remember } from './memory.ts';
import { pointAt } from './picking.ts';
import { loadSites, releasePins } from './pins.ts';
import { makePose, type Pose } from './poses.ts';
import { showRibbon } from './ribbon-view.ts';
import { closeResults } from './search.ts';
import type { MenuRegion, MenuRing, MenuSite, MenuSpawn } from './types.ts';

/**
 * Frames a region on its largest ring, not all of them: France owns islands in
 * three oceans. A cap of half-angle `a` seen from `d` along its axis subtends
 * `atan(R sin a / (d - R cos a))`; setting that to the fill's share of the
 * half-lens and solving for `d` gives the distance.
 */
function frameRegion(ctx: MenuCtx, next: MenuRegion, site?: MenuSite, near?: THREE.Vector3): { lat: number; lon: number; dist: number } {
  let best: MenuRing | null = null;
  for (const ring of next.rings) if (best === null || ring.points.length > best.points.length) best = ring;
  let shape = capOf(best?.points ?? [[next.lon, next.lat]], next);
  // A point on a far piece of the country frames that piece, so choosing French Guiana does not fly to Paris.
  if (near !== undefined && near.angleTo(shape.centre) > shape.cap * 1.15) {
    let score = Infinity;
    for (const ring of next.rings) {
      const candidate = capOf(ring.points, next);
      const s = near.angleTo(candidate.centre) - candidate.cap;
      if (s < score) {
        score = s;
        shape = candidate;
      }
    }
  }
  const cap = Math.min(MAX_CAP, Math.max(0.35 * DEG, shape.cap));
  const target = Math.tan(REGION_FILL * FOV * DEG * 0.5);
  const dist = Math.max(ctx.body.radius + MIN_ALTITUDE, ctx.body.radius * Math.cos(cap) + (ctx.body.radius * Math.sin(cap)) / target);
  const here = site !== undefined ? { lat: site.lat, lon: site.lon } : toLatLon(shape.centre);
  return { lat: Math.max(-MAX_LAT, Math.min(MAX_LAT, here.lat)), lon: here.lon, dist };
}

/** A ring as a cap on the unit sphere: its centre and its half-angle. */
function capOf(points: readonly number[][], fallback: MenuRegion): { centre: THREE.Vector3; cap: number } {
  const centre = new THREE.Vector3();
  const point = new THREE.Vector3();
  for (const p of points) centre.add(onSphere(p[0]!, p[1]!, point));
  if (centre.lengthSq() < 1e-9) onSphere(fallback.lon, fallback.lat, centre);
  centre.normalize();
  let cap = 0;
  for (const p of points) {
    const dot = onSphere(p[0]!, p[1]!, point).dot(centre);
    cap = Math.max(cap, Math.acos(Math.min(1, Math.max(-1, dot))));
  }
  return { centre, cap };
}

/** Makes a region the chosen one without moving the camera; the caller fills the card's list once the flight lands. */
function setRegion(ctx: MenuCtx, index: number): boolean {
  if (index <= 0 || index > ctx.body.regions.length) return false;
  ctx.regionIndex = index;
  ctx.region = ctx.body.regions[index - 1]!;
  ctx.picked = null;
  ctx.hotSite = null;
  showRibbon(ctx, ctx.region);
  loadSites(ctx, ctx.region);
  return true;
}

export function chooseRegion(ctx: MenuCtx, index: number, site?: MenuSite, near?: THREE.Vector3): void {
  const { deps, view, want } = ctx;
  // Nor during the dive into a world, whose curtain is already coming down.
  if (ctx.chosen !== null || ctx.exploring !== null) return;
  touch(ctx);
  if (!setRegion(ctx, index)) return;
  const landing = ctx.region!;
  deps.sound?.cue('select');
  closeResults(ctx);
  const framing = frameRegion(ctx, ctx.region!, site, near);
  const target = globePose(ctx, framing.lat, framing.lon, framing.dist, makePose());
  ctx.stage = 'site';
  flyTo(ctx, target, () => {
    view.lat = want.lat = framing.lat;
    view.lon = want.lon = framing.lon;
    view.dist = want.dist = framing.dist;
    if (ctx.region === landing) fillSitePanel(ctx, landing);
    if (site !== undefined) pickTown(ctx, site);
    refreshChrome(ctx);
  });
}

/**
 * Dragging chooses: the country under the middle of the screen when the globe
 * stops gets its towns shown, framed as any other way of choosing it would.
 */
export function followCentre(ctx: MenuCtx): void {
  const { renderer } = ctx;
  const box = renderer.domElement.getBoundingClientRect();
  const at = pointAt(ctx, box.left + box.width / 2, box.top + box.height / 2);
  if (at === null) return;
  const index = ctx.body.regionAt(at.lat, at.lon);
  if (index <= 0 || index === ctx.regionIndex) return;
  chooseRegion(ctx, index, undefined, onSphere(at.lon, at.lat, new THREE.Vector3()));
}

export function backToRegions(ctx: MenuCtx): void {
  const { deps, view, want } = ctx;
  if (ctx.flight !== null || ctx.chosen !== null) return;
  touch(ctx);
  deps.sound?.cue('back');
  ctx.stage = 'region';
  ctx.region = null;
  ctx.regionIndex = 0;
  ctx.picked = null;
  releasePins(ctx);
  ctx.sites = [];
  showRibbon(ctx, null);
  fillRegionPanel(ctx);
  want.dist = orbitDistance(ctx.body.radius);
  flyTo(ctx, globePose(ctx, view.lat, view.lon, want.dist, makePose()), () => {
    view.dist = want.dist;
    refreshChrome(ctx);
  });
}

export function backToSystem(ctx: MenuCtx): void {
  const { deps, home, orrery, sys, tip } = ctx;
  if (ctx.flight !== null || ctx.chosen !== null) return;
  touch(ctx);
  deps.sound?.cue('back');
  ctx.stage = 'system';
  ctx.region = null;
  ctx.regionIndex = 0;
  ctx.picked = null;
  releasePins(ctx);
  ctx.sites = [];
  showRibbon(ctx, null);
  tip.classList.remove('on');
  orrery.focus(null);
  // Back among the planets the body held up for its globe turns with the rest,
  // once the camera is out among them.
  flyTo(ctx, systemPose(ctx, sys, makePose()), () => {
    setBody(ctx, home);
    refreshChrome(ctx);
  });
}

export function goBack(ctx: MenuCtx): void {
  const { deps } = ctx;
  if (ctx.stage === 'site') backToRegions(ctx);
  else if (ctx.stage === 'region' || ctx.stage === 'planet') backToSystem(ctx);
  else if (ctx.flight === null) deps.onLeave?.();
}

export function pickTown(ctx: MenuCtx, site: MenuSite, centre = false): void {
  const { calm, deps, rowOf, view, want } = ctx;
  if (ctx.chosen !== null) return;
  if (ctx.picked !== site) deps.sound?.cue('pick');
  ctx.picked = site;
  for (const [candidate, row] of rowOf) row.classList.toggle('picked', candidate === site);
  rowOf.get(site)?.scrollIntoView({ block: 'nearest' });
  fillSelect(ctx);
  if (centre && ctx.flight === null) {
    // A town chosen from the list is brought to the middle of the frame (at once, with less motion asked for).
    want.lat = site.lat;
    want.lon = site.lon;
    if (calm.matches) {
      view.lat = want.lat;
      view.lon = want.lon;
    }
  }
  refreshChrome(ctx);
}

/** A body's name as the orrery has it, for a spawn that names only its id. */
export function bodyName(ctx: MenuCtx, id: string): string {
  const { orrery } = ctx;
  return orrery.bodies.find((entry) => entry.body.id === id)?.body.name ?? id;
}

/** Down onto a place on the body from a little south of it, so the last frame before the curtain has a horizon. */
export function divePose(ctx: MenuCtx, lat: number, lon: number): Pose {
  const { home } = ctx;
  const upward = onSphere(lon, lat, new THREE.Vector3());
  const northward = new THREE.Vector3(0, 1, 0).addScaledVector(upward, -upward.y);
  if (northward.lengthSq() < 1e-6) northward.set(1, 0, 0);
  northward.normalize();
  // The height is Earth's, in the body's own radii.
  const height = DEPART_HEIGHT * (ctx.body.radius / home.radius);
  const to = makePose();
  to.target.copy(upward).multiplyScalar(ctx.body.radius).add(ctx.body.centre);
  to.eye.copy(to.target).addScaledVector(upward, height).addScaledVector(northward, -height * 0.45);
  to.up.copy(northward);
  return to;
}

/**
 * Another world, entered as Earth is: the dive onto the chosen place, the curtain
 * over the end of it, the world built under the curtain and the curtain lifted.
 * The menu waits suspended under the world.
 */
function diveInto(ctx: MenuCtx, spawn: MenuSpawn): void {
  const { calm, deps, root } = ctx;
  const onGlobe = spawn.body === ctx.body.id && (ctx.stage === 'region' || ctx.stage === 'site');
  const enter = (): Promise<void> => Promise.resolve(deps.exploreBody?.(spawn.body, bodyName(ctx, spawn.body), spawn));
  if (!onGlobe || calm.matches) {
    void enter();
    return;
  }
  ctx.exploring = spawn.body;
  root.classList.add('departing');
  deps.sound?.stage(null);
  const curtain = h('div', { class: 'atlas-curtain' });
  document.body.append(curtain);
  const lift = (): void => {
    root.classList.remove('departing');
    // Not while the world has the screen.
    if (!ctx.suspended) deps.sound?.stage(ctx.stage);
    curtain.classList.add('lifting');
    curtain.classList.remove('on');
    setTimeout(() => curtain.remove(), 1000);
  };
  flyTo(ctx, divePose(ctx, spawn.lat, spawn.lon), () => {});
  const seconds = ctx.flight!.duration / 1000;
  setTimeout(() => curtain.classList.add('on'), seconds * 1000 * 0.68);
  setTimeout(() => {
    ctx.exploring = null;
    // The world's first frames go under the curtain, as Earth's town does.
    void enter().finally(() => setTimeout(lift, 450));
  }, seconds * 1000 * 0.68 + 420);
}

function finish(ctx: MenuCtx, spawn: MenuSpawn): void {
  const { deps, home, tip, walkable } = ctx;
  if (ctx.chosen !== null || ctx.exploring !== null) return;
  if (spawn.body !== home.id && !walkable.has(spawn.body)) {
    if (deps.exploreBody === undefined) return;
    deps.sound?.cue('start');
    remember(spawn);
    closeResults(ctx);
    tip.classList.remove('on');
    diveInto(ctx, spawn);
    return;
  }
  ctx.chosen = spawn;
  deps.sound?.cue('start');
  remember(spawn);
  closeResults(ctx);
  tip.classList.remove('on');
  fillSelect(ctx);
  refreshChrome(ctx);
  ctx.resolveChoice?.(spawn);
}

export function start(ctx: MenuCtx, site: MenuSite): void {
  finish(ctx, {
    body: ctx.body.id,
    region: regionName(ctx, site.key),
    name: site.name,
    lat: site.lat,
    lon: site.lon,
    ...(site.id === undefined ? {} : { site: site.id }),
  });
}

export function touch(ctx: MenuCtx): void {
  ctx.lastTouched = performance.now();
}

export function bindStages(ctx: MenuCtx): void {
  const { backButton, continueButton, deps, fallback, home, leaveButton } = ctx;
  leaveButton?.addEventListener('click', () => goBack(ctx));

  backButton.addEventListener('click', () => goBack(ctx));
  continueButton.addEventListener('click', () => {
    if (ctx.flight !== null) return;
    // A world the relay of this build cannot reach any more is Earth's fallback.
    const remembered = ctx.last !== null && (ctx.last.body === home.id || deps.exploreBody !== undefined) ? ctx.last : null;
    finish(ctx, remembered ?? { body: home.id, region: '', name: fallback.name, lat: fallback.lat, lon: fallback.lon });
  });
}
