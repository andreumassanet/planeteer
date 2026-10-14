/** Dressing the figure and its wave. */
import * as THREE from 'three';
import { type Appearance, coloursOf, encodeAppearance, fitAppearance, wardrobeOf } from '../appearance.ts';
import { paintWith } from '../cast.ts';
import { AVATAR_HEIGHT } from '../stature.ts';
import { buildBridge } from './bridge-room.ts';
import type { HeroCtx } from './ctx.ts';
import type { Scene } from './scene.ts';

export function redress(ctx: HeroCtx, s: Scene, appearance: Appearance): void {
  if (ctx.cast === null) return;
  const old = s.person;
  const fitted = fitAppearance(appearance);
  const person = ctx.cast.make(wardrobeOf(fitted), paintWith(coloursOf(fitted)), AVATAR_HEIGHT);
  person.mixer.stopAllAction();
  const idle = person.actions.get('Idle_Neutral');
  idle?.reset().play();
  // The idle carries on where it was, so a change of shirt is not a twitch.
  const before = old?.actions.get('Idle_Neutral');
  if (idle !== undefined && before !== undefined) idle.time = before.time;
  person.mixer.update(0);
  const head = person.bones.get('Head');
  ctx.headRest = head === undefined ? null : head.quaternion.clone();
  s.turntable.add(person.root);
  s.person = person;
  s.worn = encodeAppearance(appearance);
  ctx.gesture = null;
  if (old !== null) {
    s.turntable.remove(old.root);
    ctx.cast.release(old);
  }
  buildBridge(ctx);
  // The plinth takes the ramp the cast was drawn on, and the same pen.
  const material = person.mesh.material as THREE.MeshToonMaterial;
  for (const mesh of s.plinth) {
    const own = mesh.material as THREE.MeshToonMaterial;
    if (own.gradientMap === material.gradientMap) continue;
    own.gradientMap = material.gradientMap;
    own.userData.outlineParameters = material.userData.outlineParameters;
    own.needsUpdate = true;
  }
}

export function wave(ctx: HeroCtx): void {
  const { calm } = ctx;
  const person = ctx.stage?.person;
  if (person === undefined || person === null || ctx.gesture !== null || calm.matches) return;
  const action = person.actions.get('Wave');
  const idle = person.actions.get('Idle_Neutral');
  if (action === undefined || idle === undefined) return;
  action.reset();
  action.setLoop(THREE.LoopOnce, 1);
  action.setEffectiveWeight(0);
  action.play();
  ctx.gesture = { action, idle, at: ctx.clock };
}
