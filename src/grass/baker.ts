/** Baking a layer's fields texel by texel, one job at a time, inside the frame's building allowance. */
import * as THREE from 'three';
import { mayBuild } from '../view.ts';
import type { GrassGround, GrassSite } from '../vegetation.ts';
import { GRASS_SPREAD, TEXEL_BATCH } from './types.ts';
import type { GrassStats } from './types.ts';
import { finish, jobFor, targetOf } from './jobs.ts';
import { directionIn } from './layers.ts';
import type { Field, Job, Layer, Layers } from './layers.ts';

export interface Baker {
  /**
   * Works each field's job in order until the allowance is spent or none is
   * left. `at` is the camera in each layer's plane, `motion` its velocity there.
   */
  run(began: number, allowance: number, at: PerLayer, motion: PerLayer): void;
  /** Texels of work queued: fills, lines entering and patches. */
  pending(): number;
  /** Forgets the jobs under way on `layer`'s fields. */
  dropJobOf(layer: Layer): void;
  /** Forgets every job under way. */
  reset(): void;
  /** A patch under way was asked of the old answer: queue it again. */
  restartPatch(): void;
}

/** A point or a velocity in each layer's plane. */
export interface PerLayer {
  front: THREE.Vector3;
  back: THREE.Vector3;
}

export function createBaker(ground: GrassGround, R: number, layers: Layers, stats: GrassStats): Baker {
  const site: GrassSite = { radius: 0, density: 0, r: 0, g: 0, b: 0, dry: 0, height: 1, edge: 0 };
  const texelDirection = new THREE.Vector3();
  const gatherDirection = new THREE.Vector3();
  const srgb = new THREE.Color();
  /** Bumped at every gather, so a job resumed after another's knows to gather again. */
  let gatherCount = 0;
  /** The job each field has under way: one a field, so a line the camera needs never waits behind another field's fill. */
  const jobs = new Map<Field, Job>();
  /** The fields whose land was not gathered yet this run: asked again next frame, not twice in one. */
  const waited: Field[] = [];
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
    // The ground goes on here, grass or none: its height is laid between, and
    // past 1 how far it goes on (`GrassSite.edge`), which the blades stop at.
    field.data[slot + 3] = 1 + Math.max(0, found.edge);
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

  /** Works on `job` until it is whole (`done`), the frame's allowance is spent (`spent`) or the land is not gathered under it yet (`waiting`). */
  function work(job: Job, began: number, allowance: number): 'done' | 'spent' | 'waiting' {
    const field = job.field;
    const width = job.i1 - job.i0;
    const height = job.j1 - job.j0;
    const total = width * height;
    if (!mayBuild(began, allowance, true)) return 'spent';
    if (job.gathered !== gatherCount || job.gathered < 0) {
      const cx = ((job.i0 + job.i1) * 0.5) * field.texel;
      const cz = ((job.j0 + job.j1) * 0.5) * field.texel;
      directionIn(job.layer.frame, cx, cz, gatherDirection);
      ground.gather(gatherDirection, Math.hypot(width, height) * field.texel * 0.5 + field.texel * 2);
      job.gathered = ++gatherCount;
    }
    while (job.done < total) {
      if (!mayBuild(began, allowance, true)) return 'spent';
      const stop = Math.min(total, job.done + TEXEL_BATCH);
      const start = performance.now();
      const from = job.done;
      for (; job.done < stop; job.done++) {
        const I = job.i0 + Math.floor(job.done / height);
        const J = job.j0 + (job.done % height);
        if (!bakeTexel(job.layer, field, I, J)) {
          // The land index is not round here yet: wait for it rather than bake the sea.
          account(job.done - from, start);
          return 'waiting';
        }
      }
      account(job.done - from, start);
    }
    finish(job);
    return 'done';
  }

  /** Gives a patch under way back to its field's dirty list. */
  function requeue(job: Job): void {
    if (job.kind === 'patch') job.field.dirty.unshift([job.i0, job.i1, job.j0, job.j1]);
  }

  /**
   * The job a field has under way, if the camera at `at` still wants it: a
   * fill whose window still overlaps where the field is wanted, a line or a
   * patch of a window not yet left wholly behind. One that is not is
   * forgotten, so nothing pinned to where the camera was can hold the bake.
   */
  function underWay(field: Field, at: THREE.Vector3): Job | null {
    const job = jobs.get(field);
    if (job === undefined) return null;
    const [ti, tj] = targetOf(field, at);
    const n = field.size;
    const wanted =
      job.kind === 'fill'
        ? !field.valid && Math.abs(ti - job.i0) < n && Math.abs(tj - job.j0) < n
        : field.valid && Math.abs(ti - field.i0) < n && Math.abs(tj - field.j0) < n;
    if (wanted) return job;
    requeue(job);
    jobs.delete(field);
    return null;
  }

  /**
   * The order fields are served in: each anchored layer's coarse field before
   * any fine one, because the coarse one stands under every ring and a fine
   * one the camera outruns is filled again and again; the shown layer's lines
   * first; then the fine fields; then what a changed floor dirtied.
   */
  function order(): [Layer, Field, 'front' | 'back', boolean][] {
    const { front, back } = layers;
    const list: [Layer, Field, 'front' | 'back', boolean][] = [];
    if (front.anchored) list.push([front, front.coarse, 'front', true]);
    if (back.anchored) list.push([back, back.coarse, 'back', true]);
    if (front.anchored) list.push([front, front.fine, 'front', true]);
    if (back.anchored) list.push([back, back.fine, 'back', true]);
    if (front.anchored) list.push([front, front.coarse, 'front', false], [front, front.fine, 'front', false]);
    if (back.anchored) list.push([back, back.coarse, 'back', false], [back, back.fine, 'back', false]);
    return list;
  }

  return {
    run(began, allowance, at, motion) {
      waited.length = 0;
      for (const [layer, field, which, urgent] of order()) {
        if (waited.includes(field)) continue;
        const point = at[which];
        for (;;) {
          let job = underWay(field, point);
          if (job !== null && urgent && job.kind === 'patch') {
            // The lines come before a patch, which goes back on the list while they move the window.
            const line = jobFor(layer, field, point, motion[which], true);
            if (line === null) break;
            requeue(job);
            job = line;
          }
          job ??= jobFor(layer, field, point, motion[which], urgent);
          if (job === null) break;
          jobs.set(field, job);
          const state = work(job, began, allowance);
          if (state === 'spent') return;
          if (state === 'waiting') {
            waited.push(field);
            break;
          }
          jobs.delete(field);
        }
      }
    },

    pending() {
      let count = 0;
      for (const layer of [layers.front, layers.back]) {
        if (!layer.anchored) continue;
        for (const field of [layer.fine, layer.coarse]) {
          const job = jobs.get(field);
          // A fill under way is counted by what it has left.
          if (!field.valid && job?.kind !== 'fill') count += field.size * field.size;
          for (const [i0, i1, j0, j1] of field.dirty) count += (i1! - i0!) * (j1! - j0!);
          if (job !== undefined) count += (job.i1 - job.i0) * (job.j1 - job.j0) - job.done;
        }
      }
      return count;
    },

    dropJobOf(layer) {
      jobs.delete(layer.fine);
      jobs.delete(layer.coarse);
    },

    reset() {
      jobs.clear();
    },

    restartPatch() {
      for (const [field, job] of jobs) {
        if (job.kind !== 'patch') continue;
        requeue(job);
        jobs.delete(field);
      }
    },
  };
}
