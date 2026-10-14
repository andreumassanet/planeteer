/** The ship's bridge behind the hero: its kit arrives by dynamic import the first time it is asked for. */
import * as THREE from 'three';
import type { HeroCtx } from './ctx.ts';
import type { Scene } from './scene.ts';

export function wantBridge(ctx: HeroCtx): void {
  if (ctx.bridgeAsked) return;
  ctx.bridgeAsked = true;
  import('../bridge.ts')
    .then(async (module) => {
      ctx.bridgeKit = { module, pieces: await module.loadBridgePieces() };
      buildBridge(ctx);
    })
    .catch((error: unknown) => {
      console.warn('stage: the bridge did not arrive', error);
      ctx.bridgeFailed = true;
      setScenery(ctx);
    });
}

/** Builds the room once there is both a kit and a hero to take the ramp and the pen from. */
export function buildBridge(ctx: HeroCtx): void {
  const person = ctx.stage?.person ?? null;
  if (ctx.bridge !== null || ctx.bridgeKit === null || person === null) return;
  const material = person.mesh.material as THREE.MeshToonMaterial;
  const ink = material.userData['outlineParameters'] as { thickness: number; color: [number, number, number] } | undefined;
  try {
    ctx.bridge = ctx.bridgeKit.module.buildBridge(ctx.bridgeKit.pieces, {
      gradientMap: material.gradientMap!,
      ink: { thickness: ink?.thickness ?? 0.005, color: ink?.color ?? [0.11, 0.02, 0.01] },
    });
  } catch (error) {
    console.warn('stage: the bridge could not be built', error);
    ctx.bridgeFailed = true;
  }
  setScenery(ctx);
}

/** The room on the bridge, the disc of grass everywhere else. */
export function setScenery(ctx: HeroCtx): void {
  const s = ctx.stage;
  if (s === null) return;
  const onBridge = ctx.backdropKind === 'bridge' && ctx.bridge !== null;
  for (const mesh of s.plinth) mesh.visible = !onBridge;
  if (ctx.bridge === null) return;
  if (onBridge && ctx.bridge.group.parent !== s.scene) s.scene.add(ctx.bridge.group);
  else if (!onBridge && ctx.bridge.group.parent === s.scene) s.scene.remove(ctx.bridge.group);
}

/** Whether everything this backdrop needs is standing, so the canvas may show. */
export function standing(ctx: HeroCtx, s: Scene): boolean {
  return s.person !== null && (ctx.backdropKind !== 'bridge' || ctx.bridge !== null || ctx.bridgeFailed);
}
