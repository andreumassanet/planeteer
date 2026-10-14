/** Baking a layer's fields texel by texel, one job at a time, inside the frame's building allowance. */
import * as THREE from 'three';
import { mayBuild } from '../view.ts';
import type { GrassGround, GrassSite } from '../vegetation.ts';
import { GRASS_SPREAD, TEXEL_BATCH } from './types.ts';
import type { GrassStats } from './types.ts';
import { finish, jobFor } from './jobs.ts';
import { directionIn } from './layers.ts';
import type { Field, Job, Layer, Layers } from './layers.ts';

export interface Baker {
  /** Works jobs in order until the allowance is spent or none is left. `at` is the camera in each layer's plane. */
  run(began: number, allowance: number, at: { front: THREE.Vector3; back: THREE.Vector3 }): void;
  /** Texels of work queued: fills, lines entering and patches. */
  pending(): number;
  /** Forgets the job under way if it belongs to `layer`. */
  dropJobOf(layer: Layer): void;
  /** Forgets the job under way. */
  reset(): void;
  /** A patch under way was asked of the old answer: queue it again. */
  restartPatch(): void;
}

export function createBaker(ground: GrassGround, R: number, layers: Layers, stats: GrassStats): Baker {
  const site: GrassSite = { radius: 0, density: 0, r: 0, g: 0, b: 0, dry: 0, height: 1 };
  const texelDirection = new THREE.Vector3();
  const gatherDirection = new THREE.Vector3();
  const srgb = new THREE.Color();
  /** Bumped at every gather, so a job resumed after another's knows to gather again. */
  let gatherCount = 0;
  let current: Job | null = null;
  let totalMicroseconds = 0;

  /** Writes texel `(I, J)` of a field of a layer. False when the land is not gathered there yet. */
  function bakeTexel(layer: Layer, field: Field, I: number, J: number): boolean {
    const direction = directionIn(layer.frame, (I + 0.5) * field.texel, (J + 0.5) * field.texel, texelDirection);
    if (!ground.covers(direction)) return false;
    const found = ground.at(direction, site, field.texel * GRASS_SPREAD);
    const n = field.size;
    const slot = ((((J % n) + n) % n) * n + (((I % n) + n) % n)) * 4;
    if (found === null) {
      field.data[slot] = 0;
      field.data[slot + 1] = 0;
      field.data[slot + 2] = 0;
      field.data[slot + 3] = 0;
      field.paint[slot] = field.paint[slot + 1] = field.paint[slot + 2] = 0;
      field.paint[slot + 3] = 255;
      return true;
    }
    field.data[slot] = found.radius - R;
    field.data[slot + 1] = found.density;
    field.data[slot + 2] = found.dry;
    // The ground goes on here, grass or none: its height is laid between.
    field.data[slot + 3] = 1;
    srgb.setRGB(found.r, found.g, found.b).convertLinearToSRGB();
    field.paint[slot] = Math.round(Math.min(1, Math.max(0, srgb.r)) * 255);
    field.paint[slot + 1] = Math.round(Math.min(1, Math.max(0, srgb.g)) * 255);
    field.paint[slot + 2] = Math.round(Math.min(1, Math.max(0, srgb.b)) * 255);
    // How tall, of what the field grows: mown on a strip, trodden round a camp.
    field.paint[slot + 3] = Math.round(Math.min(1, Math.max(0, found.height)) * 255);
    return true;
  }

  function account(count: number, start: number): void {
    if (count <= 0) return;
    const took = (performance.now() - start) * 1000;
    stats.texels += count;
    totalMicroseconds += took;
    stats.microsecondsATexel = Number((totalMicroseconds / stats.texels).toFixed(2));
  }

  /** Works on `job` until it is whole or the frame's allowance is spent; true when whole. */
  function work(job: Job, began: number, allowance: number): boolean {
    const field = job.field;
    const width = job.i1 - job.i0;
    const height = job.j1 - job.j0;
    const total = width * height;
    if (job.gathered !== gatherCount || job.gathered < 0) {
      const cx = ((job.i0 + job.i1) * 0.5) * field.texel;
      const cz = ((job.j0 + job.j1) * 0.5) * field.texel;
      directionIn(job.layer.frame, cx, cz, gatherDirection);
      ground.gather(gatherDirection, Math.hypot(width, height) * field.texel * 0.5 + field.texel * 2);
      job.gathered = ++gatherCount;
    }
    while (job.done < total) {
      if (!mayBuild(began, allowance, true)) return false;
      const stop = Math.min(total, job.done + TEXEL_BATCH);
      const start = performance.now();
      const from = job.done;
      for (; job.done < stop; job.done++) {
        const I = job.i0 + Math.floor(job.done / height);
        const J = job.j0 + (job.done % height);
        if (!bakeTexel(job.layer, field, I, J)) {
          // The land index is not round here yet: wait for it rather than bake the sea.
          account(job.done - from, start);
          return false;
        }
      }
      account(job.done - from, start);
    }
    finish(job);
    return true;
  }

  /** Every job every field of a layer could want, the urgent first; the first it finds. */
  function nextJob(at: { front: THREE.Vector3; back: THREE.Vector3 }): Job | null {
    const { front, back } = layers;
    // The shown layer's lines first, while they keep up; then a layer being
    // laid round a new anchor; then what a changed floor dirtied.
    const order: [Layer, Field, THREE.Vector3, boolean][] = [];
    if (front.anchored) order.push([front, front.fine, at.front, true], [front, front.coarse, at.front, true]);
    if (back.anchored) order.push([back, back.fine, at.back, false], [back, back.coarse, at.back, false]);
    if (front.anchored) order.push([front, front.fine, at.front, false], [front, front.coarse, at.front, false]);
    for (const [layer, field, point, urgent] of order) {
      const job = jobFor(layer, field, point, urgent);
      if (job !== null) return job;
    }
    return null;
  }

  return {
    run(began, allowance, at) {
      for (;;) {
        if (current === null) current = nextJob(at);
        if (current === null) break;
        if (!work(current, began, allowance)) break;
        current = null;
      }
    },

    pending() {
      let count = 0;
      for (const layer of [layers.front, layers.back]) {
        if (!layer.anchored) continue;
        for (const field of [layer.fine, layer.coarse]) {
          // A fill under way is counted below, by what it has left.
          if (!field.valid && current?.field !== field) count += field.size * field.size;
          for (const [i0, i1, j0, j1] of field.dirty) count += (i1! - i0!) * (j1! - j0!);
        }
      }
      if (current !== null) count += (current.i1 - current.i0) * (current.j1 - current.j0) - current.done;
      return count;
    },

    dropJobOf(layer) {
      if (current !== null && current.layer === layer) current = null;
    },

    reset() {
      current = null;
    },

    restartPatch() {
      if (current !== null && current.kind === 'patch') {
        current.field.dirty.unshift([current.i0, current.i1, current.j0, current.j1]);
        current = null;
      }
    },
  };
}
