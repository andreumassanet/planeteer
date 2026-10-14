import * as THREE from 'three';
import {
  EDGE_BOTTOM, EDGE_TOP, EDGE_X, HERE_SCALE, LIMB_FADE, MAX_LABELS, MIN_COUNTRY_PIXELS,
} from './constants.ts';
import type { Label, Placed } from './labels.ts';

/**
 * Chooses which names are drawn each frame, over arrays made once. A name is
 * a candidate when it is in front of the camera, inside the viewport, on the
 * near side of the horizon and wide enough on the screen; the nearest the
 * middle go first (the country under the player ahead of all), and a name that
 * lands on a kept one is dropped.
 */
export function createPlacer(labels: readonly Label[], radius: number): {
  kept: Placed[];
  candidates: number;
  place(fade: number, camera: THREE.PerspectiveCamera, here: number, width: number, height: number): void;
} {
  const viewProjection = new THREE.Matrix4();
  const point = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const eye = new THREE.Vector3();
  // One slot per country, made once: a cap in country order would stop the
  // loop before it reached the country the player is standing in.
  const blank: Label = { text: '', point: new THREE.Vector3(), size: 0, span: 0, id: -1, radius };
  const found: Placed[] = [];
  for (let i = 0; i < labels.length; i++) {
    found.push({ label: blank, x: 0, y: 0, size: 0, opacity: 0, width: 0 });
  }
  const order: Placed[] = [];
  const kept: Placed[] = [];

  const placer = {
    kept,
    candidates: 0,
    place(fade: number, camera: THREE.PerspectiveCamera, here: number, width: number, height: number): void {
      const halfW = width / 2;
      const halfH = height / 2;
      camera.getWorldPosition(eye);
      camera.getWorldDirection(forward);
      const eyeLength = Math.max(eye.length(), 1);
      // Pixels across a world unit one unit from the lens: element 5 of a
      // perspective matrix is `1 / tan(fov / 2)`.
      const perUnit = camera.projectionMatrix.elements[5]! * halfH;
      // The horizon, as a cosine: a point is on the near side when its own up
      // and the eye's are within `acos(R / |eye|)` of each other.
      const cosHorizon = radius / eyeLength;
      viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);

      let count = 0;
      for (const label of labels) {
        const facing = label.point.dot(eye) / eyeLength;
        const over = facing - cosHorizon;
        if (over <= 0) continue;
        point.copy(label.point).multiplyScalar(label.radius);
        const ax = point.x - eye.x;
        const ay = point.y - eye.y;
        const az = point.z - eye.z;
        if (ax * forward.x + ay * forward.y + az * forward.z <= 0) continue;
        // Big enough on the screen to be worth naming, at the range it is at.
        const range = Math.sqrt(ax * ax + ay * ay + az * az);
        if (label.id !== here && (label.span * perUnit) / range < MIN_COUNTRY_PIXELS) continue;
        point.applyMatrix4(viewProjection);
        const x = halfW + point.x * halfW;
        const y = halfH - point.y * halfH;
        if (x < EDGE_X || x > width - EDGE_X || y < EDGE_TOP || y > height - EDGE_BOTTOM) continue;

        const size = label.size * (label.id === here ? HERE_SCALE : 1);
        const slot = found[count]!;
        slot.label = label;
        slot.x = x;
        slot.y = y;
        slot.size = size;
        slot.opacity = fade * Math.min(1, over / LIMB_FADE);
        // Close enough for a collision test on a proportional face: about 0.65
        // em of advance a character plus the tracking, and six pixels for the
        // ink stroke either side. It errs wide, which keeps two names apart.
        slot.width = label.text.length * size * 0.7 + 6;
        count++;
      }
      placer.candidates = count;

      // Nearest the middle of the screen first.
      const middle = (p: Placed): number =>
        (p.x - halfW) * (p.x - halfW) +
        (p.y - halfH) * (p.y - halfH) -
        (p.label.id === here ? width * width : 0);
      order.length = 0;
      for (let i = 0; i < count; i++) order.push(found[i]!);
      order.sort((a, b) => middle(a) - middle(b));

      kept.length = 0;
      for (const candidate of order) {
        if (kept.length >= MAX_LABELS) break;
        // A name that lands on a name is one name nobody can read. The boxes
        // are half-extents around the anchor, which is the middle of the text.
        let clear = true;
        for (const other of kept) {
          if (
            Math.abs(candidate.x - other.x) < (candidate.width + other.width) / 2 &&
            Math.abs(candidate.y - other.y) < (candidate.size + other.size) * 0.7
          ) {
            clear = false;
            break;
          }
        }
        if (clear) kept.push(candidate);
      }
    },
  };
  return placer;
}
