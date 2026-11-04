/**
 * A photo with a landmark well in it is a postcard: the landmark nearest the
 * middle of the frame, in front of the lens, near enough to fill some of it,
 * goes into the collection (`postcard` in `progress/events.ts`), once each.
 */
import * as THREE from 'three';
import { unitAt } from '../sphere.ts';
import type { App } from './context.ts';

/** How far a landmark may stand from the lens and still be a postcard, units, and how near is too near to be in the frame. */
const POSTCARD_FAR = 900;
const POSTCARD_NEAR = 12;
/** How far from the middle of the frame its foot and its top may be, as a share of the half frame. */
const FRAMED = 0.8;
/** How high over its foot a landmark is framed, as a share of its height in metres: its middle, roughly. */
const HEIGHT_SHARE = 0.5;

const foot = new THREE.Vector3();
const top = new THREE.Vector3();
const seen = new THREE.Vector3();

/** The landmark the photo just taken is a postcard of, or null. */
export function postcardIn(app: App): { id: string; name: string } | null {
  const camera = app.rig.camera;
  camera.updateMatrixWorld();
  let best: { id: string; name: string; off: number } | null = null;
  for (const placement of app.placements) {
    unitAt(placement.lat, placement.lon, foot);
    foot.multiplyScalar(app.groundAt(foot));
    const distance = foot.distanceTo(camera.position);
    if (distance > POSTCARD_FAR || distance < POSTCARD_NEAR) continue;
    const height = Math.max(8, (placement.height ?? 30) * HEIGHT_SHARE);
    top.copy(foot).addScaledVector(seen.copy(foot).normalize(), height);
    const a = foot.clone().project(camera);
    const b = top.project(camera);
    if (a.z > 1 || b.z > 1) continue;
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    if (Math.abs(midX) > FRAMED || Math.abs(midY) > FRAMED) continue;
    const off = Math.hypot(midX, midY);
    if (best === null || off < best.off) best = { id: placement.id, name: placement.name, off };
  }
  return best === null ? null : { id: best.id, name: best.name };
}
