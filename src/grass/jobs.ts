/** Which job a field needs next, and what finishing one does to its window. */
import type * as THREE from 'three';
import type { Field, Job, Layer } from './layers.ts';

/** Where the field wants its window: centred on the camera's point of the plane. */
export const targetOf = (field: Field, at: THREE.Vector3): [number, number] => targetAt(field, at.x, at.z);

const targetAt = (field: Field, x: number, z: number): [number, number] => [
  Math.floor(x / field.texel) - field.size / 2,
  Math.floor(z / field.texel) - field.size / 2,
];

/** The most a fill is laid ahead of the camera, as a share of its window's width. */
const LEAD_SHARE = 0.75;

/**
 * Where a fill lays the window for a camera at `at` moving at `motion`
 * (units a second, in the plane): ahead by as long as the field's last fill
 * took, so a fill laid while the camera runs on is round it once it stands.
 */
function leadOf(field: Field, at: THREE.Vector3, motion: THREE.Vector3): [number, number] {
  let dx = motion.x * field.fillSeconds;
  let dz = motion.z * field.fillSeconds;
  const cap = field.size * field.texel * LEAD_SHARE;
  const length = Math.hypot(dx, dz);
  if (length > cap) {
    dx *= cap / length;
    dz *= cap / length;
  }
  return targetAt(field, at.x + dx, at.z + dz);
}

export function publish(field: Field): void {
  field.dataTexture.needsUpdate = true;
  field.paintTexture.needsUpdate = true;
  field.window.set(field.i0, field.j0, field.texel, field.valid ? field.size : 0);
}

/**
 * The job this field needs next, if any, for a camera at `at` in its layer's
 * plane, moving at `motion`. A window that still overlaps where it is wanted
 * is moved a line at a time and stays on the screen meanwhile (where the
 * camera has run past its edge the shader reads the coarser field); only one
 * left wholly behind is filled again, ahead of the camera (`leadOf`), which
 * takes it off the screen until it is whole.
 */
export function jobFor(layer: Layer, field: Field, at: THREE.Vector3, motion: THREE.Vector3, urgentOnly: boolean): Job | null {
  const [ti, tj] = targetOf(field, at);
  const n = field.size;
  const make = (kind: Job['kind'], i0: number, i1: number, j0: number, j1: number): Job => ({ layer, field, i0, i1, j0, j1, done: 0, kind, gathered: -1, made: performance.now() });
  if (!field.valid || Math.abs(ti - field.i0) >= n || Math.abs(tj - field.j0) >= n) {
    const [fi, fj] = leadOf(field, at, motion);
    field.valid = false;
    field.dirty.length = 0;
    field.i0 = fi;
    field.j0 = fj;
    field.window.w = 0;
    return make('fill', fi, fi + n, fj, fj + n);
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
      field.fillSeconds = (performance.now() - job.made) / 1000;
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
