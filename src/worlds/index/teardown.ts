/** Taking a world apart: everything its loop built, in the order that leaves nothing drawn with a disposed resource. */

import * as THREE from 'three';
import { disposeCraft } from '../craft.ts';
import type { Craft } from '../craft.ts';
import type { WorldPlayer } from '../player.ts';
import type { Shell } from '../shell.ts';
import type { Input } from '../../input.ts';
import type { Avatar } from '../../avatar.ts';
import type { PassingSound } from '../../passing-sound.ts';
import { disposeRockets } from '../../rocket.ts';
import type { Parts } from './parts.ts';
import type { RocketPads } from './rocket-pads.ts';

/** The grass's own buffers, materials and fields. */
function disposeSward(sward: NonNullable<Parts['sward']>): void {
  sward.group.removeFromParent();
  sward.group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh !== true) return;
    mesh.geometry.dispose();
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const uniforms = material.userData.uniforms as Record<string, THREE.IUniform> | undefined;
      for (const uniform of Object.values(uniforms ?? {})) if ((uniform.value as THREE.Texture | null)?.isTexture === true) (uniform.value as THREE.Texture).dispose();
      material.dispose();
    }
  });
}

export function teardown(deps: {
  parts: Parts;
  player: WorldPlayer;
  avatar: Avatar;
  crafts: Craft[];
  rocketPads: RocketPads;
  shell: Shell;
  input: Input;
  curtain: HTMLElement;
  passing: PassingSound;
  passingBus: { node: GainNode | null };
}): void {
  const { parts, player, avatar, crafts, rocketPads, shell, input, curtain, passing, passingBus } = deps;
  const { scene, skyships, roads, traffic, sward, ground, frontiers, settlements, crowd, ambient, sky, effects, ctx, gradientMap } = parts;
  for (const rocket of rocketPads.rockets.values()) rocket.dispose();
  rocketPads.rockets.clear();
  skyships?.dispose();
  roads.dispose();
  traffic.dispose();
  // Every craft of this world, the one being driven too.
  if (player.craft !== null) player.leave();
  for (const craft of crafts) disposeCraft(craft);
  crafts.length = 0;
  if (sward !== null) disposeSward(sward);
  // The canopy's shape (its materials are the craft kit's, shared with Earth's).
  scene.getObjectByName('parachute')?.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh === true) mesh.geometry.dispose();
  });
  // The passing voices let go as the world does.
  passing.update(passingBus.node, { jet: null, rotor: null });
  disposeRockets(gradientMap);
  // Lifted once the menu is drawing under it again.
  if (curtain.style.display !== 'none') {
    curtain.style.transition = 'opacity 0.9s ease';
    window.setTimeout(() => (curtain.style.opacity = '0'), 120);
    window.setTimeout(() => curtain.remove(), 1200);
  } else curtain.remove();
  shell.dispose();
  input.dispose();
  ground.dispose();
  frontiers.dispose();
  settlements.dispose();
  crowd.dispose();
  ambient.dispose();
  sky.dispose();
  // The pools' buffers, materials and the ramps they each made.
  effects.dispose();
  // The traveller back to the cast's pool, as the drivers went (`traffic.dispose`).
  avatar.dispose();
  // What was drawn with the scenery context is gone by now: its ramp and
  // materials last.
  ctx.dispose();
  gradientMap.dispose();
}
