/** What is under a screen point: a place on the walkable body, or a body's disc in the system. */
import { toLatLon } from '../geo.ts';
import { LAND_HEIGHT } from '../globe.ts';
import { DEG, FOV } from './constants.ts';
import type { Disc, MenuCtx } from './context.ts';

/** Where a screen point lands on the walkable body, or null for the sky: a ray-sphere intersection, then `regionAt`. */
export function pointAt(ctx: MenuCtx, clientX: number, clientY: number): { lat: number; lon: number } | null {
  const { camera, ray, renderer, scratch, scratchB, surface } = ctx;
  const box = renderer.domElement.getBoundingClientRect();
  scratch.set(((clientX - box.left) / box.width) * 2 - 1, -((clientY - box.top) / box.height) * 2 + 1, 0.5);
  scratch.unproject(camera);
  ray.origin.copy(camera.position);
  ray.direction.copy(scratch).sub(camera.position).normalize();
  surface.center.copy(ctx.body.centre);
  surface.radius = ctx.body.radius + LAND_HEIGHT;
  const hit = ray.intersectSphere(surface, scratchB);
  if (hit === null) return null;
  return toLatLon(scratchB.clone().sub(ctx.body.centre));
}

export function regionUnder(ctx: MenuCtx, clientX: number, clientY: number): number {
  const at = pointAt(ctx, clientX, clientY);
  return at === null ? 0 : ctx.body.regionAt(at.lat, at.lon);
}

export function projectDiscs(ctx: MenuCtx): void {
  const { camera, discs, renderer, scratch } = ctx;
  const width = renderer.domElement.clientWidth;
  const height = renderer.domElement.clientHeight;
  const tanHalf = Math.tan(FOV * DEG * 0.5);
  for (const disc of discs) {
    scratch.copy(disc.entry.position);
    disc.depth = camera.position.distanceTo(scratch);
    scratch.project(camera);
    disc.visible = scratch.z < 1 && scratch.z > -1 && Math.abs(scratch.x) < 1.2 && Math.abs(scratch.y) < 1.2;
    disc.x = ((scratch.x + 1) / 2) * width;
    disc.y = ((1 - scratch.y) / 2) * height;
    disc.r = (disc.entry.radius / Math.max(1, disc.depth) / tanHalf) * (height / 2);
  }
}

/**
 * The body under a screen point. A point inside a drawn disc takes the
 * frontmost such disc; otherwise the disc whose rim is nearest wins, within a
 * reach that is generous for the small ones, so two bodies drawn close
 * together are each the one the pointer is nearer to.
 */
export function bodyAt(ctx: MenuCtx, clientX: number, clientY: number): string | null {
  const { discs } = ctx;
  let inside: Disc | null = null;
  let near: Disc | null = null;
  let nearGap = Infinity;
  for (const disc of discs) {
    if (!disc.visible || disc.entry.body.kind === 'star') continue;
    const distance = Math.hypot(clientX - disc.x, clientY - disc.y);
    if (distance <= disc.r) {
      if (inside === null || disc.depth < inside.depth) inside = disc;
      continue;
    }
    const reach = Math.max(disc.r, PICK_FLOOR) + PICK_MARGIN;
    if (distance > reach) continue;
    const gap = distance - disc.r;
    if (gap < nearGap) {
      nearGap = gap;
      near = disc;
    }
  }
  return (inside ?? near)?.entry.body.id ?? null;
}

/** Smallest pick radius, px, round a body drawn as a speck. */
const PICK_FLOOR = 18;
/** Extra reach, px, past a body's drawn rim. */
const PICK_MARGIN = 10;
