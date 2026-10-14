/** The chosen region's ribbon on the globe: which region shows, and its weight on the screen. */
import * as THREE from 'three';
import { PALETTE } from '../theme.ts';
import { RIBBON_GOLD, RIBBON_INK } from './constants.ts';
import type { MenuCtx } from './context.ts';
import { pixelsPerUnit } from './flight.ts';
import { buildRibbon, ribbonMaterial } from './ribbon.ts';
import type { MenuRegion } from './types.ts';

/** The scene objects that draw the chosen region's ribbon and the body's own overlay. */
export function createRibbonLayer(scene: THREE.Scene) {
  const ribbonGroup = new THREE.Group();
  ribbonGroup.name = 'menu-highlight';
  const inkRibbon = new THREE.Mesh(new THREE.BufferGeometry(), ribbonMaterial(PALETTE.ink, 0));
  const goldRibbon = new THREE.Mesh(new THREE.BufferGeometry(), ribbonMaterial(PALETTE.gold, 1));
  inkRibbon.renderOrder = 901;
  goldRibbon.renderOrder = 902;
  inkRibbon.frustumCulled = false;
  goldRibbon.frustumCulled = false;
  ribbonGroup.add(inkRibbon, goldRibbon);
  ribbonGroup.visible = false;
  scene.add(ribbonGroup);

  /** The body's own overlay (`MenuBody.overlay`), hung at its centre while it is the one up. */
  const overlayGroup = new THREE.Group();
  overlayGroup.name = 'menu-overlay';
  scene.add(overlayGroup);

  return { ribbonGroup, inkRibbon, goldRibbon, overlayGroup, ribbons: new Map<string, THREE.BufferGeometry>() };
}

export type RibbonLayer = ReturnType<typeof createRibbonLayer>;

export function showRibbon(ctx: MenuCtx, next: MenuRegion | null): void {
  const { goldRibbon, inkRibbon, ribbonGroup, ribbons } = ctx;
  if (next === ctx.shown) return;
  ctx.shown = next;
  ribbonGroup.visible = next !== null;
  if (next === null) return;
  let geometry = ribbons.get(next.key);
  if (geometry === undefined) {
    geometry = buildRibbon(ctx.body, next);
    ribbons.set(next.key, geometry);
  }
  inkRibbon.geometry = geometry;
  goldRibbon.geometry = geometry;
}

export function ribbonWidth(ctx: MenuCtx): void {
  const { camera, goldRibbon, inkRibbon, overlayGroup, renderer, ribbonGroup } = ctx;
  // The ribbons and the overlay are in the body's frame, and a body other
  // than Earth moves as the system turns under the sky's clock.
  ribbonGroup.position.copy(ctx.body.centre);
  overlayGroup.position.copy(ctx.body.centre);
  overlayGroup.visible = ctx.stage === 'region' || ctx.stage === 'site';
  // The same weight on screen at every altitude.
  const scale = 1 / Math.max(1e-6, pixelsPerUnit(ctx, Math.max(1, camera.position.distanceTo(ctx.body.centre) - ctx.body.radius)));
  const frame = renderer.domElement.clientHeight / 1080;
  for (const mesh of [inkRibbon, goldRibbon]) {
    const material = mesh.material as THREE.MeshBasicMaterial;
    const uniforms = material.userData.uniforms as { uWidth?: { value: number } } | undefined;
    if (uniforms?.uWidth === undefined) continue;
    const pixels = material.userData.order === 0 ? RIBBON_INK : RIBBON_GOLD;
    uniforms.uWidth.value = pixels * frame * scale * 0.5;
  }
}
