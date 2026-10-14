import type * as THREE from 'three';
import { setFrame } from '../cartography.ts';
import { JUMP, MAX_FPS, MIN_SHIFT, MIN_TURN, SPEED_EASE, ZOOM_TIME } from './constants.ts';
import { draw } from './draw.ts';
import type { MinimapState } from './state.ts';
import type { MinimapHere } from './types.ts';
import { SPEED_VIEW, LOCAL_VIEW, SKY_LIMIT } from './constants.ts';

const interval = 1000 / MAX_FPS;

export function framing(m: MinimapState, position: THREE.Vector3): number {
  const { RADIUS, CEILING, minAngle, maxAngle } = m;
  const angle = Math.min(maxAngle, Math.max(minAngle, (LOCAL_VIEW + m.speed * SPEED_VIEW) / RADIUS));
  const altitude = position.length() - RADIUS - CEILING;
  if (altitude > 0) return Math.min(SKY_LIMIT, Math.max(angle, Math.acos(RADIUS / (RADIUS + altitude))));
  return Math.min(SKY_LIMIT, angle);
}

/** Every frame: tracks the player, eases the zoom, and decides whether the paper or the overlay needs redrawing. */
export function updateMinimap(
  m: MinimapState,
  position: THREE.Vector3,
  forward: THREE.Vector3,
  here?: MinimapHere,
  look?: THREE.Vector3,
): void {
  const { settings, discRadius, frame, north, lastPosition, markerPoint, samples } = m;
  const began = performance.now();
  const dt = m.previousAt === 0 ? 0 : Math.min(0.1, (began - m.previousAt) / 1000);
  m.previousAt = began;
  if (here !== undefined) {
    if (here.country !== m.country) m.baseStale = true;
    m.country = here.country;
    m.nearby = here.place;
  }

  // The paper turns with the camera: what is ahead on the screen is up.
  // The pole is where the frame falls back to, where the camera looks
  // straight down and has no heading of its own.
  const length = Math.hypot(position.x, position.y, position.z) || 1;
  const along = position.y / length;
  north.x = (-along * position.x) / length;
  north.y = 1 - along * along;
  north.z = (-along * position.z) / length;
  if (!setFrame(frame, position, look ?? forward) && !setFrame(frame, position, north)) return;
  // How fast, smoothed, for the zoom: the ground covered since last time.
  // A jump (a teleport, a respawn) is not a speed: more than `JUMP` in one
  // update is left out.
  const step = Math.hypot(position.x - lastPosition.x, position.y - lastPosition.y, position.z - lastPosition.z);
  if (dt > 0 && m.hasLast && step < JUMP) m.speed += (Math.min(400, step / dt) - m.speed) * (1 - Math.exp(-dt / SPEED_EASE));
  lastPosition.x = position.x;
  lastPosition.y = position.y;
  lastPosition.z = position.z;
  m.hasLast = true;
  m.ux = frame.ux;
  m.uy = frame.uy;
  m.uz = frame.uz;
  m.fx = frame.fx;
  m.fy = frame.fy;
  m.fz = frame.fz;
  m.rx = frame.rx;
  m.ry = frame.ry;
  m.rz = frame.rz;

  // The zoom is eased geometrically rather than linearly, because a zoom is
  // a ratio: 300 to 4,000 and 4,000 to 300 then take the same time and read
  // as the same movement, which they do not if the step is in radians.
  const target = framing(m, position);
  if (Math.abs(Math.log(target / m.view)) > 0.003) {
    const k = dt <= 0 ? 1 : 1 - Math.exp(-dt / ZOOM_TIME);
    m.view *= (target / m.view) ** k;
    m.scale = discRadius / Math.sin(m.view);
    m.baseStale = true;
  }

  m.heading = Math.atan2(
    forward.x * m.rx + forward.y * m.ry + forward.z * m.rz,
    forward.x * m.fx + forward.y * m.fy + forward.z * m.fz,
  );
  // Where north is on the paper, for the `N` on the rim.
  const northTurn = Math.atan2(north.x * m.rx + north.y * m.ry + north.z * m.rz, north.x * m.fx + north.y * m.fy + north.z * m.fz);
  if (Math.abs(Math.atan2(Math.sin(northTurn - m.northAngle), Math.cos(northTurn - m.northAngle))) > MIN_TURN) m.baseStale = true;
  m.northAngle = northTurn;

  // Every frame, throttle or no throttle: the wedge reads it.
  if (m.marked) {
    const { x: mx, y: my, z: mz } = markerPoint;
    m.targetAngle = Math.acos(Math.min(1, Math.max(-1, mx * m.ux + my * m.uy + mz * m.uz)));
    m.targetScreen = Math.atan2(
      mx * m.rx + my * m.ry + mz * m.rz,
      mx * m.fx + my * m.fy + mz * m.fz,
    );
  }

  // Moved far enough on *this* scale, and turned far enough to be worth
  // moving the arrow. The two are separate because they cost two different
  // things: the first rebuilds the land, the second copies a bitmap.
  const moved = Math.acos(Math.min(1, m.ux * m.lastUx + m.uy * m.lastUy + m.uz * m.lastUz));
  if (moved * m.scale > MIN_SHIFT) m.baseStale = true;
  // A pad still being worked out comes onto the paper at its next redraw,
  // and so does a tile painted since.
  if (m.padsWaiting) m.baseStale = true;
  if (settings.tiles !== undefined && settings.tiles.version !== m.tileVersion) m.baseStale = true;
  if (m.baseStale || Math.abs(m.heading - m.lastHeading) > MIN_TURN) m.overlayStale = true;

  if (m.overlayStale) {
    const now = performance.now();
    if (now - m.drawnAt >= interval) {
      m.drawnAt = now;
      m.overlayStale = false;
      m.lastUx = m.ux;
      m.lastUy = m.uy;
      m.lastUz = m.uz;
      m.lastHeading = m.heading;
      draw(m);
    }
  }

  samples[m.sampleAt] = performance.now() - began;
  m.sampleAt = (m.sampleAt + 1) % samples.length;
  if (m.sampleCount < samples.length) m.sampleCount++;
}
