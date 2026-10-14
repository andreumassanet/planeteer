/**
 * A peer's state `DELAY_MS` ago, blended between the two snapshots either side of it.
 */
import * as THREE from 'three';
import type { PlayerState } from '../craft/contract.ts';
import { DELAY_MS } from './constants.ts';
import type { Peer } from './types.ts';

export function createSampler() {
  const drawn = { position: new THREE.Vector3(), forward: new THREE.Vector3(), speed: 0, state: 'foot' as PlayerState, airborne: false };

  /** The state `DELAY_MS` ago, blended between the two either side of it; `null` before the first. */
  function sample(peer: Peer, now: number): typeof drawn | null {
    const list = peer.snapshots;
    const newest = list[list.length - 1];
    if (newest === undefined) return null;
    const at = now - DELAY_MS;
    let i = list.length - 1;
    while (i > 0 && list[i - 1]!.at > at) i--;
    const b = list[i]!;
    const a = list[i - 1];
    if (a === undefined || at >= newest.at) {
      drawn.position.copy(newest.position);
      drawn.forward.copy(newest.forward);
      drawn.speed = at - newest.at > 500 ? 0 : newest.speed;
      drawn.state = newest.state;
      drawn.airborne = newest.airborne;
      return drawn;
    }
    const t = THREE.MathUtils.clamp((at - a.at) / Math.max(1, b.at - a.at), 0, 1);
    drawn.position.lerpVectors(a.position, b.position, t);
    drawn.forward.lerpVectors(a.forward, b.forward, t);
    drawn.speed = a.speed + (b.speed - a.speed) * t;
    drawn.state = t < 0.5 ? a.state : b.state;
    drawn.airborne = t < 0.5 ? a.airborne : b.airborne;
    return drawn;
  }

  return { sample };
}

export type Sampler = ReturnType<typeof createSampler>;
