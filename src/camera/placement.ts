/**
 * Where the camera sits and what it looks at: the orbit round the pivot, the ground and the walls kept out of the lens, and the roll.
 */
import * as THREE from 'three';
import {
  CLEARANCE,
  NEAR_CLEAR,
  GRASS_CLEAR,
  GROUND_RISE,
  COLLISION_STEPS,
  LENS_ROOM,
  MAX_ELEVATION,
  MAX_ELEVATION_RIDING,
  MIN_DISTANCE,
  MIN_ELEVATION,
  MIN_ELEVATION_RIDING,
  ROLL_FADE_FROM,
  ROLL_FADE_TO,
  SHOULDER,
  WALL_FLOOR,
  WALL_MARGIN,
  WALL_REFINE,
} from './constants.ts';
import { pivotHeight, ramp, seated } from './math.ts';
import type { CameraSubject } from './types.ts';
import type { CameraCore } from './core.ts';

export function createPlacement(core: CameraCore) {
  const { blocks, camera, desired, heading, look, offset, orbit, pivot, right, sample, target, view } = core;
  const s = core.fields;

  /**
   * Where the camera wants to be, before any interpolation or collision. On foot
   * `follow` hands in the pivot it has smoothed (`orbit`), because on foot the chase
   * is on the pivot and the orbit round it is exact. Pitch tilts the whole offset
   * about the camera's right axis, clamped against the framing's own elevation, so
   * `view.height = 30000` arrives at the ceiling instead of overshooting the pole.
   */
  function place(player: CameraSubject, smoothed = false): void {
    if (smoothed) pivot.copy(orbit);
    else pivot.copy(player.position).addScaledVector(player.up, pivotHeight(player));

    // `view` sets the framing; pitch tilts that whole offset about the camera's
    // right axis, so the distance is preserved and only the elevation moves. The
    // clamp is against the framing's own elevation.
    const ceiling = seated(player) ? MAX_ELEVATION_RIDING : MAX_ELEVATION;
    const base = Math.atan2(view.height, view.distance);
    const floor = seated(player) ? MIN_ELEVATION_RIDING : MIN_ELEVATION;
    s.pitch = Math.min(Math.max(s.pitch, Math.min(floor, base) - base), ceiling - base);

    right.crossVectors(heading, player.up).normalize();
    offset.copy(player.up).multiplyScalar(view.height).addScaledVector(heading, -view.distance);
    // Negative: a positive rotation about the right axis would drop the camera.
    offset.applyAxisAngle(right, -s.pitch);
    desired.copy(pivot).add(offset);
    // Camera and aim moved right together: see `SHOULDER`.
    const framed = seated(player) ? 0 : 1 - ramp(s.zoom, 2, 5);
    desired.addScaledVector(right, SHOULDER * framed);
    target.copy(pivot).addScaledVector(right, SHOULDER * framed);
  }

  /**
   * Keeps the ground out of the lens, and reports how far it had to lift the
   * camera to do it. The lift comes first and the pull-in second: lifting first means
   * the segment test only fires on something genuinely in the way.
   */
  function unclip(point: THREE.Vector3, groundRadiusAt: (p: THREE.Vector3) => number, walls: boolean): number {
    let lift = 0;
    // The near plane's corners stand off the lens too, and a slope reaches them first.
    const clearance = Math.max(CLEARANCE, GRASS_CLEAR, camera.near * NEAR_CLEAR);
    const floor = groundRadiusAt(point) + clearance;
    if (point.length() < floor) {
      lift = floor - point.length();
      point.setLength(floor);
    }
    // A rise between the pivot and the lens lifts the lens over it, as far as
    // `GROUND_RISE` of its distance, before it would pull it in: looking down
    // over a crest shows the land, low in the grass shows nothing.
    offset.copy(point).sub(pivot);
    const reach = offset.length();
    if (reach > MIN_DISTANCE) {
      let need = 0;
      for (let i = 1; i < COLLISION_STEPS; i++) {
        const t = i / COLLISION_STEPS;
        sample.copy(pivot).addScaledVector(offset, t);
        need = Math.max(need, (groundRadiusAt(sample) + clearance * t - sample.length()) / t);
      }
      need = Math.min(need, reach * GROUND_RISE);
      if (need > 0) {
        sample.copy(pivot).normalize();
        // Not added to `lift`: the lens looks down at the player over the rise.
        point.addScaledVector(sample, need);
      }
    }

    offset.copy(point).sub(pivot);
    const distance = offset.length();
    // The ground only ever pulls the lens in to `MIN_DISTANCE`, so a lens
    // already nearer than that has nothing to fear from it. From a wall it has.
    const ground = distance > MIN_DISTANCE;
    const reachable = walls && distance > WALL_FLOOR ? blocks : undefined;
    // Seen through, a wall in between is dissolved rather than stepped in front of.
    const wall = core.seesThrough ? undefined : reachable;
    if (!ground && wall === undefined) {
      if (reachable !== undefined && core.seesThrough) outOfWalls(point, reachable);
      return lift;
    }
    offset.divideScalar(distance);
    let allowed = distance;
    let least = MIN_DISTANCE;
    for (let i = 1; i <= COLLISION_STEPS; i++) {
      const t = i / COLLISION_STEPS;
      sample.copy(pivot).addScaledVector(offset, t * distance);
      // The margin grows from nothing at the pivot to the full lens clearance
      // at the far end; full clearance the whole way would read every low
      // camera as blocked.
      if (ground && sample.length() < groundRadiusAt(sample) + clearance * t) {
        allowed = ((i - 1) / COLLISION_STEPS) * distance;
        break;
      }
      if (wall !== undefined && wall(sample)) {
        allowed = wallAt(((i - 1) / COLLISION_STEPS) * distance, t * distance, wall) - WALL_MARGIN;
        least = WALL_FLOOR;
        break;
      }
    }
    if (allowed < distance) point.copy(pivot).addScaledVector(offset, Math.max(least, allowed));
    if (reachable !== undefined && core.seesThrough && point.distanceTo(pivot) > WALL_FLOOR) outOfWalls(point, reachable);
    return lift;
  }

  /**
   * Seen through: brings the lens back towards the pivot only while the lens
   * itself, or the room just past it for the near plane, is inside a wall,
   * to the near side of that wall. What lies between is left to `see-through.ts`.
   */
  function outOfWalls(point: THREE.Vector3, wall: (point: THREE.Vector3) => boolean): void {
    offset.copy(point).sub(pivot);
    const distance = offset.length();
    if (distance < 1e-6) return;
    offset.divideScalar(distance);
    const far = distance + LENS_ROOM;
    sample.copy(pivot).addScaledVector(offset, far);
    if (!wall(sample) && !wall(point)) return;
    // Walk in from the lens to the first clear sample; the wall's face lies between it and the last blocked one.
    let clear = 0;
    let blocked = far;
    for (let i = COLLISION_STEPS - 1; i >= 0; i--) {
      const d = (i / COLLISION_STEPS) * far;
      sample.copy(pivot).addScaledVector(offset, d);
      if (!wall(sample)) {
        clear = d;
        break;
      }
      blocked = d;
    }
    const face = wallAt(clear, blocked, wall);
    const allowed = Math.max(WALL_FLOOR, face - LENS_ROOM - WALL_MARGIN);
    if (allowed < distance) point.copy(pivot).addScaledVector(offset, allowed);
  }

  /**
   * Where the segment along `offset` goes into a building, between a distance that
   * was clear and one that was not: the clear side, after `WALL_REFINE` halvings.
   */
  function wallAt(clear: number, blocked: number, wall: (point: THREE.Vector3) => boolean): number {
    for (let k = 0; k < WALL_REFINE; k++) {
      const middle = (clear + blocked) / 2;
      sample.copy(pivot).addScaledVector(offset, middle);
      if (wall(sample)) blocked = middle;
      else clear = middle;
    }
    return clear;
  }

  /**
   * What the camera looks at, once the ground has had its say. Raising the target
   * by exactly what the ground raised the camera keeps the view at the angle the
   * player asked for. The roll is chosen rather than inferred: `camera.up` follows
   * the surface normal, and straight down it fades to the heading, which puts the
   * direction of travel at the top of the screen.
   */
  function aimAt(player: CameraSubject, lift: number): void {
    sample.copy(target).addScaledVector(player.up, lift);

    // The roll, chosen rather than inferred. `camera.up` follows the surface
    // normal, but straight down the normal is the view direction and there is no
    // roll left in it. Fading to the heading there keeps the frame stable and
    // puts the direction of travel at the top of the screen.
    look.subVectors(sample, camera.position);
    const length = look.length();
    const rise = length > 1e-6 ? look.dot(player.up) / length : 0;
    // Looking up, the heading is at the bottom of the screen, so the roll fades to its opposite.
    camera.up.copy(heading).multiplyScalar(rise > 0 ? -1 : 1)
      .lerp(player.up, 1 - ramp(Math.abs(rise), ROLL_FADE_FROM, ROLL_FADE_TO)).normalize();
    camera.lookAt(sample);
  }

  return { place, unclip, aimAt };
}

export type Placement = ReturnType<typeof createPlacement>;
