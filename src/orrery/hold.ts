/** Holding a body upright for a globe stage, tinting it by region, and covering it with a walked world's own ground. */
import * as THREE from 'three';
import { DEG, HELD_DETAIL } from './constants.ts';
import type { Built, OrreryCtx } from './ctx.ts';
import { paint, tintTexture } from './paint.ts';
import type { HeldRegion } from './types.ts';

/** Switch a body's material's region tint on or off. */
const setTint = (b: Built, texture: THREE.CanvasTexture | null): void => {
  if (b.material === null) return;
  const uniforms = b.material.uniforms;
  uniforms['uTint']!.value = texture;
  uniforms['uTinted']!.value = texture === null ? 0 : 1;
  uniforms['uTintRadius']!.value = b.entry.radius * 1.2;
};

export function holdUpright(ctx: OrreryCtx, id: string | null, regions?: readonly HeldRegion[]): void {
  const { built, disposables, heldGlobes, holdFrom } = ctx;
  const next = id === null ? null : built.find((b) => b.entry.body.id === id && b.mesh !== null) ?? null;
  if (ctx.held !== null && ctx.held !== next && ctx.held.covered !== true) {
    // Let go: the everyday globe back, leaning and turning again.
    ctx.held.mesh!.geometry = ctx.held.coarse!;
    ctx.held.pivot!.quaternion.identity();
    ctx.held.pivot!.rotation.x = (90 + ctx.held.entry.body.tiltDeg) * DEG;
    setTint(ctx.held, null);
  }
  if (ctx.heldTint !== null) {
    ctx.heldTint.dispose();
    ctx.heldTint = null;
  }
  if (next !== null && next !== ctx.held) {
    holdFrom.copy(next.pivot!.quaternion);
    // The spin to undo, the short way round.
    const turn = next.mesh!.rotation.y % (Math.PI * 2);
    ctx.holdSpin = turn > Math.PI ? turn - Math.PI * 2 : turn < -Math.PI ? turn + Math.PI * 2 : turn;
    ctx.holdK = 0;
  }
  ctx.held = next;
  if (ctx.held === null) return;
  if (ctx.held.covered === true) {
    // Already still and upright, and drawn by its own ground.
    ctx.holdK = 1;
    return;
  }
  if (regions === undefined) {
    ctx.held.mesh!.geometry = ctx.held.coarse!;
    setTint(ctx.held, null);
    return;
  }
  let fine = heldGlobes.get(ctx.held.entry.body.id);
  if (fine === undefined) {
    fine = new THREE.IcosahedronGeometry(ctx.held.entry.radius, HELD_DETAIL);
    paint(ctx.held.entry.body, fine);
    fine.computeVertexNormals();
    heldGlobes.set(ctx.held.entry.body.id, fine);
    disposables.push(fine);
  }
  ctx.held.mesh!.geometry = fine;
  if (regions.length === 0) {
    setTint(ctx.held, null);
    return;
  }
  ctx.heldTint = tintTexture(regions);
  setTint(ctx.held, ctx.heldTint);
}

export function cover(ctx: OrreryCtx, id: string): void {
  const { built, nothing } = ctx;
  const b = built.find((one) => one.entry.body.id === id && one.mesh !== null);
  if (b === undefined || b.covered === true) return;
  b.covered = true;
  b.mesh!.geometry = nothing;
  if (ctx.held === b) setTint(b, null);
}
