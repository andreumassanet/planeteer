/**
 * What stands in a road vehicle's lane: the nearest of the outside bodies,
 * the other traffic and the townsfolk, measured along a corridor as wide as
 * the two bodies.
 */
import * as THREE from 'three';
import { AVATAR_HEIGHT, FIGURE } from '../avatar.ts';
import type { LifeShared } from './api.ts';
import { BLOCK_PERSON, BLOCK_PLAYER, BLOCK_TRAFFIC, BLOCK_VEHICLE } from './mover.ts';
import type { Mover, Way } from './mover.ts';
import { FOLLOW_GAP, LANE_MARGIN, WAY_OBSTACLES, YIELD_REACH } from './tuning.ts';

/** How far from the viewer a body can matter to a vehicle inside `YIELD_REACH`. */
const WAY_GATHER = YIELD_REACH + 150;
/** A walker's radius, as `collide` gives one. */
export const WALKER_RADIUS = FIGURE.shoulderHalf;
/** How far past its bumper a vehicle in a town asks after the townsfolk. */
const PEOPLE_PROBES = [1.5, 4, 7, 11, 16] as const;

/** The nearest thing a search found: the gap to it along the lane, what it is (`BLOCK_*`, -1 nothing), how big, and where. */
export interface Find {
  gap: number;
  kind: number;
  radius: number;
  at: THREE.Vector3;
}

export interface LaneSearch {
  /** Written by `ahead`; a caller may save and restore it around a tentative search. */
  find: Find;
  /** The road vehicles looking ahead this frame, which every search checks against. */
  cars: Mover[];
  /** Forgets the outside bodies; new ones near `viewer` may be added. */
  clearBodies(viewer: THREE.Vector3): void;
  addBody(at: THREE.Vector3, radius: number, kind: number): void;
  /** `addBody` for `InTheWay.each`: the same function every frame. */
  addOutside(at: THREE.Vector3, radius: number, player: boolean): void;
  /**
   * The nearest thing in a vehicle's lane from `from`, as far as `reach`.
   * `alongside` 0 is the lane ahead as it drives; above 0 it is a lane it
   * would pull into, where anything counts, from that far behind.
   */
  ahead(mover: Mover, way: Way, from: THREE.Vector3, reach: number, alongside: number): void;
}

export function createLaneSearch(shared: LifeShared): LaneSearch {
  const find: Find = { gap: Infinity, kind: -1, radius: 0, at: new THREE.Vector3() };
  const wayCars: Mover[] = [];
  /** Outside bodies: x, y, z, radius each, and what each is. */
  const obstacle = new Float64Array(WAY_OBSTACLES * 4);
  const obstacleKind = new Uint8Array(WAY_OBSTACLES);
  let obstacles = 0;
  const wayViewer = new THREE.Vector3();
  const wayUp = new THREE.Vector3();
  const wayLeft = new THREE.Vector3();
  const wayOtherLeft = new THREE.Vector3();
  const wayProbe = new THREE.Vector3();
  const wayFrom = new THREE.Vector3();
  const aheadBefore = new THREE.Vector3();

  function addBody(at: THREE.Vector3, radius: number, kind: number): void {
    if (obstacles >= WAY_OBSTACLES || at.distanceToSquared(wayViewer) > WAY_GATHER * WAY_GATHER) return;
    const i = obstacles++;
    obstacle[i * 4] = at.x;
    obstacle[i * 4 + 1] = at.y;
    obstacle[i * 4 + 2] = at.z;
    obstacle[i * 4 + 3] = radius;
    obstacleKind[i] = kind;
  }
  /** Made once, so `InTheWay.each` is handed the same function every frame. */
  const addOutside = (at: THREE.Vector3, radius: number, player: boolean): void =>
    addBody(at, radius, player ? BLOCK_PLAYER : BLOCK_VEHICLE);

  /** The find before a tentative `block`, so it can be undone. */
  let gapBefore = Infinity;
  let kindBefore = -1;
  let radiusBefore = 0;
  function saveAhead(): void {
    gapBefore = find.gap;
    kindBefore = find.kind;
    radiusBefore = find.radius;
    aheadBefore.copy(find.at);
  }
  function restoreAhead(): void {
    find.gap = gapBefore;
    find.kind = kindBefore;
    find.radius = radiusBefore;
    find.at.copy(aheadBefore);
  }

  /**
   * Whether a body `ra` long along the lane and `rc` across it, `(dx, dy, dz)`
   * from `wayFrom`, is in the corridor `wayUp`, `facing` and `wayLeft` span
   * (ahead of the centre, or with `alongside`, from that far behind) and
   * nearer than anything found so far; if so it becomes the find.
   */
  function block(
    way: Way, dx: number, dy: number, dz: number, ra: number, rc: number,
    kind: number, reach: number, alongside: number,
  ): boolean {
    const h = dx * wayUp.x + dy * wayUp.y + dz * wayUp.z;
    if (h > AVATAR_HEIGHT * 2 || h < -AVATAR_HEIGHT * 2) return false;
    const f = way.facing;
    const along = dx * f.x + dy * f.y + dz * f.z;
    if (alongside > 0 ? along + ra < -alongside : along <= 0) return false;
    if (along - ra > reach) return false;
    const across = Math.abs(dx * wayLeft.x + dy * wayLeft.y + dz * wayLeft.z);
    if (across >= way.halfWidth + rc + LANE_MARGIN) return false;
    const gap = along - way.halfLength - ra;
    if (gap >= find.gap) return false;
    find.gap = gap;
    find.kind = kind;
    find.radius = Math.max(ra, rc);
    find.at.set(wayFrom.x + dx, wayFrom.y + dy, wayFrom.z + dz);
    return true;
  }

  /**
   * The other traffic in the corridor. In the lane ahead (`alongside` 0) an
   * oncoming vehicle in its own lane is ignored, and of two that block each
   * other one goes: the one pulled out to pass, else the higher rank.
   */
  function aheadTraffic(mover: Mover, way: Way, from: THREE.Vector3, reach: number, alongside: number): void {
    const f = way.facing;
    for (const other of wayCars) {
      if (other === mover) continue;
      const o = other.way!;
      const fo = o.facing;
      wayOtherLeft.crossVectors(wayUp, fo);
      // Its box, measured along this lane and across it.
      const ra = Math.abs(f.dot(fo)) * o.halfLength + Math.abs(f.dot(wayOtherLeft)) * o.halfWidth;
      const rc = Math.abs(wayLeft.dot(fo)) * o.halfLength + Math.abs(wayLeft.dot(wayOtherLeft)) * o.halfWidth;
      const dx = other.at.x - from.x;
      const dy = other.at.y - from.y;
      const dz = other.at.z - from.z;
      // Oncoming keeps its lane and passes, unless either is pulled out.
      if (alongside === 0 && f.dot(fo) < -0.5 && way.shift === 0 && o.shift === 0) continue;
      if (alongside > 0) {
        block(way, dx, dy, dz, ra, rc, BLOCK_TRAFFIC, reach, alongside);
        continue;
      }
      saveAhead();
      if (!block(way, dx, dy, dz, ra, rc, BLOCK_TRAFFIC, reach, 0)) continue;
      // Already through each other (two drives sharing a corner): drive out.
      if (find.gap < 0) {
        restoreAhead();
        continue;
      }
      const back = -(dx * fo.x + dy * fo.y + dz * fo.z);
      const backAcross = Math.abs(dx * wayOtherLeft.x + dy * wayOtherLeft.y + dz * wayOtherLeft.z);
      const mine = Math.abs(fo.dot(f)) * way.halfWidth + Math.abs(wayOtherLeft.dot(f)) * way.halfLength;
      const mutual = back > 0 && backAcross < o.halfWidth + mine + LANE_MARGIN;
      const first = (way.shiftTo !== 0) !== (o.shiftTo !== 0) ? way.shiftTo !== 0 : way.rank > o.rank;
      // Nose to nose and close, neither goes: whoever pulled out goes back in.
      const facing = f.dot(fo) < -0.5 && find.gap < FOLLOW_GAP + 4;
      if (mutual && first && !facing) restoreAhead();
    }
  }

  /**
   * The nearest thing in a vehicle's lane from `from`, as far as `reach`.
   * `alongside` 0 is the lane ahead as it drives; above 0 it is a lane it
   * would pull into, where anything counts, from that far behind.
   */
  function ahead(mover: Mover, way: Way, from: THREE.Vector3, reach: number, alongside: number): void {
    find.gap = Infinity;
    find.kind = -1;
    wayFrom.copy(from);
    wayUp.copy(from).normalize();
    wayLeft.crossVectors(wayUp, way.facing).normalize();
    for (let i = 0; i < obstacles; i++) {
      const r = obstacle[i * 4 + 3]!;
      block(
        way, obstacle[i * 4]! - from.x, obstacle[i * 4 + 1]! - from.y, obstacle[i * 4 + 2]! - from.z,
        r, r, obstacleKind[i]!, reach, alongside,
      );
    }
    if (!way.ghost || alongside > 0) aheadTraffic(mover, way, from, reach, alongside);
    // The townsfolk on a town's streets: asked at a few points past the bumper.
    const people = shared.inTheWay?.people;
    if (alongside === 0 && people !== undefined && (way.part === 1 || way.part === 2)) {
      for (const probe of PEOPLE_PROBES) {
        const gap = probe - WALKER_RADIUS;
        if (gap >= find.gap || probe > reach) break;
        wayProbe.copy(from).addScaledVector(way.facing, way.halfLength + probe);
        if (!people(wayProbe, way.halfWidth)) continue;
        find.gap = gap;
        find.kind = BLOCK_PERSON;
        find.radius = WALKER_RADIUS;
        find.at.copy(wayProbe);
        break;
      }
    }
  }

  return {
    find,
    cars: wayCars,
    clearBodies(viewer) {
      obstacles = 0;
      wayViewer.copy(viewer);
    },
    addBody,
    addOutside,
    ahead,
  };
}
