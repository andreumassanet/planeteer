/** Choosing a body from the system: its card or its globe, made on demand, and entering a walkable one. */
import * as THREE from 'three';
import { toLatLon } from '../geo.ts';
import type { OrreryBody } from '../orrery.ts';
import { fillInfo, fillRegionPanel } from './cards.ts';
import { catalogueOf } from './catalogue.ts';
import { refreshChrome } from './chrome.ts';
import { FOCUS_DISTANCE, FOCUS_ELEVATION } from './constants.ts';
import type { MenuCtx } from './context.ts';
import { bodyById, flyTo, focusPose, globePose, inPlane, orbitDistance } from './flight.ts';
import { releasePins } from './pins.ts';
import { makePose } from './poses.ts';
import { showRibbon } from './ribbon-view.ts';
import { refreshWords } from './search.ts';
import { touch } from './stages.ts';
import type { MenuBody } from './types.ts';

export function chooseBody(ctx: MenuCtx, id: string): void {
  const { deps, focus, focusWant, loaded, orrery, scratchB, walkable } = ctx;
  if (ctx.flight !== null || ctx.chosen !== null || ctx.exploring !== null) return;
  const entry = bodyById(ctx, id);
  if (entry.body.kind === 'star') return;
  touch(ctx);
  // Every world is chosen as Earth is: one click and the camera goes down onto its globe.
  const next = walkable.get(id) ?? loaded.get(id);
  if (next !== undefined) {
    deps.sound?.cue('select');
    enterBody(ctx, next);
    return;
  }
  if (deps.exploreBody !== undefined) {
    void exploreFrom(ctx, entry, null);
    return;
  }
  deps.sound?.cue('select');
  ctx.focusId = id;
  orrery.focus(id);
  // Seen three-quarters lit: round from the Sun's side of it, a little above
  // its equator.
  const toSun = scratchB.subVectors(orrery.sun.position, entry.position);
  const base = inPlane(ctx, toSun) + 0.9;
  const reach = entry.radius * (entry.body.id === 'saturn' ? 1.9 : 1);
  focus.azimuth = focusWant.azimuth = base;
  focus.elevation = focusWant.elevation = FOCUS_ELEVATION;
  focus.distance = focusWant.distance = reach * FOCUS_DISTANCE;
  fillInfo(ctx, entry);
  showRibbon(ctx, null);
  const target = focusPose(ctx, focus, makePose());
  ctx.stage = 'planet';
  flyTo(ctx, target, () => refreshChrome(ctx));
}

/**
 * *Explore* on a body's card: down onto its globe once `deps.loadBody` has made
 * its `MenuBody`, or straight to the world when there is none.
 */
export async function exploreFrom(ctx: MenuCtx, entry: OrreryBody, button: HTMLButtonElement | null): Promise<void> {
  const { deps, loaded } = ctx;
  const b = entry.body;
  if (ctx.flight !== null || ctx.chosen !== null || ctx.exploring !== null) return;
  touch(ctx);
  const from = ctx.stage;
  let next: MenuBody | null = loaded.get(b.id) ?? null;
  if (next === null && deps.loadBody !== undefined) {
    ctx.exploring = b.id;
    if (button !== null) button.disabled = true;
    next = await bodyOf(ctx, entry);
    ctx.exploring = null;
    if (button !== null) button.disabled = false;
    // Do nothing if the menu moved on while it loaded, or was put away.
    if (ctx.stage !== from || ctx.flight !== null || ctx.chosen !== null || ctx.held || ctx.suspended) return;
  }
  if (next === null) {
    deps.sound?.cue('start');
    deps.exploreBody?.(b.id, b.name);
    return;
  }
  deps.sound?.cue('select');
  enterBody(ctx, next);
}

/** A walkable body's `MenuBody`, made once; its own ground replaces the orrery's painted ball from then on. */
export function bodyOf(ctx: MenuCtx, entry: OrreryBody): Promise<MenuBody | null> {
  const { deps, globes, loaded, making, orrery, scene } = ctx;
  const id = entry.body.id;
  const have = loaded.get(id);
  if (have !== undefined) return Promise.resolve(have);
  const pending = making.get(id);
  if (pending !== undefined) return pending;
  const made = (async (): Promise<MenuBody | null> => {
    if (deps.loadBody === undefined) return null;
    try {
      let next = await deps.loadBody(id, entry.position, entry.radius);
      if (next === null) return null;
      // Made after the menu went: let it go here, as `dispose` does for the rest.
      if (ctx.disposed) {
        next.globe?.dispose();
        if (next.overlay !== undefined) disposeObject(next.overlay);
        return null;
      }
      // The orrery's own live vector, so the globe stages follow the body round the system.
      if (next.centre !== entry.position) next = { ...next, centre: entry.position };
      loaded.set(id, next);
      if (next.globe !== undefined) {
        scene.add(next.globe.object);
        globes.push({ entry, globe: next.globe });
        orrery.cover(id);
      }
      return next;
    } catch (error) {
      console.warn(`menu: ${entry.body.name}'s regions did not load`, error);
      return null;
    }
  })();
  making.set(id, made);
  return made;
}

/** Every geometry and material under `object`: a body's overlay, which the menu owns once it has it. */
export function disposeObject(object: THREE.Object3D): void {
  object.traverse((part) => {
    const drawn = part as THREE.Mesh;
    drawn.geometry?.dispose();
    const material = drawn.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) for (const one of material) one.dispose();
    else material?.dispose();
  });
}

/** Each world's ground at its body, shown as the orrery shows the body, and as fine as the eye needs. */
export function placeGlobes(ctx: MenuCtx): void {
  const { camera, globes } = ctx;
  for (const { entry, globe } of globes) {
    globe.object.position.copy(entry.position);
    globe.object.visible = entry.opacity > 0.01;
    if (globe.object.visible) globe.update(camera.position, entry.position);
  }
}

/** Make a walkable body the one the globe stages are about, without moving the camera. */
export function setBody(ctx: MenuCtx, next: MenuBody): void {
  const { home, orrery, overlayGroup } = ctx;
  if (next === ctx.body) return;
  ctx.body = next;
  ({ regionIndexOf: ctx.regionIndexOf, sitesOf: ctx.sitesOf } = catalogueOf(ctx, ctx.body));
  ctx.region = null;
  ctx.regionIndex = 0;
  ctx.hoverIndex = 0;
  ctx.picked = null;
  ctx.hotSite = null;
  releasePins(ctx);
  ctx.sites = [];
  showRibbon(ctx, null);
  refreshWords(ctx);
  overlayGroup.clear();
  if (ctx.body.overlay !== undefined) {
    // In the body's own frame: the group it hangs in is what stands at the centre.
    ctx.body.overlay.position.set(0, 0, 0);
    overlayGroup.add(ctx.body.overlay);
  }
  if (ctx.body === home) {
    orrery.holdUpright(null);
  } else {
    // The drawn globe is held still in the world's frame, unpainted: a region is seen under the pointer, not as a colour.
    orrery.holdUpright(ctx.body.id, []);
  }
}

/** Down from the system onto a walkable world, to its region stage. */
function enterBody(ctx: MenuCtx, next: MenuBody): void {
  const { orrery, pose, scratch, scratchB, view, want } = ctx;
  setBody(ctx, next);
  orrery.focus(null);
  // The globe is framed on a blend of where the camera came from and where
  // the Sun is, so the flight is mostly a zoom and it lands on the day side.
  const approach = scratch.copy(pose.eye).sub(ctx.body.centre).normalize();
  const sun = scratchB.copy(orrery.sun.position).sub(ctx.body.centre).normalize();
  const blendDir = approach.multiplyScalar(0.4).addScaledVector(sun, 0.6).normalize();
  const here = toLatLon(blendDir);
  view.lat = want.lat = Math.max(-35, Math.min(55, here.lat));
  view.lon = want.lon = here.lon;
  view.dist = want.dist = orbitDistance(ctx.body.radius);
  fillRegionPanel(ctx);
  ctx.stage = 'region';
  flyTo(ctx, globePose(ctx, view.lat, view.lon, view.dist, makePose()), () => refreshChrome(ctx));
}
