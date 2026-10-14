import * as THREE from 'three';
import { frameOpenFor } from '../view.ts';
import { animate } from './animate.ts';
import { dress, release } from './pose.ts';
import { DRESS_PER_FRAME, NEAR_ANIMATION, TOWNSFOLK_CAP, TOWNSFOLK_RADIUS, byDistance, type TownsfolkState } from './standing.ts';
import { place } from './stroll.ts';

export function update(st: TownsfolkState, viewer: THREE.Vector3, dt: number, clock: number, frame: number): void {
  if (!st.folk.ready) return;
  st.viewerAt = viewer;
  st.now = clock;
  // Every frame on foot, so nothing here allocates: the anchors are the
  // settlements' own objects, the list and the set are reused, and a map
  // may drop the entry it is visiting.
  st.anchors.length = 0;
  st.source.folkNear(viewer, TOWNSFOLK_RADIUS, st.anchors);
  st.anchors.sort(byDistance);
  if (st.anchors.length > TOWNSFOLK_CAP) st.anchors.length = TOWNSFOLK_CAP;
  const wanted = st.anchors;
  st.keep.clear();
  for (const anchor of wanted) st.keep.add(anchor.key);
  // Whoever is being talked to is kept, whatever the ranking says.
  if (st.heldKey !== null && st.standing.has(st.heldKey)) st.keep.add(st.heldKey);
  for (const [key, entry] of st.standing) if (!st.keep.has(key)) release(st, entry);

  let dressed = 0;
  st.stats.animated = 0;
  st.stats.strolling = 0;
  st.stats.nearestMoving = Infinity;
  for (const anchor of wanted) {
    let entry = st.standing.get(anchor.key);
    if (entry === undefined) {
      // A few a frame, and only while the frame has room (`view.ts`).
      if (dressed >= DRESS_PER_FRAME || !frameOpenFor(dressed, true)) continue;
      const made = dress(st, anchor, clock);
      if (made === null) continue;
      entry = made;
      st.standing.set(anchor.key, entry);
      dressed++;
    }
    // The settlements hand out the same anchor objects while a town
    // stands; a rebuilt town hands out new ones for the same key, and
    // the person moves onto it.
    if (entry.anchor !== anchor) {
      entry.anchor = anchor;
      entry.length = anchor.from.distanceTo(anchor.to);
      // Its facing and its stretch read again, off the new anchor.
      st.local.set(0, 0, 1).applyQuaternion(anchor.quaternion).applyQuaternion(st.inverse.copy(anchor.town).invert());
      entry.restYaw = Math.atan2(st.local.x, st.local.z);
      st.local.copy(anchor.to).sub(anchor.from).applyQuaternion(st.inverse);
      entry.strollYaw = Math.atan2(st.local.x, st.local.z);
      if (entry.mode === 'stroll' && entry.length <= 1) entry.mode = 'stand';
      if (entry.mode === 'stroll') entry.position.lerpVectors(anchor.from, anchor.to, entry.along);
      else entry.position.copy(anchor.position);
      place(st, entry);
    }
    // Near people move every frame; far ones catch up every fourth, with the
    // time they missed, so a far square is not slower, only coarser.
    entry.owed += dt;
    const near = anchor.distance < NEAR_ANIMATION;
    const stride = near || entry.held ? 1 : 4;
    if ((frame + entry.lane) % stride === 0) {
      animate(st, entry, entry.owed, clock, near);
      entry.owed = 0;
      st.stats.animated++;
    }
    if (entry.walking > 0) st.stats.strolling++;
    if (entry.gesture !== null || entry.walking > 0 || entry.talking > 0) {
      st.stats.nearestMoving = Math.min(st.stats.nearestMoving, entry.position.distanceTo(viewer));
    }
  }
  st.stats.standing = st.standing.size;
}
