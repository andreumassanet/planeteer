/** The vehicles standing here as walls and obstacles: for the player, the traffic and the herds. */
import * as THREE from 'three';
import { PLANET_RADIUS } from '../globe.ts';
import { AVATAR_HEIGHT } from '../stature.ts';
import type { CraftModel } from '../craft/contract.ts';
import { BALLOON_WALL, HELI_WALL } from './limits.ts';
import { modelOfVehicle } from './models.ts';
import { isPose } from './pose.ts';
import type { FleetContext } from './state.ts';
import type { Fleet } from './types.ts';

/** A vehicle standing as a wall: the half-width and half-length of the box a body is pushed out of. */
function wallOf(model: CraftModel): [number, number] {
  const [length, width] = model.size;
  if (model.kind === 'balloon') return [width * BALLOON_WALL, length * BALLOON_WALL];
  if (model.kind === 'helicopter') return [width * HELI_WALL[0], length * HELI_WALL[1]];
  return [width / 2, length / 2];
}

export type Collision = Pick<Fleet, 'collide' | 'freeSpotNear' | 'eachStanding' | 'movedNear'>;

export function createCollision(ctx: FleetContext): Collision {
  const { models, link, drawn, up } = ctx;
  const localPoint = new THREE.Vector3();
  const free = new THREE.Vector3();
  const freePush = new THREE.Vector3();
  const inverse = new THREE.Quaternion();

  function collide(point: THREE.Vector3, radius: number, push: THREE.Vector3): boolean {
    push.set(0, 0, 0);
    let hit = false;
    for (const entry of drawn.values()) {
      const g = entry.group;
      const size = entry.model.size;
      const reach = Math.max(size[0], size[1]) / 2 + radius;
      localPoint.copy(point).sub(g.position);
      if (localPoint.lengthSq() > (reach + size[2]) * (reach + size[2])) continue;
      inverse.copy(g.quaternion).invert();
      localPoint.applyQuaternion(inverse);
      // Only at the vehicle's own height: a plane overhead is not a wall.
      if (localPoint.y < -AVATAR_HEIGHT || localPoint.y > size[2]) continue;
      const [hx, hz] = wallOf(entry.model);
      const cx = Math.max(-hx, Math.min(hx, localPoint.x));
      const cz = Math.max(-hz, Math.min(hz, localPoint.z));
      let dx = localPoint.x - cx;
      let dz = localPoint.z - cz;
      const d = Math.hypot(dx, dz);
      if (d >= radius) continue;
      if (d > 1e-9) {
        dx *= (radius - d) / d;
        dz *= (radius - d) / d;
      } else {
        // Inside the box: out by the nearer side.
        const ox = hx - Math.abs(localPoint.x);
        const oz = hz - Math.abs(localPoint.z);
        if (ox < oz) {
          dx = Math.sign(localPoint.x || 1) * (ox + radius);
          dz = 0;
        } else {
          dx = 0;
          dz = Math.sign(localPoint.z || 1) * (oz + radius);
        }
      }
      localPoint.set(dx, 0, dz).applyQuaternion(g.quaternion);
      push.add(localPoint);
      hit = true;
    }
    // Along the ground: the part of the push that would lift a body is not a wall's.
    if (hit) push.projectOnPlane(up.copy(point).normalize());
    return hit;
  }

  function freeSpotNear(point: THREE.Vector3, radius: number, out: THREE.Vector3): boolean {
    free.copy(point);
    let moved = false;
    // A push takes a body out of one box; a second box beside it takes another.
    for (let round = 0; round < 4; round++) {
      if (!collide(free, radius, freePush)) break;
      // Squeezed between two that push it equally both ways, the pushes
      // cancel and it was handed back inside both: out sideways instead,
      // along the ground, a body's width a round.
      if (freePush.lengthSq() < 1e-12) freePush.set(0, 1, 0).projectOnPlane(free).setLength(radius * 2);
      if (freePush.lengthSq() < 1e-12) freePush.set(1, 0, 0).projectOnPlane(free).setLength(radius * 2);
      // A hair past the side, or rounding leaves it touching and asked again.
      free.add(freePush.setLength(freePush.length() + 0.01)).setLength(point.length());
      moved = true;
    }
    if (moved) out.copy(free);
    return moved;
  }

  function eachStanding(visit: (at: THREE.Vector3, radius: number, player: boolean) => void): void {
    for (const entry of drawn.values()) {
      const [hx, hz] = wallOf(entry.model);
      visit(entry.group.position, (hx + hz) / 2, false);
    }
  }

  function movedNear(direction: THREE.Vector3, radius: number): boolean {
    localPoint.copy(direction).normalize();
    for (const [id, entry] of link.moved) {
      const pose = entry.pose;
      if (!isPose(pose)) continue;
      const model = models.get(modelOfVehicle(id));
      if (model === undefined) continue;
      const [hx, hz] = wallOf(model);
      const reach = radius + Math.max(hx, hz);
      const length = Math.hypot(pose[0]!, pose[1]!, pose[2]!);
      const dot = (localPoint.x * pose[0]! + localPoint.y * pose[1]! + localPoint.z * pose[2]!) / length;
      if (Math.acos(Math.min(1, dot)) * PLANET_RADIUS < reach) return true;
    }
    return false;
  }
  return { collide, freeSpotNear, eachStanding, movedNear };
}
