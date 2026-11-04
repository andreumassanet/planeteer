/**
 * The canopy over a peer under one, in the canopy their look wears.
 */
import * as THREE from 'three';
import { decodeAppearance } from '../appearance.ts';
import { buildParachute, openCanopy } from '../craft/parachute.ts';
import type { Peer } from './types.ts';
import type { PeersCore } from './core.ts';

/**
 * A copy of a canopy sharing its buffers, with its steering lines its own.
 * `Object3D.clone` copies `userData` through JSON, which would turn the
 * shell's toggles (its line pivots) into plain objects; they are handed to
 * the copy's own pivots instead.
 */
function cloneCanopy(shape: THREE.Group): THREE.Group {
  const shell = shape.children[0]!;
  const toggles = shell.userData.toggles as { pivot: THREE.Object3D }[] | undefined;
  delete shell.userData.toggles;
  const copy = shape.clone();
  shell.userData.toggles = toggles;
  const own = copy.children[0]!;
  const pivots = own.children.filter((child) => child.name === 'toggle');
  if (toggles !== undefined) own.userData.toggles = toggles.map((toggle, i) => ({ ...toggle, pivot: pivots[i] ?? toggle.pivot }));
  return copy;
}

export function createCanopy(core: PeersCore) {
  const { looks } = core;
  /** One shape a pattern, which every peer under that canopy clones so the clones share its buffers. */
  const shapes = new Map<number, THREE.Group>();

  const patternOf = (peer: Peer): number => decodeAppearance(looks.get(peer.id))?.canopy ?? 0;

  /** A peer's canopy in their pattern, cloned from that pattern's one shape. */
  function canopyFor(peer: Peer): THREE.Object3D {
    const pattern = patternOf(peer);
    if (peer.canopy !== null && peer.canopy.userData.canopy === pattern) return peer.canopy;
    peer.canopy?.removeFromParent();
    let shape = shapes.get(pattern);
    if (shape === undefined) {
      shape = buildParachute(pattern);
      shapes.set(pattern, shape);
    }
    peer.canopy = cloneCanopy(shape);
    peer.canopy.userData.canopy = pattern;
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
