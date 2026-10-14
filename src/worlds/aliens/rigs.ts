/** Standing a walker up from a pooled rig, playing its clips, and putting it away. */

import * as THREE from 'three';
import { rngFrom } from '../../scenery/random.ts';
import { makeRigged, paintColors } from '../../models.ts';
import type { Model, Rigged } from '../../models.ts';
import type { ClipRole, SpaceCreature } from '../../space-kit.ts';
import { creaturePaint } from '../kit.ts';
import type { Coat } from '../kit.ts';
import type { Site } from '../settlements.ts';
import type { CrowdState } from './state.ts';
import { BLOB_SHARE, FLYER_SHARE, WIDEST } from './rules.ts';
import type { Walker } from './types.ts';

/** A rig of `creature` painted in `coat` (or the pack's own colours brought onto the palette). */
export function rigOf(s: CrowdState, creature: SpaceCreature, coat: Coat | null): Rigged {
  const { material, stats, pool } = s;
  const id = creature.entry.id;
  const paint = creaturePaint(id, coat);
  const spare = pool.get(id)?.pop();
  if (spare !== undefined) {
    stats.pooled--;
    const colors = spare.body.geometry.getAttribute('color') as THREE.BufferAttribute;
    (colors.array as Float32Array).set(paintColors(creature.rig as unknown as Model, paint));
    colors.needsUpdate = true;
    spare.mixer.stopAllAction();
    return spare;
  }
  const rigged = makeRigged(creature.rig, paint);
  rigged.body.material = material;
  rigged.body.castShadow = true;
  return rigged;
}

/** Stands a walker up: its rig, its scale, the clip it starts on. */
export function standUp(s: CrowdState, site: Site, key: string, creature: SpaceCreature, coat: Coat | null, height: number, visitor: boolean, at: { x: number; z: number }, yaw: number, speed: number): Walker {
  const { group } = s;
  const rigged = rigOf(s, creature, coat);
  const holder = new THREE.Group();
  holder.name = `alien ${key}`;
  // The kind's share of the species' height — a blob is a pet's size, a
  // flyer floats smaller than a walker — and never wider than `WIDEST`,
  // or a round blob or a squid's spread of arms stood two people across.
  const share = creature.entry.kind === 'blob' ? BLOB_SHARE : creature.entry.kind === 'flyer' ? FLYER_SHARE : 1;
  const tall = height * share;
  const box = creature.rig.box;
  const across = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / creature.height;
  const scale = (Math.min(tall, WIDEST / Math.max(across, 1e-3)) / creature.height);
  height = creature.height * scale;
  rigged.root.scale.setScalar(scale);
  rigged.root.rotation.set(0, 0, 0);
  holder.add(rigged.root);
  group.add(holder);
  const rng = rngFrom('worlds', 'walker-clock', key);
  const walker: Walker = {
    key,
    site,
    mesh: holder,
    creature,
    rigged,
    visitor,
    height,
    room: (Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * scale) / 2,
    scale,
    x: at.x,
    z: at.z,
    yaw,
    lane: 0,
    pocket: -1,
    stretch: null,
    path: [],
    wait: rng.range(0.5, 5),
    rest: 0,
    speed,
    clock: rng.range(0, 100),
    decisions: 0,
    facing: null,
    turn: 0,
    clip: '',
    action: null,
    holdUntil: 0,
    nextGesture: rng.range(3, 12),
    talking: false,
  };
  play(walker, 'idle', 0);
  // Not all in step: each starts its idle somewhere in the loop.
  walker.rigged.mixer.setTime(rng.range(0, 2));
  return walker;
}

/** Plays the clip for `role`, crossfading from what was playing; a one-off holds until it is done. */
export function play(w: Walker, role: ClipRole, fade = 0.25, once = false): void {
  const clip = w.creature.clipFor(role);
  if (clip === null) return;
  const action = w.rigged.actions.get(clip.name);
  if (action === undefined) return;
  if (w.action === action && !once) return;
  action.reset();
  action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
  action.clampWhenFinished = once;
  action.setEffectiveTimeScale(1);
  action.setEffectiveWeight(1);
  action.play();
  if (w.action !== null && w.action !== action && fade > 0) action.crossFadeFrom(w.action, fade, false);
  else if (w.action !== null && w.action !== action) w.action.stop();
  w.action = action;
  w.clip = role;
  w.holdUntil = once ? w.clock + clip.duration * 0.96 : 0;
}

export function release(s: CrowdState, w: Walker): void {
  const { group, stats, pool } = s;
  group.remove(w.mesh);
  w.mesh.remove(w.rigged.root);
  w.rigged.mixer.stopAllAction();
  const id = w.creature.entry.id;
  const list = pool.get(id) ?? [];
  list.push(w.rigged);
  pool.set(id, list);
  stats.pooled++;
}
