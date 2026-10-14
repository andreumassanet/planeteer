/** Which job a field needs next, and what finishing one does to its window. */
import type * as THREE from 'three';
import type { Field, Job, Layer } from './layers.ts';

/** Where the field wants its window: centred on the camera's point of the plane. */
const targetOf = (field: Field, at: THREE.Vector3): [number, number] => [
  Math.floor(at.x / field.texel) - field.size / 2,
  Math.floor(at.z / field.texel) - field.size / 2,
];

export function publish(field: Field): void {
  field.dataTexture.needsUpdate = true;
  field.paintTexture.needsUpdate = true;
  field.window.set(field.i0, field.j0, field.texel, field.valid ? field.size : 0);
}

/** The job this field needs next, if any, for a camera at `at` in its layer's plane. */
export function jobFor(layer: Layer, field: Field, at: THREE.Vector3, urgentOnly: boolean): Job | null {
  const [ti, tj] = targetOf(field, at);
  const n = field.size;
  const make = (kind: Job['kind'], i0: number, i1: number, j0: number, j1: number): Job => ({ layer, field, i0, i1, j0, j1, done: 0, kind, gathered: -1 });
  if (!field.valid || Math.abs(ti - field.i0) >= n / 2 || Math.abs(tj - field.j0) >= n / 2) {
    field.valid = false;
    field.dirty.length = 0;
    field.i0 = ti;
    field.j0 = tj;
    field.window.w = 0;
    return make('fill', ti, ti + n, tj, tj + n);
  }
  const di = ti - field.i0;
  const dj = tj - field.j0;
  const lag = Math.max(Math.abs(di), Math.abs(dj));
  if (lag >= 2 || (lag === 1 && field.dirty.length === 0)) {
    if (Math.abs(di) >= Math.abs(dj)) {
      return di > 0
        ? make('shift-i+', field.i0 + n, field.i0 + n + 1, field.j0, field.j0 + n)
        : make('shift-i-', field.i0 - 1, field.i0, field.j0, field.j0 + n);
    }
    return dj > 0
      ? make('shift-j+', field.i0, field.i0 + n, field.j0 + n, field.j0 + n + 1)
      : make('shift-j-', field.i0, field.i0 + n, field.j0 - 1, field.j0);
  }
  if (urgentOnly) return null;
  while (field.dirty.length > 0) {
    const [a0, a1, b0, b1] = field.dirty.shift()!;
    const i0 = Math.max(a0!, field.i0);
    const i1 = Math.min(a1!, field.i0 + n);
    const j0 = Math.max(b0!, field.j0);
    const j1 = Math.min(b1!, field.j0 + n);
    if (i0 < i1 && j0 < j1) return make('patch', i0, i1, j0, j1);
  }
  return null;
}

export function finish(job: Job): void {
  const field = job.field;
  switch (job.kind) {
    case 'fill':
      field.valid = true;
      break;
    case 'shift-i+':
      field.i0++;
      break;
    case 'shift-i-':
      field.i0--;
      break;
    case 'shift-j+':
      field.j0++;
      break;
    case 'shift-j-':
      field.j0--;
      break;
    case 'patch':
      break;
  }
  publish(field);
}
