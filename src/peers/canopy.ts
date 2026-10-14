/**
 * The canopy over a peer under one.
 */
import * as THREE from 'three';
import { buildParachute, openCanopy } from '../craft/parachute.ts';
import type { Peer } from './types.ts';
import type { PeersCore } from './core.ts';

export function createCanopy(core: PeersCore) {
  const s = core.fields;

  /** A peer's canopy, cloned from the one shared shape so the clones share its buffers. */
  function canopyFor(peer: Peer): THREE.Object3D {
    if (peer.canopy !== null) return peer.canopy;
    s.canopyShape ??= buildParachute();
    peer.canopy = s.canopyShape.clone();
    peer.holder.add(peer.canopy);
    return peer.canopy;
  }

  /** The canopy over a peer while their flags say it is open, opening out as the player's own does. */
  function drawCanopy(peer: Peer, dt: number, open: boolean): void {
    if (!open) {
      if (peer.canopy !== null) peer.canopy.visible = false;
      peer.canopyAge = 0;
      return;
    }
    const canopy = canopyFor(peer);
    canopy.visible = true;
    peer.canopyAge += dt;
    openCanopy(canopy, peer.canopyAge, 0);
  }

  return { drawCanopy };
}

export type Canopy = ReturnType<typeof createCanopy>;
