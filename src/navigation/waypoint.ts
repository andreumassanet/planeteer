import type * as THREE from 'three';
import type { Hud } from '../hud.ts';

/**
 * How far inside the viewport an off-screen marker is pinned, CSS px: enough
 * for the pin and a short label (the HUD slides a longer one along).
 */
const MARKER_MARGIN = 84;

/**
 * Puts the marker on screen. If the destination is on the near side of the
 * planet the marker sits over it. If the planet is in the way, the point
 * projected is the horizon crossing on the great circle towards it, which is
 * where the destination genuinely is as far as the eye can follow; it is
 * marked there when that is in the frame, and clamped to the screen edge with
 * its tip pointing on when it is not.
 */
export function placeWaypoint(
hud: Hud,
camera: THREE.PerspectiveCamera,
km: number | null,
radius: number,
site: THREE.Vector3,
floating: THREE.Vector3,
scratch: THREE.Vector3,
): void {
  const cam = camera.position;
  const length = cam.length();
  if (length < 1e-6) return;
  const cx = cam.x / length;
  const cy = cam.y / length;
  const cz = cam.z / length;
  // Clamped so a camera grazing the surface still has a horizon to speak of.
  const cosHorizon = radius / Math.max(length, radius + 1);

  const tx = site.x;
  const ty = site.y;
  const tz = site.z;
  const dot = tx * cx + ty * cy + tz * cz;

  if (dot >= cosHorizon) {
    scratch.copy(floating);
  } else {
    // Tangent of the great circle at the camera's subpoint, pointing at the
    // destination. Undefined at the exact antipode, where no direction is more
    // right than any other; drop the marker rather than invent one.
    let ax = tx - dot * cx;
    let ay = ty - dot * cy;
    let az = tz - dot * cz;
    const along = Math.hypot(ax, ay, az);
    if (along < 1e-6) {
      hud.trackDestination(km, null, 0, 0);
      return;
    }
    ax /= along;
    ay /= along;
    az /= along;
    const phi = Math.acos(Math.min(1, cosHorizon));
    const c = Math.cos(phi);
    const s = Math.sin(phi);
    scratch.set(cx * c + ax * s, cy * c + ay * s, cz * c + az * s).multiplyScalar(radius);
  }

  // The rig moves the camera every frame but only the render updates its
  // matrices, and this runs before the render: without this the marker trails
  // the view by a frame, which at 3,400 units a second is visible.
  camera.updateMatrixWorld();
  scratch.project(camera);
  // Behind the camera the perspective divide is by a negative w, which flips
  // both axes. Flipping them back leaves a direction that is still correct,
  // which is all a clamped marker needs.
  const behind = scratch.z > 1;
  const width = innerWidth;
  const height = innerHeight;
  let x = (scratch.x * 0.5 + 0.5) * width;
  let y = (0.5 - scratch.y * 0.5) * height;
  if (behind) {
    x = width - x;
    y = height - y;
  }

  // A horizon point in the frame is marked where it is, which is where the
  // destination lies beyond; the tip points down at it, as it points down at
  // the ground when the landmark is in sight.
  const inside = !behind
    && x >= MARKER_MARGIN && x <= width - MARKER_MARGIN
    && y >= MARKER_MARGIN && y <= height - MARKER_MARGIN;
  if (inside) {
    hud.trackDestination(km, x, y, Math.PI / 2);
    return;
  }

  const midX = width / 2;
  const midY = height / 2;
  let dx = x - midX;
  let dy = y - midY;
  if (Math.abs(dx) < 1e-4 && Math.abs(dy) < 1e-4) {
    dx = 0;
    dy = 1;
  }
  const halfW = Math.max(1, midX - MARKER_MARGIN);
  const halfH = Math.max(1, midY - MARKER_MARGIN);
  const reach = Math.min(halfW / Math.max(Math.abs(dx), 1e-6), halfH / Math.max(Math.abs(dy), 1e-6));
  hud.trackDestination(km, midX + dx * reach, midY + dy * reach, Math.atan2(dy, dx));
}
