/**
 * The pool of merged buffers movers are drawn from: one per (vehicle, region,
 * variant), per (region, body, phase) for a code-built walker, and per site
 * for a herd. Built under a time budget and evicted least recently used.
 */
import * as THREE from 'three';
import type { Merged } from '../merge.ts';
import type { HerdHead } from './herd-types.ts';
import { WALK_PHASES } from './tuning.ts';

export interface Pooled {
  geometry: THREE.BufferGeometry;
  triangles: number;
  bytes: number;
  /** A near road vehicle's see-through glass, drawn as a child in the glass material (`glazeTraffic`). */
  glass?: THREE.BufferGeometry;
  /**
   * Animals this herd buffer actually holds: an animal on too steep a patch is
   * dropped at build time, so this, not the scan's request, is what is drawn.
   */
  heads?: number;
  /** Where each animal of a rigged herd stands, so it can be stood up as rigs near (`animateHerd`). */
  animals?: HerdHead[];
}

/**
 * Buffers held before the least recently drawn are let go. A session that
 * flies round the planet would otherwise hold every vehicle, body and herd of
 * every region it crossed. A count, not a byte budget; a herd buffer is
 * several times a vehicle's, so the worst case is a pool full of herds.
 */
const POOL_CAP = 420;

export interface Pool {
  entries: Map<string, Pooled>;
  /** Keys asked for and not yet built. */
  wanted: Set<string>;
  /** Keys that cannot be built, so they are not asked for twice. */
  refused: Set<string>;
  /** Marks a key as drawn this frame. */
  touch(key: string): void;
  /** Advances the frame counter, evicting every 64 frames. */
  endFrame(): void;
  megabytes(): number;
}

export function createPool(): Pool {
  const entries = new Map<string, Pooled>();
  const wanted = new Set<string>();
  const refused = new Set<string>();
  /** The frame each key was last drawn on. */
  const usedAt = new Map<string, number>();
  let frameCount = 0;

  /**
   * How recently a key was drawn, taking a walker's phases together: a walker
   * refreshes one phase a frame, and its phases are evicted as a set.
   */
  const freshness = (key: string): number => {
    if (!key.startsWith('w|')) return usedAt.get(key) ?? 0;
    const stem = key.slice(0, key.lastIndexOf('|'));
    let best = 0;
    for (let phase = 0; phase < WALK_PHASES; phase++) {
      best = Math.max(best, usedAt.get(`${stem}|${phase}`) ?? 0);
    }
    return best;
  };

  function evict(): void {
    if (entries.size <= POOL_CAP) return;
    const order = [...entries.keys()].sort((a, b) => freshness(a) - freshness(b));
    for (const key of order) {
      if (entries.size <= POOL_CAP * 0.85) break;
      // A walker's phases go together or a body loses part of its cycle.
      const stem = key.startsWith('w|') ? key.slice(0, key.lastIndexOf('|')) : key;
      for (let phase = 0; phase < WALK_PHASES; phase++) {
        const member = key.startsWith('w|') ? `${stem}|${phase}` : key;
        const entry = entries.get(member);
        if (entry === undefined) continue;
        entry.geometry.dispose();
        entry.glass?.dispose();
        entries.delete(member);
        usedAt.delete(member);
        if (!key.startsWith('w|')) break;
      }
    }
  }

  return {
    entries,
    wanted,
    refused,
    touch(key) {
      usedAt.set(key, frameCount);
    },
    endFrame() {
      frameCount++;
      if ((frameCount & 63) === 0) evict();
    },
    megabytes() {
      let bytes = 0;
      for (const entry of entries.values()) bytes += entry.bytes;
      return Number((bytes / 1048576).toFixed(2));
    },
  };
}

/** A merged buffer as a geometry, with its ink normals. */
export function geometryOf(merged: Merged): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(merged.position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(merged.normal, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(merged.color, 3));
  geometry.setAttribute('outlineNormal', new THREE.BufferAttribute(merged.outline, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

/** Disposes every mesh geometry under a built group. */
export function disposeBuilt(built: THREE.Object3D): void {
  built.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh) mesh.geometry.dispose();
  });
}
