/**
 * The peers heard from: made on first sight, given the states they send, undressed and dropped.
 */
import * as THREE from 'three';
import { AVATAR_HEIGHT } from '../avatar.ts';
import { PLAYER_STATES } from '../craft/contract.ts';
import { labelOf } from './label.ts';
import type { Peer, State } from './types.ts';
import type { PeersCore } from './core.ts';

export function createRoster(core: PeersCore) {
  const { folk, group, names, peers } = core;

  function peerOf(id: string, name: string): Peer {
    let peer = peers.get(id);
    if (peer !== undefined) return peer;
    const holder = new THREE.Group();
    holder.name = `peer:${id}`;
    holder.visible = false;
    const label = labelOf(name || 'Traveller');
    label.position.y = AVATAR_HEIGHT * 1.15;
    holder.add(label);
    group.add(holder);
    peer = {
      id, name, snapshots: [], heard: performance.now(), holder, body: null, label, shown: new THREE.Vector3(),
      gesture: null, gestureAt: 0, flags: 0, canopy: null, canopyAge: 0, sat: false, aloft: false,
    };
    peers.set(id, peer);
    return peer;
  }

  /** Adds a state heard from a peer, making the peer if it is new. Two states either side of the drawn instant is all interpolation needs. */
  function heard(id: string, name: string | null, state: State, now: number): void {
    if (state.length !== 9) return;
    const peer = peerOf(id, name ?? names.get(id) ?? '');
    const [x, y, z, fx, fy, fz, doing, speed, airborne] = state;
    peer.snapshots.push({
      at: now,
      position: new THREE.Vector3(x, y, z),
      forward: new THREE.Vector3(fx, fy, fz),
      state: PLAYER_STATES[doing] ?? 'foot',
      speed,
      airborne: airborne === 1,
    });
    // Two states either side of the drawn instant is all interpolation needs.
    if (peer.snapshots.length > 8) peer.snapshots.shift();
    peer.heard = now;
  }

  /** Takes the cast body off a peer and gives it back to the crowd. */
  function undress(peer: Peer): void {
    if (peer.body === null) return;
    peer.holder.remove(peer.body.person.root);
    peer.body.motion.unlay();
    folk.release(peer.body.person);
    peer.body = null;
  }

  /** Forgets a peer and everything of it that is its own. */
  function drop(id: string): void {
    const peer = peers.get(id);
    if (peer === undefined) return;
    group.remove(peer.holder);
    undress(peer);
    // The canopy's geometry and material are the shared one's (`canopyFor`).
    peer.canopy?.removeFromParent();
    peer.label.material.map?.dispose();
    peer.label.material.dispose();
    peers.delete(id);
  }

  return { peerOf, heard, undress, drop };
}

export type Roster = ReturnType<typeof createRoster>;
